/**
 * Versioned, static exercise catalogue domain.
 *
 * `loadCatalogue` is deliberately fed from the existing data.js library during
 * the v15 -> v16 bridge.  It keeps that library immutable while making the
 * v16 representation explicit and independently testable.
 */

export const DEFAULT_EQUIPMENT_STEP_KG = 2.5;
export const EQUIPMENT_STEP_CONFIDENCE_MINIMUM = 3;

const VIDEO_CONFIDENCE = new Set(['source_linked', 'manual']);
const DIRECT_YOUTUBE = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/)|youtu\.be\/)[A-Za-z0-9_-]{11}(?:[?&#/].*)?$/i;

const PATTERN_MAP = Object.freeze({
  compound_quad: 'lower_compound',
  compound_hinge: 'hinge',
  compound_push: 'upper_press',
  horizontal_push: 'upper_press',
  vertical_push: 'upper_press',
  horizontal_pull: 'upper_pull',
  vertical_pull: 'upper_pull',
  isolation_push: 'isolation',
  isolation_pull: 'isolation',
  isolation_quad: 'isolation',
  isolation_hamstring: 'isolation',
  isolation_calf: 'isolation',
  isolation_core: 'core',
});

const COMPOUND_PATTERNS = new Set(['lower_compound', 'hinge', 'upper_press', 'upper_pull']);

function fail(message) {
  throw new Error(`Catalogue invariant failed: ${message}`);
}

function cloneLegacy(value) {
  return Object.freeze(JSON.parse(JSON.stringify(value)));
}

function primaryFrom(exercise) {
  const value = exercise.primary_muscle ?? exercise.primary;
  if (Array.isArray(value)) {
    if (value.length !== 1 || typeof value[0] !== 'string' || !value[0].trim()) {
      fail(`exercise "${exercise.id || '(missing id)'}" must have exactly one primary muscle; received ${JSON.stringify(value)}`);
    }
    return value[0];
  }
  if (typeof value !== 'string' || !value.trim()) {
    fail(`exercise "${exercise.id || '(missing id)'}" must have exactly one primary muscle; received ${JSON.stringify(value)}`);
  }
  return value;
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}

function canonicalPattern(legacyPattern) {
  return PATTERN_MAP[legacyPattern] || legacyPattern || 'isolation';
}

function isDirectYoutubeLink(url) {
  return typeof url === 'string' && DIRECT_YOUTUBE.test(url.trim());
}

function youtubeIdFromUrl(url) {
  if (!isDirectYoutubeLink(url)) return null;
  const match = url.match(/(?:v=|shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
  return match?.[1] || null;
}

function videoId(exerciseId, source, index) {
  return `${exerciseId}:${source}:${index + 1}`;
}

function legacyVideoRecords(exercise) {
  const videos = [];
  for (const [index, youtubeId] of (exercise.mohannad || []).entries()) {
    if (typeof youtubeId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(youtubeId)) continue;
    videos.push(Object.freeze({
      id: videoId(exercise.id, 'mohannad', index),
      youtube_id: youtubeId,
      start_seconds: null,
      source: 'manual',
      confidence: 'manual',
      label: { en: `Mohannad — video ${index + 1}`, ar: `مهند — فيديو ${index + 1}` },
    }));
  }

  // v15 used a YouTube results page as a fallback for nine exercises. A
  // search is neither a direct clip nor a confidence tier, so it is retained
  // only in legacy metadata and deliberately not promoted to `videos`.
  if (isDirectYoutubeLink(exercise.jeff_nippard)) {
    videos.push(Object.freeze({
      id: videoId(exercise.id, 'jeff_nippard', 0),
      youtube_id: youtubeIdFromUrl(exercise.jeff_nippard),
      start_seconds: null,
      source: 'manual',
      confidence: 'manual',
      label: { en: 'Jeff Nippard', ar: 'جيف نيبارد' },
    }));
  }
  return Object.freeze(videos);
}

/** Validates canonical and legacy-shaped entries; throws loudly on bad input. */
export function validateCatalogue(exercises) {
  if (!Array.isArray(exercises)) fail('catalogue must be an array');
  const ids = new Set();
  for (const exercise of exercises) {
    if (!exercise || typeof exercise !== 'object') fail('catalogue contains a non-object entry');
    if (typeof exercise.id !== 'string' || !exercise.id.trim()) fail('every exercise requires a stable id');
    if (ids.has(exercise.id)) fail(`duplicate exercise id "${exercise.id}"`);
    ids.add(exercise.id);
    primaryFrom(exercise);
    const videos = exercise.video_records || exercise.videos || [];
    for (const video of videos) {
      if (!VIDEO_CONFIDENCE.has(video.confidence)) {
        fail(`video "${video.id || '(missing id)'}" must be source_linked or manual, never guessed`);
      }
    }
  }
  return true;
}

/**
 * Converts one untouched v15 exercise record to the v16 static shape.  The
 * original record is retained verbatim under `legacy`, and compatibility
 * fields such as name_ar, cue, mohannad, and jeff_nippard remain available.
 */
export function migrateLegacyExercise(legacyExercise) {
  if (!legacyExercise || typeof legacyExercise !== 'object') fail('cannot migrate a non-object exercise');
  const primary = primaryFrom(legacyExercise);
  const videoRecords = legacyVideoRecords(legacyExercise);
  const original = cloneLegacy(legacyExercise);
  const nameEn = String(legacyExercise.name || '').trim();
  if (!nameEn) fail(`exercise "${legacyExercise.id || '(missing id)'}" needs an English name`);

  const canonical = {
    ...legacyExercise,
    legacy: original,
    // Canonical locale maps, alongside the legacy string fields above.
    name: { en: nameEn, ar: legacyExercise.name_ar || '' },
    name_en: nameEn,
    name_ar: legacyExercise.name_ar || '',
    aliases: uniqueStrings([nameEn, legacyExercise.name_ar, ...(legacyExercise.aliases || [])]),
    primary_muscle: primary,
    secondary_muscles: uniqueStrings(legacyExercise.secondary || legacyExercise.secondary_muscles || []),
    canonical_pattern: canonicalPattern(legacyExercise.pattern),
    equipment_step_kg: DEFAULT_EQUIPMENT_STEP_KG,
    equipment_step: Object.freeze({
      kg: DEFAULT_EQUIPMENT_STEP_KG,
      source: 'default',
      provisional: true,
    }),
    equipment_step_provisional: true,
    cue: { en: legacyExercise.cue || '', ar: legacyExercise.cue_ar || '' },
    cue_en: legacyExercise.cue || '',
    cue_ar: legacyExercise.cue_ar || '',
    videos: Object.freeze(videoRecords.map((video) => video.id)),
    video_records: videoRecords,
    substitutes: Object.freeze([...(legacyExercise.alternatives || legacyExercise.substitutes || [])]),
  };
  validateCatalogue([canonical]);
  return Object.freeze(canonical);
}

/** Load all migrated exercises and make lookup aliases deterministic. */
export function loadCatalogue(legacyExercises) {
  validateCatalogue(legacyExercises);
  const exercises = Object.freeze(legacyExercises.map(migrateLegacyExercise));
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const byAlias = new Map();
  for (const exercise of exercises) {
    for (const alias of exercise.aliases) byAlias.set(alias.trim().toLocaleLowerCase(), exercise);
  }
  const videos = Object.freeze(exercises.flatMap((exercise) => exercise.video_records));
  return Object.freeze({
    exercises,
    videos,
    byId,
    byAlias,
    get(idOrAlias) {
      if (typeof idOrAlias !== 'string') return null;
      return byId.get(idOrAlias) || byAlias.get(idOrAlias.trim().toLocaleLowerCase()) || null;
    },
  });
}

function positiveStep(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function gcd(left, right) {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b) [a, b] = [b, a % b];
  return a;
}

function weightFromObservation(observation) {
  if (typeof observation === 'number') return observation;
  if (!observation || typeof observation !== 'object') return null;
  if (observation.valid === false) return null;
  if (observation.kind && observation.kind !== 'working' && observation.kind !== 'calibration') return null;
  return Number(observation.weight_kg ?? observation.weight);
}

/**
 * Learns the true equipment increment only after three distinct valid working
 * loads. Values are scaled to grams before GCD so 2.5 kg never suffers a
 * floating-point rounding error. A manual choice always wins.
 */
/**
 * Increments learning is allowed to infer, largest first.
 *
 * All are COARSER than or equal to the 2.5 kg default, and that is deliberate.
 * Divisibility cannot tell a 1 kg micro-loaded machine from four mistyped whole
 * numbers — [10,11,12,13] and [31,37,43,47] both divide by 1 exactly — so any
 * rule that can infer a finer step will eventually infer one from bad data and
 * quietly widen the safety envelope. Inferring a COARSER step is safe in the
 * other direction: the worst case is a slightly conservative suggested weight.
 * A genuinely finer increment is set by manual override, where Raed states it.
 */
const LEARNABLE_STEPS_MILLI = [5000, 2500];

/** Share of logged weights a candidate step must divide before it is trusted. */
const STEP_AGREEMENT = 0.8;

/**
 * Largest learnable increment that divides most observed weights.
 * `weights` are integer thousandths-of-kg, already de-duplicated and sorted.
 */
function learnPlausibleStep(weights) {
  for (const step of LEARNABLE_STEPS_MILLI) {
    const explains = weights.filter((weight) => weight % step === 0).length;
    if (explains / weights.length >= STEP_AGREEMENT) {
      return { kg: step / 1000, explains };
    }
  }
  return null;
}

export function resolveEquipmentStep(exercise, {
  manualStepKg = null,
  observations = [],
  minimumDistinctWeights = EQUIPMENT_STEP_CONFIDENCE_MINIMUM,
} = {}) {
  const manual = positiveStep(manualStepKg);
  if (manual) return Object.freeze({ kg: manual, source: 'manual', provisional: false, observations: 0 });

  const weights = [...new Set(observations
    .map(weightFromObservation)
    .filter((weight) => Number.isFinite(weight) && weight > 0)
    .map((weight) => Math.round(weight * 1000)))]
    .sort((a, b) => a - b);

  if (weights.length >= minimumDistinctWeights) {
    // A plain GCD is not robust: one odd entry (a mis-tap, a different gym, a
    // plate-loaded machine) collapses [30, 32.5, 35, 41] to a 0.5 kg step and
    // marks it confirmed — worse than the 2.5 kg default, because the app would
    // then propose 30.5 kg on a machine that only moves in fives.
    // So: only ever learn a step that real equipment actually uses, take the
    // largest such step that explains a clear majority of what he logged, and
    // treat the remainder as outliers rather than as evidence.
    const learned = learnPlausibleStep(weights);
    if (learned) {
      return Object.freeze({
        kg: learned.kg,
        source: 'learned',
        provisional: false,
        observations: weights.length,
        explains: learned.explains,
      });
    }
  }

  return Object.freeze({
    kg: positiveStep(exercise?.equipment_step_kg) || DEFAULT_EQUIPMENT_STEP_KG,
    source: 'default',
    provisional: true,
    observations: weights.length,
  });
}

export function roundDownToEquipmentStep(weightKg, stepKg = DEFAULT_EQUIPMENT_STEP_KG) {
  const weight = Number(weightKg);
  const step = positiveStep(stepKg);
  if (!Number.isFinite(weight) || weight <= 0 || !step) return null;
  return Math.floor((weight + 1e-9) / step) * step;
}

/** User-confirmed general warm-up uses ten reps for each rep-based drill. */
export const WARMUP_DRILLS = Object.freeze([
  Object.freeze({ id: 'low_intensity_cardio', session_types: ['upper', 'lower', 'push', 'pull', 'legs', 'full_body'], movement: 'Low intensity cardio', sets: null, reps: null, load_pct: null, duration_s: 300, source: 'PPL L:1365' }),
  Object.freeze({ id: 'arm_swings', session_types: ['upper', 'lower', 'push', 'pull', 'legs', 'full_body'], movement: 'Arm swings', sets: 1, reps: 10, load_pct: null, duration_s: null, source: 'Raed decision 2026-08-25; PPL L:1388 / ML L:11098' }),
  Object.freeze({ id: 'arm_circles', session_types: ['upper', 'lower', 'push', 'pull', 'legs', 'full_body'], movement: 'Arm circles', sets: 1, reps: 10, load_pct: null, duration_s: null, source: 'Raed decision 2026-08-25; ML L:11107' }),
  Object.freeze({ id: 'front_back_leg_swings', session_types: ['lower', 'legs', 'full_body'], movement: 'Front/back leg swings', sets: 1, reps: 10, load_pct: null, duration_s: null, source: 'Raed decision 2026-08-25; PPL L:1370' }),
  Object.freeze({ id: 'side_side_leg_swings', session_types: ['lower', 'legs', 'full_body'], movement: 'Side/side leg swings', sets: 1, reps: 10, load_pct: null, duration_s: null, source: 'Raed decision 2026-08-25; PPL L:1379' }),
  Object.freeze({ id: 'cable_external_rotation', session_types: ['upper', 'lower', 'push', 'pull', 'legs', 'full_body'], movement: 'Cable external rotation', sets: 1, reps: 10, load_pct: null, duration_s: null, source: 'Raed decision 2026-08-25; PPL L:1393' }),
]);

export function warmupDrillsFor(sessionType) {
  return WARMUP_DRILLS.filter((drill) => drill.session_types.includes(sessionType));
}

/**
 * Prescribes ramp sets. A repeated pattern gets zero sets before any other
 * branch, as required by the PPL source and Raed's confirmed decision.
 */
export function rampPrescription(exercise, {
  workingWeightKg = null,
  warmedPatterns = [],
  equipmentStepKg = exercise?.equipment_step_kg || DEFAULT_EQUIPMENT_STEP_KG,
  triviallyLight = false,
  isolationRamp = true,
} = {}) {
  if (!exercise) fail('cannot prescribe a ramp for an unknown exercise');
  const pattern = exercise.canonical_pattern || canonicalPattern(exercise.pattern);
  const repeatedPattern = warmedPatterns.includes(pattern);
  if (repeatedPattern || triviallyLight || (!COMPOUND_PATTERNS.has(pattern) && !isolationRamp)) {
    return Object.freeze([]);
  }
  const rows = COMPOUND_PATTERNS.has(pattern)
    ? [{ load_pct: 50, reps: { min: 6, max: 10 } }, { load_pct: 70, reps: { min: 4, max: 6 } }]
    : [{ load_pct: 60, reps: { min: 6, max: 10 } }];
  return Object.freeze(rows.map((row) => Object.freeze({
    kind: 'warmup',
    ...row,
    weight_kg: Number.isFinite(Number(workingWeightKg))
      ? roundDownToEquipmentStep(Number(workingWeightKg) * (row.load_pct / 100), equipmentStepKg)
      : null,
  })));
}

export function programmedRepRange(exercise) {
  const pattern = exercise?.canonical_pattern || canonicalPattern(exercise?.pattern);
  return Object.freeze(COMPOUND_PATTERNS.has(pattern) ? { min: 8, max: 10 } : { min: 10, max: 12 });
}
