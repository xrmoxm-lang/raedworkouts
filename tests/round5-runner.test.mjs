// Round 5 — the PR cache is reversible.
//
// Confirmed 2026-09-23 by breaking the app: 900 × 12 (a fat-finger for 90) on
// Chest Press Machine, ticked once, wrote
// `state.prs.chest_press_machine = {kg:900, reps:12, score:1260}` — and nothing
// could take it back. Unticking left it. Correcting to 90 × 12 and re-ticking
// could not either, because 90 × 12 scores 126 and `detectPR` only writes on a
// HIGHER score. So tonight's end screen claimed a «900 kg × 12» record and from
// then on no real PR on that movement was detectable; the only escape in the
// whole app was Settings → clear ALL PRs.
import assert from 'node:assert/strict';
import test from 'node:test';

import { detectPR, revertPR } from '../core/engine.js';
import { state } from '../core/store.js';

const PREVIOUS = { kg: 90, reps: 12, date: '2026-09-01', score: 126 };

test('unticking a mistyped PR puts back exactly what the tick displaced', () => {
  state.prs = { chest_press_machine: { ...PREVIOUS } };
  const set = { is_warmup: false, weight: 900, reps: 12 };

  assert.equal(detectPR('chest_press_machine', 900, 12, set), true);
  assert.equal(state.prs.chest_press_machine.kg, 900);

  // The untick.
  assert.equal(revertPR('chest_press_machine', set), true);
  assert.deepEqual(state.prs.chest_press_machine, PREVIOUS);
  // The marker is spent: a second untick must not rewrite anything.
  assert.equal(revertPR('chest_press_machine', set), false);

  // And the corrected set can now be judged against the record he really holds
  // rather than against a number he never lifted.
  const corrected = { is_warmup: false, weight: 95, reps: 12 };
  assert.equal(detectPR('chest_press_machine', 95, 12, corrected), true);
  assert.equal(state.prs.chest_press_machine.kg, 95);
});

test('a first-ever PR written by a tick is removed by the untick, not left as a floor', () => {
  state.prs = {};
  const set = { is_warmup: false, weight: 900, reps: 12 };
  detectPR('lat_pulldown', 900, 12, set);
  assert.ok(state.prs.lat_pulldown);

  revertPR('lat_pulldown', set);
  // Not «restored to undefined» — gone. A movement with no record must read as
  // having no record, or `suggestNextWeight` and the end screen both see a ghost.
  assert.equal(Object.prototype.hasOwnProperty.call(state.prs, 'lat_pulldown'), false);
});

test('a record this set never wrote is left alone', () => {
  // The reversal must be surgical. Unticking a set that did NOT beat the record
  // may not delete the record — that would be a second way to lose real work.
  const held = { kg: 140, reps: 5, date: '2026-08-01', score: 163.33 };
  state.prs = { hack_squat: { ...held } };
  const set = { is_warmup: false, weight: 100, reps: 5 };

  assert.equal(detectPR('hack_squat', 100, 5, set), false);
  assert.equal(revertPR('hack_squat', set), false);
  assert.deepEqual(state.prs.hack_squat, held);
});
