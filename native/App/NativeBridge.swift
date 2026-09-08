import ActivityKit
import Foundation
import WebKit
import WidgetKit

/// The native half of `core/native.js`.
///
/// Contract (the web app posts `{ type, ...payload }` to `webkit.messageHandlers.native`):
///   `rest_start { end_ms, total_ms, session, exercise, set_label }` → Live Activity
///   `rest_cancel` / `rest_end`                                       → ends it
///   `summary { … }`                                                  → the widget
///
/// Every branch writes one line to the shared status readout, because on-device
/// this is the only way to tell a bridge that never fired from one that failed.
@MainActor
final class NativeBridge: NSObject, WKScriptMessageHandler {
    static let name = "native"
    private var activity: Activity<RestAttributes>?

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let payload = message.body as? [String: Any],
              let type = payload["type"] as? String else {
            StatusLog.rest("bad_message")
            return
        }
        switch type {
        case "rest_start": startRest(payload)
        case "rest_cancel", "rest_end": endRest(reason: type)
        case "summary": saveSummary(payload)
        case "js_error": StatusLog.page("js_error: \((payload["message"] as? String) ?? "?")")
        default: StatusLog.rest("unknown:\(type)")
        }
    }

    // MARK: Rest

    private func startRest(_ payload: [String: Any]) {
        guard let endMS = (payload["end_ms"] as? NSNumber)?.doubleValue else {
            StatusLog.rest("rest_start bad_end_ms")
            return
        }
        let endsAt = Date(timeIntervalSince1970: endMS / 1000)
        guard endsAt.timeIntervalSinceNow > 0.5 else {
            StatusLog.rest("rest_start already_over")
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            StatusLog.rest("activity_failed:disabled_in_settings")
            return
        }

        let totalMS = (payload["total_ms"] as? NSNumber)?.doubleValue ?? 0
        let startedAt = totalMS > 0 ? endsAt.addingTimeInterval(-totalMS / 1000) : Date()
        let attributes = RestAttributes(
            session: (payload["session"] as? String) ?? "",
            exercise: (payload["exercise"] as? String) ?? "",
            startedAt: startedAt
        )
        let state = RestAttributes.ContentState(
            endsAt: endsAt,
            setLabel: (payload["set_label"] as? String) ?? ""
        )

        // One rest at a time. A second `rest_start` — he shortened the rest, or
        // moved to the next exercise — replaces the activity rather than
        // stacking a second countdown in the Island.
        let previous = RestActivityBox.all()
        activity = nil
        Task {
            await RestActivityBox.endAll(previous)
            do {
                let content = ActivityContent(state: state, staleDate: endsAt)
                self.activity = try Activity.request(attributes: attributes, content: content, pushType: nil)
                StatusLog.rest("rest_start ok \(Int(endsAt.timeIntervalSinceNow))s")
            } catch {
                StatusLog.rest("activity_failed:\(StatusLog.describe(error))")
            }
        }
    }

    private func endRest(reason: String) {
        // Everything live, not just the one this launch of the app started: a
        // relaunch mid-rest inherits an activity it has no handle on.
        let live = RestActivityBox.all()
        activity = nil
        Task {
            await RestActivityBox.endAll(live)
            StatusLog.rest("\(reason) ok")
        }
    }

    /// The rest is over and the app is in front: the Island should not still be
    /// counting. Called on `scenePhase == .active`.
    func endFinishedRests() {
        let finished = RestActivityBox.all(endedBefore: Date())
        guard !finished.isEmpty else { return }
        activity = nil
        Task {
            await RestActivityBox.endAll(finished)
            StatusLog.rest("stale_rest_ended \(finished.count)")
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
}

/// ActivityKit's `Activity` is a class Apple has not annotated `Sendable`, while
/// `end(_:dismissalPolicy:)` is a `nonisolated async` method meant to be called
/// from anywhere — so ending one from the main actor reads to Swift 6 as sending
/// a non-`Sendable` value. This box states what the framework already
/// guarantees, in one place, instead of scattering the escape hatch.
private struct RestActivityBox: @unchecked Sendable {
    let activity: Activity<RestAttributes>

    @MainActor
    static func all(endedBefore cutoff: Date? = nil) -> [RestActivityBox] {
        Activity<RestAttributes>.activities
            .filter { live in
                guard let cutoff else { return true }
                return live.content.state.endsAt <= cutoff
            }
            .map(RestActivityBox.init)
    }

    static func endAll(_ boxes: [RestActivityBox]) async {
        for box in boxes {
            await box.activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
