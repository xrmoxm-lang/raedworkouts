import { DEFAULT_EQUIPMENT_STEP_KG, roundDownToEquipmentStep } from './catalogue.js';

export const CLAMP_IDS = Object.freeze({
  UNKNOWN_EXERCISE: 'C1',
  INVALID_WEIGHT: 'C2',
  EQUIPMENT_STEP: 'C3',
  SESSION_RISE: 'C4',
  ALL_TIME_CEILING: 'C5',
  FIRST_LOAD: 'C6',
  BODYWEIGHT_SANITY: 'C7',
  WEEKLY_VOLUME: 'C8',
});

const COUNTED_KINDS = new Set(['working', 'calibration']);
const PATTERN_MULTIPLES = Object.freeze({
  lower_compound: 4,
  hinge: 3,
  upper_press: 2,
  upper_pull: 2,
  isolation: 0.75,
  core: 0.75,
});

function lookup(catalogue, exerciseId) {
  if (!catalogue) return null;
  if (typeof catalogue.get === 'function') return catalogue.get(exerciseId);
  if (catalogue.byId instanceof Map) return catalogue.byId.get(exerciseId) || null;
  if (Array.isArray(catalogue)) return catalogue.find((exercise) => exercise.id === exerciseId) || null;
  if (Array.isArray(catalogue.exercises)) return catalogue.exercises.find((exercise) => exercise.id === exerciseId) || null;
  return null;
}

function numericHistory(history) {
  return (history || [])
    .filter((set) => set && set.valid !== false && (!set.kind || COUNTED_KINDS.has(set.kind)))
    .map((set) => Number(set.weight_kg ?? set.weight))
    .filter((weight) => Number.isFinite(weight) && weight > 0);
}

function note(context, id, outcome, detail = '') {
  return { ...context, trace: [...context.trace, Object.freeze({ id, outcome, detail })] };
}

function fired(context, id, detail = '') {
  return note({ ...context, clamp_fired: [...context.clamp_fired, id] }, id, 'fired', detail);
}

function reject(context, id, reason) {
  return note({ ...context, accepted: false, rejected_by: id, rejection_reason: reason, clamp_fired: [...context.clamp_fired, id] }, id, 'rejected', reason);
}

function currentPattern(exercise) {
  return exercise.canonical_pattern || exercise.pattern || 'isolation';
}

/** C1 — the exercise must be present in the static catalogue. */
export function clampUnknownExercise(context) {
  const exercise = lookup(context.catalogue, context.exercise_id);
  if (!exercise) return reject(context, CLAMP_IDS.UNKNOWN_EXERCISE, `unknown exercise "${context.exercise_id}"`);
  return note({ ...context, exercise }, CLAMP_IDS.UNKNOWN_EXERCISE, 'passed');
}

/** C2 — no zero, negative, non-numeric, or infinite prescription. */
export function clampInvalidWeight(context) {
  const proposed = Number(context.proposed_kg);
  if (!Number.isFinite(proposed) || proposed <= 0) return reject(context, CLAMP_IDS.INVALID_WEIGHT, 'proposed weight must be a positive finite number');
  return note({ ...context, effective_kg: proposed }, CLAMP_IDS.INVALID_WEIGHT, 'passed');
}

/** C3 — all equipment quantisation is conservative: round down. */
export function clampEquipmentStep(context) {
  const step = Number(context.equipment_step_kg ?? context.exercise?.equipment_step_kg ?? DEFAULT_EQUIPMENT_STEP_KG);
  const rounded = roundDownToEquipmentStep(context.effective_kg, step);
  if (!rounded || rounded <= 0) return reject(context, CLAMP_IDS.EQUIPMENT_STEP, 'rounding down produced a non-positive load');
  if (rounded !== context.effective_kg) return fired({ ...context, effective_kg: rounded }, CLAMP_IDS.EQUIPMENT_STEP, `rounded down to ${rounded} kg by ${step} kg equipment step`);
  return note(context, CLAMP_IDS.EQUIPMENT_STEP, 'passed');
}

/** C4 — never rise more than ten percent above the latest valid working load. */
export function clampSessionRise(context) {
  const history = numericHistory(context.history);
  const last = history.at(-1);
  if (!last) return note(context, CLAMP_IDS.SESSION_RISE, 'not_applicable');
  const ceiling = roundDownToEquipmentStep(
    last * 1.1,
    Number(context.equipment_step_kg ?? context.exercise?.equipment_step_kg ?? DEFAULT_EQUIPMENT_STEP_KG),
  );
  if (context.effective_kg > ceiling) {
    return fired({ ...context, effective_kg: ceiling }, CLAMP_IDS.SESSION_RISE, `capped at 10% above last completed ${last} kg`);
  }
  return note(context, CLAMP_IDS.SESSION_RISE, 'passed');
}

