// 2026-11-11 — Raed: «remove it from the progression completely: easy, hard,
// medium… what is behind in the background should be the previous entry… he can
// go see the previous history of every session of this exercise».
//
// Three behaviours, run against the real engine under node (same shim as
// round7-engine.test.mjs):
//   (a) progression ignores effort — identical reps, different stored effort,
//       identical next target, in BOTH controllers (domain + the live engine);
//   (b) an old log that carries effort values still loads and is read without
//       a throw (the domain controller used to throw on a non-final rating);
//   (c) set N is prefilled with the previous session's set N, falling back to
//       its last set, then to the starter rule;
//   (d) the per-exercise history lists every session, newest first, every set.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { loadCatalogue } from '../domain/catalogue.js';
import { initialiseProgressionState, progressExercise } from '../domain/progression.js';
import { mergeLocalStates } from '../domain/state-merge.js';

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const noopClassList = { add() {}, remove() {}, toggle() {}, contains: () => false };
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
const dataSource = fs.readFileSync(new URL('../data.js', import.meta.url), 'utf8');
new Function(dataSource)();

const engine = await import('../core/engine.js');
const { state } = await import('../core/store.js');
const localeSource = fs.readFileSync(new URL('../locale.js', import.meta.url), 'utf8');

function seed(history = []) {
  state.profile = { display_name: 'Raed', experience: 'returning', bodyweight_kg: 82 };
  state.history = history;
  state.prs = {};
  state.exercise_prefs = {};
}
const W = (weight, reps, effort) => ({ is_warmup: false, weight, reps, completed: true, ...(effort !== undefined ? { effort } : {}) });
const session = (date, sets, id = 'chest_press_machine') => ({ date, exercises: { [id]: { sets } } });
const PLANNED = { exercise_id: 'chest_press_machine', sets: 3, reps: '8-10' };

// ---- (a) domain controller ---------------------------------------------------
const rawData = (() => { const ctx = { window: {} }; vm.runInNewContext(dataSource, ctx); return ctx.window.RW; })();
const catalogue = loadCatalogue(rawData.EXERCISES);
const legPress = catalogue.get('leg_press');
const top = (effort) => [
  { kind: 'working', valid: true, reps: 10, form_ok: true },
  { kind: 'working', valid: true, reps: 10, form_ok: true },
  { kind: 'working', valid: true, reps: 10, form_ok: true, effort },
];
const run = (st, sets) => progressExercise({
  catalogue, exercise: legPress, state: st, completedSets: sets,
  history: [{ kind: 'working', valid: true, weight_kg: 50 }], bodyweightKg: 82,
});

test('(a) domain: the same reps with any stored effort give the identical next target', () => {
  const initial = initialiseProgressionState({ loadKg: 50, exercise: legPress, setsTarget: 3 });
  const baseline = run(initial, top(undefined));
  for (const effort of ['easy', 'medium', 'very_hard', null]) {
    assert.deepEqual(run(initial, top(effort)), baseline, `first top exposure, effort=${effort}`);
  }
  assert.equal(baseline.action, 'hold', 'one top exposure holds — «easy» no longer brings it forward');
  const earned = run(baseline.next_state, top(undefined));
  assert.equal(earned.action, 'increase');
  assert.deepEqual(run(baseline.next_state, top('very_hard')), earned, '«very hard» no longer blocks an earned increase');
});

test('(b) domain: an old log with effort on any set, or a retired value, does not throw', () => {
  const initial = initialiseProgressionState({ loadKg: 50, exercise: legPress, setsTarget: 3 });
  const oldLog = [
    { kind: 'working', valid: true, reps: 10, form_ok: true, effort: 'easy' },
    { kind: 'working', valid: true, reps: 10, form_ok: true, effort: 'right' },
    { kind: 'working', valid: true, reps: 10, form_ok: true },
  ];
  assert.doesNotThrow(() => run(initial, oldLog));
  assert.deepEqual(run(initial, oldLog), run(initial, top(undefined)));
});

// ---- (a) the live engine -----------------------------------------------------
test('(a) engine: «very hard» on the final set no longer holds an earned increase', () => {
  seed([session('2026-10-01', [W(20, 10), W(20, 10), W(20, 10)]), session('2026-10-04', [W(20, 10), W(20, 10), W(20, 10)])]);
  const plain = engine.suggestNextWeight('chest_press_machine', PLANNED);
  seed([session('2026-10-01', [W(20, 10), W(20, 10), W(20, 10, 'medium')]), session('2026-10-04', [W(20, 10), W(20, 10), W(20, 10, 'very_hard')])]);
  const veryHard = engine.suggestNextWeight('chest_press_machine', PLANNED);
  assert.deepEqual(veryHard, plain);
  assert.ok(Number(plain.weight) > 20, 'two complete top exposures earn the step');
});

test('(a) engine: «easy» after one top exposure no longer brings the increase forward', () => {
  seed([session('2026-10-01', [W(20, 9), W(20, 9), W(20, 9)]), session('2026-10-04', [W(20, 10), W(20, 10), W(20, 10)])]);
  const plain = engine.suggestNextWeight('chest_press_machine', PLANNED);
  seed([session('2026-10-01', [W(20, 9), W(20, 9), W(20, 9, 'medium')]), session('2026-10-04', [W(20, 10), W(20, 10), W(20, 10, 'easy')])]);
  const easy = engine.suggestNextWeight('chest_press_machine', PLANNED);
  assert.deepEqual(easy, plain);
  assert.equal(Number(easy.weight), 20, 'one top exposure holds the load');
});

