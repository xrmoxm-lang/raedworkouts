import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { text } from '../locale.js';

// Raed reported «فشلت المزامنة، تم نسخ محليًا» and the message could not tell
// him why. The cause was that his server had become unreachable from outside
// his tailnet — but an unreachable server, a refused request and a server error
// all produced the same sentence, and the status line beside it was hardcoded
// English on an Arabic screen. These tests pin both halves of that fix.

const STATUS_KEYS = [
  'sync_ok',
  'sync_pulled',
  'sync_connected',
  'sync_merged_ok',
  'sync_pending',
  'sync_pending_offline',
  'sync_merged_pending',
  'sync_unreachable',
  'sync_rejected',
  'sync_server_error',
  'sync_failed_generic',
];

test('every sync status is translated to Arabic', () => {
  for (const key of STATUS_KEYS) {
    const value = text(key, 'ar');
    // text() falls back to the key itself when it is missing, so getting the
    // key back is exactly the failure this catches.
    assert.notEqual(value, key, `${key} has no translation`);
    assert.match(value, /[؀-ۿ]/, `${key} is not Arabic: ${value}`);
  }
});

test('no two sync statuses read the same', () => {
  const values = STATUS_KEYS.map((key) => text(key, 'ar'));
  assert.equal(new Set(values).size, values.length,
    'two statuses are indistinguishable on screen: ' + values.join(' | '));
});

test('the sync status line holds no hardcoded English', () => {
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

  // Extract each call with balanced parentheses. A lazy [^)]* stops at the
  // first ')' — which lands inside t('…') — and then reads the locale key
  // itself as English prose.
  const calls = [];
  for (let i = source.indexOf('setSyncStatus('); i !== -1; i = source.indexOf('setSyncStatus(', i + 1)) {
    let depth = 0;
    for (let j = i + 'setSyncStatus'.length; j < source.length; j++) {
      if (source[j] === '(') depth++;
      else if (source[j] === ')' && --depth === 0) { calls.push(source.slice(i, j + 1)); break; }
    }
  }
  assert.ok(calls.length > 0, 'setSyncStatus calls not found — has it been renamed?');

  for (const call of calls) {
    // Anything routed through t() or a helper is translated by definition;
    // what matters is bare English left sitting in the call.
    const bare = call.replace(/t\(\s*'[^']*'\s*\)/g, '');
    for (const literal of bare.match(/'[^']*'/g) || []) {
      const value = literal.slice(1, -1);
      if (['ok', 'err', 'off'].includes(value)) continue; // the kind argument
      assert.ok(!/[A-Za-z]{3}/.test(value),
        `hardcoded English in the sync status: ${call}`);
    }
  }
});

test('sync failures are told apart by cause, not lumped together', () => {
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function syncFailureReason'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  for (const key of ['sync_pending_offline', 'sync_rejected', 'sync_server_error', 'sync_unreachable']) {
    assert.ok(body.includes(key), `syncFailureReason no longer distinguishes ${key}`);
  }
  // The status must come off the error object. Re-parsing it out of the message
  // string was fragile: a three-digit number in the server's body could be read
  // as the HTTP status.
  assert.ok(/failure\.status = res\.status/.test(source),
    'the HTTP status is no longer attached to the sync error');
});

// A wider net than the sync line alone. toast() localises its argument by
// looking the English up in LOCALE, which works for a plain literal — but a
// concatenation or a template literal is joined *before* it gets there, so it
// can never match an entry and always reaches Raed in English. Two of these
// were live: the connection-failure toast, and the announcement when he reaches
// a new block, which is a milestone he sees once a month at most.
test('no toast is assembled before it can be localised', () => {
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const offenders = [];

  for (const m of source.matchAll(/toast\(\s*(['"])((?:[^'"\\]|\\.)*)\1\s*\+/g)) {
    offenders.push(`concatenated: "${m[2]}"`);
  }
  for (const m of source.matchAll(/toast\(\s*`([^`]*)`/g)) {
    if (/[A-Za-z]{3}/.test(m[1])) offenders.push(`template: "${m[1].slice(0, 60)}"`);
  }
  assert.deepEqual(offenders, [],
    'these reach the screen in English — build them with tf(key, values) instead');
});

test('every plain toast literal has an Arabic translation', async () => {
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const missing = [];
  for (const m of source.matchAll(/toast\(\s*'((?:[^'\\]|\\.)+)'/g)) {
    const english = m[1].replace(/\\'/g, "'");
    if (!/[A-Za-z]{3}/.test(english)) continue;
    // text() returns its input unchanged when there is no entry, so a string
    // that comes back identical is one Raed reads in English.
    if (text(english, 'ar') === english) missing.push(english);
  }
  assert.deepEqual(missing, [], 'untranslated toasts');
});
