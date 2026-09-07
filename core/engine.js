/* Programme resolver, deload trigger, load suggestion, streaks and substitutions.
 * Reads state; never touches the DOM beyond a toast. */

import { $, h, toast } from '../core/dom.js';
import {
  fmtKgValue,
  hasWorkingWeight,
  localISODate,
  muscleLabel,
  t,
  tf,
  todayISO,
} from '../core/i18n.js';
import { focusExerciseIdx, setFocusExerciseIdx } from '../core/session.js';
import { saveLocal, settings, state } from '../core/store.js';
import { getAllExercises } from '../core/videos.js';
import {
  REPORTED_SIGNS,
  SIGN_THRESHOLD,
  detectStrengthLoss,
  nextWeekId,
  shouldDeload,
  signsThisWeek,
  weekId as makeWeekId,
} from '../domain/deload.js';
import { nextHistoryDrivenSession, resolveProgrammeBlock } from '../domain/programme.js';
import { isCountableWorkingSet } from '../domain/runner-session.js';
import { assessSubstitution } from '../domain/substitutions.js';

// ---- PR detection (silent) -----------------------------------
export function prScore(kg, reps) { return kg * (1 + reps / 30); }  // Epley 1RM estimate
export function detectPR(exercise_id, kg, reps) {
  if (!kg || !reps) return false;
  const score = prScore(kg, reps);
  const prev = state.prs[exercise_id];
  if (!prev || score > prev.score + 0.001) {
    state.prs[exercise_id] = { kg, reps, date: todayISO(), score };
    return true;
  }
  return false;
}
// ---- Programme resolver --------------------------------------
// The week is DERIVED from logged sessions, not stored. state.current_week was
// initialised to 1 and never assigned anywhere, so the resolver always picked
// Block A and Block B — weeks 5-8, with its own exercises (EZ Bar Curl, Overhead
// Rope, Machine Lateral Raise instead of the Block A three) — was unreachable
// forever. He could have trained for months and never seen the second half of
// his own programme.
//
// Four sessions to a week, which is the programme's own frequency, and the same
// history-driven principle the session rotation already uses. Deriving it means
// there is no counter to forget to advance, and it self-corrects if he misses a
// week or logs two sessions in a day.
// Only sessions from THIS programme move the programme clock.
//
// This was `state.history.length`, which counts everything — including the v15
// full-body sessions the migration deliberately preserves, and anything he
// restores from a backup or imports from a JSON export. Since the clock is
// `sessions / 4`, importing a few months of old history would drop him into an
// arbitrary week: block B, block C, or straight into a deload he has not earned,
// and it would fire the six-month review prompt at the wrong time.
//
// Counting by the current rotation's session ids is the check that matches how
// the week is used. Entries with no session_id at all are counted, because a
// hand-restored row from this programme should not be silently ignored either —
// the failure mode being closed is a FOREIGN programme, not a sparse record.
export function completedSessionCount() {
  const rotation = new Set((RW.PROGRAMME?.rotation_order) || []);
  if (!rotation.size) return (state.history || []).length;
  return (state.history || []).filter((entry) => {
    const id = entry?.session_id;
    return !id || rotation.has(id);
  }).length;
}
// The mesocycle REPEATS. It used to stop.
//
// This was `Math.min(lastWeek, ...)`, so once he had trained past the end of the
// programme the week froze there permanently: Block B on a loop, for ever, with
// no deload and no end. He asked whether the programme advances by itself —
// it did not, it ran out.
//
// Now the weeks wrap. A cycle is A(1-4) B(5-8) C(9-11) deload(12), and week 13
// is week 1 of the next cycle with his logged loads carried forward — which is
// what makes the next twelve months take care of themselves. `research/06` §7.2
// is the authority for what week 12 is; standard periodisation is the authority
// for starting again after it, and every source here agrees a deload is followed
// by a return to work, never by more deload.
export function programmeCycleLength(programme = state.programme_overrides || RW.PROGRAMME) {
  return Math.max(...(programme.blocks || []).map((block) => block.week_end || 0), 1);
}
export function weeksElapsed() {
  return Math.floor(completedSessionCount() / 4);
}
// 1-based: his first twelve weeks are cycle 1.
export function derivedCycle() {
  return 1 + Math.floor(weeksElapsed() / programmeCycleLength());
}
export function derivedWeek() {
  return 1 + (weeksElapsed() % programmeCycleLength());
}
export function derivedBlock() {
  const programme = state.programme_overrides || RW.PROGRAMME;
  const week = derivedWeek();
  const found = (programme.blocks || []).find((block) => week >= (block.week_start || 1) && week <= (block.week_end || 99));
  return found?.block || 1;
}

// ---- Trigger-based deload (research/06 §7.3) -----------------
//
// The ruling in `06` §7.2 is «[LADDER] wins. No scheduled deload in the first
// block. Deload on trigger, with a week-12 backstop.» Only the backstop was
// built. The trigger — the part the ruling actually turns on — was prose.
//
// §7.3: fire when ≥2 of six warning signs are true AT THE SAME TIME for ≥1
// week. Five of the six are things only he can report; one, «persistent loss of
// strength», the app can see for itself. So it asks once a week, at the end of a
// session, and supplies the sixth from his own logs.
//
// Asking once a week is not a UI preference, it is the rule: "for ≥1 week" is
// the unit the source measures in, and he has said plainly he does not want the
// app chattering at him.
export const DELOAD_SIGNS = REPORTED_SIGNS;
export const DELOAD_SIGN_THRESHOLD = SIGN_THRESHOLD;
// Spelled out rather than looked up by a computed key. The locale gate reads
// every lookup call in this file to prove its key has an entry, and building the
// key by concatenation defeats it — the gate saw the prefix alone as the key.
// (It also read the first draft of this comment, which quoted the concatenation
// verbatim, and flagged that too. Correctly.) Each label below is a literal.
export const DELOAD_SIGN_LABEL = {
  joint_aches: () => t('sign_joint_aches'),
  exhausted: () => t('sign_exhausted'),
  sore: () => t('sign_sore'),
  no_motivation: () => t('sign_no_motivation'),
  poor_sleep: () => t('sign_poor_sleep'),
};

export function trainingWeekId() { return makeWeekId(derivedCycle(), derivedWeek()); }

export function deloadSignsThisWeek() {
  const check = (state.wellbeing_checks || []).find((row) => row.week_id === trainingWeekId());
  return signsThisWeek({
    reported: check?.signs,
    strengthLoss: detectStrengthLoss(state.history || [], currentTrainingWeek()?.startISO),
  });
}

