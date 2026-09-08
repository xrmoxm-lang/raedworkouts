import ActivityKit
import SwiftUI
import WidgetKit

/// The session on the Dynamic Island and the Lock Screen.
///
/// It runs for the WHOLE session, not just a rest: something is always shown,
/// and that is the point of it. Not resting, the compact slot counts the time
/// since he started; resting, it counts the rest down. Every face lives in
/// `SessionFaces.swift`; this file is only the wiring.
struct SessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SessionAttributes.self) { context in
            // `isStale` is the only thing that makes the system re-render a face
            // without an update from the app — the staleDate is set to the rest
            // deadline for exactly this, so «انتهت الراحة» appears while the
            // phone is in his pocket. The date check is the belt to that braces:
            // an update that arrives after the deadline carries the truth itself.
            SessionLockScreenView(state: context.state,
                                  restOver: context.isStale || context.state.isRestOver(),
                                  session: context.attributes.session)
                .widgetURL(RW.deepLink())
                .activityBackgroundTint(context.state.palette.bg)
                .activitySystemActionForegroundColor(context.state.palette.label)
        } dynamicIsland: { context in
            let restOver = context.isStale || context.state.isRestOver()
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    SessionHeading(state: context.state, session: context.attributes.session)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ElapsedLine(state: context.state, size: 14)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    SessionBody(state: context.state, restOver: restOver, countdownSize: 38)
                        .padding(.top, 2)
                }
            } compactLeading: {
                SessionGlyph(size: 14, tint: context.state.palette.accent)
            } compactTrailing: {
                CompactValue(state: context.state, restOver: restOver, size: 14, width: 54)
            } minimal: {
                CompactValue(state: context.state, restOver: restOver, size: 12, width: nil)
            }
            .widgetURL(RW.deepLink())
            .keylineTint(context.state.palette.accent)
        }
    }
}
