// Round 6 §D — progressive overload knows the machine.
//
// Raed 2026-09-25: «the whole gym is Matrix, all in kg, sometimes .5». Until
// this round `DEFAULT_EQUIPMENT_STEP_KG = 2.5` was the step for EVERY movement,
// data.js carried no step, and the suggestion said «ارفع 2.5 كغ» over a Matrix
// Matrix pin stack labelled 5 · 9 · 14 · 18 · 23 … and a sled that moves in fives.
// These run the REAL engine under node (same shim as load-sanity.test.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { loadCatalogue } from '../domain/catalogue.js';
import {
  MATRIX_LADDER, matrixRung, nextStepDown, nextStepUp, roundDownToStep, stackLabelKg, stepFor, stepSpecFor,
} from '../domain/clamps.js';

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

const { equipmentStep, equipmentStepKg, nextEarnedLoad, rampLoadsFor, suggestNextWeight } = await import('../core/engine.js');
const { state } = await import('../core/store.js');

const PLANNED = { reps: '8-10', sets: 3 };
// Two COMPLETE exposures at the top of the range: the two-session bump is earned.
function earned(exerciseId, kg, reps = 10) {
  const session = (date) => ({
    date,
    exercises: { [exerciseId]: { planned: { sets: 3 }, sets: [0, 1, 2].map(() => ({ weight: kg, reps, completed: true })) } },
  });
  return [session('2026-09-01'), session('2026-09-04')];
}
function seed(history = [], prefs = {}) {
  state.profile = { display_name: 'Raed', experience: 'returning', bodyweight_kg: 82 };
  state.history = history;
  state.prs = {};
  state.exercise_prefs = prefs;
}

test('the Matrix ladder is his stack: n × 4.5359 rounded, 4.5 accepted as plate one', () => {
  // His logged working sets: 4.5, 9, 14, 18, 23, 32, 63 (sync DB, 2026-09-25).
  assert.deepEqual(Array.from({ length: 14 }, (_, i) => stackLabelKg(i + 1)),
    [5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59, 64]);
  for (const logged of [4.5, 9, 14, 18, 23, 32, 63]) assert.ok(matrixRung(logged), `${logged} is a rung`);
  for (const other of [16, 25, 15]) assert.equal(matrixRung(other), null, `${other} is a different station, left as typed`);
  // On a rung → the next label; never the linear 13.5 / 22.5 / 31.5.
  assert.equal(nextStepUp(4.5, MATRIX_LADDER), 9);
  assert.equal(nextStepUp(9, MATRIX_LADDER), 14);
  assert.equal(nextStepUp(18, MATRIX_LADDER), 23);
  assert.equal(nextStepUp(27, MATRIX_LADDER), 32);
  assert.equal(nextStepUp(63, MATRIX_LADDER), 68);
  assert.equal(nextStepUp(13.5, MATRIX_LADDER), 18, 'a 13.5 the old linear step wrote IS rung 14');
  // Off the ladder → the first label above what he typed.
  assert.equal(nextStepUp(16, MATRIX_LADDER), 18);
  assert.equal(nextStepUp(25, MATRIX_LADDER), 27);
  assert.equal(nextStepUp(20, MATRIX_LADDER), 23);
  assert.equal(nextStepUp(40, MATRIX_LADDER), 45, '40 reads as rung 41 — never a «+1 kg» increase');
  // Down, and C3's rounding for ramps.
  assert.equal(nextStepDown(23, MATRIX_LADDER), 18);
  assert.equal(nextStepDown(16, MATRIX_LADDER), 14);
  assert.equal(nextStepDown(4.5, MATRIX_LADDER), 0);
  assert.equal(roundDownToStep(11.5, MATRIX_LADDER), 9);
  assert.equal(roundDownToStep(22.5, MATRIX_LADDER), 23, 'on a rung, the rung\'s label');
});

