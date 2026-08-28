/*
 * Runner set-state policy.
 *
 * A gym interaction must not be collapsed into a fabricated zero-weight set:
 * valid work logs, an unavailable machine is explicitly skipped, and an
 * invalid entry is retained only after the runner has asked once.  The app
 * stores this snapshot model today; keeping the classification pure makes the
 * eventual event-log adapter use the identical rules.
 */

export function hasValidWorkingValues(set = {}) {
  const weight = Number(set.weight);
  const reps = Number(set.reps);
  return Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps >= 1;
}

export function isCountableWorkingSet(set = {}) {
  return !set.is_warmup && set.completed === true && !set.skipped && !set.invalid && hasValidWorkingValues(set);
}

export function isRunnerSetResolved(set = {}) {
  if (set.is_warmup) return set.completed === true || set.skipped === true;
  return isCountableWorkingSet(set) || set.skipped === true || Boolean(set.invalid);
}

export function isRunnerExerciseResolved(exercise = {}) {
  if (exercise.skipped === true) return true;
  const working = (exercise.sets || []).filter((set) => !set.is_warmup);
  return working.length > 0 && working.every(isRunnerSetResolved);
}

/**
 * First invalid action only asks. A second deliberate action stores the
 * invalid entry as evidence, but never marks it complete or countable.
 */
export function applyWorkingSetAttempt(set = {}, recordedAt) {
  if (hasValidWorkingValues(set)) {
    return {
      outcome: 'logged',
      set: {
        ...set,
        completed: true,
        skipped: false,
        invalid: null,
        invalid_prompted: false,
      },
    };
  }
  if (set.invalid_prompted) {
    return {
      outcome: 'stored-invalid',
      set: {
        ...set,
        completed: false,
        skipped: false,
        invalid_prompted: false,
        invalid: {
          reason: 'weight_kg_and_reps_required',
          recorded_at: recordedAt,
        },
      },
    };
  }
  return {
    outcome: 'confirm-invalid',
    set: {
      ...set,
      completed: false,
      invalid: null,
      invalid_prompted: true,
    },
  };
}

export function skipRunnerExercise(exercise = {}, skippedAt) {
  return {
    ...exercise,
    skipped: true,
    skipped_at: skippedAt,
    sets: (exercise.sets || []).map((set) => (set.is_warmup ? set : {
      ...set,
      completed: false,
      skipped: true,
      skipped_at: skippedAt,
      invalid_prompted: false,
    })),
  };
}