export function wellbeingCheckDue() {
  // Only after he has actually trained this week — «if you're not actually
  // training hard yet, you don't need a deload at all» (§7.1, [LADDER] L9791).
  if ((currentTrainingWeek()?.done || 0) < 1) return false;
  if (deloadActive()) return false;
  return !(state.wellbeing_checks || []).some((row) => row.week_id === trainingWeekId());
}

// Records the answer and, if the bar is met, books the deload for the week that
// follows. Not this week: he has already trained it, and the source prescribes
// «reducing your training load for a week», not truncating the one in progress.
export function recordWellbeingCheck(signs) {
  const rows = (state.wellbeing_checks || []).filter((row) => row.week_id !== trainingWeekId());
  rows.push({ week_id: trainingWeekId(), signs: [...new Set(signs)], at: new Date().toISOString() });
  // Twelve weeks of check-ins is a full cycle and all any rule here looks at.
  state.wellbeing_checks = rows.slice(-12);
  const total = deloadSignsThisWeek();
  if (shouldDeload(total)) {
    state.triggered_deload = {
      week_id: nextWeekId(derivedCycle(), derivedWeek(), programmeCycleLength()),
      signs: total,
      at: new Date().toISOString(),
    };
  }
  saveLocal();
  return total;
}

export function deloadActive() {
  return state.triggered_deload?.week_id === trainingWeekId();
}

export function getActiveProgramme() {
  const programme = state.programme_overrides || RW.PROGRAMME;
  // A triggered deload selects the DELOAD block WITHOUT moving the programme
  // clock. Faking the week number would advance him through the mesocycle for
  // free and hand him block C a week early.
  const deloadBlock = (programme.blocks || []).find((block) => block.deload);
  if (deloadActive() && deloadBlock) {
    return resolveProgrammeBlock(programme, {
      currentWeek: deloadBlock.week_start,
      currentBlock: deloadBlock.block,
    });
  }
  return resolveProgrammeBlock(programme, {
    currentWeek: derivedWeek(),
    currentBlock: derivedBlock(),
  });
}
export function getActiveProgrammeId() {
  return getActiveProgramme().id;
}

// ---- Today's session resolver -------------------------------
// The adopted programme is history-driven. A three-session week simply leaves
// the fourth id next in this same order; weekdays never reshuffle the split.
export function getTodayPlannedSession() {
  const prog = getActiveProgramme();
  // Manual override — user forced a specific session (e.g. missed a day)
  if (state.forced_next_session) {
    const forced = prog.sessions.find((session) => session.id === state.forced_next_session);
    if (forced) return forced;
    // Defence in depth for a stale remote/local snapshot that has not yet
    // reached the export-first boot migration. Never return undefined here.
    console.warn(`Ignoring unknown forced session id: ${state.forced_next_session}`);
  }
  return nextHistoryDrivenSession(prog, state.history || []).session;
}
export function getNextPlannedSession() {
  const prog = getActiveProgramme();
  const resolved = nextHistoryDrivenSession(prog, state.history || []);
  return { session: resolved.session, in_days: 0, rotation_index: resolved.index };
}

// ---- Smart suggestions -------------------------------------
export function getLastPerformance(exercise_id) {
  // Delegates rather than duplicating. This used to be its own scan of
  // state.history, so when the lookup became device-aware the card kept reading
  // the newest session on ANY machine while the weight suggestion read the
  // right one — the two rules drifted the moment one of them changed. Same bug
  // shape as the two copies of the set-validity rule before it.
  return getLastTwoPerformances(exercise_id)[0] || null;
}

// ---- Per-exercise equipment memory --------------------------------------
// Raed: "إذا تستعمل machine ولا plates ولا dumbbells... إنت جالس تسوي leg press
// لكن على different devices each time، فأنت تلقى الـdevice وهو يحفظ device
// ويلقيك في الـdevice هذا ويبرمج بناءً عليه".
//
// The point is not a label. 60 kg on one leg press is not 60 kg on another —
// different lever arms, different starting resistance — so a weight history
// that mixes machines is a history of nothing. When a device is chosen, the
// suggestion and the "last time" line read only the sets logged on THAT device.

export const EQUIPMENT_KINDS = ['machine', 'plates', 'dumbbells', 'cable', 'bodyweight'];

export function exercisePrefs(exerciseId) {
  if (!state.exercise_prefs) state.exercise_prefs = {};
  if (!state.exercise_prefs[exerciseId]) {
    state.exercise_prefs[exerciseId] = { equipment: '', device: '', known_devices: [] };
  }
  const prefs = state.exercise_prefs[exerciseId];
  if (!Array.isArray(prefs.known_devices)) prefs.known_devices = [];
  return prefs;
}

export function rememberDevice(exerciseId, name) {
  const clean = String(name || '').trim().slice(0, 40);
  const prefs = exercisePrefs(exerciseId);
  prefs.device = clean;
  if (clean && !prefs.known_devices.includes(clean)) prefs.known_devices.push(clean);
  saveLocal();
}

