import { defineConfig } from '@playwright/test';

// There was no config at all, so the suite ran on Playwright's defaults: a 30s
// timeout and one worker per two cores. On a busy machine that is not enough,
// and the symptom was a DIFFERENT test timing out on each full run — the coach
// specs once, "machine weight only" the next time — while every one of them
// passed alone in seconds.
//
// That is worse than a slow suite. `npm run verify` only became green today, and
// a gate that fails at random for reasons unrelated to the code is a gate people
// learn to re-run instead of read.
export default defineConfig({
  testDir: 'tests',
  // Double the ceiling. The slowest legitimate test here seeds three years of
  // history, reloads twice and waits out a debounce.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One retry, and Playwright reports a retried test as "flaky" rather than
  // folding it into "passed" — so this hides nothing, it just stops a loaded CPU
  // from being reported as a broken app. A genuine failure still fails twice.
  retries: 1,
  // Half the cores, leaving room for the dev server and everything else on the
  // machine. Unbounded parallelism is what caused the timeouts.
  //
  // Measured again on 2026-09-06, with the suite now at 126 tests rather than
  // the ~90 it had when this was written: 4 workers gave 3 flaky on a settled
  // machine, 3 workers gave 4 flaky and took a minute longer. So parallelism is
  // NOT the lever any more — the remaining flakiness is per-test, from fixed
  // waitForTimeout sleeps that miss under any load, and it varies run to run.
  //
  // `npm run verify` exits 0 because `retries: 1` absorbs it. That is a real
  // mitigation, not a fix: the honest reading of a green run today is «every
  // test passed, some on the second attempt». Converting those sleeps to proper
  // waits is its own piece of work and is written down rather than pretended
  // away.
  workers: 4,
  fullyParallel: false,
  reporter: [['line']],
  use: {
    // His actual phone. Individual specs still override where they need to.
    viewport: { width: 390, height: 844 },
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
  },
});
