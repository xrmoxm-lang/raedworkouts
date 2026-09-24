/* Owns `state` and `settings`. Every localStorage write goes through the guarded
 * helpers here: a write never throws, and a failed write is loud. */

import { restoreCoachAnswer, setCoachEnglish, setCoachOpen, setCoachState } from '../core/coach.js';
import { toast } from '../core/dom.js';
import { t, tf } from '../core/i18n.js';
import { scheduleSetEditPersist } from '../core/session.js';
import { downloadJson, flushSync, schedulePush, setSyncStatus } from '../core/sync.js';
import { migrateVideoHiddenKeys } from '../core/videos.js';
import { runProgrammeReferenceMigrations } from '../domain/programme.js';
import { mergeChangedOurs, mergeLocalStates } from '../domain/state-merge.js';

// Self-hosted sync — always-on on Raed's HP server (Tailscale Funnel, public
// HTTPS, secret-key gated). The server owns revisions, backups, and merges.
// The key is a shared secret in client JS (same trust model as the old anon key).
const SYNC_URL = 'https://raed-hp.tail53bd35.ts.net:8443';
export const SYNC_KEY = 'aa1b222bcdab4b048e7b44d85dca087946a6212314852b4b';
const SYNC_OVERRIDE_KEY = 'raedworkouts_sync_override';

const LEGACY_STORAGE_KEY = 'raedworkouts.v1';
const LEGACY_SETTINGS_KEY = 'raedworkouts.settings.v1';
const LEGACY_LAST_WRITE_KEY = 'raedworkouts.lastwrite.v1';
const ACTIVE_USER_KEY = 'raedworkouts.active_user';
const PROFILE_INDEX_KEY = 'raedworkouts.profiles.v1';

// ---- Guarded storage ---------------------------------------------------
// Every write in this file used to call localStorage.setItem bare. There was
// no try/catch on a single one of the fifteen, and no window.onerror either.
export let storageFailed = false;
// Which key is the ALARM about. Clearing on any successful write is what made a
// partially full phone lie: measured 2026-09-23 on a size-selective quota stub,
// the 65,379-char state write threw, the 698-char settings write that follows it
// succeeded, `storageFailed` flipped back to false, and the toast he got was
// «حُفظت محلياً» — the one sentence locale.js:905 exists to prevent. Only the
// STATE key can clear the alarm, because only the state key holds the workout.
const STATE_KEY_RE = /^raedworkouts\..+\.state\.v1$/;
export function isStateStorageKey(key) { return STATE_KEY_RE.test(String(key || '')); }
export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    if (storageFailed && isStateStorageKey(key)) {
      storageFailed = false;
      setSyncStatus('ok', t('storage_recovered'));
    }
    return true;
  } catch (err) {
    onStorageWriteFailed(err);
    return false;
  }
}
export function safeRemoveItem(key) {
  try { localStorage.removeItem(key); return true; } catch (_) { return false; }
}
export function safeGetItem(key) {
  try { return localStorage.getItem(key); } catch (_) { return null; }
}
function onStorageWriteFailed(err) {
  const first = !storageFailed;
  storageFailed = true;
  // The in-memory state is still correct, so the server can still save it.
  // Marking dirty by hand: markDirty() writes a marker that would fail too.
  syncDirty = true;
  setSyncStatus('err', t('storage_full_status'));
  if (first) {
    console.error('[raedworkouts] local save failed', err);
    toast(t('storage_full'), 8000);
    // Straight to the server, no debounce — this is the last copy.
    try { flushSync().catch(() => {}); } catch (_) {}
  }
}

export function getSyncUrl() {
  return (safeGetItem(SYNC_OVERRIDE_KEY) || '').trim() || SYNC_URL;
}
function encodeUserKey(userId) {
  return encodeURIComponent(String(userId || '').trim());
}
export function nsKey(userId, suffix) {
  return `raedworkouts.${encodeUserKey(userId)}.${suffix}.v1`;
}
export function stateKey(userId) { return nsKey(userId, 'state'); }
export function settingsKey(userId) { return nsKey(userId, 'settings'); }
export function lastWriteKey(userId) { return nsKey(userId, 'lastwrite'); }
export function lastRevKey(userId) { return nsKey(userId, 'lastrev'); }
export function preRestoreKey(userId) { return nsKey(userId, 'prerestore'); }
export function dirtyKey(userId) { return nsKey(userId, 'dirty'); }
function programmeMigrationExportKey(userId) { return nsKey(userId, 'programme-migration-export'); }
// Where a state blob that will not parse is put. Never overwritten, never
// synced — it is the last copy of whatever is left of his sessions.
export function corruptKey(userId) { return nsKey(userId, 'corrupt'); }
// Monotonic write counter for the state key, so a second tab cannot clobber
// blind. See domain/state-merge.js for why.
function stateSeqKey(userId) { return nsKey(userId, 'stateseq'); }

