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
**It is a message, not a tap target**: `pointer-events` stays `none` even when
shown, restored only on its own buttons — measured 2026-09-23, the 9s undo toast
covered both `.end-cta` buttons (hitH 0) and the centre of «تم» hit-tested to
«تراجع», so the tap that saved the session reopened it. And when it does land on
a control it hops above it by its MEASURED overlap (`--toast-lift`, written by
`core/dom.js`; one hop, capped at 160px), so he can see the button he is
reaching for. Any toast raised by hand rather than through `toast()` must call
`syncToastClearance()` after adding `.show`.

Rest dock `#rest-timer.rest-timer` — full-width bar docked above the tab bar:
`.rt-ico` · `.rt-time.num` (30px mono) · `.rt-bar` (draining track, `--p` custom
property 0–1) · `#rest-cancel.rt-cancel`. Slides up on show. Ids are fixed.
Shown on every page EXCEPT the runner; `body.rest-docked` then reserves its
MEASURED height (`--rest-dock-h`, written by `core/rest.js`) as bottom padding,
so no control can sit under it.

Rest row `.rest-row [data-rest-inline]` ★ — the runner's countdown, IN FLOW, one
hairline row between the set grid's quiet lines and `.runner-nav`: `.eyebrow`
«راحة» · `.rt-time.num` at **20px** (a line in the ledger, not the dock's
billboard 30) · the same `.rt-bar` drained by `--p` · a 40×40
`[data-rest-cancel].rt-cancel` at the end edge (48px hit area). Ink on paper —
`var(--text)` on `var(--bg)`, no slab, no shadow, accent ONLY on the draining
bar, the one live thing. Always in the DOM while he is lifting and `hidden` when
no rest runs, so starting a rest never re-renders the card he is typing into.
Both surfaces carry `[data-rest-surface]` and are painted from the single
`restTimer` in `core/rest.js`, so they can never disagree; cancel from either
cancels both. Raed 2026-09-23: the fixed dock landed on «التمرين التالي» /
«أنهِ الجلسة» at every scroll position (measured 390×844: dock 712–772, nav
743–787) — «ما أقدر أروح للـnext ... خصوصًا في آخر عدة».

And because the row makes the page ~56px taller at exactly that moment, the
transition into rest also brings `.runner-nav` clear of the TAB bar — measured
with the dock already hidden: still at scrollY 0, nav 799–843 under a tab bar
topped at 776, `elementFromPoint` = `BUTTON.tab` for both buttons. One scroll,
on the transition only, and only while the nav is actually covered — the same
contract `revealEffortStrip()` has kept for the effort picker since v15.

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
Raed 2026-09-08: the next/previous pair stays IN FLOW at 44px (never docked); «تجاهل الجلسة» lives in the session header (`.running-line`, end edge); on the last exercise the nav's primary IS `[data-finish-session]` ★ — one place.
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
.rest-row [data-rest-inline] ★ — the countdown, in flow; hidden unless a rest is running (the fixed dock never floats over the runner)
.runner-nav: [data-runner-prev] ★ default btn + next primary, or [data-finish-session] ★ primary on the last exercise
.running-line carries [data-discard-session] ★ (ghost danger tiny)
[data-session-done] ★ panel when everything is resolved
  .eyebrow «مدة الجلسة» then .session-done-time.num ★ — a CLOCK reading, m:ss under
  an hour and h:mm:ss over it (Raed 2026-09-22: «not 80 min, 1:20»). `.num` is
  correct here and only here on this line: the content is pure Latin digits and
  colons, so LTR keeps the groups in order. Never reintroduce «45 دقيقة».
