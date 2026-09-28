// Round 7 §D + §E — the engine, run for real under node (same shim as
// round6-steps.test.mjs).
//
// §D Raed 2026-09-28: «warm-up easy/difficult downgrades the weight on only a
//    single set, not the rest». A heavy ramp eased working set 1 only.
// §E Raed 2026-09-28: «for Matrix, based on the exercises I'm doing and the
//    history, you should know which is which». Round 6 let his log only
//    COARSEN a numeric step and never override the ladder; now the log is
//    evidence, and the precedence is hand > history > data.js > default.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { format } from '../locale.js';
import * as clamps from '../domain/clamps.js';

// Namespace imports, so each test fails on its own assertion (not the whole
// file on a missing export) when run against the pre-Round-7 engine.
const { MATRIX_LADDER } = clamps;
const inferStepFromWeights = (weights) => clamps.inferStepFromWeights(weights);
const stepSourceFor = (context) => clamps.stepSourceFor(context);

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const noopClassList = { add() {}, remove() {}, toggle() {}, contains: () => false };
// A node that remembers its text, so the toast he sees can be read back.
function node(text = '') {
  return {
    text, children: [], style: { setProperty() {} }, classList: noopClassList,
    setAttribute() {}, addEventListener() {},
    appendChild(child) { this.children.push(child); return child; },
    set innerHTML(value) { this.text = String(value); this.children = []; },
    get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); },
    set textContent(value) { this.text = String(value); this.children = []; },
  };
}
const toastEl = node();
globalThis.document = {
  documentElement: { style: { setProperty() {} }, classList: noopClassList },
  body: { classList: noopClassList },
  addEventListener() {},
  querySelector: (selector) => (selector === '#toast' ? toastEl : null),
  querySelectorAll: () => [],
  getElementById: (id) => (id === 'toast' ? toastEl : null),
  createElement: () => node(),
  createTextNode: (text) => node(text),
  createDocumentFragment: () => node(),
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

const engine = await import('../core/engine.js');
const { equipmentStep, runRampRules } = engine;
const equipmentStepSource = (id) => engine.equipmentStepSource(id);
const { state } = await import('../core/store.js');

function seed(history = [], prefs = {}) {
  state.profile = { display_name: 'Raed', experience: 'returning', bodyweight_kg: 82 };
  state.history = history;
  state.prs = {};
  state.exercise_prefs = prefs;
}
// One logged session per entry: each entry is the working-set loads of that
// session (three sets at one load is how he trains), optionally on a device.
function sessions(exerciseId, loadsPerSession, device = '') {
  return loadsPerSession.map((loads, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, '0')}`,
    exercises: { [exerciseId]: {
      ...(device ? { device } : {}),
      sets: (Array.isArray(loads) ? loads : [loads, loads, loads])
        .map((weight) => ({ is_warmup: false, weight, reps: 10, completed: true })),
    } },
  }));
}

// ---- §D ---------------------------------------------------------------------
function rampedExercise(effort, loads = [23, 23, 23]) {
  return {
    sets: [
      { is_warmup: true, weight: 9, reps: 10, completed: true, effort: 'medium' },
      { is_warmup: true, weight: 14, reps: 6, completed: true, effort },
      ...loads.map((weight) => ({ is_warmup: false, weight, reps: null, completed: false })),
    ],
  };
}
const working = (exState) => exState.sets.filter((set) => !set.is_warmup).map((set) => set.weight);

test('§D a «صعب جدًا» last ramp eases EVERY open working set, not only the first', () => {
  seed();
  // His chest press on the Matrix stack: 23 × 3. One step down the ladder is 18.
  const exState = rampedExercise('very_hard');
  runRampRules(exState, 'chest_press_machine');
  assert.deepEqual(working(exState), [18, 18, 18], 'all three working sets drop one step');
  assert.equal(exState.warmup_feel_applied, 'very_hard');
  assert.equal(toastEl.textContent, 'الإحماء طلع ثقيل — نزّلت مجموعات العمل إلى 18 كغ',
    'the heavy toast is plural, like the light one');
  // Applied once: a re-tick of the same ramp never walks him down again.
  runRampRules(exState, 'chest_press_machine');
  assert.deepEqual(working(exState), [18, 18, 18]);
});

test('§D both directions, done sets untouched, calibration still wins', () => {
  seed();
  const light = rampedExercise('easy');
  runRampRules(light, 'chest_press_machine');
  assert.deepEqual(working(light), [27, 27, 27], 'easy: every working set up one rung');

  // A working set he already finished is his; only the OPEN ones move.
  const midway = rampedExercise('very_hard');
  const firstWorking = midway.sets.find((set) => !set.is_warmup);
  firstWorking.completed = true; firstWorking.reps = 10;
  runRampRules(midway, 'chest_press_machine');
  assert.deepEqual(working(midway), [23, 18, 18]);

  const calibrated = rampedExercise('very_hard');
  calibrated.calibrated_from = { weight: 14, pct: 0.7, ramps: 2 };
  runRampRules(calibrated, 'chest_press_machine');
  assert.deepEqual(working(calibrated), [23, 23, 23], 'a calibrated load already came from this ramp');
});

test('§D the English copy is plural too', () => {
  assert.equal(format('warmup_felt_heavy', { kg: 25 }, 'en'), 'Warm-up felt heavy — working sets eased to 25 kg.');
});

// ---- §E ---------------------------------------------------------------------
test('§E the rule itself: ≥3 distinct loads; ≥80% on a Matrix label → ladder; else the coarsest grid', () => {
  assert.equal(inferStepFromWeights([14, 23, 32]), MATRIX_LADDER);
  assert.equal(inferStepFromWeights([12.5, 15, 17.5]), 2.5);
  assert.equal(inferStepFromWeights([20, 25, 30]), 5);
  assert.equal(inferStepFromWeights([11.25, 12.5, 13.75]), 1.25);
  assert.equal(inferStepFromWeights([20, 40, 60]), null,
    'only 2 of 3 near a label (41, 59), and «all multiples of 10» cannot tell a 5 kg sled from round numbers');
  assert.equal(inferStepFromWeights([14, 23]), null, 'two distinct loads are not evidence');
  assert.equal(inferStepFromWeights([14, 14, 14, 23, 23, 23]), null);
  assert.equal(inferStepFromWeights([10.3, 11.7, 13.1]), null, 'no grid at all → the data.js class');
  // His face pull with one typo: 9 · 14 · 18 on every set, one set typed 16.
  assert.equal(inferStepFromWeights([9, 9, 9, 14, 14, 14, 18, 16, 18]), MATRIX_LADDER, '8 of 9 sets on a label');
});

test('§E his face pull (a cable in data.js) logged 14 / 23 / 32 is a Matrix stack', () => {
  seed(sessions('face_pull', [14, 23, 32]));
  assert.equal(equipmentStep('face_pull'), MATRIX_LADDER, 'the old gap-learner read 9 kg steps here');
  assert.equal(equipmentStepSource('face_pull').source, 'history');
});

test('§E 9 / 14 / 18 with one typo 16 is still the ladder (80% of his sets)', () => {
  seed(sessions('face_pull', [9, 14, [18, 16, 18]]));
  assert.equal(equipmentStep('face_pull'), MATRIX_LADDER);
});

test('§E 12.5 / 15 / 17.5 on a machine data.js calls a stack is a 2.5 kg machine', () => {
  seed(sessions('chest_press_machine', [12.5, 15, 17.5]));
  assert.equal(equipmentStep('chest_press_machine'), 2.5, 'history now overrides the data.js ladder');
  assert.equal(equipmentStepSource('chest_press_machine').source, 'history');
});

test('§E 20 / 40 / 60 is ambiguous: the data.js class stands', () => {
  seed(sessions('chest_press_machine', [20, 40, 60]));
  assert.deepEqual(equipmentStepSource('chest_press_machine'), { step: MATRIX_LADDER, source: 'equipment' });
  seed(sessions('lateral_raise_db', [20, 30, 40]));
  assert.equal(equipmentStep('lateral_raise_db'), 2.5, 'tens are round numbers, not a 10 kg rack (the gap-learner said 10)');
});

test('§E precedence: his hand > history > data.js > default', () => {
  seed(sessions('face_pull', [14, 23, 32]), { face_pull: { equipment: '', device: '', known_devices: [], step_kg: 2.5 } });
  assert.deepEqual(equipmentStepSource('face_pull'), { step: 2.5, source: 'hand' }, 'the movement step he set');
  seed(sessions('face_pull', [14, 23, 32], 'Cable A'), { face_pull: { equipment: '', device: 'Cable A', known_devices: ['Cable A'], steps: { 'Cable A': 1.25 } } });
  assert.deepEqual(equipmentStepSource('face_pull'), { step: 1.25, source: 'hand' }, 'the machine step he set');
  seed([], {});
  assert.deepEqual(equipmentStepSource('face_pull'), { step: 2.5, source: 'equipment' }, 'no log: data.js');
  assert.deepEqual(stepSourceFor({}), { step: 2.5, source: 'default' }, 'nothing known: research/06 §5.2');
});

test('§E per machine: another device\'s log says nothing about this one', () => {
  const history = sessions('face_pull', [14, 23, 32], 'Matrix Cable');
  seed(history, { face_pull: { equipment: '', device: 'Other Cable', known_devices: ['Matrix Cable', 'Other Cable'] } });
  assert.equal(equipmentStep('face_pull'), 2.5, 'nothing logged on Other Cable → data.js');
  state.exercise_prefs.face_pull.device = 'Matrix Cable';
  assert.equal(equipmentStep('face_pull'), MATRIX_LADDER);
});

test('§E only his last 12 sessions count, and only completed working sets', () => {
  // 12 recent sessions on the stack, after 12 older ones on a 2.5 rack.
  const old = sessions('face_pull', Array.from({ length: 12 }, (_, i) => 10 + (i % 3) * 2.5));
  const recent = sessions('face_pull', Array.from({ length: 12 }, (_, i) => [14, 23, 32][i % 3]));
  seed([...old, ...recent].map((session, index) => ({ ...session, date: `2026-0${7 + Math.floor(index / 28)}-${String((index % 28) + 1).padStart(2, '0')}` })));
  assert.equal(equipmentStep('face_pull'), MATRIX_LADDER, 'the older rack sessions are out of the window');
  // Warm-ups and unticked sets are not what he lifted.
  seed([{
    date: '2026-08-01',
    exercises: { face_pull: { sets: [
      { is_warmup: true, weight: 12.5, reps: 10, completed: true },
      { is_warmup: false, weight: 15, reps: 10, completed: false },
      { is_warmup: false, weight: 17.5, reps: 10, completed: true, skipped: true },
      { is_warmup: false, weight: 14, reps: 10, completed: true },
    ] } },
  }]);
  assert.deepEqual(equipmentStepSource('face_pull'), { step: 2.5, source: 'equipment' });
});