// ---- Corrupt local state ------------------------------------------------
// A blob that fails to parse used to be swallowed: loadLocal() kept the empty
// defaultState(), wrote it straight back over the still-recoverable text, and
// the boot push then wrote that empty state over the cloud head (base_rev
// matched, so raedsync.py took the fast path). Measured 2026-09-23: 58,990
// bytes and 12 sessions became 577 bytes and 0, on the phone AND in the cloud,
// and the only thing he was told was «فشلت المزامنة السحابية — حُفظت محلياً».
// A blob that will not parse is now a hard fault: quarantine, write NOTHING,
// push NOTHING, and ask him which copy to restore.
let stateCorrupt = false;
export function isStateCorrupt() { return stateCorrupt; }
export function clearStateCorrupt() { stateCorrupt = false; }
export let corruptReport = null;   // { user_id, bytes, quarantined, at }
function quarantineCorruptState(userId, rawText, err) {
  stateCorrupt = true;
  // Aside FIRST, before anything in the boot path can touch the state key. If
  // this write itself fails (a full phone is one of the ways a blob gets
  // truncated), the original is still where it was — nothing overwrites it.
  const quarantined = safeSetItem(corruptKey(userId), rawText);
  corruptReport = {
    user_id: userId,
    bytes: rawText.length,
    quarantined,
    at: new Date().toISOString(),
  };
  console.error('[raedworkouts] local state will not parse — quarantined', corruptReport, err);
  // Enough identity to offer a restore, and nothing that would be written back.
  settings.user_id = userId;
  settings.sync_url = getSyncUrl();
  settings.sync_key = SYNC_KEY;
  try {
    // Read-only: his language and theme decide how the recovery screen looks.
    const storedSettings = JSON.parse(safeGetItem(settingsKey(userId)) || '{}');
    const { lang, theme, skin } = retireLegacyCredentialFields(storedSettings);
    if (lang) settings.lang = lang;
    if (theme) settings.theme = theme;
    if (skin) settings.skin = skin;
  } catch (_) { /* the settings blob is not the one that failed; if it is too, defaults */ }
  syncDirty = false;
  setSyncStatus('err', t('state_corrupt_status'));
}

export const defaultState = () => ({
  schema_version: 2,
  // Independent of the event-log schema: D6 only migrates invalid planned
  // session references, never historical session evidence.
  programme_reference_migration_version: 1,
  current_week: 1,
  current_block: 1,
  profile: null,                // { display_name, experience, bodyweight_kg, created_at }
  active_session: null,        // { date, session_id, started_at, warmup, exercises: {...} }
  history: [],                 // [{ date, session_id, started_at, ended_at, exercises: {...}, substitutions: [...] }]
  bodyweight_log: [],          // [{ date, kg }]
  custom_videos: {},           // { exercise_id: [url, url, ...] }  — extra videos user adds
  custom_jn_urls: {},          // { exercise_id: 'https://youtube.com/...' } — overrides default JN URL
  video_hidden: {},            // { exercise_id: ['yt:<id>', 'url:<href>'] } — hidden clips, by clip
  video_hidden_key_version: 0, // 2 = keys are clip identities, not list positions
  exercise_order: {},          // { session_id: [exercise_id, ...] } — his order, when he sets one
  wellbeing_checks: [],        // [{ week_id: 'cycle:week', signs: [...], at }] — research/06 §7.3
  triggered_deload: null,      // { week_id, signs, at } — the week a trigger booked
  custom_exercises: [],        // [{ id, name, name_ar, primary, secondary, jeff_nippard, mohannad, ... }]
  programme_overrides: null,   // optional: replace default PROGRAMME entirely
  prs: {},                     // { exercise_id: { kg, reps, date, score } } — best ever per exercise
  msg_index: 0,                // rotates through MOTIVATIONAL_MESSAGES
  last_sync: null,
  forced_next_session: null,   // session id override when user missed a day
  substitutions: [],           // explicit, scoped D24 §5 substitution records
  // Per-exercise equipment memory: 60 kg on one leg press is not 60 kg on
  // another, so the machine has to be part of the record.
  // { exercise_id: { equipment, device, known_devices: [] } }
  exercise_prefs: {},
});

