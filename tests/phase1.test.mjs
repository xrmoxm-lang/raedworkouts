import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  EQUIPMENT_STEP_CONFIDENCE_MINIMUM,
  loadCatalogue,
  programmedRepRange,
  rampPrescription,
  resolveEquipmentStep,
  warmupDrillsFor,
} from '../domain/catalogue.js';
import {
  appendEvent,
  createEntityUpsertEvent,
  createEventLog,
  createSessionEvent,
  createSessionStatusEvent,
  createSetEvent,
  createTombstoneEvent,
  reconcileEventLogs,
} from '../domain/events.js';
import { clampWorkingWeight, CLAMP_IDS } from '../domain/clamps.js';
import { initialiseProgressionState, progressExercise } from '../domain/progression.js';
import { CURRENT_SCHEMA_VERSION, runMigrations } from '../domain/migrations.js';
import { weeklyVolume } from '../domain/volume.js';

const USER = 'raed';
const WEEK = { start: '2026-08-24T00:00:00.000Z', end: '2026-08-31T00:00:00.000Z' };
const at = '2026-08-25T06:00:00.000Z';
const uuid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

async function legacyData() {
  const source = await readFile(new URL('../data.js', import.meta.url), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'data.js' });
  return context.window.RW;
}

const rawData = await legacyData();
const rawExercises = rawData.EXERCISES;
const catalogue = loadCatalogue(rawExercises);
const exercise = (id) => catalogue.get(id);
const legacyServerDirectory = fileURLToPath(new URL('../server', import.meta.url));

function actualV15ServerMerge(head, incoming) {
  const source = [
    'import json, sys',
    'sys.path.insert(0, sys.argv[2])',
    'from raedsync import merge_states',
    'payload = json.loads(sys.argv[1])',
    "print(json.dumps(merge_states(payload['head'], payload['incoming'], '2026-08-25T06:00:00.000Z', '2026-08-25T07:00:00.000Z')))"
  ].join('; ');
  return JSON.parse(execFileSync('python3', ['-c', source, JSON.stringify({ head, incoming }), legacyServerDirectory], { encoding: 'utf8' }));
}

function sessionEvent({ sessionId = uuid(1), eventId = uuid(2), startedAt = at } = {}) {
  return createSessionEvent({
    userKey: USER,
    programmeId: 'block_1',
    variant: 'fullbody_2x',
    sessionType: 'upper',
    sessionId,
    eventId,
    startedAt,
    deviceId: 'phone-a',
    seq: 1,
  });
}

function setEvent({
  setId,
  eventId,
  sessionId = uuid(1),
  exerciseId = 'incline_chest_press',
  kind = 'working',
  weightKg = 25,
  reps = 10,
  completedAt = at,
  ordinal = 1,
} = {}) {
  return createSetEvent({
    userKey: USER,
    eventId,
    createdAt: completedAt,
    deviceId: 'phone-a',
    seq: ordinal + 1,
    set: {
      id: setId,
      session_id: sessionId,
      exercise_id: exerciseId,
      ordinal,
      kind,
      weight_kg: weightKg,
      reps,
      rir: null,
      completed_at: completedAt,
      source: 'user',
    },
  });
}

function assertionFailure(assertion) {
  try {
    assertion();
  } catch (error) {
    return error;
  }
  assert.fail('Expected the legacy behaviour to fail the preservation assertion');
}

test('catalogue migrates every source exercise losslessly and exposes aliases/videos', () => {
  assert.ok(
    rawExercises.length >= 33,
    `catalogue shrank below the 33 v15 shipped: ${rawExercises.length}`,
  );
  assert.equal(catalogue.exercises.length, rawExercises.length);
  for (const raw of rawExercises) {
    const migrated = catalogue.get(raw.id);
    assert.equal(JSON.stringify(migrated.legacy), JSON.stringify(raw), `${raw.id} legacy fields must remain byte-for-byte data-equivalent`);
    assert.equal(migrated.name.en, raw.name);
    assert.equal(migrated.name_ar, raw.name_ar);
    assert.equal(migrated.cue.en, raw.cue);
    assert.equal(catalogue.get(raw.name), migrated);
  }
  assert.equal(catalogue.get('بنش مايل (آلة)').id, 'incline_chest_press');
  assert.ok(catalogue.videos.every((video) => ['source_linked', 'manual'].includes(video.confidence)));
  assert.ok(catalogue.videos.every((video) => !String(video.youtube_id || '').includes('results')));
  assert.equal(exercise('chest_press_machine').video_records.some((video) => video.label.en === 'Jeff Nippard'), false);
});