[data-cardio-block] ★ — the cool-down, between the summary and the save
```
Cool-down (`ui/cardio.js` + `domain/cardio.js`): `.cardio` ★ opens with a hairline,
not a card. `.section-head` (eyebrow «التهدئة» + the best `met_minutes` to beat) ·
`.cardio-target [data-cardio-suggestion]` ★ — the block's ONE accent, a soft accent
field like `.superset-note`, never a coloured rail (the rail marks the live set and
one mark may not carry two meanings) — with `[data-cardio-apply]` ★ ·
`.cardio-step-block`s for المدة (a `.seg` of 10/15/20/25/30), الأساس — a
`.cardio-block-head` of «الأساس» plus `[data-cardio-pace]` ★ («المشي» / «الهرولة»),
then `[data-cardio-field="base_speed"]` ★ and `="incline"` ★, unit in the LABEL so it
cannot drift to the far edge of the field — and الانطلاقات (a `.seg` of seconds plus
`.cardio-stepper` ★ and `[data-cardio-field="burst_speed"]` ★) ·
`.cardio-ideal` the solved grade for a WALK, or `[data-cardio-base-fact]` ★
«الأساس هرولة · 9.7 MET» for a jog · `[data-cardio-totals]` ★ repainted IN PLACE while
he types (a full render would take the caret with it) carrying `.cardio-total-main`,
`[data-cardio-versus]` ★, `[data-cardio-band]` ★ (`under` | `in` | `over`, walk only)
and `[data-cardio-overfilled]` ★ · `.cardio-actions` — a
compact ROW of `[data-cardio-log]` ★ and `[data-cardio-skip]` ★, deliberately not
`primary full`, because the one primary action on this screen is finishing the
session. Logged state collapses to `[data-cardio-logged]` ★ + `[data-cardio-edit]` ★.

Round 5 (Raed 2026-09-23, «الوحدة ميل»): **the unit is mph**, `settings.speed_unit`
defaults to `'mph'` and is switched by the `.seg` `[data-speed-unit]` ★ in Settings,
which CONVERTS the live bout's speeds and says so in a toast. His 5.1 base is
137 m/min — a jog — so the pace label, the equation, the band verdict and the
progression order all fork on `paceKind()`: a jogged base gets the MET fact and no
Zone 2 verdict, and its ladder is duration → bursts → burst speed → grade last,
capped at 4%. Distance is stored in km and printed in his unit («1.35 ميل»).
The block's intro defines its coined unit ONCE — `[data-cardio-effort-def]` ★
«الجهد = الشدة × الدقائق (MET-min)» — written with a hyphen, not a middle dot,
because `LTR_RUN` has no `·` and the split strands the «(» for the bidi algorithm to
mirror. A field he CLEARS is not a zero: `[data-cardio-incomplete]` ★ «أكمل الأرقام»
replaces the totals and `[data-cardio-log]` is disabled.

`.cardio-summary-line [data-cardio-summary]` ★ — the one line that carries the bout
off this screen: «التهدئة · 15 دقيقة · 1.35 ميل · 153 نقطة جهد», `.beaten` when it
beat every bout before it. It sits under the end screen's `.stats-grid.four` (which
gained the session clock as a fourth `.stat`, `session_duration`, mono step-down one
notch lower because four cells are 88px at 390px) and `.muted` on each history row.

The lifting's last tick starts NO rest and cancels a running one (`ui/exercise-card.js`,
round 5): a rest is for the set that follows it, and after the last exercise what follows
is the done panel and the cool-down. The dock must never sit on that form.

Warm-up phase (`ui/warmup.js`): `.warmup-phase` ★ with two `.warmup-step`s,
`.warmup-minute-picker` ★ as a `.seg`, `.warmup-drill-row` rows with `.warmup-drill` ★
(tick button: `.drill-name`, `.drill-reps.num`, `.drill-tick`) and the drill's clip
tile beside it; primary CTA; `[data-warmup-skip]` ★ ghost.

### Coach (`ui/coach.js`) — a notebook of what he asked
Idle: `.page-header` h1 · the composer (`.coach-ask` with `[data-coach-input]` ★ + `[data-coach-submit]` ★; in a session `[data-coach-context]` ★ with its toggle sits above it) · one horizontally scrolling `.coach-chips` row (`[data-coach-recent]`: the three suggestions plus recent questions that have no kept answer) · the log `.section` «سألت قبل» — `state.coach_log`, the last 12 successful answers (`core/coach.js`, capped at 60 KB), as `.list > .row.is-button` (question · answer snippet + `.coach-tag` من كتبك/من الإنترنت · date `.num`). Empty log → `[data-coach-scope]` ★ as the honest empty state (kept in the DOM in every idle state).
Answer (fresh or from the log): the question as an `.eyebrow`; `article.coach-answer [data-coach-answer]` ★ (+ `.from-web` / `.unanswered`); sources as `.coach-passage [data-coach-passage][data-coach-cited]` ★ rows with `.coach-text` ★, `[data-coach-expand]`, `[data-coach-lang]`, `[data-coach-more]`; a log entry carries `[data-coach-restored]` ★ semantics («جواب عندك من قبل» + «اسأل شيئًا جديدًا»); a fresh answer gets `.coach-back`; the composer is reachable again in a «سؤال آخر» section — exactly ONE `[data-coach-input]` in the DOM at any time. Error states keep their `data-coach-*` hooks.

### Library (`ui/library.js`) — a catalogue
`.page-header` (h1 + count `.num`) · one `.search-row` (filters instantly, the input never re-renders) · a scrolling `.lib-filters` rail of `.chip`s («الكل» + the four parts, counts in `.num`, one `.active`) · one `.section` per muscle in `LIB_HIERARCHY` order (`.section-head` eyebrow + `.num`) of `.list > .row.is-button.ex` rows: `figure(…,'s40')` · Latin name in `bdi.ltr-run` + Arabic hint · clip count `.num` · chevron; custom exercises carry a «مخصص» mark. Tapping a row opens the exercise sheet (`#modal`): `.xs-head` + muscle tags → `.cue` → clips with their show/hide toggles (`.video-thumb-wrap` + `.video-toggle`) → `.xs-grid` actions (add clip · edit JN) → «تمارين مشابهة» chips that open THAT exercise's sheet → delete for custom ones → `.xs-done`. «+ تمرين مخصص» is a `.btn.full` after the last section. Empty search → `.empty`.

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