export const defaultSettings = () => ({
  theme: 'auto',               // auto | light | dark
  skin: 'hadid',               // hadid | waraq | rukham
  weight_unit: 'kg',           // kg | lb
  // The treadmill's own unit. Raed 2026-09-23: it reads MPH — his 5.1 and 7.3
  // are miles per hour, which makes his base a jog and not a brisk walk. The
  // segment that changes it (and converts the numbers with it) is in Settings.
  speed_unit: 'mph',           // mph | kmh
  rest_seconds: 120,
  rest_override: false,        // opt-in: use rest_seconds instead of the programme's per-exercise rest
  tap_log: false,              // opt-in: record which controls he presses, locally, for a review with Claude
  superset_mode: 'auto',       // auto | manual | off — how A1/A2 pairs behave
  vibrate: true,
  notifications: true,         // browser notifications when rest ends (req permission)
  // `focus_mode` and `show_cues` were dead state: no reader, no control. v16
  // always renders one exercise, which is the behaviour Raed asked for, so only
  // the unused keys are gone. Bringing the choice back is a feature, not a key.
  runner_video_open: true,     // persisted per profile; Raed wants the explanation open by default
  // The coach may be told which exercise he is standing at. On by default; the
  // switch is on the Coach screen while a session is running.
  coach_use_context: true,
  runner_video_default_version: 1,
  music_platform: 'spotify',   // spotify | youtube_music | apple_music | none
  show_pr_summary: true,       // show end-of-session PR review
  // Gym launcher: opens the verified IN2 app URL, with an App Store fallback.
  gym_launch_scheme: 'scope.bit://',                                  // bundle ID-based scheme attempt
  gym_launch_fallback: 'https://apps.apple.com/sa/app/in2-fitness/id1536137282', // App Store fallback
  gym_launch_override: '',     // user-set custom URL (e.g. shortcuts://run-shortcut?name=Open%20IN2)
  sync_url: SYNC_URL,
  sync_key: SYNC_KEY,
  user_id: '',
  block_auto_color: true,      // whether a configured boundary suggestion is offered
  block_skin_suggestions: {},  // deliberately unset until Raed assigns a skin per block
  block_skin_rejections: {},   // { block: true }; rejection is remembered for that block
  lang: 'ar',
  locale_version: 1,
});

export let state = defaultState();
export function replaceState(next) { state = next; }
export let settings = defaultSettings();
export function replaceSettings(next) { settings = next; }
export let syncDirty = false;
export function setSyncDirty(value) { syncDirty = value; }
let activeUser = '';
export function hasMeaningfulLocalData() {
  return (state.history || []).length > 0 || Boolean(state.active_session) || (state.bodyweight_log || []).length > 0;
}

