// Two windows of the app open at once.
//
// Measured 2026-09-23 (390×844, one browser context, two pages, both booted as
// Raed): tab B started a session and ticked three sets; one tap on a settings
// toggle in tab A — which had been sitting on home since before B started —
// left `{"active":false,"done":0}` in `raedworkouts.Raed.state.v1`. The session
// and all three logged sets were gone from storage, and tab A then marked the
// profile dirty, so the server's fast path would have written that sessionless
// state over the cloud head too.
//
// persistLocal now reads a write counter back before it writes and merges
// instead of clobbering. These are the merge rules themselves; the browser side
// is tests/storage-integrity.spec.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  completedSetsOf, historyTombstoneFor, mergeChangedOurs, mergeHistoryTombstones, mergeLocalStates,
  reviveRestoredState, sessionKeyOf,
} from '../domain/state-merge.js';

const session = (sets, { id = 'upper_a', started = '2026-09-23T17:00:00Z' } = {}) => ({
  session_id: id,
  started_at: started,
  uid: 'u-' + id,
  exercises: {
    chest_press_machine: {
      sets: Array.from({ length: sets }, () => ({ is_warmup: false, weight: 40, reps: 10, completed: true })),
    },
  },
});

test('the tab that is training keeps its live session when an idle tab saves', () => {
  // ours = the idle tab (settings tap), theirs = what the training tab wrote.
  const idle = { history: [], active_session: null, prs: {} };
  const training = { history: [], active_session: session(3), prs: {} };
  const merged = mergeLocalStates(idle, training);
  assert.equal(completedSetsOf(merged.active_session), 3,
    'one tap in a stale tab must not delete a live session and its logged sets');
  assert.equal(mergeChangedOurs(idle, merged), true, 'and he has to be told the two were merged');
});

test('a warm-up is not evidence of work', () => {
  const warmupOnly = {
    exercises: { x: { sets: [{ is_warmup: true, completed: true }, { is_warmup: false, completed: false }] } },
  };
  assert.equal(completedSetsOf(warmupOnly), 0);
});

test('the richer copy of the same session wins, in either direction', () => {
  const ours = { active_session: session(5) };
  const theirs = { active_session: session(2) };
  assert.equal(completedSetsOf(mergeLocalStates(ours, theirs).active_session), 5);
  assert.equal(completedSetsOf(mergeLocalStates(theirs, ours).active_session), 5);
});

test('a session he deliberately finished here is not resurrected from disk', () => {
  // The same tombstone core/session.js stamps and raedsync.py honours: only the
  // session it NAMES may be dropped.
  const finished = session(4);
  const ours = {
    history: [{ ...finished, ended_at: '2026-09-23T18:00:00Z' }],
    active_session: null,
    active_cleared: { key: sessionKeyOf(finished), at: '2026-09-23T18:00:00Z' },
  };
  const theirs = { history: [], active_session: finished };
  const merged = mergeLocalStates(ours, theirs);
  assert.equal(merged.active_session, null, 'finishing must not be undone by a stale tab');
  assert.equal(merged.history.length, 1, 'and it must appear exactly once');
});

test('an unrelated session on disk survives a tombstone that names another one', () => {
  const mine = session(2, { id: 'upper_a' });
  const other = session(2, { id: 'lower_b', started: '2026-09-23T19:00:00Z' });
  const merged = mergeLocalStates(
    { history: [], active_session: null, active_cleared: { key: sessionKeyOf(mine), at: 'x' } },
    { history: [], active_session: other },
  );
  assert.equal(merged.active_session?.session_id, 'lower_b');
});

test('history is a union keyed by session identity, richer copy wins', () => {
  const partial = { ...session(2, { id: 'upper_a' }), ended_at: '2026-09-20T18:00:00Z' };
  const full = { ...session(4, { id: 'upper_a' }), ended_at: '2026-09-20T18:00:00Z' };
  const extra = { ...session(3, { id: 'lower_b', started: '2026-09-21T17:00:00Z' }), ended_at: '2026-09-21T18:00:00Z' };
  const merged = mergeLocalStates({ history: [partial] }, { history: [full, extra] });
  assert.equal(merged.history.length, 2, 'the same session must not be duplicated');
  assert.equal(completedSetsOf(merged.history.find((s) => s.session_id === 'upper_a')), 4);
  assert.ok(merged.history.some((s) => s.session_id === 'lower_b'), 'the other tab\'s session must survive');
});

test('PRs keep the higher score and the bodyweight log de-duplicates', () => {
  const merged = mergeLocalStates(
    { prs: { chest_press_machine: { score: 70 } }, bodyweight_log: [{ date: '2026-09-20', kg: 82 }] },
    { prs: { chest_press_machine: { score: 74 }, lat_pulldown: { score: 50 } },
      bodyweight_log: [{ date: '2026-09-20', kg: 82 }, { date: '2026-09-21', kg: 81.6 }] },
  );
  assert.equal(merged.prs.chest_press_machine.score, 74, 'a stale tab must not beat a real PR down');
  assert.equal(merged.prs.lat_pulldown.score, 50);
  assert.equal(merged.bodyweight_log.length, 2);
});

