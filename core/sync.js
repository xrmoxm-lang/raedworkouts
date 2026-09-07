/* The self-hosted cloud row: fetch, push, pull, revisions, profiles. */

import { $, confirmAction, setUiText, toast } from '../core/dom.js';
import { fmtTime, t, tf, todayISO } from '../core/i18n.js';
import { setFocusExerciseIdx } from '../core/session.js';
import { render, renderWelcome } from '../core/shell.js';
import {
  SYNC_KEY,
  backfillSessionUids,
  clearDirtyMarker,
  defaultSettings,
  defaultState,
  ensureProfile,
  familyProfileSeeds,
  getLocalProfiles,
  getSyncUrl,
  loadLocal,
  migrateProgrammeReferencesAtBoot,
  persistLocal,
  preRestoreKey,
  readDirtyMarker,
  readLastRev,
  replaceSettings,
  replaceState,
  retireLegacyCredentialFields,
  safeGetItem,
  safeSetItem,
  saveLocal,
  setActiveUser,
  setSyncDirty,
  settings,
  state,
  storageFailed,
  stripForSync,
  syncDirty,
  syncSettingsPayload,
  syncStatePayload,
  writeDirtyMarker,
  writeLastRev,
} from '../core/store.js';
import { applyTheme } from '../core/theme.js';
import { localProfileIdFromV16SyncId, v16SyncUserId } from '../domain/sync-identity.js';

