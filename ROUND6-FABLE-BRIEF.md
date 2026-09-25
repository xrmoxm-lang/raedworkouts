# Round 6 — Fable's brief (2026-09-25)

Raed's voice note, enumerated. Roles he set today: **Fable does every design item; Opus does
the rest; Codex audits the last two chats for promised-but-undone work.** Nobody but Fable
commits or deploys. `DESIGN-SYSTEM.md` stays the authority on anything not said here.

| # | His words (paraphrased) | Owner | Status |
|---|---|---|---|
| 1 | Home: the numbers under «المواظبة» / «هذا الأسبوع» are not centred — intentional? | Fable | see §A |
| 2 | Codex reviews the last TWO chats: what did we plan and never do? | Codex | running |
| 3 | Progressive overload must know the MACHINE and its number. Whole gym is **Matrix**, all in kg, sometimes «.5» | Opus | §D |
| 4 | Reps: show last time's count — «ignore this, the آخر مرة line is excellent» | — | closed by him |
| 5 | Finish design: focus on TIME (how long it took); is that negative? | Fable | §B |
| 6 | Workout time in HOURS (1:20, not 80 min) | Fable | §B/§C |
| 7 | Post-cardio (التهدئة) was not there | Fable | §B |
| 8 | The «تراجع» undo after ending a session: remove it completely | Opus | §E |
| 9 | The timer design: a FLOATING thing he can drag left/right, like a small circle, cleaner | Fable | §C |

## A. Home stat tiles — centre them (Fable)
Measured on 390×844: `.stats-inline .stat` is start-aligned with `padding-inline-start:14px`
on tiles 2–3 and 0 on tile 1, so each «0» sits at a different offset from its hairline and the
label under it is pinned right. It was the ledger convention, not a decision about numbers.
His eye is right: a number over a caption reads as a column and a column is centred.
**Rule:** `.stats-inline .stat { text-align:center; padding-inline:0 }` and the end screen's
`.stats-grid` keeps its (already centred) treatment. No other change.

## B. The finish — time is the hero, the cool-down is on it, no undo (Fable)
Is focusing on time negative? **No, as long as time is never the goal.** Duration is the one
number he FEELS, and he asked twice for it. The risk is a screen that rewards long sessions;
so the clock sits with the ledger (sets · reps · kg), the coach never praises duration, and
nothing on the screen says «longer is better».

`ui/end.js` is rebuilt (the check-circle hero is the generic success pattern, gone):
1. **Hero = the clock.** `h:mm:ss` (`fmtElapsed`) at 44px mono accent, eyebrow «مدة الجلسة»
   above, session name · date below. One number, the way the done panel already does it.
2. **Ledger** — three cells (مجموعات · تكرارات · الحجم بالكغ), centred, hairlines.
3. **التهدئة — ALWAYS a line.** Three states: logged → `cardioSummaryLine` with the accent
   when it beat every bout before; skipped → «تخطّيت التهدئة» muted; **not decided** (he hit
   finish without touching it) → a `.btn` «سجّل التهدئة» that mounts the same
   `renderCardioBlock` form inline on the end screen and writes into the archived session
   (`state.history` entry by `uid`), then re-renders. That is the «ما حطينا الـpost cardio».
4. PR card, weekly wellbeing check, next-up, and the two CTAs stay; the motivational line
   moves under the ledger in `.tiny.muted`.
5. **No toast on finish, no undo.** (§E, Opus.)
The done panel (`buildSessionDonePanel`) keeps its clock; only its caption spacing follows.