export function familyProfileSeeds() {
  return RW.FAMILY_PROFILES || [
    { user_id: 'Raed', display_name: 'Raed', experience: 'detrained', bodyweight_kg: 82, allowlisted: true },
    { user_id: 'bassam', display_name: 'Bassam', experience: 'returning', allowlisted: true },
    { user_id: 'abdullah', display_name: 'Abdullah', experience: 'beginner', allowlisted: true },
  ];
}
function fallbackProfile(userId) {
  const seed = familyProfileSeeds().find(p => String(p.user_id).toLowerCase() === String(userId || '').toLowerCase());
  return {
    display_name: seed?.display_name || userId || '',
    experience: seed?.experience || 'returning',
    bodyweight_kg: seed?.bodyweight_kg ?? null,
    created_at: new Date().toISOString(),
  };
}
export function ensureProfile() {
  if (!state.profile || typeof state.profile !== 'object') {
    state.profile = fallbackProfile(settings.user_id || activeUser);
  }
  if (!state.profile.display_name) state.profile.display_name = settings.user_id || activeUser || '';
  if (!state.profile.experience) state.profile.experience = 'detrained';
  if (!state.profile.created_at) state.profile.created_at = new Date().toISOString();
}
function registerLocalProfile(profile) {
  const list = getLocalProfiles().filter(p => String(p.user_id).toLowerCase() !== String(profile.user_id).toLowerCase());
  list.push({
    user_id: profile.user_id,
    display_name: profile.display_name || profile.user_id,
    experience: profile.experience || 'detrained',
    updated_at: new Date().toISOString(),
  });
  safeSetItem(PROFILE_INDEX_KEY, JSON.stringify(list));
}
export function getLocalProfiles() {
  try {
    return JSON.parse(safeGetItem(PROFILE_INDEX_KEY) || '[]').map(({ has_pin: _retired, ...profile }) => profile);
  } catch (_) { return []; }
}
function getActiveUser() {
  return safeGetItem(ACTIVE_USER_KEY) || '';
}
export function setActiveUser(userId) {
  activeUser = userId || '';
  if (activeUser) safeSetItem(ACTIVE_USER_KEY, activeUser);
  else safeRemoveItem(ACTIVE_USER_KEY);
}
export function readLastRev(userId = settings.user_id) {
  const raw = safeGetItem(lastRevKey(userId));
  return raw ? parseInt(raw, 10) : null;
}
export function writeLastRev(rev, userId = settings.user_id) {
  if (!userId) return;
  if (rev == null || Number.isNaN(Number(rev))) safeRemoveItem(lastRevKey(userId));
  else safeSetItem(lastRevKey(userId), String(rev));
}
export function readDirtyMarker(userId = settings.user_id) {
  return !!userId && safeGetItem(dirtyKey(userId)) === '1';
}
export function writeDirtyMarker(userId = settings.user_id) {
  if (userId) safeSetItem(dirtyKey(userId), '1');
}
export function clearDirtyMarker(userId = settings.user_id) {
  if (userId) safeRemoveItem(dirtyKey(userId));
}
export function backfillSessionUids() {
  let changed = false;
  const makeUid = () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : ('sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)));
  (state.history || []).forEach(sess => {
    if (sess && !sess.uid) { sess.uid = makeUid(); changed = true; }
  });
  if (state.active_session && !state.active_session.uid) {
    state.active_session.uid = makeUid();
    changed = true;
  }
  return changed;
}
export function stripForSync(value, mode = 'state') {
  if (Array.isArray(value)) return value.map(v => stripForSync(v, mode));
  if (!value || typeof value !== 'object') return value;
  const deny = mode === 'settings'
    ? new Set(['sync_key', 'sync_url', 'user_id', 'last_rev', 'pending_variant'])
    : new Set(['last_sync']);
  const out = {};
  Object.entries(value).forEach(([k, v]) => {
    if (k.startsWith('_') || deny.has(k)) return;
    out[k] = stripForSync(v, mode);
  });
  return out;
}
export function retireLegacyCredentialFields(rawSettings = {}) {
  // Old local snapshots can contain the retired credential fields. They are
  // discarded during every load/merge and are never rendered or synced again.
  const {
    user_key: _credential,
    pending_registration: _registration,
    needs_pin_reauth: _reauth,
    pin_prompt_dismissed_at: _prompt,
    ...safeSettings
  } = rawSettings;
  return safeSettings;
}
export function syncStatePayload() {
  const clean = stripForSync(state, 'state');
  clean.profile = clean.profile || fallbackProfile(settings.user_id);
  return clean;
}
export function syncSettingsPayload() {
  return stripForSync(settings, 'settings');
}
export function profileProteinRange() {
  const kg = parseFloat(state.profile?.bodyweight_kg || RW.ATHLETE?.bodyweight_kg || 82);
  const low = Math.round(kg * 1.6);
  const high = Math.round(kg * 2.2);
  return `${low}-${high} g`;
}
function migrationUserFromLegacy(legacySettings) {
  if (legacySettings?.user_id) return legacySettings.user_id;
  const urlUser = new URLSearchParams(window.location.search).get('user');
  return urlUser || '';
}
function migrateLegacyStorage() {
  const legacyStateRaw = safeGetItem(LEGACY_STORAGE_KEY);
  const legacySettingsRaw = safeGetItem(LEGACY_SETTINGS_KEY);
  if (!legacyStateRaw && !legacySettingsRaw) return;
  let legacySettings = {};
  try { legacySettings = JSON.parse(legacySettingsRaw || '{}'); } catch (_) {}
  const userId = migrationUserFromLegacy(legacySettings);
  if (!userId) return;
  if (!safeGetItem(stateKey(userId)) && legacyStateRaw) safeSetItem(stateKey(userId), legacyStateRaw);
  if (!safeGetItem(settingsKey(userId)) && legacySettingsRaw) safeSetItem(settingsKey(userId), legacySettingsRaw);
  const lw = safeGetItem(LEGACY_LAST_WRITE_KEY);
  if (lw && !safeGetItem(lastWriteKey(userId))) safeSetItem(lastWriteKey(userId), lw);
  setActiveUser(userId);
  registerLocalProfile({ user_id: userId, display_name: userId, experience: legacySettings.profile?.experience || 'returning' });
  safeRemoveItem(LEGACY_STORAGE_KEY);
  safeRemoveItem(LEGACY_SETTINGS_KEY);
  safeRemoveItem(LEGACY_LAST_WRITE_KEY);
}

/**
 * D6 changes only the future programme rotation.  Before clearing an invalid
 * v15 forced-next reference, retain a durable local copy and trigger the
 * required timestamped JSON export.  The pure runner guarantees this adapter
 * receives untouched state before it can migrate anything.
 */
function exportProgrammeMigration(record, userId) {
  const payload = {
    kind: 'programme_reference_migration',
    user_id: userId,
    exported_at: record.created_at,
    state: record.state,
  };
  if (userId) safeSetItem(programmeMigrationExportKey(userId), JSON.stringify(payload));
  downloadJson(record.filename, payload);
}
export function migrateProgrammeReferencesAtBoot(userId) {
  const result = runProgrammeReferenceMigrations(state, {
    programme: RW.PROGRAMME,
    exportState: (record) => exportProgrammeMigration(record, userId),
  });
  state = result.state;
  if (result.status === 'read_only') {
    console.error(`Programme migration skipped: ${result.message}`);
    return result;
  }
  if (result.status === 'migrated' && result.ignored.length) {
    console.info(`Programme migration ignored legacy planned references: ${result.ignored.join(', ')}`);
  }
  return result;
}
export function loadLocal() {
  migrateLegacyStorage();
  activeUser = getActiveUser();
  state = defaultState();
  settings = defaultSettings();
  stateCorrupt = false;
  corruptReport = null;
  if (activeUser) {
    const rawState = safeGetItem(stateKey(activeUser));
    let storedState = {};
    if (rawState) {
      try {
        const parsed = JSON.parse(rawState);
        // A truncated blob can still parse — into a string, a number, an array.
        // None of those are a profile, and `{...defaultState(), ...'abc'}` is a
        // silent empty state exactly like the catch used to be.
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('state blob parsed to ' + (Array.isArray(parsed) ? 'an array' : typeof parsed));
        }
        storedState = parsed;
      } catch (err) {
        quarantineCorruptState(activeUser, rawState, err);
        return;   // nothing is written, nothing is pushed, until he chooses
      }
    }
    // This context is now exactly as current as the disk. Any write that
    // arrives after this line is somebody else's.
    stateSeq = readStateSeq(activeUser);
    foreignWriteSeen = false;
    state = { ...defaultState(), ...storedState };
    // New profiles begin at version 1. A stored profile without this explicit
    // marker predates D6 and must take the export-first reference migration.
    if (!Object.prototype.hasOwnProperty.call(storedState, 'programme_reference_migration_version')) {
      state.programme_reference_migration_version = 0;
    }
    try {
      const storedSettings = JSON.parse(safeGetItem(settingsKey(activeUser)) || '{}');
      settings = { ...defaultSettings(), ...retireLegacyCredentialFields(storedSettings) };
    } catch (e) {}
    // Existing profiles predate the Arabic-default requirement.  Preserve an
    // explicit post-Phase-4 choice, but migrate prior settings once.
    if (!settings.locale_version) {
      settings.lang = 'ar';
      settings.locale_version = 1;
    }
    if (!settings.runner_video_default_version) {
      settings.runner_video_open = true;
      settings.runner_video_default_version = 1;
    }
    settings.user_id = settings.user_id || activeUser;
    activeUser = settings.user_id;
    setActiveUser(activeUser);
  }
  if (activeUser && !safeGetItem(lastWriteKey(activeUser)) && hasMeaningfulLocalData()) {
    safeSetItem(lastWriteKey(activeUser), new Date().toISOString());
  }
  // Bring back the last answer, if this profile has one. loadLocal() runs on
  // boot AND on every profile switch, so restoring here is also what stops
  // profile A's answer being shown under profile B.
  setCoachState({ status: 'idle', question: '', results: [], answer: null, error: '' });
  setCoachEnglish(new Set());
  setCoachOpen(new Set());
  restoreCoachAnswer();
  migrateVideoHiddenKeys();
  // «Off» is enforced here, not only by the button that turns it off.
  if (settings.tap_log !== true && state[TAP_LOG_KEY]) delete state[TAP_LOG_KEY];
  // D6 replaces the selectable v15 programme variants. Stored values are
  // deliberately retired rather than interpreted as new programme choices.
  delete settings.programme_variant;
  delete settings.pending_variant;
  // Always use the baked-in sync endpoint — no manual setup needed
  settings.sync_url = getSyncUrl();
  settings.sync_key = SYNC_KEY;
  if (settings.user_id) {
    migrateProgrammeReferencesAtBoot(settings.user_id);
    ensureProfile();
    backfillSessionUids();
    syncDirty = readDirtyMarker(settings.user_id);
    registerLocalProfile({ user_id: settings.user_id, ...state.profile });
    safeSetItem(settingsKey(settings.user_id), JSON.stringify(settings));
    writeStateBlob(settings.user_id, JSON.stringify(state));
  } else {
    syncDirty = false;
  }
}

