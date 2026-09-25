/* Two copies of Raed's state, one winner — the rules, in one pure place.
 *
 * Two copies meet in exactly two situations, and until 2026-09-23 only one of
 * them had rules:
 *   1. two devices on the server → `merge_states` in server/raedsync.py;
 *   2. two open tabs / two windows on ONE phone → nothing at all. `persistLocal`
 *      serialised the whole in-memory state over the profile's single key with
 *      no counter, no compare and no `storage` listener, so the idle tab's next
 *      write erased whatever the training tab had logged. Measured on
 *      2026-09-23 (390×844 probe, one context, two pages): tab B logged three
 *      sets, one tap on a settings toggle in tab A left
 *      `{"active":false,"done":0}` on disk — session and sets gone.
 *
 * This module is the client half. It is pure (no DOM, no localStorage) so node
 * can test it, and it deliberately mirrors the server's rules rather than
 * inventing new ones:
 *   - history: union by session key, the copy with MORE completed sets wins
 *     (server/raedsync.py merge_history);
 *   - active session: the copy with MORE completed sets wins — never
 *     last-writer-wins, which is what deleted logged sets;
 *   - a session is only dropped when the other side NAMES it in
 *     `active_cleared`, the tombstone core/session.js already stamps when he
 *     finishes or discards (server/raedsync.py _clears_head_active);
 *   - PRs: the higher score;
 *   - everything else: this tab wins, because it is the one he just touched.
 *
 * The bias is deliberate: a merge here can only ever keep MORE training
 * evidence than either side alone — with one exception he asked for by name.
 *
 * A deliberate history delete is data, not an absence. Until 2026-09-25 delete
 * was a bare `history.splice()`, and both this union and the server's
 * (raedsync.py merge_history) put the session straight back the moment a stale
 * tab, a stale device or a stale server row still held a copy
 * (CODEX-AUDIT-2026-09-25.md, «NOT DONE» #1). ui/history.js now stamps a
 * tombstone into `state.history_tombstones`; both merges union the tombstones
 * and drop every session they name. Old clients never send the key, and with no
 * tombstones anywhere every rule above behaves exactly as before.
 */

/* ---- History tombstones ---------------------------------------------------
 * Shape mirrors the tombstone payload in domain/events.js (target_type,
 * target_id, deleted_at) so the event-log migration can lift them verbatim. It
 * does NOT go through createTombstoneEvent(): that asserts a UUID target, and
 * real history uids include the pre-crypto `sess-…` fallback (core/store.js
 * backfillSessionUids) and the server's `srv-…` / `dup-…` (raedsync.py) — a
 * delete that throws on those would be worse than the resurrection it fixes.
 *
 * Matching (identical in server/raedsync.py _tombstone_kills):
 *   - by uid, always;
 *   - by session key (started_at|session_id) too, because a stale device can
 *     hold the same session under a different uid (backfilled independently
 *     before it ever synced) and the server collapses copies by key. A
 *     `recovered_duplicate` is a DIFFERENT session that happens to share the
 *     key (raedsync.py merge_session_into_history), so its tombstone records no
 *     key and key-matching never kills one.
 *   - a session carrying `revived_at` later than the tombstone survives: that
 *     is a restore/import/undo he chose (reviveRestoredState below).
 */
export const HISTORY_TOMBSTONE_CAP = 500;

export function historyTombstoneFor(sess, deletedAt = new Date().toISOString()) {
  if (!sess || typeof sess !== 'object') return null;
  const uid = sess.uid ? String(sess.uid) : '';
  const key = sess.recovered_duplicate ? '' : sessionKeyOf(sess);
  if (!uid && (!key || key === '|')) return null;
  return { target_type: 'session', target_id: uid, key, deleted_at: String(deletedAt) };
}

function tombstoneId(tomb) {
  return tomb.target_id ? `uid:${tomb.target_id}` : `key:${tomb.key}`;
}

function validTombstone(tomb) {
  return tomb && typeof tomb === 'object' && (tomb.target_id || (tomb.key && tomb.key !== '|'));
}

export function mergeHistoryTombstones(...lists) {
  const byId = new Map();
  lists.forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((tomb) => {
      if (!validTombstone(tomb)) return;
      const id = tombstoneId(tomb);
      const seen = byId.get(id);
      // The later delete wins: a session revived and deleted again must stay dead.
      if (!seen || String(tomb.deleted_at || '') > String(seen.deleted_at || '')) byId.set(id, { ...tomb });
    });
  });
  const out = [...byId.values()].sort((a, b) => String(a.deleted_at || '').localeCompare(String(b.deleted_at || '')));
  // Bounded: deletes are rare, but the list rides in every push.
  return out.length > HISTORY_TOMBSTONE_CAP ? out.slice(out.length - HISTORY_TOMBSTONE_CAP) : out;
}

export function isSessionTombstoned(sess, tombstones) {
  if (!sess || typeof sess !== 'object' || !Array.isArray(tombstones) || !tombstones.length) return false;
  const uid = sess.uid ? String(sess.uid) : '';
  const key = sessionKeyOf(sess);
  const revived = String(sess.revived_at || '');
  return tombstones.some((tomb) => {
    if (!validTombstone(tomb)) return false;
    const hit = (uid && tomb.target_id && uid === String(tomb.target_id))
      || (!sess.recovered_duplicate && tomb.key && tomb.key === key);
    if (!hit) return false;
    return !(revived && revived > String(tomb.deleted_at || ''));
  });
}

export function dropTombstoned(history, tombstones) {
  if (!Array.isArray(history)) return history;
  if (!Array.isArray(tombstones) || !tombstones.length) return history;
  return history.filter((sess) => !isSessionTombstoned(sess, tombstones));
}

