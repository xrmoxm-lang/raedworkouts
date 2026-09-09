import ActivityKit
import Foundation
import UIKit
import WebKit
import WidgetKit

/// The native half of `core/native.js`.
///
/// Contract (the web app posts `{ type, ...payload }` to `webkit.messageHandlers.native`):
///   `activity { active, started_at, session, exercise, set_label, exercise_label,
///               since_label, rest_ends_at, rest_started_at, done, total, skin }`
///                                                          → the session Live Activity
///   `summary { … }`                                        → the Home-Screen widget
///   `open_gym { scheme, fallback }`                        → UIApplication.open
///   `js_error { message }`                                 → the status readout
///
/// The activity message carries the WHOLE state every time and is idempotent, so
/// a message that never arrived — a backgrounded page, a dropped post — repairs
/// itself on the next render instead of leaving a stale Island.
///
/// Every branch writes one line to the shared status readout, because on-device
/// this is the only way to tell a bridge that never fired from one that failed.
@MainActor
final class NativeBridge: NSObject, WKScriptMessageHandler {
    static let name = "native"
    /// One sweep per launch is enough: an activity from the previous build can
    /// only exist before we have ended it.
    private var sweptLegacyActivities = false
    /// Reset by a relaunch on purpose — he may have added the shortcut since.
    private static var gymShortcutMissingThisLaunch = false

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let payload = message.body as? [String: Any],
              let type = payload["type"] as? String else {
            StatusLog.activity("bad_message")
            return
        }
        switch type {
        case "activity": applyActivity(payload)
        case "summary": saveSummary(payload)
        case "open_gym": openGym(payload)
        // Its own line, never StatusLog.page: `didFinish` fires after the
        // modules run, so a «loaded» line would overwrite the error that
        // explains the blank screen.
        case "js_error": StatusLog.jsError((payload["message"] as? String) ?? "?")
        // v17r2's three rest-only messages. A page this old can only be a stale
        // service-worker cache, and saying so is worth more than a silent drop.
        case "rest_start", "rest_cancel", "rest_end": StatusLog.activity("legacy:\(type)")
        default: StatusLog.activity("unknown:\(type)")
        }
    }

    // MARK: The session Live Activity

    /// `active == false` ⇒ end everything. `active == true` with nothing running
    /// ⇒ request one. Otherwise ⇒ update what is running. Three cases, no
    /// hidden state, so any missed message is corrected by the next one.
    private func applyActivity(_ payload: [String: Any]) {
        let active = (payload["active"] as? NSNumber)?.boolValue ?? false
        guard active else {
            endAll(reason: "session_over")
            return
        }
        guard let startedAt = Self.date(payload["started_at"]) else {
            StatusLog.activity("bad_started_at")
            return
        }
        let state = SessionAttributes.ContentState(
            startedAt: startedAt,
            exercise: Self.string(payload["exercise"]),
            setLabel: Self.string(payload["set_label"]),
            exerciseLabel: Self.string(payload["exercise_label"]),
            sinceLabel: Self.string(payload["since_label"]),
            restEndsAt: Self.date(payload["rest_ends_at"]),
            restStartedAt: Self.date(payload["rest_started_at"]),
            done: (payload["done"] as? NSNumber)?.intValue ?? 0,
            total: (payload["total"] as? NSNumber)?.intValue ?? 0,
            skin: Self.string(payload["skin"])
        )
        // Stale only while a rest is running: that is the moment the Island has
        // to redraw itself without another message, to say «انتهت الراحة». The
        // session itself never goes stale — it is still on.
        let staleDate = state.restEndsAt.flatMap { $0 > Date() ? $0 : nil }
        let content = ActivityContent(state: state, staleDate: staleDate)

        let live = SessionActivityBox.all()
        if live.isEmpty {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                StatusLog.activity("activity_failed:disabled_in_settings")
                return
            }
            let attributes = SessionAttributes(session: Self.string(payload["session"]))
            do {
                _ = try Activity.request(attributes: attributes, content: content, pushType: nil)
                StatusLog.activity("started \(Self.line(state))")
            } catch {
                StatusLog.activity("activity_failed:\(StatusLog.describe(error))")
            }
            return
        }
        // One session, one activity. A second is only ever a leak — end the rest.
        let current = live[0]
        let extras = Array(live.dropFirst())
        // `activity` rides the render debounce, and most renders change nothing
        // the Island shows. ActivityKit budgets how often an app may update a
        // live activity, and a session lasts an hour — so an unchanged state is
        // dropped here rather than spent. The elapsed and the countdown keep
        // ticking on their own; they are not what an update is for.
        let unchanged = current.activity.content.state == state
        guard !unchanged || !extras.isEmpty else { return }
        Task {
            if !unchanged { await current.activity.update(content) }
            await SessionActivityBox.endAll(extras)
            if !unchanged { StatusLog.activity("updated \(Self.line(state))") }
            if !extras.isEmpty { StatusLog.activity("duplicates_ended \(extras.count)") }
        }
    }

    private func endAll(reason: String) {
        // Everything live, not just the one this launch of the app started: a
        // relaunch mid-session inherits an activity it has no handle on.
        let live = SessionActivityBox.all()
        guard !live.isEmpty else { return }
        Task {
            await SessionActivityBox.endAll(live)
            StatusLog.activity("\(reason) ended \(live.count)")
        }
    }

    /// Called on `scenePhase == .active` and on `onOpenURL`. The name is the one
    /// `RootView` has always called; what it does changed with the contract — a
    /// finished rest no longer ends the activity, because the SESSION outlives
    /// the rest. It clears the finished rest off the running activity and sweeps
    /// any activity left behind by the previous build.
    func endFinishedRests() {
        sweepLegacyActivities()
        let finished = SessionActivityBox.all(restEndedBefore: Date())
        guard !finished.isEmpty else { return }
        Task {
            for box in finished {
                var state = box.activity.content.state
                state.restEndsAt = nil
                state.restStartedAt = nil
                await box.activity.update(ActivityContent(state: state, staleDate: nil))
            }
            StatusLog.activity("rest_cleared \(finished.count)")
        }
    }

    /// `ActivityKit` keys an activity by its attributes type name, so v17r2's
    /// `RestAttributes` activity is invisible to `Activity<SessionAttributes>`.
    /// Without this sweep, updating the app could leave a dead rest countdown in
    /// the Island with nothing able to reach it.
    private func sweepLegacyActivities() {
        guard !sweptLegacyActivities else { return }
        sweptLegacyActivities = true
        let legacy = LegacyRestActivityBox.all()
        guard !legacy.isEmpty else { return }
        Task {
            await LegacyRestActivityBox.endAll(legacy)
            StatusLog.activity("legacy_ended \(legacy.count)")
        }
    }

    // MARK: The gym launcher

    /// «زر الـIn2 Fitness … أبغاه على طول يفتح التطبيق مباشرة». In a browser this
    /// was a scheme, a 1.2s wait and a guess at whether the page was still
    /// visible. Here iOS answers directly, and the App Store fallback opens only
    /// when the app really is not installed — no `canOpenURL`, so no
    /// `LSApplicationQueriesSchemes` entitlement is needed.
    private func openGym(_ payload: [String: Any]) {
        let fallback = URL(string: Self.string(payload["fallback"]))
        let override = Self.string(payload["override"])

        // His own instruction wins, whole. A `shortcuts://` URL is the only way
        // to open an app that declares no scheme, so it must not be parsed as
        // one.
        if !override.isEmpty, let url = URL(string: override) {
            UIApplication.shared.open(url, options: [:]) { opened in
                StatusLog.gym(opened ? "opened override" : "override_failed")
                if !opened { Self.openFallback(fallback) }
            }
            return
        }

        // A bundle id is not a URL scheme: `scope.bit://` is IN2's bundle id,
        // iOS refused it, and he landed on the App Store page for an app already
        // on his phone. Ask iOS which scheme is really there.
        let configured = Self.string(payload["scheme"]).replacingOccurrences(of: "://", with: "")
        if let resolved = GymLauncher.installedScheme(preferring: configured),
           let url = URL(string: "\(resolved)://") {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    AppGroupStore.setString(resolved, RW.gymSchemeKey)
                    StatusLog.gym("opened \(resolved)")
                } else {
                    StatusLog.gym("refused \(resolved)")
                    Self.openFallback(fallback)
                }
            }
            return
        }

        // Nothing is installed under any name we know. Shortcuts can open any
        // app by name, and x-callback tells us when the shortcut is missing —
        // so a missing shortcut lands on the App Store rather than stranding him
        // in the Shortcuts app. Tried at most ONCE per launch: if it is not
        // there, bouncing him through Shortcuts on every press is worse than
        // the store, and a fresh launch retries in case he has added it since.
        if !Self.gymShortcutMissingThisLaunch, let shortcut = URL(string: RW.gymShortcutURL) {
            UIApplication.shared.open(shortcut, options: [:]) { opened in
                if opened {
                    StatusLog.gym("ran shortcut \(RW.gymShortcutName)")
                } else {
                    StatusLog.gym("no_scheme_no_shortcut")
                    Self.openFallback(fallback)
                }
            }
            return
        }
        StatusLog.gym("no_scheme_installed")
        Self.openFallback(fallback)
    }

    /// Shortcuts answered our x-error: the «IN2» shortcut does not exist on this
    /// phone. The store page is then the only honest destination.
    func gymShortcutMissing() {
        Self.gymShortcutMissingThisLaunch = true
        StatusLog.gym("shortcut_missing:\(RW.gymShortcutName)")
        Self.openFallback(URL(string: "https://apps.apple.com/sa/app/in2-fitness/id1536137282"))
    }

    private static func openFallback(_ fallback: URL?) {
        guard let fallback else {
            StatusLog.gym("no_fallback")
            return
        }
        UIApplication.shared.open(fallback, options: [:]) { opened in
            StatusLog.gym(opened ? "fallback_opened" : "fallback_failed")
        }
    }

    // MARK: Summary

    private func saveSummary(_ payload: [String: Any]) {
        var summary = payload
        summary.removeValue(forKey: "type")
        guard AppGroupStore.isAvailable else {
            StatusLog.summary("failed:no_app_group")
            return
        }
        guard JSONSerialization.isValidJSONObject(summary),
              let data = try? JSONSerialization.data(withJSONObject: summary) else {
            StatusLog.summary("failed:not_json")
            return
        }
        AppGroupStore.setData(data, RW.summaryKey)
        WidgetCenter.shared.reloadAllTimelines()
        let week = summary["week"] as? [String: Any]
        let done = (week?["done"] as? NSNumber)?.intValue ?? 0
        let target = (week?["target"] as? NSNumber)?.intValue ?? 0
        StatusLog.summary("ok \(done)/\(target)")
    }

    // MARK: Payload decoding

    private static func string(_ value: Any?) -> String { (value as? String) ?? "" }

    /// One readable line for the `⋯` menu. It carries the Arabic set label
    /// because «the Island says the wrong set» is otherwise undiagnosable
    /// without a Mac attached.
    private static func line(_ state: SessionState) -> String {
        let rest = state.restEndsAt.map { " rest \(max(0, Int($0.timeIntervalSinceNow)))s" } ?? ""
        let label = state.setLabel.isEmpty ? "" : " · \(state.setLabel)"
        return "\(state.done)/\(state.total) \(state.skin)\(label)\(rest)"
    }

    /// The page sends every instant as an ISO-8601 string with milliseconds
    /// (`toISOString()`). The second parser exists so a date without them — or
    /// one from some future caller — is read rather than silently dropped.
    nonisolated(unsafe) private static let isoWithMillis: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    nonisolated(unsafe) private static let isoPlain = ISO8601DateFormatter()

    private static func date(_ value: Any?) -> Date? {
        if let raw = value as? String, !raw.isEmpty {
            return isoWithMillis.date(from: raw) ?? isoPlain.date(from: raw)
        }
        if let ms = (value as? NSNumber)?.doubleValue, ms > 0 {
            return Date(timeIntervalSince1970: ms / 1000)
        }
        return nil
    }
}

