import SwiftUI

/// The v17 «الدفتر» palette, حديد skin, straight off `styles.css` §Tokens.
/// Light and dark are the two rows of that table; the Dynamic Island is always
/// dark, so `RWDark` is named separately rather than resolved from the trait.
enum RWDark {
    static let bg = Color(hex: 0x121010)
    static let card = Color(hex: 0x1C1714)
    static let ink = Color(hex: 0xF4ECE3)
    static let muted = Color(hex: 0x9C8672)
    static let accent = Color(hex: 0xE8622D)
    static let border = Color(hex: 0x33291F)
    static let good = Color(hex: 0x229E71)
}

enum RWLight {
    static let bg = Color(hex: 0xF3EDE4)
    static let card = Color(hex: 0xFBF8F3)
    static let ink = Color(hex: 0x1B1613)
    static let muted = Color(hex: 0x75685A)
    static let accent = Color(hex: 0xB8451A)
    static let border = Color(hex: 0xE1D8CA)
    static let good = Color(hex: 0x147A3A)
}

/// System-appearance-aware tokens for the Home-Screen widget. Resolved by the
/// trait, not by `@Environment(\.colorScheme)`, so `containerBackground` and the
/// content can never disagree about which theme they are in.
///
/// `UIKit`-gated so this file also compiles for the Mac, which is where
/// `Tools/RenderIslandPreviews.swift` draws the Island faces. Nothing outside
/// the Home-Screen widget uses it.
#if canImport(UIKit)
import UIKit

enum RWColor {
    static let bg = dynamic(RWLight.bg, RWDark.bg)
    static let ink = dynamic(RWLight.ink, RWDark.ink)
    static let muted = dynamic(RWLight.muted, RWDark.muted)
    static let accent = dynamic(RWLight.accent, RWDark.accent)
    static let border = dynamic(RWLight.border, RWDark.border)
    static let good = dynamic(RWLight.good, RWDark.good)

    private static func dynamic(_ light: Color, _ dark: Color) -> Color {
        Color(UIColor { trait in
            UIColor(trait.userInterfaceStyle == .dark ? dark : light)
        })
    }
}
#endif

/// The three skins, dark row only — the Dynamic Island and the Lock Screen are
/// always dark, whatever the phone is set to. Values are `styles.css`
/// `[data-skin][data-theme="dark"]`, with one deliberate departure: وَرَق's dark
/// `--accent` (`#743d4a`) is a fill colour and is unreadable as a numeral at
/// 40pt on `#121110`, so the skin carries two — `accent` for fills and rules,
/// `label` for text and numbers. حديد and رخام read fine, so their `label` is
/// the accent itself.
struct RWSkin {
    let bg: Color
    let ink: Color
    let muted: Color
    /// Fills: the glyph, the draining bar, the keyline.
    let accent: Color
    /// Text and numerals. Never darker than the accent.
    let label: Color
    let good: Color

    static let hadid = RWSkin(
        bg: Color(hex: 0x121010), ink: Color(hex: 0xF4ECE3), muted: Color(hex: 0x9C8672),
        accent: Color(hex: 0xE8622D), label: Color(hex: 0xE8622D), good: Color(hex: 0x229E71)
    )
    static let waraq = RWSkin(
        bg: Color(hex: 0x121110), ink: Color(hex: 0xF2ECE4), muted: Color(hex: 0x9C968E),
        accent: Color(hex: 0xA33F52), label: Color(hex: 0xD98A9A), good: Color(hex: 0x229E71)
    )
    static let rukham = RWSkin(
        bg: Color(hex: 0x111517), ink: Color(hex: 0xE8EEF1), muted: Color(hex: 0x87949C),
        accent: Color(hex: 0xA8B8C0), label: Color(hex: 0xA8B8C0), good: Color(hex: 0x229E71)
    )

    /// An unknown or missing name is حديد — the app's own default — never a
    /// blank palette, because the Island has to draw something.
    static func named(_ name: String) -> RWSkin {
        switch name {
        case "waraq": return .waraq
        case "rukham": return .rukham
        default: return .hadid
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

/// The barbell from the web app's header, as a shape. `dumbbell.fill` is the SF
/// fallback in the Island's compact slot, where a 16pt custom path would be
/// mush; everywhere there is room, this is the app's own mark.
struct BarbellMark: Shape {
    func path(in rect: CGRect) -> Path {
        // The header SVG's 200×130 viewBox, letterboxed into `rect`.
        let scale = min(rect.width / 200, rect.height / 130)
        let dx = rect.minX + (rect.width - 200 * scale) / 2
        let dy = rect.minY + (rect.height - 130 * scale) / 2
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: dx + x * scale, y: dy + y * scale)
        }
        var path = Path()
        let segments: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
            (29, 50, 29, 74), (35, 42, 35, 82), (165, 42, 165, 82), (171, 50, 171, 74), (36, 62, 164, 62),
        ]
        for (x1, y1, x2, y2) in segments {
            path.move(to: point(x1, y1))
            path.addLine(to: point(x2, y2))
        }
        return path
    }
}
