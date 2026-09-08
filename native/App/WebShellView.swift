import SwiftUI
import UIKit
import WebKit

/// The shell. The web app draws its own header and honours `env(safe-area-inset-*)`
/// through `viewport-fit=cover`, exactly as the installed PWA does, so the web
/// view runs edge to edge and the notch is the page's business.
struct WebShellView: View {
    @State private var reloadID = UUID()
    @State private var statusID = UUID()
    let bridge: NativeBridge
    var onWebViewReady: (WKWebView) -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color(RWColor.bg).ignoresSafeArea()
            AppWebView(reloadID: reloadID, bridge: bridge, onReady: onWebViewReady)
                .ignoresSafeArea()

            Menu {
                Button("تحديث") { reloadID = UUID() }
                Section("الحالة") {
                    Text("الصفحة: \(StatusLog.pageStatus())")
                    Text("خطأ الصفحة: \(StatusLog.jsErrorStatus())")
                    Text("الجلسة: \(StatusLog.activityStatus())")
                    Text("الملخّص: \(StatusLog.summaryStatus())")
                    Text("الوسيط: \(StatusLog.proxyStatus())")
                    Text("الودجت: \(StatusLog.widgetStatus())")
                    Text("النادي: \(StatusLog.gymStatus())")
                }
                Button("حدّث الحالة") { statusID = UUID() }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white.opacity(0.62))
                    .frame(width: 34, height: 34)
                    .background(.black.opacity(0.22))
                    .clipShape(Circle())
            }
            .padding(.top, 6)
            .padding(.leading, 8)
            .id(statusID)
        }
    }
}

struct AppWebView: UIViewRepresentable {
    let reloadID: UUID
    let bridge: NativeBridge
    var onReady: (WKWebView) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // The default store, not a non-persistent one: localStorage under the
        // `raed://app` origin is Raed's entire local training state and has to
        // survive a relaunch.
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.setURLSchemeHandler(context.coordinator.schemeHandler, forURLScheme: RW.webScheme)
        configuration.userContentController.add(bridge, name: NativeBridge.name)
        configuration.userContentController.addUserScript(
            WKUserScript(source: Self.bodyShim, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.customUserAgent = "RaedworkoutsGo-iOS/1.0"
        context.coordinator.webView = webView
        context.coordinator.reloadID = reloadID
        onReady(webView)
        webView.load(URLRequest(url: Self.homeURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.reloadID != reloadID else { return }
        context.coordinator.reloadID = reloadID
        webView.load(URLRequest(url: Self.homeURL))
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: NativeBridge.name)
    }

    static let homeURL = URL(string: "\(RW.webScheme)://\(RW.webHost)/index.html")!

    /// WebKit hands a `WKURLSchemeHandler` the method and the headers of a
    /// request, but not its body — so a POST to the coach proxy would arrive
    /// empty. Headers do survive, so the body rides in one, percent-encoded
    /// (the questions are Arabic; a header must be ASCII). The real body is
    /// left in place as well, and the shell prefers it when WebKit delivers it.
    static let bodyShim = """
    (function () {
      // A page that fails to boot is otherwise a silent cream rectangle: one
      // bad module import and nothing renders, with nothing anywhere to say so.
      // These two lines are the only reason the shell can be diagnosed at all
      // without a Mac attached.
      var report = function (what) {
        try { window.webkit.messageHandlers.native.postMessage({ type: 'js_error', message: String(what).slice(0, 200) }); } catch (e) {}
      };
      window.addEventListener('error', function (e) {
        // Capture phase catches subresource failures too — offline, every
        // YouTube thumbnail on the library screen fires one, each a bridge
        // round-trip and an App Group write, and each overwriting the real
        // page state with «error @ :0». A script error's target is window.
        if (e.target && e.target !== window) return;
        report((e.message || 'error') + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0));
      }, true);
      window.addEventListener('unhandledrejection', function (e) {
        report('unhandled: ' + ((e.reason && (e.reason.message || e.reason)) || 'rejection'));
      });

      var orig = window.fetch;
      if (typeof orig !== 'function') return;
      window.fetch = function (input, init) {
        try {
          if (typeof input === 'string' && init && typeof init.body === 'string') {
            var target = new URL(input, location.href);
            if (target.protocol === location.protocol && target.host === location.host &&
                target.pathname.indexOf('/api/') === 0) {
              var next = Object.assign({}, init);
              next.headers = Object.assign({}, init.headers || {});
              next.headers['X-RW-Body'] = encodeURIComponent(init.body);
              return orig.call(this, input, next);
            }
          }
        } catch (e) { /* any surprise falls through to the untouched fetch */ }
        return orig.call(this, input, init);
      };
    })();
    """

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
        weak var webView: WKWebView?
        var reloadID: UUID?
        let schemeHandler = AppSchemeHandler()

        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            // «صدّر بياناتي» is an `<a download>` on a blob: URL. Allowed as a
            // navigation it *renders* — the backup JSON replaces the app and
            // there is no way back. It is a download, and iOS has to be told so.
            if navigationAction.shouldPerformDownload {
                decisionHandler(.download)
                return
            }
            // The app itself, and the two schemes its own export/download path
            // uses, stay inside. Everything else — YouTube, Spotify, the gym
            // app, a coach citation — is the system's to open.
            let internalSchemes: Set<String> = [RW.webScheme, "blob", "data", "about"]
            if let scheme = url.scheme?.lowercased(), internalSchemes.contains(scheme) {
                decisionHandler(.allow)
                return
            }
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
        }

        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            // `target="_blank"` never gets a second web view; it opens outside.
            if let url = navigationAction.request.url, navigationAction.targetFrame == nil {
                UIApplication.shared.open(url)
            }
            return nil
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
            download.delegate = self
        }

        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
            download.delegate = self
        }

        // MARK: WKDownloadDelegate — the export lands in a share sheet

        func download(_ download: WKDownload,
                      decideDestinationUsing response: URLResponse,
                      suggestedFilename: String,
                      completionHandler: @escaping @MainActor @Sendable (URL?) -> Void) {
            let name = suggestedFilename.isEmpty ? "raedworkouts-export.json" : suggestedFilename
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
                .appendingPathComponent(name)
            do {
                try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(),
                                                        withIntermediateDirectories: true)
                completionHandler(destination)
            } catch {
                StatusLog.page("download_failed:\(StatusLog.describe(error))")
                completionHandler(nil)
            }
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let file = download.progress.fileURL else { return }
            StatusLog.page("download ok \(file.lastPathComponent)")
            share(file)
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            StatusLog.page("download_failed:\(StatusLog.describe(error))")
        }

        private func share(_ file: URL) {
            guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                  let root = scene.keyWindow?.rootViewController else { return }
            let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = root.view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: root.view.bounds.midX,
                                                                     y: root.view.bounds.maxY - 1,
                                                                     width: 1, height: 1)
            root.present(sheet, animated: true)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            StatusLog.page("loaded \(webView.url?.path ?? "?")")
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            StatusLog.page("load_failed:\(StatusLog.describe(error))")
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            StatusLog.page("provisional_failed:\(StatusLog.describe(error))")
        }
    }
}
