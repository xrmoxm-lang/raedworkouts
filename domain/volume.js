import { canonicalUserKey } from './events.js';

const COUNTED_KINDS = new Set(['working', 'calibration']);

function fail(message) {
  throw new Error(`Volume invariant failed: ${message}`);
}

function dateAt(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(`${label} must be a valid date`);
  return date;
}

function isoWeekWindow(isoWeek) {
  const match = String(isoWeek).match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) fail('ISO week must be between 01 and 53');
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mondayOffset = (jan4.getUTCDay() + 6) % 7;
  const start = new Date(jan4.getTime() - mondayOffset * 86400000 + (week - 1) * 7 * 86400000);
  return { start, end: new Date(start.getTime() + 7 * 86400000) };
}

export function weekWindow(week) {
  if (typeof week === 'string') {
    const iso = isoWeekWindow(week);
    if (iso) return iso;
  }
  if (week && typeof week === 'object' && ('start' in week || 'start_at' in week)) {
    const start = dateAt(week.start ?? week.start_at, 'week.start');
    const end = dateAt(week.end ?? week.end_at, 'week.end');
    if (end <= start) fail('week.end must be after week.start');
    return { start, end };
  }
  const start = dateAt(week, 'week');
  return { start, end: new Date(start.getTime() + 7 * 86400000) };
}

function exerciseLookup(catalogue, exerciseId) {
  if (!catalogue) return null;
  if (typeof catalogue.get === 'function') return catalogue.get(exerciseId);
  if (catalogue.byId instanceof Map) return catalogue.byId.get(exerciseId) || null;
  if (Array.isArray(catalogue)) return catalogue.find((exercise) => exercise.id === exerciseId) || null;
  if (Array.isArray(catalogue.exercises)) return catalogue.exercises.find((exercise) => exercise.id === exerciseId) || null;
  return null;
}

function primaryMuscle(exercise) {
  if (typeof exercise.primary_muscle === 'string') return exercise.primary_muscle;
  if (Array.isArray(exercise.primary) && exercise.primary.length === 1) return exercise.primary[0];
  fail(`exercise "${exercise.id}" has no valid primary muscle`);
}

function secondaryMuscles(exercise) {
  return exercise.secondary_muscles || exercise.secondary || [];
}

function ledgerMuscle(muscle, taxonomy) {
  if (!taxonomy) return muscle;
  if (!Object.hasOwn(taxonomy, muscle)) {
    fail(`volume taxonomy has no mapping for muscle "${muscle}"`);
  }
  const mapped = taxonomy[muscle];
  if (mapped === null) return null;
  if (typeof mapped !== 'string' || !mapped.trim()) {
    fail(`volume taxonomy mapping for muscle "${muscle}" must be a non-empty string or null`);
  }
  return mapped;
}

function addCredit(currency, muscle, amount) {
  currency.by_muscle[muscle] = (currency.by_muscle[muscle] || 0) + amount;
  currency.total_credits += amount;
}

function currency(label, unit) {
  return { label, unit, working_set_count: 0, total_credits: 0, by_muscle: {} };
}

function snapshotFrom(source) {
  if (source?.snapshot) return source.snapshot;
  if (source?.eventLog?.snapshot) return source.eventLog.snapshot;
  if (source?.sets) return source;
  return null;
}

/**
 * Returns both declared currencies. Ordinary credits assign each involved
 * muscle one traditional set; fractional credits assign 1.0 primary + 0.5
 * secondary. Warm-ups and corrupt working rows never enter either ledger.
 */
export function weeklyVolume(user, week, source = {}, legacyCatalogue = null) {
  const options = source?.eventLog || source?.snapshot || source?.sets || source?.catalogue
    ? source
    : { eventLog: source, catalogue: legacyCatalogue };
  const snapshot = snapshotFrom(options);
  const catalogue = options.catalogue || legacyCatalogue;
  const taxonomy = options.muscleTaxonomy || null;
  if (!snapshot) fail('weeklyVolume requires an event-log snapshot');
  const userKey = canonicalUserKey(typeof user === 'object' ? (user.user_key ?? user.userId ?? user.id) : user);
  if (!userKey) fail('weeklyVolume requires a user');
  if (snapshot.user_key && canonicalUserKey(snapshot.user_key) !== userKey) fail('user does not own this snapshot');
  const { start, end } = weekWindow(week);
  const ordinary = currency('ordinary_sets', 'traditional working-set credits');
  const fractional = currency('fractional_sets', 'fractional working-set credits');

  for (const set of snapshot.sets || []) {
    if (!COUNTED_KINDS.has(set.kind) || set.valid === false) continue;
    const completedAt = dateAt(set.completed_at, `set "${set.id}" completed_at`);
    if (completedAt < start || completedAt >= end) continue;
    const exercise = exerciseLookup(catalogue, set.exercise_id);
    if (!exercise) fail(`set "${set.id}" references unknown exercise "${set.exercise_id}"`);
    const primary = ledgerMuscle(primaryMuscle(exercise), taxonomy);
    const secondary = [...new Set(secondaryMuscles(exercise)
      .filter(Boolean)
      .map((muscle) => ledgerMuscle(muscle, taxonomy))
      .filter((muscle) => muscle && muscle !== primary))];
    ordinary.working_set_count += 1;
    fractional.working_set_count += 1;
    if (primary) {
      addCredit(ordinary, primary, 1);
      addCredit(fractional, primary, 1);
    }
    for (const muscle of secondary) {
      addCredit(ordinary, muscle, 1);
      addCredit(fractional, muscle, 0.5);
    }
  }

  return Object.freeze({
    user_key: userKey,
    week: Object.freeze({ start: start.toISOString(), end: end.toISOString() }),
    ordinary: Object.freeze({ ...ordinary, by_muscle: Object.freeze({ ...ordinary.by_muscle }) }),
    fractional: Object.freeze({ ...fractional, by_muscle: Object.freeze({ ...fractional.by_muscle }) }),
  });
}

/** Converts a labelled fractional ledger to a plain map only for clamp math. */
export function fractionalCredits(volume) {
  if (!volume?.fractional || volume.fractional.label !== 'fractional_sets') {
    fail('fractionalCredits requires a labelled fractional volume result');
  }
  return { ...volume.fractional.by_muscle };
}