// A session stores a swapped exercise under the ORIGINAL programme id, with the
// replacement recorded in `swapped_to`. So history for a hack squat that
// replaced a goblet squat lives at `exercises.goblet_squat`, and this function —
// which is asked for `hack_squat`, because that is what suggestNextWeight is
// given — found nothing at `exercises.hack_squat` and reported no history at
// all.
//
// Proven: two lower_b sessions of hack squat at 80 kg, permanent swap in place,
// and the third session offered a blank box and «معايرة» — calibrate a movement
// he had done twice that week. Every swapped exercise was permanently stuck on
// its first exposure, so it could never progress either.
//
// Matching on the EFFECTIVE id — what he actually performed — fixes both
// directions: asking for the replacement finds the swapped entries, and asking
// for the original finds only the sessions where he really did the original.
export function performedId(key, entry) {
  return entry?.swapped_to || key;
}
export function findPerformedEntry(session, exercise_id) {
  const exercises = session?.exercises || {};
  const direct = exercises[exercise_id];
  // The common case, and the cheap one: an unswapped entry under its own id.
  if (direct && !direct.swapped_to) return direct;
  for (const [key, entry] of Object.entries(exercises)) {
    if (performedId(key, entry) === exercise_id) return entry;
  }
  return undefined;
}
export function getLastTwoPerformances(exercise_id) {
  const device = exercisePrefs(exercise_id).device;
  const collect = (matchDevice) => {
    const out = [];
    for (let i = state.history.length - 1; i >= 0 && out.length < 2; i--) {
      const ex = findPerformedEntry(state.history[i], exercise_id);
      if (!ex?.sets?.some(isCountableWorkingSet)) continue;
      if (matchDevice && (ex.device || '') !== device) continue;
      out.push({ date: state.history[i].date, ...ex });
    }
    return out;
  };
  if (device) {
    const sameDevice = collect(true);
    // Only prefer the device-specific history when there IS some. A first
    // session on a new machine should still see what he did elsewhere rather
    // than an empty card pretending he has never done the movement.
    if (sameDevice.length) return sameDevice;
  }
  return collect(false);
}
export function effectiveStartKg(planned) {
  const base = Number(planned.start_kg);
  if (!Number.isFinite(base) || base <= 0) return null;
  const exp = state.profile?.experience || 'returning';
  // D19: a detrained lifter starts from real logged history whenever it exists.
  // The reference seed is not deliberately scaled down for Raed's re-entry.
  if (exp === 'detrained' || exp === 'returning') return Math.round(base / 2.5) * 2.5;
  const factor = exp === 'beginner' ? 0.5 : (exp === 'experienced' ? 1.25 : 1);
  const scaled = base * factor;
  if (exp === 'beginner') return Math.max(2.5, Math.floor(scaled / 2.5) * 2.5);
  return Math.round(scaled / 2.5) * 2.5;
}
// Clamp C3: always round DOWN to the equipment step. Rounding to nearest, as this
// did before, silently sent a warm-up set ABOVE the prescribed percentage — a 9 kg
// working weight produced a 5 kg "50%" warm-up. Down is the conservative direction
// for a beginner, and it is the only direction the clamp spec allows.
// `step` is per-exercise and is learned from logged weights; 2.5 is the provisional
// default until enough observations exist. Phase 2 replaces this with the shared
// domain/clamps.js implementation once app.js is loaded as a module.
export function roundToGymIncrement(value, step) {
  const n = Number(value) || 0;
  const s = Number(step) > 0 ? Number(step) : 2.5;
  return Math.max(s, Math.floor(n / s) * s);
}
// The exercise this one is supersetted with: same superset_group, different row.
// Returns null for the second half of the pair, so the note renders once, on the
// exercise you reach first.
export function supersetPartner(session, planned) {
  // A1 and A2 are a PAIR, not a shared label: the letter is the group and the
  // digit is the position. Matching on exact equality — which is what this did
  // originally — found one member every time and returned null, so the note it
  // renders had never once appeared. The gate did not catch it because it only
  // asserted that some expanded card existed.
  const tag = String(planned?.superset_group || '');
  const match = tag.match(/^([A-Z])(\d)$/);
  if (!match || !session?.exercises) return null;
  const [, letter, position] = match;
  const members = session.exercises
    .filter((item) => String(item.superset_group || '').startsWith(letter))
    .sort((a, b) => String(a.superset_group).localeCompare(String(b.superset_group)));
  if (members.length < 2) return null;
  // Announced once, on the movement reached first, so both cards do not claim it.
  return position === '1' ? members[1] : null;
}

// The other half of a superset, in either direction, resolved against the LIVE
// session rather than the programme row — this is used to move him between the
// two while he is training, so it has to speak in the ids the runner is keyed by.
//
// supersetPartner() above deliberately answers only for A1, because its job is to
// render the note exactly once. This one answers for both.
export function supersetPartnerEntry(exerciseId) {
  const active = state.active_session;
  const entries = Object.entries(active?.exercises || {});
  const self = entries.find(([id]) => id === exerciseId);
  const tag = String(self?.[1]?.planned?.superset_group || '');
  const match = tag.match(/^([A-Z])(\d)$/);
  if (!match) return null;
  const [, letter] = match;
  const index = entries.findIndex(([id, entry]) => id !== exerciseId
    && String(entry?.planned?.superset_group || '').startsWith(letter));
  if (index < 0) return null;
  return { index, id: entries[index][0], state: entries[index][1] };
}

// [PPL] E p.27 L:1292-1302, carried into research/06 §«Superset note»:
// «Do not rest after completing the first set of the A1 exercise and MOVE RIGHT
// INTO the first set of the A2 exercise. Then rest for the time period indicated
// in the A2 row.»
//
// The app already knew this and said it — «سوبرست — بلا راحة قبل Cable Crunch» —
// while leaving him standing on A1, where the next thing under his thumb is A1
// set 2. The interface was prescribing the opposite of the note printed on it,
// on the last two exercises of every single session he trains.
//
// Only working sets alternate. Ramps are per-movement: you warm the calf raise
// up, you do not warm up mid-superset.
export function advanceSuperset(exerciseId) {
  // «أبغى أوبشن إنه أنا أوقفها، وأوبشن إنه لا تصير تلقائي.» Three modes:
  //   auto   — the app moves him to the partner. [PPL]'s own instruction.
  //   manual — the pair still says «بلا راحة قبل X» and offers a tap to go
  //            there, but nothing moves under him.
  //   off    — the pair is ordinary; no note, no jump.
  if ((settings.superset_mode || 'auto') !== 'auto') return null;
  const partner = supersetPartnerEntry(exerciseId);
  if (!partner) return null;
  const owed = (partner.state?.sets || []).some((set) => !set.is_warmup && !set.completed && !set.skipped);
  if (!owed) return null;
  if (focusExerciseIdx === partner.index) return null;
  setFocusExerciseIdx(partner.index);
  return partner;
}

