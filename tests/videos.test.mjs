import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

import { appSource, appSourceFiles } from '../scripts/app-source.mjs';

// app.js + core/**/*.js + ui/**/*.js. The client is no longer one file, and a
// gate that still read app.js alone would be checking the boot file only.
const APP_SOURCE = await appSource();

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
  const app = await appSource();
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
  // Emptied 2026-09-05. All twelve were removed at Raed's word — «إذا ما تستاهل
  // خلاص نشيلها». Each was genuinely superseded, and moveRunnerExercise was
  // checked by hand first because he had just asked for exercise reordering:
  // it navigated the CURSOR between exercises and was replaced by Prev/Next, so
  // it is not the feature he wants.
  //
  // The test below still runs. Its job now is to stop the NEXT one appearing.
]);

test('no NEW function is left defined but never called', async () => {
  const app = await appSource();
  // `export function` counts too, or the split would have made this vacuous for
  // every function a screen imports.
  const defined = [...app.matchAll(/^(?:export )?(?:async )?function ([A-Za-z_]\w*)\s*\(/gm)].map((m) => m[1]);
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
    // Tightened 2026-09-05. The check used to be "does the hostname appear
    // anywhere in this file", and coach.spec.mjs passed it by naming the host in
    // a constant while routing ONE path on it. Everything else — /state, the
    // pushes and the pulls — reached Raed's live server, and it showed: his real
    // cloud row had a test fixture's coach answer and a coach_recent list of
    // «السؤال الأول»/«السؤال الثاني» in it.
    //
    // A gate that passes on a mention rather than on the behaviour is worse than
    // no gate: it certifies the bug. What actually protects his data is a route
    // covering the WHOLE host, so require exactly that — the sync port, which is
    // where state is written.
    //
    // Matching only a literal URL was too strict and flagged deploy-safe.spec.mjs,
    // which is correctly guarded through a `const syncOrigin = ...` and a
    // template literal. So resolve those bindings first, then require a
    // host-wide route through the literal or through one of them.
    const SYNC_ORIGIN = 'https://raed-hp.tail53bd35.ts.net:8443';
    const aliases = [...src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"`]https:\/\/raed-hp\.tail53bd35\.ts\.net:8443['"`]/g)]
      .map((m) => m[1]);
    const patterns = [
      new RegExp(`page\\.route\\(\\s*['"\`]${SYNC_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/\\*\\*['"\`]`),
      ...aliases.map((name) => new RegExp(`page\\.route\\(\\s*\`\\$\\{${name}\\}\\/\\*\\*\``)),
    ];
    if (!patterns.some((re) => re.test(src))) unguarded.push(file);
  }
  assert.deepEqual(unguarded, [],
    'a test that opens the app without a host-wide block on the sync port writes to his real cloud data');
});


// Added 2026-09-05. Three native dialogs survived an earlier sweep because that
// scan matched `confirm('...')` — a QUOTED LITERAL after the paren — and these
// called `confirm(t('key'))` and a template literal. An installed PWA shell can
// suppress a native dialog, which turns the tap into nothing at all, and they
// are unstyled and English. confirmAction() is the app's own sheet.
test('no native confirm/prompt/alert survives anywhere reachable', () => {
  const src = APP_SOURCE;
  const KNOWN_DEAD = ['discardActiveSessionFromHome'];
  const offenders = [];
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (!/(^|[^.\w])(confirm|prompt|alert)\s*\(/.test(line)) return;
    if (/confirmAction/.test(line)) return;
    if (/^\s*(\/\/|\*)/.test(line)) return;          // a comment about them
    // Allow the one inside a function the dead-code fence already tracks.
    const before = lines.slice(Math.max(0, i - 25), i).join('\n');
    if (KNOWN_DEAD.some((name) => before.includes(`function ${name}(`))) return;
    offenders.push(`${i + 1}: ${line.trim().slice(0, 90)}`);
  });
  assert.deepEqual(offenders, [],
    'a PWA shell can suppress a native dialog, so the tap silently does nothing — use confirmAction()');
});

// Added 2026-09-05. A hidden clip was remembered by its POSITION in the list —
// 'mohannad_0', 'mohannad_1' — and this file's own «clips confirmed removed from
// YouTube are retired» test is the proof that the list is not stable.
//
// Measured on incline_chest_press before the fix: hide the second clip
// (wMksQXD01K0), retire the first, and 'mohannad_1' names o0Ud3RU59hw instead.
// A clip he deliberately hid comes back, a different one vanishes, silently.
test('a hidden clip is remembered by which clip it is, not by where it sat', async () => {
  const src = await appSource();

  // The stored key is derived from the clip's own identity.
  assert.match(src, /const videoIdentity = \(video\) =>[^\n]*video\.id[^\n]*'yt:'/,
    'the hide key must come from the clip id, not its index');

  // Every visibility call goes through it. A single surviving `v.key` here is
  // the whole bug back again.
  const visibilityCalls = [...src.matchAll(/(?:isVideoHidden|toggleVideoVisibility)\([^)]*\)/g)].map((m) => m[0]);
  assert.ok(visibilityCalls.length >= 3, `expected the three visibility call sites, saw ${visibilityCalls.length}`);
  for (const call of visibilityCalls) {
    if (/^(?:isVideoHidden|toggleVideoVisibility)\((?:exerciseId|key)/.test(call)) continue; // the definitions
    assert.ok(/videoIdentity\(/.test(call) || /\bkey\b\s*\)$/.test(call),
      `visibility keyed by position again: ${call}`);
  }

  // And the choices already stored get converted once, rather than silently
  // meaning something different after the next retirement.
  assert.match(src, /function migrateVideoHiddenKeys\(\)/);
  assert.match(src, /migrateVideoHiddenKeys\(\);/);
});

// Added 2026-09-06. The coach access key shipped inside app.js — every browser
// that opened the site received a credential for a service that spends real
// money per question. A $25/month server ceiling bounds the damage; not shipping
// the secret is the actual fix. api/coach.js holds it now.
//
// Asserted at source level because this is the kind of thing a well-meaning
// "restore the direct call, the proxy is slow" change puts straight back.
test('no service credential is shipped to the browser', async () => {
  const app = await appSource();

  // The literal that used to be here, and any sibling of it. Long opaque
  // base64-ish runs in an assignment are what a key looks like.
  //
  // SYNC_KEY is exempt, and the exemption is the finding rather than a
  // convenience. It is a 48-character credential in public JavaScript that
  // guards his training HISTORY — a bigger prize than the books the coach key
  // guarded. Raed accepted that trade when sync was built and it is recorded in
  // the project notes, so it is not being changed quietly at the end of a long
  // session: rerouting sync means putting a proxy on the path that SAVES HIS
  // SETS, and two silent data-loss paths were found on that path this week.
  // It needs its own pass, with its own measurements. Listed for him.
  const ACCEPTED = new Set(['SYNC_KEY']);
  // Match on the VALUE's shape, not on the name containing "KEY". The first cut
  // flagged SYNC_OVERRIDE_KEY, which is the NAME of a localStorage entry
  // ('raedworkouts_sync_override') and not a secret at all. A credential here is
  // a long unbroken alphanumeric run; an identifier has separators and no
  // entropy.
  const looksLikeSecret = (value) => /^[A-Za-z0-9]{24,}$/.test(value) && /\d/.test(value);
  const assignments = [...app.matchAll(/const\s+(\w+)\s*=\s*'([^']*)'/g)];
  for (const [, name, value] of assignments) {
    if (ACCEPTED.has(name)) continue;
    assert.ok(!looksLikeSecret(value),
      `${name} looks like a credential (${value.length} chars) and app.js is public`);
  }
  // The exemption must stay honest: if SYNC_KEY ever leaves app.js, delete it
  // from ACCEPTED rather than leaving a licence behind for the next one.
  assert.match(app, /const SYNC_KEY = '/, 'SYNC_KEY moved — drop it from ACCEPTED');

  // And the coach is reached through the proxy, not the funnel directly.
  assert.match(app, /const COACH_URL = '\/api\/coach'/);
  assert.doesNotMatch(app, /fetch\([^)]*ts\.net\/coach/);
  assert.doesNotMatch(app, /'X-Coach-Key'/);

  // The proxy exists, forwards only the routes the app uses, and takes its key
  // from the environment rather than carrying one.
  const proxy = await readFile(new URL('../api/coach.js', import.meta.url), 'utf8');
  assert.match(proxy, /process\.env\.COACH_KEY/);
  assert.doesNotMatch(proxy, /oQq1nm/);
});