test('stepFor / stepSpecFor resolve device pref → movement pref → learned → kind → data.js → 2.5', () => {
  const exercise = { equipment_step_kg: 2.5 };
  assert.equal(stepFor({}), 2.5, 'nothing known: research/06 §5.2 fallback');
  assert.equal(stepFor({ exercise: { equipment_step_kg: 5 } }), 5, 'data.js beats the fallback');
  assert.equal(stepSpecFor({ exercise: { equipment_ladder: 'matrix', equipment_step_kg: 5 } }), MATRIX_LADDER, 'a data.js ladder beats its nominal number');
  assert.equal(stepFor({ exercise: { equipment_ladder: 'matrix' } }), 5, 'the clamps get the widest rung gap');
  assert.equal(stepFor({ exercise, kind_step_kg: 10 }), 10, 'the kind he picked beats data.js');
  assert.equal(stepFor({ exercise, kind_step_kg: 2.5, learned_step_kg: 10 }), 10, 'a (coarser) learned step beats the kind');
  const prefs = { device: 'Sled B', step_kg: 1.25, steps: { 'Sled A': 10, 'Sled B': 5 } };
  assert.equal(stepFor({ exercise, learned_step_kg: 10, prefs: { step_kg: 1.25 } }), 1.25, 'his stated step beats learning');
  assert.equal(stepFor({ exercise, learned_step_kg: 10, prefs }), 5, 'the machine he stands at beats the movement');
  assert.equal(stepFor({ exercise, prefs: { ...prefs, device: 'Unknown' } }), 1.25, 'a device with no step falls to the movement');
  assert.equal(stepSpecFor({ exercise, prefs: { device: 'M', steps: { M: 'matrix' } } }), MATRIX_LADDER, 'the ⚙️ ladder chip');
  assert.equal(stepSpecFor({ exercise: { equipment_ladder: 'matrix' }, prefs: { device: 'M', steps: { M: 5 } } }), 5, 'his number beats the ladder');
  assert.equal(stepFor({ exercise, prefs, equipment_step_kg: 2.5 }), 2.5, 'an already-resolved step is taken as given (clamp pipeline)');
  assert.equal(stepFor({ exercise: { equipment_step_kg: 0 }, prefs: { step_kg: 'x' } }), 2.5, 'garbage never becomes a step');
});

test('every data.js movement carries a sourced step, and the catalogue keeps it', () => {
  const unclassed = RW.EXERCISES.filter((exercise) => !(exercise.equipment_step_kg > 0) || !exercise.equipment_class);
  assert.deepEqual(unclassed.map((exercise) => exercise.id), [], 'a movement with no class silently falls back to 2.5');
  const byId = (id) => RW.EXERCISES.find((exercise) => exercise.id === id);
  assert.equal(byId('chest_press_machine').equipment_ladder, 'matrix', 'Matrix stack: the kg-labelled ladder');
  assert.equal(byId('lat_pulldown').equipment_ladder, 'matrix');
  assert.equal(byId('leg_press').equipment_step_kg, 5, 'plate-loaded: 2 × 2.5 kg');
  assert.equal(byId('leg_press').equipment_ladder, undefined);
  assert.equal(byId('tbar_row').equipment_step_kg, 5);
  assert.equal(byId('lateral_raise_db').equipment_step_kg, 2.5, 'dumbbell rack');
  assert.equal(byId('tricep_pushdown').equipment_step_kg, 2.5, 'cable');
  const catalogue = loadCatalogue(RW.EXERCISES);
  assert.equal(catalogue.get('leg_press').equipment_step_kg, 5, 'migrateLegacyExercise used to overwrite it with 2.5');
  assert.equal(catalogue.get('leg_press').equipment_step.source, 'catalogue');
});

test('an earned step lands on real equipment: a 5 kg plate-loaded row vs the Matrix ladder vs a 2.5 kg rack', () => {
  seed(earned('tbar_row', 40));
  const row = suggestNextWeight('tbar_row', PLANNED);
  assert.equal(row.weight, 45, 'T-bar: two 2.5 kg plates');
  assert.match(row.note, /45/, 'the note names the load it lands on');

  seed(earned('chest_press_machine', 27));
  const stack = suggestNextWeight('chest_press_machine', PLANNED);
  assert.equal(stack.weight, 32, 'Matrix stack: 27 → 32, the next label — never 31.5 or 29.5');
  assert.match(stack.note, /32/);
  assert.match(stack.note, /5/, 'and the size of the step');

  seed(earned('chest_press_machine', 16));
  assert.equal(suggestNextWeight('chest_press_machine', PLANNED).weight, 18, 'a 16 he typed is left alone and steps to the next label');

  // A dumbbell load off the rack's grid (26) steps to the next dumbbell that
  // exists (27.5), not to 28.5.
  seed(earned('lateral_raise_db', 26, 12));
  assert.equal(suggestNextWeight('lateral_raise_db', { reps: '10-12', sets: 3 }).weight, 27.5);
});

