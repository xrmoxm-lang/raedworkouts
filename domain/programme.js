/** Pure programme selection for history-driven session rotation. */

function fail(message) {
  throw new Error(`Programme invariant failed: ${message}`);
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * This migration version is deliberately independent of the event-log schema.
 * The app still stores its v15-compatible session snapshot, but D6 changes the
 * valid *planned* session ids.  Keeping this version separate avoids claiming
 * that an Upper/Lower scheduling change has migrated the event data model.
 */
export const PROGRAMME_REFERENCE_MIGRATION_VERSION = 1;

function sessionIdsForProgramme(programme) {
  if (!programme || typeof programme !== 'object') fail('programme is required');
  const sessions = Array.isArray(programme.blocks)
    ? programme.blocks.flatMap((block) => block?.sessions || [])
    : (programme.sessions || []);
  const ids = new Set(sessions.map((session) => session?.id).filter(Boolean));
  if (!ids.size) fail('programme has no session ids for reference migration');
  return ids;
}

/**
 * D6 migration 0 -> 1.  History is immutable evidence of what was performed;
 * it is intentionally not relabelled as a different Upper/Lower session.  The
 * history-driven resolver skips unmatched historic ids and starts at Upper A.
 * A one-shot forced-next id has no safe equivalent, so an invalid legacy value
 * is explicitly cleared instead of guessing a new session for the user.
 */
export function migrateProgrammeReferences(state, version, { programme } = {}) {
  if (version !== 0) fail(`programme reference migration requires version 0, received ${version}`);
  const original = copy(state || {});
  const validIds = sessionIdsForProgramme(programme);
  const forced = original.forced_next_session;
  const ignored = [];
  const migrated = {
    ...original,
    programme_reference_migration_version: PROGRAMME_REFERENCE_MIGRATION_VERSION,
  };
  if (forced && !validIds.has(forced)) {
    migrated.forced_next_session = null;
    ignored.push(`forced_next_session:${forced}`);
  }
  return Object.freeze({
    state: migrated,
    version: PROGRAMME_REFERENCE_MIGRATION_VERSION,
    ignored: Object.freeze(ignored),
  });
}

export const PROGRAMME_REFERENCE_MIGRATIONS = Object.freeze([
  Object.freeze({ from: 0, to: 1, apply: migrateProgrammeReferences }),
]);

export function programmeMigrationExportName(now, prefix = 'raedworkouts-pre-programme-migration') {
  const date = new Date(now || Date.now());
  if (Number.isNaN(date.getTime())) fail('programme migration export timestamp is invalid');
  return `${prefix}-${date.toISOString().replace(/[:.]/g, '-')}.json`;
}

/**
 * Ordered runner for the D6 planned-session migration.  As with the schema
 * runner, an export adapter is mandatory and receives the untouched state
 * synchronously before even selecting the first migration.
 */
export function runProgrammeReferenceMigrations(state, {
  programme,
  exportState,
  now = () => new Date().toISOString(),
} = {}) {
  const original = copy(state || {});
  let version = Number(original.programme_reference_migration_version ?? 0);
  if (!Number.isInteger(version) || version < 0) fail('programme reference migration version must be a non-negative integer');
  if (version > PROGRAMME_REFERENCE_MIGRATION_VERSION) {
    return Object.freeze({
      status: 'read_only',
      message: `Programme reference version ${version} is newer than this app supports (${PROGRAMME_REFERENCE_MIGRATION_VERSION}).`,
      state: original,
      version,
      export: null,
      ignored: Object.freeze([]),
    });
  }
  if (version === PROGRAMME_REFERENCE_MIGRATION_VERSION) {
    return Object.freeze({ status: 'current', message: 'Programme references are current.', state: original, version, export: null, ignored: Object.freeze([]) });
  }
  if (typeof exportState !== 'function') fail('automatic pre-programme-migration export adapter is required');

  const exportDate = new Date(now());
  if (Number.isNaN(exportDate.getTime())) fail('programme migration timestamp is invalid');
  const exportedAt = exportDate.toISOString();
  const exportRecord = Object.freeze({
    filename: programmeMigrationExportName(exportedAt),
    created_at: exportedAt,
    state: copy(original),
  });
  // Intentionally before migration selection and state mutation.
  exportState(exportRecord);

  let working = original;
  const ignored = [];
  while (version < PROGRAMME_REFERENCE_MIGRATION_VERSION) {
    const migration = PROGRAMME_REFERENCE_MIGRATIONS.find((candidate) => candidate.from === version);
    if (!migration) fail(`no ordered programme reference migration exists from version ${version}`);
    const result = migration.apply(working, version, { programme });
    if (!result || result.version !== migration.to) fail(`programme reference migration ${migration.from}->${migration.to} returned an invalid version`);
    working = result.state;
    ignored.push(...(result.ignored || []));
    version = result.version;
  }
  return Object.freeze({
    status: 'migrated',
    message: 'Programme references migrated from an exported source state.',
    state: working,
    version,
    export: exportRecord,
    ignored: Object.freeze(ignored),
  });
}

/** Selects the resolved programme block; weeks 5–8 select Block B. */
export function resolveProgrammeBlock(programme, { currentWeek = 1, currentBlock = 1 } = {}) {
  if (!programme || typeof programme !== 'object') fail('programme is required');
  if (!Array.isArray(programme.blocks) || !programme.blocks.length) return programme;
  const week = positiveInteger(currentWeek, 1);
  const requestedBlock = positiveInteger(currentBlock, 1);
  const selected = programme.blocks.find((block) => week >= block.week_start && week <= block.week_end)
    || programme.blocks.find((block) => block.block === requestedBlock)
    || programme.blocks.at(-1);
  if (!Array.isArray(selected.sessions) || !selected.sessions.length) fail(`block ${selected.id || selected.block} has no sessions`);
  return Object.freeze({
    ...programme,
    block: selected.block,
    block_name: selected.block_name,
    sessions: selected.sessions,
    active_block: selected.id,
  });
}

/**
 * Returns the session immediately after the most recent matching completion.
 * This intentionally indexes completed sessions, never weekdays, so a three-
 * session week continues the same Upper/Lower rotation into the next week.
 */
export function nextHistoryDrivenSession(programme, history = []) {
  if (!programme || !Array.isArray(programme.sessions) || !programme.sessions.length) {
    fail('programme sessions are required');
  }
  const order = Array.isArray(programme.rotation_order) && programme.rotation_order.length
    ? programme.rotation_order
    : programme.sessions.map((session) => session.id);
  const sessions = new Map(programme.sessions.map((session) => [session.id, session]));
  if (order.some((id) => !sessions.has(id))) fail('rotation order references an unknown session');

  let lastIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const candidate = order.indexOf(history[index]?.session_id);
    if (candidate >= 0) {
      lastIndex = candidate;
      break;
    }
  }
  const nextIndex = (lastIndex + 1) % order.length;
  return Object.freeze({ session: sessions.get(order[nextIndex]), index: nextIndex });
}
