import SwiftUI

/// The faces the Live Activity draws, with no `ActivityKit` and no `WidgetKit`
/// in them: they take a `SessionState` and a session name, nothing else. That is
/// what lets `Tools/RenderIslandPreviews.swift` draw the very same views instead
/// of a hand-copied approximation of them.
///
/// Always dark — the Island is — but no longer always حديد: the palette comes
/// from `state.skin`, so the app's active skin is the Island's too. Arabic runs
/// right-to-left; the exercise name is Latin and is isolated left-to-right so a
/// name like "Incline DB Press" is not re-ordered around the Arabic beside it.

/// The app's own barbell, drawn rather than borrowed — except here, where 14pt
/// of custom path would be mush and SF's `dumbbell.fill` reads.
struct SessionGlyph: View {
    var size: CGFloat
    var tint: Color

    var body: some View {
        Image(systemName: "dumbbell.fill")
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(tint)
    }
}

/// The one value the compact and minimal slots have room for. Resting it is the
/// rest countdown; otherwise it is how long he has been training — never
/// nothing, because an Island that shows nothing is an Island he stops trusting.
///
/// `restOver` is passed in rather than derived from the clock: a Live Activity
/// view is rendered once and archived, so a `Date() > end` branch inside it never
/// flips on its own — the compact slot sat on «0:00» when it was written that
/// way. The wrapper hands down `context.isStale`, which is the one signal that
/// makes the system re-render without an update from the app.
struct CompactValue: View {
    let state: SessionState
    var restOver: Bool
    var size: CGFloat
    var width: CGFloat?

    var body: some View {
        Group {
            if let end = state.restEndsAt, !restOver {
                Text(timerInterval: Date()...end, countsDown: true, showsHours: false)
                    .foregroundStyle(state.palette.label)
            } else {
                Text(state.startedAt, style: .timer)
                    .foregroundStyle(state.palette.ink)
            }
        }
        .font(.system(size: size, weight: .semibold, design: .monospaced))
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.55)
        .multilineTextAlignment(.center)
        .frame(width: width)
        .environment(\.layoutDirection, .leftToRight)
    }
}

/// «منذ 12:34». The word is resolved web-side and arrives in the payload; RTL
/// puts it first, which is the right of the pair.
struct ElapsedLine: View {
    let state: SessionState
    var size: CGFloat

    var body: some View {
        HStack(spacing: 4) {
            if !state.sinceLabel.isEmpty {
                Text(state.sinceLabel)
                    .font(.system(size: size - 2, weight: .semibold))
                    .foregroundStyle(state.palette.muted)
            }
            Text(state.startedAt, style: .timer)
                .font(.system(size: size, weight: .semibold, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(state.palette.ink)
                .environment(\.layoutDirection, .leftToRight)
        }
        .lineLimit(1)
        .environment(\.layoutDirection, .rightToLeft)
    }
}

/// The big number: the rest counting down, or — once it has run out — the fact
/// that it has. The activity does NOT end there; the session is still on.
struct RestCountdown: View {
    let state: SessionState
    var restOver: Bool
    var size: CGFloat

    var body: some View {
        if restOver {
            Text("انتهت الراحة")
                .font(.system(size: size * 0.55, weight: .bold))
                .foregroundStyle(state.palette.good)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else if let end = state.restEndsAt {
            Text(timerInterval: Date()...end, countsDown: true, showsHours: false)
                .font(.system(size: size, weight: .semibold, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(state.palette.label)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .environment(\.layoutDirection, .leftToRight)
        }
    }
}

/// A thin rule under the big number: the rest draining, or how far through the
/// exercises he is. Under RTL a linear `ProgressView` runs from the right, which
/// is the direction the rest of the app drains in.
struct SessionBar: View {
    let state: SessionState
    var restOver: Bool

    private var progressFraction: CGFloat {
        guard state.total > 0 else { return 0 }
        return min(max(CGFloat(state.done) / CGFloat(state.total), 0), 1)
    }

    var body: some View {
        Group {
            if restOver {
                Capsule()
                    .fill(state.palette.good)
                    .frame(height: 3)
            } else if let interval = state.restInterval {
                ProgressView(timerInterval: interval, countsDown: true) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
                .progressViewStyle(.linear)
                .tint(state.palette.accent)
                .labelsHidden()
            } else {
                // Drawn rather than a `ProgressView`: this one does not animate,
                // so there is nothing to gain from the system style and two
                // things to lose — the playbook's `ZStack(alignment: .leading)`
                // fills right-to-left under RTL, which is the direction the rest
                // of the app fills in, and a drawn bar can be rendered.
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Capsule().fill(state.palette.accent.opacity(0.24))
                        Capsule()
                            .fill(state.palette.accent)
                            .frame(width: geometry.size.width * progressFraction)
                    }
                }
            }
        }
        .frame(height: 4)
    }
}

/// Everything below the first line, shared by the Island's expanded view and the
/// Lock Screen card so the two can never drift apart.
struct SessionBody: View {
    let state: SessionState
    var restOver: Bool
    var countdownSize: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !state.exercise.isEmpty {
                Text(state.exercise)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(state.palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .environment(\.layoutDirection, .leftToRight)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !state.setLabel.isEmpty {
                Text(state.setLabel)
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(state.palette.muted)
                    .lineLimit(1)
            }
            if state.restEndsAt != nil {
                RestCountdown(state: state, restOver: restOver, size: countdownSize)
            } else if !state.exerciseLabel.isEmpty {
                Text(state.exerciseLabel)
                    .font(.system(size: 14, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(state.palette.ink)
                    .lineLimit(1)
            }
            SessionBar(state: state, restOver: restOver)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .environment(\.layoutDirection, .rightToLeft)
    }
}

/// The Lock Screen card. No background of its own: the ground is
/// `activityBackgroundTint`, and drawing it twice is the box-in-a-box bug.
struct SessionLockScreenView: View {
    let state: SessionState
    var restOver: Bool
    let session: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                SessionGlyph(size: 13, tint: state.palette.accent)
                Text(session.isEmpty ? "التمرين" : session)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(state.palette.muted)
                    .lineLimit(1)
                Spacer(minLength: 6)
                ElapsedLine(state: state, size: 13)
            }
            .environment(\.layoutDirection, .rightToLeft)

            SessionBody(state: state, restOver: restOver, countdownSize: 42)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .environment(\.layoutDirection, .rightToLeft)
    }
}

/// The Island's expanded top-left: the glyph and which session this is.
struct SessionHeading: View {
    let state: SessionState
    let session: String

    var body: some View {
        HStack(spacing: 6) {
            SessionGlyph(size: 15, tint: state.palette.accent)
            Text(session)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(state.palette.muted)
                .lineLimit(1)
        }
    }
}