test('catalogue fails loudly when an exercise has two primary muscles', () => {
  assert.throws(
    () => loadCatalogue([{ id: 'bad_lunge', name: 'Bad lunge', name_ar: 'سيئ', primary: ['quads', 'glutes'], secondary: [], pattern: 'compound_quad' }]),
    /exactly one primary muscle/,
  );
});

test('equipment step is learned only from clean data, never loosened, and manual always wins', () => {
  const lateral = exercise('lateral_raise_db');
  const step = (observations, manualStepKg = null) =>
    resolveEquipmentStep(lateral, { observations, manualStepKg, minimumDistinctWeights: EQUIPMENT_STEP_CONFIDENCE_MINIMUM });

  // too few observations to be confident
  const provisional = step([4, 6.5]);
  assert.equal(provisional.kg, 2.5);
  assert.equal(provisional.source, 'default');
  assert.equal(provisional.provisional, true);

  // clean equipment is learned, and a coarser machine is recognised as coarser
  const fine = step([5, 7.5, 10]);
  assert.equal(fine.kg, 2.5);
  assert.equal(fine.source, 'learned');
  assert.equal(fine.provisional, false);
  assert.equal(step([30, 35, 40, 45]).kg, 5, 'a 5 kg machine must be learned as 5 kg');

  // Dirty logs must fall back to the provisional default rather than confirm a
  // finer step. A single mistyped weight used to collapse the learned step to
  // 0.5 kg and mark it confirmed, which is looser than the default and would let
  // the app propose a weight the machine cannot actually be set to.
  for (const dirty of [[30, 32.5, 35, 41], [30, 35, 40, 41, 43], [31, 37, 43, 47]]) {
    const result = step(dirty);
    assert.equal(result.source, 'default', `${JSON.stringify(dirty)} must not confirm a step`);
    assert.equal(result.provisional, true);
    assert.ok(result.kg >= 2.5, 'a learned step must never be finer than the default');
  }

  // A genuinely finer rack is Raed's to declare, and his word beats the data.
  const manual = step([8, 10, 12, 14], 2);
  assert.equal(manual.source, 'manual');
  assert.equal(manual.kg, 2);
  assert.equal(manual.provisional, false);
});

test('warm-up decisions use ten-rep drills, a 50/70 compound ramp, and zero for repeated patterns', () => {
  assert.ok(warmupDrillsFor('upper').every((drill) => drill.reps == null || drill.reps === 10));
  assert.equal(warmupDrillsFor('upper').some((drill) => drill.id === 'front_back_leg_swings'), false);
  assert.equal(warmupDrillsFor('lower').some((drill) => drill.id === 'front_back_leg_swings'), true);
  assert.deepEqual(
    rampPrescription(exercise('leg_press'), { workingWeightKg: 60 }).map(({ load_pct, reps, weight_kg }) => ({ load_pct, reps, weight_kg })),
    [{ load_pct: 50, reps: { min: 6, max: 10 }, weight_kg: 30 }, { load_pct: 70, reps: { min: 4, max: 6 }, weight_kg: 40 }],
  );
  assert.equal(rampPrescription(exercise('leg_press'), { workingWeightKg: 60, warmedPatterns: ['lower_compound'] }).length, 0);
  assert.deepEqual(programmedRepRange(exercise('leg_press')), { min: 8, max: 10 });
  assert.deepEqual(programmedRepRange(exercise('lateral_raise_db')), { min: 10, max: 12 });
});

