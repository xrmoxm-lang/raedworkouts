import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

import { loadCatalogue } from '../domain/catalogue.js';
import { initialiseProgressionState, progressExercise } from '../domain/progression.js';
import { assessSubstitution } from '../domain/substitutions.js';

async function legacyData() {
  const source = await readFile(new URL('../data.js', import.meta.url), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'data.js' });
  return context.window.RW;
}

const rawData = await legacyData();
const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const catalogue = loadCatalogue(rawData.EXERCISES);
const legPress = catalogue.get('leg_press');
const history = [{ kind: 'working', valid: true, weight_kg: 50 }];
const topSets = (effort = null) => [
  { kind: 'working', valid: true, reps: 10, form_ok: true },
  { kind: 'working', valid: true, reps: 10, form_ok: true },
  { kind: 'working', valid: true, reps: 10, form_ok: true, effort },
];
const progress = (state, completedSets) => progressExercise({
  catalogue, exercise: legPress, state, completedSets, history, bodyweightKg: 82,
});

test('D16/D17 effort is final-set-only, a brake, and never a load driver', () => {
  const initial = initialiseProgressionState({ loadKg: 50, exercise: legPress, setsTarget: 3 });

  const mediumFirstTop = progress(initial, topSets('medium'));
  assert.equal(mediumFirstTop.action, 'hold', 'medium cannot create an increase on one top exposure');

  const easyFirstTop = progress(initial, topSets('easy'));
  assert.equal(easyFirstTop.action, 'increase', 'easy may land a reps-earned top exposure one session sooner');
  assert.equal(easyFirstTop.next_state.load_kg, 52.5);

  const belowTopEasy = progress(initial, [
    { kind: 'working', valid: true, reps: 9, form_ok: true },
    { kind: 'working', valid: true, reps: 10, form_ok: true },
    { kind: 'working', valid: true, reps: 10, form_ok: true, effort: 'easy' },
  ]);
  assert.equal(belowTopEasy.action, 'hold', 'easy without every completed top-range rep cannot increase load');

  const normalEarned = progress(mediumFirstTop.next_state, topSets('medium'));
  const veryHardEarned = progress(mediumFirstTop.next_state, topSets('very_hard'));
  assert.equal(normalEarned.action, 'increase');
  assert.equal(veryHardEarned.action, 'hold');
  assert.equal(veryHardEarned.next_state.load_kg, 50);
  assert.ok(
    veryHardEarned.next_state.load_kg <= normalEarned.next_state.load_kg,
    'very_hard can never produce a higher load than the otherwise identical input without it',
  );

  assert.throws(
    () => progress(initial, [
      { kind: 'working', valid: true, reps: 10, form_ok: true, effort: 'easy' },
      { kind: 'working', valid: true, reps: 10, form_ok: true },
      { kind: 'working', valid: true, reps: 10, form_ok: true },
    ]),
    /final working set only/,
  );
});

test('D18 and D19 retain 8–10 compounds and a detrained history-first seed', () => {
  const planned = rawData.PROGRAMME.blocks
    .flatMap((block) => block.sessions.flatMap((session) => session.exercises));
  assert.ok(planned.length > 0, 'D18 cannot be checked against an empty programme');
  for (const item of planned) {
    const exercise = catalogue.get(item.exercise_id);
    const isCompound = ['lower_compound', 'hinge', 'upper_press', 'upper_pull'].includes(exercise.canonical_pattern);
    const [low, high] = String(item.reps).split('-').map(Number);
    // D18 is a FLOOR, not an exact range. Raed's words are "ما ننزل عن ثمانية
    // للمركبات، أحس ستة قليل" — never below eight, six feels too few. `22` §5
    // restates it as exactly 8-10, but `20` §8.4 programmes 33 of 40 rows at 10-12
    // including compounds, so the equality reading is contradicted by the programme
    // Raed is actually running. Read as a floor, exactly two rows violated it and
    // both were Block B's upper first exercises at 6-8; both are corrected in data.js.
    if (isCompound) {
      assert.ok(low >= 8, `${item.exercise_id} programs ${item.reps}, below D18's compound floor of 8`);
    } else {
      assert.ok(low >= 10 && high <= 12, `${item.exercise_id} isolation must stay within 10-12, got ${item.reps}`);
    }
  }
  assert.match(rawData.ATHLETE.experience, /Detrained/i);
  assert.match(rawData.PROGRAMME.notes.join(' '), /logged history/i);
});

