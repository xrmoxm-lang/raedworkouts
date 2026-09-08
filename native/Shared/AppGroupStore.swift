import Foundation

/// Everything the app and the widget extension both need to name.
enum RW {
    static let appGroup = "group.com.raedmohammed.raedworkouts"
    static let urlScheme = "raedworkouts"
    static let webScheme = "raed"
    static let webHost = "app"
    /// The key-holding proxy the coach reaches. The key itself never leaves it.
    static let apiOrigin = "https://raedworkouts-v16.vercel.app"

    static let summaryKey = "rw.summary"
    // Two keys, not one: a `summary` lands after every render and would
    // otherwise overwrite the `rest_start` line within half a second — losing
    // exactly the line worth reading.
    static let restStatusKey = "rw.status.rest"
    static let summaryStatusKey = "rw.status.summary"
    static let widgetStatusKey = "rw.status.widget"
    static let proxyStatusKey = "rw.status.proxy"
    static let pageStatusKey = "rw.status.page"

    static func deepLink(_ path: String = "open") -> URL {
        URL(string: "\(urlScheme)://\(path)") ?? URL(string: "\(urlScheme)://open")!
    }
}

/// The one shared container. `UserDefaults(suiteName:)` returns nil only when the
/// App Group entitlement is missing, which is exactly the failure the status
/// readout has to be able to say out loud — so it is never silently swallowed.
///
/// An enum rather than a shared instance: `UserDefaults` is thread-safe but not
/// `Sendable`, and holding one in a global would need an unchecked escape hatch
/// to say something Foundation already guarantees.
enum AppGroupStore {
    /// `UserDefaults` is documented thread-safe; the compiler only lacks the
    /// annotation to know it.
    nonisolated(unsafe) private static let defaults = UserDefaults(suiteName: RW.appGroup)

    static var isAvailable: Bool { defaults != nil }

    static func string(_ key: String) -> String? { defaults?.string(forKey: key) }
    static func setString(_ value: String, _ key: String) { defaults?.set(value, forKey: key) }
    static func data(_ key: String) -> Data? { defaults?.data(forKey: key) }
    static func setData(_ value: Data, _ key: String) { defaults?.set(value, forKey: key) }
}

/// The playbook's rule: we are blind on-device without this. Every bridge
/// message, every proxy round trip and every widget timeline fetch writes one
/// short line here, and the `⋯` menu reads them back.
enum StatusLog {
    static func rest(_ value: String) { write(value, RW.restStatusKey) }
    static func summary(_ value: String) { write(value, RW.summaryStatusKey) }
    static func widget(_ value: String) { write(value, RW.widgetStatusKey) }
    static func proxy(_ value: String) { write(value, RW.proxyStatusKey) }
    static func page(_ value: String) { write(value, RW.pageStatusKey) }

    static func restStatus() -> String { read(RW.restStatusKey) }
    static func summaryStatus() -> String { read(RW.summaryStatusKey) }
    static func widgetStatus() -> String { read(RW.widgetStatusKey) }
    static func proxyStatus() -> String { read(RW.proxyStatusKey) }
    static func pageStatus() -> String { read(RW.pageStatusKey) }

    static func describe(_ error: Error) -> String {
        let ns = error as NSError
        return "\(ns.domain.replacingOccurrences(of: "Error", with: "")):\(ns.code)"
    }

    private static func write(_ value: String, _ key: String) {
        AppGroupStore.setString("\(stamp()) \(value)", key)
    }

    private static func read(_ key: String) -> String {
        guard AppGroupStore.isAvailable else { return "no app group" }
        return AppGroupStore.string(key) ?? "—"
    }

    private static func stamp() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm:ss"
        return f.string(from: Date())
    }
}
