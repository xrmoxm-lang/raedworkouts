# Round 5 — Fable's design brief (2026-09-23)

Raed, in his words: «بالنسبة للوقت العداد، يصير تحت، ما أقدر أروح للـnext، التمرين
الثاني، خصوصًا في آخر عدة. ما أدري إذا في طريقة أجمل وأذكى.» And: review the round-4
cool-down design. Both are design decisions; this file is the contract the fixers
implement against. `DESIGN-SYSTEM.md` remains the authority on everything not said here.

## A. The rest countdown moves INTO the runner — no dock over the Next button

**Diagnosis (measured, not guessed).** `#rest-timer` is `position: fixed`, ~60px tall,
parked 10px above the 62px tab bar. `body.resting` is set while it shows and NOTHING
reserves space for it: the page's bottom padding is `nav-h + safe + 24px`, so the dock
covers the last ~60px of content. `.runner-nav` is in flow at the bottom of the card,
directly under the set grid. Ticking the LAST set starts the rest, the dock animates in,
and it lands on the Next button. `revealEffortStrip()` already knows the dock is an
occluder and scrolls the effort picker clear of it; the nav never got the same care.

**Why not just scroll the nav clear?** Because the rest and the Next tap are the same
moment for him: he rests, then he goes. A fixed bar that floats over a scrolling page
will always be on top of something, and "scroll it out of the way" is the app asking him
to do its layout. The smarter thing is to stop floating.

