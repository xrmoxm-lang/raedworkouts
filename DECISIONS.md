# DECISIONS

Every narrative comment removed when `app.js` was split into `core/` and `ui/`
(2026-09-07). Nothing here was invented and nothing was edited: each entry is the
comment exactly as it stood, under a heading naming the file and the function it
sat in. The code kept a distilled version — at most three lines, stating the
invariant, the ruling or the trap — and the reasoning behind it lives here.

Read this before changing anything one of these comments is about. A rule in this
file was almost always written after the bug it prevents was proven on a phone.


---

## `app.js`

### render

> Drives the home ordering: while LIFTING the exercise leads and the week
> strip, tiles and music card drop below it. Warm-up keeps the normal order,
> because there is no set to log yet.
> Any live session, warm-up included. The warm-up used to keep the normal
> home order on the reasoning that "there is no set to log yet" — but Raed is
> doing arm swings at that point, not reading his streak, and he asked for
> the pre-workout block to go the moment the workout starts.

### render

> The retired custom runner used to live here behind `if (false && ...)`, with
> renderRunner/renderRunnerWarmup/renderV15Workout/renderSessionPreview/
> appendV15HomeExerciseList below. All were unreachable: the guard short-circuits,
> and nothing else called them. Removed because one of them was named
> renderV15Workout while NOT being the live v15 card — the same name collision
> that let a shadowing block hide the real session view for an entire phase.

### init

> "Wait until he switches away" used to mean "reload the instant he pockets
> the phone" — which is the same instant the rest timer starts running. The
> countdown is persisted now so a reload resumes it, but reloading in the
> middle of a rest is still the worst moment available, so a live rest
> holds the update off too. Nothing is lost by waiting: the next
> visibilitychange, focus, or hourly check comes back round.

### init

> A completed mesocycle is the natural moment to look up from the week.
>
> He asked for the programme to carry itself for twelve months and for a
> review "every six months or so". A cycle is twelve weeks, so two cycles is
> almost exactly six months at four sessions a week — the review prompt rides
> on that rather than on a calendar date the app would have to track.

### FOCUSABLE

> ---- Modal keyboard + screen-reader behaviour ----------------
>
> #modal-overlay is opened from a dozen places by adding a class, and it had
> none of the behaviour a dialog needs: no role, no aria-modal, focus left
> behind on <body>, Tab wandering out into the page underneath, and Escape did
> nothing at all — the swap sheet, the exercise sheet and every destructive
> confirmation could only be dismissed by finding and tapping the right button.
>
> Rather than edit every call site, this watches the class the call sites
> already toggle. One place to get right, and it cannot drift out of step with
> a new sheet added later.

### _lastErrorToastAt

> ---- Last resort ---------------------------------------------------------
>
> There was no window.onerror and no unhandledrejection handler in this file at
> all. On a phone in a gym there is no console to open, so any thrown error —
> a render that half-completed, a storage write that failed, a promise nobody
> caught — left the app visibly fine and quietly broken, and he would only find
> out when the workout was missing.
>
> This does not pretend to recover. It does two honest things: it tells him the
> app hit a problem so he knows not to trust what is on screen, and it makes
> sure the session that is still in memory gets pushed to the server, which is
> the copy most likely to survive.


---

## `core/coach.js`

### COACH_URL

> HTTPS, not the raw Tailscale IP. The app is served over HTTPS, and a browser
> refuses to fetch http:// from an https:// page — the request never leaves, and
> it looks like a network fault rather than the policy block it is.
>
> This WAS tailnet-only on :8444, on the reasoning that these passages are the
> text of books Raed paid for. That reasoning still holds, but the arrangement
> did not: :8444 cannot be funnelled, so the coach only ever answered a device
> already on the tailnet — and he does not want Tailscale on his phone.
>
> The trade he is making, stated plainly rather than buried: the endpoint is now
> public and gated by X-Coach-Key, and that key ships inside this file. It stops
> casual access and search engines; it does not stop someone who reads the
> deployed JavaScript. Verified refused without the key and with a wrong one.
> Port 8444 was never publicly reachable. Tailscale Funnel serves only 443,
> 8443 and 10000 — anything else reports "Funnel on" in the status output and
> silently answers nobody from the internet. That is why the coach needed
> Tailscale switched on to work at all, and Raed does not want Tailscale on his
> phone: "ما أبغى تليسكيل".
>
> It now rides the 443 funnel on a path, beside the P180 dashboard already
> there. Verified from the public ingress IP with Tailscale DNS bypassed:
> /coach/health returns 200 and /coach/search returns real passages.
> Same-origin, and the key is NOT here any more.
>
> It used to be: `const COACH_KEY = '…'` in this file, shipped to every browser
> that opened the site, on a service that spends real money per question. The
> comment that stood here called it a stated trade. It stopped being one when
> /answer became metered — anyone who viewed source could spend his credit.
>
> api/coach.js on Vercel holds the key now and forwards to the same funnel.
> A browser app cannot keep a secret: it either carries a credential the user
> can read, or it goes through a server. This is the server.
>
> Measured before adopting it, because he asked for exactly this not to slow
> him down: the extra leg costs ~500ms, against a model that takes 2–8s to
> write an answer. Nothing joins a tailnet and nothing about starting a workout
> changes — his two conditions, «ما يكون تليسكيل» and «ما يعقد علي الـprocess».
>
> There is deliberately NO fallback to the direct URL. A fallback would mean
> shipping the key again for the case where the proxy is down.

### COACH_LAST_KEY

> The last answer survives leaving the tab.
>
> It did not before: coachState was memory only, so the sequence he actually
> performs in the gym — ask, switch to the runner to log the set the answer was
> about, switch back — threw the answer away and left an empty screen. Re-asking
> is not free either: /answer is the one metered call in this app, so forgetting
> costs money as well as the answer.
>
> Only a successful answer is kept. An error, an offline, a no_match and a
> half-finished loading state are all about a moment that has passed; restoring
> «الخادم غير متاح» on a screen he opens tomorrow would be a lie about now.

### rememberCoachAnswer

> Passages carry the citation targets, so the answer is unreadable
> without them — but they are also the bulk. Six is every citation the
> model has ever used and keeps the record well inside a storage quota
> that safeSetItem already has to defend.

### coachEnglish

> Which passages he has flipped to English, and which he has opened in full,
> keyed by index within the current answer. Both reset on every new question —
> a toggle belongs to the passage on screen, not to an index that will mean
> something else next time.

### dedupePassages

> Raed's library deliberately keeps both editions of two Nippard programmes,
> because their bytes differ and no supersession was ever proven. Retrieval does
> not know that: "how many sets per week" came back with page 92 of file A AND
> page 92 of file B, identical text, one above the other. Keep the first (they
> arrive sorted by score) and drop later passages whose text repeats it.
> Returns the surviving passages AND a map from each server-side index to its
> new one, because the written answer cites passages by the server's numbering.

### dedupePassages

> The WHOLE passage, not its opening. 160 characters was enough to collapse
> two genuinely different 900-character chunks that happen to start the
> same way — consecutive pages of one book routinely do — and because the
> answer cites passages by index, collapsing them also redirects a citation
> onto the survivor. Wrong evidence under a right answer is worse than a
> duplicate.

### askCoach

> Only the NAME is sent, and it travels in its own field. Sets, loads and
> history stay on the device — he asked for a coach that knows which exercise
> he is on, not one that reads his session.
>
> It used to be appended to the question, and that silently narrowed every
> question asked mid-session: "متى أسوي ديلود؟" became "when do I deload for
> the Chest Press Machine", and the honest answer to that is "your books do
> not cover it". As its own field the name steers retrieval and is offered to
> the answer as context, so a general question stays general and a vague one
> ("كم تكرار أسوي؟") finally has something to resolve against.
> Every request gets a number, and only the newest one is allowed to write
> to coachState. Two questions in a row on a slow connection could otherwise
> finish out of order and leave the FIRST answer sitting under the SECOND
> question — with citation markers pointing into the wrong passage list,
> because coachOpen and coachEnglish are keyed by index into it.
> Abort the previous request, do not merely ignore its answer.
>
> The ticket below already stops a slow first answer overwriting a fast second
> one, but the first fetch kept running and the server kept generating — and
> /answer is the one metered call in this app. A double tap, or a second
> question typed while the first was still thinking, paid twice. The input and
> the button also stayed enabled throughout, which is what made a double tap
> easy in the first place.

### askCoach

> Kept so the idle screen can offer them back. Mid-set he re-asks the same few
> things — «كم راحة بين المجموعات؟» — and retyping Arabic on a phone with
> chalk on your hands is the friction worth removing. Five is enough to be
> useful and short enough never to become a list he has to read.

### askCoach

> 0.35, down from 0.5. The floor used to be the answerability guard, and
> measuring it on 26 questions showed it cannot be: real questions his
> books answer score 0.396 (هل الإحماء ضروري؟), 0.412 (وش هو RIR؟) and
> 0.476 (هل الكرياتين مفيد؟), all BELOW «وصفة كبسة لحم» at 0.514. A floor
> that stops the kabsa question silences RIR and creatine with it.
>
> So the floor is now only a cheap early exit for the absurd — عاصمة
> اليابان lands at 0.179, علاج حب الشباب at 0.273, and neither costs an
> API call — and the model, holding the passages, decides whether they
> answer the question. It returns that as a flag, not as prose.

### askCoach

> The server may leave the library only because this says it may, and
> only after two passes over his books have failed. Anything it finds
> out there comes back labelled `source: "web"` and is rendered as
> such — he asked for the answer AND for it to say where it came from.

### askCoach

> Status first, body second. res.json() used to run before anything looked
> at res.status, so an HTML error page from a proxy — a 502, a 504, or a
> 401 that Tailscale Serve rewrites into its own page — threw on the parse
> and landed in the catch, which reports "the library is unreachable". It
> was reachable; it was refusing or the gateway was broken, and Raed would
> have gone looking for a network fault that did not exist.

### activeCoachContext

> What the coach is allowed to know about the session in progress.
>
> Raed asked for exactly this and explicitly NOT for more: "أبغى إذا انتقلت من
> حصة تدريبية إلى المدرب، المدرب يدري أنا في أي تدريب، أو أقدر أفعل هذا الخيار
> أو أطفيه". He turned down a coach that reads his sets and advises on them.
>
> So this is a search context, not an adviser: the name of the movement he is
> standing at, added to the question so he can ask "كم راحة؟" without typing
> which exercise he means. Nothing about his loads, his history or his
> performance crosses over, and the switch is his.

### webAnswerInline

> The web answer arrives as markdown, and printing it raw put
> `([nice.org.uk](https://www.nice.org.uk/guidance/NG226/...?utm_source=openai))`
> in the middle of an Arabic sentence — a URL long enough to push the whole page
> sideways — while headings, list markers, and emphasis all read as punctuation.
>
> The inline links are dropped rather than rendered: every one of them is
> already in `citations`, listed under the answer as a tappable host name, so
> keeping them inline would be the same source twice, once unreadably.

