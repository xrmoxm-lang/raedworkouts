import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

import { loadCatalogue } from '../domain/catalogue.js';
import {
  nextHistoryDrivenSession,
  resolveProgrammeBlock,
  runProgrammeReferenceMigrations,
} from '../domain/programme.js';
import { weeklyVolume } from '../domain/volume.js';

async function legacyData() {
  const source = await readFile(new URL('../data.js', import.meta.url), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'data.js' });
  return context.window.RW;
}

const rawData = await legacyData();

test('Phase 5 catalogue rejects a two-primary walking lunge loudly', () => {
  const badWalkingLunge = {
    id: 'phase5_bad_walking_lunge',
    name: 'Phase 5 bad walking lunge',
    name_ar: '',
    primary: ['quads', 'glutes'],
    secondary: [],
    pattern: 'compound_quad',
    alternatives: [],
  };

  assert.throws(
    () => loadCatalogue([...rawData.EXERCISES, badWalkingLunge]),
    /Catalogue invariant failed: exercise "phase5_bad_walking_lunge" must have exactly one primary muscle/,
  );
  console.log('PHASE5_CATALOGUE_PRIMARY_INVARIANT_PASSED');
});

const CROSSWALK = [
  ['Machine Chest Press', 'chest_press_machine'],
  ['Neutral-Grip Lat Pulldown', 'lat_pulldown_neutral'],
  ['Seated DB Shoulder Press', 'shoulder_press_machine'],
  ['Chest-Supported T-Bar Row', 'tbar_row'],
  ['Cable Lateral Raise', 'lateral_raise_cable'],
  ['DB Lateral Raise', 'lateral_raise_db'],
  ['DB Incline Press', 'incline_db_press'],
  ['Seated Cable Row', 'seated_cable_row'],
  ['Hammer Curl', 'hammer_curl'],
  ['DB Supinated Curl', 'biceps_curl'],
  ['Reverse Pec Deck', 'rear_delt_fly'],
  ['Seated Face Pull', 'face_pull'],
  ['Overhead Cable Triceps Extension', 'overhead_rope'],
  ['Leg Press', 'leg_press'],
  ['Leg Extension', 'leg_extension'],
  ['DB Romanian Deadlift', 'rdl'],
  ['Seated Leg Curl', 'seated_leg_curl'],
  ['Barbell Hip Thrust', 'hip_thrust'],
  ['Standing Calf Raise', 'standing_calf'],
  ['Seated Calf Raise', 'seated_calf'],
  ['Cable Crunch', 'ab_crunch'],
  ['Machine Crunch', 'machine_crunch'],
  ['Reverse-Grip Lat Pulldown', 'reverse_grip_lat_pulldown'],
  ['Assisted Dip', 'assisted_dip'],
  ['Single-Arm Rope Triceps Extension', 'single_arm_rope_triceps_extension'],
  ['Lying Leg Curl', 'lying_leg_curl'],
  ['Goblet Squat', 'goblet_squat'],
  ['DB Walking Lunge', 'db_walking_lunge'],
  ['Hanging Leg Raise', 'hanging_leg_raise'],
  ['EZ Bar Curl', 'ez_bar_curl'],
  ['Machine Lateral Raise', 'machine_lateral_raise'],
  ['Bicycle Crunch', 'bicycle_crunch'],
  ['DB Incline Curl', 'db_incline_curl'],
  ['Single-Leg Leg Extension', 'single_leg_leg_extension'],
  ['Leg Press Toe Press', 'leg_press_toe_press'],
  ['Flat DB Press', 'flat_db_press'],
  ['Hammer Strength Press', 'hammer_strength_press'],
  ['2-Grip Lat Pulldown', 'two_grip_lat_pulldown'],
  ['Machine Pulldown', 'machine_pulldown'],
  ['Machine Shoulder Press', 'machine_shoulder_press'],
  ['Standing DB Press', 'standing_db_press'],
  ['Chest-Supported DB Row', 'chest_supported_db_row'],
  ['Machine Row', 'machine_row'],
  ['Cable EZ Curl', 'cable_ez_curl'],
  ['Triceps Pressdown', 'tricep_pushdown'],
  ['Overhead Cable Extension', 'overhead_rope'],
  ['Machine Squat', 'machine_squat'],
  ['Barbell RDL', 'barbell_rdl'],
  ['45 Degree Hyperextension', 'degree_45_hyperextension'],
  ['Glute-Ham Raise', 'glute_ham_raise'],
  ['DB Standing Calf Raise', 'db_standing_calf_raise'],
  ['Crunch', 'crunch'],
  ['Machine Incline Press', 'machine_incline_press'],
  ['Incline Smith Press', 'incline_smith_press'],
  ['Reverse-Grip Assisted Pull-up', 'reverse_grip_assisted_pullup'],
  ['Single-Arm Pulldown', 'single_arm_pulldown'],
  ['Decline DB Press', 'decline_db_press'],
  ['Single-Arm DB Row', 'single_arm_db_row'],
  ['Bayesian Cable Curl', 'bayesian_cable_curl'],
  ['Cable Reverse Flye', 'cable_reverse_flye'],
  ['DB Single-Leg Hip Thrust', 'db_single_leg_hip_thrust'],
  ['Leg-Extension-Machine Hip Thrust', 'leg_extension_machine_hip_thrust'],
  ['DB Leg Curl', 'db_leg_curl'],
  ['Reverse Lunge', 'reverse_lunge'],
  ['DB Step-Up', 'db_step_up'],
  ['Reverse Crunch', 'reverse_crunch'],
  ['Roman Chair Crunch', 'roman_chair_crunch'],
  ['EZ Bar Skull Crusher', 'ez_bar_skull_crusher'],
  ['Plate-Weighted Crunch', 'plate_weighted_crunch'],
];