// Ramp loads, straight from his own sourced protocol.
//
// research/07-warmup-protocol.md §2.2 — the first-set percentage MOVES with how
// many ramp sets there are, and the app was using the 2-set number for both:
//
//     1 set   ~60%                  [ML L804-858, verbatim: "about 60% of your
//                                    planned working weight for 6 to 10 reps"]
//     2 sets  ~50%, then ~70%       [ML L11160/L11162, PPL L:1454/1457]
//
// Sixteen of the twenty-six rows in his programme prescribe ONE ramp set, and
// every one of them was being warmed up at 50% instead of 60% — the app took
// `ramps[0]` from the two-set pair. The reasoning in the old comment ("groove
// the movement, not pre-fatigue it") is sensible and is also not what his
// sources say. SKILL.md §5.4 compounded it by claiming 75% for the second set;
// the code's 70% was right and the skill file was wrong.
//
// Both percentages round DOWN to the equipment step (clamp C3), and at light
// loads that used to collapse the two-set ramp onto one number — a 10 kg working
// weight gave 5 kg twice. A ramp has to ascend, so the second set is lifted to
// the next step, never to or past the working weight, and drops to a single set
// when even that is impossible.
// research/06 §6.3 — the first exposure to a movement, when there is no history
// to build on. Step 1 of the source algorithm is titled «Ask nothing. Start at
// the floor», and the app has been doing the opposite: «لا سجلّ بعد — اختر وزنًا
// تتحكّم فيه» hands the whole question back to him, on exactly the exercises
// where he is least able to answer it. He is one week into this programme, so
// that is most of them.
//
// The app cannot know what the lightest pin on his machine weighs, and inventing
// a number would be the same fabrication D8 forbids for videos. What it CAN do
// is the arithmetic he cannot do mid-set: once a ramp set comes back easy, the
// working load follows from the ramp table.
//
//   terminal_ramp_pct(ramp_sets) = 0.60 (1) | 0.70 (2) | 0.85 (>=3)
//   first_working_weight = round_to_step(weight_at_RPE_4to5 / terminal_ramp_pct)
//
// «a ramp set», not «the last ramp set» — the source fires on whichever one
// comes back at RPE 4–5, and divides by the pct for the PLANNED count. The app's
// own effort scale already maps RPE ≤ 6 to «سهل» (see prescribedEffortKey), so
// «easy» is the trigger and no new scale is invented for it.
// research/07 §2.7 — «the warm-up as a live load-calibration signal», which that
// file marks as «build this — it is sourced and it is the highest-value app
// behaviour here». It was never built.
//
//   [ML L8530] «If the warm-up sets feel light, you can be a little more
//               assertive with the loads you select for your working sets.»
//   [ML L8534] «If the warm-up sets feel heavy, ease into your first working set
//               with a lighter load than usual.»
//
// ±5–10% are the source's own in-session correction magnitudes [ML L8540-8550];
// 7.5% is the middle of that band. The asymmetry is the source's, not a
// simplification: light is about «the loads you select for your working sets»,
// plural, and heavy is about «your first working set».
//
// Only ever applied to a load the APP suggested. A number he typed is his.
// Calibration first: it establishes the load, and the feel rule declines on an
// exercise that has just been calibrated rather than adjusting the number it
// derived from the same ramp.
export function runRampRules(exState, exerciseId) {
  const derived = applyCalibrationProbe(exState, exerciseId);
  if (derived) { toast(tf('calibrated_from_ramp', { kg: fmtKgValue(derived) })); return; }
  const feel = applyWarmupFeel(exState, exerciseId);
  if (feel) {
    toast(feel.effort === 'very_hard'
      ? tf('warmup_felt_heavy', { kg: fmtKgValue(feel.weight) })
      : tf('warmup_felt_light', { kg: fmtKgValue(feel.weight) }));
  }
}

export const WARMUP_FEEL_DELTA = 0.075;
export function applyWarmupFeel(exState, exerciseId) {
  if (!exState || exState.warmup_feel_applied) return null;
  // A calibrated exercise already took its number FROM the ramp; adjusting it by
  // the feel of that same ramp would count the signal twice.
  if (exState.calibrated_from) return null;
  const sets = exState.sets || [];
  const ramps = sets.filter((set) => set.is_warmup);
  const last = ramps[ramps.length - 1];
  if (!last || !last.completed || !last.effort || last.effort === 'medium') return null;
  const working = sets.filter((set) => !set.is_warmup && !set.completed);
  if (!working.length) return null;
  const step = equipmentStepKg(exerciseId);
  const lighter = last.effort === 'very_hard';
  // «your first working set» for heavy; «your working sets» for light.
  const targets = lighter ? working.slice(0, 1) : working;
  let changed = 0;
  for (const set of targets) {
    const current = Number(set.weight);
    if (!(current > 0)) continue;
    const scaled = current * (lighter ? 1 - WARMUP_FEEL_DELTA : 1 + WARMUP_FEEL_DELTA);
    let next = roundToGymIncrement(scaled, step);
    // Rounding to the equipment step can swallow the whole adjustment on a light
    // load — 10 kg ±7.5% is 9.25/10.75, both of which round back to 10 on a
    // 2.5 kg step. A suggestion that changes nothing is worse than none: it
    // claims to have listened. Move by one real step instead.
    if (next === current) next = lighter ? current - step : current + step;
    if (next > 0 && next !== current) { set.weight = next; changed += 1; }
  }
  if (!changed) return null;
  exState.warmup_feel_applied = last.effort;
  return { effort: last.effort, weight: targets[0].weight };
}

export function terminalRampPct(rampSets) {
  const n = Number(rampSets) || 0;
  if (n <= 0) return 0;
  if (n === 1) return 0.60;
  if (n === 2) return 0.70;
  return 0.85;
}

// Fills the working sets of a first exposure from a ramp set that came back
// easy. Returns the derived weight, or null when the probe does not apply.
//
// Only untouched working sets are written. Once he has typed or completed one,
// his number is the truth and a derivation must never overwrite it.
export function applyCalibrationProbe(exState, exerciseId) {
  if (!exState || exState.calibrated_from) return null;
  const sets = exState.sets || [];
  const ramps = sets.filter((set) => set.is_warmup);
  if (!ramps.length) return null;
  const working = sets.filter((set) => !set.is_warmup);
  // Not a first exposure if any working set already carries a load.
  if (working.some((set) => hasWorkingWeight(set.weight) || set.completed)) return null;
  const hit = ramps.find((set) => set.completed && set.effort === 'easy' && hasWorkingWeight(set.weight));
  if (!hit) return null;
  const pct = terminalRampPct(ramps.length);
  if (!pct) return null;
  const derived = roundToGymIncrement(Number(hit.weight) / pct, equipmentStepKg(exerciseId));
  if (!(derived > 0)) return null;
  for (const set of working) set.weight = derived;
  exState.calibrated_from = { weight: Number(hit.weight), pct, ramps: ramps.length };
  return derived;
}

export function rampLoadsFor(weight, count, step) {
  const s = Number(step) > 0 ? Number(step) : 2.5;
  if (count <= 1) {
    return [{ weight: roundToGymIncrement(weight * 0.6, s), reps: 8 }];
  }
  const first = roundToGymIncrement(weight * 0.5, s);
  let second = roundToGymIncrement(weight * 0.7, s);
  if (second <= first) {
    const lifted = first + s;
    if (lifted < Number(weight)) second = lifted;
    else return [{ weight: first, reps: 10 }];
  }
  return [
    { weight: first, reps: 10 },
    { weight: second, reps: 6 },
  ];
}
export function warmupText(planned, suggestedWeight) {
  if (!planned.warmup) return '';
  if (/^2\s+sets/i.test(planned.warmup)) {
    if (!hasWorkingWeight(suggestedWeight)) return '';
    // rampLoadsFor can legitimately return ONE entry, when the load is
    // too light for two distinct ramp weights. Indexing [1] blindly would throw
    // here and take the whole card's render down with it.
    const warmups = rampLoadsFor(suggestedWeight, 2);
    const parts = warmups.map((w, i) => `${fmtKgValue(w.weight)}kg×${i === 0 ? 10 : 6}`);
    return `${warmups.length} ${warmups.length === 1 ? 'set' : 'sets'}: ${parts.join(', ')}`;
  }
  return planned.warmup;
}