### COACH_URL (module preamble, now the file header)

> The coach searches the 33 Nippard works Raed owns and answers out of them,
> showing the passages it used with book and page.
>
> It used to only quote, and this comment used to say "it NEVER writes an answer
> of its own" — true until 2026-09-03, and dangerous to leave standing once it
> stopped being true, because it would send the next reader looking for an
> architecture that is no longer here.
>
> What did NOT change is the rule underneath it. A generated training cue that
> sounds confident and is wrong is the one failure this app cannot absorb, so:
> no passages means the model is never called, and an answer that names no
> passage is not shown. Only who assembles the sentence changed.


---

## `core/dom.js`

### h

> A <bdi> already isolates everything inside it, so splitting its own string
> children into further <bdi class="ltr-run"> runs produces <bdi><bdi>…</bdi></bdi>.
> Renderers wrap Latin names manually AND localizedTextNode wraps them
> automatically, so every such call site was doubling. Translate the string
> here, but leave the isolation to the <bdi> we are already building.

### LTR_RUN

> Keep an approved technical URI together. The general run deliberately
> leaves sentence punctuation outside <bdi>; the URI alternative prevents a
> scheme such as scope.bit:// from being split into a false English fragment.
> The comma belongs in the run class. Without it "4,658" split into two runs —
> "4" and "658" — with the separator loose between them, and RTL reordered the
> whole thing into "658,4" on screen. A grouped number is ONE token.

### toastSaved

> Confirming a save that did not happen is worse than saying nothing.
>
> When a local write fails, onStorageWriteFailed() puts an eight-second warning
> on screen. Every one of these success toasts fires in the same tick, straight
> afterwards, and replaces it — so the last thing he sees is «انحفظ» about data
> that is not saved anywhere. Exactly the bug already fixed for the sync toast.
> If storage is failing, the warning is left standing.

### ICON_PATHS

> A real icon set, in the app's own hand.
>
> Settings shipped with emoji standing in for icons. Raed's verdict: «حتى
> الإيموجي ما تسوي شي بالنسبة لي» — and he is right. Emoji are somebody else's
> drawings at somebody else's weight, they render differently on every OS, they
> carry colour the palette never chose, and next to the tab bar's own line icons
> they read as a placeholder that was never replaced.
>
> These match that tab bar exactly: 24x24, no fill, currentColor, 1.8 stroke,
> round caps and joins. They inherit the skin's accent and text colours, they
> sit on the same optical weight as the navigation, and they look like one hand
> drew the whole app.
>
> The ⚙️ on the exercise card is deliberately NOT here: Raed asked for that one
> back as an emoji by name (item C6).

### confirmAction

> An in-app confirm.
>
> Native confirm()/prompt() are not dependable in an installed PWA — that is
> exactly why adding a clip never worked for Raed, and why he reports deleting
> a session "goes straight through". A destructive action must not depend on a
> dialog the shell is allowed to suppress.
>
> Returns a promise so callers read like the confirm() they replace.


---

## `core/engine.js`

### completedSessionCount

> ---- Programme resolver --------------------------------------
> The week is DERIVED from logged sessions, not stored. state.current_week was
> initialised to 1 and never assigned anywhere, so the resolver always picked
> Block A and Block B — weeks 5-8, with its own exercises (EZ Bar Curl, Overhead
> Rope, Machine Lateral Raise instead of the Block A three) — was unreachable
> forever. He could have trained for months and never seen the second half of
> his own programme.
>
> Four sessions to a week, which is the programme's own frequency, and the same
> history-driven principle the session rotation already uses. Deriving it means
> there is no counter to forget to advance, and it self-corrects if he misses a
> week or logs two sessions in a day.
> Only sessions from THIS programme move the programme clock.
>
> This was `state.history.length`, which counts everything — including the v15
> full-body sessions the migration deliberately preserves, and anything he
> restores from a backup or imports from a JSON export. Since the clock is
> `sessions / 4`, importing a few months of old history would drop him into an
> arbitrary week: block B, block C, or straight into a deload he has not earned,
> and it would fire the six-month review prompt at the wrong time.
>
> Counting by the current rotation's session ids is the check that matches how
> the week is used. Entries with no session_id at all are counted, because a
> hand-restored row from this programme should not be silently ignored either —
> the failure mode being closed is a FOREIGN programme, not a sparse record.

### programmeCycleLength

> The mesocycle REPEATS. It used to stop.
>
> This was `Math.min(lastWeek, ...)`, so once he had trained past the end of the
> programme the week froze there permanently: Block B on a loop, for ever, with
> no deload and no end. He asked whether the programme advances by itself —
> it did not, it ran out.
>
> Now the weeks wrap. A cycle is A(1-4) B(5-8) C(9-11) deload(12), and week 13
> is week 1 of the next cycle with his logged loads carried forward — which is
> what makes the next twelve months take care of themselves. `research/06` §7.2
> is the authority for what week 12 is; standard periodisation is the authority
> for starting again after it, and every source here agrees a deload is followed
> by a return to work, never by more deload.

### DELOAD_SIGNS

> ---- Trigger-based deload (research/06 §7.3) -----------------
>
> The ruling in `06` §7.2 is «[LADDER] wins. No scheduled deload in the first
> block. Deload on trigger, with a week-12 backstop.» Only the backstop was
> built. The trigger — the part the ruling actually turns on — was prose.
>
> §7.3: fire when ≥2 of six warning signs are true AT THE SAME TIME for ≥1
> week. Five of the six are things only he can report; one, «persistent loss of
> strength», the app can see for itself. So it asks once a week, at the end of a
> session, and supplies the sixth from his own logs.
>
> Asking once a week is not a UI preference, it is the rule: "for ≥1 week" is
> the unit the source measures in, and he has said plainly he does not want the
> app chattering at him.

### DELOAD_SIGN_LABEL

> Spelled out rather than looked up by a computed key. The locale gate reads
> every lookup call in this file to prove its key has an entry, and building the
> key by concatenation defeats it — the gate saw the prefix alone as the key.
> (It also read the first draft of this comment, which quoted the concatenation
> verbatim, and flagged that too. Correctly.) Each label below is a literal.

### getLastPerformance

> Delegates rather than duplicating. This used to be its own scan of
> state.history, so when the lookup became device-aware the card kept reading
> the newest session on ANY machine while the weight suggestion read the
> right one — the two rules drifted the moment one of them changed. Same bug
> shape as the two copies of the set-validity rule before it.

### EQUIPMENT_KINDS

> ---- Per-exercise equipment memory --------------------------------------
> Raed: "إذا تستعمل machine ولا plates ولا dumbbells... إنت جالس تسوي leg press
> لكن على different devices each time، فأنت تلقى الـdevice وهو يحفظ device
> ويلقيك في الـdevice هذا ويبرمج بناءً عليه".
>
> The point is not a label. 60 kg on one leg press is not 60 kg on another —
> different lever arms, different starting resistance — so a weight history
> that mixes machines is a history of nothing. When a device is chosen, the
> suggestion and the "last time" line read only the sets logged on THAT device.

### performedId

> A session stores a swapped exercise under the ORIGINAL programme id, with the
> replacement recorded in `swapped_to`. So history for a hack squat that
> replaced a goblet squat lives at `exercises.goblet_squat`, and this function —
> which is asked for `hack_squat`, because that is what suggestNextWeight is
> given — found nothing at `exercises.hack_squat` and reported no history at
> all.
>
> Proven: two lower_b sessions of hack squat at 80 kg, permanent swap in place,
> and the third session offered a blank box and «معايرة» — calibrate a movement
> he had done twice that week. Every swapped exercise was permanently stuck on
> its first exposure, so it could never progress either.
>
> Matching on the EFFECTIVE id — what he actually performed — fixes both
> directions: asking for the replacement finds the swapped entries, and asking
> for the original finds only the sessions where he really did the original.

### roundToGymIncrement

> Clamp C3: always round DOWN to the equipment step. Rounding to nearest, as this
> did before, silently sent a warm-up set ABOVE the prescribed percentage — a 9 kg
> working weight produced a 5 kg "50%" warm-up. Down is the conservative direction
> for a beginner, and it is the only direction the clamp spec allows.
> `step` is per-exercise and is learned from logged weights; 2.5 is the provisional
> default until enough observations exist. Phase 2 replaces this with the shared
> domain/clamps.js implementation once app.js is loaded as a module.

### supersetPartner

> A1 and A2 are a PAIR, not a shared label: the letter is the group and the
> digit is the position. Matching on exact equality — which is what this did
> originally — found one member every time and returned null, so the note it
> renders had never once appeared. The gate did not catch it because it only
> asserted that some expanded card existed.

### supersetPartnerEntry

> The other half of a superset, in either direction, resolved against the LIVE
> session rather than the programme row — this is used to move him between the
> two while he is training, so it has to speak in the ids the runner is keyed by.
>
> supersetPartner() above deliberately answers only for A1, because its job is to
> render the note exactly once. This one answers for both.

### advanceSuperset

> [PPL] E p.27 L:1292-1302, carried into research/06 §«Superset note»:
> «Do not rest after completing the first set of the A1 exercise and MOVE RIGHT
> INTO the first set of the A2 exercise. Then rest for the time period indicated
> in the A2 row.»
>
> The app already knew this and said it — «سوبرست — بلا راحة قبل Cable Crunch» —
> while leaving him standing on A1, where the next thing under his thumb is A1
> set 2. The interface was prescribing the opposite of the note printed on it,
> on the last two exercises of every single session he trains.
>
> Only working sets alternate. Ramps are per-movement: you warm the calf raise
> up, you do not warm up mid-superset.

### advanceSuperset

> «أبغى أوبشن إنه أنا أوقفها، وأوبشن إنه لا تصير تلقائي.» Three modes:
> auto   — the app moves him to the partner. [PPL]'s own instruction.
> manual — the pair still says «بلا راحة قبل X» and offers a tap to go
> there, but nothing moves under him.
> off    — the pair is ordinary; no note, no jump.

### runRampRules

