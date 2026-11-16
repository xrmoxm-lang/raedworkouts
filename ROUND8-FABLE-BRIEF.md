# Round 8 — Fable brief (2026-11-16)

Raed's voice note, in his words: «إحنا في الويك السادس لكن الحقيقة ما سويت تمارين… سوينا داون جريد…
جالسين نغير الـexercises… we shouldn't change the exercises… ودي نعيد الخمسة weeks، وكيف السجل…
Stick to the similar exercises… حرج جدا جدا» and «أبغى تدرج واحد في كل التمارين، إلا التمرين الأول
هو الوحيد اللي تدرجين… ما نحتاج التدرج ونضيع وقتنا».

## What his log says (live row, read-only, 21 sessions, 2026-08-29 → 2026-11-16)

- The clock is `floor(sessions / 4)`: 21 sessions ⇒ week 6, Block B. It took him 11.5 calendar weeks.
- Rotation was not followed: Upper A ×8, Lower A ×5, Upper B ×4, Lower B ×4 (one abandoned after 1 set).
- `triggered_deload = { week_id: "1:5" }` fired on 2026-09-27 (no_motivation + detected strength_loss).
  So sessions 17–20 were DELOAD sessions — and the deload block is built from **Block B rows**, so the
  exercise swap and the set cut arrived in the same session. That is the «لخبطة» he describes.
- Session 21 (today) is the first full Block B session.

## Three changes. Nothing else.

### 1. Restart the mesocycle, keep the log — `state.programme_restart`

New optional state field: `programme_restart: { at: <ISO>, cycle: <int> } | null` (default `null` in
`defaultState()`).

- `completedSessionCount()` (core/engine.js) counts only rotation sessions whose `started_at` is
  **later than** `programme_restart.at` when the field is set. History itself is never touched —
  prefill, «السجل السابق», PRs, volume, the inferred equipment step all keep reading every session.
- `derivedCycle()` = `(programme_restart?.cycle || 1) + floor(weekIndex / cycleLength)`. So a restart
  shows «الأسبوع 1 · الدورة 2», and week ids become `2:1…`, which cannot collide with the old
  `1:x` wellbeing rows or the stale `triggered_deload "1:5"`. Do NOT clear those rows; they are history.
- Find EVERY consumer of the session count / week index (`weeksElapsed`, `reportedWeekIndex`,
  `currentTrainingWeek` and whatever slices history to draw this week's strip on Home) and make them
  agree. A strip that still shows «1 of 4 done» from pre-restart sessions is the bug to look for.
  The session ROTATION (`nextHistoryDrivenSession`) stays history-driven and is not reset: after
  today's Lower A the next session is Upper B.
- The action: `restartProgramme()` in core/engine.js sets
  `{ at: new Date().toISOString(), cycle: derivedCycle() + 1 }`, clears `forced_next_session`
  only if it names a session the new block lacks, `saveLocal()`s. If a session is active it refuses
  (return false) — the UI disables the button with a hint while a session runs.
- UI (my design, do not improvise): ⚙️ → «البرنامج» disclosure, a second `row()` under the split row.
  Label «إعادة الدورة», sub-line «يرجع إلى الأسبوع 1 بنفس تمارين البداية. السجل والأوزان تبقى.»,
  control = the existing secondary/quiet button from `ui/kit.js` (NOT the danger style — nothing is
  deleted) reading «ابدأ من الأسبوع 1». Tap → `confirmAction({ title: 'تبدأ من الأسبوع الأول؟',
  body: 'يرجع البرنامج إلى الأسبوع 1 والتمارين الأولى. سجلّك وأوزانك كما هي، ولا يُحذف شيء.',
  confirmLabel: 'ابدأ من جديد' })` → on confirm: restart, toast «بدأت الدورة {cycle} — الأسبوع 1»,
  re-render Settings and Home. All copy goes in `locale.js` as `{ en, ar }` pairs; the Arabic gate
  must pass. Tap target ≥44px.
- Merge, both halves, same rule: **the `programme_restart` with the later `at` wins, from either
  side** — `domain/state-merge.js` `mergeLocalStates` and `server/raedsync.py` `merge_states`
  (check `sanitize_state` does not strip the key). Without this a stale device whose push is
  "newer" silently undoes the restart. Server unit test + client unit test.

### 2. Ramp sets — his ruling overrides research/20 §8.4's counts

Only the FIRST exercise of a session has 2 ramp sets. Every other row has at most 1 (rows that are 0
today — the ab movements — stay 0; he said «ما نحتاج التدرج ونضيع وقتنا», so nothing goes UP).
In `data.js` that is order-2 of each of the four sessions in `UPPER_LOWER_BLOCK_A_ROWS`: `2 → 1`.
Block B / C / deload inherit. Confirm the single ramp then lands on 60% (the 1-set rule in
`rampLoadsFor`, research/07 §2.2), not 50%. Update the comment at core/session.js:105 and any test
or doc that pins «2 on the openers» — assert the SHAPE (order 1 ⇒ 2, everything else ⇒ ≤1), not a count.

### 3. A triggered deload keeps the CURRENT block's exercises

`getActiveProgramme()` sends a triggered deload to the DELOAD block, which is Block B's rows. A
trigger in weeks 1–4 would therefore swap his isolation exercises mid-block — the exact thing he
just asked us never to do, and against [LADDER] L9842 («same exercises») which data.js already quotes.
Fix: in data.js give every non-deload block a `deload_sessions` built from ITS OWN rows through the
existing `deloadOverlay`; a triggered deload resolves the block for `derivedWeek()` and uses that
block's `deload_sessions`. The week-12 backstop block is unchanged. The clock still does not move.

## Rules for the worker

- You implement; **you do not commit, deploy, push, bump the native build, or touch the HP server.**
  Fable reviews the diff and ships.
- Each change gets a test that FAILS on the old code first (say so in your report, with the failing
  output line). Mutation-check at least the restart count and the merge rule.
- Bump `sw.js` VERSION to `v120` and every asset version string that the deploy gate checks.
- Record three entries in `DECISIONS.md` (next free D numbers) with his words quoted.
- Gate, all of it, and paste the tallies (never type the package-manager name — a hook blocks it):
  `node --test tests/*.test.mjs` · `node scripts/lint-contrast.mjs` · `node scripts/verify-arabic-ui.mjs` ·
  `node scripts/verify-coach-ai.mjs` · `node scripts/verify-phase3-identity.mjs` ·
  `python3 -m unittest discover -s server/tests -t .` ·
  `node node_modules/@playwright/test/cli.js test --grep-invert "Deploy PWA"`.
  Before the browser run: make sure no stray server holds :8877 (`lsof -i :8877`).
- **Every browser run uses the fence** (`tests/_fixtures.mjs`: `serviceWorkers: 'block'` + the
  context route that continues only localhost). Never open the live site, never sign in as «Raed»
  outside the fence, never call the sync host. A probe once wrote to his live row.
- Do not delete or redesign anything not named here. Do not touch `native/App/www` (Fable syncs it).
- Report back: files changed, the three fail-first proofs, gate tallies, and anything you found that
  contradicts this brief (the code wins — tell me, do not paper over it).
