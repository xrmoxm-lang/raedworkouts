/**
 * Remote sync identities for the parallel v16 install.
 *
 * Local profile IDs remain familiar (Raed, bassam, abdullah) and stay scoped
 * by the new origin's localStorage.  Only the HP-server row receives this
 * suffix.  That makes a v16 client structurally incapable of selecting a
 * v15 row such as `raed`.
 */
export const V16_SYNC_SUFFIX = '-v16';

function localId(value) {
  const id = String(value || '').trim();
  if (!id) throw new Error('Sync identity invariant failed: local profile id is required');
  return id;
}

export function v16SyncUserId(profileId) {
  const id = localId(profileId).toLocaleLowerCase();
  return id.endsWith(V16_SYNC_SUFFIX) ? id : `${id}${V16_SYNC_SUFFIX}`;
}

export function isV16SyncUserId(value) {
  return String(value || '').trim().toLocaleLowerCase().endsWith(V16_SYNC_SUFFIX);
}

/** Turn a v16 remote row back into its local profile identity for the picker. */
export function localProfileIdFromV16SyncId(value) {
  const remote = String(value || '').trim();
  if (!isV16SyncUserId(remote)) return null;
  return remote.slice(0, -V16_SYNC_SUFFIX.length);
}

export function v16SyncQuery(profileId) {
  return encodeURIComponent(v16SyncUserId(profileId));
}
