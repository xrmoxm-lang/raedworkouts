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
  // Nothing used to start a server, so every browser spec failed on connection
  // refused. The specs hard-code two origins — localhost:8877 and 127.0.0.1:8899
  // — so both are served. reuseExistingServer keeps a hand-started one usable.
  webServer: [
    {
      command: 'python3 -m http.server 8877 --bind 127.0.0.1',
      port: 8877,
      reuseExistingServer: true,
      timeout: 15000,
    },
    {
      command: 'python3 -m http.server 8899 --bind 127.0.0.1',
      port: 8899,
      reuseExistingServer: true,
      timeout: 15000,
    },
  ],
  // Two projects. App specs run without a service worker (see tests/_fixtures.mjs
  // for the context-level network fence); the deployed-site gate is the one spec
  // that needs the real network and the real service worker.
  projects: [
    {
      name: 'app',
      testIgnore: /pwa-deploy\.spec\.mjs/,
      use: {
        serviceWorkers: 'block',
      },
    },
    {
      name: 'deploy',
      testMatch: /pwa-deploy\.spec\.mjs/,
      use: { serviceWorkers: 'allow' },
    },
  ],
  use: {
    // The app ships real sync credentials, and sw.js answers sync-host GETs with
    // its own fetch() — which page.route() never sees. Proven 2026-09-08: with
    // both routes aborted, a page fetch of the live /health still returned 200.
    // Blocking service workers is what makes the per-spec route() guards real.
    // tests/pwa-deploy.spec.mjs re-enables them for the deployed-site gate.
    // His actual phone. Individual specs still override where they need to.
    viewport: { width: 390, height: 844 },
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
  },
});