test('Phase 5 hand-reviewed catalogue crosswalk resolves programmes and every substitute exactly', () => {
  const catalogue = loadCatalogue(rawData.EXERCISES);
  for (const [name, id] of CROSSWALK) {
    assert.equal(catalogue.get(name)?.id, id, `${name} must resolve to ${id}`);
  }
  assert.notEqual(catalogue.get('Reverse Pec Deck')?.id, catalogue.get('Pec Deck')?.id);
  assert.notEqual(catalogue.get('Leg Press Toe Press')?.id, catalogue.get('Leg Press')?.id);
  assert.deepEqual(catalogue.get('Leg Press Toe Press')?.primary_muscle, 'calves');
  assert.deepEqual(catalogue.get('Machine Crunch')?.video_records, []);
  console.log('PHASE5_CATALOGUE_CROSSWALK_PASSED');
});

test('Phase 5 programme is an Upper/Lower history-driven four-session rotation with two resolved blocks', () => {
  const programme = rawData.PROGRAMME;
  assert.equal(programme.id, 'upper_lower');
  assert.deepEqual(Array.from(programme.rotation_order), ['upper_a', 'lower_a', 'upper_b', 'lower_b']);
  assert.deepEqual(Array.from(programme.weekly_layout), ['upper_a', 'lower_a', 'rest', 'upper_b', 'lower_b', 'rest', 'rest']);
  assert.equal(programme.blocks.length, 2);

  for (const block of programme.blocks) {
    assert.equal(block.sessions.length, 4, `${block.id} has the four adopted sessions`);
    for (const session of block.sessions) {
      for (const row of session.exercises) {
        for (const field of ['ramp_sets', 'work_sets', 'rep_lo', 'rep_hi', 'rpe_set1', 'rpe_set2', 'rest_min', 'superset_group', 'sub1', 'sub2']) {
          assert.ok(field in row, `${block.id}/${session.id}/${row.exercise_id} keeps ${field}`);
        }
      }
    }
  }

  const blockAUpper = programme.blocks[0].sessions.find((session) => session.id === 'upper_a');
  const blockBUpper = programme.blocks[1].sessions.find((session) => session.id === 'upper_a');
  assert.equal(blockAUpper.exercises[4].exercise_id, 'biceps_curl');
  assert.equal(blockBUpper.exercises[4].exercise_id, 'ez_bar_curl');
  assert.equal(blockBUpper.exercises[1].exercise_id, 'lat_pulldown_neutral', 'an unlisted Block A row carries forward');
  assert.equal(resolveProgrammeBlock(programme, { currentWeek: 5 }).active_block, 'B');
  // `20` §8.2 drops the day's first exercise one rep band, which for the two upper
  // days meant 8-10 -> 6-8. That breaks D18, Raed's locked compound floor of 8, so
  // the app keeps them at 8-10. The lower days still drop 10-12 -> 8-10, which is
  // the same intent and stays above the floor.
  assert.equal(resolveProgrammeBlock(programme, { currentWeek: 5 }).sessions[0].exercises[0].rep_lo, 8);

  const sessionId = (history) => nextHistoryDrivenSession(resolveProgrammeBlock(programme, { currentWeek: 1 }), history).session.id;
  assert.equal(sessionId([]), 'upper_a');
  assert.equal(sessionId([{ session_id: 'upper_a' }]), 'lower_a');
  assert.equal(sessionId([{ session_id: 'upper_a' }, { session_id: 'lower_a' }, { session_id: 'upper_b' }]), 'lower_b');
  assert.equal(sessionId([{ session_id: 'lower_a' }, { session_id: 'upper_b' }, { session_id: 'lower_b' }]), 'upper_a', 'the three-day fallback continues, never reshuffles');
  console.log('PHASE5_PROGRAMME_PORT_PASSED');
});

