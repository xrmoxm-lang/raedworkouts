# Raedworkouts Go — Design System v17 («الدفتر» / the logbook)

Authority: `styles.css` is the implementation of this document. When they disagree,
fix the stylesheet and this file together. Written 2026-09-07 by the design lead.
Every screen worker builds against this, not against the old screenshots.

## 1. Identity in three sentences

A **precision logbook**, not a fitness app. Plex Sans Arabic carries every word,
Plex Mono carries every number, and the page is one continuous sheet with hairline
structure — no cards, no shadows, no emoji, no decoration. One accent colour marks
the single live thing on screen (the set he is about to do, the button he came to
press, the timer that is running); everything else is ink on paper.

Three words: **quiet · precise · honest.** Anti-references: streak flames, confetti,
badges, dashboards, stat tiles, «You crushed it», emoji as icons, cards inside cards.

## 2. Tokens (`styles.css` §Tokens)

Six palettes: three skins (`hadid` default · `waraq` · `rukham`) × `light`/`dark`.
The 18 linted tokens keep their names and Raed's adopted hues; only surfaces moved.
The theme is **resolved before first paint** by the inline script in `index.html`
(`data-skin` and `data-theme` are always present; `data-theme-mode` records
`auto|light|dark`). `applyTheme()` must set the resolved value and follow
`prefers-color-scheme` changes when the mode is `auto`.

Additional tokens (not linted, free to use):

| token | role |
|---|---|
| `--font-ar` | `"IBM Plex Sans Arabic"`, Arabic UI text |
| `--font-latin` | `"IBM Plex Sans"`, exercise names, proper nouns |
| `--font-mono` | `"IBM Plex Mono"`, every number the user reads or types |
| `--ink-2` | secondary ink (between text and muted) |
| `--hair` | hairline colour (border at 70%) |
| `--ring` | accent focus ring (color-mix 35%) |
| `--glow` | accent glow for the live element (dark mode reads it stronger) |
| `--space-1…7` | 4 · 8 · 12 · 16 · 20 · 28 · 40 px |
| `--radius-xs/sm/md/lg/xl` | 6 · 10 · 14 · 18 · 26 px |
| `--tap` | 48px — minimum control height |
| `--page-x` | 20px — horizontal page padding |

## 3. Type

| role | family | size / line | weight |
|---|---|---|---|
| eyebrow `.eyebrow` | ar | 12 / 1.3 | 600, muted |
| tiny `.tiny` | ar | 12.5 / 1.5 | 500 |
| body | ar | 15.5 / 1.6 | 400 |
| row title `.row-title` | ar / latin | 16 / 1.35 | 600 |
| h3 | ar | 19 / 1.3 | 700 |
| h2 | ar | 24 / 1.2 | 700 |
| h1 (session name) | ar | 32 / 1.1 | 700, `text-wrap: balance` |
| exercise name `.ex-name` | latin | 22 / 1.2 | 600, LTR isolated |
| number small `.num` | mono | inherits | 500, `tabular-nums` |
| set inputs | mono | 24 | 500 |
| current-set inputs | mono | 28 | 600 |
| stat `.stat-num` | mono | 30 / 1 | 600 |
| rest countdown `.rt-time` | mono | 30 / 1 | 600 |

Arabic UI copy always through `t('key')` with a **semantic key** — never an English
literal as the lookup (that is what shipped «Session done.» in English). Latin runs
(exercise names, numbers) stay inside `<bdi class="ltr-run">`; `h()` does this for
strings automatically.

## 4. Layout

- One sheet. `body` is `--bg`; there are **no `.card` wrappers** on any screen.
  Grouping is done with `.section` (28px top space) + `.section-head` (eyebrow +
  optional trailing `.num`), and `.hairline` rules between rows.
- Page padding `--page-x` (20px). Max width 720, centred.
- The header is 52px, no border: brand mark + name at start, the gym launcher at end.
- The tab bar is fixed, blurred, five tabs, active tab = accent icon + label + 2px
  top rule. Auto-hides on scroll-down as before.
- Every control is ≥ `--tap` (48px) tall, measured by hit area, not box.
- Elevation is reserved for: the primary button, inputs (`--bg-elev` inset),
  the rest dock, the modal sheet. Nothing else casts a shadow.

## 5. Component kit (class names are the contract)

`.btn` — 48px, radius `--radius-md`, 600. Variants: `.primary` (accent fill,
56px when `.full`), default (hairline outline on `--bg-card`), `.ghost` (text only),
`.danger` (danger ink; `.danger.primary` fills), `.tiny` (36px, 13px text — hit
area still 48 via `::before`), `.full`, `.icon` (square).

Inputs — 48px, `--bg-elev`, hairline, radius `--radius-sm`, Arabic text 15.5;
numeric inputs add `.num` (mono, centred, 22px). Focus = 2px accent ring.

`.seg` / `.seg-btn.active` — segmented control (theme, superset mode, effort).
`.switch[role=switch][aria-checked]` — 30×50 toggle; replaces every On/Off button.
Keep the existing `data-*` on the same element.

