import ActivityKit
import Foundation

/// One activity per session. The state it carries is `SessionState`, which lives
/// in its own file so the faces that draw it never have to import ActivityKit.
struct SessionAttributes: ActivityAttributes {
    typealias ContentState = SessionState

    /// Arabic session name, e.g. «علوي أ». Fixed for the life of the session.
    var session: String
}

/// v17r2's rest-only activity, kept for one reason: `ActivityKit` keys an
/// activity by its attributes TYPE NAME, so an activity started by the previous
/// build is invisible to `Activity<SessionAttributes>`. Without this the Island
/// could sit on a dead rest countdown after the update, with nothing able to
/// end it. `NativeBridge` sweeps these once on every foreground.
struct RestAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var endsAt: Date
        var setLabel: String
    }

    var session: String
    var exercise: String
    var startedAt: Date
}
