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
 * evidence than either side alone. The one thing it cannot see is a deliberate
 * delete made in the other tab — a session deleted in tab A while tab B holds a
 * pre-delete copy comes back. That is the right way round: a resurrected row he
 * can delete again, a deleted workout he cannot re-live.
 */

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
  out.history = mergeHistories(mine.history, other.history);
  out.bodyweight_log = mergeBodyweight(mine.bodyweight_log, other.bodyweight_log);
  out.prs = mergePrs(mine.prs, other.prs);
  out.active_session = mergeActive(mine, other);
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