## C. The floating session clock — replaces BOTH the dock and the in-flow row (Fable)
His words: «أحب الديزاين floating وأقدر أحركه يمين، يسار … زي الدائرة صغيرة … أنظف وأرتب».
Round 5 put the countdown in flow because the dock covered Next; a draggable circle that he
parks where he wants is the other honest answer, and it also gives him **elapsed time in
hours on every screen** (#6).

1. `#session-clock` — one fixed element, **56px circle**, `z-index: var(--z-rest)`, present
   whenever `state.active_session` exists (any page), absent otherwise. Default anchor:
   bottom-start, 12px above the tab bar; position persisted per user (`nsKey(...,'clockpos')`).
2. **Two faces, one element.** Not resting → session elapsed `h:mm` (0:42, 1:12), 15px mono,
   ink on `var(--surface)` with a hairline ring. Resting → the countdown `m:ss`, 17px mono,
   and the ring becomes the draining bar (`stroke-dashoffset` from `--p`), accent stroke;
   at 0:00 the same `toast(t('rest_done'))`/vibrate/notification path as today.
3. **Drag** with Pointer Events, threshold 6px; released → snaps to the nearer horizontal
   edge, clamped to `[header bottom + 8, tab-bar top − 8]`; `touch-action:none`; the position
   survives reload. A tap (< 6px, < 300ms) toggles an **expanded pill** beside the circle:
   «راحة 1:32 · +30 ث · تخطّ» while resting, «الجلسة 1:12 · بدأت 3:15 م» otherwise. Outside tap
   or 4s collapses it.
4. `core/rest.js` keeps ONE timer; `paintRestSurfaces()` paints `[data-rest-surface]` and the
   circle is the only remaining surface. `syncRestSurfaces()` no longer toggles `rest-inline` /
   `rest-docked` / `--rest-dock-h`; `body.resting` stays (native + tests read it).
   `revealRunnerNav()` goes with the row it served. The Live Activity contract is untouched.
5. The runner's `.runner-nav` stays exactly where it is (his 2026-09-08 ruling: static, small).
   The circle must never be over `.runner-nav`'s buttons or the tab bar at its default
   anchor — proven by `elementFromPoint` at both buttons' centres at scrollY 0 and max.
6. Tests (`tests/round6-clock.spec.mjs`, fenced fixture, 390×844): circle absent with no
   session; present on `#home`, `#coach`, `#history` with one; shows `m:ss` matching
   `restTimer` while resting and drops back to elapsed after cancel; drag 200px right →
   snapped to the end edge and the stored position survives reload; both nav buttons resolve
   to themselves; `#rest-timer` and `[data-rest-inline]` no longer exist in the DOM.
   Retire the round-5 tests that pinned the row/dock (`round5-runner`, `round5-done-rest`,
   `rest-autostart` assertions on `dockShown`/`inlineRow`) — rewrite, do not delete files.

## D. Progressive overload knows the machine (Opus)
Today `DEFAULT_EQUIPMENT_STEP_KG = 2.5` (`domain/catalogue.js:9`) is the step for EVERY
movement and `data.js` carries no `equipment_step_kg` at all; the clamps (`domain/clamps.js`)
round to that one step and the suggestion text says «أكمل 10 … ليرتفع الوزن» without saying
by how much. His gym is all **Matrix** (selectorized stacks in kg; plate-loaded leg press /
hack squat / T-bar; dumbbells; cables).

1. **Per-exercise `equipment_step_kg` in `data.js`** with Matrix defaults, each with a one-line
   source comment: selectorized stacks 2.5 (Matrix kg stacks are 5 kg plates with the 2.5 kg
   incremental add-weight — verify against Matrix's published specs and cite the page in the
   comment; if the spec says otherwise, follow the spec); dumbbells 2.5 (the rack in KSA gyms
   is 2.5-kg spaced above 10 — but he sometimes logs «.5», so the input keeps `step="0.5"`);
   plate-loaded 2.5 per side ⇒ 5 kg total step (leg press, hack squat, T-bar row, hip thrust
   BB); cables 2.5.
2. **Per-device override in the ⚙️ sheet** (`ui/exercise-card.js` ~line 630, next to the
   device chips): «درجة الجهاز» chips 1 · 1.25 · 2.5 · 5 · 10 كغ + a decimal input, stored
   on `exercise_prefs[id].step_kg` (and per known device: `steps[device]` when a device is
   set). `stepFor(context)` in `domain/clamps.js` resolves pref → data.js → default.
3. **The suggestion states the number**: «أكمل 10 في كل المجموعات → 30 كغ (+2.5)» from the
   resolved step; the ramp sets are rounded to that same step (`roundDownToEquipmentStep`);
   a dumbbell exercise never suggests 27.5 when the rack has no 27.5 unless he set 2.5.
4. `Weight input` already `step="0.5" inputmode="decimal"`; keep it, and make sure a typed
   «12.5» survives every path (it did; add the assertion).
5. Tests: unit (`tests/round6-steps.test.mjs`) for `stepFor` resolution order, rounding of a
   suggestion for a 5-kg plate-loaded row vs a 2.5 stack; browser (fenced) that sets a device
   step to 5 in the sheet and sees the next suggestion move by 5. Each must FAIL without the
   change — break it, watch it fail, restore.

## E. Remove the finish undo entirely (Opus)
`core/session.js:347` — `toast(t('session_finished'), 9000, t('undo'), …)` goes; so does the
toast itself (the end screen IS the confirmation). `lastFinishedSession` and `reopenSession`
stay only if something else calls them (check; the dead-function fence in `tests/videos.test.mjs`
must not widen). The discard undo (line 255) STAYS — his order was the finish one only.
Update `tests/round5-toast.spec.mjs` and anything else that expected «تراجع» after finish;
add an assertion that no `.toast` is visible 1 s after finishing.

## F. Rules for every agent in this round
- Work only in `/Users/raedmohammed/RaedWorkoutsV2/worktree-v17`. `native/App/www` is
  generated (`native/Tools/sync-www.sh`) — never edit it; Fable syncs at the end.
- **No git** for agents: no add/commit/stash/branch. Fable commits.
- **The package-manager name blocks Bash** (a hook). Run tests as
  `node --test tests/*.test.mjs` and
  `node node_modules/@playwright/test/cli.js test <spec> --project=app --reporter=line --workers=1`.
- **Browser probes only through the fence**: a spec under `tests/` named `zz-probe-*.spec.mjs`
  importing `{ test, expect } from './_fixtures.mjs'` AND aborting
  `https://raed-hp.tail53bd35.ts.net/**` + `:8443/**` with `page.route` before `goto`.
  Never open the app any other way; never sign in as «Raed» outside the fixture. Delete every
  `zz-probe-*` before finishing.
- 390×844 is his phone; geometry and hit-area claims carry measured numbers.
- Read `DESIGN-SYSTEM.md`, `DECISIONS.md`, `ROUND5-FABLE-BRIEF.md` §C and the tail of
  `../V17-CHECKLIST.md` first. Comments beginning «Raed:» record rulings; a ruling is not a bug.
- Every fix ships with a test that fails without it. Arabic copy only via `t('key')` in
  `locale.js` (both languages). Comments say WHY and cite the source.
- Do not touch: `ui/end.js`, `ui/home.js` stat tiles, `core/rest.js`, `styles.css` rest/clock
  sections, `index.html` — Fable is editing those concurrently.
- Report back: what changed (file:line), the tests and their fail-without proof, anything left.
