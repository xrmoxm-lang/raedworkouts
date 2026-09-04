import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

async function legacyData() {
  const source = await readFile(new URL('../data.js', import.meta.url), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'data.js' });
  return context.window.RW;
}

const rawData = await legacyData();
const byId = Object.fromEntries(rawData.EXERCISES.map((exercise) => [exercise.id, exercise]));

// Extracted from the link ANNOTATIONS of PDFs Raed owns, then verified a second
// time by reading the words under each link rectangle and confirming they name
// the same movement. Not one of these came from a web search or a reconstructed
// URL — D8: "كل شيء يعني مرة متأكد منه", a blank beats a wrong video.
const SOURCE_LINKED = {
  chest_press_machine: 'https://youtu.be/k1S_Any3NIA?t=240',
  hip_thrust: 'https://youtu.be/xDmFkJxPzeM?t=97',
  hanging_leg_raise: 'https://youtu.be/2RrGnjxSsiA?t=247',
  ez_bar_curl: 'https://www.youtube.com/watch?v=Dd0t5UOCEUc',
  machine_lateral_raise: 'https://youtu.be/-9QsrJ542ao',
  bicycle_crunch: 'https://youtu.be/OXs4DCS8Ei8?si=0WCCbNRrf2eaWePi',
  leg_press_toe_press: 'https://youtu.be/VJ_9xii47Sk',
};

test('D8: every source-linked Nippard demo is carried verbatim, timestamp included', () => {
  for (const [exerciseId, url] of Object.entries(SOURCE_LINKED)) {
    const exercise = byId[exerciseId];
    assert.ok(exercise, `${exerciseId} left the catalogue; its verified video has nowhere to live`);
    assert.equal(exercise.jeff_nippard, url, `${exerciseId} no longer carries its source-linked demo`);
  }
});

test('a timestamp is part of the link, because one video holds several exercises', () => {
  // 2RrGnjxSsiA is a single Nippard video covering more than one ab movement.
  // The PPL PDF links it at t=124 for Cable Crunch; the Essentials PDF links the
  // SAME video at t=247 for the Hanging Leg Raise. Drop the timestamp and the
  // exercise silently becomes the wrong one — a wrong video, which D8 forbids.
  assert.match(byId.hanging_leg_raise.jeff_nippard, /[?&]t=247\b/);
  assert.notEqual(byId.hanging_leg_raise.jeff_nippard, 'https://youtu.be/2RrGnjxSsiA');
});

