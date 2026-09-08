import Foundation
import SwiftUI

/// The workout SESSION as the Dynamic Island and the Lock Screen see it.
///
/// It used to be the rest countdown, and it only existed while a rest was
/// running — «إذا بديت الجلسة أبغاه يكون موجود دائمًا، مو فقط على العدادات».
/// One activity now spans the whole session: `startedAt` drives the elapsed
/// timer, and the rest is a state *inside* it (`restEndsAt != nil`), not the
/// reason it exists.
///
/// Everything in Arabic arrives pre-formatted from the web app — `setLabel`,
/// `exerciseLabel`, `sinceLabel` — so nothing here composes an Arabic string or
/// puts a number inside one.
///
/// Declared apart from `SessionAttributes` on purpose: `ActivityAttributes` is
/// iOS-only, and keeping the state and the faces free of `ActivityKit` is what
/// lets `Tools/RenderIslandPreviews.swift` draw the real views.
struct SessionState: Codable, Hashable {
    /// Session start. The elapsed timer counts up from this and nothing else.
    var startedAt: Date
    /// Current movement, Latin, may be empty.
    var exercise: String
    /// «المجموعة 2 من 3» or «تدرّج 1 من 2». May be empty.
    var setLabel: String
    /// «تمرين 3 من 7». May be empty.
    var exerciseLabel: String
    /// «منذ» — the one word in front of the elapsed timer.
    var sinceLabel: String
    /// nil ⇒ not resting.
    var restEndsAt: Date?
    /// When the rest began; the draining bar needs both ends.
    var restStartedAt: Date?
    /// Exercises resolved, and how many there are.
    var done: Int
    var total: Int
    /// "hadid" | "waraq" | "rukham" — the app's active skin.
    var skin: String

    /// A rest that is still running.
    func isResting(at now: Date = Date()) -> Bool {
        guard let restEndsAt else { return false }
        return restEndsAt > now
    }

    /// A deadline in the past is a rest that ran out while the phone was in his
    /// pocket: the activity stays, and says «انتهت الراحة».
    func isRestOver(at now: Date = Date()) -> Bool {
        guard let restEndsAt else { return false }
        return restEndsAt <= now
    }

    var palette: RWSkin { RWSkin.named(skin) }

    /// The bar's interval, never inverted — a resumed rest can arrive with a
    /// start the app never saw.
    var restInterval: ClosedRange<Date>? {
        guard let end = restEndsAt else { return nil }
        let start = restStartedAt ?? end.addingTimeInterval(-1)
        return start < end ? start...end : end.addingTimeInterval(-1)...end
    }
}
