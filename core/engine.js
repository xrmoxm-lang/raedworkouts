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
// The week is DERIVED from logged sessions, never stored, and only sessions
// from THIS rotation move the clock — an import must not skip him to week 9.
export function completedSessionCount() {
  const rotation = new Set((RW.PROGRAMME?.rotation_order) || []);
  if (!rotation.size) return (state.history || []).length;
  return (state.history || []).filter((entry) => {
    const id = entry?.session_id;
    return !id || rotation.has(id);
  }).length;
}
// The mesocycle REPEATS. It used to stop.
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
// The ruling in `06` §7.2 is «[LADDER] wins. No scheduled deload in the first
// block. Deload on trigger, with a week-12 backstop.»
export const DELOAD_SIGNS = REPORTED_SIGNS;
export const DELOAD_SIGN_THRESHOLD = SIGN_THRESHOLD;
// Spelled out rather than built by concatenation: the locale gate reads every
// lookup call to prove its key has an entry, and a computed key defeats it.
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
  // Delegates rather than duplicating: this used to be its own scan of
// state.history, so the card and the weight suggestion drifted apart the moment
// the lookup became device-aware.
  return getLastTwoPerformances(exercise_id)[0] || null;
}

// ---- Per-exercise equipment memory --------------------------------------
// Raed: "إذا تستعمل machine ولا plates ولا dumbbells...

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

// A session stores a swapped exercise under the ORIGINAL programme id, with
// the replacement recorded in `swapped_to`.
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
// Clamp C3: always round DOWN to the equipment step. Rounding to nearest, as
// this did before, silently sent a warm-up set ABOVE the prescribed
// percentage — a 9 kg working weight produced a 5 kg "50%" warm-up.
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
  // digit is the position.
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
// session, so it speaks in the ids the runner is keyed by. supersetPartner()
// above answers only for A1, because its job is to render the note once.
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

// [PPL] E p.27: no rest after A1, move straight into A2. Only working sets
// alternate — ramps are per-movement, so a ramp never jumps him to the partner. «Do
// not rest after completing the first set of the A1 exercise and MOVE RIGHT
// INTO the first set of the A2 exercise.
export function advanceSuperset(exerciseId) {
  // «أبغى أوبشن إنه أنا أوقفها، وأوبشن إنه لا تصير تلقائي.» Three modes: auto
  // — the app moves him to the partner.
  if ((settings.superset_mode || 'auto') !== 'auto') return null;
  const partner = supersetPartnerEntry(exerciseId);
  if (!partner) return null;
  const owed = (partner.state?.sets || []).some((set) => !set.is_warmup && !set.completed && !set.skipped);
  if (!owed) return null;
  if (focusExerciseIdx === partner.index) return null;
  setFocusExerciseIdx(partner.index);
  return partner;
}

// Calibration first, then the warm-up feel: a calibrated exercise took its load
// FROM the ramp, so adjusting it by the feel of that same ramp would count the
// signal twice. Only ever applied to a load the app suggested.
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
    // Rounding to the equipment step can swallow the whole adjustment on a
    // light load — 10 kg ±7.5% is 9.25/10.75, both of which round back to 10
    // on a 2.5 kg step.
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
    // This branch re-ran the SAME `isCountableWorkingSet` filter that had
    // just been proven empty one line above, so `historicWeight` was always
    // undefined and the whole branch could only ever return «معايرة».
    const loggedWeights = (latest.sets || [])
      .filter((set) => !set.is_warmup)
      .map((set) => Number(set.weight))
      .filter(hasWorkingWeight);
    const historicWeight = loggedWeights.length ? Math.max(...loggedWeights) : null;
    return hasWorkingWeight(historicWeight)
      ? { weight: Number(historicWeight), note: t('why_last_logged') }
      : { weight: null, note: t('why_calibrate') };
  }
  // Two different sets, two questions: the WEIGHT comes from the heaviest working
  // set (the last one walks him backwards when he drops the load on a final set),
  // the EFFORT from the final set, the only set effort is ever recorded on.
  const finalSet = workingSets[workingSets.length - 1];
  const lastTopSet = workingSets.reduce(
    (best, set) => ((Number(set.weight) || 0) > (Number(best.weight) || 0) ? set : best),
    workingSets[0]);
  const allHitTarget = workingSets.every(s => s.reps >= topReps);
  const finalEffort = finalSet.effort || null;
  // Check if last 2 sessions both hit target
  const isAccessory = ex.pattern && ex.pattern.startsWith('isolation');
  // Accessories still add reps BEFORE weight — that half of the rule is sound
  // and is enforced by the two-consecutive-sessions gate below, not by the
  // size of the step.
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
  // A machine that carries its own stack logs 0, and 0 is a real load — but
  // it is a load that cannot go up.
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
export function prescribedEffortSequence(planned) {
  const all = prescribedRpeValues(planned);
  if (!all.length) return [];
  const keys = all.map(effortKeyForRpe);
  return new Set(keys).size === 1 ? [keys[0]] : keys;
}

// The load increment, from the equipment — not from a body-part guess.
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
export const REENTRY_RPE = {
  1: { compound: [6, 6, 6], isolation: [7, 7, 7] },
  2: { compound: [6, 7, 7], isolation: [7, 8, 8] },
};
export function reEntryPlan(plan, exercise) {
  if (derivedCycle() !== 1) return plan;
  // The experience selector controls the RPE cap, not the load: research/06 §6.3
  // deletes the load multiplier. Someone already training is not re-entering.
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
    // carry undefined, and the safe reading of an unknown is «this cycle».
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

// The programme prescribes rest PER EXERCISE — 2.5 min on the openers, 2.0,
// 1.5, and 0 on the first half of a superset.
export function prescribedRestSeconds(planned) {
  // Opt-in, because the prescription is the programme. A superset's prescribed 0
  // is never overridden: that 0 means move straight into the partner.
  const minutes = Number(planned?.rest_min);
  if (!Number.isFinite(minutes)) return settings.rest_seconds;
  if (settings.rest_override && minutes > 0) return settings.rest_seconds;
  return Math.round(minutes * 60);
}

// The last few sessions for one movement, newest first, each labelled with
// the machine it was performed on.
export function exerciseHistoryRows(exerciseId, limit = 6) {
  const rows = [];
  for (let i = state.history.length - 1; i >= 0 && rows.length < limit; i--) {
    const session = state.history[i];
    // Same lookup as getLastTwoPerformances, and for the same reason: this
    // table is opened with the REPLACEMENT id when a swap is active, while
    // the session stored the work under the original programme id.
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