/**
 * A restore / import / undo is him choosing a copy. Every session in it that a
 * tombstone (his current one or the restored one) would kill is stamped
 * `revived_at`, so a stale device still carrying the old tombstone cannot
 * delete it again on the next merge. Tombstones for sessions NOT in the
 * restored copy are kept — those deletes still stand.
 */
export function reviveRestoredState(restored, priorTombstones, now = new Date().toISOString()) {
  if (!restored || typeof restored !== 'object') return restored;
  const tombs = mergeHistoryTombstones(priorTombstones, restored.history_tombstones);
  const history = (Array.isArray(restored.history) ? restored.history : []).map((sess) => (
    isSessionTombstoned(sess, tombs) ? { ...sess, revived_at: now } : sess
  ));
  const out = { ...restored, history };
  if (tombs.length) out.history_tombstones = tombs;
  return out;
}

export function sessionKeyOf(sess) {
  if (!sess || typeof sess !== 'object') return '';
  return `${sess.started_at || sess.date || ''}|${sess.session_id || ''}`;
}

// The same count the server uses: warm-ups are not evidence of work.
export function completedSetsOf(sess) {
  if (!sess || typeof sess !== 'object') return 0;
  let total = 0;
  Object.values(sess.exercises || {}).forEach((ex) => {
    (ex?.sets || []).forEach((set) => {
      if (set && set.completed && !set.is_warmup) total += 1;
    });
  });
  return total;
}

function richerSession(a, b) {
  // Ties go to `a`, which callers always pass as this tab's copy: with equal
  // evidence the writer in front of him wins.
  return completedSetsOf(b) > completedSetsOf(a) ? b : a;
}

function mergeHistories(ours, theirs) {
  const byKey = new Map();
  const order = [];
  [...(Array.isArray(theirs) ? theirs : []), ...(Array.isArray(ours) ? ours : [])].forEach((sess) => {
    if (!sess || typeof sess !== 'object') return;
    // Keyed by session identity alone, exactly as the server keys it — two
    // copies of one session must collapse even when only one of them has been
    // through backfillSessionUids().
    const key = sessionKeyOf(sess);
    const seen = byKey.get(key);
    if (!seen) { byKey.set(key, sess); order.push(key); return; }
    byKey.set(key, richerSession(seen, sess));
  });
  return order.map((key) => byKey.get(key));
}

function mergeBodyweight(ours, theirs) {
  const seen = new Set();
  const out = [];
  [...(Array.isArray(theirs) ? theirs : []), ...(Array.isArray(ours) ? ours : [])].forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const key = `${row.date}|${row.kg}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  });
  out.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  return out;
}

function mergePrs(ours, theirs) {
  const out = { ...(theirs && typeof theirs === 'object' ? theirs : {}) };
  Object.entries(ours && typeof ours === 'object' ? ours : {}).forEach(([id, pr]) => {
    if (!pr || typeof pr !== 'object') return;
    const old = out[id];
    if (!old || typeof old !== 'object' || Number(pr.score || 0) >= Number(old.score || 0)) out[id] = pr;
  });
  return out;
}

function mergeActive(ours, theirs) {
  const oursActive = ours && typeof ours.active_session === 'object' ? ours.active_session : null;
  const theirsActive = theirs && typeof theirs.active_session === 'object' ? theirs.active_session : null;
  if (oursActive && theirsActive) return richerSession(oursActive, theirsActive);
  if (theirsActive) {
    // We hold no session. Only the tombstone core/session.js stamps proves he
    // ENDED this one here; anything else is just "this tab never saw it".
    const cleared = ours?.active_cleared;
    if (cleared && cleared.key && cleared.key === sessionKeyOf(theirsActive)) return null;
    return theirsActive;
  }
  return oursActive;
}

/**
 * @param ours   this context's in-memory state (the tab he just used)
 * @param theirs the state currently on disk, written by another context
 */
export function mergeLocalStates(ours, theirs) {
  const mine = ours && typeof ours === 'object' ? ours : {};
  const other = theirs && typeof theirs === 'object' ? theirs : {};
  const out = { ...other, ...mine };
  const tombstones = mergeHistoryTombstones(other.history_tombstones, mine.history_tombstones);
  // Filter each side BEFORE the union so a dead copy can never win a
  // richer-copy tie against a revived one.
  out.history = dropTombstoned(
    mergeHistories(dropTombstoned(mine.history, tombstones), dropTombstoned(other.history, tombstones)),
    tombstones,
  );
  if (tombstones.length) out.history_tombstones = tombstones;
  out.bodyweight_log = mergeBodyweight(mine.bodyweight_log, other.bodyweight_log);
  out.prs = mergePrs(mine.prs, other.prs);
  out.active_session = mergeActive(mine, other);
  // A stale tab can still hold a deleted session as its LIVE one (it never saw
  // the finish); a tombstoned uid/key means it is a finished-then-deleted copy.
  if (out.active_session && isSessionTombstoned(out.active_session, tombstones)) out.active_session = null;
  return out;
}

/** True when the merge kept something this tab did not have. */
export function mergeChangedOurs(ours, merged) {
  const mine = ours && typeof ours === 'object' ? ours : {};
  if ((merged.history || []).length !== (mine.history || []).length) return true;
  if ((merged.bodyweight_log || []).length !== (mine.bodyweight_log || []).length) return true;
  const before = mine.active_session || null;
  const after = merged.active_session || null;
  if (Boolean(before) !== Boolean(after)) return true;
  return completedSetsOf(after) !== completedSetsOf(before);
}
