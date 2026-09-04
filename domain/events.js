/** Append-only event log and derived snapshot reducer for v16. */

export const EVENT_TYPES = Object.freeze({
  SESSION_CREATED: 'session.created',
  SESSION_STATUS_CHANGED: 'session.status_changed',
  SET_LOGGED: 'set.logged',
  ENTITY_UPSERTED: 'entity.upserted',
  TOMBSTONE_CREATED: 'tombstone.created',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COUNTED_KINDS = new Set(['working', 'calibration']);
const EFFORT_LEVELS = new Set(['easy', 'medium', 'very_hard']);

export function canonicalUserKey(userId) {
  return String(userId || '').trim().toLocaleLowerCase();
}

export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

export function newUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error('crypto.randomUUID is required; identifiers must not be derived from workout content');
}

function fail(message) {
  throw new Error(`Event log invariant failed: ${message}`);
}

function frozenCopy(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

function timestamp(now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) fail('created_at must be a valid timestamp');
  return date.toISOString();
}

function assertUuid(value, field) {
  if (!isUuid(value)) fail(`${field} must be a UUID`);
}

function assertUserKey(userKey) {
  if (!canonicalUserKey(userKey)) fail('user_key is required');
}

function assertEvent(event) {
  if (!event || typeof event !== 'object') fail('event must be an object');
  assertUuid(event.id, 'event.id');
  assertUserKey(event.user_key);
  if (typeof event.type !== 'string' || !event.type) fail('event.type is required');
  if (!event.payload || typeof event.payload !== 'object') fail('event.payload is required');
  timestamp(event.created_at);
  if (event.device_id != null && typeof event.device_id !== 'string') fail('event.device_id must be a string');
  if (event.seq != null && (!Number.isInteger(event.seq) || event.seq < 0)) fail('event.seq must be a non-negative integer');
}

function eventOrder(left, right) {
  const time = new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  if (time) return time;
  const device = String(left.device_id || '').localeCompare(String(right.device_id || ''));
  if (device) return device;
  const sequence = Number(left.seq || 0) - Number(right.seq || 0);
  if (sequence) return sequence;
  return left.id.localeCompare(right.id);
}

function setIsValid(record, { isBodyweightExercise = () => false } = {}) {
  if (!COUNTED_KINDS.has(record.kind)) return record.valid !== false;
  const reps = Number(record.reps);
  const weight = Number(record.weight_kg);
  return reps >= 1 && (weight > 0 || Boolean(isBodyweightExercise(record.exercise_id)));
}

/** The canonical corrupt-row rule; invalid records are retained, never deleted. */
export function normaliseSetRecord(record, options = {}) {
  if (!record || typeof record !== 'object') fail('set record must be an object');
  assertUuid(record.id, 'set.id');
  assertUuid(record.session_id, 'set.session_id');
  if (typeof record.exercise_id !== 'string' || !record.exercise_id) fail('set.exercise_id is required');
  if (!Number.isInteger(Number(record.ordinal)) || Number(record.ordinal) < 1) fail('set.ordinal must be a positive integer');
  if (!['warmup', 'working', 'calibration'].includes(record.kind)) fail('set.kind must be warmup, working, or calibration');
  const normalised = {
    ...record,
    ordinal: Number(record.ordinal),
    weight_kg: Number(record.weight_kg),
    reps: Number(record.reps),
    rir: record.rir == null || record.rir === '' ? null : Number(record.rir),
    effort: record.effort == null || record.effort === '' ? null : String(record.effort),
    source: record.source || 'user',
    completed_at: timestamp(record.completed_at),
  };
  if (normalised.effort != null && !EFFORT_LEVELS.has(normalised.effort)) {
    fail('set.effort must be easy, medium, very_hard, or null');
  }
  normalised.valid = record.valid === false ? false : setIsValid(normalised, options);
  return frozenCopy(normalised);
}

function makeEvent({ id = newUuid(), userKey, type, payload, createdAt, deviceId = '', seq = 0 }) {
  const event = {
    id,
    user_key: canonicalUserKey(userKey),
    type,
    payload,
    created_at: timestamp(createdAt),
    device_id: deviceId,
    seq,
  };
  assertEvent(event);
  return frozenCopy(event);
}

export function createSessionEvent({
  userKey,
  programmeId,
  variant,
  sessionType,
  startedAt,
  sessionId = newUuid(),
  eventId = newUuid(),
  deviceId = '',
  seq = 0,
} = {}) {
  assertUuid(sessionId, 'session.id');
  if (!['upper', 'lower'].includes(sessionType)) fail('session.session_type must be upper or lower');
  const session = {
    id: sessionId,
    user_key: canonicalUserKey(userKey),
    programme_id: programmeId || '',
    variant: variant || '',
    session_type: sessionType,
    started_at: timestamp(startedAt),
    ended_at: null,
    status: 'active',
  };
  return makeEvent({ id: eventId, userKey, type: EVENT_TYPES.SESSION_CREATED, payload: { session }, createdAt: startedAt, deviceId, seq });
}

export function createSessionStatusEvent({ userKey, sessionId, status, endedAt = null, eventId = newUuid(), createdAt, deviceId = '', seq = 0 } = {}) {
  assertUuid(sessionId, 'session.id');
  if (!['complete', 'abandoned'].includes(status)) fail('completed session status must be complete or abandoned');
  return makeEvent({
    id: eventId,
    userKey,
    type: EVENT_TYPES.SESSION_STATUS_CHANGED,
    payload: { session_id: sessionId, status, ended_at: endedAt ? timestamp(endedAt) : timestamp(createdAt) },
    createdAt,
    deviceId,
    seq,
  });
}

export function createSetEvent({ userKey, set, eventId = newUuid(), createdAt, deviceId = '', seq = 0, isBodyweightExercise } = {}) {
  const record = normaliseSetRecord(set, { isBodyweightExercise });
  return makeEvent({ id: eventId, userKey, type: EVENT_TYPES.SET_LOGGED, payload: { set: record }, createdAt: createdAt || record.completed_at, deviceId, seq });
}

export function createEntityUpsertEvent({ userKey, targetType, entity, eventId = newUuid(), createdAt, deviceId = '', seq = 0 } = {}) {
  if (typeof targetType !== 'string' || !targetType) fail('entity target_type is required');
  if (!entity || typeof entity !== 'object' || !isUuid(entity.id)) fail('entity.id must be a UUID');
  return makeEvent({ id: eventId, userKey, type: EVENT_TYPES.ENTITY_UPSERTED, payload: { target_type: targetType, entity }, createdAt, deviceId, seq });
}

/** A deletion is data: it never relies on a key simply disappearing. */
export function createTombstoneEvent({ userKey, targetType, targetId, deletedAt, eventId = newUuid(), createdAt, deviceId = '', seq = 0 } = {}) {
  if (typeof targetType !== 'string' || !targetType) fail('tombstone.target_type is required');
  assertUuid(targetId, 'tombstone.target_id');
  const removedAt = timestamp(deletedAt || createdAt);
  return makeEvent({
    id: eventId,
    userKey,
    type: EVENT_TYPES.TOMBSTONE_CREATED,
    payload: { tombstone: { id: eventId, user_key: canonicalUserKey(userKey), target_type: targetType, target_id: targetId, deleted_at: removedAt } },
    createdAt: removedAt,
    deviceId,
    seq,
  });
}

export function createEventLog({ userKey, events = [] } = {}) {
  const key = canonicalUserKey(userKey);
  assertUserKey(key);
  return materialiseEventLog(key, events);
}

function materialiseEventLog(userKey, candidateEvents) {
  const unique = new Map();
  for (const event of candidateEvents || []) {
    assertEvent(event);
    if (canonicalUserKey(event.user_key) !== userKey) fail('all events in a log must belong to the same user_key');
    if (!unique.has(event.id)) unique.set(event.id, frozenCopy(event));
  }
  const events = Object.freeze([...unique.values()].sort(eventOrder));
  return Object.freeze({ user_key: userKey, events, snapshot: deriveSnapshot(events, userKey) });
}

/** Idempotent by event id. Re-sending the same event leaves the log unchanged. */
export function appendEvent(log, event) {
  if (!log?.user_key || !Array.isArray(log.events)) fail('appendEvent requires an event log');
  assertEvent(event);
  if (canonicalUserKey(event.user_key) !== canonicalUserKey(log.user_key)) fail('cannot append another user\'s event');
  if (log.events.some((existing) => existing.id === event.id)) return log;
  return materialiseEventLog(canonicalUserKey(log.user_key), [...log.events, event]);
}

/**
 * Pull reconciliation is a union of immutable events, never a remote snapshot
 * replacement. Therefore a local event created during a pull cannot vanish.
 */
export function reconcileEventLogs(localLog, remoteLog) {
  if (!localLog) return remoteLog;
  if (!remoteLog) return localLog;
  const userKey = canonicalUserKey(localLog.user_key);
  if (userKey !== canonicalUserKey(remoteLog.user_key)) fail('cannot reconcile different users');
  return materialiseEventLog(userKey, [...localLog.events, ...remoteLog.events]);
}

export const mergeEventLogs = reconcileEventLogs;

function tombstoneKey(targetType, targetId) {
  return `${targetType}:${targetId}`;
}

/** Rebuilds the cache from events. The result is never used as source data. */
export function deriveSnapshot(events, userKey = '') {
  const sessions = new Map();
  const sets = new Map();
  const entities = new Map();
  const tombstones = new Map();

  for (const event of [...(events || [])].sort(eventOrder)) {
    switch (event.type) {
      case EVENT_TYPES.SESSION_CREATED: {
        const session = event.payload.session;
        if (session?.id) sessions.set(session.id, frozenCopy(session));
        break;
      }
      case EVENT_TYPES.SESSION_STATUS_CHANGED: {
        const current = sessions.get(event.payload.session_id);
        if (current) sessions.set(current.id, frozenCopy({ ...current, status: event.payload.status, ended_at: event.payload.ended_at }));
        break;
      }
      case EVENT_TYPES.SET_LOGGED: {
        const set = event.payload.set;
        if (set?.id) sets.set(set.id, frozenCopy(set));
        break;
      }
      case EVENT_TYPES.ENTITY_UPSERTED: {
        const { target_type: targetType, entity } = event.payload;
        if (targetType && entity?.id) entities.set(tombstoneKey(targetType, entity.id), frozenCopy(entity));
        break;
      }
      case EVENT_TYPES.TOMBSTONE_CREATED: {
        const tombstone = event.payload.tombstone;
        if (tombstone?.target_type && tombstone?.target_id) {
          tombstones.set(tombstoneKey(tombstone.target_type, tombstone.target_id), frozenCopy(tombstone));
        }
        break;
      }
      default:
        // Unknown event types remain in the log for forward compatibility but
        // cannot mutate this older snapshot reducer.
        break;
    }
  }

  for (const tombstone of tombstones.values()) {
    if (tombstone.target_type === 'session') sessions.delete(tombstone.target_id);
    if (tombstone.target_type === 'set') sets.delete(tombstone.target_id);
    entities.delete(tombstoneKey(tombstone.target_type, tombstone.target_id));
  }
  for (const [setId, set] of sets) {
    if (!sessions.has(set.session_id)) sets.delete(setId);
  }

  const setList = [...sets.values()].sort((left, right) => left.completed_at.localeCompare(right.completed_at) || left.id.localeCompare(right.id));
  const sessionList = [...sessions.values()].sort((left, right) => left.started_at.localeCompare(right.started_at) || left.id.localeCompare(right.id));
  const entitiesByType = {};
  for (const [key, entity] of entities) {
    const [targetType] = key.split(':', 1);
    (entitiesByType[targetType] ||= []).push(entity);
  }
  return frozenCopy({
    user_key: canonicalUserKey(userKey),
    sessions: sessionList,
    sets: setList,
    entities: entitiesByType,
    tombstones: [...tombstones.values()],
  });
}

export function workingSetRecords(logOrSnapshot) {
  const snapshot = logOrSnapshot?.snapshot || logOrSnapshot;
  return (snapshot?.sets || []).filter((set) => COUNTED_KINDS.has(set.kind) && set.valid !== false);
}
