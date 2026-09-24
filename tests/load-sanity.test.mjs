// Round 5 (health) — the load he TYPES has a ceiling too.
//
// The clamps police what the coach PROPOSES. Until 2026-09-23 nothing policed
// data entry, and that is the half that lasts: one fat-fingered 800 kg ticked
// once goes into `state.prs`, the archived session stats, the weekly volume and
// the history tonnage, and the suggestion engine then reads 800 as his working
// load forever. C7 (`domain/clamps.js`) already knew 800 kg is not a human
// pressing motion — it had no caller on that path.
//
// These are unit tests for the number the runner's guard asks for. The tap
// behaviour it drives is proved in the browser by tests/load-sanity.spec.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  CLAMP_IDS,
  bodyweightSanityCeilingKg,
  clampWorkingWeight,
} from '../domain/clamps.js';

// data.js is a classic script that assigns `window.RW`, and core/* reach for a
// handful of browser globals at import time. The shim below is the smallest one
// that lets the REAL engine run under node — nothing here is stubbed that the
// assertions depend on.
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const noopClassList = { add() {}, remove() {}, toggle() {}, contains: () => false };
globalThis.document = {
  documentElement: { style: { setProperty() {} }, classList: noopClassList },
  body: { classList: noopClassList },
  addEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: noopClassList, setAttribute() {}, appendChild() {} }),
};
const memory = {};
globalThis.localStorage = {
  getItem: (key) => (key in memory ? memory[key] : null),
  setItem: (key, value) => { memory[key] = String(value); },
  removeItem: (key) => { delete memory[key]; },
  key: (index) => Object.keys(memory)[index],
  get length() { return Object.keys(memory).length; },
};
new Function(fs.readFileSync(new URL('../data.js', import.meta.url), 'utf8'))();

const { loadSanityCeilingKg } = await import('../core/engine.js');
const { state } = await import('../core/store.js');

// Raed, 82 kg (data.js ATHLETE). C7's multiples: upper_press 2x (164 kg),
// lower_compound 4x (328 kg), isolation 0.75x (61.5 kg).
function seed(history = []) {
  state.profile = { display_name: 'Raed', experience: 'detrained', bodyweight_kg: 82 };
  state.history = history;
  state.prs = {};
}

function session(exercise_id, kg) {
  return {
    date: '2026-09-01',
    exercises: { [exercise_id]: { sets: [{ weight: kg, reps: 10, completed: true }] } },
  };
}

test('the C7 ceiling is one number with two callers — the clamp and the runner guard', () => {
  assert.equal(bodyweightSanityCeilingKg('upper_press', 82), 164);
  assert.equal(bodyweightSanityCeilingKg('lower_compound', 82), 328);
  // An unknown pattern falls back to the isolation multiple, as C7 always did.
  assert.equal(bodyweightSanityCeilingKg('nonsense_pattern', 82), 61.5);
  // No bodyweight, no ceiling: C7 is 'not_applicable' and a caller must not
  // invent a limit of its own.
  assert.equal(bodyweightSanityCeilingKg('upper_press', null), null);
  assert.equal(bodyweightSanityCeilingKg('upper_press', 0), null);

  // Parity with the pipeline at the exact boundary: 164 passes, 164.5 is
  // rejected by C7 and by nothing else.
  const catalogue = [{ id: 'x', canonical_pattern: 'upper_press' }];
  const at = clampWorkingWeight({ catalogue, exerciseId: 'x', proposedWeightKg: 164, history: [{ kind: 'working', valid: true, weight_kg: 160 }], bodyweightKg: 82 });
  assert.equal(at.rejected_by, null);
  const over = clampWorkingWeight({ catalogue, exerciseId: 'x', proposedWeightKg: 400, history: [{ kind: 'working', valid: true, weight_kg: 380 }], bodyweightKg: 82 });
  assert.equal(over.rejected_by, CLAMP_IDS.BODYWEIGHT_SANITY);
});

test('a fat-fingered 800 kg chest press is flagged; 80 kg is not', () => {
  seed([session('chest_press_machine', 80), session('chest_press_machine', 80)]);
  // The exact case measured on 2026-09-23: 80 kg x 10 x 3 twice, then 800.
  assert.equal(loadSanityCeilingKg('chest_press_machine', 800), 164);
  assert.equal(loadSanityCeilingKg('chest_press_machine', 80), null);
  assert.equal(loadSanityCeilingKg('chest_press_machine', 82.5), null);
});

test('a heavy but real machine load he has already logged never asks again', () => {
  // 70 kg on a curl is past C7's 61.5 kg isolation ceiling. The first time it is
  // worth one question; once it is in his history it is a fact about his gym,
  // and a guard that keeps asking is a guard he learns to tap through.
  seed([]);
  assert.equal(loadSanityCeilingKg('biceps_curl', 70), 61.5);
  seed([session('biceps_curl', 70)]);
  assert.equal(loadSanityCeilingKg('biceps_curl', 70), null);
  // A tenfold slip on the same movement is still caught, history or not.
  assert.equal(loadSanityCeilingKg('biceps_curl', 700), 61.5);
});

test('the guard never fires on a load it has no right to judge', () => {
  seed([]);
  // 300 kg on a leg press is under 4x bodyweight — a real machine number.
  assert.equal(loadSanityCeilingKg('leg_press', 300), null);
  // 0 kg is «وزن الجهاز فقط», a real logged load, not an error.
  assert.equal(loadSanityCeilingKg('leg_press', 0), null);
  assert.equal(loadSanityCeilingKg('leg_press', ''), null);
  // An exercise the catalogue does not know gets no verdict.
  assert.equal(loadSanityCeilingKg('not_an_exercise', 9000), null);
  // No bodyweight on the profile falls back to ATHLETE (82 kg in data.js);
  // with neither, there is no ceiling to break.
  state.profile = { display_name: 'Raed' };
  assert.equal(loadSanityCeilingKg('chest_press_machine', 800), 164);
});
