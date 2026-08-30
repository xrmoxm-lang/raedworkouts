/** Deterministic substitution ledger and safety classification (24 §5). */

// 'always' is the scope Raed actually wanted: a swap he makes because the machine
// does not exist in his gym should still be in force next week, not expire with
// the block. It matches every session, so scopeMatches needs no session check.
export const SUBSTITUTION_SCOPES = Object.freeze(['this_session', 'this_week', 'this_block', 'always']);
export const SUBSTITUTION_THRESHOLDS = Object.freeze({ cleanMin: 8, cleanMax: 14, floor: 4, ceiling: 15 });

function fail(message) {
  throw new Error(`Substitution invariant failed: ${message}`);
}

function exerciseFor(catalogue, id) {
  if (typeof catalogue?.get === 'function') return catalogue.get(id);
  if (catalogue?.byId instanceof Map) return catalogue.byId.get(id) || null;
  if (Array.isArray(catalogue?.exercises)) return catalogue.exercises.find((exercise) => exercise.id === id) || null;
  if (Array.isArray(catalogue)) return catalogue.find((exercise) => exercise.id === id) || null;
  return null;
}

function musclesFor(exercise) {
  const primary = exercise?.primary_muscle || exercise?.primary?.[0];
  if (!primary) fail(`exercise "${exercise?.id || '(missing)'}" needs one primary muscle`);
  const secondary = exercise.secondary_muscles || exercise.secondary || [];
  return { primary, secondary: [...new Set(secondary.filter((muscle) => muscle && muscle !== primary))] };
}

function addExerciseCredits(ledger, exercise, sets, direction = 1) {
  const count = Number(sets);
  if (!Number.isFinite(count) || count < 1) fail('programmed substitution sets must be positive');
  const { primary, secondary } = musclesFor(exercise);
  ledger[primary] = (ledger[primary] || 0) + count * direction;
  for (const muscle of secondary) ledger[muscle] = (ledger[muscle] || 0) + (count * 0.5 * direction);
}

function copyLedger(ledger) {
  return Object.fromEntries(Object.entries(ledger).map(([muscle, value]) => [muscle, Number(value.toFixed(3))]));
}

function scopeMatches(substitution, session, plan) {
  if (!substitution || substitution.from_exercise_id !== plan.exercise_id) return false;
  if (!SUBSTITUTION_SCOPES.includes(substitution.scope)) fail('substitution scope is invalid');
  return substitution.scope !== 'this_session' || substitution.session_id === session.id;
}

function applySubstitutionToId(id, session, plan, substitutions) {
  const applicable = (substitutions || []).filter((substitution) => scopeMatches(substitution, session, plan));
  return applicable.length ? applicable[applicable.length - 1].to_exercise_id : id;
}

function programmeRows(programme) {
  if (!Array.isArray(programme?.sessions)) fail('programme sessions are required');
  return programme.sessions.flatMap((session) => (session.exercises || []).map((plan) => ({ session, plan })));
}

/**
 * Rebuilds the projected weekly fractional ledger from programme data first.
 * The return value deliberately includes the arithmetic before any prose or
 * safety label can be added by a caller.
 */
export function recomputeSubstitutionLedger({ catalogue, programme, substitution, existingSubstitutions = [] } = {}) {
  if (!substitution?.from_exercise_id || !substitution?.to_exercise_id) fail('from_exercise_id and to_exercise_id are required');
  if (!SUBSTITUTION_SCOPES.includes(substitution.scope)) fail('substitution scope is invalid');
  const from = exerciseFor(catalogue, substitution.from_exercise_id);
  const to = exerciseFor(catalogue, substitution.to_exercise_id);
  if (!from || !to) fail('substitution references an unknown exercise');

  const baseline = {};
  const projected = {};
  const substitutions = [...existingSubstitutions, substitution];
  for (const { session, plan } of programmeRows(programme)) {
    const count = Number(plan.sets);
    const original = exerciseFor(catalogue, plan.exercise_id);
    if (!original) fail(`programme references unknown exercise "${plan.exercise_id}"`);
    addExerciseCredits(baseline, original, count);
    const projectedId = applySubstitutionToId(plan.exercise_id, session, plan, substitutions);
    const projectedExercise = exerciseFor(catalogue, projectedId);
    if (!projectedExercise) fail(`substitution target "${projectedId}" is unknown`);
    addExerciseCredits(projected, projectedExercise, count);
  }

  const muscleIds = new Set([...Object.keys(baseline), ...Object.keys(projected)]);
  const delta = {};
  for (const muscle of muscleIds) {
    if (!(muscle in baseline)) baseline[muscle] = 0;
    if (!(muscle in projected)) projected[muscle] = 0;
    const change = (projected[muscle] || 0) - (baseline[muscle] || 0);
    if (Math.abs(change) > 1e-9) delta[muscle] = Number(change.toFixed(3));
  }
  return Object.freeze({
    baseline: Object.freeze(copyLedger(baseline)),
    projected: Object.freeze(copyLedger(projected)),
    ledger_delta: Object.freeze(delta),
  });
}

/** Classifies a previously recomputed ledger; no hidden recomputation occurs. */
export function classifySubstitutionLedger(ledger, thresholds = SUBSTITUTION_THRESHOLDS) {
  if (!ledger?.projected || typeof ledger.projected !== 'object') fail('a recomputed projected ledger is required');
  const muscles = Object.entries(ledger.projected).map(([muscle, value]) => ({ muscle, value: Number(value) }));
  const blockers = muscles.filter(({ value }) => value < thresholds.floor || value > thresholds.ceiling);
  const warnings = muscles.filter(({ value }) => value < thresholds.cleanMin || value > thresholds.cleanMax);
  const affected = [...new Set([...Object.keys(ledger.ledger_delta || {}), ...blockers.map(({ muscle }) => muscle), ...warnings.map(({ muscle }) => muscle)])];
  if (blockers.length) {
    return Object.freeze({
      severity: 'block-with-override',
      muscles_affected: Object.freeze(affected),
      message: `${blockers.map(({ muscle, value }) => `${muscle} ${value}`).join(', ')} crosses the hard 4–15 fractional-set limit.`,
    });
  }
  if (warnings.length) {
    return Object.freeze({
      severity: 'warn',
      muscles_affected: Object.freeze(affected),
      message: `${warnings.map(({ muscle, value }) => `${muscle} ${value}`).join(', ')} sits outside the 8–14 efficiency band.`,
    });
  }
  return Object.freeze({ severity: 'clean', muscles_affected: Object.freeze(affected), message: 'All tracked muscles remain inside the 8–14 fractional-set efficiency band.' });
}

export function assessSubstitution(input) {
  const ledger = recomputeSubstitutionLedger(input);
  return Object.freeze({ ledger, classification: classifySubstitutionLedger(ledger) });
}
