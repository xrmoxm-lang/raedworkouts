import SwiftUI
import WebKit
import WidgetKit

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var bridge = NativeBridge()
    @State private var webView: WKWebView?

    var body: some View {
        WebShellView(bridge: bridge) { webView = $0 }
            .environment(\.layoutDirection, .rightToLeft)
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                // The rest ran out while the phone was in his pocket: the app is
                // in front again, so the Island stops counting a rest that is over.
                bridge.endFinishedRests()
                WidgetCenter.shared.reloadAllTimelines()
            }
            .onOpenURL { _ in
                // `raedworkouts://…` from the Live Activity or the widget: the
                // app coming forward is the whole point, and it already has.
                bridge.endFinishedRests()
            }
    }
}
