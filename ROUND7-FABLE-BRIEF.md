# Round 7 — Fable's brief (2026-09-28)

Raed after three sessions on round 6. Roles stand: **Fable plans + designs + reviews; Opus does
the work; nobody but Fable commits or deploys.** Rules for every agent: `ROUND6-FABLE-BRIEF.md` §F
(no git, no package-manager name, fenced probes only, never `native/App/www`, tests that FAIL first).

| # | His words | Owner | Section |
|---|---|---|---|
| 1 | «post-workout is named cool-down, which is not — it should be cardio» | Opus-UI | §A |
| 2 | «it seems complicated; I wanted much simpler, uniform» | Opus-UI (Fable's design) | §B |
| 3 | «the Island on the lock screen is not working anymore after the update» | Opus-Native | §F |
| 4 | «warm-up easy/difficult downgrades the weight on only a single set, not the rest» | Opus-Engine | §D |
| 5 | «the timer is small, I cannot notice it; colour/design, a bit bigger» | Opus-UI (Fable's design) | §C |
| 6 | «for Matrix, based on the exercises I'm doing and the history, you should know which is which» | Opus-Engine | §E |

## A. It is «الكارديو», not «التهدئة» (copy)
Everywhere the block is named: `locale.js` keys `cardio_*` — Arabic «الكارديو» (the section head,
the end-screen line, history rows, the «سجّل الكارديو» / «تخطَّ الكارديو» buttons, the «ما سُجّل بعد»
line), English «Cardio». Identifiers, data fields and test ids stay `cardio`. Any Arabic that says
«تهدئة» anywhere in the app copy goes. Check `scripts/verify-arabic-ui.mjs` still passes.

## B. The cardio block, simplified (design — Fable)
Today (measured on his phone): an intro paragraph + a definition sentence, a suggestion box with its
own «طبّقه» button, a 5-way duration control, a base speed + incline pair with a MET note, a 4-way
burst-seconds control, a count stepper, a burst-speed field, a totals block with three lines, then
Log/Skip. Eleven controls for a thing he does the same way every session.

**Principle: the suggestion IS the prefill. On a normal day he taps «سجّل» and nothing else.**

```
الكارديو                                   أفضل رقم 160
اليوم: 20 دقيقة · ميل 3%  (one muted line — the suggestion, already applied)
المدة   [10] [15] [20●] [25] [30]
السرعة ميل/س  [5.1]    الميل %  [3.0]    الانطلاقات  [−] 4 [+]
▸ تفاصيل الانطلاقات   (collapsed <details>: 30 ث · سرعة 7.3)
153 نقطة جهد · 1.35 ميل                     ← one line, mono numbers
[ سجّل ]  تخطَّ
```
1. **Remove**: the intro paragraph, the effort-definition sentence, the suggestion box and its
   «طبّقه» button, the base «MET» note, the «first time / this becomes the bar» sentence, the
   pace-kind label. The suggestion is written INTO the fields when the block first renders for a
   session (`c.applied_suggestion = true` so it is done once; his own edits are never overwritten).
2. **Keep**: duration segmented (same 5 values), speed, incline, bursts count. **Move** burst
   seconds + burst speed into a collapsed `<details class="cardio-more">` «تفاصيل الانطلاقات»
   (summary shows the two current values: «30 ث · 7.3»). Defaults come from the last logged bout.
3. **Totals = one line**: «153 نقطة جهد · 1.35 ميل»; when it beats the best, the line takes the
   accent and «رقم جديد» is appended — nothing else. Best score sits in the header, muted.
4. Buttons: `.btn.primary` «سجّل» (compact, not full width — his «أحب الأشياء صغيرة») + `.btn.ghost`
   «تخطَّ». Logged state and skipped state stay one line each (as today).
5. Same block on the done panel and on the end screen (it is one function). The maths in
   `domain/cardio.js` is untouched. Height on 390×844 must drop from today's ~1,100px to under
   ~520px with the details closed — measure it in the test.
6. Tests: `tests/cardio*.spec.mjs` updated for the new structure; a new assertion that the fields
   are prefilled from the suggestion on first render and that a user edit survives a re-render;
   the height assertion; the details element closed by default.

## C. The rest circle he can see (design — Fable)
He trains on ورق (cream). A 56px cream disc with a 2px ring on cream is invisible in a gym.
1. **72px**, `background: var(--accent)`, digits `var(--accent-fg)` at **22px** mono 600, the ring
   track `color-mix(accent-fg 28%)` and the draining fill `var(--accent-fg)` 3px, `box-shadow:
   var(--shadow-lg)`. Dark themes: same tokens (the accent is already tuned per skin).
2. Constants in `ui/clock.js`: `SIZE = 72`; the SVG viewBox/radius follow (r = 34, circumference
   213.6). Default anchor stays 68px above the tab bar (72px at 68 spans 628–700 on 390×844 —
   clear of the revealed nav at 724–768; verify with `elementFromPoint` in the test).
3. Pill unchanged. `tests/round6-clock.spec.mjs`: width/height 72, digits font-size ≥ 22, the disc's
   computed background equals the accent token, nav buttons still hit themselves.

## D. Warm-up feel adjusts EVERY open working set (engine)
`core/engine.js` `applyWarmupFeel`: `targets = lighter ? working.slice(0, 1) : working` — heavy only
touched the first set. Raed: all of them, both directions. Keep the calibrated guard and the
one-application flag. Toast copy: «الإحماء طلع ثقيل — نزّلت مجموعات العمل إلى 25 كغ» (already
plural for light; make heavy plural too). Test: three open working sets, last ramp «صعب جدًا» → all
three drop one step; fails on the old code.

## E. Matrix — the app knows which machine from HIS history (engine)
Round 6 classified stacks in `data.js` and let history only coarsen a step. Raed: infer from what he
actually logs. Rule (`domain/clamps.js` / `core/engine.js` `equipmentStep`):
1. Collect his completed working-set weights for the exercise (per device when a device is set),
   last 12 sessions, weights > 0, distinct values.
2. With **≥ 3 distinct values**: if ≥ 80% sit within 1 kg of a Matrix rung (`stackLabelKg`) →
   `'matrix'`; else if all are multiples of 5 → 5; else if all are multiples of 2.5 → 2.5; else if
   all are multiples of 1.25 → 1.25; else → leave the data.js class.
3. Precedence: a step he set by hand in ⚙️ (per device or per exercise) > history inference >
   data.js class > default. The ⚙️ sheet's step line says where the value came from:
   «من سجلّك» / «من الجهاز» / «الافتراضي».
4. Tests with his real patterns: 14/23/32 → matrix; 12.5/15/17.5 → 2.5; 20/40/60 → ambiguous (≥80%
   rung? 18/23… no) → data.js class; 9/14/18 with one typo 16 → still matrix (80%). Each fails
   without the change.

## F. The Island stopped after the update (native — investigate first, then fix)
Facts: the web bridge (`core/native.js`) is byte-identical to v115 for the activity path; the
rebuilt app (Xcode 27.0, iOS 26.6.2 device) embeds `PlugIns/RaedworkoutsGoWidget.appex` and
`NSSupportsLiveActivities=true`; before the reinstall the App Group plist showed
`rw.status.activity = "… session_over ended 1"`, i.e. the OLD build's activity path worked. Between
the last working build (2026-09-08) and this one the native code changed: the IN2 Shortcut hop was
removed from `NativeBridge.swift`, `RootView.swift`, `AppGroupStore.swift` (2026-09-23), and it
was rebuilt with a newer Xcode/SDK.
1. Read the device status first (phone must be on home Wi-Fi + unlocked):
   `xcrun devicectl device copy from --device 082E4136-FCF1-5B86-A65B-1989A4262838 --domain-type
   appGroupDataContainer --domain-identifier group.com.raedmohammed.raedworkouts --source
   "Library/Preferences/group.com.raedmohammed.raedworkouts.plist" --destination /tmp/s.plist &&
   plutil -p /tmp/s.plist` — `rw.status.activity` says what the bridge last did.
2. Read `NativeBridge.swift` (the `activity` message → ActivityKit request/update/end, the
   idempotent contract in project memory: active=false ⇒ end, none running ⇒ request, else update),
   `SessionLiveActivity.swift`, `SessionAttributes.swift`; diff `git log -p -- native/` since
   `47acbbc`. Look for: the message handler name/registration, `ActivityAuthorizationInfo().
   areActivitiesEnabled`, a `try` whose error is swallowed, an iOS 26 API change, the widget
   extension's bundle id / App Group entitlement, and whether the status write happens BEFORE the
   request (a status of «requested» with no activity means ActivityKit refused).
3. Add a status line for every ActivityKit outcome (`rw.status.activity` = requested/updated/
   ended/failed:<error>) if it is not already there, so the next read from the Mac says why.
4. Fix, rebuild (`native/Tools/sync-www.sh` runs pre-build), and report the exact install command
   for Fable; do NOT install yourself. If the cause is a device setting (Live Activities toggled
   off for the app in Settings), say so with the exact path.