test('Phase 5 exports before retiring an unsafe legacy forced session and ignores archival history for rotation', () => {
  const capturedLegacyState = {
    schema_version: 2,
    programme_reference_migration_version: 0,
    forced_next_session: 'ppl_pull',
    history: [
      { session_id: 'session_a' },
      { session_id: 'ppl_push' },
      { session_id: 'legs' },
    ],
  };
  const exports = [];
  const migration = runProgrammeReferenceMigrations(capturedLegacyState, {
    programme: rawData.PROGRAMME,
    now: () => '2026-08-26T09:00:00.000Z',
    exportState: (record) => exports.push(record),
  });
  assert.equal(exports.length, 1);
  assert.deepEqual(exports[0].state, capturedLegacyState, 'pre-D6 state must be exported before any reference changes');
  assert.match(exports[0].filename, /^raedworkouts-pre-programme-migration-2026-08-26T09-00-00-000Z\.json$/);
  assert.equal(migration.status, 'migrated');
  assert.equal(migration.state.forced_next_session, null, 'PPL forced-next has no safe Upper/Lower equivalent');
  assert.deepEqual(Array.from(migration.ignored), ['forced_next_session:ppl_pull']);
  assert.deepEqual(migration.state.history, capturedLegacyState.history, 'performed-session history remains unmodified evidence');

  const active = resolveProgrammeBlock(rawData.PROGRAMME, { currentWeek: 1 });
  assert.equal(nextHistoryDrivenSession(active, migration.state.history).session.id, 'upper_a', 'unmapped v15 history is safely ignored rather than crashing or reshuffling');

  const currentForced = runProgrammeReferenceMigrations({
    programme_reference_migration_version: 0,
    forced_next_session: 'lower_b',
    history: [],
  }, {
    programme: rawData.PROGRAMME,
    exportState: () => {},
  });
  assert.equal(currentForced.state.forced_next_session, 'lower_b', 'a valid Upper/Lower forced-next session survives migration');
  console.log('PHASE5_PROGRAMME_REFERENCE_MIGRATION_PASSED');
});

function realProgrammeWeek(programme) {
  let serial = 0;
  return {
    user_key: 'phase5-ledger',
    sets: programme.sessions.flatMap((session) => session.exercises.flatMap((row) =>
      Array.from({ length: row.work_sets }, () => ({
        id: `phase5-ledger-${++serial}`,
        user_key: 'phase5-ledger',
        exercise_id: row.exercise_id,
        kind: 'working',
        valid: true,
        completed_at: '2026-08-19T12:00:00.000Z',
      })),
    )),
  };
}

test('Phase 5 real catalogue re-derives the locked weekly volume ledger and D4 floor', () => {
  const catalogue = loadCatalogue(rawData.EXERCISES);
  const programme = resolveProgrammeBlock(rawData.PROGRAMME, { currentWeek: 1 });
  const volume = weeklyVolume('phase5-ledger', '2026-W34', {
    snapshot: realProgrammeWeek(programme),
    catalogue,
  });
  const fractional = volume.fractional.total_credits;
  const ordinary = volume.ordinary.total_credits;
  const measured = {
    direct: volume.fractional.working_set_count,
    fractional,
    ordinary,
    conversion: Number((ordinary / fractional).toFixed(4)),
    below_floor: Object.entries(volume.fractional.by_muscle)
      .filter(([, sets]) => sets < 4)
      .map(([muscle, sets]) => `${muscle}:${sets}`)
      .sort(),
  };
  console.log(`PHASE5_LEDGER_MEASURED ${JSON.stringify(measured)}`);
  assert.deepEqual(measured, {
    direct: 75,
    fractional: 116.5,
    ordinary: 158,
    conversion: 1.3562,
    below_floor: [],
  });
  console.log('PHASE5_LEDGER_REDERIVED');
});