test('everything else belongs to the tab he just touched', () => {
  // The settings-shaped keys: this tab made the change, so this tab wins.
  const merged = mergeLocalStates(
    { current_week: 3, msg_index: 7, history: [] },
    { current_week: 2, msg_index: 1, history: [] },
  );
  assert.equal(merged.current_week, 3);
  assert.equal(merged.msg_index, 7);
});

test('a merge that changed nothing does not claim it did', () => {
  const ours = { history: [], active_session: null, prs: {} };
  assert.equal(mergeChangedOurs(ours, mergeLocalStates(ours, { history: [], active_session: null })), false);
});

// ---- History deletion tombstones (CODEX-AUDIT-2026-09-25 «NOT DONE» #1) ----
// Deletion used to be a bare history.splice(); the union above then handed the
// session straight back from any tab that still held a pre-delete copy.
const done = (sets, opts) => ({ ...session(sets, opts), ended_at: '2026-09-20T18:00:00Z' });

test('a session deleted in this tab does not come back from a stale tab on disk', () => {
  const doomed = done(3, { id: 'upper_a', started: '2026-09-20T17:00:00Z' });
  const kept = done(2, { id: 'lower_b', started: '2026-09-21T17:00:00Z' });
  const ours = { history: [kept], history_tombstones: [historyTombstoneFor(doomed, '2026-09-25T10:00:00Z')] };
  const stale = { history: [doomed, kept] };
  const merged = mergeLocalStates(ours, stale);
  assert.deepEqual(merged.history.map((s) => s.session_id), ['lower_b'], 'the deleted session must stay deleted');
  assert.equal(merged.history_tombstones.length, 1, 'and the tombstone must survive the merge');
  // …in the other direction too: the stale tab is the one saving now.
  const reverse = mergeLocalStates(stale, ours);
  assert.deepEqual(reverse.history.map((s) => s.session_id), ['lower_b'], 'a stale tab saving must adopt the delete');
});

test('a stale copy of a deleted session under a DIFFERENT uid is still dead (key match)', () => {
  const doomed = done(3, { id: 'upper_a' });
  const staleCopy = { ...doomed, uid: 'sess-backfilled-elsewhere', exercises: { x: { sets: [
    { completed: true }, { completed: true }, { completed: true }, { completed: true }] } } };
  const merged = mergeLocalStates(
    { history: [], history_tombstones: [historyTombstoneFor(doomed, '2026-09-25T10:00:00Z')] },
    { history: [staleCopy] },
  );
  assert.equal(merged.history.length, 0, 'not even a RICHER stale copy may resurrect it');
});

test('deleting a recovered duplicate does not kill the original that shares its key', () => {
  const original = done(3, { id: 'upper_a' });
  const dup = { ...original, uid: 'dup-abc', recovered_duplicate: true, note: 'other copy' };
  const merged = mergeLocalStates(
    { history: [original], history_tombstones: [historyTombstoneFor(dup, '2026-09-25T10:00:00Z')] },
    { history: [original, dup] },
  );
  assert.deepEqual(merged.history.map((s) => s.uid), [original.uid]);
});

test('with no tombstones anywhere the merge is exactly the old union (old clients unchanged)', () => {
  const a = done(2, { id: 'upper_a', started: '2026-09-20T17:00:00Z' });
  const b = done(2, { id: 'lower_b', started: '2026-09-21T17:00:00Z' });
  const merged = mergeLocalStates({ history: [a] }, { history: [b] });
  assert.equal(merged.history.length, 2);
  assert.equal('history_tombstones' in merged, false, 'no tombstone key is invented for an old state');
});

test('a restore revives the sessions in it, so a stale tombstone cannot re-delete them', () => {
  const doomed = done(3, { id: 'upper_a' });
  const tomb = historyTombstoneFor(doomed, '2026-09-25T10:00:00Z');
  const restored = reviveRestoredState({ history: [doomed] }, [tomb], '2026-09-25T11:00:00Z');
  assert.equal(restored.history[0].revived_at, '2026-09-25T11:00:00Z');
  // A stale device still carrying the tombstone merges with the restored copy.
  const merged = mergeLocalStates(restored, { history: [], history_tombstones: [tomb] });
  assert.equal(merged.history.length, 1, 'the session he restored must survive');
  // …and deleting it AGAIN after the restore still wins.
  const again = historyTombstoneFor(restored.history[0], '2026-09-25T12:00:00Z');
  const tombs = mergeHistoryTombstones(merged.history_tombstones, [again]);
  assert.equal(tombs.length, 1, 'one tombstone per session, the later delete');
  assert.equal(mergeLocalStates({ history: [], history_tombstones: tombs }, { history: restored.history }).history.length, 0);
});