export function suggestNextWeight(exercise_id, planned) {
  // Returns { weight, note } — based on last 2 sessions
  const last2 = getLastTwoPerformances(exercise_id);
  const ex = getAllExercises().find(e => e.id === exercise_id);
  const startKg = effectiveStartKg(planned);
  if (!ex) return { weight: startKg, note: t('why_first_exposure') };
  if (!last2.length) {
    return hasWorkingWeight(startKg)
      ? { weight: startKg, note: tf('why_reentry_seed', { kg: startKg }) }
      : { weight: null, note: t('why_calibrate') };
  }
  const latest = last2[0];
  const topReps = parseInt(String(planned.reps).split('-').pop(), 10) || 10;
  // Find the heaviest working set
  const workingSets = (latest.sets || []).filter(isCountableWorkingSet);
  if (!workingSets.length) {
    // This branch re-ran the SAME `isCountableWorkingSet` filter that had just
    // been proven empty one line above, so `historicWeight` was always
    // undefined and the whole branch could only ever return «معايرة». The
    // `why_last_logged` note it exists to show was unreachable.
    //
    // What it clearly meant to do is widen the net: the last session had no
    // set that counts — every one skipped, or flagged invalid, or left
    // unticked — but he may still have typed a real load into it. That number
    // is a far better starting point than telling him to calibrate a movement
    // he trained last week. Warm-ups stay excluded; they are not his working
    // load. Heaviest wins, matching the working-set path below.
    const loggedWeights = (latest.sets || [])
      .filter((set) => !set.is_warmup)
      .map((set) => Number(set.weight))
      .filter(hasWorkingWeight);
    const historicWeight = loggedWeights.length ? Math.max(...loggedWeights) : null;
    return hasWorkingWeight(historicWeight)
      ? { weight: Number(historicWeight), note: t('why_last_logged') }
      : { weight: null, note: t('why_calibrate') };
  }
  // Two different sets, for two different questions.
  //
  // The WEIGHT comes from the heaviest working set — which is what the comment
  // above this block always claimed and what exerciseHistoryRows() already shows
  // him in the log table, but the code took `workingSets[length - 1]`, the LAST
  // one. Identical on straight sets, and wrong the moment he drops the load on a
  // final set because he is cooked: the app would then propose the reduced
  // weight as his new working load and quietly walk him backwards.
  //
  // The EFFORT still comes from the final set, because that is the only set the
  // app ever records effort on — by design, effort only carries information near
  // failure. Reading it off the heaviest set would usually read `null`.
  const finalSet = workingSets[workingSets.length - 1];
  const lastTopSet = workingSets.reduce(
    (best, set) => ((Number(set.weight) || 0) > (Number(best.weight) || 0) ? set : best),
    workingSets[0]);
  const allHitTarget = workingSets.every(s => s.reps >= topReps);
  const finalEffort = finalSet.effort || null;
  // Check if last 2 sessions both hit target
  const isAccessory = ex.pattern && ex.pattern.startsWith('isolation');
  // Accessories still add reps BEFORE weight — that half of the rule is sound and
  // is enforced by the two-consecutive-sessions gate below, not by the size of
  // the step. What changed is the SIZE: it is the equipment's own smallest
  // increment now, the same for a leg press and a triceps pressdown, because
  // that is what the sources actually show. See equipmentStepKg().
  const bump = equipmentStepKg(exercise_id);
  if (allHitTarget && last2.length === 2) {
    const prevSets = (last2[1].sets || []).filter(isCountableWorkingSet);
    const prevAllHit = prevSets.length && prevSets.every(s => s.reps >= topReps);
    if (prevAllHit) {
      if (finalEffort === 'very_hard') {
        return { weight: lastTopSet.weight, note: t('why_hold_very_hard') };
      }
      if (bump > 0) {
        return { weight: lastTopSet.weight + bump, note: tf('why_bump_twice', { reps: topReps, kg: bump }) };
      } else {
        return { weight: lastTopSet.weight, note: t('why_accessory_reps') };
      }
    }
  }
  // Deliberately NOT for accessories: one easy session is the moment to add a
  // rep, not load. They only graduate on the two-session branch above.
  if (allHitTarget && finalEffort === 'easy' && bump > 0 && !isAccessory) {
    return { weight: lastTopSet.weight + bump, note: tf('why_easy_bump', { reps: topReps, kg: bump }) };
  }
  // A machine that carries its own stack logs 0, and 0 is a real load — but it
  // is a load that cannot go up. «طابق أو تجاوز 0 كغ» says nothing, and the card
  // suppresses that note anyway, so he was left with a blank box and no guidance
  // at all on a movement he had just done three sets of. Reps are the only thing
  // that can progress here, so the note says so and names the target.
  if (workingSets.every((set) => Number(set.weight) === 0)) {
    return {
      weight: 0,
      note: tf('why_machine_reps', { reps: finalSet.reps, target: topReps }),
    };
  }
  // Tagged, because the card suppresses this one note and matching on the
  // rendered Arabic string would break the moment the wording changes. It is
  // the only branch that restates «آخر مرة» instead of explaining a decision.
  return {
    weight: lastTopSet.weight,
    note: tf('why_match_or_beat', { kg: lastTopSet.weight, reps: lastTopSet.reps }),
    note_kind: 'match_or_beat',
  };
}