`.chip` / `.chip.active` / `.chip.off` — 36px pill, hairline; active = accent-soft
fill + accent text.

`.list > .row` — the universal list item: `.row-lead` (icon or figure, 40px),
`.row-body` (`.row-title`, `.row-hint`), `.row-trail` (`.row-value` mono, chevron,
control). 56px min, hairline separators, no background. `.row.is-button` for taps.

`.figure` — inline SVG from `ui/figure.js` (`figure(primaryMuscles, secondary)`),
sizes `.figure.s40 .s56 .s72 .s120`. Body in ink at 14%, working muscle in accent,
secondary in accent 45%. Replaces every `.ex-thumb.body-img` background PNG.

`.eyebrow`, `.hairline`, `.stack` (vertical gap 12), `.cluster` (horizontal wrap
gap 8), `.between` (space-between row).

Modal = bottom **sheet**: `#modal-overlay.show > #modal.modal` with a grab handle,
radius 26 top, max-height 88dvh, internal scroll, safe-area bottom padding. Section
grammar inside a sheet: `.xs-head` (h3 + `.xs-sub`), `.xs-section` (`.xs-label` + content),
`.xs-grid` of `.btn.xs-action` (2 columns, `.xs-wide` spans), `.xs-done` full button.

Toast `#toast` — bottom-centre pill above the tab bar, ink on paper inverted, one
line, optional action button. `.skin-suggestion` variant with two actions.

Rest dock `#rest-timer.rest-timer` — full-width bar docked above the tab bar:
`.rt-ico` · `.rt-time.num` (30px mono) · `.rt-bar` (draining track, `--p` custom
property 0–1) · `#rest-cancel.rt-cancel`. Slides up on show. Ids are fixed.

Progress rail `.sess-progress` — `.sp-track` of `.sp-seg` (min 44px, 6px tall,
`.done` accent, `.current` accent outline + taller) and `.sp-count.num` (`3/7`, LTR).

## 6. Screens (DOM contracts the tests depend on are marked ★)

### Welcome (`ui/welcome.js`)
Brand mark 64px + name; `.profile-grid` of `.profile-tile` ★ (initial in mono 28px,
name, meta); «شخص آخر؟» ghost; `.register-panel` ★ for the register/other flows.
All copy via locale keys (this screen currently has English literals — fix).

### Home, before a session (`ui/home.js`)
```
eyebrow: الاثنين · يوم نادٍ                      [data-home-overview] ★ on the hero wrapper
h1: علوي أ
muted: 7 تمارين · ~65 دقيقة
.tb-clock ★: الأسبوع 3 · الدورة 1   (+ [data-deload-running] line when a deload runs)
[▶ ابدأ علوي أ]  .btn.primary.full [data-home-view-exercises] ★
اختر تمريناً آخر ▾  (ghost tiny; chips row .session-chooser-row)
.section «الأسبوع» + .num 0/4 → .week-rail: 7 .week-day ★[data-week-day] with .wd-name and .wd-mark ★ (● trained · ○ today · empty future); line: باقي 4 جلسات
.stats-inline [data-home-stat-tiles] ★: three .stat (.stat-num ★ mono 30, .stat-cap, .stat-sub) — inline, hairline between, NOT tiles; zeros muted (.zero)
.home-v15-spotify [data-home-v15-spotify] ★ one row: music icon + [data-home-spotify-handoff] label + playlist chips
.section «خطة التمرين» → ledger: .ex.plan-row ★ rows: index (mono), .figure.s56, name (latin), meta line (muscle chip · sets×reps · [data-suggested-weight])
```
The rest-day variant keeps the same skeleton with «ارتَحْ اليوم» as h1. No ring.
`[data-home-context]` ★ wraps the pre-workout block so it can order below the runner while a session runs (`body.session-active`).

### Home, in a session (runner)
```
.running-line [data-home-overview] ★: علوي أ · جارية · بدأت 10:17 م   (one line, 13px, centred)
.sess-progress [data-v15-session-progress] ★
.ex.expanded ★ (id ex-<id> ★) = the stage:
  .ex-head: .figure.s72 · .ex-info (h4 > bdi.ltr-run ★ name; meta: muscle chip · sets × reps) · .ex-settings-btn [data-exercise-settings] ★ (the ⚙️ emoji stays — Raed ruled on it three times)
  [data-swap-note] ★ when swapped
  .ex-body: .video-row ★ (tiles 96×60, JN tile accent-outlined) or [data-related-clips]
    .why-weight [data-why-weight] ★ (one line, muted)
    [data-superset] ★ line (+ [data-superset-go] in manual mode)
    .set-grid-headers then .set-grid ★ rows [data-session-set-row][data-set-kind] ★:
      .set-num (W mark on ramp rows) · weight input [data-runner-weight-input] ★ .num · reps input .num · .set-check ★ (aria-pressed)
      the FIRST incomplete working row gets .current: accent inline-start bar, inputs 56px/28px, subtle --glow
      .done rows: good tint, inputs stay editable; .warm rows: compact (44px) and muted; .extra rows: dashed start bar; .skipped: struck
      [data-ramp-effort] ★ / .effort-strip ★ (hidden attr contract) holding .effort-picker ★ → now a .seg of three words, no emoji
    [data-reps-goal] ★ · [data-prescribed-effort] ★ · .last-time ★ — three quiet lines under the grid
.runner-nav: [data-runner-prev] ★ default btn + next/finish primary
.session-close: [data-finish-session] ★ (last exercise only) + [data-discard-session] ★ ghost danger tiny
[data-session-done] ★ panel when everything is resolved
```
Warm-up phase (`ui/warmup.js`): `.warmup-phase` ★ with two `.warmup-step`s,
`.warmup-minute-picker` ★ as a `.seg`, `.warmup-drill-row` rows with `.warmup-drill` ★
(tick button: `.drill-name`, `.drill-reps.num`, `.drill-tick`) and the drill's clip
tile beside it; primary CTA; `[data-warmup-skip]` ★ ghost.

