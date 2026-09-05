import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DETECTED_SIGN,
  REPORTED_SIGNS,
  SIGN_THRESHOLD,
  detectStrengthLoss,
  nextWeekId,
  shouldDeload,
  signsThisWeek,
  weekId,
} from '../domain/deload.js';

// research/06-beginner-protocol.md §7.3, [LADDER] L523-551. This decides whether
// a human trains lighter for a week, so the rule is pinned here rather than
// inferred from whatever the UI happens to do.

test('the six signs are the six the source names, and only one is detected', () => {
  assert.deepEqual(REPORTED_SIGNS, ['joint_aches', 'exhausted', 'sore', 'no_motivation', 'poor_sleep']);
  assert.equal(DETECTED_SIGN, 'strength_loss');
  assert.equal(REPORTED_SIGNS.length + 1, 6, '§7.3 lists six warning signs');
});

test('«several ... concurrently» is two, and one is not enough', () => {
  assert.equal(SIGN_THRESHOLD, 2);
  assert.equal(shouldDeload([]), false);
  assert.equal(shouldDeload(['poor_sleep']), false);
  assert.equal(shouldDeload(['poor_sleep', 'no_motivation']), true);
  assert.equal(shouldDeload(['poor_sleep', 'no_motivation', 'sore']), true);
});

test('the detected sign counts toward the threshold like any other', () => {
  // One reported plus the one the app worked out for itself reaches two. This is
  // the whole reason detection is worth having: it halves what he must notice.
  const signs = signsThisWeek({ reported: ['sore'], strengthLoss: true });
  assert.deepEqual(signs.sort(), ['sore', 'strength_loss']);
  assert.equal(shouldDeload(signs), true);
});

test('a repeated tap is one sign, not two', () => {
  const signs = signsThisWeek({ reported: ['sore', 'sore', 'sore'] });
  assert.deepEqual(signs, ['sore']);
  assert.equal(shouldDeload(signs), false, 'tapping one chip three times must not book a deload');
});

test('a sign that is not one of the six cannot reach the threshold', () => {
  // This reads persisted state, which syncs between devices and has been
  // hand-edited in the past. An unknown value must not be able to invent a
  // seventh sign and, with one real one, put him on a lighter week.
  const signs = signsThisWeek({ reported: ['sore', 'feeling_great', 'hungry'] });
  assert.deepEqual(signs, ['sore']);
  assert.equal(shouldDeload(signs), false);
});

test('no signs and no detection is no deload', () => {
  assert.equal(shouldDeload(signsThisWeek({})), false);
  assert.equal(shouldDeload(signsThisWeek({ reported: [], strengthLoss: false })), false);
});

// ---- the detected sign ------------------------------------------------------

const set = (weight, extra = {}) => ({ is_warmup: false, completed: true, weight, reps: 10, ...extra });
const day = (date, exercises) => ({ date, exercises });

test('two exercises down on the week is a loss of strength; one is not', () => {
  const history = [
    day('2026-08-01', { press: { sets: [set(60)] }, row: { sets: [set(50)] } }),
    day('2026-09-01', { press: { sets: [set(45)] }, row: { sets: [set(40)] } }),
  ];
  assert.equal(detectStrengthLoss(history, '2026-08-29'), true);

  const onlyOne = [
    day('2026-08-01', { press: { sets: [set(60)] }, row: { sets: [set(50)] } }),
    day('2026-09-01', { press: { sets: [set(45)] }, row: { sets: [set(50)] } }),
  ];
  assert.equal(detectStrengthLoss(onlyOne, '2026-08-29'), false, '§7.3 says ≥2 different exercises');
});

test('holding the same weight is the programme working, not a loss', () => {
  const history = [
    day('2026-08-01', { press: { sets: [set(60)] }, row: { sets: [set(50)] } }),
    day('2026-09-01', { press: { sets: [set(60)] }, row: { sets: [set(50)] } }),
  ];
  assert.equal(detectStrengthLoss(history, '2026-08-29'), false);
});

test('a warm-up is lighter by design and is never read as weakness', () => {
  const history = [
    day('2026-08-01', { press: { sets: [set(60)] }, row: { sets: [set(50)] } }),
    day('2026-09-01', {
      press: { sets: [set(20, { is_warmup: true }), set(60)] },
      row: { sets: [set(20, { is_warmup: true }), set(50)] },
    }),
  ];
  assert.equal(detectStrengthLoss(history, '2026-08-29'), false);
});

