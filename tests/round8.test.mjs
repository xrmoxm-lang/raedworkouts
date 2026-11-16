// Round 8 (2026-11-16) — the engine, run for real under node (same shim as
// round7-engine.test.mjs).
//
// 1. Raed: «ودي نعيد الخمسة weeks، وكيف السجل». `state.programme_restart =
//    { at, cycle }` puts the programme clock back on week 1 of the next cycle
//    and keeps every session. The rotation stays history-driven.
// 2. Raed: «أبغى تدرج واحد في كل التمارين، إلا التمرين الأول». Only order 1 has
//    two ramp sets; everything else at most one, and the single ramp is 60%.
// 3. Raed: «we shouldn't change the exercises… Stick to the similar exercises».
//    A triggered deload keeps the CURRENT block's exercises.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import * as merge from '../domain/state-merge.js';

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
new Function(fs.readFileSync(new URL('../data.js', import.meta.url), 'utf8'))();

const engine = await import('../core/engine.js');
const { state } = await import('../core/store.js');
const ORDER = ['upper_a', 'lower_a', 'upper_b', 'lower_b'];

// His real shape: 21 sessions, the last one (today) a Lower A.
function log(n, { startDay = Date.parse('2026-08-29T08:00:00Z'), stepDays = 3, ids = null } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const started = new Date(startDay + i * stepDays * 86400000);
    return {
      uid: `s${i}`,
      date: started.toISOString().slice(0, 10),
      started_at: started.toISOString(),
      ended_at: new Date(started.getTime() + 3600000).toISOString(),
      session_id: ids ? ids[i % ids.length] : ORDER[i % 4],
      exercises: {},
    };
  });
}
function seed(history, extra = {}) {
  state.profile = { display_name: 'Raed', experience: 'returning', bodyweight_kg: 82 };
  state.history = history;
  state.prs = {};
  state.exercise_prefs = {};
  state.active_session = null;
  state.forced_next_session = null;
  state.triggered_deload = null;
  state.wellbeing_checks = [];
  state.programme_restart = null;
  state.programme_overrides = null;
  Object.assign(state, extra);
}

// ---- 1. programme_restart ---------------------------------------------------

test('a restart puts the clock on week 1 of the next cycle and keeps every session', () => {
  const history = log(21);
  seed(history);
  assert.equal(engine.derivedWeek(), 6, '21 sessions is week 6 before the restart');
  assert.equal(engine.derivedCycle(), 1);
  const restartAt = new Date(Date.parse(history.at(-1).ended_at) + 60000).toISOString();
  state.programme_restart = { at: restartAt, cycle: 2 };
  assert.equal(engine.derivedWeek(), 1, 'the clock is back on week 1');
  assert.equal(engine.derivedCycle(), 2, 'and on cycle 2, so week ids cannot collide with the old 1:x rows');
  assert.equal(state.history.length, 21, 'history is never touched');
  assert.equal(engine.getActiveProgramme().active_block, 'A', 'week 1 is Block A');
  // Five more sessions after the restart: four make a week.
  state.history = [...history, ...log(5, { startDay: Date.parse(restartAt) + 86400000, stepDays: 1 })];
  assert.equal(engine.derivedWeek(), 2, 'only sessions after the restart move the clock');
});

test('a session started BEFORE the restart never counts, one after it does', () => {
  // Four sessions; the restart stamped at the first one's start. «Later than»
  // is strict: the session started AT the restart is not on the new clock, so
  // three count (week 1), not four (week 2).
  const history = log(4);
  seed(history, { programme_restart: { at: history[0].started_at, cycle: 2 } });
  assert.equal(engine.derivedWeek(), 1, 'started_at equal to `at` does not count');
  state.history = [...history, ...log(1, { startDay: Date.parse(history[3].started_at) + 1000 })];
  assert.equal(engine.derivedWeek(), 2, 'three after it plus one more make a week');
  // A restart stamped before everything counts everything.
  state.programme_restart = { at: '2026-01-01T00:00:00.000Z', cycle: 2 };
  assert.equal(engine.derivedWeek(), 2, 'five sessions → week 2 of cycle 2');
  assert.equal(engine.derivedCycle(), 2);
});

