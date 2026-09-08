import SwiftUI
import WidgetKit

struct SummaryEntry: TimelineEntry {
    let date: Date
    let summary: WorkoutSummary?
}

struct SummaryProvider: TimelineProvider {
    func placeholder(in context: Context) -> SummaryEntry {
        SummaryEntry(date: Date(), summary: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (SummaryEntry) -> Void) {
        completion(SummaryEntry(date: Date(), summary: WorkoutSummary.load() ?? (context.isPreview ? .sample : nil)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SummaryEntry>) -> Void) {
        let summary = WorkoutSummary.load()
        if !AppGroupStore.isAvailable {
            StatusLog.widget("no_app_group")
        } else if let summary {
            StatusLog.widget("read_ok \(summary.week?.done ?? 0)/\(summary.week?.target ?? 0)")
        } else {
            StatusLog.widget("no_summary_yet")
        }
        // One entry. The app reloads the timeline on every render anyway; the
        // hour is only so a widget that has not been opened all day still ages.
        completion(Timeline(entries: [SummaryEntry(date: Date(), summary: summary)],
                            policy: .after(Date().addingTimeInterval(60 * 60))))
    }
}

struct SummaryWidget: Widget {
    let kind = "RaedworkoutsSummary"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SummaryProvider()) { entry in
            SummaryWidgetView(entry: entry)
        }
        .configurationDisplayName("Raedworkouts")
        .description("جلسة اليوم، وأين أنت من الأسبوع.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

struct SummaryWidgetView: View {
    let entry: SummaryEntry
    @Environment(\.widgetFamily) private var family

    private var summary: WorkoutSummary? {
        guard let value = entry.summary, !value.isEmpty else { return nil }
        return value
    }

    var body: some View {
        Group {
            if let summary {
                face(summary)
            } else {
                empty
            }
        }
        // Every widget pitfall #1 fix in one place: content fills the tile
        // edge to edge, and the only background is the container's.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(.horizontal, family == .systemMedium ? 18 : 15)
        .padding(.vertical, family == .systemMedium ? 16 : 14)
        .environment(\.layoutDirection, .rightToLeft)
        .containerBackground(for: .widget) { RWColor.bg }
        .widgetURL(RW.deepLink())
    }

    // MARK: The face

    @ViewBuilder
    private func face(_ summary: WorkoutSummary) -> some View {
        // `.leading` under a right-to-left layout is the RIGHT edge — the whole
        // column is right-aligned Arabic, which is what `.leading` means here.
        VStack(alignment: .leading, spacing: 0) {
            Text(eyebrow(summary))
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(summary.active == nil ? RWColor.muted : RWColor.accent)
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            Text(title(summary))
                .font(.system(size: family == .systemMedium ? 22 : 19, weight: .bold))
                .foregroundStyle(RWColor.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.top, 2)

            Spacer(minLength: 8)

            HStack(alignment: .lastTextBaseline, spacing: 7) {
                Text(weekCount(summary))
                    .font(.system(size: family == .systemMedium ? 34 : 30, weight: .semibold, design: .monospaced))
                    .monospacedDigit()
                    .foregroundStyle(RWColor.accent)
                    .lineLimit(1)
                Text("هذا الأسبوع")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(RWColor.muted)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }

            Spacer(minLength: 8)

            Rectangle()
                .fill(RWColor.border)
                .frame(height: 1)
                .padding(.bottom, family == .systemMedium ? 9 : 7)

            lastLine(summary)
                .lineLimit(family == .systemMedium ? 1 : 2)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: 6) {
            Spacer(minLength: 0)
            BarbellMark()
                .stroke(RWColor.accent, style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
                .frame(width: 54, height: 35)
            Text("افتح التطبيق مرة")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(RWColor.ink)
            Text("ثم يمتلئ هذا المربع")
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(RWColor.muted)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Copy

    private func eyebrow(_ summary: WorkoutSummary) -> String {
        if summary.active != nil { return "جارية الآن" }
        if summary.today?.isRest == true { return "ارتَحْ اليوم" }
        return "اليوم · يوم نادٍ"
    }

    private func title(_ summary: WorkoutSummary) -> String {
        if let active = summary.active, !active.name.isEmpty { return active.name }
        let name = summary.today?.name ?? ""
        if !name.isEmpty { return name }
        return summary.today?.isRest == true ? "راحة" : "—"
    }

    private func weekCount(_ summary: WorkoutSummary) -> String {
        let week = summary.week ?? .init()
        return "\(week.done)/\(week.target)"
    }

    /// «آخر جلسة · السبت · ١٩ مجموعة · 2,514 kg» — one wrapping run so the bidi
    /// algorithm places the Latin numbers itself, with the numbers in Plex Mono's
    /// system stand-in and the words in the Arabic UI face.
    private func lastLine(_ summary: WorkoutSummary) -> Text {
        guard let last = summary.last, !last.date.isEmpty || last.sets > 0 else {
            return Text("لا جلسات بعد")
                .font(.system(size: 11.5, weight: .medium))
                .foregroundColor(RWColor.muted)
        }
        let words = Font.system(size: 11.5, weight: .medium)
        let digits = Font.system(size: 11.5, weight: .medium, design: .monospaced)
        let day = ArabicDay.name(fromISODate: last.date)

        var line = Text("آخر جلسة").font(words).foregroundColor(RWColor.muted)
        if !day.isEmpty {
            line = line + Text(" · ").font(words).foregroundColor(RWColor.border)
                + Text(day).font(words).foregroundColor(RWColor.muted)
        }
        // Non-breaking spaces between a number and its unit: in a small tile the
        // line wraps, and it wrapped straight between «19» and «مجموعة».
        line = line + Text(" · ").font(words).foregroundColor(RWColor.border)
            + Text("\(last.sets)").font(digits).foregroundColor(RWColor.ink)
            + Text("\u{00A0}مجموعة").font(words).foregroundColor(RWColor.muted)
        line = line + Text(" · ").font(words).foregroundColor(RWColor.border)
            // Narrow and non-breaking: the unit belongs to the number.
            + Text("\(last.kg)\u{202F}kg").font(digits).foregroundColor(RWColor.ink)
        return line
    }
}