test('every programmed rep range respects the 12 ceiling and D18 compound floor of 8', () => {
  // Phase 5 replaced the v15 PROGRAMME/PROGRAMME_PPL pair with one Upper/Lower
  // programme carrying both blocks. Walk every block, not just the active one.
  //
  // This used to cross-check each programme row against the catalogue's own
  // per-exercise range. That was two copies of one fact and they drifted the moment
  // the real programme landed: `20` §8.4 programmes 33 of its 40 rows at 10-12,
  // including compounds the catalogue recorded as 8-10. The programme row is the
  // single source of truth for what is prescribed; the invariants are asserted here.
  const planned = rawData.PROGRAMME.blocks.flatMap((block) => block.sessions.flatMap((session) => session.exercises));
  assert.ok(planned.length > 0, 'the ceiling cannot be checked against an empty programme');
  for (const item of planned) {
    const [low, high] = String(item.reps).split('-').map(Number);
    assert.ok(high <= 12, `${item.exercise_id} programs up to ${high} reps, above the locked ceiling of 12`);
    assert.ok(low >= 1 && low <= high, `${item.exercise_id} has an incoherent rep range ${item.reps}`);
    const ex = exercise(item.exercise_id);
    const isCompound = ['lower_compound', 'hinge', 'upper_press', 'upper_pull'].includes(ex.canonical_pattern);
    if (isCompound) {
      assert.ok(low >= 8, `${item.exercise_id} programs ${item.reps}, below D18's compound floor of 8`);
    }
  }
});

test('events are UUID-identified, append-only, idempotent, and snapshots are derived', () => {
  const created = sessionEvent();
  const logged = setEvent({ setId: uuid(3), eventId: uuid(4) });
  let log = createEventLog({ userKey: USER });
  log = appendEvent(log, created);
  log = appendEvent(log, logged);
  const same = appendEvent(log, logged);
  assert.equal(same, log, 'same event id is a no-op');
  assert.equal(log.events.length, 2);
  assert.equal(log.snapshot.sessions.length, 1);
  assert.equal(log.snapshot.sets.length, 1);
  assert.equal(log.snapshot.sets[0].id, uuid(3));
});

test('volume has labelled ordinary and fractional ledgers; warmups and corrupt records are excluded', () => {
  let log = createEventLog({ userKey: USER });
  log = appendEvent(log, sessionEvent());
  log = appendEvent(log, setEvent({ setId: uuid(5), eventId: uuid(6), kind: 'warmup', weightKg: 12.5, reps: 10, ordinal: 1 }));
  log = appendEvent(log, setEvent({ setId: uuid(7), eventId: uuid(8), kind: 'working', weightKg: 25, reps: 10, ordinal: 2 }));
  log = appendEvent(log, setEvent({ setId: uuid(9), eventId: uuid(10), kind: 'calibration', weightKg: 25, reps: 10, ordinal: 3 }));
  log = appendEvent(log, setEvent({ setId: uuid(11), eventId: uuid(12), kind: 'working', weightKg: 25, reps: 0, ordinal: 4 }));
  const volume = weeklyVolume(USER, WEEK, { eventLog: log, catalogue });
  assert.equal(volume.ordinary.label, 'ordinary_sets');
  assert.equal(volume.fractional.label, 'fractional_sets');
  assert.equal(volume.ordinary.working_set_count, 2);
  assert.equal(volume.fractional.working_set_count, 2);
  assert.equal(volume.ordinary.by_muscle.upper_chest, 2);
  assert.equal(volume.ordinary.by_muscle.shoulders, 2);
  assert.equal(volume.fractional.by_muscle.upper_chest, 2);
  assert.equal(volume.fractional.by_muscle.shoulders, 1);
  assert.equal(volume.fractional.by_muscle.triceps, 1);
});

test('all eight safety clamps run in order and a 300 kg lateral raise is rejected by bodyweight sanity', () => {
  const normal = clampWorkingWeight({
    catalogue,
    exerciseId: 'lateral_raise_db',
    proposedWeightKg: 5,
    history: [{ kind: 'working', valid: true, weight_kg: 5 }],
    bodyweightKg: 82,
    weeklyVolume: { fractional: { label: 'fractional_sets', by_muscle: { side_delts: 4 } } },
  });
  assert.deepEqual(normal.trace.map((row) => row.id), Object.values(CLAMP_IDS));
  assert.equal(normal.accepted, true);
  const hallucination = clampWorkingWeight({
    catalogue,
    exerciseId: 'lateral_raise_db',
    proposedWeightKg: 300,
    history: [{ kind: 'working', valid: true, weight_kg: 100 }],
    bodyweightKg: 82,
    weeklyVolume: { fractional: { label: 'fractional_sets', by_muscle: { side_delts: 4 } } },
  });
  assert.equal(hallucination.accepted, false);
  assert.equal(hallucination.rejected_by, CLAMP_IDS.BODYWEIGHT_SANITY);
  assert.ok(hallucination.clamp_fired.includes(CLAMP_IDS.BODYWEIGHT_SANITY));
});