// ---- One writer at a time ----------------------------------------------
// Every state write carries a monotonic counter and the id of the context that
// wrote it, in their own small key. persistLocal reads that counter back before
// it writes: a counter higher than the one this context loaded means another
// tab, window or the native shell wrote in the meantime, and a blind write
// would erase it (measured 2026-09-23 — three logged sets destroyed by one
// settings tap in a second tab).
const WRITER_ID = Math.random().toString(36).slice(2, 10);
let stateSeq = 0;
let foreignWriteSeen = false;
let staleToastShown = false;
function readStateSeq(userId) {
  const raw = safeGetItem(stateSeqKey(userId)) || '';
  const seq = parseInt(String(raw).split('|')[0], 10);
  return Number.isFinite(seq) ? seq : 0;
}
function writeStateBlob(userId, text) {
  const ok = safeSetItem(stateKey(userId), text);
  if (!ok) return false;
  stateSeq = Math.max(readStateSeq(userId), stateSeq) + 1;
  safeSetItem(stateSeqKey(userId), `${stateSeq}|${WRITER_ID}`);
  foreignWriteSeen = false;
  return true;
}
// The `storage` event fires in every OTHER context, never in the writer. It is
// the second fence: if the counter key itself could not be written (a full
// phone), this still tells us someone else is writing.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (!event || !settings.user_id) return;
    if (event.key !== stateKey(settings.user_id) && event.key !== stateSeqKey(settings.user_id)) return;
    foreignWriteSeen = true;
  });
}
function adoptForeignState(userId) {
  let disk;
  try {
    const parsed = JSON.parse(safeGetItem(stateKey(userId)) || 'null');
    disk = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) { disk = null; }
  // A blob we cannot read is NOT a reason to overwrite it from here: loadLocal
  // owns that decision (quarantine), and this path holds a good state anyway.
  if (!disk) return;
  const merged = mergeLocalStates(state, disk);
  const changed = mergeChangedOurs(state, merged);
  state = merged;
  stateSeq = readStateSeq(userId);
  if (changed && !staleToastShown) {
    staleToastShown = true;
    toast(t('state_merged_other_tab'), 6000);
  }
}
export function persistLocal(opts = {}) {
  if (!settings.user_id) return false;
  // Quarantined: the only writes allowed now are the ones he asks for by
  // choosing a restore, and those clear the flag first.
  if (stateCorrupt) return false;
  const { authoritative = false } = opts;
  // A restore (revision / import / undo) is the user replacing everything on
  // purpose; merging another tab's copy back in would undo exactly that.
  if (!authoritative && (foreignWriteSeen || readStateSeq(settings.user_id) > stateSeq)) {
    adoptForeignState(settings.user_id);
  }
  const now = new Date().toISOString();
  state.last_sync = now;
  settings.sync_url = getSyncUrl();
  settings.sync_key = SYNC_KEY;
  ensureProfile();
  backfillSessionUids();
  // The state write is the save. When it fails there is nothing to stamp a
  // «saved at» on and no profile row to refresh — writing those anyway is how
  // a phone that saved nothing still looked saved.
  if (!writeStateBlob(settings.user_id, JSON.stringify(state))) return false;
  safeSetItem(settingsKey(settings.user_id), JSON.stringify(settings));
  safeSetItem(lastWriteKey(settings.user_id), now);
  registerLocalProfile({ user_id: settings.user_id, ...state.profile });
  return true;
}
// Headroom, NOT pruning.
const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024;
const STORAGE_WARN_RATIO = 0.7;
let storageWarned = false;
function appStorageBytes() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('raedworkouts.')) continue;
      // UTF-16 code units: two bytes each, which is how browsers actually count.
      total += (key.length + (localStorage.getItem(key) || '').length) * 2;
    }
  } catch (_) { return 0; }
  return total;
}
export function checkStorageHeadroom() {
  if (storageWarned || storageFailed) return;
  const used = appStorageBytes();
  if (used < STORAGE_BUDGET_BYTES * STORAGE_WARN_RATIO) return;
  storageWarned = true;
  const mb = (used / (1024 * 1024)).toFixed(1);
  console.warn('[raedworkouts] local storage at ' + mb + 'MB of ~5MB');
  toast(tf('storage_getting_full', { mb }), 9000);
}