test('warm-up phase has a 5–10 minute treadmill, ten-rep drills, 15-minute cap, and no upper leg drills', () => {
  const upper = rawData.SESSION_WARMUPS.upper;
  const lower = rawData.SESSION_WARMUPS.lower;
  assert.deepEqual(Array.from(upper.treadmill_minutes), [5, 7, 10]);
  assert.equal(upper.cap_minutes, 15);
  assert.ok(upper.drills.every((drill) => drill.reps === 10));
  assert.equal(upper.drills.some((drill) => /leg/i.test(drill.id)), false, 'Upper days hard-block leg drills');
  assert.equal(lower.drills.some((drill) => /leg/i.test(drill.id)), true);
});

test('session UI keeps the removal list out and wires one-thumb logging and the warm-up gate', () => {
  assert.match(appSource, /renderWarmupPhase/);
  assert.match(appSource, /isFinalWorkingSet && !set\.effort/);
  // The GATE, not a copy of its wording. This matched a raw English literal that
  // lived inside toggleRunnerSet — a duplicate of the rule that was removed with
  // the other eleven dead functions on 2026-09-05. The rule itself never moved:
  // the live set-check handler refuses a working set while a ramp is unticked
  // and toasts t('finish_ramp_first'). Asserting the English string meant this
  // test would also have passed on a dead copy while the live path was broken.
  assert.match(appSource, /finish_ramp_first/);
  assert.match(appSource, /prior\.is_warmup && !prior\.completed/);
  assert.doesNotMatch(appSource, /Last session not fully logged/);
  assert.doesNotMatch(appSource, /Focus mode/);
  assert.doesNotMatch(appSource, /Cues on/);
  assert.doesNotMatch(appSource, /Cue:\s/);
  assert.match(styleSource, /grid-template-columns:\s*30px minmax\(72px, 1fr\) minmax\(64px, 0\.8fr\) 48px/);
});

function syntheticCatalogue() {
  return loadCatalogue([
    { id: 'chest_press', name: 'Chest press', name_ar: '', primary: ['chest'], secondary: [], pattern: 'isolation_push', alternatives: ['chest_press_same', 'back_press'] },
    { id: 'chest_press_same', name: 'Chest press same', name_ar: '', primary: ['chest'], secondary: [], pattern: 'isolation_push', alternatives: ['chest_press'] },
    { id: 'chest_press_shoulders', name: 'Chest press shoulders', name_ar: '', primary: ['chest'], secondary: ['shoulders'], pattern: 'isolation_push', alternatives: ['chest_press'] },
    { id: 'back_press', name: 'Back press', name_ar: '', primary: ['back'], secondary: [], pattern: 'isolation_pull', alternatives: ['chest_press'] },
    { id: 'back_row', name: 'Back row', name_ar: '', primary: ['back'], secondary: [], pattern: 'isolation_pull', alternatives: [] },
  ]);
}

test('D24 substitution recomputes the fractional ledger before clean, warn, and block-with-override classification', () => {
  const programme = {
    sessions: [{ id: 'upper_a', exercises: [
      { exercise_id: 'chest_press', sets: 8 },
      { exercise_id: 'back_row', sets: 8 },
    ] }],
  };
  const testCatalogue = syntheticCatalogue();
  const base = { catalogue: testCatalogue, programme, substitution: { from_exercise_id: 'chest_press', scope: 'this_session', session_id: 'upper_a' } };

  const clean = assessSubstitution({ ...base, substitution: { ...base.substitution, to_exercise_id: 'chest_press_same' } });
  assert.deepEqual(clean.ledger.baseline, { chest: 8, back: 8 });
  assert.deepEqual(clean.ledger.projected, { chest: 8, back: 8 });
  assert.equal(clean.classification.severity, 'clean');

  const warned = assessSubstitution({ ...base, substitution: { ...base.substitution, to_exercise_id: 'chest_press_shoulders' } });
  assert.equal(warned.ledger.projected.shoulders, 4, 'the deterministic ledger is exposed before classification');
  assert.equal(warned.classification.severity, 'warn');
  assert.ok(warned.classification.muscles_affected.includes('shoulders'));

  const blocked = assessSubstitution({ ...base, substitution: { ...base.substitution, to_exercise_id: 'back_press' } });
  assert.equal(blocked.ledger.projected.chest, 0);
  assert.equal(blocked.classification.severity, 'block-with-override');
  assert.ok(blocked.classification.muscles_affected.includes('chest'));
});