// ---- Streak / volume calc ----------------------------------
export function getStreak() {
  // Count completed sessions in the last 4 weeks
  const now = Date.now();
  const fourWeeksMs = 28 * 24 * 60 * 60 * 1000;
  return state.history.filter(h => (now - new Date(h.date).getTime()) < fourWeeksMs).length;
}
// One definition of "this week", and it is his week.
//
// There were two and they disagreed on the same screen: the volume tile used a
// rolling 7x24 hours, the week strip used Saturday-to-Friday Saudi time. Near
// each Saturday boundary the tile could count a session the strip had correctly
// put in last week, while "remaining" had already reset.
//
// It also reads `weekly_layout` — which has sat in data.js since the programme
// was transcribed and was consumed by NOTHING — for the number of training days
// a week is meant to hold. That is the one honest use for it: the rotation is
// deliberately history-driven, never weekday-driven (a missed Tuesday must not
// break it), so the layout cannot say "Tuesday is Upper A". It can say "four".
export function weeklyTrainingTarget() {
  const layout = (state.programme_overrides || RW.PROGRAMME)?.weekly_layout;
  if (!Array.isArray(layout) || !layout.length) return 4;
  return layout.filter((day) => day && day !== 'rest').length;
}
export function currentTrainingWeek() {
  const today = new Date();
  // The Saudi week starts Saturday.
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 1) % 7));
  start.setHours(0, 0, 0, 0);
  const startISO = localISODate(start);
  const days = new Set();
  for (const entry of state.history || []) {
    const date = String(entry?.date || '').slice(0, 10);
    if (date && date >= startISO) days.add(date);
  }
  const target = weeklyTrainingTarget();
  return { startISO, done: days.size, target, remaining: Math.max(0, target - days.size) };
}

export function getWeeklyVolume() {
  // Saturday-to-now, the same week the strip draws, instead of a rolling 7x24h.
  const { startISO } = currentTrainingWeek();
  let totalSets = 0, totalKg = 0;
  state.history.forEach(h => {
    if (String(h.date || '').slice(0, 10) >= startISO) {
      Object.values(h.exercises).forEach(ex => {
        (ex.sets || []).forEach(s => {
          if (isCountableWorkingSet(s)) {
            totalSets++;
            totalKg += (Number(s.weight) || 0) * (Number(s.reps) || 0);
          }
        });
      });
    }
  });
  return { totalSets, totalKg: Math.round(totalKg) };
}

// A real estimate instead of the number 70.
//
// This was `tf('home_minutes', { n: 70 })` — a hardcoded literal on every
// session. A six-exercise lower day said 70 minutes and so did a seven-exercise
// upper day, and now a deload week with two working sets per exercise says it
// too, which is roughly twice the truth. A number the app cannot justify is the
// exact thing Raed objected to on the weight card.
//
// Built from the programme's own columns: each working set is about 40 seconds
// under load, each ramp set about 30, and the rest between them is `rest_min`,
// which the programme states per exercise. The general warm-up is capped at 15
// and realistically runs about 8.
export const WARMUP_MINUTES = 8;
export function estimateSessionMinutes(session) {
  const rows = session?.exercises || [];
  if (!rows.length) return WARMUP_MINUTES;
  const seconds = rows.reduce((total, row) => {
    const working = Number(row.sets ?? row.work_sets) || 0;
    const ramps = Number(row.ramp_sets) || 0;
    const rest = Number(row.rest_min);
    const restSeconds = (Number.isFinite(rest) ? rest : 2) * 60;
    // The last set of an exercise is followed by the next exercise's setup, not
    // by a full prescribed rest, so one rest is dropped per exercise.
    return total + ramps * 30 + working * 40 + Math.max(0, working + ramps - 1) * restSeconds;
  }, 0);
  // To the nearest five, because a minute-accurate estimate would be a lie of a
  // different kind.
  return Math.max(10, Math.round((WARMUP_MINUTES + seconds / 60) / 5) * 5);
}

// The prescribed effort, in words rather than a number.
//
// Every programme row carries per-set RPE, Block B raises it, and the week-12
// deload lowers it — and `planned.rpe` was read NOWHERE in this file. So Block
// B's effort progression never reached him, and worse, the deload's effort cut
// did not either: his deload week was "one fewer set" while the source
// (research/06 §7.4) prescribes the SAME weight with the effort taken off. A
// deload trained at normal intensity is not a deload.
//
// D16 replaced numeric RPE with coarse words on purpose, so this shows a word.
// The bands are the standard reading of the scale: 6 leaves about four reps in
// reserve, 7 about three, 8 about two, 9+ is one or none.
export const effortKeyForRpe = (rpe) => {
  if (rpe <= 6) return 'effort_target_easy';
  if (rpe <= 7) return 'effort_target_moderate';
  if (rpe <= 8) return 'effort_target_hard';
  return 'effort_target_near_failure';
};
export function prescribedRpeValues(planned) {
  const values = [planned?.rpe_set1, planned?.rpe_set2, planned?.rpe_set3]
    .map(Number).filter(Number.isFinite);
  if (values.length) return values;
  // Fall back to the joined `rpe` string the programme row also carries.
  return (String(planned?.rpe || '').match(/\d+(?:\.\d+)?/g) || [])
    .map(Number).filter(Number.isFinite);
}
export function prescribedEffortKey(planned) {
  const all = prescribedRpeValues(planned);
  if (!all.length) return null;
  return effortKeyForRpe(Math.max(...all));
}

// The effort target of EACH set, not the hardest of them.
//
// 86 of the 104 rows in his programme prescribe different efforts across their
// sets — chest_press_machine is [7, 7, 8] — and the card showed one word taken
// from `Math.max`. So «صعب» sat under a row whose first two sets are prescribed
// «متوسط», and the app was asking him for more than the programme does on 83% of
// what he lifts. That is not a cosmetic collapse: he feeds those same sets back
// as fatigue, and the deload trigger reads fatigue.
//
// Identical values still render as one word — «صعب · صعب · صعب» is noise.
export function prescribedEffortSequence(planned) {
  const all = prescribedRpeValues(planned);
  if (!all.length) return [];
  const keys = all.map(effortKeyForRpe);
  return new Set(keys).size === 1 ? [keys[0]] : keys;
}

