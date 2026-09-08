// Trigger-based deload — research/06-beginner-protocol.md §7.
//
// §7.2 rules: «[LADDER] wins. No scheduled deload in the first block. Deload on
// trigger, with a week-12 backstop.» Only the backstop was built; the trigger,
// which is the half the ruling actually turns on, stayed prose in a research
// file for the whole of v16.
//
// §7.3: fire a deload when **≥2 of six warning signs are true at the same time,
// for ≥1 week** ([LADDER] L523-551):
//   1 persistent joint aches
//   2 persistent loss of strength   ← app-detectable, never asked
//   3 feeling exhausted and run down
//   4 persistent extreme muscle soreness
//   5 loss of training motivation
//   6 difficulty sleeping
// «If you experience several of these warning signs concurrently, you should
// consider reducing your training load for a week or two.» — [LADDER] L551
//
// Pure on purpose. This decides whether a human being trains lighter for a
// week, so every branch of it is unit-testable without a browser.

function fail(message) {
  throw new Error(`Deload invariant failed: ${message}`);
}

/** The five signs only he can report. Loss of strength is computed, not asked. */
export const REPORTED_SIGNS = Object.freeze([
  'joint_aches',
  'exhausted',
  'sore',
  'no_motivation',
  'poor_sleep',
]);

export const DETECTED_SIGN = 'strength_loss';

/** «several ... concurrently» — §7.3 fixes several at two. */
export const SIGN_THRESHOLD = 2;

/**
 * Which of the six hold this week.
 *
 * Reported signs are filtered against the known list rather than trusted: this
 * reads persisted state, and a stale or hand-edited entry must not be able to
 * invent a seventh sign and reach the threshold on its own.
 */
export function signsThisWeek({ reported = [], strengthLoss = false } = {}) {
  const known = new Set(REPORTED_SIGNS);
  const signs = [...new Set((Array.isArray(reported) ? reported : []).filter((sign) => known.has(sign)))];
  if (strengthLoss) signs.push(DETECTED_SIGN);
  return signs;
}

/** Whether those signs meet the bar. One sign is explicitly not enough. */
export function shouldDeload(signs) {
  return (Array.isArray(signs) ? signs : []).length >= SIGN_THRESHOLD;
}

/**
 * «Persistent loss of strength», read out of his own logs.
 *
 * §7.3 marks this one app-detectable through rule R6 — a stall on ≥2 different
 * exercises in the same week. R6 is not implemented, so this reads what R6 would
 * read: the top working weight per exercise this week against the best he had
 * logged for that exercise before this week. Two or more down is the sign.
 *
 * Deliberately narrow:
 *  - working sets only, completed only. A warm-up is lighter by design and an
 *    abandoned set is not evidence of anything.
 *  - per exercise, and it follows a swap to the movement actually performed, so
 *    a substitution is never read as a collapse in strength.
 *  - a real drop, not equality. Repeating a weight is the programme working.
 */
export function detectStrengthLoss(history, weekStartISO) {
  if (!weekStartISO) return false;
  if (!Array.isArray(history)) fail('history must be an array');
  const before = new Map();
  const during = new Map();
  for (const entry of history) {
    const date = String(entry?.date || '').slice(0, 10);
    if (!date) continue;
    const bucket = date >= weekStartISO ? during : before;
    for (const [plannedId, exState] of Object.entries(entry?.exercises || {})) {
      const id = exState?.swapped_to || plannedId;
      for (const set of exState?.sets || []) {
        if (!set || set.is_warmup || !set.completed) continue;
        const weight = Number(set.weight);
        if (!Number.isFinite(weight) || weight <= 0) continue;
        const seen = bucket.get(id);
        if (seen === undefined || weight > seen) bucket.set(id, weight);
      }
    }
  }
  let down = 0;
  for (const [id, current] of during) {
    const best = before.get(id);
    if (best !== undefined && current < best) down += 1;
  }
  return down >= 2;
}

/**
 * The week a trigger books, given where he is now.
 *
 * Always the NEXT week, never the one being reported on: he has already trained
 * it, and [LADDER] L551 prescribes «reducing your training load for a week», not
 * truncating the week in progress.
 *
 * Weeks are identified as `cycle:week` because the mesocycle wraps — week 5 of
 * cycle 1 and week 5 of cycle 2 are different weeks. Scoped substitutions
 * learned that the hard way.
 */
export function nextWeekId(cycle, week, cycleLength) {
  const c = Number(cycle);
  const w = Number(week);
  const len = Number(cycleLength);
  if (!Number.isInteger(c) || c < 1) fail('cycle must be a positive integer');
  if (!Number.isInteger(w) || w < 1) fail('week must be a positive integer');
  if (!Number.isInteger(len) || len < 1) fail('cycle length must be a positive integer');
  if (w > len) fail('week cannot exceed the cycle length');
  return w === len ? `${c + 1}:1` : `${c}:${w + 1}`;
}

export const weekId = (cycle, week) => `${cycle}:${week}`;
