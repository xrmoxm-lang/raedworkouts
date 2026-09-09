import Foundation
import UIKit

/// Finding the gym app, rather than guessing at it.
///
/// `scope.bit` is IN2 Fitness's BUNDLE ID, and a bundle id is not a URL scheme —
/// an app answers only what it declares in `CFBundleURLTypes`. Opening it
/// returned false on Raed's phone (status readout: `fallback_opened`), which is
/// how he ended up at the App Store instead of the app.
///
/// So the app asks iOS instead. Every candidate below is declared in
/// `LSApplicationQueriesSchemes` — `canOpenURL` answers false for anything that
/// is not, so the list and the plist must stay in step. The winner is cached in
/// the App Group: discovery is cheap, but the answer should not depend on it.
enum GymLauncher {
    /// The configured scheme is tried first; the rest are the plausible spellings
    /// for this vendor (bundle `scope.bit`, brand IN2 / b-it-fitness, Scope
    /// Software Solutions). Everything here is also in the Info.plist list.
    static let candidates = [
        "scope.bit", "scopebit", "scope", "bit", "bitfitness", "bitfit", "b-it",
        "in2", "in2fitness", "in2fit", "in2app", "in2gym", "in2-fitness",
        "bitscope", "scopefitness", "scopeapp", "bitapp", "in2sa", "in2ksa",
    ]

    /// What iOS says about every candidate. Written to the status readout so a
    /// wrong guess is diagnosable from the Mac instead of from his description.
    @MainActor
    static func probe() -> [String: Bool] {
        var found: [String: Bool] = [:]
        for scheme in candidates {
            guard let url = URL(string: "\(scheme)://") else { continue }
            found[scheme] = UIApplication.shared.canOpenURL(url)
        }
        return found
    }

    /// The first candidate iOS reports as installed, preferring the configured
    /// one. `nil` means the app declares no scheme we know — the App Store page
    /// is then the honest destination, not a scheme that silently does nothing.
    @MainActor
    static func installedScheme(preferring configured: String?) -> String? {
        var ordered = candidates
        if let configured, !configured.isEmpty {
            let name = configured.replacingOccurrences(of: "://", with: "")
            ordered.removeAll { $0 == name }
            ordered.insert(name, at: 0)
        }
        for scheme in ordered {
            guard let url = URL(string: "\(scheme)://") else { continue }
            if UIApplication.shared.canOpenURL(url) { return scheme }
        }
        return nil
    }

    /// Run once per launch, so the answer is on record before he ever presses
    /// the button — and so a vendor update that adds a scheme is picked up.
    @MainActor
    static func refreshCache() {
        let results = probe()
        let hits = results.filter { $0.value }.keys.sorted()
        AppGroupStore.setString(hits.first ?? "", RW.gymSchemeKey)
        StatusLog.gym(hits.isEmpty
            ? "probe: none of \(results.count) schemes installed"
            : "probe: \(hits.joined(separator: ","))")
    }

    @MainActor
    static func cachedScheme() -> String? {
        guard let value = AppGroupStore.string(RW.gymSchemeKey), !value.isEmpty else { return nil }
        return value
    }
}