test('this calendar week\'s count is evidence: a restart never un-trains a day', () => {
  // Two sessions this Saturday-week, both before the restart.
  const now = Date.now();
  const history = [now - 2 * 3600000, now - 3600000].map((ms, i) => ({
    uid: `w${i}`, date: new Date(ms).toISOString().slice(0, 10), started_at: new Date(ms).toISOString(),
    session_id: ORDER[i], exercises: {},
  }));
  // Only meaningful if both are in the current local week (true unless the
  // test runs in the first two hours after Saturday midnight).
  seed(history);
  const before = engine.currentTrainingWeek().done;
  state.programme_restart = { at: new Date(now - 60000).toISOString(), cycle: 2 };
  assert.ok(before >= 1, 'the day he trained counts this week');
  assert.equal(engine.currentTrainingWeek().done, before, 'and still does after the restart — the strip is the calendar, not the clock');
  assert.equal(engine.countsOnProgrammeClock(history[0]), false, 'while the same session is off the programme clock');
  assert.equal(engine.derivedWeek(), 1);
});

test('restartProgramme(): cycle = derived + 1, refuses while a session runs, rotation untouched', () => {
  const history = log(21);
  history[20].session_id = 'lower_a';
  seed(history);
  const nextBefore = engine.getNextPlannedSession().session.id;
  assert.equal(nextBefore, 'upper_b', 'after Lower A comes Upper B');

  state.active_session = { session_id: 'upper_b', started_at: new Date().toISOString(), exercises: {} };
  assert.equal(engine.restartProgramme(), false, 'refused while a session is running');
  assert.equal(state.programme_restart, null);
  state.active_session = null;

  state.forced_next_session = 'not_a_session';
  const result = engine.restartProgramme();
  assert.ok(result && result.cycle === 2, 'cycle 1 + 1');
  assert.ok(Number.isFinite(Date.parse(state.programme_restart.at)));
  assert.equal(state.forced_next_session, null, 'a forced session the block lacks is cleared');
  assert.equal(engine.derivedWeek(), 1);
  assert.equal(engine.derivedCycle(), 2);
  assert.equal(engine.getNextPlannedSession().session.id, 'upper_b', 'the rotation is history-driven and not reset');
  assert.equal(state.history.length, 21);

  // A valid forced session survives.
  seed(log(3));
  state.forced_next_session = 'lower_b';
  engine.restartProgramme();
  assert.equal(state.forced_next_session, 'lower_b');
});

test('a stale cycle-1 deload (his «1:5») does not fire after a restart', () => {
  seed(log(21), { triggered_deload: { week_id: '1:6', signs: ['no_motivation', 'strength_loss'], at: '2026-09-27T00:00:00Z' } });
  assert.equal(engine.deloadActive(), true, 'week 6 of cycle 1 is the booked week');
  state.programme_restart = { at: new Date(Date.now() + 1000).toISOString(), cycle: 2 };
  assert.equal(engine.deloadActive(), false, 'week ids are now 2:x');
});

test('client merge: the later restart wins from either side, and an absent key never erases one', () => {
  const early = { at: '2026-11-16T10:00:00.000Z', cycle: 2 };
  const late = { at: '2026-11-17T10:00:00.000Z', cycle: 3 };
  const m = (ours, theirs) => merge.mergeLocalStates(
    { history: [], programme_restart: ours }, { history: [], programme_restart: theirs }).programme_restart;
  assert.deepEqual(m(early, late), late, 'theirs is later → theirs');
  assert.deepEqual(m(late, early), late, 'ours is later → ours');
  assert.deepEqual(m(null, late), late, 'a tab that never saw the restart must not undo it');
  assert.deepEqual(m(late, null), late);
  const absent = merge.mergeLocalStates({ history: [] }, { history: [], programme_restart: late });
  assert.deepEqual(absent.programme_restart, late);
  assert.equal(merge.mergeChangedOurs({ history: [] }, absent), true, 'adopting a restart is a change he is told about');
});

