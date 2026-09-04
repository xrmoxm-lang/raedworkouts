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

  // 0 kg logs straight through now. Raed: "شخص يلعب بوزن الآلة يحط صفر يعني
  // يقبلها" — a machine carrying its own stack IS zero added load, and making
  // him confirm it every set (or type a fake 1) was the actual bug.
  const machineStack = applyWorkingSetAttempt({ is_warmup: false, weight: 0, reps: 10 }, timestamp);
  assert.equal(machineStack.outcome, 'logged');
  assert.equal(isCountableWorkingSet(machineStack.set), true);

  // The prompt belongs on an EMPTY box, which is the real "did you forget to
  // fill this in?" case, and is what `weight > 0` was clumsily standing in for.
  const asked = applyWorkingSetAttempt({ is_warmup: false, weight: '', reps: 10 }, timestamp);
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
  // 0 kg is a real logged load (machine's own stack), so it MUST count.
  assert.equal(hasValidWorkingValues({ weight: 0, reps: 10 }), true);
  // A blank box is not a zero. Number('') is 0, so these two have to stay
  // distinguishable or every untouched set would count as completed.
  assert.equal(hasValidWorkingValues({ weight: '', reps: 10 }), false);
  assert.equal(hasValidWorkingValues({ weight: null, reps: 10 }), false);
  assert.equal(hasValidWorkingValues({ weight: undefined, reps: 10 }), false);
  console.log('RUNNER_SKIP_POLICY_PASSED');
});

test('Overnight runner deployment precaches its imported policy modules under a new service-worker cache version', async () => {
  const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  // Pinning an exact version made this fail on every legitimate bump, which is
  // the opposite of what it is for. The durable rules are: the version is
  // well-formed, and every module app.js imports is precached — a module missing
  // from SHELL breaks the app offline, silently.
  assert.match(source, /const VERSION = 'v\d+';/, 'the service worker needs a well-formed cache version');
  const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const imported = [...appSource.matchAll(/from '(\.\/domain\/[^']+)'/g)].map((m) => m[1]);
  assert.ok(imported.length, 'expected app.js to import domain modules');
  for (const module of imported) {
    assert.ok(source.includes(`'${module}'`), `${module} is imported but missing from the service-worker SHELL, so the app breaks offline`);
  }
  assert.match(source, /'\.\/domain\/runner-session\.js'/);
  console.log('RUNNER_SERVICE_WORKER_FRESHNESS_PASSED');
});

test('an explicit zero counts and an untouched box does not — one rule, in the domain', () => {
  // The session card used to duplicate this rule with `weight > 0`, which is why
  // «وزن الجهاز فقط» sets could be created and never completed. Two copies of a
  // rule is how they drift; this asserts the domain owns it.
  assert.equal(hasValidWorkingValues({ weight: 0, reps: 10 }), true, 'a machine carrying its own stack is 0 added load');
  assert.equal(hasValidWorkingValues({ weight: '', reps: 10 }), false, 'an untouched box is not a zero');
  assert.equal(hasValidWorkingValues({ weight: null, reps: 10 }), false);
  assert.equal(hasValidWorkingValues({ weight: undefined, reps: 10 }), false);
  assert.equal(hasValidWorkingValues({ weight: 25, reps: '' }), false, 'reps are still required');
  assert.equal(hasValidWorkingValues({ weight: 0, reps: 0 }), false, 'zero reps is not a set');
});

// The test above skips an exercise whose sets were ALL still open, so it could
// never have caught this: skipRunnerExercise rewrote every non-warmup set to
// completed:false + skipped:true, including sets he had already ticked. Skipping
// leg press after two working sets — because someone took the machine — silently
// retracted both, and they left the session stats, the weekly volume, the
// per-exercise history and the next weight suggestion with them.
test('skipping an exercise records what he did NOT do, and never retracts what he did', () => {
  const at = '2026-09-04T09:00:00.000Z';
  const skipped = skipRunnerExercise({
    sets: [
      { is_warmup: true, weight: 60, reps: 10, completed: true },
      { is_warmup: false, weight: 100, reps: 12, completed: true },
      { is_warmup: false, weight: 100, reps: 11, completed: true },
      { is_warmup: false, weight: '', reps: 10, completed: false },
    ],
  }, at);

  const countable = skipped.sets.filter(isCountableWorkingSet);
  assert.equal(countable.length, 2, 'both logged sets must survive the skip');
  assert.deepEqual(countable.map((s) => `${s.weight}x${s.reps}`), ['100x12', '100x11']);

  // A completed set is left alone entirely — not even tagged.
  assert.equal(skipped.sets[1].skipped, undefined);
  assert.equal(skipped.sets[1].completed, true);

  // The set he never did IS the record of the skip.
  assert.equal(skipped.sets[3].skipped, true);
  assert.equal(skipped.sets[3].skipped_at, at);
  assert.equal(skipped.skipped, true);

  // And the exercise still reads as resolved, so finishing is not blocked.
  assert.equal(isRunnerExerciseResolved(skipped), true);
});