**Design.**
1. While a session is running and `#page-home` is the visible page, the countdown
   renders **in flow inside the expanded card**, as one hairline row between the set
   grid's quiet lines and `.runner-nav`:

   ```
   ─────────────────────────────────────────  hairline
   راحة   1:32  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░   ✕
   ─────────────────────────────────────────
   [ ← السابق ]   [ التمرين التالي → ]        ← untouched, stays put, stays small
   ```
   - `.rest-row [data-rest-inline]` ★: label `.eyebrow`-weight «راحة», time `.rt-time.num`
     at **20px** (not the dock's 30 — it is a line in the ledger now, not a billboard),
     the same `.rt-bar` drained by `--p`, and a 40×40 `.rt-cancel` at the end edge.
     Ink on paper: `var(--text)` on `var(--bg)`, accent ONLY on the draining bar, which
     is the one live thing. No black slab, no shadow, no animation beyond the bar.
   - It is rendered by the runner (`ui/exercise-card.js` / `ui/home.js`) from the single
     source of truth `restTimer` in `core/rest.js`; `core/rest.js` updates every
     `[data-rest-surface]` on each tick (`.rt-time`, `.rt-bar`'s `--p`), so the dock and
     the row can never disagree. Cancel from either cancels both.
   - When rest ends the row disappears and nothing shifts except that row's own height.
2. **The fixed dock is hidden while the inline row is connected and visible** (`body.resting`
   + the row is in the DOM + `#page-home` is current). On every other page (coach,
   library, history, settings) the dock stays — there is nothing under it to cover, and it
   is how he knows he is still resting.
3. **Guard rail regardless:** `body.resting` adds bottom padding equal to the dock's
   rendered height on pages where the dock IS shown, so no control can ever sit under it
   again. Measure the dock; do not hard-code 60.
4. **Tests that must exist and must FAIL without the change** (mutation-check them):
   - 390×844, seeded session, tick the last working set of an exercise → `body.resting`
     is true → the Next button's centre resolves to ITSELF via `elementFromPoint` (not the
     dock, not the tab bar), and its rect sits above the tab bar's top.
   - The inline row shows the same `m:ss` as `restTimer` and its cancel clears the rest
     (`restend` key removed, `body.resting` off).
   - Navigate to `#coach` mid-rest → `#rest-timer` is visible; back to `#home` → hidden,
     row visible.
   - Reload mid-rest on `#home` → the row resumes with the persisted deadline.
5. The Live Activity contract (`core/native.js`) is unchanged: the Island already shows
   the countdown; this is the in-app surface only.

## B. Review of the round-4 cool-down (Opus's design) — keep it, close four gaps

The block is right in kind: hairline-contained, one accent (today's change), mono
numbers, a compact action row, the primary action left to «أنهِ الجلسة». Keep the
ACSM scoring exactly as built. Four things are missing or wrong:

1. **A setting with no control.** `settings.speed_unit` ('kmh'|'mph') exists and nothing
   lets him change it — the same defect class as the PR-summary switch that was read by
   nothing. Add a `.seg` «كم/س | ميل/س» in Settings beside the weight unit (`kg | lb`),
   and have the cool-down field labels read the live value. Switching units must NOT
   silently rescale the numbers he already typed — convert them (5.1 km/h ↔ 3.2 mph)
   with one toast saying so, or leave them and relabel; pick convert, it is what a
   treadmill does.
2. **He logs it and never sees it again.** The end screen (`ui/end.js`) shows sets ·
   reps · volume and nothing about time or cardio. Add a fourth `.stat` with the session
   clock (`fmtElapsed(started_at, ended_at)`, mono, `.num`), and under the grid one quiet
   line when `s.cardio.completed_at`: «التهدئة · 15 دقيقة · 1.35 كم · 76 نقطة جهد» with
   a `.beaten` accent if it is a new best. History rows (`ui/history.js`) get the same
   line, muted. The archived `ended_at − started_at` already includes the cool-down —
   that is correct, the session includes it; say nothing that contradicts it.
3. **«نقطة جهد» is a coined unit.** Keep it as the short label (it reads as a score, which
   is how he will use it), but the intro line must say once what it is:
   «الجهد = الشدة × الدقائق (MET·min)». Honest, one line, then never again.
4. **Blank and NaN inputs.** `numField` writes `''` into the model when he clears a box;
   `boutTotals` then computes with 0 speed and prints a total of a bout that does not
   exist. When any of base speed / incline / burst speed is blank, the totals area shows
   one muted line «أكمل الأرقام» and the Log button is disabled. `defaultCardio(unit)`
   uses the `unit` argument for the mph defaults but the caller passes
   `settings.speed_unit` which may be undefined on an older settings blob — normalise
   before use.

5. **The unit is mph — Raed decided it on 2026-09-23, and it changes the coaching.**
   Default `settings.speed_unit` becomes `'mph'`. His real numbers ARE mph: base 5.1,
   bursts 7.3. So `defaultCardio('mph')` = base 5.1, incline 2.5, 4 × 30 s at 7.3, and the
   km/h defaults become the SAME speeds converted (8.2 and 11.7) — switching the unit must
   never change the workout, only the numerals. `speed_unit` may be undefined on an older
   settings blob; normalise to `'mph'`.
   - 5.1 mph is 137 m/min, above the walking equation's 100 m/min ceiling. His base is a
     **jog**, scored by the running equation at about 9.7 METs — nowhere near the 5.5-MET
     walking band, which is the wrong ruler for it. Add `paceKind(speed, unit)` →
     `'walk' | 'run'`. The base section is titled «الأساس»; its pace label reads
     «المشي» for a walk and «الهرولة» for a run.
   - The Zone 2 band and the solved grade apply ONLY to a walking base. For a running
     base print one quiet fact instead — «الأساس هرولة · 9.7 MET» — and no band verdict,
     no ideal-grade line. For a walking base the band verdict needs THREE states: under,
     in, over. Today `cardio_below_band` is printed for "over", which is a lie.
   - Progression for a running base: duration to 30 → bursts to 8 → burst speed →
     grade LAST, capped at **4%** (calf and Achilles load at a jog). A walking base keeps
     the current order and the 10% cap.
   - Distance is STORED in km (a fact about the ground) but DISPLAYED in his unit:
     «0.84 ميل» when mph. Best-bout comparison stays in `met_minutes`, which is unitless.
   - Tests: with mph defaults the first suggestion is duration, not incline; the base label
     says «الهرولة»; converting 5.1 mph → km/h → mph round-trips within 0.05; a walking
     base at 3.0 mph still gets the solved grade and a three-state verdict.

Also worth a look, not a mandate: the stepper reads − 4 + with − at the start edge
(right, in RTL). Mirroring is defensible; if a probe shows him reaching across the
number to add a burst, put + at the start edge instead.

## C. Rules for every agent in this round
- Work only in `/Users/raedmohammed/RaedWorkoutsV2/worktree-v17`. `native/App/www` is
  generated (`native/Tools/sync-www.sh`) — never edit it; Fable syncs at the end.
- **No git.** The git dir lives under `~/Documents`, which this terminal cannot read
  (macOS TCC). Edit files; do not stage, commit, stash, or create worktrees.
- **The package-manager name blocks Bash.** A hook refuses any command line containing
  that three-letter token, in content too. Run tests as
  `node --test tests/*.test.mjs` and
  `node node_modules/@playwright/test/cli.js test <spec> --project=app --reporter=line --workers=1`.
  Playwright starts the two local servers itself.
- **Browser probes only through the fence.** A probe is a spec under `tests/` named
  `zz-probe-*.spec.mjs` that imports `{ test, expect } from './_fixtures.mjs'` AND, before
  `page.goto`, aborts `https://raed-hp.tail53bd35.ts.net/**` and
  `https://raed-hp.tail53bd35.ts.net:8443/**` with `page.route`. A unit gate enforces the
  second fence. Never open the app any other way; never sign in as «Raed» outside the
  fixture; a probe once wrote a phantom session into his live cloud row. Delete every
  `zz-probe-*` spec before you finish.
- 390×844 is his phone. Geometry, contrast and hit-area claims carry measured numbers or
  they are not findings.
- Read `DESIGN-SYSTEM.md`, `DECISIONS.md` and the tail of `../V17-CHECKLIST.md` before
  judging anything. Comments beginning «Raed:» record his rulings; a ruling is not a bug.
- Every fix ships with a test that fails without it. Break the code, watch the test fail,
  restore it. A test that passes both ways is the broken thing.
- House style: explanatory comments that say WHY and cite the source (a research file, a
  ruling, a measured number). Arabic copy only via `t('semantic_key')` in `locale.js`.