test('his ⚙️ step for THIS machine moves the suggestion by exactly that step', () => {
  seed(earned('chest_press_machine', 20), {
    chest_press_machine: { equipment: '', device: 'Matrix Ultra', known_devices: ['Matrix Ultra'], steps: { 'Matrix Ultra': 5 } },
  });
  assert.equal(equipmentStep('chest_press_machine'), 5);
  assert.equal(suggestNextWeight('chest_press_machine', PLANNED).weight, 25);
  // Another machine for the same movement is not bound by it: back on the ladder.
  state.exercise_prefs.chest_press_machine.device = 'Other';
  assert.equal(equipmentStep('chest_press_machine'), MATRIX_LADDER);
  assert.equal(suggestNextWeight('chest_press_machine', PLANNED).weight, 23);
  // No machine named: the movement-level step.
  state.exercise_prefs.chest_press_machine = { equipment: '', device: '', known_devices: [], step_kg: 1.25 };
  assert.equal(suggestNextWeight('chest_press_machine', PLANNED).weight, 21.25);
  // The «سلّم ماتريكس» chip on a plate-loaded movement puts it on the ladder.
  seed(earned('leg_press', 18), { leg_press: { equipment: '', device: '', known_devices: [], step_kg: 'matrix' } });
  assert.equal(suggestNextWeight('leg_press', PLANNED).weight, 23);
});

test('one «.5» he typed cannot teach a 0.5 kg machine; a coarser rack still can; the ladder is never learned over', () => {
  // 12 then 12.5 on dumbbells: smallest-gap learning read that as a 0.5 kg
  // step and proposed +0.5 forever.
  seed([
    { date: '2026-08-01', exercises: { lateral_raise_db: { sets: [{ weight: 12, reps: 12, completed: true }] } } },
    { date: '2026-08-04', exercises: { lateral_raise_db: { sets: [{ weight: 12.5, reps: 12, completed: true }] } } },
  ]);
  assert.equal(equipmentStepKg('lateral_raise_db'), 2.5);
  seed([20, 25, 30].map((kg, index) => ({ date: `2026-08-0${index + 1}`, exercises: { lateral_raise_db: { sets: [{ weight: kg, reps: 12, completed: true }] } } })));
  assert.equal(equipmentStepKg('lateral_raise_db'), 5, 'a rack he only ever used in fives');
  // His lat pulldown log 18 / 32 / 41: a gap-learner would read 9 kg steps.
  seed([18, 32, 41].map((kg, index) => ({ date: `2026-08-0${index + 1}`, exercises: { lat_pulldown: { sets: [{ weight: kg, reps: 10, completed: true }] } } })));
  assert.equal(equipmentStep('lat_pulldown'), MATRIX_LADDER);
});

test('the goal line has a number to state, and ramps round to the same step', () => {
  seed([], { leg_press: { equipment: '', device: '', known_devices: [] } });
  assert.deepEqual(nextEarnedLoad('leg_press', 60), { weight: 65, delta: 5, step: 5 });
  assert.deepEqual(nextEarnedLoad('chest_press_machine', 23), { weight: 27, delta: 4, step: MATRIX_LADDER });
  assert.deepEqual(nextEarnedLoad('chest_press_machine', 22.5), { weight: 27, delta: 4.5, step: MATRIX_LADDER });
  assert.equal(nextEarnedLoad('chest_press_machine', 0), null, 'a machine logged at 0 has nothing to step from');
  assert.equal(nextEarnedLoad('chest_press_machine', null), null, 'calibration');
  // 50% / 70% of 60 kg on a 5 kg sled: 30 and 40 (42 floored), not 30 and 42.5.
  assert.deepEqual(rampLoadsFor(60, 2, equipmentStep('leg_press')).map((row) => row.weight), [30, 40]);
  // 50% / 70% of 32 on the stack: 16 → 14, 22.4 → 23 (rung 5), both labels.
  assert.deepEqual(rampLoadsFor(32, 2, equipmentStep('chest_press_machine')).map((row) => row.weight), [14, 23]);
  assert.equal(nextStepUp(26, 2.5), 27.5);
  assert.equal(nextStepUp(8, 2.5), 10, 'an 8 kg dumbbell steps to the 10 that exists, not 10.5');
  assert.equal(nextStepUp(0, 5), 5);
  // Off the grid by most of a step: the grid is not his machine's, so his own
  // history wins — never a +0.5 «increase» (40 → 40.5 on a 4.5 grid).
  assert.equal(nextStepUp(40, 4.5), 44.5);
  assert.equal(nextStepDown(40.5, 4.5), 36, 'R6 walk-back: one step down');
  assert.equal(nextStepDown(40, 4.5), 35.5, 'not the 31.5 a blind floor gives — 8.5 kg for «one step»');
  assert.equal(nextStepDown(2.5, 2.5), 0, 'never below zero');
});