test('(a) engine: a ramp marked easy or very hard no longer moves the working sets', () => {
  seed([]);
  assert.equal(typeof engine.runRampRules, 'undefined', 'the ramp-feel / calibration-by-feel entry point is gone');
});

test('(b) a stored session with effort values syncs through the merge untouched', () => {
  const old = { date: '2026-09-05', session_id: 'upper_a', started_at: '2026-09-05T17:00:00Z',
    exercises: { chest_press_machine: { sets: [W(18, 10, 'easy'), W(18, 9, 'very_hard')] } } };
  const merged = mergeLocalStates({ history: [] }, { history: [old] });
  assert.equal(merged.history.length, 1);
  assert.equal(merged.history[0].exercises.chest_press_machine.sets[1].effort, 'very_hard',
    'stored data is neither migrated nor deleted — the field is simply ignored');
  seed(merged.history);
  assert.doesNotThrow(() => engine.suggestNextWeight('chest_press_machine', PLANNED));
});

// ---- (c) the prefill ---------------------------------------------------------
test('(c) set N is prefilled with the previous session\'s set N', () => {
  seed([
    session('2026-10-01', [W(15, 12), W(15, 12), W(15, 12)]),
    session('2026-10-04', [{ is_warmup: true, weight: 9, reps: 10, completed: true }, W(25, 10), W(25, 9), W(20, 8)]),
  ]);
  assert.deepEqual(engine.workingSetPrefill('chest_press_machine', 0, PLANNED), { weight: 25, reps: 10, source: 'previous_set' });
  assert.deepEqual(engine.workingSetPrefill('chest_press_machine', 1, PLANNED), { weight: 25, reps: 9, source: 'previous_set' });
  assert.deepEqual(engine.workingSetPrefill('chest_press_machine', 2, PLANNED), { weight: 20, reps: 8, source: 'previous_set' });
});

test('(c) no set N last time → the last set of the previous session', () => {
  seed([session('2026-10-04', [W(25, 10), W(22.5, 9)])]);
  assert.deepEqual(engine.workingSetPrefill('chest_press_machine', 2, PLANNED), { weight: 22.5, reps: 9, source: 'previous_last' });
  // A set he skipped last time is not «what he logged»: it falls back too.
  seed([session('2026-10-04', [W(25, 10), { is_warmup: false, weight: '', reps: 10, completed: false, skipped: true }, W(20, 8)])]);
  assert.deepEqual(engine.workingSetPrefill('chest_press_machine', 1, PLANNED), { weight: 20, reps: 8, source: 'previous_last' });
});

test('(c) no previous session at all → the starter rule', () => {
  seed([]);
  const starter = engine.suggestNextWeight('chest_press_machine', PLANNED);
  const prefill = engine.workingSetPrefill('chest_press_machine', 0, PLANNED);
  assert.equal(prefill.source, 'starter');
  assert.equal(prefill.weight, starter.weight ?? '');
  assert.equal(prefill.reps, 8, 'the bottom of the range, as before');
});

// ---- (d) the history list ----------------------------------------------------
test('(d) every session of the exercise, newest first, each with every set', () => {
  seed([
    session('2026-09-01', [W(15, 12), W(15, 11)]),
    session('2026-09-03', [W(40, 8)], 'leg_press'),
    session('2026-09-05', [{ is_warmup: true, weight: 9, reps: 10, completed: true }, W(18, 10, 'easy'), W(18, 9)]),
    // Swapped in: stored under the programme id, performed as the chest press.
    { date: '2026-09-07', exercises: { incline_chest_press: { swapped_to: 'chest_press_machine', sets: [W(20, 10)] } } },
    session('2026-09-09', [{ is_warmup: false, weight: 20, reps: 10, completed: false, skipped: true }]),
  ]);
  const list = engine.exerciseHistorySessions('chest_press_machine');
  assert.deepEqual(list.map((row) => row.date), ['2026-09-07', '2026-09-05', '2026-09-01'],
    'newest first; a session with no logged set and another exercise\'s session are not listed');
  assert.deepEqual(list[1].sets, [{ weight: 18, reps: 10 }, { weight: 18, reps: 9 }], 'working sets only, no effort');
  assert.equal(list.length, 3, 'no cap: every session');
});

// ---- the copy ----------------------------------------------------------------
test('the app no longer carries the effort-rating copy', () => {
  for (const key of ['final_set_prompt', 'final_set_effort', 'help_history_effort', 'why_hold_very_hard',
    'why_easy_bump', 'warmup_felt_light', 'warmup_felt_heavy', 'calibrated_from_ramp', 'why_probe_floor',
    'effort_label', 'effort_target_easy', 'effort_short_easy']) {
    assert.ok(!new RegExp(`^\\s*${key}:`, 'm').test(localeSource), `${key} is still in locale.js`);
  }
  assert.ok(/^\s*previous_log:/m.test(localeSource), 'the history button has its label');
});
