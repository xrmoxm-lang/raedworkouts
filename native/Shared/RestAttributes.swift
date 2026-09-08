import ActivityKit
import Foundation

/// The rest countdown, as the Dynamic Island and the Lock Screen see it.
///
/// Shared by both targets: the app requests and ends the activity, the widget
/// extension draws it. `endsAt` is the deadline the web app already persists,
/// so a relaunch mid-rest re-creates exactly the rest that is still running.
struct RestAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var endsAt: Date
        var setLabel: String
    }

    /// Arabic session name, e.g. «علوي أ».
    var session: String
    /// Latin exercise name, e.g. "Incline Dumbbell Press".
    var exercise: String
    /// When the rest began — the progress bar needs both ends of the interval.
    var startedAt: Date
}
