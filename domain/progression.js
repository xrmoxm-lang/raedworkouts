import { programmedRepRange } from './catalogue.js';
import { clampWorkingWeight } from './clamps.js';

const COUNTED_KINDS = new Set(['working', 'calibration']);
const EFFORT_LEVELS = new Set(['easy', 'medium', 'very_hard']);

function fail(message) {
  throw new Error(`Progression invariant failed: ${message}`);
}

function rangeFrom(state, exercise) {
  const programmed = programmedRepRange(exercise);
  const low = Number(state.rep_low ?? programmed.min);
  const high = Number(state.rep_high ?? programmed.max);
  if (!Number.isInteger(low) || !Number.isInteger(high) || low < 1 || high < low || high > 12) {
    fail('rep range must be whole numbers with rep_high <= 12');
  }
  return { low, high };
}

function isCountedSet(set) {
  return set && set.valid !== false && (!set.kind || COUNTED_KINDS.has(set.kind));
}

function completedWorkingSets(sets) {
  return (sets || []).filter(isCountedSet);
}

/**
 * Effort is intentionally an exercise-level, end-of-exercise check-in. The UI
 * asks for it after the final working set only, so accepting a rating on an
 * earlier set would turn a coarse ranking back into per-set friction/noise.
 */
function finalWorkingSetEffort(working) {
  let effort = null;
  for (let index = 0; index < working.length; index += 1) {
    const value = working[index].effort;
    if (value == null || value === '') continue;
    if (!EFFORT_LEVELS.has(value)) fail('effort must be easy, medium, or very_hard');
    if (index !== working.length - 1) fail('effort may be captured on the final working set only');
    effort = value;
  }
  return effort;
}

export function defaultIncrement(exercise) {
  const pattern = exercise?.canonical_pattern || exercise?.pattern;
  return ['lower_compound', 'hinge', 'compound_quad', 'compound_hinge'].includes(pattern) ? 0.05 : 0.025;
}

export function initialiseProgressionState({ loadKg, exercise, setsTarget = 3, repLow, repHigh } = {}) {
  const load = Number(loadKg);
  if (!Number.isFinite(load) || load <= 0) fail('initial load must be positive');
  const range = rangeFrom({ rep_low: repLow, rep_high: repHigh }, exercise);
  if (!Number.isInteger(Number(setsTarget)) || Number(setsTarget) < 1) fail('sets_target must be a positive integer');
  return Object.freeze({
    load_kg: load,
    rep_low: range.low,
    rep_high: range.high,
    sets_target: Number(setsTarget),
    consecutive_top: 0,
    consecutive_below_low: 0,
    reps_target: range.low,
  });
}

function clampContext({ catalogue, exercise, state, history, bodyweightKg, equipmentStepKg, weeklyVolume }) {
  return {
    catalogue,
    exerciseId: exercise.id,
    history: history?.length ? history : [{ kind: 'working', valid: true, weight_kg: state.load_kg }],
    bodyweightKg,
    equipmentStepKg,
    weeklyVolume,
    firstLoadSource: 'history',
  };
}

/**
 * Deterministic double progression. Completed repetitions are the controller;
 * one ordinal final-set effort rating can only delay an earned increase or let
 * a reps-earned increase land one complete exposure sooner. It can never make
 * a load increase happen without the rep criterion.
 */
