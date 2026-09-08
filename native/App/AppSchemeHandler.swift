import Foundation
import WebKit

/// Serves the bundled web app under `raed://app/…` and proxies `raed://app/api/…`
/// to the Vercel function that holds the coach key.
///
/// Why a custom scheme rather than `loadFileURL`: a `file://` page gets an opaque
/// origin, so `localStorage` — which is the whole of Raed's local training data —
/// would be thrown away on every launch. `raed://app` is a real tuple origin, so
/// the store persists, and it is bundled, so the gym's dead signal cannot stop
/// the app from opening.
@MainActor
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    /// Tasks WebKit has told us to stop. Messaging one after `stop` is a crash,
    /// and the proxy answers asynchronously, so this is not optional.
    private var stopped = Set<ObjectIdentifier>()

    override init() {
        root = Bundle.main.resourceURL?.appendingPathComponent("www", isDirectory: true)
            ?? Bundle.main.bundleURL.appendingPathComponent("www", isDirectory: true)
        super.init()
    }

    // MARK: WKURLSchemeHandler

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        stopped.remove(ObjectIdentifier(urlSchemeTask))
        guard let url = urlSchemeTask.request.url else {
            finish(urlSchemeTask, status: 400, mime: "text/plain", body: Data("bad request".utf8))
            return
        }
        if url.path.hasPrefix("/api/") {
            proxy(urlSchemeTask, url: url)
        } else {
            serveFile(urlSchemeTask, url: url)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        stopped.insert(ObjectIdentifier(urlSchemeTask))
    }

    // MARK: Bundled files

    private func serveFile(_ task: WKURLSchemeTask, url: URL) {
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        guard let file = resolve(path) else {
            finish(task, status: 404, mime: "text/plain", body: Data("not found".utf8))
            return
        }
        guard let data = try? Data(contentsOf: file) else {
            finish(task, status: 404, mime: "text/plain", body: Data("not found".utf8))
            return
        }
        finish(task, status: 200, mime: Self.mime(for: file.pathExtension), body: data)
    }

    /// Resolves a request path inside `www/` and refuses to leave it. A page can
    /// ask for any path it likes; `..` must not walk out of the bundle.
    private func resolve(_ path: String) -> URL? {
        let decoded = path.removingPercentEncoding ?? path
        // Every request path is absolute ("/core/native.js"), and
        // `URL(fileURLWithPath:relativeTo:)` throws the base away when the path
        // starts with a slash — which quietly 404s the entire web app.
        let relative = decoded.hasPrefix("/") ? String(decoded.dropFirst()) : decoded
        guard !relative.isEmpty else { return nil }
        let candidate = root.appendingPathComponent(relative).standardizedFileURL
        let base = root.standardizedFileURL.path
        guard candidate.path == base || candidate.path.hasPrefix(base + "/") else { return nil }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: candidate.path, isDirectory: &isDirectory) else { return nil }
        return isDirectory.boolValue ? nil : candidate
    }

    private static func mime(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "webmanifest": return "application/manifest+json; charset=utf-8"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "ttf": return "font/ttf"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "webp": return "image/webp"
        case "ico": return "image/x-icon"
        case "map": return "application/json; charset=utf-8"
        case "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }

    // MARK: The coach proxy

    /// `raed://app/api/<path>?<query>` → `https://raedworkouts-v16.vercel.app/api/<path>?<query>`.
    ///
    /// The status, `Content-Type` and body come back verbatim; the app already
    /// knows how to read its own errors and must keep being able to.
    private func proxy(_ task: WKURLSchemeTask, url: URL) {
        var components = URLComponents()
        components.scheme = "https"
        components.host = URL(string: RW.apiOrigin)?.host
        components.path = url.path
        components.percentEncodedQuery = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedQuery
        guard let upstream = components.url else {
            finish(task, status: 502, mime: "application/json", body: Data(#"{"status":"error","error":"bad_proxy_url"}"#.utf8))
            return
        }

        let source = task.request
        var request = URLRequest(url: upstream)
        request.httpMethod = source.httpMethod ?? "GET"
        request.timeoutInterval = 30
        var carriedInHeader = 0
        for (name, value) in source.allHTTPHeaderFields ?? [:] {
            let lower = name.lowercased()
            // Hop-by-hop and origin-scoped headers must not be replayed at the
            // upstream: `Origin: raed://app` is meaningless to Vercel, and the
            // body shim's header is ours, not the server's.
            if ["host", "origin", "referer", "content-length", "connection", "x-rw-body"].contains(lower) { continue }
            request.setValue(value, forHTTPHeaderField: name)
        }
        // WebKit does not hand a `WKURLSchemeHandler` the request body, so the
        // document-start shim also carries it, percent-encoded, in a header.
        // Whichever arrives is used; the real body wins when WebKit provides it.
        if let body = source.httpBody, !body.isEmpty {
            request.httpBody = body
        } else if let encoded = source.value(forHTTPHeaderField: "X-RW-Body"),
                  let decoded = encoded.removingPercentEncoding, !decoded.isEmpty {
            request.httpBody = Data(decoded.utf8)
            carriedInHeader = decoded.utf8.count
        }
        if request.httpBody != nil, request.value(forHTTPHeaderField: "Content-Type") == nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let method = request.httpMethod ?? "GET"
        let route = url.path + (url.query.map { "?\($0)" } ?? "")
        let bodyBytes = request.httpBody?.count ?? 0
        let started = Date()

        Task { [weak self] in
            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                let http = response as? HTTPURLResponse
                let status = http?.statusCode ?? 502
                let mime = http?.value(forHTTPHeaderField: "Content-Type") ?? "application/json"
                StatusLog.proxy("\(method) \(route) body=\(bodyBytes)\(carriedInHeader > 0 ? "h" : "") → \(status) in \(Int(Date().timeIntervalSince(started) * 1000))ms")
                self?.finish(task, status: status, mime: mime, body: data)
            } catch {
                StatusLog.proxy("\(method) \(route) failed:\(StatusLog.describe(error))")
                self?.finish(task, status: 502, mime: "application/json",
                             body: Data(#"{"status":"error","error":"proxy_failed"}"#.utf8))
            }
        }
    }

    // MARK: Replying

    private func finish(_ task: WKURLSchemeTask, status: Int, mime: String, body: Data) {
        guard !stopped.contains(ObjectIdentifier(task)) else { return }
        let headers = [
            "Content-Type": mime,
            "Content-Length": String(body.count),
            // The bundle is the cache. A stale copy here would survive a rebuild
            // and quietly serve last week's app.
            "Cache-Control": "no-store",
        ]
        guard let url = task.request.url,
              let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers) else {
            task.didFailWithError(URLError(.badServerResponse))
            return
        }
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
        stopped.remove(ObjectIdentifier(task))
    }
}