test('a Nippard link is a video or an honest search, never a broken half-link', () => {
  const programmed = new Set(rawData.PROGRAMME.blocks
    .flatMap((block) => block.sessions.flatMap((session) => session.exercises.map((item) => item.exercise_id))));

  for (const exerciseId of programmed) {
    const url = byId[exerciseId]?.jeff_nippard || '';
    if (!url) continue; // A blank is allowed and is the honest state for an unmatched exercise.
    const isSearch = url.includes('/results?search_query=');
    const isVideo = /^https:\/\/(www\.youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{11}/.test(url);
    assert.ok(isSearch || isVideo, `${exerciseId} has a Nippard link that is neither a video nor a search: ${url}`);
  }
});

test('the close-grip dip video now matches the exercise it is attached to', () => {
  // This test used to assert the OPPOSITE. The PDF anchor reads "Close-Grip
  // Assisted Dip", which loads triceps, and the catalogue entry was chest —
  // so the clip was withheld and the mismatch left for Raed. He then ruled the
  // exercise itself is triceps ("خليه لترايسبس ما هو للصدر"), which removes the
  // mismatch: the clip and the movement are now the same thing.
  assert.equal(byId.assisted_dip.primary[0], 'triceps');
  assert.ok(String(byId.assisted_dip.jeff_nippard).includes('mpcPTUAhfto'));
});

test('clips confirmed removed from YouTube are retired, not silently left in place', () => {
  // Three legacy clips 404'd on BOTH the oEmbed endpoint and their thumbnail on
  // 2026-09-01, while a control clip returned 200 on both — they are gone from
  // YouTube. They rendered a broken tile and opened nothing, which is the same
  // harm as a wrong video: Raed taps it mid-set and gets no demonstration.
  //
  // They were RETIRED, not deleted. `retired_videos` keeps the record so the
  // removal is visible and reversible, and no rule about not deleting a working
  // clip is bent to cover a clip that stopped working.
  const RETIRED = ['dwb-ccqK1WE', 'n87rX0fNkBQ', 'vCOlZ-zk80o'];
  for (const exercise of rawData.EXERCISES) {
    const shown = [...(exercise.mohannad || []), ...(exercise.extra || []), exercise.jeff_nippard || ''].join(' ');
    for (const id of RETIRED) {
      assert.ok(!shown.includes(id), `${exercise.id} still shows the retired clip ${id}`);
    }
  }
  const keepers = rawData.EXERCISES.filter((exercise) => exercise.retired_videos);
  assert.equal(keepers.length, 3, 'the record of what was retired must survive');
  // Each of the three keeps a working clip, which is why retiring cost nothing.
  for (const exercise of keepers) {
    const remaining = (exercise.mohannad || []).length + (exercise.extra || []).length + (exercise.jeff_nippard ? 1 : 0);
    assert.ok(remaining > 0, `${exercise.id} lost its last clip when the dead one was retired`);
  }
});

// Added 2026-09-04. locale.js had 8 duplicate keys; in three of them the two
// definitions carried DIFFERENT Arabic, so the earlier translation was silently
// dead and a later one won — the kind of thing that only shows up on screen.
// And t('saved'), called in three places, was never defined at all, so it
// rendered the literal English word "saved" on an Arabic-only screen.
test('locale.js defines each key exactly once, and defines everything app.js asks for', async () => {
  const src = await readFile(new URL('../locale.js', import.meta.url), 'utf8');
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const { LOCALE } = await import('../locale.js');

  const seen = new Map();
  const duplicates = [];
  for (const m of src.matchAll(/^ {2}([a-zA-Z_]\w*): (?:pair|programmeTiedPair)\(/gm)) {
    const line = src.slice(0, m.index).split('\n').length;
    if (seen.has(m[1])) duplicates.push(`${m[1]} (lines ${seen.get(m[1])} and ${line})`);
    else seen.set(m[1], line);
  }
  assert.deepEqual(duplicates, [], 'a duplicate key silently discards the earlier translation');

  const referenced = new Set();
  for (const m of app.matchAll(/\b(?:t|tf)\(\s*'([a-zA-Z_]\w*)'/g)) referenced.add(m[1]);
  // t('equip_' + kind) — a prefix, resolved at runtime, not a key itself.
  referenced.delete('equip_');
  const missing = [...referenced].filter((key) => !LOCALE[key]);
  assert.deepEqual(missing, [], 'a key with no entry renders its own name in English');
});

// Added 2026-09-04. This codebase's signature failure is code that LOOKS live
// and is not: superset_group sat in data.js read by nothing, updateRunnerSet
// held the "editing clears the invalid flag" rule and was called by nothing, and
// a whole screen once vanished behind a stray return with 32/32 tests green.
//
// This does not delete the twelve dead functions that exist today — removing
// them is Raed's call, and none of them changes behaviour. It fences them in.
// The suite fails if a THIRTEENTH appears, which is the moment the next
// superset_group is created and the only moment it is cheap to notice.
const KNOWN_DEAD_FUNCTIONS = new Set([
  // Superseded by the inline handlers on the v15-style card that shipped in
  // Phase 6. The card carries its own copies of this logic.
  'toggleRunnerSet', 'addRunnerSet', 'resetCurrentRunnerSet', 'moveRunnerExercise',
  'completeRunnerWarmup', 'runnerLongPress',
  // The session preview was retired 2026-08-28 at Raed's request; the plan is
  // already on home.
  'previewedSession', 'discardActiveSessionFromHome',
  // Help moved into the collapsed Settings groups in Phase 6 to free its tab for
  // the coach; router() redirects 'help' to 'settings'. #page-help in index.html
  // is the matching leftover.
  'renderHelp',
  // Helpers whose callers were replaced by domain/runner-session.js equivalents.
  'isPRSet', 'isLoggableWeight', 'currentPlaylistPlatform',
]);

test('no NEW function is left defined but never called', async () => {
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const defined = [...app.matchAll(/^(?:async )?function ([A-Za-z_]\w*)\s*\(/gm)].map((m) => m[1]);
  const dead = defined.filter((name) => {
    const uses = app.match(new RegExp(`\\b${name}\\b`, 'g')) || [];
    return uses.length <= 1; // its own definition and nothing else
  });
  const unexpected = dead.filter((name) => !KNOWN_DEAD_FUNCTIONS.has(name));
  assert.deepEqual(unexpected, [],
    'a function nothing calls is how this app loses features silently — wire it up or delete it');

  // And the fence must shrink, never quietly widen: if one of these is removed
  // or revived, take it out of the list rather than leaving a lie behind.
  const stale = [...KNOWN_DEAD_FUNCTIONS].filter((name) => !dead.includes(name));
  assert.deepEqual(stale, [], 'these are no longer dead — remove them from KNOWN_DEAD_FUNCTIONS');
});

// Added 2026-09-04. The programme data itself audited clean — every exercise id
// and alternative resolves, orders are unique and contiguous, and all four
// supersets are well formed. This keeps it that way, because the data is edited
// by hand and a broken pair is invisible until mid-workout.
//
// The A1/A2 convention matters here: the LETTER is the group and the DIGIT is
// the position. Matching on exact equality found one member every time, which is
// how the superset note once shipped never having rendered at all.
test('the programme data is referentially sound and its supersets are well formed', async () => {
  const source = await readFile(new URL('../data.js', import.meta.url), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const RW = sandbox.window.RW;

  const ids = new Set(RW.EXERCISES.map((e) => e.id));
  const sessions = (RW.PROGRAMME_UPPER_LOWER || RW.PROGRAMME);
  const rowsOf = (s) => (Array.isArray(s) ? s : s.exercises);

  for (const [sid, session] of Object.entries(sessions.sessions || sessions)) {
    const rows = rowsOf(session);
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      if (row.exercise_id) {
        assert.ok(ids.has(row.exercise_id), `${sid}: exercise "${row.exercise_id}" is not in the catalogue`);
      }
      for (const key of ['sub1', 'sub2']) {
        if (row[key]) assert.ok(ids.has(row[key]), `${sid}/${row.exercise_id}: alternative "${row[key]}" does not exist`);
      }
    }

    const orders = rows.map((r) => r.order).filter((o) => o != null).sort((a, b) => a - b);
    assert.equal(new Set(orders).size, orders.length, `${sid}: duplicate order values`);
    orders.forEach((o, i) => {
      if (i) assert.equal(o, orders[i - 1] + 1, `${sid}: a gap in the exercise order (${orders.join(',')})`);
    });

    const groups = {};
    for (const row of rows) {
      const m = String(row.superset_group || '').match(/^([A-Z])(\d)$/);
      if (m) (groups[m[1]] ||= []).push({ row, pos: Number(m[2]) });
    }
    for (const [letter, members] of Object.entries(groups)) {
      members.sort((a, b) => a.pos - b.pos);
      assert.equal(members.length, 2, `${sid}: superset ${letter} needs exactly two halves`);
      const [first, second] = members;
      assert.equal(second.row.order, first.row.order + 1, `${sid}: superset ${letter} halves are not adjacent`);
      assert.equal(Number(first.row.rest_min), 0,
        `${sid}: the FIRST half of superset ${letter} must prescribe 0 rest — that is what makes it a superset`);
    }
  }
});

// Added 2026-09-04, after finding seven spec files that navigated to the app
// without blocking the real sync host.
//
// app.js ships Raed's actual SYNC_KEY and points at his actual server, so a test
// that opens the app and does something is doing it to his live cloud row —
// and one of those seven, history-delete.spec.mjs, deletes sessions. Nothing in
// a test run may ever reach his data.
test('every browser test blocks the live sync host before it opens the app', async () => {
  const dir = new URL('./', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.spec.mjs'));
  const unguarded = [];
  for (const file of files) {
    const src = await readFile(new URL(file, dir), 'utf8');
    if (!/page\.goto\(/.test(src)) continue;
    // Either it aborts the host itself, or it calls a helper that does.
    const guards = /raed-hp\.tail53bd35\.ts\.net/.test(src);
    if (!guards) unguarded.push(file);
  }
  assert.deepEqual(unguarded, [],
    'a test that opens the app without blocking the sync host writes to his real cloud data');
});
