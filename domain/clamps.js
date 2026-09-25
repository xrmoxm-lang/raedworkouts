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

function positiveKg(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

// ---- The Matrix stack ladder ------------------------------------------------
// Raed's REAL logged stack loads (sync DB, read-only, 2026-09-25): 4.5, 9, 14,
// 18, 23, 32, 63 — face pull 9/14, lat pulldown 18/25/32, cable row 25/32. That
// is Matrix's 10-lb plate printed in kg and ROUNDED to the integer: n × 4.5359
// → 5, 9, 14, 18, 23, 27, 32, 36, 41 … A linear 4.5 step proposes 13.5 / 22.5
// / 31.5, which no label on his stack says. He sometimes types 4.5 for the
// first plate, so that is rung 1 too.
export const MATRIX_LADDER = 'matrix';
export const MATRIX_KG_PER_PLATE = 4.5359;
export const MATRIX_RUNGS = 40;
// The widest gap between two labels (18 → 23). The clamps (C3–C5) and the
// canonical engine speak numbers; this is the number a ladder answers with, so
// C4's «one equipment step» ceiling never trims a real next rung.
export const MATRIX_NOMINAL_STEP_KG = 5;
// A load within this of n × 4.5359 IS rung n: every printed label (rounded, so
// within 0.5), his 4.5 for the first plate, the 13.5 / 22.5 / 31.5 the linear
// step used to write, and his logged 63 (= 14 × 4.5359 = 63.50, however the
// decal rounds it). A whole kilo, not half: a 40 he typed (40.82 is rung 9)
// must step to 45, not to a «+1 kg» 41. 16 and 25 (a different station) are
// ≥ 1.8 kg off every rung: not rungs, left as typed.
const RUNG_TOLERANCE_KG = 1;

export function stackLabelKg(n) {
  return Math.round(n * MATRIX_KG_PER_PLATE);
}
export function isLadderStep(step) {
  return step === MATRIX_LADDER;
}
/** The rung a load sits on, or null when it is not on the ladder. */
export function matrixRung(weightKg) {
  const weight = Number(weightKg);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  const n = Math.round(weight / MATRIX_KG_PER_PLATE);
  if (n < 1 || n > MATRIX_RUNGS) return null;
  return Math.abs(weight - n * MATRIX_KG_PER_PLATE) <= RUNG_TOLERANCE_KG ? n : null;
}

// A step is a positive number of kg, or the Matrix ladder.
function stepSpec(value) {
  return isLadderStep(value) ? MATRIX_LADDER : positiveKg(value);
}

/**
 * How THIS equipment moves, first answer wins — a number of kg, or the Matrix
 * ladder:
 *   1. `equipment_step_kg` — a caller that already resolved it (the pipeline
 *      below is handed `core/engine.js equipmentStepKg`'s answer);
 *   2. `prefs.steps[prefs.device]` — what he set in ⚙️ «درجة الجهاز» for the
 *      machine he is standing at (two leg presses are two sleds);
 *   3. `prefs.step_kg` — the same, for the movement when no machine is named;
 *   4. `learned_step_kg` — a step read off his own log, only ever COARSER than
 *      the static one and never over a ladder (the caller enforces both);
 *   5. `kind_step_kg` — the equipment kind he picked in the sheet;
 *   6. `exercise.equipment_ladder` / `exercise.equipment_step_kg` — data.js;
 *   7. 2.5 kg, research/06 §5.2's fallback «when the increment is unknown».
 * Before Round 6 only 1, 6 and 7 existed and data.js carried no step at all, so
 * every movement resolved to 2.5 whatever it was.
 */
export function stepSpecFor(context = {}) {
  const prefs = context.prefs || null;
  const device = String(prefs?.device || '').trim();
  const candidates = [
    context.equipment_step_kg,
    device ? prefs?.steps?.[device] : null,
    prefs?.step_kg,
    context.learned_step_kg,
    context.kind_step_kg,
    context.exercise?.equipment_ladder,
    context.exercise?.equipment_step_kg,
  ];
  for (const candidate of candidates) {
    const step = stepSpec(candidate);
    if (step) return step;
  }
  return DEFAULT_EQUIPMENT_STEP_KG;
}

/** The same resolution, as the number the clamps and percentages need. */
export function stepFor(context = {}) {
  const spec = stepSpecFor(context);
  return isLadderStep(spec) ? MATRIX_NOMINAL_STEP_KG : spec;
}

/**
 * C3's direction on either kind of equipment: the heaviest load at or under
 * `weightKg` that the equipment has. On the ladder a load already ON a rung
 * reads as that rung's label (13.5 → 14), anything else floors to the label
 * below it. Null when nothing fits (under the first plate).
 */
export function roundDownToStep(weightKg, step) {
  if (!isLadderStep(step)) return roundDownToEquipmentStep(weightKg, positiveKg(step) || DEFAULT_EQUIPMENT_STEP_KG);
  const weight = Number(weightKg);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  const rung = matrixRung(weight);
  if (rung) return stackLabelKg(rung);
  let best = null;
  for (let n = 1; n <= MATRIX_RUNGS && stackLabelKg(n) <= weight; n += 1) best = stackLabelKg(n);
  return best;
}

/**
 * One earned step up.
 * Ladder: on a rung → the next label (4.5 → 9, 23 → 27, 63 → 68); off it (16,
 * 25 — a station that differs) → the first label ABOVE what he typed (18, 27).
 * Past the top of the stack, the nominal step.
 * Numbers: landed on the equipment's grid when that is honest. `last + step`
 * alone inherits whatever grid `last` sat on: an 8 kg dumbbell + 2.5 proposes
 * 10.5, which no rack holds, where 10 is right there. So the sum is rounded
 * DOWN to the step (C3's direction) — unless that would swallow more than half
 * the step; then his own history wins and the step is added as-is. Never above
 * `last + step`, so C4's one-step ceiling is never what trims it. Rounded to
 * grams so float noise never reaches the screen.
 */
export function nextStepUp(lastKg, step) {
  const last = Number(lastKg);
  if (!Number.isFinite(last) || last < 0) return null;
  if (isLadderStep(step)) {
    const rung = matrixRung(last);
    if (rung && rung < MATRIX_RUNGS) return stackLabelKg(rung + 1);
    for (let n = 1; n <= MATRIX_RUNGS; n += 1) if (!rung && stackLabelKg(n) > last) return stackLabelKg(n);
    return Math.round((last + MATRIX_NOMINAL_STEP_KG) * 1000) / 1000;
  }
  const size = positiveKg(step);
  if (!size) return null;
  const snapped = roundDownToEquipmentStep(last + size, size);
  const next = snapped - last >= size / 2 ? snapped : last + size;
  return Math.round(next * 1000) / 1000;
}

/**
 * The mirror image, for research/06 §5.3 R6's walk-back. Ladder: the label
 * below his rung (23 → 18), or below what he typed (16 → 14); 0 under the
 * first plate. Numbers: one step down, on the grid unless the grid would take
 * more than one and a half steps off him. Never below zero.
 */
export function nextStepDown(lastKg, step) {
  const last = Number(lastKg);
  if (!Number.isFinite(last) || last <= 0) return null;
  if (isLadderStep(step)) {
    const rung = matrixRung(last);
    if (rung) return rung > 1 ? stackLabelKg(rung - 1) : 0;
    let below = 0;
    for (let n = 1; n <= MATRIX_RUNGS && stackLabelKg(n) < last; n += 1) below = stackLabelKg(n);
    return below;
  }
  const size = positiveKg(step);
  if (!size) return null;
  const target = Math.max(0, last - size);
  const snapped = target > 0 ? (roundDownToEquipmentStep(target, size) ?? 0) : 0;
  const next = snapped > 0 && last - snapped <= size * 1.5 ? snapped : target;
  return Math.round(next * 1000) / 1000;
}

/**
 * A percentage ceiling, floored at ONE equipment step.
 *
 * The gym is quantised. On a 4 kg dumbbell the smallest jump the rack offers is
 * 2.5 kg — 62%, far past any percentage band — so a pure «10%, rounded down to
 * the step» ceiling resolves to 4 kg and the load can never move again. Ten
 * percent OR one step, whichever is larger: a hallucinated 100 → 300 kg jump is
 * still capped at 110 kg, and the one increment that physically exists is still
 * available. Wired live 2026-09-23 (Round 5 finding #3); until then these
 * clamps were imported by nothing the browser loads, so nothing depended on
 * the percentage-only reading. Exported 2026-09-23 (Round 5, health) so the
 * runner's fat-finger guard can ask the same question of a load he TYPES: a
 * weight within one step of his own best is never a typo, whatever C7 thinks.
 */
export function ceilingAbove(reference, step) {
  return Math.max(roundDownToEquipmentStep(reference * 1.1, step), reference + step);
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
  const step = stepFor(context);
  const rounded = roundDownToEquipmentStep(context.effective_kg, step);
  if (!rounded || rounded <= 0) return reject(context, CLAMP_IDS.EQUIPMENT_STEP, 'rounding down produced a non-positive load');
  if (rounded !== context.effective_kg) return fired({ ...context, effective_kg: rounded }, CLAMP_IDS.EQUIPMENT_STEP, `rounded down to ${rounded} kg by ${step} kg equipment step`);
  return note(context, CLAMP_IDS.EQUIPMENT_STEP, 'passed');
}

/** C4 — never rise more than ten percent (or one equipment step) above the latest valid working load. */
export function clampSessionRise(context) {
  const history = numericHistory(context.history);
  const last = history.at(-1);
  if (!last) return note(context, CLAMP_IDS.SESSION_RISE, 'not_applicable');
  const ceiling = ceilingAbove(last, stepFor(context));
  if (context.effective_kg > ceiling) {
    return fired({ ...context, effective_kg: ceiling }, CLAMP_IDS.SESSION_RISE, `capped at 10% (or one equipment step) above last completed ${last} kg`);
  }
  return note(context, CLAMP_IDS.SESSION_RISE, 'passed');
}

/** C5 — no prescription above 110% (or one equipment step above) the best valid recorded working load. */
export function clampAllTimeCeiling(context) {
  const history = numericHistory(context.history);
  if (!history.length) return note(context, CLAMP_IDS.ALL_TIME_CEILING, 'not_applicable');
  const best = Math.max(...history);
  const ceiling = ceilingAbove(best, stepFor(context));
  if (context.effective_kg > ceiling) {
    return fired({ ...context, effective_kg: ceiling }, CLAMP_IDS.ALL_TIME_CEILING, `capped at 110% (or one equipment step above) all-time best ${best} kg`);
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

/**
 * The C7 ceiling as a plain number, so the runner's own fat-finger guard and
 * the prescription pipeline cannot disagree about what is physically absurd.
 * Returns null when bodyweight is unknown — C7 is 'not_applicable' then, and a
 * caller with no bodyweight has no business inventing a ceiling of its own.
 * Exported 2026-09-23 (Round 5, health): `core/engine.js loadSanityCeilingKg`
 * is the second caller.
 */
export function bodyweightSanityCeilingKg(pattern, bodyweightKg) {
  const bodyweight = Number(bodyweightKg);
  if (!Number.isFinite(bodyweight) || bodyweight <= 0) return null;
  const multiplier = PATTERN_MULTIPLES[pattern] ?? PATTERN_MULTIPLES.isolation;
  return bodyweight * multiplier;
}

/** C7 — an engineering absurdity filter, not a training target. */
export function clampBodyweightSanity(context) {
  const ceiling = bodyweightSanityCeilingKg(currentPattern(context.exercise), context.bodyweight_kg);
  if (ceiling === null) return note(context, CLAMP_IDS.BODYWEIGHT_SANITY, 'not_applicable', 'bodyweight unavailable');
  const multiplier = PATTERN_MULTIPLES[currentPattern(context.exercise)] ?? PATTERN_MULTIPLES.isolation;
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