test('progression ignores legacy numeric telemetry and applies clamps after two top exposures', () => {
  const legPress = exercise('leg_press');
  let state = initialiseProgressionState({ loadKg: 50, exercise: legPress, setsTarget: 3 });
  const exposure = (rpe) => [
    { kind: 'working', valid: true, reps: 10, form_ok: true, rpe },
    { kind: 'working', valid: true, reps: 10, form_ok: true, rpe },
    { kind: 'working', valid: true, reps: 10, form_ok: true, rpe },
  ];
  const first = progressExercise({ catalogue, exercise: legPress, state, completedSets: exposure(1), history: [{ kind: 'working', valid: true, weight_kg: 50 }], bodyweightKg: 82 });
  const sameInputsExceptFeeling = progressExercise({ catalogue, exercise: legPress, state, completedSets: exposure(10), history: [{ kind: 'working', valid: true, weight_kg: 50 }], bodyweightKg: 82 });
  assert.deepEqual(first, sameInputsExceptFeeling);
  assert.equal(first.action, 'hold');
  state = first.next_state;
  const second = progressExercise({ catalogue, exercise: legPress, state, completedSets: exposure(7), history: [{ kind: 'working', valid: true, weight_kg: 50 }], bodyweightKg: 82 });
  assert.equal(second.action, 'increase');
  assert.equal(second.next_state.load_kg, 52.5);
  assert.equal(second.next_state.reps_target, 8);
  assert.throws(() => initialiseProgressionState({ loadKg: 10, exercise: legPress, repLow: 6, repHigh: 13 }), /rep_high <= 12/);
});

test('migrations export before mutation, retain corrupt v15 rows as invalid, and never aggregate them', async () => {
  const captured = JSON.parse(await readFile(new URL('./fixtures/v15-captured-payload.json', import.meta.url), 'utf8'));
  const calls = [];
  let next = 100;
  const result = runMigrations(captured, {
    userKey: USER,
    now: () => '2026-08-25T08:00:00.000Z',
    idFactory: () => uuid(next++),
    exportState: (record) => calls.push(record),
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].state, captured, 'export receives untouched v15 data');
  assert.match(calls[0].filename, /^raedworkouts-pre-migration-2026-08-25T08-00-00-000Z\.json$/);
  assert.equal(result.status, 'migrated');
  assert.equal(result.version, CURRENT_SCHEMA_VERSION);
  const migratedLog = { ...result.state.event_log, snapshot: result.state.snapshot };
  const corrupt = migratedLog.snapshot.sets.filter((set) => set.valid === false);
  assert.equal(corrupt.length, 2);
  assert.deepEqual(corrupt.map((set) => set.exercise_id).sort(), ['hip_thrust', 'incline_chest_press']);
  const migratedVolume = weeklyVolume(USER, { start: '2026-08-18T00:00:00.000Z', end: '2026-08-25T00:00:00.000Z' }, { eventLog: migratedLog, catalogue });
  assert.equal(migratedVolume.fractional.working_set_count, 1);
  const future = runMigrations({ schema_version: 99, history: [] }, { userKey: USER });
  assert.equal(future.status, 'read_only');
  assert.equal(future.export, null);
});

test('failing-first: old boot-pull snapshot replacement loses a set, event reconciliation preserves it', () => {
  const session = sessionEvent({ sessionId: uuid(200), eventId: uuid(201) });
  const loggedWhilePulling = setEvent({ sessionId: uuid(200), setId: uuid(202), eventId: uuid(203), completedAt: at });
  let local = createEventLog({ userKey: USER });
  local = appendEvent(local, session);
  local = appendEvent(local, loggedWhilePulling);
  const remoteBeforeEdit = appendEvent(createEventLog({ userKey: USER }), session);
  const legacyFailure = assertionFailure(() => assert.equal(remoteBeforeEdit.snapshot.sets.length, 1));
  assert.match(legacyFailure.message, /1/);
  const safe = reconcileEventLogs(local, remoteBeforeEdit);
  assert.equal(safe.snapshot.sets.length, 1);
  console.log('FAILING-FIRST: boot-pull old snapshot replacement failed preservation; event union passed');
});

