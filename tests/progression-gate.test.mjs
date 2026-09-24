// Round 5, findings #2 and #3.
//
// The live load controller (`suggestNextWeight`) and the canonical one
// (`domain/progression.js`) disagreed about what counts as an exposure: the
// canonical engine gated on a COMPLETE one and was imported by nothing the
// browser loads, while the live engine had no `sets_target` check at all. The
// predicates below are now the single definition both read. The clamps, also
// dead until Round 5, are wired to the live suggestion, which meant their
// percentage ceilings met fixed equipment steps for the first time.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CLAMP_IDS, clampWorkingWeight } from '../domain/clamps.js';
import { fellBelowRepFloor, hitTopOfRange, isCompleteExposure } from '../domain/progression.js';

const dumbbell = [{ id: 'lateral_raise_db', canonical_pattern: 'isolation', equipment_step_kg: 2.5 }];
const machine = [{ id: 'chest_press_machine', canonical_pattern: 'upper_press', equipment_step_kg: 2.5 }];
const logged = (...weights) => weights.map((weight_kg) => ({ kind: 'working', valid: true, weight_kg }));

test('an exposure is complete only when every prescribed working set was performed', () => {
  const abandoned = [{ reps: 10 }];                                   // machine taken after set 1
  const full = [{ reps: 10 }, { reps: 10 }, { reps: 10 }];

  assert.equal(isCompleteExposure(abandoned, 3), false);
  assert.equal(isCompleteExposure(full, 3), true);
  // An EXTRA working set is more work than prescribed, never less.
  assert.equal(isCompleteExposure([...full, { reps: 10 }], 3), true);
  // Weeks 1 and 5 legitimately prescribe two sets, and two of two is complete.
  assert.equal(isCompleteExposure([{ reps: 10 }, { reps: 10 }], 2), true);
  assert.equal(isCompleteExposure(full, 0), false, 'no prescription is not a complete exposure');
  assert.equal(isCompleteExposure(full, null), false);

  // research/22 §2: `hit_top` is defined over a complete exposure. One set of
  // ten out of three prescribed is not «أكملت 10 في كل المجموعات».
  assert.equal(hitTopOfRange(abandoned, 3, 10), false);
  assert.equal(hitTopOfRange(full, 3, 10), true);
  assert.equal(hitTopOfRange([{ reps: 10 }, { reps: 10 }, { reps: 9 }], 3, 10), false);
  assert.equal(hitTopOfRange([{ reps: 10 }, { reps: 10 }, { reps: 10, form_ok: false }], 3, 10), false);

  // The same gate downward: one abandoned set under the floor is not evidence
  // that the load is too heavy, and it must not walk the weight back.
  assert.equal(fellBelowRepFloor([{ reps: 6 }], 3, 8), false);
  assert.equal(fellBelowRepFloor([{ reps: 6 }, { reps: 9 }, { reps: 9 }], 3, 8), true);
  assert.equal(fellBelowRepFloor(full, 3, 8), false);
});

test('C4 and C5 never refuse the one increment the equipment actually offers', () => {
  // A 4 kg lateral raise on a 2.5 kg rack: the smallest jump that exists is
  // 62%. A percentage-only ceiling rounds 10% down to the step, resolves to
  // 4 kg or less, and the load can never move again — which is what these two
  // clamps did for as long as nothing called them.
  const earned = clampWorkingWeight({
    catalogue: dumbbell,
    exerciseId: 'lateral_raise_db',
    proposedWeightKg: 6.5,
    history: logged(4, 4),
    equipmentStepKg: 2.5,
    firstLoadSource: 'history',
    bodyweightKg: 82,
  });
  assert.equal(earned.accepted, true);
  assert.ok(
    !earned.clamp_fired.includes(CLAMP_IDS.SESSION_RISE)
    && !earned.clamp_fired.includes(CLAMP_IDS.ALL_TIME_CEILING),
    'one equipment step above the last completed load is not a ceiling breach',
  );
  assert.ok(earned.clamped_kg >= 4, 'a ceiling must never hand back LESS than the load he already lifts');

  // And the ceiling still exists where it was meant to: a jump no rack change
  // could explain is capped, not passed through.
  const hallucination = clampWorkingWeight({
    catalogue: machine,
    exerciseId: 'chest_press_machine',
    proposedWeightKg: 300,
    history: logged(100, 100),
    equipmentStepKg: 2.5,
    firstLoadSource: 'history',
    bodyweightKg: 82,
  });
  assert.ok(hallucination.clamp_fired.includes(CLAMP_IDS.SESSION_RISE), 'a 100 → 300 kg jump must hit C4');
  // 110, the percentage ceiling — not 102.5, the one-step floor. Above the
  // granularity of the equipment the percentage is still what binds.
  assert.equal(hallucination.accepted, true);
  assert.equal(hallucination.clamped_kg, 110, 'capped at 110%, not waved through and not floored at one step');
});
