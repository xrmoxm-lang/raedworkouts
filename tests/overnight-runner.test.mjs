import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  applyWorkingSetAttempt,
  hasValidWorkingValues,
  isCountableWorkingSet,
  isRunnerExerciseResolved,
  skipRunnerExercise,
} from '../domain/runner-session.js';

test('Overnight runner policy logs valid work, retains invalid input after one prompt, and makes skips non-zero/non-volume', () => {
  const timestamp = '2026-08-26T20:00:00.000Z';
  const valid = applyWorkingSetAttempt({ is_warmup: false, weight: 25, reps: 10 }, timestamp);
  assert.equal(valid.outcome, 'logged');
  assert.equal(valid.set.completed, true);
  assert.equal(isCountableWorkingSet(valid.set), true);

  const asked = applyWorkingSetAttempt({ is_warmup: false, weight: 0, reps: 10 }, timestamp);
  assert.equal(asked.outcome, 'confirm-invalid');
  assert.equal(asked.set.invalid, null);
  assert.equal(asked.set.invalid_prompted, true);
  const retained = applyWorkingSetAttempt(asked.set, timestamp);
  assert.equal(retained.outcome, 'stored-invalid');
  assert.deepEqual(retained.set.invalid, {
    reason: 'weight_kg_and_reps_required',
    recorded_at: timestamp,
  });
  assert.equal(retained.set.completed, false);
  assert.equal(isCountableWorkingSet(retained.set), false);

  const skipped = skipRunnerExercise({
    sets: [
      { is_warmup: false, weight: '', reps: 10, completed: false },
      { is_warmup: false, weight: 25, reps: 10, completed: false },
    ],
  }, timestamp);
  assert.equal(skipped.skipped, true);
  assert.ok(skipped.sets.every((set) => set.skipped && !set.completed));
  assert.ok(skipped.sets.every((set) => set.weight !== 0 && set.weight !== '0'));
  assert.ok(skipped.sets.every((set) => !isCountableWorkingSet(set)));
  assert.equal(isRunnerExerciseResolved(skipped), true);
  assert.equal(hasValidWorkingValues({ weight: 0, reps: 10 }), false);
  console.log('RUNNER_SKIP_POLICY_PASSED');
});

test('Overnight runner deployment precaches its imported policy modules under a new service-worker cache version', async () => {
  const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(source, /const VERSION = 'v21';/, 'a changed runner must not reuse the deployed v20 cache');
  assert.match(source, /'\.\/domain\/runner-session\.js'/);
  console.log('RUNNER_SERVICE_WORKER_FRESHNESS_PASSED');
});
