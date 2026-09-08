#if os(macOS)
import AppKit
import ImageIO
import SwiftUI
import UniformTypeIdentifiers

/// Draws the Live Activity faces — the REAL views out of `Widget/SessionFaces.swift`,
/// not a copy of them — for every skin and every state, so a change of palette or
/// of Arabic wording can be looked at without a phone.
///
/// The playbook's golden rule still holds: this is proof of layout, colour, RTL
/// and fill, and it is NOT proof that the activity runs. Only a real widget host
/// can show `activityBackgroundTint`, the Island's own geometry, staleness and
/// the ticking timers. The containers below are this file's approximation of the
/// host; everything inside them is the shipped view.
///
///     swiftc -parse-as-library -Onone \
///       Tools/RenderIslandPreviews.swift Widget/SessionFaces.swift \
///       Shared/SessionState.swift Shared/DesignSystem.swift -o /tmp/render_island
///     /tmp/render_island <output-directory>
@main
struct RenderIslandPreviews {
    static let skins = ["hadid", "waraq", "rukham"]

    @MainActor
    static func main() {
        let out = CommandLine.arguments.dropFirst().first ?? "."
        try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
        for skin in skins {
            let sheet = Sheet(skin: skin)
            write(sheet, to: "\(out)/faces-\(skin).png", scale: 2)
        }
        print("rendered \(skins.count) sheets into \(out)")
    }

    @MainActor
    static func write(_ view: some View, to path: String, scale: CGFloat) {
        let renderer = ImageRenderer(content: view)
        renderer.scale = scale
        guard let image = renderer.cgImage,
              let destination = CGImageDestinationCreateWithURL(
                URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)
        else {
            print("failed: \(path)")
            return
        }
        CGImageDestinationAddImage(destination, image, nil)
        CGImageDestinationFinalize(destination)
        print("wrote \(path)")
    }
}

/// The three states the Island has to be able to be in.
enum Face: String, CaseIterable {
    case training = "session running — not resting"
    case resting = "resting"
    case restOver = "rest over — the session is still on"

    func state(skin: String) -> SessionState {
        let now = Date()
        var state = SessionState(
            startedAt: now.addingTimeInterval(-(42 * 60 + 15)),
            exercise: "Incline Dumbbell Press",
            setLabel: "المجموعة 2 من 3",
            exerciseLabel: "تمرين 3 من 7",
            sinceLabel: "منذ",
            restEndsAt: nil,
            restStartedAt: nil,
            done: 2,
            total: 7,
            skin: skin
        )
        switch self {
        case .training:
            return state
        case .resting:
            state.restEndsAt = now.addingTimeInterval(47)
            state.restStartedAt = now.addingTimeInterval(-103)
            return state
        case .restOver:
            state.restEndsAt = now.addingTimeInterval(-12)
            state.restStartedAt = now.addingTimeInterval(-162)
            return state
        }
    }
}

private let sessionName = "علوي أ"

struct Sheet: View {
    let skin: String

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Caption(skin.uppercased(), size: 15, weight: .bold)
            ForEach(Face.allCases, id: \.self) { face in
                let state = face.state(skin: skin)
                VStack(alignment: .leading, spacing: 8) {
                    Caption(face.rawValue, size: 11, weight: .semibold)
                    HStack(alignment: .top, spacing: 14) {
                        CompactPill(state: state)
                        MinimalPill(state: state)
                    }
                    ExpandedIsland(state: state)
                    LockScreenCard(state: state)
                }
            }
        }
        .padding(24)
        .frame(width: 460)
        .background(Color(white: 0.10))
    }
}

/// Not part of any face — the sheet's own labelling, in grey Latin so it can
/// never be mistaken for something the Island says.
struct Caption: View {
    let text: String
    var size: CGFloat
    var weight: Font.Weight

    init(_ text: String, size: CGFloat, weight: Font.Weight) {
        self.text = text
        self.size = size
        self.weight = weight
    }

    var body: some View {
        Text(text)
            .font(.system(size: size, weight: weight, design: .monospaced))
            .foregroundStyle(Color(white: 0.45))
    }
}

struct CompactPill: View {
    let state: SessionState

    var body: some View {
        HStack(spacing: 0) {
            SessionGlyph(size: 14, tint: state.palette.accent)
            Spacer(minLength: 26)
            CompactValue(state: state, restOver: state.isRestOver(), size: 14, width: 54)
        }
        .padding(.horizontal, 14)
        .frame(width: 200, height: 37)
        .background(Capsule().fill(.black))
    }
}

struct MinimalPill: View {
    let state: SessionState

    var body: some View {
        CompactValue(state: state, restOver: state.isRestOver(), size: 12, width: nil)
            .padding(.horizontal, 8)
            .frame(minWidth: 37, minHeight: 37)
            .background(Capsule().fill(.black))
    }
}

struct ExpandedIsland: View {
    let state: SessionState

    var body: some View {
        VStack(spacing: 10) {
            HStack(alignment: .center) {
                SessionHeading(state: state, session: sessionName)
                    .padding(.leading, 4)
                Spacer(minLength: 40)
                ElapsedLine(state: state, size: 14)
                    .padding(.trailing, 4)
            }
            SessionBody(state: state, restOver: state.isRestOver(), countdownSize: 38)
                .padding(.top, 2)
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 16)
        .frame(width: 412)
        .background(RoundedRectangle(cornerRadius: 44, style: .continuous).fill(.black))
    }
}

struct LockScreenCard: View {
    let state: SessionState

    var body: some View {
        SessionLockScreenView(state: state, restOver: state.isRestOver(), session: sessionName)
            .frame(width: 412)
            // The real ground is `activityBackgroundTint`, which only a widget
            // host applies; this stands in for it so the contrast is honest.
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(state.palette.bg))
    }
}
#endif