### Coach (`ui/coach.js`)
h1; `.coach-ask [data-coach-ask]` ★ with `.coach-input [data-coach-input]` ★ and
`[data-coach-submit]` ★ (primary, 48px, inside the same field row); when answered the
head collapses (class `answered`) but the field stays. Idle: «جرّب» chips, «سألت
قريباً» `[data-coach-recent]` chips, `.coach-scope [data-coach-scope]` ★ footer.
Answer: `.coach-answer [data-coach-answer]` ★ reads like a document (16px/1.75,
`.coach-answer-text` ★ with `.coach-cite` ★ superscript marks), `[data-coach-web]`,
`[data-coach-unanswered]`, `[data-coach-restored]` ★, passages as `.coach-passage
[data-coach-passage][data-coach-cited]` ★ rows (source line → `.coach-text` ★,
`.clipped` fade, `[data-coach-expand]`, `[data-coach-lang]`), `[data-coach-more]`
details, `[data-coach-context]` ★ row with its toggle ★. Error states keep their
`data-coach-*` hooks.

### Library (`ui/library.js`)
h1 + count; `.search-input` (48px, leading magnifier icon drawn in CSS, no emoji);
«+ تمرين مخصص» as a `.btn` default (not a 56px primary slab); groups as
`.lib-group` details ★ with `.lib-group-summary` (label + `.count.num`) — no emoji;
`.lib-sub` details; exercises as `.ex` rows (`.figure.s40`, name, muscle) expanding
to clips (`.video-row`, `.video-thumb-wrap` ★, `.video-toggle`), alternatives
`.alt-row` chips, and the action buttons. Custom-exercise modal is a sheet with
`.field`s; all copy via locale keys.

### History (`ui/history.js`)
h1 + count; bodyweight row (`#bw-input` + button) as one `.row`; sessions grouped
by month (`.eyebrow` month label), each `.history-card` ★ is a `.row.is-button`:
`.date` ★ (mono day + weekday), title (session name — never «undefined»: fall back
to the programme name, then to «جلسة»), `.summary` (sets · kg in mono) and a 3px
`.history-bar` proportional to the max tonnage in view. Expanded panel lists
exercises (`strong` name: sets in mono), `[data-reopen-session]` ★ and
`[data-delete-session]` ★.

### Settings (`ui/settings.js`)
`.page-header` h1; groups as `details.settings-disclosure [data-settings-disclosure]` ★
(all collapsed ★, nothing loose above them ★): summary = `.sd-icon` line icon ·
`.sd-text` (`.sd-label`, `.sd-hint` ★) · chevron. Inside: `.setting-row`s as `.row`s
with the control trailing; every On/Off becomes `.switch` (same `data-*`);
theme/skin as `.seg` + `.skin-picker` swatches ★; music `.platform-picker` as a
`.seg`; Cloud & Data: `.sync-status` ★ + `.cloud-actions` as a 2-column `.xs-grid`;
coach card with `.spend-row` mono figures; Help as prose with h3s. All copy via
locale keys (this screen has ~40 English literals — fix).

### End (`ui/end.js`)
`.session-end`: drawn check (SVG stroke, 64px, animates once), h2, subtitle,
`.stats-grid` of three `.stat` (mono), `.pr-card` list, `.reminder` line,
`.wellbeing [data-wellbeing-check]` ★ chips `[data-wellbeing-sign]` ★ + `[data-wellbeing-save]` ★,
`.next-up`, `.end-cta` two buttons. Copy via locale keys.

## 7. Motion
`--dur-fast` 120ms, `--dur` 200ms, `--dur-slow` 320ms, ease `cubic-bezier(.2,.8,.2,1)`.
Set check: scale 0.9→1 pop + fill. Rest dock: translateY in. Page switch: 140ms
fade. Sheet: slide-up 240ms. `prefers-reduced-motion`: everything instant.

## 8. Do not
- No emoji anywhere except the exercise gear ⚙️ (Raed's explicit ruling).
- No `style="…"` attributes in renderers; add a class.
- No English literal as a `t()` lookup; add a semantic key to `locale.js` (with its
  `en` source) and use the key.
- No `.card`. No box shadows outside §4's list.
- Never remove a control, a clip, a setting or a `data-*` hook. Move, restyle, regroup.
