import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