export function markDirty() {
  syncDirty = true;
  writeDirtyMarker(settings.user_id);
  setSyncStatus(navigator.onLine === false ? 'err' : 'off', navigator.onLine === false ? t('sync_pending_offline') : t('sync_pending'));
}
export function saveLocal(opts = {}) {
  const { sync = true, dirty = true, authoritative = false } = opts;
  // While the local blob is quarantined nothing is saved and nothing is
  // marked dirty: a dirty marker is a promise to push, and pushing an empty
  // state is precisely how the cloud copy was lost too.
  if (isStateCorrupt()) return false;
  persistLocal({ authoritative });
  if (dirty) markDirty();
  if (sync && dirty) schedulePush();
}
// Interaction log — his idea, and a better one than describing a problem in
// words: «وش رأيك تصير أنت تراقب الضغطات وأزراري ونجلس نسجل كم جلسة، وبعدين
// بعد كل جلسة أقول لك ها وش رأيك».
export const TAP_LOG_KEY = 'tap_log';
const TAP_LOG_MAX = 1200;
export function tapLogOn() { return settings.tap_log === true; }
export function recordTap(target) {
  if (!tapLogOn() || !target) return;
  try {
    // The most specific hook that names the CONTROL, in the order that says the
    // most about intent. data-* attributes are the app's own vocabulary, which
    // is why they beat class names for reading a session back.
    const el = target.closest('button, a, input, select, [role="button"]');
    if (!el) return;
    const named = el.closest('[data-runner-weight-input],[data-runner-reps-input]') ? null : el;
    const attr = named && [...named.attributes].find((a) => a.name.startsWith('data-') && a.name !== 'data-i18n');
    const label = attr ? attr.name.replace(/^data-/, '') : (el.className || el.tagName).toString().split(' ')[0];
    const log = state[TAP_LOG_KEY] = Array.isArray(state[TAP_LOG_KEY]) ? state[TAP_LOG_KEY] : [];
    log.push({
      t: new Date().toISOString(),
      what: String(label).slice(0, 48),
      where: (window.location.hash || '#home').replace('#', ''),
      // Whether a workout was running tells him more about a tap than anything
      // else on the screen.
      live: Boolean(state.active_session),
    });
    if (log.length > TAP_LOG_MAX) log.splice(0, log.length - TAP_LOG_MAX);
    // Rides the SAME 400ms debounce a weight edit uses: saveLocal() serialises
    // the whole state twice, and a log entry is never worth that between him and
    // the next set.
    scheduleSetEditPersist();
  } catch (_) { /* a log that throws is worse than no log */ }
}