> Ramp loads, straight from his own sourced protocol.
>
> research/07-warmup-protocol.md §2.2 — the first-set percentage MOVES with how
> many ramp sets there are, and the app was using the 2-set number for both:
>
> 1 set   ~60%                  [ML L804-858, verbatim: "about 60% of your
> planned working weight for 6 to 10 reps"]
> 2 sets  ~50%, then ~70%       [ML L11160/L11162, PPL L:1454/1457]
>
> Sixteen of the twenty-six rows in his programme prescribe ONE ramp set, and
> every one of them was being warmed up at 50% instead of 60% — the app took
> `ramps[0]` from the two-set pair. The reasoning in the old comment ("groove
> the movement, not pre-fatigue it") is sensible and is also not what his
> sources say. SKILL.md §5.4 compounded it by claiming 75% for the second set;
> the code's 70% was right and the skill file was wrong.
>
> Both percentages round DOWN to the equipment step (clamp C3), and at light
> loads that used to collapse the two-set ramp onto one number — a 10 kg working
> weight gave 5 kg twice. A ramp has to ascend, so the second set is lifted to
> the next step, never to or past the working weight, and drops to a single set
> when even that is impossible.
> research/06 §6.3 — the first exposure to a movement, when there is no history
> to build on. Step 1 of the source algorithm is titled «Ask nothing. Start at
> the floor», and the app has been doing the opposite: «لا سجلّ بعد — اختر وزنًا
> تتحكّم فيه» hands the whole question back to him, on exactly the exercises
> where he is least able to answer it. He is one week into this programme, so
> that is most of them.
>
> The app cannot know what the lightest pin on his machine weighs, and inventing
> a number would be the same fabrication D8 forbids for videos. What it CAN do
> is the arithmetic he cannot do mid-set: once a ramp set comes back easy, the
> working load follows from the ramp table.
>
> terminal_ramp_pct(ramp_sets) = 0.60 (1) | 0.70 (2) | 0.85 (>=3)
> first_working_weight = round_to_step(weight_at_RPE_4to5 / terminal_ramp_pct)
>
> «a ramp set», not «the last ramp set» — the source fires on whichever one
> comes back at RPE 4–5, and divides by the pct for the PLANNED count. The app's
> own effort scale already maps RPE ≤ 6 to «سهل» (see prescribedEffortKey), so
> «easy» is the trigger and no new scale is invented for it.
> research/07 §2.7 — «the warm-up as a live load-calibration signal», which that
> file marks as «build this — it is sourced and it is the highest-value app
> behaviour here». It was never built.
>
> [ML L8530] «If the warm-up sets feel light, you can be a little more
> assertive with the loads you select for your working sets.»
> [ML L8534] «If the warm-up sets feel heavy, ease into your first working set
> with a lighter load than usual.»
>
> ±5–10% are the source's own in-session correction magnitudes [ML L8540-8550];
> 7.5% is the middle of that band. The asymmetry is the source's, not a
> simplification: light is about «the loads you select for your working sets»,
> plural, and heavy is about «your first working set».
>
> Only ever applied to a load the APP suggested. A number he typed is his.
> Calibration first: it establishes the load, and the feel rule declines on an
> exercise that has just been calibrated rather than adjusting the number it
> derived from the same ramp.

### applyWarmupFeel

> Rounding to the equipment step can swallow the whole adjustment on a light
> load — 10 kg ±7.5% is 9.25/10.75, both of which round back to 10 on a
> 2.5 kg step. A suggestion that changes nothing is worse than none: it
> claims to have listened. Move by one real step instead.

### applyCalibrationProbe

> Fills the working sets of a first exposure from a ramp set that came back
> easy. Returns the derived weight, or null when the probe does not apply.
>
> Only untouched working sets are written. Once he has typed or completed one,
> his number is the truth and a derivation must never overwrite it.

### suggestNextWeight

> This branch re-ran the SAME `isCountableWorkingSet` filter that had just
> been proven empty one line above, so `historicWeight` was always
> undefined and the whole branch could only ever return «معايرة». The
> `why_last_logged` note it exists to show was unreachable.
>
> What it clearly meant to do is widen the net: the last session had no
> set that counts — every one skipped, or flagged invalid, or left
> unticked — but he may still have typed a real load into it. That number
> is a far better starting point than telling him to calibrate a movement
> he trained last week. Warm-ups stay excluded; they are not his working
> load. Heaviest wins, matching the working-set path below.

### suggestNextWeight

> Two different sets, for two different questions.
>
> The WEIGHT comes from the heaviest working set — which is what the comment
> above this block always claimed and what exerciseHistoryRows() already shows
> him in the log table, but the code took `workingSets[length - 1]`, the LAST
> one. Identical on straight sets, and wrong the moment he drops the load on a
> final set because he is cooked: the app would then propose the reduced
> weight as his new working load and quietly walk him backwards.
>
> The EFFORT still comes from the final set, because that is the only set the
> app ever records effort on — by design, effort only carries information near
> failure. Reading it off the heaviest set would usually read `null`.

### suggestNextWeight

> Accessories still add reps BEFORE weight — that half of the rule is sound and
> is enforced by the two-consecutive-sessions gate below, not by the size of
> the step. What changed is the SIZE: it is the equipment's own smallest
> increment now, the same for a leg press and a triceps pressdown, because
> that is what the sources actually show. See equipmentStepKg().

### suggestNextWeight

> A machine that carries its own stack logs 0, and 0 is a real load — but it
> is a load that cannot go up. «طابق أو تجاوز 0 كغ» says nothing, and the card
> suppresses that note anyway, so he was left with a blank box and no guidance
> at all on a movement he had just done three sets of. Reps are the only thing
> that can progress here, so the note says so and names the target.

### weeklyTrainingTarget

> One definition of "this week", and it is his week.
>
> There were two and they disagreed on the same screen: the volume tile used a
> rolling 7x24 hours, the week strip used Saturday-to-Friday Saudi time. Near
> each Saturday boundary the tile could count a session the strip had correctly
> put in last week, while "remaining" had already reset.
>
> It also reads `weekly_layout` — which has sat in data.js since the programme
> was transcribed and was consumed by NOTHING — for the number of training days
> a week is meant to hold. That is the one honest use for it: the rotation is
> deliberately history-driven, never weekday-driven (a missed Tuesday must not
> break it), so the layout cannot say "Tuesday is Upper A". It can say "four".

### WARMUP_MINUTES

> A real estimate instead of the number 70.
>
> This was `tf('home_minutes', { n: 70 })` — a hardcoded literal on every
> session. A six-exercise lower day said 70 minutes and so did a seven-exercise
> upper day, and now a deload week with two working sets per exercise says it
> too, which is roughly twice the truth. A number the app cannot justify is the
> exact thing Raed objected to on the weight card.
>
> Built from the programme's own columns: each working set is about 40 seconds
> under load, each ramp set about 30, and the rest between them is `rest_min`,
> which the programme states per exercise. The general warm-up is capped at 15
> and realistically runs about 8.

### effortKeyForRpe

> The prescribed effort, in words rather than a number.
>
> Every programme row carries per-set RPE, Block B raises it, and the week-12
> deload lowers it — and `planned.rpe` was read NOWHERE in this file. So Block
> B's effort progression never reached him, and worse, the deload's effort cut
> did not either: his deload week was "one fewer set" while the source
> (research/06 §7.4) prescribes the SAME weight with the effort taken off. A
> deload trained at normal intensity is not a deload.
>
> D16 replaced numeric RPE with coarse words on purpose, so this shows a word.
> The bands are the standard reading of the scale: 6 leaves about four reps in
> reserve, 7 about three, 8 about two, 9+ is one or none.

### prescribedEffortSequence

> The effort target of EACH set, not the hardest of them.
>
> 86 of the 104 rows in his programme prescribe different efforts across their
> sets — chest_press_machine is [7, 7, 8] — and the card showed one word taken
> from `Math.max`. So «صعب» sat under a row whose first two sets are prescribed
> «متوسط», and the app was asking him for more than the programme does on 83% of
> what he lifts. That is not a cosmetic collapse: he feeds those same sets back
> as fatigue, and the deload trigger reads fatigue.
>
> Identical values still render as one word — «صعب · صعب · صعب» is noise.

### EQUIPMENT_STEP_KG

> The load increment, from the equipment — not from a body-part guess.
>
> `research/06-beginner-protocol.md` §5.2 carries a red-flag callout naming this
> app by line number:
>
> "The current app's increment rule is not in any source. app.js sets
> bump = isLowerBody ? 5 : (isAccessory ? 0 : 2.5). The lower/upper split does
> not appear in [LADDER], [PPL], [RECOMP] or [PELLAND]; the sources' own
> examples use the same increment for a barbell squat and a triceps
> pressdown."
>
> "Encode instead: step(E) = the smallest load increment physically available
> on that machine or implement — which is exactly [PPL]'s 'some minimum
> amount of weight'. Fallback when the increment is unknown: +2.5 kg."
>
> And §858 repeats it in the gaps table. So the split goes.
>
> Learned first, because the only honest source for "smallest available" is his
> own gym: the gaps between the distinct loads he has actually logged on that
> movement. The comment on roundToGymIncrement has claimed for months that the
> step is "learned from logged weights" — nothing was learning it.
>
> Equipment defaults come from §5.2's own examples: a pin stack is often 5 kg,
> dumbbells and plate-loaded machines about 2.5. Getting this too LOW is not
> harmless — suggesting 42.5 kg on a 5 kg pin stack is a weight he cannot set.

### REENTRY_RPE

> ---- Session warm-up phase ---------------------------------
> The weeks 1-2 re-entry ramp. D19, and it was prose until now.
>
> D19: "Treat weeks 1-2 as a re-entry ramp rather than a first-ever exposure."
> `research/20-programme-decision.md` §8.3 gives the table, and nothing in the
> app read it — the Settings screen has been promising Raed "the first two weeks
> are a re-entry ramp" while session creation built the ordinary Block A rows.
>
> week 1   compounds 6/6/6   isolation 7/7/7   TWO working sets on an
> exercise's first exposure only
> week 2   compounds 6/7/7   isolation 7/8/8   full sets
> week 3+  Block A as printed
>
> Cycle 1 only. He is re-entering after a layoff once; by week 1 of cycle 2 he
> has twelve weeks behind him, and the deload in week 12 is what handles fatigue
> from then on. Re-ramping every cycle would just be a second deload.
>
> §8.3 is emphatic immediately below the table that "RPE is telemetry, not the
> controller" — so this changes the effort SHOWN and, in week one, the set
> count. It never touches how load is computed; that stays on achieved reps.

### reEntryPlan

> The experience selector finally controls something.
>
> It sat in Settings offering four choices and changing NOTHING: its only
> consumer was effectiveStartKg's load multiplier, and zero of the 104 rows in
> the live programme carry a `start_kg` for it to scale. `research/06` §6.3 is
> explicit about why that is the right outcome — "the experience multiplier
> can be deleted entirely... what experience SHOULD drive is the RPE cap and
> the graduation gate, not the load."
>
> The RPE cap is exactly this ramp. Someone who has been training does not
> need re-entering; someone detrained, returning or new does.

### scopedReplacementFor

> A scoped swap belongs to ONE cycle. Entries written before `cycle` existed
> carry undefined, and those are honoured only in the cycle he is in now —
> there is no way to know which cycle they came from, and the safe reading
> of an unknown is "this one", never "every future one".

### recordSubstitution

> The cycle a scoped swap belongs to.
>
> Weeks and blocks REPEAT now that the twelve-week mesocycle wraps, so a
> week number on its own stopped identifying a point in time: a swap scoped
> to week 5 of cycle 1 matched week 5 of cycle 2 as well, and a block-B swap
> came back in every future block B. Raed would be put on a substitute
> months after whatever caused it — a busy machine, a tweaked shoulder — had
> been forgotten. Recorded here so the matcher can tell the two apart.

### prescribedRestSeconds

> The programme prescribes rest PER EXERCISE — 2.5 min on the openers, 2.0, 1.5,
> and 0 on the first half of a superset. `rest_min` has been in data.js since the
> programme was transcribed and app.js consumed it NOWHERE: every set fell back
> to one global 120s. Worst case, the card told Raed A1/A2 run back-to-back with
> no rest and then started a two-minute timer on the same tap.
>
> The setting stays as the fallback for anything the programme does not specify.

### prescribedRestSeconds

> The override, off by default.
>
> v15 let the Settings value drive every rest. v16 gave all 104 programme rows
> their own `rest_min` from Nippard — 2.5 min on a leg press, 0 on the first
> half of a superset — so the setting became a fallback that almost never
> fires, and the ability to shorten a whole session went with it. That is a
> real thing to want on a day he is short of time.
>
> Opt-in, because the prescription is the programme. A superset's prescribed 0
> is never overridden: that 0 is an instruction to move straight into the
> partner, not a short rest.

### exerciseHistoryRows

> The last few sessions for one movement, newest first, each labelled with the
> machine it was performed on. Deliberately every device, not just the selected
> one — the table exists to SHOW the difference between machines, which is
> exactly what the per-device history correctly hides while training.

### exerciseHistoryRows

> Same lookup as getLastTwoPerformances, and for the same reason: this table
> is opened with the REPLACEMENT id when a swap is active, while the session
> stored the work under the original programme id. It showed «لا يوجد سجل»
> for a movement he had been doing for weeks.

### BODYWEIGHT_MIN_KG

> One place that decides what a bodyweight entry means.
>
> There were two, and they disagreed. The quick logger in History accepted any
> truthy parsed number — including a negative — appended it to the log, and did
> NOT update `profile.bodyweight_kg`; the protein target reads the profile, so
> logging a new weight left the target computed from an old one. Settings
> accepted a negative too, stored it as the current weight, and appended a
> SECOND entry for the same day.
>
> A human bodyweight has bounds. 25-300 kg is wide enough to never argue with a
> real person and narrow enough to catch a typo or a stray minus sign.


---

## `core/gym.js`

### EXECUTING_SCHEMES

> ---- Gym launcher (IN2 Fitness) ------------------------------
> Tries the user's override first, then a URL scheme. If the scheme
> doesn't open the app within ~1.2s (page still focused), falls back
> to the App Store URL so they can tap "Open" there.
> These three settings are NAVIGATED TO, and settings arrive from the sync
> server as well as from the settings screen — while the sync token ships in
> this very file, by an accepted decision. So anyone who reads the public JS can
> write his row, and `javascript:` in gym_launch_override would then execute
> inside his app the next time he taps the gym button. That is a public token
> turning into code execution, which is a different thing from the shared-secret
> trade he agreed to.
>
> The override legitimately needs non-http schemes (shortcuts://, scope.bit://),
> so this is a deny-list of the schemes that execute rather than navigate, not
> an http-only allow-list.


---

## `core/i18n.js`

### activeLanguage

> ---- i18n ---------------------------------------------------
> Every renderer supplies an English source/key to this single locale map.
> Arabic text is the default; English exercise names and numeric runs are
> isolated below so punctuation cannot jump across an RTL sentence.

### localISODate

> His local calendar date, not UTC's.
>
> This was `new Date().toISOString().slice(0,10)`, which is the date in UTC.
> Riyadh is UTC+3, so between local midnight and 03:00 the app stamped
> YESTERDAY. Proven live at 01:37 on 5 September: the app wrote 2026-09-04.
> Raed trains late — an earlier screenshot shows a session started 12:05 ص — and
> this date stamps his workouts, his personal records, his bodyweight log and
> his exports. A late session landed on the wrong day in every one of them, and
> the week strip then drew it on the wrong square.
>
> Device-local rather than a hardcoded Asia/Riyadh, so it stays right if he
> travels. 'en-CA' is the locale whose short date is already YYYY-MM-DD.

### fmtLoadKg

> Weekly volume runs to thousands of kg, so it gets a grouping separator and no
> decimal — whole kilos are plenty at that scale, and dropping the fraction
> kills the ambiguity entirely.
>
> The bug this replaces: the locale-less formatter followed the DEVICE, so the
> same app rendered "267.2" on one phone and "267,2" on another, and neither
> matched fmtKgValue below, which always uses a dot. Pinning the locale makes
> the number mean the same thing on every phone.
> A single lifted load, kept exact. Gym plates land on halves, so rounding to
> whole kilos misreports what he did; trailing zeros are dropped so 60 stays
> "60" rather than "60.0".

### editableWeightValue

> Blank and zero are different things, and this used to collapse them.
>
> It was `hasWorkingWeight(value) ? Number(value) : ''`, and hasWorkingWeight is
> `> 0` — so an explicit 0, which the app supports on purpose for a machine that
> carries its own stack, came back as ''. Consequences, all proven on screen:
> a completed 0 kg set re-rendered with an EMPTY weight box, so work he had
> logged looked unrecorded and tapping the tick again answered «مطلوب»; and
> «+ مجموعة» after a 0 kg set created a row holding '' rather than 0, which on
> a readOnly machine-weight card he could never fill in and never complete.
>
> domain/runner-session.js already draws this distinction correctly in
> hasValidWorkingValues. This is the same rule: absent is blank, 0 is a number.

### arabicMinutes

> Shown once every exercise is resolved. Raed asked for the elapsed time —
> "أبغى بصفحة التمارين يقول لي إنه خلصت التمرين خلال كم" — and the duration is
> worth more than the volume number here: it is the one thing he cannot
> reconstruct later from the log.
> Arabic counts again: 1 singular, 2 dual, 3-10 plural, 11+ back to singular.
> A workout is usually 30-90 minutes so «دقيقة» is right most of the time, but a
> short session lands squarely in the 3-10 band where it is wrong.


---

## `core/rest.js`

### persistRestDeadline

> The deadline is persisted, not just held in `restTimer`.
>
> The auto-update path reloads the page the moment the app is hidden while a
> session is open — which is precisely the moment he pockets the phone to rest.
> The countdown lived only in this module-level object, so the reload killed the
> interval, hid the timer, and the alarm that was supposed to end his rest never
> fired. He looks two minutes later at a phone showing nothing. Same for an iOS
> tab eviction, which is routine with the screen off.
>
> Storing the deadline means any reload resumes the same countdown, and one that
> expired while the page was gone fires immediately on return instead of
> vanishing.

### fireRestEndNotification

> `serviceWorker.ready` is specified NEVER to reject: it waits forever until
> some registration has an active worker. If register() failed, or install
> threw because one shell URL 404'd on a partial deploy, this await simply
> never returned — so the `new Notification` fallback, which exists for
> exactly that failure, was unreachable in exactly that failure. The alarm
> went silent with nothing logged. Race it against a short timeout.


---

## `core/session.js`

### startSession

> Was a native confirm(): English on an Arabic-only screen, and the exact
> dialog endSession() already refuses to rely on because a standalone PWA
> shell can suppress it — in which case this returned false and the tap did
> nothing at all. confirmAction() is the app's own sheet, in Arabic, and it
> cannot be suppressed. Async, so the caller re-enters once he has answered.

### startSession

> His own order for this session, if he has set one.
>
> «بعض الأحيان الأجهزة تصير تنقل في النادي بشكل مبالغ فيه» — the gym moves
> machines and the printed order stops matching the room. Reordering is his
> call, it belongs to the SESSION rather than to one workout, and it survives:
> move the leg extension ahead of the RDL once and every Lower A after it
> opens that way.
>
> Applied as a sort, never as a replacement list: an id he has ordered that is
> no longer in the programme is dropped, and a new one the programme adds
> lands at the end instead of vanishing.

### startSession

> Warmup sets (not counted) — auto-prefill if `is_first_of_muscle`
> §8.4 gives every row an explicit `ramp_sets` count: 2 on the openers, 1 on
> most, 0 on a few. This used to read `plan.warmup` — a v15 STRING like
> "2 sets: 12.5kg×10" — which the Upper/Lower programme does not have, so
> the condition was never true and NO ramp sets were built at all. Raed
> noticed his warm-up sets had vanished; they had.

### startSession

> Sourced ramp: 50% then 70% of the working load (ML L11160/L11162).
> A single ramp set uses the 50% entry, not the 70% one — the point is to
> groove the movement, not to pre-fatigue it.
>
> With no history there is no working weight to take a percentage of, but
> the programme still PRESCRIBES the ramp. Dropping the rows entirely
> silently discarded that instruction on exactly the sessions where he is
> least sure what to do. The rows are built either way; without a
> suggestion they carry a blank weight and read «معايرة», like the working
> sets on a first exposure.

### startSession

> Keyed by the ORIGINAL programme id, with swapped_to naming the
> replacement — the history lookups depend on that shape. `plan` now holds
> the swapped id and the re-entry overlay, so both must come from rawPlan.
> Carry the remembered «وزن الجهاز فقط» choice into the new session, and
> zero the loads it implies — otherwise the card opens with a blank box on a
> machine whose weight he has never had to enter.

### startSession

> `state.current_block` is written NOWHERE. grep the file: it is initialised to
> 1 in defaultState() and read only here, so curBlock was permanently 1,
> isBlockTransition was permanently false, and every block announcement — the
> "block N begins" toast, the block-boundary skin offer, and the deload week's
> own explanation — was unreachable code. The programme's real position comes
> from derivedBlock(), which is what resolveProgrammeBlock already uses.

### startSession

> The deload week has to explain itself. It is the one block where the
> app deliberately asks for LESS, and a lifter who is not told why reads
> fewer sets and a lower effort target as the app breaking, or sandbags
> it, or ignores it — [LADDER] L9844 warns about exactly that. So it gets
> its own sentence rather than the generic "block N begins".

### noteActiveCleared

> Deletes the whole session. It used to be inline in two places, labelled
> «تجاهل التمرين» — "skip the exercise" — behind a native confirm() whose body
> was that same misleading label, with no undo afterwards. Raed asked what it
> did. He could not tell, which is the whole problem: the most destructive
> control in the app read like the least.
>
> confirmAction, not confirm(): an installed PWA can suppress the native one,
> and this is the last thing that should silently do nothing — or silently
> proceed.
> A tombstone for a session the user deliberately ended.
>
> The sync server merges an incoming push against the head row. When the client
> sends `active_session: null` — because he finished or discarded one — the
> server could not tell that apart from "this writer simply has no session
> running", so it restored its own copy. Measured against the real merge:
> finishing a session put it in history AND brought it back as "in progress",
> so finishing again duplicated it and double-counted the volume; discarding
> one simply undid the discard.
>
> The server cannot infer intent, so the client states it. Only the exact
> session named here is cleared; a genuinely concurrent session from another
> device is untouched.

### discardSession

> Finishing a session offers an undo; discarding one did not, and discard is
> the more dangerous of the two — it is a bare tap plus a confirm standing
> between him and an hour of work, with no record afterwards anywhere. The
> session is kept in memory and put back exactly as it was, the same way
> reopenSession restores a finished one.

### endSession

> Finishing with exercises still open used to archive silently. The guard
> above only fires when NOTHING is resolved, so the realistic case — one
> exercise done, six untouched, a mistaken tap on "finish" — went straight
> into history as a completed session. My own checklist claimed this was
> handled; it was not, and only the empty case ever was.
>
> Reopening from history exists, so this is recoverable, but it silently
> records a session he did not do and feeds the volume ledger a wrong number.

### endSession

> The rest timer is a session-scoped thing and nothing ever stopped it. Tick
> the last set (rest starts), tap «إنهاء وحفظ», and the floating ⏱ kept
> counting over the summary screen, then vibrated, toasted and fired a system
> notification for a workout that was already over. cancelRest was bound to
> exactly one thing: the ✕ on the overlay.

### applySetEdit

> Every edit to a weight or a reps box goes through here.
>
> This rule used to live in `updateRunnerSet(exerciseId, setIndex, ...)`, which
> was defined here and called by NOTHING — grep across the whole repo returned
> its own definition and nothing else. The two <input> handlers on the card
> assigned `set.weight` / `set.reps` directly and never cleared the flags, so
> the documented behaviour — "editing is recovery, not a dead end" — had never
> once run. A row he flagged invalid stayed invalid however he corrected it,
> and stayed uncountable, so the volume ledger kept ignoring a set he had
> fixed. Same shape as superset_group: the rule was written, the reader was
> never connected.

### applySetEdit

> Debounced, because this fires on every CHARACTER he types into a weight box
> and saveLocal() serialises the entire state — history included — twice, once
> for state and once for settings that did not change.
>
> Measured on a fast Mac with real volumes: one year of training is 1.5 MB and
> 5 ms a keystroke; three years is 4.5 MB and 9-16 ms. A phone is several times
> slower than that, in a gym, mid-set, while he types "42.5".
>
> The VALUE is already in `state` on the line above, so nothing is at risk
> between keystrokes: any later save — ticking the set, ending the session,
> leaving the field, hiding the app — writes it. Those flush points are wired
> below.

### appendExerciseToSession

> The coach searches the 33 Nippard works Raed owns and answers out of them,
> showing the passages it used with book and page.
>
> It used to only quote, and this comment used to say "it NEVER writes an answer
> of its own" — true until 2026-09-03, and dangerous to leave standing once it
> stopped being true, because it would send the next reader looking for an
> architecture that is no longer here.
>
> What did NOT change is the rule underneath it. A generated training cue that
> sounds confident and is wrong is the one failure this app cannot absorb, so:
> no passages means the model is never called, and an answer that names no
> passage is not shown. Only who assembles the sentence changed.

### (orphaned between showSessionPreview and the coach)

> This is intentionally the v15 hand-off: show the selected platform's real
> playlist links, open them in a separate tab, and leave playback to Spotify.

### (orphaned between showSessionPreview and the coach)

> Phase 6: the old v15 workout card, deliberately retained as a card rather
> than another full-screen runner concept. State mutations still go through
> the Phase 4/5 guarded helpers so skip/invalid/weight rules are unchanged.


---

## `core/store.js`

### storageFailed

> ---- Guarded storage ---------------------------------------------------
>
> Every write in this file used to call localStorage.setItem bare. There was no
> try/catch on a single one of the fifteen, and no window.onerror either. A
> QuotaExceededError — a full origin, Safari with site data blocked, a private
> window — therefore threw straight out of saveLocal(), out of the tap handler
> that called it, and died as an uncaught page error. Proven, not theorised: a
> probe that made setItem throw showed the set still ticked on screen, no toast,
> no sync status, and nothing written. He would have finished the workout and
> found it gone.
>
> So: writes never throw, and a failed write is LOUD. It also stops pretending
> the data is safe locally and pushes to the server immediately, because the
> cloud row is the only place left that can hold it.

### defaultState

> Per-exercise equipment memory. Raed does leg press on a different machine
> depending on which is free, and 60 kg on one is not 60 kg on another — so
> the machine has to be part of the record, not a note he keeps in his head.
> { exercise_id: { equipment, device, known_devices: [] } }

### defaultSettings

> `focus_mode` and `show_cues` lived here for months as dead state: no reader
> anywhere in the file and no control in Settings. v15 had a real focus-mode
> switch (one exercise vs all); v16 always renders one, which is the low-scroll
> runner Raed asked for repeatedly — so the BEHAVIOUR is the one he wants and
> only the unused key is gone. If he wants the choice back it is a real
> feature to build, not a key to re-add.

### loadLocal

> «Off» is enforced here, not only by the button that turns it off.
>
> The toggle deletes the log when he switches recording off, but the setting
> can also arrive off from somewhere else — a restored backup, a sync from his
> other device, an imported profile — and a record of his taps sitting on the
> phone while the switch reads Off is not what Off means.

### STORAGE_BUDGET_BYTES

> Headroom, NOT pruning.
>
> `state.history` grows forever — about a megabyte a year at four sessions a
> week, against a localStorage budget of roughly five. That is years away, and
> deleting his training history to stay under a limit is not a trade this app
> gets to make on its own. So nothing is ever removed here. The only job is to
> stop the ceiling arriving as a surprise: measure what this app is actually
> using, and say so once, early, while there is still plenty of room to act.
>
> Cheap enough to run at boot and after a session, nowhere near the keystroke
> path.

### TAP_LOG_KEY

> Interaction log — his idea, and a better one than describing a problem in
> words: «وش رأيك تصير أنت تراقب الضغطات وأزراري ونجلس نسجل كم جلسة، وبعدين بعد
> كل جلسة أقول لك ها وش رأيك».
>
> Deliberately narrow, because this records a person:
> - OFF by default, and only he can turn it on.
> - Never leaves the phone. No sync, no server, no automatic anything. It sits
> in localStorage until he taps export and hands it over himself.
> - Records WHAT was pressed and WHEN, never what he typed. A question to the
> coach, a weight, a device name — none of it is his interface, and none of
> it belongs in a log about buttons.
> - Capped, and it drops the oldest first. An unbounded log on a phone whose
> storage already has a headroom warning is a way to lose a workout.

### recordTap

> Rides the SAME debounce a weight edit uses. saveLocal() serialises the
> whole state twice, and a log entry is never worth that between him and the
> next set — scheduleSetEditPersist already coalesces at 400ms and every
> flush point (ticking a set, hiding the app, ending the session) writes it.


---

## `core/sync.js`

### flushSync

> Name the likely cause instead of echoing a raw error. Unreachable and
> rejected are different problems with different fixes, and telling them
> apart on screen is what turns "فشلت المزامنة" into something he can act
> on — or report to me precisely.

### flushSync

> «حُفظت محلياً» is only true when the phone actually accepted the
> write. With storage failing too there is no copy anywhere, and
> saying "saved locally" would be the single most misleading sentence
> the app could show him. A probe caught this one overwriting the
> storage warning three seconds after it appeared.

### syncFailureReason

> Turns a fetch failure into something Raed can act on. A network-level failure
> and a rejected request are different problems: one means the server cannot be
> reached at all, the other means it answered and said no. Reporting them the
> same way is what made a real outage take an investigation to diagnose.

### syncFailureReason

> Chrome 147 blocks a public page from reaching the "local address space"
> behind a permission. On a machine running Tailscale, MagicDNS resolves the
> sync host to its 100.x CGNAT address, so Chrome classifies it as local and
> refuses — while Safari, which does not implement Local Network Access,
> works on the same machine against the same server. Diagnosed 2026-09-02:
> every request failed with net::ERR_FAILED and "Permission was denied for
> this request to access the `local` address space".
>
> Naming it matters: "cannot reach your server" sends him to check the
> server, which is healthy. The problem is one browser's permission.

### adoptProfileLocally

> Adopt a profile on THIS device without ever discarding what the device
> already holds for it.
>
> This and openProfile below both used to do `state = { ...defaultState() }`
> and then persistLocal(). Nothing read the stored state first. So tapping your
> own name on the welcome screen with the server unreachable — gym wifi, HP
> off, aeroplane mode — wrote a blank state straight over your training log.
> Proven with a probe: three sessions and a personal record seeded, tile
> tapped, both gone. There was no undo and no warning, and the suite was green.
>
> Now the stored state is loaded first and only genuinely missing profile
> fields are filled in. A brand-new profile has nothing stored, so it still
> starts empty — the same result, reached without destroying anything.


---

## `core/videos.js`

### videoIdentity

> ---- Video visibility helpers --------------------------------
>
> A hidden clip is remembered by WHICH CLIP it is, not by where it sits in the
> list. It used to be the position — 'mohannad_0', 'mohannad_1' — and the list
> is not stable: videos.test.mjs exists precisely because clips get retired
> when YouTube takes them down, and retiring one shifts every clip after it.
>
> Measured on incline_chest_press, which carries three: hide the second
> (wMksQXD01K0), retire the first, and 'mohannad_1' now names o0Ud3RU59hw. A
> clip he deliberately hid comes back and a different one disappears, silently.
> It is the wrong-video failure D8 is written against, arriving through the
> back door of a preference.

### migrateVideoHiddenKeys

> One-time conversion of the positional keys already stored. It is only correct
> while the lists still match what they were when he made the choice, which is
> why it runs at load rather than lazily — the moment a clip is retired, the
> old keys stop meaning anything and there is nothing left to convert.

### migrateVideoHiddenKeys

> Whether anything actually moved. The first cut called saveLocal() on every
> load — including the overwhelmingly common case of an empty video_hidden —
> and saveLocal() marks the state dirty for sync, so every boot queued a push.
> Twelve browser tests started failing on `page.reload: Timeout 20000ms` and
> the suite went from 2.9 to 8.0 minutes. A migration that finds nothing to do
> must leave no trace but its own version marker.

### migrateVideoHiddenKeys

> buildExerciseVideos still emits the old positional `key` alongside each
> clip, so the map comes straight from it. Reconstructing the key by hand
> got the custom-video index wrong — those count within their own list,
> not the combined one.

### addCustomVideo

> Adding a clip, hardened.
>
> Raed is building the library himself, from his phone, one clip at a time:
> "أنا وأنا أمشي بظيف، أضيف أضيف مقاطع لين أبني مكتبة كويسة". So the whole path
> has to survive being used on a phone, repeatedly, with a paste.
>
> What it replaces was a native prompt() that:
> * an installed PWA can suppress outright, which is exactly where he uses it;
> * is painful to paste into on iOS;
> * stored the raw string, so youtu.be/ID and youtube.com/watch?v=ID became
> two different clips of the same video;
> * said "added" whether or not the change ever reached the server.
>
> His synced state carried ZERO custom videos, which is what sent me looking.

### ytIdFromUrl

> Anchored to a real http(s) YouTube URL.
>
> The pattern was unanchored, so it matched a video id ANYWHERE in the string
> and `javascript:alert(1)//v=AAAAAAAAAAA` was accepted as a valid clip. That URL
> is then stored and rendered as `href: v.url` on the exercise card — tapping the
> tile would execute it. Clips also arrive from a synced or imported state, not
> only from him typing one in.

### buildExerciseVideos

> Clips Raed chose himself in the link picker. Stored as full URLs, not bare
> ids, because three of them carry a ?t= that points at the right exercise
> inside a long video — drop the timestamp and it becomes a different
> movement, which is the wrong-video case D8 forbids.

### isSafeHttpUrl

> A citation URL reaches this page from a web search the model ran, so it is
> untrusted input that ends up in an href. `javascript:` and `data:` hrefs
> execute on tap; nothing was checking the scheme. Only real http(s) links are
> offered, and anything else is dropped rather than shown as an inert chip —
> a source he cannot open is not a source.

### EQUIPMENT_PATTERNS

> ---- Clip classification -------------------------------------------------
> Raed: "بعض مقاطع الفيديو تكون special لتمرين... بالمشين، بالدمبل، بالكابل...
> نحتاج نلاقي طريقة نصنف كل واحدة منها".
>
> Two exercises may share a clip only when they are the SAME movement on
> different equipment. That is a narrow claim and it has to stay narrow:
> stripping words too eagerly put a standing shoulder press in the same family
> as a decline chest press, and a clip of one is a WRONG clip for the other —
> which is the case D8 exists to prevent.
>
> So equipment words are stripped and nothing else. Angle (incline/decline/
> flat), posture, grip and side are movement-defining and stay in the key, and
> the primary muscle is part of the key as well. Six families survive that,
> which is the point: a small honest set beats a large wrong one.


---

## `ui/coach.js`

### renderCoach

> The ask box is the subject of this screen ONLY while the screen is empty.
>
> It was built as the hero and then stayed the hero after answering — 250px of
> icon, title and promise sitting above the thing he actually came for, on
> every single answer. «أبغى أغيّر الصفحة حقة المدرب كاملة.» Once there is an
> answer the question is context, not an invitation: it collapses to one line
> carrying what he asked, with a tap to ask something else.
> What collapses is the CHROME, never the field.
>
> The first version of this replaced the whole box with a pill showing his
> question, which cost him the input: asking a follow-up became tap «سؤال
> جديد», then type. He asks follow-ups. Two coach tests caught it by failing
> to find [data-coach-input] — the right failure for the right reason.
>
> So the icon, the title and the promise are what go. They are an invitation,
> and an invitation is only worth 250px while the screen is empty.

### renderCoach

> Roughly 57% of this screen was empty — measured, 481px of 844. What
> belongs in it is not decoration: the questions he actually asked, so he
> can re-ask one without typing, and a plain statement of where the answers
> come from, because the whole point of this coach is that it answers from
> HIS books and says so.

### renderCoach

> Three outcomes, three different things on screen. Collapsing them is how a
> retrieval failure turns into a training answer Raed trusts and shouldn't.
> The monthly ceiling was reached. Retrieval is local and free, so his books
> still answered — he has the passages, just not the written prose. Saying
> which is the point: an answer that silently stops being written reads as the
> coach being broken.

### coachPassageCard

> The fade only belongs on text that is actually cut off.
>
> `clipped` was applied whenever the card was collapsed, regardless of length,
> so a two-line passage got a mask over its last 35% and a finished sentence
> read as truncated — while «اقرأ المقطع كاملاً» sat under it offering to
> reveal nothing. CSS cannot ask "did this overflow", so it is measured after
> layout and the class is added only if it did.

### renderCoachAnswer

> The answer, then the passages it was built from, then the rest.
>
> The order is the point. Raed asked for an answer in Arabic instead of five
> English paragraphs, but the passages stay on screen underneath it so the
> answer is always checkable against the book it came from. The ones the model
> actually cited come first and are marked; the others are collapsed, because
> showing five sources for a two-source answer implies five were used.

### renderCoachAnswer

> Say so when this is yesterday's answer rather than one just returned. The
> screen is otherwise identical either way, and an answer that looks live is
> the sort of small lie that costs trust in a coach whose entire pitch is
> that it shows its sources. The clear also gives him the suggestion chips
> back, which the restored answer replaces.

### renderCoachAnswer

> `answered` alone is not enough. The model returns the flag and the source
> list independently, so {answered: true, used: []} is reachable — a confident
> sentence with nothing under it, which is exactly the shape this feature was
> built to make impossible. An answer that names no passage is treated as no
> answer, and the passages are shown so he can judge for himself.

### renderCoachAnswer

> An answer off the open internet is a different kind of thing from a line in
> a book he paid for, so it is a separate state rather than a badge on the
> same card. It carries URLs instead of passage numbers, and it never claims
> his books as its source.
> Same rule as the library answer above, which the web branch used to skip.
> `fromWeb` asked only for status/source/text, so {source:'web', citations:[]}
> rendered a confident card headed «من الإنترنت — مو من كتبك» with nothing
> behind it at all. An answer off the open internet that cannot name where it
> came from is worth LESS than one from his books, not more, and this feature
> exists precisely to make an unsourced claim impossible.

### renderCoachAnswer

> The model claimed an answer and named no passage for it. Its sentence is
> NOT printed: an unsupported claim is the one thing this screen must never
> put in front of him, and reprinting it under a "not in your books"
> heading would do exactly that while looking careful.

### renderCoachAnswer

> Not an error state. The search worked; the books do not cover it.
>
> The model's own sentence used to be printed here, while the `unsourced`
> branch three lines up deliberately refuses to print it — two branches
> disagreeing about the same principle. A refusal sentence is still
> unverified prose, and it routinely smuggles a claim: "your books don't
> cover this, but generally rest two to three minutes" is an answer with no
> passage behind it, which is the one thing this screen exists to prevent.
> The fixed line plus the near-miss passages below carry everything
> actionable. Restoring it is one line, if Raed decides he wants it back.

### renderCoachAnswer

> Nothing from the library is shown under a web answer. The passages that
> came back are the ones the model judged did NOT answer the question, and
> printing them here would look exactly like sourcing. The usual footer is
> omitted for the same reason: «مكتوبة من المقاطع بالأسفل» would be a lie
> when there are no passages below.

### renderCoachAnswer

> Collapsed whenever the passages are not the answer — either because the
> answer named the ones it used, or because there IS no answer and these are
> the near-misses. Asking about kabsa and getting two full screens of vegan
> protein is noise, and printing it at full length reads as if the app
> thought it was relevant.


---

## `ui/end.js`

### renderSessionEnd

> Was a hand-written innerHTML string, and the only one in the file: English
> («Session saved.» / «Home») on an Arabic-only screen, and markup where
> every other screen builds nodes. The Arabic-leak scan could not see it
> because it looked at toast() and t() calls, not at raw markup.

### renderSessionEnd

> 'Session done.' — with the full stop — was in no locale entry, so this
> one heading rendered English on the screen shown after every workout.
> session_done_title is keyed to 'Workout finished'; the two strings were
> never the same, which is why the Arabic gate did not catch it.

### renderSessionEnd

> The once-a-week check that research/06 §7.3 turns on. It appears here
> because he has just trained and knows exactly how the week has felt, and
> it appears ONCE a week — the source measures these signs over a week, and
> he does not want the app asking him things.


---

## `ui/exercise-card.js`

### renderExerciseCard

> Was also rewriting the ▸/▾ glyph on .ex-status. That element is now the
> settings button, so the query returned null and every header tap threw —
> collapsing stopped working entirely. The card's own class is the state;
> nothing needs to mirror it in text.

### renderExerciseCard

> Was a ▸/▾ chevron that only mirrored the card's state, while the whole
> header did the collapsing. Raed asked for a settings entry in its place;
> since the chevron never was the control, replacing it removes nothing —
> tapping the header still collapses.

### renderExerciseCard

> The emoji, back, at Raed's request: "رجّع الإيموجي الثابت حق إعدادات
> التمرين". It went through three forms and this is the third time he has
> ruled on it, so the reasoning is worth writing down rather than re-deriving:
>
> ⚙   bare U+2699    — a TEXT glyph. Thin, and drawn by whatever font the
> platform picks, so it looked different on his phone
> than anywhere I checked it. He called it "the worst".
> sliders SVG        — matched the app's line set, but he wants the emoji.
> ⚙️  U+2699 U+FE0F  — the emoji presentation: same colour glyph on every
> device, which is the "ثابت" in what he asked for.
>
> The variation selector is the whole difference and it is invisible in the
> source, so: it is deliberate, do not "clean it up".

### renderExerciseCard

> «آخر مرة» is built here, where `last` is in scope, and appended AFTER the
> sets. Raed: "خله بس تحت يعني موجود تحت بدل ما يكون فوق". It is reference,
> not instruction — he needs it while deciding what to type, not before he
> has seen the row he is typing into.

### renderExerciseCard

> Videos.
>
> `runner_video_open` was declared in defaultSettings(), migrated once on
> load, written by nothing and READ BY NOTHING — while GATES.md said it was
> live. Raed asked for this control in his own words: «فيه زي هذه العجلة حقة
> الإعدادات إنه مثلاً أحط أخفي الـvideos... وتكون مخفية، أهم شيء يكون real app
> وتتذكر التصرفات». The gear he pointed at now owns it, and it is remembered.
>
> Two levels, because he described both: this switch hides the strip during a
> workout without forgetting anything, and the per-clip marks below it in the
> sheet are still the Library's choices about individual clips.

### renderExerciseCard

> Half the catalogue he can reach by swapping has no clip of its own — 39
> of 78, measured. Where the SAME movement exists on other equipment, its
> clip is offered here, labelled as exactly that and never mixed in with
> the exercise's own tiles. The label is the whole point: the movement is
> the same and the setup is not, and a clip presented as this exercise's
> own would be the wrong-clip case D8 forbids.

### renderExerciseCard

> The one number that actually moves the weight. The engine raises load only
> when EVERY working set hits the TOP of the rep range, so a range alone left
> Raed guessing whether 10 or 12 was the point -- and 10 would have held the
> weight still forever without explaining why.
> The engine has always explained WHY it suggests this weight. v16 kept the
> calculation and dropped the render, so the number looked arbitrary — the
> exact thing Raed complained about not understanding. Shown compactly, above
> the rep goal, and NOT as a form cue (those he removed on purpose).
>
> One of the nine notes is dropped: why_match_or_beat, «المرة الماضية: 10 كغ
> × 6. اعدلها أو تجاوزها». Raed asked for it gone — "وش أعدلها أو أتجاوزها ما
> أدري صراحة" — and he is right about that one specifically: «آخر مرة» below
> already prints every set of last session, so the note repeated a subset of
> it and added an instruction that names no number to aim at. It is also the
> FALLBACK branch, so it was the note he saw most often, which is why the
> whole feature read as noise.
>
> The other eight stay. They each explain a DECISION — hold this load, bump
> it, add a rep instead because this is an accessory, today is a calibration
> — which is exactly the "رقم بدون سبب" he asked to fix. Removing those to
> satisfy a complaint about the one that explains nothing would delete the
> answer along with the noise.

### renderExerciseCard

> The effort target gets its OWN line rather than trailing the goal sentence.
> Three words after «أكمل 12 في كل المجموعات ليرتفع الوزن» wrapped into a
> run-on with an orphan on the second line — «خفيف — بقصد» alone is four
> words. Two short lines read faster than one long one.
> Spelled out, not looked up by a computed key: the locale gate reads every
> lookup in this file to prove its key exists, and a built key defeats it.

### renderExerciseCard

> Raed: "نشيل الأرقام، ويكون بس اللي موجود اللي بالخلفية". The row number
> was never information he needed — he knows which set he is on because
> it is the next empty row, and the rep target is already on the card.
> Ramp rows keep a mark, because "this one is a warm-up" IS information
> and it is the only thing distinguishing them from working sets.

### renderExerciseCard

> A placeholder is not a label: it disappears the moment he types, and
> VoiceOver announced these two boxes as an unnamed pair of number
> fields. The set number is in the name because the row itself no longer
> shows one.

### renderExerciseCard

> This is THE control of the app — the one he taps after every set — and
> it had no accessible name at all. It is an icon-only toggle, so it
> needs both a name and a state; without aria-pressed a screen reader
> cannot tell a ticked set from an unticked one.

### renderExerciseCard

> hasValidWorkingValues, NOT hasWorkingWeight. The card carried its
> own stricter copy of the rule requiring weight > 0, so a
> «وزن الجهاز فقط» set — which is legitimately 0 kg — could be
> created but never ticked complete. The domain function already
> distinguishes an explicit 0 from an untouched empty box; keeping
> a second rule here is what let the two drift apart.

### renderExerciseCard

> Refusing has to REVEAL the thing it is asking for. The picker
> only opened when the second-to-last set was ticked, so ticking
> the final set first — or an exercise with a single working set,
> where there is no prior set at all — got «اختر الجهد» with no
> picker anywhere on screen and no way forward.

### renderExerciseCard

> Move to the other half of the pair. After A1 that is «move right
> into» A2; after A2 it is back to A1 for the next round, and A2's
> own rest_min has just started the timer above — which is exactly
> «rest for the time period indicated in the A2 row».

### renderExerciseCard

> research/07 §2.7 puts a light/normal/heavy tap AFTER the last ramp set, on
> every exercise and not only a first exposure. The app's three efforts are
> already those three words.
>
> «After» is load-bearing, and so is §2.8 on the very next line of that same
> file — «Warm-up sets are not building muscle. No need to overdo or
> over-think them», which it says to put in the UI rather than the docs. A
> permanent second three-face strip inside a card he is working in is
> exactly the clutter he has complained about. So it appears only once that
> ramp set is ticked, and it leaves the moment it has been answered.

### renderExerciseCard

> Raed: "ليش ما تحطها بشكل أنظف جنب الجلسة الأخيرة؟ ليش حاطها تحت، كأن
> مسبب زحمة؟" — it was a full-width block under the sets. Now it is one
> compact face ON the final row; tapping it reveals the three, and
> choosing collapses them again. This is v15's own interaction.
> Raed: it should appear the moment the SECOND-TO-LAST set is ticked,
> because by then he already knows the last one is coming and the picker
> is what the last one needs. Waiting until he taps the final check makes
> him tap twice and reads as the app blocking him.
> Raed: the trigger button is redundant — the picker already opens by
> itself when the SECOND-TO-LAST set is ticked, so a face whose only job
> is to open something that has already opened is chrome. The strip is
> shown directly: prompting when the prior set is done, and staying
> visible afterwards to show the choice he made.
> `priorSet?.completed` alone was too narrow twice over: an exercise with
> ONE working set has no prior set, and ticking the sets out of order
> leaves the immediate predecessor unticked while others are done. Both
> hid the picker while the check button demanded it.

### renderExerciseCard

> Under the rows, in the order he reads them: the target for the rows above,
> then what he did last time. Both used to sit ABOVE the grid, pushing the
> first input he touches further down a screen he already said had too much
> scrolling.

### renderExerciseCard

> The per-set row is empty now. Everything that used to sit here — + مجموعة,
> راحة, استبدال, تخطي التمرين, + فيديو, + تمرين, وزن الجهاز فقط — belongs to
> the EXERCISE, not to the set he is in the middle of, and it now lives in
> the settings sheet behind the gear. Raed asked for the row under the sets to
> be clear of them. Nothing was removed; it is one tap away, grouped by what
> each control actually is.
>
> The gear in the card header is the way in, and the header still collapses
> on tap, so the row costs nothing to reach.

### showAddExerciseModal

> Raed: "الـexercise هذا ما تبدل، أضف لي exercise على نهاية التمرين". Swapping
> REPLACES a prescribed movement and charges the volume ledger against it.
> Appending adds a movement the programme never asked for, at the end, without
> touching anything above it. They are different actions and he wanted both.

### showExerciseSettings

> The per-exercise settings sheet.
>
> Everything that belongs to ONE movement lives here. Raed asked for it to be
> designed properly — "neat, جميل, مرتب" — and the reason a flat stack of rows
> would fail is that these controls are not the same KIND of thing:
>
> الجهاز    what this movement is performed on. Configuration, set once.
> السجل     what he has actually lifted here. Evidence, read-only.
> إجراءات   things he can do to this exercise right now. Verbs.
>
> The sheet is structured in that order because it is true of the content, not
> because three sections look tidy. Configuration is what he changes rarely and
> wants to confirm; the record is what he opens the sheet to READ mid-workout;
> the verbs are what he came to press.
>
> The table is the signature. It is the only surface in the app that shows one
> movement across different machines side by side, which is the whole point of
> remembering the machine — a weight history that mixes them is a history of
> nothing. So it gets real typographic care: a header, tabular numerals, the
> load dominant, the machine a quiet tag.

### showExerciseSettings

> Remembered for the EXERCISE, not just this session.
>
> It was written only onto the active session's state, so «وزن الجهاز
> فقط» had to be re-ticked on every workout. Three of the seven
> exercises in his Upper A carry it — the T-bar row, the rope triceps
> extension and the cable lateral raise — which is three taps he was
> making every single session, forever, and a blank weight box until
> he made them.

### showExerciseSettings

> ---- 2b. المقاطع — which clips he sees, from where he is standing -------
>
> The per-clip toggles existed only in Library. Mid-set, that is two screens
> and a scroll away from the card the clip is on, which is why the control he
> asked for never felt delivered even though half of it was there.

### showExerciseSettings

> ---- 2c. الترتيب — where this movement sits in the session --------------
>
> The gym moves machines. Reordering here rather than in Settings because this
> is where his hand already is the moment he walks up and finds the rack gone:
> «ما أدري وين تكون صراحة» — it belongs at the exercise, not two screens away.
>
> Moves the LIVE session and records the order for every future one.

### showExerciseSettings

> ONE grid, one button shape, six actions.
>
> It was three shapes stacked: a full-width primary slab for استبدال, a 2x2
> of outline buttons under it, and تخطي التمرين as a bare red text link — a
> fifth visual language for the one action that ends the exercise. Raed:
> "أعتقد نقدر نرتبها ونخليها بشكل أرتب وأنسق وأصغر... متناسقة".
>
> Now every action is the same box at the same height, and only the FILL
> says what kind it is: استبدال is filled because he uses it most and asked
> for it to lead, تخطي is tinted because it ends the exercise, the rest are
> outlines. Two of them span the full width, so the grid still reads as a
> hierarchy rather than a wall of six identical tiles.

### showExerciseSettings

> ---- السجل — evidence, last ---
> Raed: "ياليت يكون السجل يكون آخر شيء تحت... لأنه هو تاريخ وسرد". He is
> right: it is the only READ-ONLY block in the sheet, so it belongs after the
> things he came to change rather than between them.-------------------------------------------

### showAltModal

> ===== SECTION 1: Replace =====
> The PROGRAMME's own substitutes come first. §8.4 authors a sub1/sub2 for
> every row — Chest Press Machine prescribes Flat DB Press and Hammer Strength
> Press — and this modal was reading only the catalogue's generic
> `alternatives`, which for that same exercise are Incline Chest Press and Pec
> Deck. Swapping therefore offered movements the programme never chose.
>
> The catalogue list still follows, so nothing is taken away; the sourced ones
> simply lead, because they were picked for THIS slot.


---

## `ui/history.js`

### renderHistory

> Delete a logged session. Raed: "حط في إمكانية تعديل السجل... بس حذف
> الجلسة اللي تفرق". It lives INSIDE the expanded panel, not on the collapsed
> card, so removing a session is two deliberate taps and never a mis-tap
> while scrolling the list.
>
> `sess` is the same object as the one in state.history — the reverse() above
> copies the array, not its entries — so indexOf finds the real position.
> Deleting by the loop's index would delete from the wrong end of the list.
> Re-open. Raed: "المفروض السجل أضغط التعديل يفتح لي الجلسة من جديد" — a
> session finished by mistake has to be recoverable after the undo toast is
> gone, which is when he usually notices.


---

## `ui/home.js`

### renderHome

> One centred line while a session runs. It was three stacked blocks —
> kicker, heading, subtitle — for information he glances at, and every
> pixel it took pushed the set rows further down the screen he is actually
> working on. Raed asked for it on one line, centred.

### renderHome

> He asked for "today training / tomorrow rest, at a glance, before I leave
> the house" four separate times and never got it. The rest branch below
> existed but was UNREACHABLE: it needed `planned` to be falsy, and
> getTodayPlannedSession() always returns the next session in the rotation,
> so every single day said «يوم نادٍ» — including days he had already
> finished his week.
>
> The rotation is history-driven on purpose, so the app cannot promise that
> Tuesday is Upper A. What it CAN say honestly is whether he still owes the
> week a session. Once the week's training days are done, today is rest, and
> the card says what is waiting rather than pretending it is due now.

### renderHome

> t() the name BEFORE interpolating. Passing it raw puts "Upper A" inside
> the template, and the combined string matches no locale key — so the
> line renders half-English. The week strip carries the same warning
> twenty lines away, and I walked into it anyway.

### renderHome

> data-home-overview marks "home drew its banner", not "a session is running",
> so it belongs on all three branches. It was on the active branch alone, which
> is why the fresh-install deploy gate — the one case that matters on launch
> day — could not find it.

### renderHome

> Stats row
> Raed wanted to see his week before leaving the house. The programme has NO
> weekday mapping on purpose — he decides which days he trains and the
> rotation follows his history — so this cannot invent a calendar. What it
> can say honestly: which days he actually trained (fact), what today is
> (fact), and how many sessions are left this week (arithmetic).
> Everything from here to the music card is pre-workout context. During a
> running session it gets ordered BELOW the exercise (see .home-context in
> styles.css): the first set row sat at y=952 on an 844px screen, so logging
> the opening set of every exercise began with a scroll.

### renderHome

> Order matters more than any of the styling below it. The one button he came
> to this screen to press was at y=462 on an 844px phone, under a week strip
> and three stat tiles — 482px of context ahead of the action. The strip and
> the tiles are things he reads; the button is the thing he does. Everything
> appended to `context` before this point now goes after it.

### renderHome

> A stat tile's number, sized so it can never leave the tile.
>
> The tonnage tile is the problem: it read 13,360 at 31px in a box ~104px
> wide inside, which was already touching both edges, and it only goes up —
> six figures within a year, seven eventually. A number that outgrows its box
> is not a rounding question, it is the box lying about what it holds.
>
> Digits, not characters: the separators are narrow and the caption is what
> sets the tile's width, so counting 0-9 is what predicts the overflow.
>
> A zero is drawn in the muted colour, not the accent. Saturday morning, two
> of these three tiles read 0 — correct, and at 31px in brand orange they were
> the loudest thing on the screen. The number he has not earned yet should not
> shout; the moment it becomes 1 it takes the accent.

### renderHome

> Tonnage is the one tile whose number keeps growing. It reads 13,360 today
> and will read six figures inside a year, in a tile one third of a phone
> screen wide — so the size has to come from the number, not from a
> constant. statNum() steps it down by digit count; nothing else on this
> row needs it, but they all get it so the three tiles stay one family.

### renderHome

> Name the platform he actually chose.
>
> This line was the hardcoded string «🎧 سبوتيفاي — شغّل وانسَ الموضوع»,
> printed whatever he picked. v89 gave YouTube Music and Apple Music their
> own links, so the LINKS started changing while the LABEL above them kept
> saying Spotify — which is exactly what he reported twice: «لما أغير إلى
> موسيقى مختلفة، يصير العزال كاتب سبوتيفاي». Fixing the resolver without
> fixing its label fixed the half he could not see.

### renderHome

> The Phase 6 block that used to sit here short-circuited with `return`, so
> v15's real session view below — warm-up phase, focus mode, Prev/Next, the
> exercise cards, the terminal controls — never ran. Raed: "ما في زر Next،
> Next exercise, previous، ما في". Removed so the original code owns this.

### renderHome

> Every exercise resolved — done or skipped. Raed: "إذا انتهى التمرين ما
> تطلع الصفحة اللي فوق الكبيرة". Keeping the full exercise card, its
> clips and its set grid on screen after the work is finished left a long
> page with nothing left to do on it. Show what he asked for instead:
> how long it took, and the way out.

### renderHome

> Progress. Raed called the old one bad and he was right: seven identical
> 6px bars, where the only cue was which one carried the accent. It
> answered neither question you have mid-set — where am I, and how much is
> left — without counting bars.
>
> Now the count is a number instead of something to count, the current
> segment is visibly the current one, and each segment is a real tap
> target instead of a 6px sliver. Still one row: vertical space here is
> exactly what pushes the set grid off the screen.

### renderHome

> The guard protects real tap targets from being hijacked by a drag —
> but the settings gear sits in the middle of the header, exactly where
> a swipe across the card ends. It was a <div> chevron before, so this
> never bit; as a <button> it silently swallowed the gesture.
> A 60px horizontal drag is unambiguously a swipe, and the click that
> follows is already suppressed by swipeJustHappened, so the gear still
> opens on a tap.

### renderHome

> "Finish & save" belongs on the LAST exercise only. Raed: he wants it in
> one place, and the point is less scrolling — a full-width primary button
> repeated under every exercise is the thing he keeps scrolling past.
> "Discard exercise" stays available everywhere, because skipping one
> movement is a per-exercise decision.

### renderHome

> Small, and available throughout the session again.
>
> He asked for the box to stop being huge, so I made it small AND moved it
> to the last exercise only. The size was the ask; the move was mine, and it
> was wrong — he went looking for it mid-session and it was not there:
> "رجّع زر تجاهل الجلسة". Abandoning a session is something you decide in
> the middle of one, not after scrolling to the end of it.
>
> What stays from that pass is everything that made it safe: it names the
> session rather than reading as "skip this exercise", and it confirms
> in-app with the consequence spelled out.

### renderHome

> No spacer here. .section-label already carries margin: 22px 2px 10px, so
> the 24px block on top of it made a 46px hole between the Spotify card and
> «خطة التمرين» — two rules doing one job, which is what Raed spotted and
> asked what the point of it was. There isn't one.

### renderHome

> The number belongs to the English exercise name, so the two are
> one isolated LTR run rather than a bare template string — and the
> row reads left-to-right like the name it carries. Raed: "ترتيب
> التمارين واحد اثنين... المفروض يصير على left side، لأن التمرين
> بالإنجليزي".


---

## `ui/kit.js`

### EFFORT_LEVELS

> ---- Final-set effort -----------------------------------------
> D16/D17: coarse ordinal effort is a final-set check-in, not numeric RIR.
> The emoji are v15's, unchanged: 😌 / 💪 / 🥵. v15 stored an RPE number (7/8/9)
> behind them; D16 replaced that with three words. The faces map one-to-one onto
> the words, so this is v15's picture over v16's meaning — nothing numeric returns.
> v15 hid them behind a popover (two taps). These stay inline (one tap), because
> one-thumb logging outranks copying the interaction.

### progressRing

> The home hero was 125px tall with every word pinned to the right edge and the
> left 55% empty — measured, not eyeballed. Nothing filled it because nothing
> on Home said where he stands in the week; that number lived only in a
> paragraph further down. A ring says it in one glance and gives the screen the
> single focal object it was missing.
>
> The arc is --accent, but the numeral inside is --accent-label: in the ورق
> dark skin --accent is #743d4a, which is a fine stroke and an unreadable
> letter. scripts/lint-contrast.mjs enforces that distinction.

### explainMark

> A quiet "?" that explains one term in place. Raed asked for something the
> size of a copyright mark that opens a plain sentence — "شيء مرة بسيط يطلع" —
> after the coach gave him a poor answer for "superset". This is not the coach:
> it is a fixed definition sitting next to the word it defines, so the answer
> is instant and cannot be wrong.


---

## `ui/library.js`

### editJNUrlPrompt

> Was a native prompt(): English, unstyled, and suppressible by an installed PWA
> shell — the same class already replaced everywhere else, missed because the
> earlier scan only looked for a quoted literal after the paren and this one
> interpolates the exercise name.


---

## `ui/settings.js`

### renderSettings

> A settings row that answers its own question.
>
> These were seven identical white slabs: no icon, no subtitle, no grouping,
> the chevron floating just left of the label and about two thirds of every
> row empty. Nothing could be learned without opening all seven in turn, and
> «سحب البيانات» — which can wipe the device — looked exactly like «المساعدة».
>
> The dead space becomes the answer: each row carries the state he would have
> opened it to read. The chevron moves to the far end where a disclosure
> indicator belongs, and the icon anchors the start edge so the rows scan as a
> list rather than a wall.

### renderSettings

> Rest timer.
>
> Raed asked why the timer says 2:30 while this box says 120. Because the
> programme prescribes rest PER EXERCISE (rest_min: 2.5 on Machine Chest
> Press), and prescribedRestSeconds() rightly prefers it. This value is only
> reached for a row that has no prescribed rest.
>
> The old label said "Default seconds between sets", which reads like the
> control for every set. A setting that looks like it governs something and
> is quietly overridden is worse than no setting: he changed it, watched
> nothing happen, and had to ask.

### renderSettings

> Choosing again clears the veto.
>
> Declining a proposal writes block_skin_rejections[block] = true, and
> the domain refuses that block forever after. Changing the mapping
> wrote only the suggestion — so the select would sit there displaying a
> skin the app had already decided never to offer him again. A rejection
> is «not that one», not «never ask about this block».

### renderSettings

> Every block the programme actually has, read from the programme rather than
> hard-coded. It listed [1, 2, 3] while the mesocycle gained a fourth block —
> the deload — so the one week whose whole point is that it feels different
> was the one week he could not give a skin to.

### renderSettings

> The coach's own section, collapsed like every other one. I shipped it open
> and full-height at the top of the page — Raed: "المفروض فيه زر زي الزر حق
> الإعدادات الباقية... نفس السهم اللي على اليمين". He is right: a settings
> page where one card behaves differently from the other six is not a
> settings page, it is six settings and an announcement.
> Each hint is the thing he would have opened the row to find out. Built
> defensively: a settings screen must render even when a value is missing.

### exportTapLog

> ---- Boot ---------------------------------------------------
> Hands the log over as a file HE shares, deliberately: no upload, no endpoint,
> nothing automatic. A Blob download rather than a copy-to-clipboard because a
> thousand lines do not survive a paste on a phone.


---

## `ui/warmup.js`

### renderWarmupPhase

> Three lines of preamble used to sit above the first thing he does: an
> eyebrow («المرحلة الأولى · الإحماء»), a heading repeating it with a time
> cap, and a sentence describing the two steps that are listed immediately
> below in full. Raed: "أول شيل هذا على طول... ما لها سنة". He is right —
> the screen only ever has two steps, both numbered and named, and nothing
> above them said anything the steps did not.

### renderWarmupPhase

> Each drill carries ITS OWN clip, on its own row. They used to be collected
> into one "warm-up clips" strip underneath, which is what Raed objected to:
> "المفروض تكون لكل تمرين مقطع خاص... حاطني إنت كل المقاطع سوا". The strip
> existed because the row is a tick button and a link cannot live inside a
> button — tapping to watch would also have marked the drill done. The answer
> is not to move the clip away from its drill; it is to give the row two
> targets: the tick, and the thumbnail beside it.
