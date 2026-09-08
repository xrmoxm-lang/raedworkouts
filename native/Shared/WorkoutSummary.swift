import Foundation

/// The `summary` payload `core/native.js` posts, as the widget reads it.
///
/// `last.kg` arrives as a formatted string ("2,514") because `fmtKgTotal()`
/// formats it web-side; it is decoded leniently so a future numeric value does
/// not blank the line.
struct WorkoutSummary: Codable, Hashable {
    struct Today: Codable, Hashable {
        var name: String = ""
        var kind: String = "gym"
        var isRest: Bool { kind == "rest" }
    }

    struct Week: Codable, Hashable {
        var done: Int = 0
        var target: Int = 0
    }

    struct Last: Codable, Hashable {
        var date: String = ""
        var name: String = ""
        var sets: Int = 0
        var kg: String = "0"

        private enum CodingKeys: String, CodingKey { case date, name, sets, kg }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            date = (try? c.decode(String.self, forKey: .date)) ?? ""
            name = (try? c.decode(String.self, forKey: .name)) ?? ""
            sets = (try? c.decode(Int.self, forKey: .sets)) ?? 0
            if let text = try? c.decode(String.self, forKey: .kg) {
                kg = text
            } else if let number = try? c.decode(Double.self, forKey: .kg) {
                kg = Self.grouped.string(from: NSNumber(value: number)) ?? String(Int(number))
            } else {
                kg = "0"
            }
        }

        init(date: String, name: String, sets: Int, kg: String) {
            self.date = date; self.name = name; self.sets = sets; self.kg = kg
        }

        private static let grouped: NumberFormatter = {
            let f = NumberFormatter()
            f.numberStyle = .decimal
            f.maximumFractionDigits = 0
            f.locale = Locale(identifier: "en_US_POSIX")
            return f
        }()
    }

    struct Active: Codable, Hashable {
        var name: String = ""
        var startedAt: String?
        private enum CodingKeys: String, CodingKey { case name, startedAt = "started_at" }
    }

    var updatedAt: String?
    var today: Today?
    var week: Week?
    var streak: Int?
    var last: Last?
    var active: Active?

    private enum CodingKeys: String, CodingKey {
        case updatedAt = "updated_at", today, week, streak, last, active
    }

    /// A summary with nothing worth drawing — the widget's «افتح التطبيق مرة» state.
    var isEmpty: Bool {
        (today?.name.isEmpty ?? true) && (week?.target ?? 0) == 0 && last == nil && active == nil
    }

    static func load() -> WorkoutSummary? {
        guard let data = AppGroupStore.data(RW.summaryKey) else { return nil }
        return try? JSONDecoder().decode(WorkoutSummary.self, from: data)
    }

    static let sample = WorkoutSummary(
        updatedAt: nil,
        today: Today(name: "علوي أ", kind: "gym"),
        week: Week(done: 3, target: 4),
        streak: 5,
        last: Last(date: "2026-09-06", name: "سفلي أ", sets: 19, kg: "2,514"),
        active: nil
    )
}

/// Arabic weekday for the «آخر جلسة» line. The date arrives as `YYYY-MM-DD`.
enum ArabicDay {
    static func name(fromISODate iso: String) -> String {
        guard let date = parser.date(from: String(iso.prefix(10))) else { return "" }
        return formatter.string(from: date)
    }

    private static let parser: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar")
        f.setLocalizedDateFormatFromTemplate("EEEE")
        return f
    }()
}