// The load increment, from the equipment — not from a body-part guess.
//
// `research/06-beginner-protocol.md` §5.2 carries a red-flag callout naming this
// app by line number:
//
//   "The current app's increment rule is not in any source. app.js sets
//    bump = isLowerBody ? 5 : (isAccessory ? 0 : 2.5). The lower/upper split does
//    not appear in [LADDER], [PPL], [RECOMP] or [PELLAND]; the sources' own
//    examples use the same increment for a barbell squat and a triceps
//    pressdown."
//
//   "Encode instead: step(E) = the smallest load increment physically available
//    on that machine or implement — which is exactly [PPL]'s 'some minimum
//    amount of weight'. Fallback when the increment is unknown: +2.5 kg."
//
// And §858 repeats it in the gaps table. So the split goes.
//
// Learned first, because the only honest source for "smallest available" is his
// own gym: the gaps between the distinct loads he has actually logged on that
// movement. The comment on roundToGymIncrement has claimed for months that the
// step is "learned from logged weights" — nothing was learning it.
//
// Equipment defaults come from §5.2's own examples: a pin stack is often 5 kg,
// dumbbells and plate-loaded machines about 2.5. Getting this too LOW is not
// harmless — suggesting 42.5 kg on a 5 kg pin stack is a weight he cannot set.
export const EQUIPMENT_STEP_KG = {
  machine: 5,      // pin stack
  cable: 2.5,
  dumbbells: 2.5,
  plates: 2.5,     // a 1.25 kg plate per side
  bodyweight: 2.5,
};
export const DEFAULT_STEP_KG = 2.5;
export function learnedStepFromHistory(exerciseId) {
  const weights = new Set();
  for (const session of state.history || []) {
    const entry = findPerformedEntry(session, exerciseId);
    for (const set of entry?.sets || []) {
      if (set.is_warmup) continue;
      const w = Number(set.weight);
      if (Number.isFinite(w) && w > 0) weights.add(w);
    }
  }
  const sorted = [...weights].sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  let smallest = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const gap = Math.round((sorted[i] - sorted[i - 1]) * 100) / 100;
    if (gap > 0 && gap < smallest) smallest = gap;
  }
  // A gap outside this range is noise — a typo, or a machine swap — not a step.
  if (!Number.isFinite(smallest) || smallest < 0.5 || smallest > 10) return null;
  return smallest;
}
export function equipmentStepKg(exerciseId) {
  const learned = learnedStepFromHistory(exerciseId);
  if (learned) return learned;
  const kind = exercisePrefs(exerciseId).equipment;
  return EQUIPMENT_STEP_KG[kind] || DEFAULT_STEP_KG;
}

// ---- Session warm-up phase ---------------------------------
// The weeks 1-2 re-entry ramp. D19, and it was prose until now.
//
// D19: "Treat weeks 1-2 as a re-entry ramp rather than a first-ever exposure."
// `research/20-programme-decision.md` §8.3 gives the table, and nothing in the
// app read it — the Settings screen has been promising Raed "the first two weeks
// are a re-entry ramp" while session creation built the ordinary Block A rows.
//
//   week 1   compounds 6/6/6   isolation 7/7/7   TWO working sets on an
//                                               exercise's first exposure only
//   week 2   compounds 6/7/7   isolation 7/8/8   full sets
//   week 3+  Block A as printed
//
// Cycle 1 only. He is re-entering after a layoff once; by week 1 of cycle 2 he
// has twelve weeks behind him, and the deload in week 12 is what handles fatigue
// from then on. Re-ramping every cycle would just be a second deload.
//
// §8.3 is emphatic immediately below the table that "RPE is telemetry, not the
// controller" — so this changes the effort SHOWN and, in week one, the set
// count. It never touches how load is computed; that stays on achieved reps.
export const REENTRY_RPE = {
  1: { compound: [6, 6, 6], isolation: [7, 7, 7] },
  2: { compound: [6, 7, 7], isolation: [7, 8, 8] },
};
export function reEntryPlan(plan, exercise) {
  if (derivedCycle() !== 1) return plan;
  // The experience selector finally controls something.
  //
  // It sat in Settings offering four choices and changing NOTHING: its only
  // consumer was effectiveStartKg's load multiplier, and zero of the 104 rows in
  // the live programme carry a `start_kg` for it to scale. `research/06` §6.3 is
  // explicit about why that is the right outcome — "the experience multiplier
  // can be deleted entirely... what experience SHOULD drive is the RPE cap and
  // the graduation gate, not the load."
  //
  // The RPE cap is exactly this ramp. Someone who has been training does not
  // need re-entering; someone detrained, returning or new does.
  if ((state.profile?.experience || 'returning') === 'experienced') return plan;
  const band = REENTRY_RPE[derivedWeek()];
  if (!band) return plan;
  const isIsolation = Boolean(exercise?.pattern && exercise.pattern.startsWith('isolation'));
  const [r1, r2, r3] = band[isIsolation ? 'isolation' : 'compound'];
  const next = { ...plan, rpe_set1: r1, rpe_set2: r2, rpe_set3: r3, reentry_week: derivedWeek() };
  // Week 1 caps an exercise at two working sets, but only the FIRST time he
  // meets it — §8.3, "first exposure only". Once it has history the full
  // prescription applies.
  if (derivedWeek() === 1 && !getLastPerformance(plan.exercise_id)) {
    next.sets = Math.min(Number(plan.sets) || 0, 2) || 2;
  }
  return next;
}

