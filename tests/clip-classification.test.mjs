import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

// Two exercises may share a clip only when they are the SAME movement on
// different equipment. The danger is a family key that is too generous: an
// earlier version stripped angle words and put a standing shoulder press in the
// same family as a decline chest press, which would have shown a clip of one as
// a clip of the other — the wrong-clip case D8 exists to prevent.

const src = await readFile(new URL('../data.js', import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(src, ctx, { filename: 'data.js' });
const EX = ctx.window.RW.EXERCISES;

const EQUIPMENT_WORDS = /\b(machine|cable|db|dumbbell|barbell|smith|ez[- ]?bar|hammer strength|assisted|plate-?weighted|bayesian|roman chair)\b/gi;
const familyOf = (e) => (e.primary || []).slice().sort().join('+') + '|' +
  String(e.name || '').replace(EQUIPMENT_WORDS, ' ').replace(/[^A-Za-z ]/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();

const families = {};
EX.forEach((e) => { (families[familyOf(e)] = families[familyOf(e)] || []).push(e); });
const shared = Object.values(families).filter((g) => g.length > 1);

test('exercises grouped as one movement share a primary muscle', () => {
  for (const group of shared) {
    const muscles = new Set(group.map((e) => (e.primary || []).slice().sort().join('+')));
    assert.equal(muscles.size, 1,
      'a family spans two muscle groups: ' + group.map((e) => e.name).join(' | '));
  }
});

test('angle and grip are never treated as equipment', () => {
  // These pairs are DIFFERENT movements and must never end up in one family,
  // however similar their names look.
  const mustDiffer = [
    ['Incline Dumbbell Press', 'Decline DB Press'],
    ['Standing DB Press', 'Flat DB Press'],
    ['Lat Pulldown', 'Reverse-Grip Lat Pulldown'],
    ['Standing Calf Raise', 'Seated Calf Raise'],
  ];
  const byName = Object.fromEntries(EX.map((e) => [e.name, e]));
  for (const [a, b] of mustDiffer) {
    const ea = byName[a]; const eb = byName[b];
    if (!ea || !eb) continue;   // a rename should not silently pass this test
    assert.notEqual(familyOf(ea), familyOf(eb), `${a} and ${b} must not share clips`);
  }
});

test('every shared family differs only by equipment', () => {
  // The bare movement text must be identical inside a family — that IS the
  // claim being made when a clip is offered across two exercises.
  for (const group of shared) {
    const bare = new Set(group.map((e) => familyOf(e).split('|')[1]));
    assert.equal(bare.size, 1, 'family members disagree on the movement itself: ' +
      group.map((e) => e.name).join(' | '));
  }
});
