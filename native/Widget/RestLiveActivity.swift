import ActivityKit
import SwiftUI
import WidgetKit

/// The rest countdown on the Dynamic Island and the Lock Screen.
///
/// Always dark — the Island is — so it uses `RWDark` directly rather than the
/// trait-resolved tokens. Arabic runs right-to-left; the exercise name is Latin
/// and is isolated left-to-right so a name like "Incline DB Press" is not
/// re-ordered around the Arabic beside it.
struct RestLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestAttributes.self) { context in
            RestLockScreenView(context: context)
                .activityBackgroundTint(RWDark.bg)
                .activitySystemActionForegroundColor(RWDark.accent)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    RestGlyph(size: 20)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.setLabel)
                        .font(.system(size: 15, weight: .semibold, design: .monospaced))
                        .foregroundStyle(RWDark.muted)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(exerciseTitle(context))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(RWDark.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .environment(\.layoutDirection, .leftToRight)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        RestCountdown(context: context, size: 40)
                        RestBar(context: context)
                    }
                    .padding(.top, 2)
                }
            } compactLeading: {
                RestGlyph(size: 14)
            } compactTrailing: {
                if context.isStale {
                    Image(systemName: "checkmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(RWDark.good)
                } else {
                    Text(timerInterval: Date()...context.state.endsAt, countsDown: true, showsHours: false)
                        .font(.system(size: 14, weight: .semibold, design: .monospaced))
                        .monospacedDigit()
                        .foregroundStyle(RWDark.accent)
                        .frame(width: 44)
                        .multilineTextAlignment(.trailing)
                }
            } minimal: {
                if context.isStale {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(RWDark.good)
                } else {
                    Text(timerInterval: Date()...context.state.endsAt, countsDown: true, showsHours: false)
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .monospacedDigit()
                        .foregroundStyle(RWDark.accent)
                }
            }
            .widgetURL(RW.deepLink())
            .keylineTint(RWDark.accent)
        }
    }

    private func exerciseTitle(_ context: ActivityViewContext<RestAttributes>) -> String {
        let name = context.attributes.exercise.trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? context.attributes.session : name
    }
}

/// The app's own barbell, drawn rather than borrowed — except in the compact
/// slot, where 14pt of custom path would be mush and SF's `dumbbell.fill` reads.
struct RestGlyph: View {
    var size: CGFloat

    var body: some View {
        Image(systemName: "dumbbell.fill")
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(RWDark.accent)
    }
}

struct RestCountdown: View {
    let context: ActivityViewContext<RestAttributes>
    var size: CGFloat

    var body: some View {
        if context.isStale {
            Text("انتهت الراحة")
                .font(.system(size: size * 0.55, weight: .bold))
                .foregroundStyle(RWDark.good)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        } else {
            Text(timerInterval: Date()...context.state.endsAt, countsDown: true, showsHours: false)
                .font(.system(size: size, weight: .semibold, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(RWDark.accent)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
    }
}

/// A thin draining rule. Under RTL a `ZStack(alignment: .leading)` fills from the
/// right, which is the direction the rest of the app drains in.
struct RestBar: View {
    let context: ActivityViewContext<RestAttributes>

    private var interval: ClosedRange<Date> {
        let start = context.attributes.startedAt
        let end = context.state.endsAt
        return start < end ? start...end : end.addingTimeInterval(-1)...end
    }

    var body: some View {
        Group {
            if context.isStale {
                Capsule()
                    .fill(RWDark.good)
                    .frame(height: 3)
            } else {
                ProgressView(timerInterval: interval, countsDown: true) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .progressViewStyle(.linear)
                .tint(RWDark.accent)
                .labelsHidden()
            }
        }
        .frame(height: 4)
    }
}

struct RestLockScreenView: View {
    let context: ActivityViewContext<RestAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                RestGlyph(size: 13)
                Text(context.attributes.session.isEmpty ? "راحة" : context.attributes.session)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(RWDark.muted)
                Spacer(minLength: 6)
                if !context.state.setLabel.isEmpty {
                    Text(context.state.setLabel)
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundStyle(RWDark.muted)
                }
            }

            if !context.attributes.exercise.isEmpty {
                Text(context.attributes.exercise)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(RWDark.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .environment(\.layoutDirection, .leftToRight)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            RestCountdown(context: context, size: 44)
            RestBar(context: context)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .environment(\.layoutDirection, .rightToLeft)
        .widgetURL(RW.deepLink())
    }
}