/// ActivityKit's `Activity` is a class Apple has not annotated `Sendable`, while
/// `end(_:dismissalPolicy:)` and `update(_:)` are `nonisolated async` methods
/// meant to be called from anywhere — so touching one from the main actor reads
/// to Swift 6 as sending a non-`Sendable` value. This box states what the
/// framework already guarantees, in one place, instead of scattering the escape
/// hatch.
private struct SessionActivityBox: @unchecked Sendable {
    let activity: Activity<SessionAttributes>

    @MainActor
    static func all(restEndedBefore cutoff: Date? = nil) -> [SessionActivityBox] {
        Activity<SessionAttributes>.activities
            .filter { live in
                guard let cutoff else { return true }
                guard let restEndsAt = live.content.state.restEndsAt else { return false }
                return restEndsAt <= cutoff
            }
            .map(SessionActivityBox.init)
    }

    static func endAll(_ boxes: [SessionActivityBox]) async {
        for box in boxes {
            await box.activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}

/// The same escape hatch for v17r2's activity, which exists only to be ended.
private struct LegacyRestActivityBox: @unchecked Sendable {
    let activity: Activity<RestAttributes>

    @MainActor
    static func all() -> [LegacyRestActivityBox] {
        Activity<RestAttributes>.activities.map(LegacyRestActivityBox.init)
    }

    static func endAll(_ boxes: [LegacyRestActivityBox]) async {
        for box in boxes {
            await box.activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