/** C5 — no prescription above 110% of best valid recorded working load. */
export function clampAllTimeCeiling(context) {
  const history = numericHistory(context.history);
  if (!history.length) return note(context, CLAMP_IDS.ALL_TIME_CEILING, 'not_applicable');
  const best = Math.max(...history);
  const ceiling = roundDownToEquipmentStep(
    best * 1.1,
    Number(context.equipment_step_kg ?? context.exercise?.equipment_step_kg ?? DEFAULT_EQUIPMENT_STEP_KG),
  );
  if (context.effective_kg > ceiling) {
    return fired({ ...context, effective_kg: ceiling }, CLAMP_IDS.ALL_TIME_CEILING, `capped at 110% of all-time best ${best} kg`);
  }
  return note(context, CLAMP_IDS.ALL_TIME_CEILING, 'passed');
}

/** C6 — an unlifted exercise needs a probe or self-selected calibration, never an agent number. */
export function clampFirstLoad(context) {
  if (numericHistory(context.history).length) return note(context, CLAMP_IDS.FIRST_LOAD, 'not_applicable');
  if (!['probe', 'self_selected'].includes(context.first_load_source)) {
    return reject(context, CLAMP_IDS.FIRST_LOAD, 'first prescription requires a probe or self-selected calibration');
  }
  return note(context, CLAMP_IDS.FIRST_LOAD, 'passed');
}

/** C7 — an engineering absurdity filter, not a training target. */
export function clampBodyweightSanity(context) {
  const bodyweight = Number(context.bodyweight_kg);
  if (!Number.isFinite(bodyweight) || bodyweight <= 0) return note(context, CLAMP_IDS.BODYWEIGHT_SANITY, 'not_applicable', 'bodyweight unavailable');
  const multiplier = PATTERN_MULTIPLES[currentPattern(context.exercise)] ?? PATTERN_MULTIPLES.isolation;
  const ceiling = bodyweight * multiplier;
  if (context.effective_kg > ceiling) {
    return reject(context, CLAMP_IDS.BODYWEIGHT_SANITY, `${context.effective_kg} kg exceeds ${multiplier}× bodyweight (${ceiling} kg) for ${currentPattern(context.exercise)}`);
  }
  return note(context, CLAMP_IDS.BODYWEIGHT_SANITY, 'passed');
}

/**
 * C8 applies to a projected, labelled weekly volume result. It protects both
 * the 4-credit floor and the 15-credit ceiling without inventing a conversion
 * between ordinary and fractional sets.
 */
export function clampWeeklySetCeiling(context) {
  if (!context.weekly_volume) return note(context, CLAMP_IDS.WEEKLY_VOLUME, 'not_applicable', 'projected weekly volume unavailable');
  const fractional = context.weekly_volume.fractional;
  if (!fractional || fractional.label !== 'fractional_sets' || !fractional.by_muscle) {
    return reject(context, CLAMP_IDS.WEEKLY_VOLUME, 'C8 requires a labelled fractional weekly-volume ledger');
  }
  const outOfBand = Object.entries(fractional.by_muscle)
    .filter(([, credits]) => !Number.isFinite(Number(credits)) || Number(credits) < 4 || Number(credits) > 15);
  if (outOfBand.length) {
    const details = outOfBand.map(([muscle, credits]) => `${muscle}: ${credits}`).join(', ');
    return reject(context, CLAMP_IDS.WEEKLY_VOLUME, `projected fractional volume is outside 4–15 credits (${details})`);
  }
  return note(context, CLAMP_IDS.WEEKLY_VOLUME, 'passed');
}

export const CLAMP_PIPELINE = Object.freeze([
  clampUnknownExercise,
  clampInvalidWeight,
  clampEquipmentStep,
  clampSessionRise,
  clampAllTimeCeiling,
  clampFirstLoad,
  clampBodyweightSanity,
  clampWeeklySetCeiling,
]);

/** Runs C1..C8 strictly in their specified order; each function is pure. */
export function clampWorkingWeight({
  catalogue,
  exerciseId,
  proposedWeightKg,
  history = [],
  equipmentStepKg = null,
  firstLoadSource = null,
  bodyweightKg = null,
  weeklyVolume = null,
} = {}) {
  let context = {
    catalogue,
    exercise_id: exerciseId,
    proposed_kg: proposedWeightKg,
    history,
    equipment_step_kg: equipmentStepKg,
    first_load_source: firstLoadSource,
    bodyweight_kg: bodyweightKg,
    weekly_volume: weeklyVolume,
    effective_kg: null,
    accepted: true,
    rejected_by: null,
    rejection_reason: null,
    clamp_fired: [],
    trace: [],
  };
  for (const clamp of CLAMP_PIPELINE) {
    context = clamp(context);
    if (!context.accepted) break;
  }
  return Object.freeze({
    accepted: context.accepted,
    proposed_kg: Number(proposedWeightKg),
    clamped_kg: context.accepted ? context.effective_kg : null,
    clamp_fired: Object.freeze([...context.clamp_fired]),
    rejected_by: context.rejected_by,
    rejection_reason: context.rejection_reason,
    trace: Object.freeze([...context.trace]),
  });
}