// Local profile IDs deliberately stay human-facing.  Only this resolver may
// construct a server identity, and it always suffixes `-v16`; no v16 request
// can therefore address Raed's v15 row by accident.
export function syncUserId(localUserId = settings.user_id) {
  return v16SyncUserId(localUserId);
}
export function syncUserQuery(localUserId = settings.user_id) {
  return encodeURIComponent(syncUserId(localUserId));
}
export let syncTimer = null;
export let syncInFlight = false;
export let syncInFlightPromise = null;
export let welcomeProfiles = null;
export let welcomeLoading = false;
export let welcomePreselectUser = '';
export function setWelcomePreselectUser(value) { welcomePreselectUser = value; }
export let welcomeMode = 'tiles';
export function setWelcomeMode(value) { welcomeMode = value; }
export let welcomeSelectedProfile = null;
export function setWelcomeSelectedProfile(value) { welcomeSelectedProfile = value; }
export function schedulePush(delay = 2500) {
  if (!settings.user_id || !settings.sync_url || !settings.sync_key) return;
  clearScheduledPush();
  syncTimer = setTimeout(() => flushSync().catch(() => {}), delay);
}
export function clearScheduledPush() {
  clearTimeout(syncTimer);
  syncTimer = null;
}
export async function quiesceSyncPipeline() {
  clearScheduledPush();
  if (syncInFlightPromise) await syncInFlightPromise.catch(() => false);
  clearScheduledPush();
}
export function applyRemotePayload(remote, localUserId = settings.user_id) {
  // The server correctly echoes its row id (`raed-v16`), but that is never a
  // local profile id. Keeping the local identity here prevents remote sync
  // metadata from leaking into localStorage, profile names, or later requests.
  const localId = localUserId || settings.user_id;
  if (!localId) throw new Error('Sync identity invariant failed: remote payload needs a local profile id');
  const localLang = settings.lang;
  const localTheme = settings.theme;
  const remoteState = remote.state_json || remote.state || {};
  const remoteSettings = retireLegacyCredentialFields(remote.settings_json || remote.settings || {});
  replaceState({ ...defaultState(), ...remoteState });
  replaceSettings({ ...defaultSettings(), ...remoteSettings });
  settings.user_id = localId;
  settings.lang = settings.lang || localLang;
  settings.theme = settings.theme || localTheme;
  delete settings.programme_variant;
  delete settings.pending_variant;
  settings.sync_url = getSyncUrl();
  settings.sync_key = SYNC_KEY;
  setActiveUser(localId);
  // A remote pre-D6 snapshot is subject to the exact same export-first
  // migration as a locally loaded one.
  migrateProgrammeReferencesAtBoot(settings.user_id);
  ensureProfile();
  backfillSessionUids();
  writeLastRev(remote.rev || remote.latest_rev, settings.user_id);
  setSyncDirty(false);
  clearDirtyMarker(settings.user_id);
  persistLocal();
}
export function syncAuthBody() {
  return {
    _auth_token: settings.sync_key,
  };
}
export function syncErrorStatus(err) {
  const match = String(err?.message || '').match(/Sync\s+(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
export function isNetworkError(err) {
  const msg = String(err?.message || err || '');
  if (/^Sync\s+\d+/.test(msg)) return false;
  return err instanceof TypeError || /Sync timeout|Failed to fetch|NetworkError|Load failed|internet connection|offline/i.test(msg);
}
// ---- Cloud sync (self-hosted on Raed's HP server) ----------
export async function syncFetch(path, opts = {}) {
  const { timeoutMs = 15000, signal, ...fetchOpts } = opts;
  const base = (settings.sync_url || getSyncUrl()).replace(/\/$/, '');
  const url = base + path;
  const headers = { ...(fetchOpts.headers || {}) };
  if (settings.sync_key) headers.Authorization = 'Bearer ' + settings.sync_key;
  if (fetchOpts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const canAbort = typeof AbortController !== 'undefined' && timeoutMs > 0 && !signal;
  const controller = canAbort ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { ...fetchOpts, headers, signal: signal || controller?.signal });
    if (!res.ok) {
      // Carry the status on the error itself. The status was previously only
      // recoverable by re-parsing the message string, which is fragile — a
      // three-digit number in the server's body could be read as the status.
      const failure = new Error(`Sync ${res.status}: ${await res.text()}`);
      failure.status = res.status;
      throw failure;
    }
    return res.json();
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Sync timeout');
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function syncToCloud(opts = {}) {
  if (!settings.sync_url || !settings.sync_key || !settings.user_id) return false;
  const userIdAtStart = settings.user_id;
  const bodyObj = {
    user_id: syncUserId(settings.user_id),
    state_json: syncStatePayload(),
    settings_json: syncSettingsPayload(),
    updated_at: new Date().toISOString(),
    base_rev: readLastRev(settings.user_id),
    ...(opts.mode ? { mode: opts.mode } : {}),
    ...(opts.beaconAuth ? syncAuthBody() : {}),
  };
  const body = JSON.stringify(bodyObj);
  if (opts.beacon && navigator.sendBeacon) {
    const url = settings.sync_url.replace(/\/$/, '') + '/state';
    return navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }));
  }
  setSyncDirty(false);
  let response;
  try {
    response = await syncFetch('/state', {
      method: 'POST',
      body,
      ...(opts.keepalive ? { keepalive: true } : {}),
    });
  } catch (err) {
    setSyncDirty(true);
    writeDirtyMarker(userIdAtStart);
    throw err;
  }
  const rev = response?.rev || response?.latest_rev;
  if (response?.merged === true) {
    if (syncDirty) {
      setSyncStatus('off', t('sync_merged_pending'));
      saveLocal._toastShown = false;
      return true;
    }
    applyRemotePayload(response, userIdAtStart);
    applyTheme();
    render();
  } else if (rev) {
    writeLastRev(rev, userIdAtStart);
    if (!syncDirty) clearDirtyMarker(userIdAtStart);
  }
  setSyncStatus('ok', (response?.merged ? t('sync_merged_ok') : t('sync_ok')) + ' ' + fmtTime(Date.now()));
  saveLocal._toastShown = false;
  return true;
}

export async function flushSync(opts = {}) {
  if (!settings.user_id) return false;
  while (true) {
    if (syncInFlightPromise) {
      const inFlightOk = await syncInFlightPromise.catch(() => false);
      if (!inFlightOk) return false;
      if (syncDirty || readDirtyMarker(settings.user_id)) continue;
      return true;
    }
    if (!syncDirty && !readDirtyMarker(settings.user_id)) return true;
    if (navigator.onLine === false) {
      setSyncStatus('err', t('sync_pending_offline'));
      return false;
    }
    clearScheduledPush();
    let ok = false;
    let run;
    syncInFlight = true;
    run = (async () => {
      try {
        ok = await syncToCloud(opts);
        return ok;
      } catch (err) {
        // Name the likely cause instead of echoing a raw error. Unreachable and
        // rejected are different problems with different fixes, and telling them
        // apart on screen is what turns "فشلت المزامنة" into something he can act
        // on — or report to me precisely.
        setSyncStatus('err', syncFailureReason(err));
        if (!saveLocal._toastShown) {
          saveLocal._toastShown = true;
          // «حُفظت محلياً» is only true when the phone actually accepted the
          // write. With storage failing too there is no copy anywhere, and
          // saying "saved locally" would be the single most misleading sentence
          // the app could show him. A probe caught this one overwriting the
          // storage warning three seconds after it appeared.
          toast(storageFailed ? t('nothing_saved_anywhere') : t('cloud_sync_failed'), storageFailed ? 8000 : 3500);
        }
        return false;
      } finally {
        syncInFlight = false;
        if (syncInFlightPromise === run) syncInFlightPromise = null;
        if (syncDirty) schedulePush(ok ? 2500 : 60000);
      }
    })();
    syncInFlightPromise = run;
    const pushed = await run;
    if (!pushed) return false;
  }
}

export async function pullFromCloud() {
  if (!settings.sync_url || !settings.sync_key || !settings.user_id) return false;
  if (syncDirty || readDirtyMarker(settings.user_id)) return flushSync();
  let remote;
  try {
    remote = await syncFetch('/state?user=' + syncUserQuery(settings.user_id));
  } catch (e) {
    // 404 = no row yet (first run / fresh user) — not an error, nothing to pull.
    if (/Sync 404/.test(e.message || '')) return false;
    throw e;
  }
  if (remote?.latest_rev && readLastRev(settings.user_id) === remote.latest_rev) {
    setSyncStatus('ok', t('sync_ok'));
    return false;
  }
  if (remote && remote.state_json) {
    applyRemotePayload(remote, settings.user_id);
    setSyncStatus('ok', t('sync_pulled'));
    return true;
  }
  return false;
}


// Turns a fetch failure into something Raed can act on. A network-level failure
// and a rejected request are different problems: one means the server cannot be
// reached at all, the other means it answered and said no. Reporting them the
// same way is what made a real outage take an investigation to diagnose.
export function syncFailureReason(err) {
  const message = String(err?.message || err || '');
  const status = Number(err?.status || (message.match(/\b(\d{3})\b/) || [])[1]);
  if (navigator.onLine === false) return t('sync_pending_offline');
  if (status === 401 || status === 403) return t('sync_rejected');
  if (status >= 500) return t('sync_server_error');
  if (/failed to fetch|networkerror|load failed|timeout|abort/i.test(message)) {
    // Chrome 147 blocks a public page from reaching the "local address space"
    // behind a permission. On a machine running Tailscale, MagicDNS resolves the
    // sync host to its 100.x CGNAT address, so Chrome classifies it as local and
    // refuses — while Safari, which does not implement Local Network Access,
    // works on the same machine against the same server. Diagnosed 2026-09-02:
    // every request failed with net::ERR_FAILED and "Permission was denied for
    // this request to access the `local` address space".
    //
    // Naming it matters: "cannot reach your server" sends him to check the
    // server, which is healthy. The problem is one browser's permission.
    if (isChromiumLike()) return t('sync_blocked_by_browser');
    return t('sync_unreachable');
  }
  return t('sync_failed_generic');
}

// Chromium-family detection, deliberately narrow: Chrome on iOS is WebKit
// underneath and is NOT affected, so a plain /Chrome/ test would misdiagnose it.
export function isChromiumLike() {
  const ua = navigator.userAgent || '';
  // Chrome on iOS is WebKit underneath and is NOT affected, so a bare /Chrome/
  // test would misdiagnose the browser he most likely trains with.
  if (/iPhone|iPad|iPod/.test(ua)) return false;
  return /Chrome|Chromium|Edg\//.test(ua);
}

export function setSyncStatus(kind, text) {
  const el = $('#sync-status');
  if (!el) return;
  el.className = 'sync-status ' + kind;
  setUiText(el, text);
}

export async function testCloudConnection() {
  if (!settings.sync_url || !settings.sync_key) {
    toast('Sync is not configured.');
    return;
  }
  toast('Testing…');
  try {
    await syncFetch('/health', { timeoutMs: 8000 });
    setSyncStatus('ok', t('sync_connected') + ' ✓');
    toast('Connection OK.');
  } catch (e) {
    setSyncStatus('err', syncFailureReason(e));
    // Concatenating onto a literal defeats localisation: the joined string can
    // never match a locale entry, so this always rendered in English.
    toast(tf('sync_connection_failed', { reason: syncFailureReason(e) }), 3500);
  }
}

// `/users` contains both long-lived v15 rows and isolated v16 rows. Bare v15
// rows remain invisible here, and legacy credential metadata is intentionally
// ignored: profiles always open directly in v16.
export function welcomeProfilesForV16(remoteRows = []) {
  const profiles = new Map();
  const add = (profile) => {
    const { has_pin, pin_hash, pin_salt, ...local } = profile || {};
    const key = String(local.user_id || '').toLocaleLowerCase();
    if (key) profiles.set(key, local);
  };
  familyProfileSeeds().forEach(add);
  getLocalProfiles().forEach(add);

  for (const remote of remoteRows || []) {
    const localId = localProfileIdFromV16SyncId(remote?.user_id);
    if (!localId) continue;
    const existing = profiles.get(localId.toLocaleLowerCase()) || { user_id: localId, display_name: localId };
    add({
      ...existing,
      user_id: existing.user_id || localId,
      display_name: remote.display_name || existing.display_name || localId,
      experience: remote.experience || existing.experience || 'returning',
      sessions: remote.sessions ?? existing.sessions ?? 0,
      updated_at: remote.updated_at || existing.updated_at || null,
    });
  }
  return [...profiles.values()];
}

export async function loadWelcomeProfiles() {
  if (welcomeLoading) return;
  welcomeLoading = true;
  try {
    const rows = await syncFetch('/users', { timeoutMs: 8000 });
    welcomeProfiles = welcomeProfilesForV16(rows);
  } catch (_) {
    welcomeProfiles = welcomeProfilesForV16();
  } finally {
    welcomeLoading = false;
    if (!settings.user_id) renderWelcome();
  }
}
export async function selectProfile(profile) {
  welcomeSelectedProfile = profile;
  await openProfile(profile);
}
// Adopt a profile on THIS device without ever discarding what the device
// already holds for it.
//
// This and openProfile below both used to do `state = { ...defaultState() }`
// and then persistLocal(). Nothing read the stored state first. So tapping your
// own name on the welcome screen with the server unreachable — gym wifi, HP
// off, aeroplane mode — wrote a blank state straight over your training log.
// Proven with a probe: three sessions and a personal record seeded, tile
// tapped, both gone. There was no undo and no warning, and the suite was green.
//
// Now the stored state is loaded first and only genuinely missing profile
// fields are filled in. A brand-new profile has nothing stored, so it still
// starts empty — the same result, reached without destroying anything.
export function adoptProfileLocally(userId, profile) {
  setActiveUser(userId);
  loadLocal();
  settings.user_id = userId;
  settings.sync_url = getSyncUrl();
  settings.sync_key = SYNC_KEY;
  const existing = state.profile || {};
  state.profile = {
    ...existing,
    display_name: existing.display_name || profile?.display_name || userId,
    experience: existing.experience || profile?.experience || 'returning',
    bodyweight_kg: existing.bodyweight_kg ?? profile?.bodyweight_kg ?? null,
    created_at: existing.created_at || new Date().toISOString(),
  };
}
export function finishLocalProfile(userId, profile) {
  adoptProfileLocally(userId, profile);
  persistLocal();
  setSyncDirty(false);
  clearDirtyMarker(userId);
  render();
}
export async function openProfile(profile) {
  const userId = profile.user_id || profile.display_name;
  // See adoptProfileLocally: this line used to be a defaultState() assignment,
  // and the persistLocal() a few lines down then wrote that empty state over
  // his history whenever the pull did not replace it first.
  adoptProfileLocally(userId, profile);
  try {
    const pulled = await pullFromCloud();
    persistLocal();
    applyTheme();
    render();
    // A new local profile has no remote revision. Its first namespaced state
    // write claims its v16 row; it never needs a separate credential setup.
    if (!pulled && readLastRev(userId) == null) saveLocal();
  } catch (error) {
    finishLocalProfile(userId, profile);
    if (syncErrorStatus(error) === 401) {
      setSyncStatus('err', t('profile_opened_local_admin_reset'));
      toast(t('profile_opened_local_admin_reset'), 4000);
      return;
    }
    if (!isNetworkError(error)) throw error;
    saveLocal();
    toast('Opened locally. Cloud sync will reconnect when available.', 3500);
  }
}
export async function createProfile(profile, bodyweight) {
  const localUserId = profile.user_id || profile.display_name;
  finishLocalProfile(localUserId, { ...profile, bodyweight_kg: bodyweight ?? profile.bodyweight_kg });
  state.profile.experience = profile.experience || state.profile.experience || 'returning';
  if (bodyweight) {
    state.profile.bodyweight_kg = bodyweight;
    state.bodyweight_log = [{ date: todayISO(), kg: bodyweight }];
  }
  saveLocal();
  toast('Profile ready.');
  applyTheme();
  render();
}
export function stashPreRestore(reason) {
  if (!settings.user_id) return;
  const snapshot = {
    created_at: new Date().toISOString(),
    reason,
    state: stripForSync(state, 'state'),
    settings: syncSettingsPayload(),
  };
  safeSetItem(preRestoreKey(settings.user_id), JSON.stringify(snapshot));
}
export async function undoPreRestore() {
  if (!settings.user_id) return;
  let snapshot;
  try { snapshot = JSON.parse(safeGetItem(preRestoreKey(settings.user_id)) || 'null'); } catch (_) {}
  if (!snapshot) { toast('No restore snapshot found.'); return; }
  await quiesceSyncPipeline();
  const keep = { user_id: settings.user_id, sync_url: getSyncUrl(), sync_key: SYNC_KEY };
  replaceState({ ...defaultState(), ...(snapshot.state || {}) });
  replaceSettings({ ...defaultSettings(), ...retireLegacyCredentialFields(snapshot.settings || {}), ...keep });
  ensureProfile();
  saveLocal({ sync: false });
  const pushed = await flushSync({ mode: 'replace' });
  applyTheme();
  render();
  toast(pushed ? 'Restored previous local snapshot.' : 'Restored locally. Cloud sync is pending.');
}
export function notifyUndoRestore() {
  toast(t('snapshot_restored'), 7000, t('undo'), undoPreRestore);
}
export function exportPayload() {
  return {
    exported_at: new Date().toISOString(),
    user_id: settings.user_id,
    state: stripForSync(state, 'state'),
    settings: syncSettingsPayload(),
    latest_rev: readLastRev(settings.user_id),
  };
}
export function downloadJson(name, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export async function downloadCloudExport() {
  try {
    const payload = await syncFetch('/export?user=' + syncUserQuery(settings.user_id));
    downloadJson(`${settings.user_id}-workouts-${todayISO()}.json`, payload);
  } catch (_) {
    downloadJson(`raedworkouts-${settings.user_id}-${todayISO()}.json`, exportPayload());
    toast('Cloud export failed. Downloaded local export instead.');
  }
}
export async function restoreRevision(rev) {
  if (!await confirmAction({
    title: t('restore_backup'),
    body: t('restore_revision_body'),
    confirmLabel: t('restore_backup'),
  })) return;
  await quiesceSyncPipeline();
  stashPreRestore('revision ' + rev);
  const snap = await syncFetch('/revision?user=' + syncUserQuery(settings.user_id) + '&rev=' + encodeURIComponent(rev));
  const keep = { user_id: settings.user_id, sync_url: getSyncUrl(), sync_key: SYNC_KEY };
  replaceState({ ...defaultState(), ...(snap.state_json || {}) });
  replaceSettings({ ...defaultSettings(), ...retireLegacyCredentialFields(snap.settings_json || {}), ...keep });
  ensureProfile();
  saveLocal({ sync: false });
  const pushed = await flushSync({ mode: 'replace' });
  applyTheme();
  render();
  if (pushed) notifyUndoRestore();
  else toast(t('restored_locally_pending'), 5000, t('undo'), undoPreRestore);
}
export async function importJsonFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  await quiesceSyncPipeline();
  stashPreRestore('import');
  const keep = { user_id: settings.user_id, sync_url: getSyncUrl(), sync_key: SYNC_KEY };
  if (parsed.state) replaceState({ ...defaultState(), ...parsed.state });
  if (parsed.settings) replaceSettings({ ...defaultSettings(), ...retireLegacyCredentialFields(parsed.settings), ...keep });
  else replaceSettings({ ...settings, ...keep });
  ensureProfile();
  saveLocal({ sync: false });
  const pushed = await flushSync({ mode: 'replace' });
  applyTheme();
  render();
  toast(pushed ? t('imported') : t('imported_locally_pending'), 7000, t('undo'), undoPreRestore);
}
export async function switchProfile() {
  if (syncDirty || readDirtyMarker(settings.user_id) || syncInFlightPromise) {
    toast(t('syncing_before_switch'), 1200);
    const ok = await flushSync();
    if (!ok || syncDirty || readDirtyMarker(settings.user_id)) {
      toast('Cannot switch until this profile is synced.');
      return;
    }
  }
  await quiesceSyncPipeline();
  setFocusExerciseIdx(null);
  setActiveUser('');
  replaceState(defaultState());
  replaceSettings(defaultSettings());
  settings.sync_url = getSyncUrl();
  settings.sync_key = SYNC_KEY;
  welcomeMode = 'tiles';
  welcomeSelectedProfile = null;
  welcomeProfiles = null;
  render();
}