// ---- 2. ramp sets -----------------------------------------------------------

test('ramp shape: order 1 ⇒ 2, every other row ⇒ ≤1, in every block', () => {
  for (const block of RW.PROGRAMME.blocks) {
    for (const sessions of [block.sessions, block.deload_sessions || []]) {
      for (const session of sessions) {
        for (const row of session.exercises) {
          if (row.order === 1) assert.equal(row.ramp_sets, 2, `${block.id}/${session.id} opener keeps 2`);
          else assert.ok(row.ramp_sets <= 1, `${block.id}/${session.id}/${row.exercise_id} (order ${row.order}) has ${row.ramp_sets} ramps`);
        }
      }
    }
  }
  // «ما نحتاج التدرج» — nothing goes UP: the ab rows that were 0 stay 0.
  const blockA = RW.PROGRAMME.blocks[0].sessions;
  assert.equal(blockA.find((s) => s.id === 'lower_a').exercises.find((r) => r.order === 6).ramp_sets, 0);
  assert.equal(blockA.find((s) => s.id === 'lower_b').exercises.find((r) => r.order === 6).ramp_sets, 0);
});

test('a single ramp lands on 60% of the working load, not 50%', () => {
  const [one] = engine.rampLoadsFor(50, 1, 2.5);
  assert.equal(one.weight, 30, '60% of 50 kg');
  assert.equal(engine.rampLoadsFor(50, 1, 2.5).length, 1);
});

// ---- 3. triggered deload keeps the current block ------------------------------

test('a deload triggered in Block A keeps Block A\'s exercises and only cuts sets', () => {
  // 8 sessions → week 3, Block A.
  seed(log(8), { triggered_deload: { week_id: '1:3', signs: ['sore', 'poor_sleep'], at: '2026-09-10T00:00:00Z' } });
  assert.equal(engine.derivedWeek(), 3);
  assert.equal(engine.deloadActive(), true);
  const active = engine.getActiveProgramme();
  const blockA = RW.PROGRAMME.blocks.find((b) => b.id === 'A');
  assert.equal(active.active_block, 'A', 'the clock does not move');
  for (const session of active.sessions) {
    const source = blockA.sessions.find((s) => s.id === session.id);
    assert.deepEqual(session.exercises.map((r) => r.exercise_id), source.exercises.map((r) => r.exercise_id),
      `${session.id}: same exercises as the block he is in`);
    session.exercises.forEach((row, i) => {
      assert.equal(row.deload, true);
      assert.ok(row.work_sets < source.exercises[i].work_sets || source.exercises[i].work_sets === 1,
        `${session.id}/${row.exercise_id} cuts a set`);
    });
  }
});

test('a Block B trigger uses Block B; the week-12 backstop is unchanged', () => {
  seed(log(20), { triggered_deload: { week_id: '1:6', signs: ['sore', 'poor_sleep'], at: '2026-09-10T00:00:00Z' } });
  assert.equal(engine.derivedWeek(), 6);
  const blockB = RW.PROGRAMME.blocks.find((b) => b.id === 'B');
  const active = engine.getActiveProgramme();
  assert.equal(active.active_block, 'B');
  assert.deepEqual(active.sessions[0].exercises.map((r) => r.exercise_id), blockB.sessions[0].exercises.map((r) => r.exercise_id));
  assert.ok(active.sessions[0].exercises.every((r) => r.deload));

  // Week 12 (44 sessions) with no trigger is the backstop block itself.
  seed(log(44));
  assert.equal(engine.derivedWeek(), 12);
  const backstop = engine.getActiveProgramme();
  assert.equal(backstop.active_block, 'DELOAD');
  assert.ok(backstop.sessions.every((s) => s.exercises.every((r) => r.deload)));
});
