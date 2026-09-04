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
  // Zero is a real load: plenty of machines carry their own stack and Raed logs
  // 0 for those. The old rule was `weight > 0`, which silently discarded those
  // sets from volume, streak and progression.
  //
  // The reason it said `> 0` still matters though: an UNTOUCHED box holds '',
  // and Number('') is 0. So blank and zero have to be told apart BEFORE the
  // numeric check, or every empty set would start counting as a completed one.
  const raw = set.weight;
  if (raw === '' || raw === null || raw === undefined) return false;
  const weight = Number(raw);
  const reps = Number(set.reps);
  return Number.isFinite(weight) && weight >= 0 && Number.isFinite(reps) && reps >= 1;
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

// A skip is a record of the work he did NOT do. It must never retract work he
// did.
//
// This used to rewrite EVERY non-warmup set to completed:false + skipped:true,
// including sets he had already ticked. Proven by running this module: leg press
// with 100kg x 12 and 100kg x 11 logged and a third set still open went from two
// countable sets to zero the moment he tapped «تخطي التمرين» — which is the
// realistic case, because you skip an exercise when someone takes the machine
// half way through. Those two sets then disappeared from the session stats, the
// weekly volume, the per-exercise history, and from suggestNextWeight, so the
// next Lower A would also have suggested the wrong load.
//
// The whole suite stayed green because tests/overnight-runner.test.mjs only ever
// skips sets that were already completed:false.
//
// Completed sets are now left exactly as they are. Only the sets he never did
// are marked skipped.
export function skipRunnerExercise(exercise = {}, skippedAt) {
  return {
    ...exercise,
    skipped: true,
    skipped_at: skippedAt,
    sets: (exercise.sets || []).map((set) => {
      if (set.is_warmup || set.completed === true) return set;
      return {
        ...set,
        completed: false,
        skipped: true,
        skipped_at: skippedAt,
        invalid_prompted: false,
      };
    }),
  };
}
