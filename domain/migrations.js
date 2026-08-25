import {
  appendEvent,
  canonicalUserKey,
  createEventLog,
  createSessionEvent,
  createSessionStatusEvent,
  createSetEvent,
  isUuid,
  newUuid,
} from './events.js';

export const CURRENT_SCHEMA_VERSION = 3;

function fail(message) {
  throw new Error(`Migration invariant failed: ${message}`);
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function asTimestamp(value, fallback) {
  const date = new Date(value || fallback);
  if (Number.isNaN(date.getTime())) return new Date(fallback).toISOString();
  return date.toISOString();
}

function sessionType(session) {
  if (session.session_type === 'upper' || session.session_type === 'lower') return session.session_type;
  return /leg|lower|quad|ham|glute/i.test(String(session.session_id || session.name || '')) ? 'lower' : 'upper';
}

function legacySets(session, makeId, userKey, sessionId, defaultCompletedAt) {
  const records = [];
  for (const [exerciseId, exercise] of Object.entries(session.exercises || {})) {
    for (const [index, set] of (exercise?.sets || []).entries()) {
      // v15 only had a completed flag. Pending UI rows remain represented in
      // legacy_v15; they are not fictional completed SetRecords in v16.
      if (!set?.completed) continue;
      records.push({
        userKey,
        set: {
          id: makeId(),
          session_id: sessionId,
          exercise_id: exerciseId,
          ordinal: index + 1,
          kind: set.is_warmup ? 'warmup' : 'working',
          weight_kg: Number(set.weight),
          reps: Number(set.reps),
          rir: null,
          legacy_rpe: set.rpe ?? null,
          completed_at: asTimestamp(set.completed_at, defaultCompletedAt),
          source: 'restored',
        },
      });
    }
  }
  return records;
}

/**
 * Pure with respect to its arguments: no storage, downloads, or mutation.
 * The id factory is injected by the runner so an old snapshot gains real UUIDs
 * once, rather than ever identifying a migrated session by its contents.
 */
export function migrateV15ToV16(state, version, { userKey, idFactory = newUuid, now = () => new Date().toISOString() } = {}) {
  if (version !== 2) fail(`v15 migration requires version 2, received ${version}`);
  const original = copy(state || {});
  const key = canonicalUserKey(userKey || original.user_key || original.profile?.display_name);
  if (!key) fail('v15 migration requires a canonical user key');
  const makeId = () => {
    const id = idFactory();
    if (!isUuid(id)) fail('idFactory must return UUIDs');
    return id;
  };
  let log = createEventLog({ userKey: key });
  const sessions = [
    ...(Array.isArray(original.history) ? original.history.map((session) => ({ session, status: 'complete' })) : []),
    ...(original.active_session ? [{ session: original.active_session, status: 'active' }] : []),
  ];

  for (const { session, status } of sessions) {
    if (!session || typeof session !== 'object') continue;
    const startedAt = asTimestamp(session.started_at || session.date, now());
    const sessionId = isUuid(session.id) ? session.id : makeId();
    const created = createSessionEvent({
      userKey: key,
      programmeId: session.programme_id || '',
      variant: session.variant || '',
      sessionType: sessionType(session),
      startedAt,
      sessionId,
      eventId: makeId(),
      deviceId: 'v15-migration',
      seq: 0,
    });
    log = appendEvent(log, created);
    for (const [offset, record] of legacySets(session, makeId, key, sessionId, session.ended_at || startedAt).entries()) {
      log = appendEvent(log, createSetEvent({
        ...record,
        eventId: makeId(),
        createdAt: record.set.completed_at,
        deviceId: 'v15-migration',
        seq: offset + 1,
      }));
    }
    if (status === 'complete') {
      log = appendEvent(log, createSessionStatusEvent({
        userKey: key,
        sessionId,
        status: 'complete',
        endedAt: asTimestamp(session.ended_at, startedAt),
        eventId: makeId(),
        createdAt: asTimestamp(session.ended_at, startedAt),
        deviceId: 'v15-migration',
        seq: 999999,
      }));
    }
  }

  const { history, active_session, ...stateWithoutLegacySessions } = original;
  const migrated = {
    ...stateWithoutLegacySessions,
    schema_version: CURRENT_SCHEMA_VERSION,
    user_key: key,
    event_log: { user_key: log.user_key, events: log.events },
    // This cache is reproducible from event_log and must never be written to
    // as an independent source of truth.
    snapshot: log.snapshot,
    legacy_v15: { history: history || [], active_session: active_session || null },
  };
  return Object.freeze({ state: migrated, version: CURRENT_SCHEMA_VERSION });
}

export const MIGRATIONS = Object.freeze([
  Object.freeze({ from: 2, to: 3, apply: migrateV15ToV16 }),
]);

export function timestampedExportName(now, prefix = 'raedworkouts-pre-migration') {
  const iso = asTimestamp(now, new Date().toISOString()).replace(/[:.]/g, '-');
  return `${prefix}-${iso}.json`;
}

/**
 * Runs ordered migrations only after synchronously handing the untouched state
 * to the export adapter. Callers must provide that adapter; proceeding without
 * an export is deliberately impossible.
 */
export function runMigrations(state, {
  userKey,
  exportState,
  idFactory = newUuid,
  now = () => new Date().toISOString(),
} = {}) {
  const original = copy(state || {});
  let version = Number(original.schema_version ?? 2);
  if (!Number.isInteger(version) || version < 1) fail('schema_version must be a positive integer');
  if (version > CURRENT_SCHEMA_VERSION) {
    return Object.freeze({
      status: 'read_only',
      message: `This data is from schema version ${version}, newer than this app supports (${CURRENT_SCHEMA_VERSION}). It was not merged or modified.`,
      state: original,
      version,
      export: null,
    });
  }
  if (version === CURRENT_SCHEMA_VERSION) {
    return Object.freeze({ status: 'current', message: 'Schema is current.', state: original, version, export: null });
  }
  if (typeof exportState !== 'function') fail('automatic pre-migration export adapter is required');

  const exportedAt = asTimestamp(now(), new Date().toISOString());
  const exportRecord = Object.freeze({
    filename: timestampedExportName(exportedAt),
    created_at: exportedAt,
    state: copy(original),
  });
  // Intentionally before even selecting/running the first migration.
  exportState(exportRecord);

  let working = original;
  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS.find((candidate) => candidate.from === version);
    if (!migration) fail(`no ordered migration exists from schema version ${version}`);
    const result = migration.apply(working, version, { userKey, idFactory, now });
    if (!result || result.version !== migration.to) fail(`migration ${migration.from}->${migration.to} returned an invalid version`);
    working = result.state;
    version = result.version;
  }
  return Object.freeze({ status: 'migrated', message: 'Migration completed from exported source state.', state: working, version, export: exportRecord });
}