test('failing-first: old active-session winner merge loses one device set, event union keeps both', () => {
  const shared = sessionEvent({ sessionId: uuid(210), eventId: uuid(211) });
  const a = appendEvent(appendEvent(createEventLog({ userKey: USER }), shared), setEvent({ sessionId: uuid(210), setId: uuid(212), eventId: uuid(213), exerciseId: 'incline_chest_press' }));
  const b = appendEvent(appendEvent(createEventLog({ userKey: USER }), shared), setEvent({ sessionId: uuid(210), setId: uuid(214), eventId: uuid(215), exerciseId: 'shoulder_press_machine' }));
  const legacyWinner = actualV15ServerMerge(
    { active_session: { started_at: at, session_id: 'ppl_push', exercises: { incline_chest_press: { sets: [{ completed: true, is_warmup: false }] } } } },
    { active_session: { started_at: at, session_id: 'ppl_push', exercises: { shoulder_press_machine: { sets: [{ completed: true, is_warmup: false }] } } } },
  ).active_session;
  const legacyCompletedSets = Object.values(legacyWinner.exercises).flatMap((item) => item.sets).filter((item) => item.completed && !item.is_warmup);
  const legacyFailure = assertionFailure(() => assert.equal(legacyCompletedSets.length, 2));
  assert.match(legacyFailure.message, /2/);
  const safe = reconcileEventLogs(a, b);
  assert.equal(safe.snapshot.sets.length, 2);
  console.log('FAILING-FIRST: active-session winner merge failed preservation; per-set event union passed');
});

test('failing-first: old dictionary union resurrects deleted videos/exercises, tombstones keep them deleted', () => {
  const session = sessionEvent({ sessionId: uuid(220), eventId: uuid(221) });
  const video = { id: uuid(222), url: 'https://example.invalid/video' };
  const customExercise = { id: uuid(223), name: 'Custom press' };
  const hidden = { id: uuid(224), exercise_id: 'incline_chest_press', video_key: 'mohannad_0' };
  let head = appendEvent(createEventLog({ userKey: USER }), session);
  head = appendEvent(head, createEntityUpsertEvent({ userKey: USER, targetType: 'video', entity: video, eventId: uuid(225), createdAt: at }));
  head = appendEvent(head, createEntityUpsertEvent({ userKey: USER, targetType: 'exercise', entity: customExercise, eventId: uuid(226), createdAt: at }));
  head = appendEvent(head, createEntityUpsertEvent({ userKey: USER, targetType: 'video_hidden', entity: hidden, eventId: uuid(227), createdAt: at }));
  const legacyDictionaryUnion = actualV15ServerMerge(
    {
      custom_videos: { press: ['https://example.invalid/video'] },
      video_hidden: { press: ['mohannad_0'] },
      custom_exercises: [{ id: 'custom_a', name: 'Custom press' }],
    },
    { custom_videos: {}, video_hidden: {}, custom_exercises: [] },
  );
  const legacyFailure = assertionFailure(() => assert.deepEqual({
    videos: Object.keys(legacyDictionaryUnion.custom_videos).length,
    hidden: Object.keys(legacyDictionaryUnion.video_hidden).length,
    exercises: legacyDictionaryUnion.custom_exercises.length,
  }, { videos: 0, hidden: 0, exercises: 0 }));
  assert.match(legacyFailure.message, /0/);
  let deletionDevice = appendEvent(createEventLog({ userKey: USER }), session);
  deletionDevice = appendEvent(deletionDevice, createTombstoneEvent({ userKey: USER, targetType: 'video', targetId: video.id, eventId: uuid(228), createdAt: '2026-08-25T07:00:00.000Z' }));
  deletionDevice = appendEvent(deletionDevice, createTombstoneEvent({ userKey: USER, targetType: 'exercise', targetId: customExercise.id, eventId: uuid(229), createdAt: '2026-08-25T07:00:00.000Z' }));
  deletionDevice = appendEvent(deletionDevice, createTombstoneEvent({ userKey: USER, targetType: 'video_hidden', targetId: hidden.id, eventId: uuid(230), createdAt: '2026-08-25T07:00:00.000Z' }));
  const safe = reconcileEventLogs(head, deletionDevice);
  assert.equal(safe.snapshot.entities.video?.length || 0, 0);
  assert.equal(safe.snapshot.entities.exercise?.length || 0, 0);
  assert.equal(safe.snapshot.entities.video_hidden?.length || 0, 0);
  console.log('FAILING-FIRST: dictionary-union deletion failed preservation; tombstones passed');
});

after(() => {
  console.log('FAILING_FIRST_EVIDENCE_PASSED');
  console.log('PHASE1_TESTS_PASSED');
});
