// 'Lying Leg Curl' resolves to prone_leg_curl: they are the same movement and
// were merged. The programme names its rows, so the alias is what keeps the
// Lower A row resolving after the duplicate entry was removed.
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
  ['Lying Leg Curl', 'prone_leg_curl'],
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
  // Chest 9->6 direct and Triceps 2->5 is assisted_dip's three sets moving, on
  // Raed's instruction that the dip he performs is close-grip and therefore a
  // triceps movement. It is a better distribution as well: 2 direct triceps sets
  // was the thinnest number in the whole ledger.
  assert.deepEqual(catalogue.get('Leg Press Toe Press')?.primary_muscle, 'calves');
  assert.deepEqual(catalogue.get('Machine Crunch')?.video_records, []);
  console.log('PHASE5_CATALOGUE_CROSSWALK_PASSED');
});

test('Phase 5 programme is an Upper/Lower history-driven four-session rotation, and the mesocycle is complete', () => {
  const programme = rawData.PROGRAMME;
  assert.equal(programme.id, 'upper_lower');
  assert.deepEqual(Array.from(programme.rotation_order), ['upper_a', 'lower_a', 'upper_b', 'lower_b']);
  assert.deepEqual(Array.from(programme.weekly_layout), ['upper_a', 'lower_a', 'rest', 'upper_b', 'lower_b', 'rest', 'rest']);
  // Was `blocks.length === 2`, which pinned the programme at eight weeks and so
  // certified the very gap it should have caught: the week clock ran out, week 12
  // was unreachable, and the backstop deload that research/06 §7.2 mandates could
  // never fire. Assert the SHAPE a mesocycle must have instead of a count.
  const blocks = programme.blocks;
  assert.ok(blocks.length >= 2, 'a programme needs at least two blocks');
  // Weeks must be contiguous from 1 with no gap and no overlap, or a week maps
  // to no block and resolveProgrammeBlock silently falls back to the last one.
  const spans = blocks.map((b) => [b.week_start, b.week_end]).sort((a, b) => a[0] - b[0]);
  assert.equal(spans[0][0], 1, 'the first block must start at week 1');
  spans.forEach(([start, end], i) => {
    assert.ok(end >= start, `block ${i} ends before it starts`);
    if (i) assert.equal(start, spans[i - 1][1] + 1, `a gap or overlap before week ${start}`);
  });
  // The deload is not optional: research/06 §7.2 makes it the week-12 backstop.
  const deload = blocks.find((b) => b.deload);
  assert.ok(deload, 'the mesocycle must contain a deload block');
  assert.equal(deload.week_end, 12, 'the backstop deload is week 12');
  for (const session of deload.sessions) {
    for (const row of session.exercises) {
      const worked = blocks.find((b) => b.id === 'B').sessions
        .find((x) => x.id === session.id).exercises.find((x) => x.order === row.order);
      assert.ok(row.work_sets < worked.work_sets,
        `deload ${session.id}/${row.exercise_id} must cut at least one working set`);
      assert.ok(row.rpe_set1 <= worked.rpe_set1,
        `deload ${session.id}/${row.exercise_id} must not ask for more effort than the block it follows`);
    }
  }

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

test('Phase 5 volume taxonomy fails loudly for a muscle outside its tracked map', () => {
  const unmappedExercise = {
    id: 'phase5_unmapped_traps',
    name: 'Phase 5 unmapped traps exercise',
    name_ar: '',
    primary: ['traps'],
    secondary: [],
    pattern: 'isolation_pull',
    alternatives: [],
  };
  const catalogue = loadCatalogue([...rawData.EXERCISES, unmappedExercise]);
  const snapshot = {
    user_key: 'phase5-taxonomy',
    sets: [{
      id: 'phase5-taxonomy-set',
      user_key: 'phase5-taxonomy',
      exercise_id: unmappedExercise.id,
      kind: 'working',
      valid: true,
      completed_at: '2026-08-19T12:00:00.000Z',
    }],
  };
  let failure = null;
  try {
    weeklyVolume('phase5-taxonomy', '2026-W34', {
      snapshot,
      catalogue,
      muscleTaxonomy: rawData.VOLUME_MUSCLE_TAXONOMY,
    });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof Error, 'an unmapped taxonomy muscle must throw');
  assert.match(failure.message, /Volume invariant failed: volume taxonomy has no mapping for muscle "traps"/);
  console.log(`PHASE5_VOLUME_TAXONOMY_FAILURE_PASSED ${failure.message}`);
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

test('Phase 5 real catalogue re-derives the anatomy-corrected weekly volume ledger and D4 floor', () => {
  const catalogue = loadCatalogue(rawData.EXERCISES);
  const programme = resolveProgrammeBlock(rawData.PROGRAMME, { currentWeek: 1 });
  const volume = weeklyVolume('phase5-ledger', '2026-W34', {
    snapshot: realProgrammeWeek(programme),
    catalogue,
    muscleTaxonomy: rawData.VOLUME_MUSCLE_TAXONOMY,
  });
  const fractional = volume.fractional.total_credits;
  const ordinary = volume.ordinary.total_credits;
  const measured = {
    direct: volume.fractional.working_set_count,
    indirect: ordinary - volume.fractional.working_set_count,
    fractional,
    ordinary,
    conversion: Number((ordinary / fractional).toFixed(4)),
    below_floor: Object.entries(volume.fractional.by_muscle)
      .filter(([, sets]) => sets < 4)
      .map(([muscle, sets]) => `${muscle}:${sets}`)
      .sort(),
  };
  const perMuscle = Object.fromEntries(Object.entries(volume.fractional.by_muscle)
    .map(([muscle, fractionalSets]) => {
      const ordinarySets = volume.ordinary.by_muscle[muscle] || 0;
      return [muscle, {
        direct: (fractionalSets * 2) - ordinarySets,
        indirect: (ordinarySets - fractionalSets) * 2,
      }];
    }));
  console.log(`PHASE5_LEDGER_MEASURED ${JSON.stringify(measured)}`);
  console.log(`PHASE5_LEDGER_PER_MUSCLE ${JSON.stringify(perMuscle)}`);
  // Locked correction: PHASE5-SPEC.md §2.1b. The prior `research/20` §8.5
  // Glutes row omitted one anatomically meaningful indirect credit (the RDL).
  assert.deepEqual(measured, {
    direct: 75,
    indirect: 86,
    fractional: 118,
    ordinary: 161,
    conversion: 1.3644,
    below_floor: [],
  });
  assert.deepEqual(perMuscle, {
    Chest: { direct: 6, indirect: 6 },
    Lats: { direct: 6, indirect: 6 },
    'Mid-back': { direct: 6, indirect: 8 },
    'Front delts': { direct: 3, indirect: 9 },
    'Side delts': { direct: 6, indirect: 3 },
    'Rear delts': { direct: 2, indirect: 12 },
    Biceps: { direct: 5, indirect: 12 },
    Triceps: { direct: 5, indirect: 9 },
    Quads: { direct: 12, indirect: 0 },
    Hamstrings: { direct: 9, indirect: 9 },
    Glutes: { direct: 3, indirect: 12 },
    Calves: { direct: 6, indirect: 0 },
    Abs: { direct: 6, indirect: 0 },
  });
  console.log('PHASE5_LEDGER_REDERIVED');
});

test('the programme clock advances with logged sessions, so Block B is reachable', async () => {
  // state.current_week was initialised to 1 and assigned NOWHERE, so the
  // resolver picked Block A forever and Block B — weeks 5-8, with its own arm
  // work (EZ Bar Curl, Overhead Rope, Machine Lateral Raise) — could never be
  // reached. Raed could train for months and never see half his own programme.
  //
  // The week is derived from history now, four sessions to a week, which is the
  // programme's own frequency and the same history-driven rule the session
  // rotation already uses. Nothing to forget to advance.
  const programme = rawData.PROGRAMME;
  const lastWeek = Math.max(...programme.blocks.map((block) => block.week_end));
  const weekFor = (sessions) => Math.min(lastWeek, 1 + Math.floor(sessions / 4));
  const blockFor = (week) => programme.blocks.find((block) => week >= block.week_start && week <= block.week_end);

  assert.equal(weekFor(0), 1);
  assert.equal(blockFor(weekFor(0)).id, 'A');
  assert.equal(blockFor(weekFor(12)).id, 'A', 'week 4 is still the first block');
  assert.equal(blockFor(weekFor(16)).id, 'B', 'sixteen sessions must reach Block B');
  // And it stops at the end of the programme rather than running away.
  assert.equal(weekFor(400), lastWeek);

  // The two blocks must actually differ, or reaching B would be pointless.
  const armsA = programme.blocks[0].sessions.find((s) => s.id === 'upper_a').exercises.map((e) => e.exercise_id);
  const armsB = programme.blocks[1].sessions.find((s) => s.id === 'upper_a').exercises.map((e) => e.exercise_id);
  assert.notDeepEqual(armsA, armsB, 'Block B is supposed to change the exercises');
});

// Added 2026-09-04, after Raed asked whether the programme advances on its own
// for the next twelve months or whether he has to come back and set it up.
//
// It did not advance. derivedWeek() was `Math.min(lastWeek, ...)`, the programme
// ended at week 8, and the clock froze there — Block B on a loop, for ever, with
// no deload. research/06 §7.2 mandates a week-12 backstop deload that the code
// could therefore never reach.
test('the programme carries itself: a repeating twelve-week mesocycle with a deload every cycle', () => {
  const programme = rawData.PROGRAMME;
  const cycleLength = Math.max(...programme.blocks.map((b) => b.week_end));
  assert.equal(cycleLength, 12, 'a mesocycle is twelve weeks');

  // The same arithmetic app.js uses: weeks elapsed, wrapped by cycle length.
  const week = (sessions) => 1 + (Math.floor(sessions / 4) % cycleLength);
  const cycle = (sessions) => 1 + Math.floor(Math.floor(sessions / 4) / cycleLength);
  const blockFor = (w) => programme.blocks.find((b) => w >= b.week_start && w <= b.week_end);

  // Every week of a cycle resolves to exactly one block — no week falls through.
  for (let w = 1; w <= cycleLength; w++) {
    assert.ok(blockFor(w), `week ${w} maps to no block`);
  }

  // A full year at four sessions a week must keep moving, and must deload
  // repeatedly rather than once or never.
  const deloadWeeks = new Set();
  const blocksSeen = new Set();
  for (let done = 0; done <= 208; done += 4) {
    const w = week(done);
    const b = blockFor(w);
    blocksSeen.add(b.id);
    if (b.deload) deloadWeeks.add(`${cycle(done)}:${w}`);
  }
  assert.ok(blocksSeen.has('A') && blocksSeen.has('B'), 'a year must revisit the early blocks');
  assert.ok(deloadWeeks.size >= 4,
    `a year at 4 sessions/week must contain at least four deload weeks, found ${deloadWeeks.size}`);

  // And it must never stick: the week after a deload is week 1 of a new cycle.
  const atDeload = 44;                       // 11 weeks done -> week 12
  assert.equal(week(atDeload), 12);
  assert.ok(blockFor(week(atDeload)).deload);
  assert.equal(week(atDeload + 4), 1, 'the cycle restarts instead of freezing on the deload');
  assert.equal(cycle(atDeload + 4), cycle(atDeload) + 1);
  console.log('PROGRAMME_MESOCYCLE_REPEATS_PASSED');
});

// Added 2026-09-05 from the Codex review, all three verified before fixing.
test('the programme clock and scoped swaps survive a repeating cycle and a legacy import', async () => {
  // 1. Only sessions from THIS programme move the clock. `state.history.length`
  //    counted the v15 sessions the migration deliberately preserves, so a
  //    restore or import dropped him into an arbitrary week — possibly a deload
  //    he had not earned.
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const counter = app.match(/function completedSessionCount\(\)[\s\S]*?\n\}/)?.[0];
  assert.ok(counter, 'completedSessionCount must exist');
  assert.ok(/rotation_order/.test(counter),
    'the clock must filter history by the current rotation, not count every row');

  // 2. A scoped substitution must record its CYCLE. Weeks and blocks repeat now,
  //    so a week-5 swap in cycle 1 matched week 5 of cycle 2 and a block-B swap
  //    came back in every future block B.
  const record = app.match(/function recordSubstitution\([\s\S]*?\n\}/)?.[0];
  assert.ok(/cycle:/.test(record), 'a scoped substitution must store the cycle it belongs to');
  const matcher = app.match(/function scopedReplacementFor\([\s\S]*?\n\}/)?.[0];
  assert.ok(/derivedCycle\(\)/.test(matcher), 'the matcher must compare cycles, not only week or block numbers');

  // 3. Dates are stamped in HIS timezone. toISOString() is UTC, and Riyadh is
  //    UTC+3, so between local midnight and 03:00 every workout, PR, bodyweight
  //    entry and export was dated YESTERDAY. Proven live at 01:37.
  assert.ok(/const localISODate =/.test(app), 'a local-date helper must exist');
  assert.ok(!/const todayISO = \(\) => new Date\(\)\.toISOString\(\)/.test(app),
    'todayISO must not stamp UTC');
  const strip = app.match(/function buildWeekStrip\(\)[\s\S]*?const iso = [^\n]*/)?.[0] || '';
  assert.ok(/localISODate/.test(strip),
    'the week strip must not convert its local Saturday boundary back through UTC');
  console.log('CLOCK_SWAP_DATE_INVARIANTS_PASSED');
});