test('an abandoned set is not evidence of anything', () => {
  const history = [
    day('2026-08-01', { press: { sets: [set(60)] }, row: { sets: [set(50)] } }),
    day('2026-09-01', {
      press: { sets: [set(60), set(30, { completed: false })] },
      row: { sets: [set(50), set(25, { completed: false })] },
    }),
  ];
  assert.equal(detectStrengthLoss(history, '2026-08-29'), false);
});

test('a swap is followed to the movement performed, not read as a collapse', () => {
  // Both machines are busy, so he swaps both for dumbbell versions and logs the
  // lighter loads those movements take. Read against the slots they replaced,
  // that is two exercises "down" and a booked deload week. They are different
  // movements.
  //
  // BOTH must be swapped, or this test passes whether or not the code follows
  // the swap: one exercise down never reaches the threshold of two anyway. The
  // first version of this test made exactly that mistake and a mutation that
  // ignored `swapped_to` entirely still passed it.
  const history = [
    day('2026-08-01', { press: { sets: [set(60)] }, row: { sets: [set(50)] } }),
    day('2026-09-01', {
      press: { swapped_to: 'db_press', sets: [set(30)] },
      row: { swapped_to: 'db_row', sets: [set(25)] },
    }),
  ];
  assert.equal(detectStrengthLoss(history, '2026-08-29'), false);

  // And the control: the same two loads logged under the ORIGINAL movements is
  // a real drop on both, which is the sign.
  const noSwap = [
    day('2026-08-01', { press: { sets: [set(60)] }, row: { sets: [set(50)] } }),
    day('2026-09-01', { press: { sets: [set(30)] }, row: { sets: [set(25)] } }),
  ];
  assert.equal(detectStrengthLoss(noSwap, '2026-08-29'), true);
});

test('a movement performed for the first time this week has nothing to be down against', () => {
  const history = [
    day('2026-09-01', { press: { sets: [set(45)] }, row: { sets: [set(40)] } }),
  ];
  assert.equal(detectStrengthLoss(history, '2026-08-29'), false);
});

test('the best load before the week is the comparison, not the most recent one', () => {
  // He hit 60, had a light day at 40, then this week did 50. Against the most
  // recent day that is a rise; against what he has actually done it is a drop,
  // and §7.3's sign is «persistent loss of strength».
  const history = [
    day('2026-08-01', { press: { sets: [set(60)] }, row: { sets: [set(50)] } }),
    day('2026-08-10', { press: { sets: [set(40)] }, row: { sets: [set(30)] } }),
    day('2026-09-01', { press: { sets: [set(50)] }, row: { sets: [set(45)] } }),
  ];
  assert.equal(detectStrengthLoss(history, '2026-08-29'), true);
});

test('no week boundary means no claim', () => {
  assert.equal(detectStrengthLoss([day('2026-09-01', { press: { sets: [set(1)] } })], null), false);
  assert.equal(detectStrengthLoss([], '2026-08-29'), false);
});

// ---- which week the deload lands on ----------------------------------------

test('the deload is booked for the following week, never the one reported on', () => {
  assert.equal(nextWeekId(1, 2, 12), '1:3');
  assert.equal(nextWeekId(3, 7, 12), '3:8');
});

test('booking past the end of a cycle rolls into week 1 of the next', () => {
  // The mesocycle wraps, and this is exactly where a naive week+1 would produce
  // week 13 — a week no block covers, which resolveProgrammeBlock would resolve
  // by falling through to the last block. Silently, and forever.
  assert.equal(nextWeekId(1, 12, 12), '2:1');
  assert.equal(nextWeekId(4, 12, 12), '5:1');
});

test('a week id names its cycle, because weeks repeat', () => {
  assert.notEqual(weekId(1, 5), weekId(2, 5));
  assert.equal(weekId(2, 5), '2:5');
});

test('nonsense input fails loudly rather than booking a wrong week', () => {
  assert.throws(() => nextWeekId(0, 1, 12), /positive integer/);
  assert.throws(() => nextWeekId(1, 0, 12), /positive integer/);
  assert.throws(() => nextWeekId(1, 13, 12), /cannot exceed/);
  assert.throws(() => detectStrengthLoss('not history', '2026-08-29'), /must be an array/);
});