export function workingRepTarget(planned) {
  return parseInt(String(planned?.reps || '').split('-')[0], 10) || 1;
}
export function scopedReplacementFor(session, exerciseId) {
  const active = (state.substitutions || []).filter((entry) => {
    if (entry.from_exercise_id !== exerciseId) return false;
    if (entry.scope === 'always') return true;
    // A scoped swap belongs to ONE cycle. Entries written before `cycle` existed
    // carry undefined, and those are honoured only in the cycle he is in now —
    // there is no way to know which cycle they came from, and the safe reading
    // of an unknown is "this one", never "every future one".
    const sameCycle = entry.cycle == null || entry.cycle === derivedCycle();
    if (entry.scope === 'this_week') return sameCycle && entry.expires_after_week === derivedWeek();
    if (entry.scope === 'this_block') return sameCycle && entry.block === derivedBlock();
    return false;
  });
  return active.length ? active[active.length - 1].to_exercise_id : exerciseId;
}
export function assessSessionSubstitution(exercise_id, alt_id, scope) {
  const programme = getActiveProgramme();
  const allExercises = getAllExercises();
  const from = allExercises.find((exercise) => exercise.id === exercise_id);
  const to = allExercises.find((exercise) => exercise.id === alt_id);
  if (!from || !to) return { from, to, baseline: {}, projected: {}, ledger_delta: {}, classification: { severity: 'block-with-override', muscles_affected: [], message: 'Unknown exercise.' } };
  // The runner never interprets substitution volume itself. Domain code first
  // recomputes the fractional ledger, then classifies it clean/warn/block.
  const assessed = assessSubstitution({
    catalogue: allExercises,
    programme,
    substitution: {
      from_exercise_id: exercise_id,
      to_exercise_id: alt_id,
      scope,
      session_id: scope === 'this_session' ? state.active_session?.session_id : null,
    },
    existingSubstitutions: [],
  });
  return {
    from,
    to,
    baseline: assessed.ledger.baseline,
    projected: assessed.ledger.projected,
    ledger_delta: assessed.ledger.ledger_delta,
    classification: assessed.classification,
  };
}
export function newLocalId(prefix) {
  return `${prefix}-${window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}
export function recordSubstitution(exercise_id, alt_id, scope, assessment, override = null) {
  const entry = {
    id: newLocalId('sub'),
    user_key: String(settings.user_id || '').trim().toLowerCase(),
    programme_id: getActiveProgrammeId(),
    from_exercise_id: exercise_id,
    to_exercise_id: alt_id,
    scope,
    session_id: scope === 'this_session' ? state.active_session?.session_id : null,
    expires_after_week: scope === 'this_week' ? derivedWeek() : null,
    block: scope === 'this_block' ? derivedBlock() : null,
    // The cycle a scoped swap belongs to.
    //
    // Weeks and blocks REPEAT now that the twelve-week mesocycle wraps, so a
    // week number on its own stopped identifying a point in time: a swap scoped
    // to week 5 of cycle 1 matched week 5 of cycle 2 as well, and a block-B swap
    // came back in every future block B. Raed would be put on a substitute
    // months after whatever caused it — a busy machine, a tweaked shoulder — had
    // been forgotten. Recorded here so the matcher can tell the two apart.
    cycle: scope === 'this_week' || scope === 'this_block' ? derivedCycle() : null,
    created_at: new Date().toISOString(),
    ledger_delta: assessment.ledger_delta,
    warning: assessment.classification.severity === 'clean' ? null : assessment.classification,
    override,
  };
  state.substitutions = [...(state.substitutions || []), entry];
  return entry;
}
// The domain returns its own English sentence, which is right for tests and
// logs but was being shown verbatim to Raed on an Arabic-only screen. Rebuild it
// here from the structured fields instead of translating a formatted string.
export function ledgerMessage(status) {
  const names = (status.offenders || []).map((item) => `${muscleLabel(item.muscle)} ${item.value}`).join(' · ');
  const low = status.bounds?.low;
  const high = status.bounds?.high;
  if (status.severity === 'block-with-override') return tf('ledger_blocked', { muscles: names, low, high });
  if (status.severity === 'warn') return tf('ledger_warn', { muscles: names, low, high });
  return tf('ledger_clean', { low, high });
}

// The programme's own movement for this slot, regardless of what is running in
// it now. exercise_id is the planned id; swapped_to is the replacement.
export function originalExerciseName(plannedId) {
  return getAllExercises().find((item) => item.id === plannedId)?.name || plannedId;
}

// The programme prescribes rest PER EXERCISE — 2.5 min on the openers, 2.0, 1.5,
// and 0 on the first half of a superset. `rest_min` has been in data.js since the
// programme was transcribed and app.js consumed it NOWHERE: every set fell back
// to one global 120s. Worst case, the card told Raed A1/A2 run back-to-back with
// no rest and then started a two-minute timer on the same tap.
//
// The setting stays as the fallback for anything the programme does not specify.
export function prescribedRestSeconds(planned) {
  // The override, off by default.
  //
  // v15 let the Settings value drive every rest. v16 gave all 104 programme rows
  // their own `rest_min` from Nippard — 2.5 min on a leg press, 0 on the first
  // half of a superset — so the setting became a fallback that almost never
  // fires, and the ability to shorten a whole session went with it. That is a
  // real thing to want on a day he is short of time.
  //
  // Opt-in, because the prescription is the programme. A superset's prescribed 0
  // is never overridden: that 0 is an instruction to move straight into the
  // partner, not a short rest.
  const minutes = Number(planned?.rest_min);
  if (!Number.isFinite(minutes)) return settings.rest_seconds;
  if (settings.rest_override && minutes > 0) return settings.rest_seconds;
  return Math.round(minutes * 60);
}

// The last few sessions for one movement, newest first, each labelled with the
// machine it was performed on. Deliberately every device, not just the selected
// one — the table exists to SHOW the difference between machines, which is
// exactly what the per-device history correctly hides while training.
export function exerciseHistoryRows(exerciseId, limit = 6) {
  const rows = [];
  for (let i = state.history.length - 1; i >= 0 && rows.length < limit; i--) {
    const session = state.history[i];
    // Same lookup as getLastTwoPerformances, and for the same reason: this table
    // is opened with the REPLACEMENT id when a swap is active, while the session
    // stored the work under the original programme id. It showed «لا يوجد سجل»
    // for a movement he had been doing for weeks.
    const entry = findPerformedEntry(session, exerciseId);
    const sets = (entry?.sets || []).filter(isCountableWorkingSet);
    if (!sets.length) continue;
    const top = sets.reduce((best, set) =>
      (Number(set.weight) || 0) > (Number(best.weight) || 0) ? set : best, sets[0]);
    rows.push({
      date: session.date,
      device: entry.device || '',
      sets: sets.length,
      topWeight: Number(top.weight) || 0,
      topReps: Number(top.reps) || 0,
    });
  }
  return rows;
}

// One place that decides what a bodyweight entry means.
//
// There were two, and they disagreed. The quick logger in History accepted any
// truthy parsed number — including a negative — appended it to the log, and did
// NOT update `profile.bodyweight_kg`; the protein target reads the profile, so
// logging a new weight left the target computed from an old one. Settings
// accepted a negative too, stored it as the current weight, and appended a
// SECOND entry for the same day.
//
// A human bodyweight has bounds. 25-300 kg is wide enough to never argue with a
// real person and narrow enough to catch a typo or a stray minus sign.
export const BODYWEIGHT_MIN_KG = 25;
export const BODYWEIGHT_MAX_KG = 300;
export function isPlausibleBodyweight(kg) {
  return Number.isFinite(kg) && kg >= BODYWEIGHT_MIN_KG && kg <= BODYWEIGHT_MAX_KG;
}
// Records a weigh-in: one entry per DAY (the last one wins, because a second
// reading on the same morning is a correction, not a second data point), and the
// profile follows it so the protein target cannot go stale.
export function recordBodyweight(kg) {
  if (!isPlausibleBodyweight(kg)) {
    toast(tf('bodyweight_out_of_range', { min: BODYWEIGHT_MIN_KG, max: BODYWEIGHT_MAX_KG }), 5000);
    return false;
  }
  if (!Array.isArray(state.bodyweight_log)) state.bodyweight_log = [];
  const today = todayISO();
  const existing = state.bodyweight_log.findIndex((entry) => entry?.date === today);
  if (existing >= 0) state.bodyweight_log[existing] = { date: today, kg };
  else state.bodyweight_log.push({ date: today, kg });
  state.profile.bodyweight_kg = kg;
  saveLocal();
  return true;
}