export function progressExercise({
  catalogue,
  exercise,
  state,
  completedSets,
  history = [],
  bodyweightKg = null,
  equipmentStepKg = null,
  weeklyVolume = null,
  increment = null,
  clamp = clampWorkingWeight,
} = {}) {
  if (!exercise?.id) fail('exercise is required');
  if (!state || typeof state !== 'object') fail('progression state is required');
  const load = Number(state.load_kg);
  if (!Number.isFinite(load) || load <= 0) fail('state.load_kg must be positive');
  const { low, high } = rangeFrom(state, exercise);
  const setsTarget = Number(state.sets_target);
  if (!Number.isInteger(setsTarget) || setsTarget < 1) fail('state.sets_target must be a positive integer');
  const working = completedWorkingSets(completedSets);
  const completeExposure = working.length === setsTarget;
  const hitTop = completeExposure && working.every((set) => Number(set.reps) >= high && set.form_ok !== false);
  const fellBelowLow = completeExposure && working.some((set) => Number(set.reps) < low);
  const finalEffort = finalWorkingSetEffort(working);
  const topStreak = hitTop ? Number(state.consecutive_top || 0) + 1 : 0;
  const lowStreak = fellBelowLow ? Number(state.consecutive_below_low || 0) + 1 : 0;
  const percentage = Number(increment ?? defaultIncrement(exercise));
  if (!Number.isFinite(percentage) || percentage < 0.02 || percentage > 0.1) fail('increment must be within the 2–10% safety band');

  const base = {
    load_kg: load,
    rep_low: low,
    rep_high: high,
    sets_target: setsTarget,
    consecutive_top: topStreak,
    consecutive_below_low: lowStreak,
    reps_target: Number(state.reps_target ?? low),
  };
  const context = clampContext({ catalogue, exercise, state: base, history, bodyweightKg, equipmentStepKg, weeklyVolume });

  // A final-set "easy" means the exercise felt easy throughout. It can bring
  // forward only an increase that the completed top-range reps have already
  // earned (one complete top exposure instead of two); it is never a load
  // signal by itself. "very_hard" is a brake on either earned path.
  const increaseEarnedByReps = topStreak >= 2;
  const increaseEarnedEarlyByEasy = hitTop && finalEffort === 'easy' && topStreak >= 1;
  const shouldAttemptIncrease = increaseEarnedByReps || increaseEarnedEarlyByEasy;

  if (shouldAttemptIncrease) {
    if (finalEffort === 'very_hard') {
      return Object.freeze({
        action: 'hold',
        reason: 'very_hard on the final working set blocked the reps-earned load increase',
        next_state: Object.freeze({
          ...base,
          consecutive_top: 0,
          consecutive_below_low: 0,
        }),
        clamp: null,
        hit_top: hitTop,
        fell_below_low: fellBelowLow,
        effort: finalEffort,
      });
    }
    const safety = clamp({ ...context, proposedWeightKg: load * (1 + percentage) });
    const next = {
      ...base,
      load_kg: safety.accepted ? safety.clamped_kg : load,
      consecutive_top: 0,
      consecutive_below_low: 0,
      reps_target: low,
    };
    return Object.freeze({
      action: safety.accepted ? 'increase' : 'hold',
      reason: safety.accepted
        ? (increaseEarnedEarlyByEasy && !increaseEarnedByReps
          ? 'final-set easy brought a reps-earned increase forward by one complete exposure'
          : 'two consecutive complete exposures reached rep_high on every set')
        : safety.rejection_reason,
      next_state: Object.freeze(next),
      clamp: safety,
      hit_top: hitTop,
      fell_below_low: fellBelowLow,
      effort: finalEffort,
    });
  }

  if (lowStreak >= 2) {
    const safety = clamp({ ...context, proposedWeightKg: load * 0.9 });
    const next = {
      ...base,
      load_kg: safety.accepted ? safety.clamped_kg : load,
      consecutive_top: 0,
      consecutive_below_low: 0,
      reps_target: low,
    };
    return Object.freeze({
      action: safety.accepted ? 'decrease' : 'hold',
      reason: safety.accepted ? 'any working set fell below rep_low in two consecutive complete exposures' : safety.rejection_reason,
      next_state: Object.freeze(next),
      clamp: safety,
      hit_top: hitTop,
      fell_below_low: fellBelowLow,
      effort: finalEffort,
    });
  }

  return Object.freeze({
    action: 'hold',
    reason: hitTop ? 'first complete exposure at rep_high; repeat before increasing load' : 'hold load and chase the prescribed repetition range',
    next_state: Object.freeze(base),
    clamp: null,
    hit_top: hitTop,
    fell_below_low: fellBelowLow,
    effort: finalEffort,
  });
}
