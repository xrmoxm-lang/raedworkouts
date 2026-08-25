# Gates: v16 Phase 1 foundation

OWNS: domain/**, tests/**, package.json, data.js, GATES.md

Scope: independently testable ES-module foundation for catalogue, event log, volume, progression, clamps, migrations, and the reproduced v15 data-loss regressions.

- [x] G1: Phase 1 domain behaviour and all specified safety/data tests pass
  CHECK: node --test tests/phase1.test.mjs
  EXPECT: PHASE1_TESTS_PASSED
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/raedmohammed/RaedWorkoutsV2/worktree-v16; path=6c4a1a42ab62/22 entries; output=ℹ todo 0 | ℹ duration_ms 277.384709

- [x] G2: Each reproduced v15 data-loss behaviour is demonstrated failing first, then protected by the event log
  CHECK: node --test --test-name-pattern="failing-first" tests/phase1.test.mjs
  EXPECT: FAILING_FIRST_EVIDENCE_PASSED
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/raedmohammed/RaedWorkoutsV2/worktree-v16; path=6c4a1a42ab62/22 entries; output=ℹ todo 0 | ℹ duration_ms 215.873458

- [x] G3: The seven deliverable ES modules parse as native modules without a build step
  CHECK: node tests/verify-phase1-modules.mjs
  EXPECT: PHASE1_MODULES_IMPORTABLE
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/raedmohammed/RaedWorkoutsV2/worktree-v16; path=6c4a1a42ab62/22 entries; output=PHASE1_MODULES_IMPORTABLE

# Gates: v16 Phase 2 session structure

OWNS: app.js, styles.css, domain/substitutions.js, research/22-progression-engine.md,
research/24-data-model.md, tests/phase2.test.mjs, dashboard.html generator

- [x] G4: D16/D17 final-set effort only brakes reps-earned increases
  CHECK: node --test --test-name-pattern="D16/D17" tests/phase2.test.mjs
  EXPECT: very_hard is never higher than the same no-effort input

- [x] G5: D18/D19 and the ordered warm-up phase are data-checked
  CHECK: node --test --test-name-pattern="D18|warm-up" tests/phase2.test.mjs
  EXPECT: compounds 8–10; upper excludes leg drills; treadmill 5–10, 15-minute cap

- [x] G6: D24 substitution ledger has clean, warn, and block-with-override branches
  CHECK: node --test --test-name-pattern="D24" tests/phase2.test.mjs
  EXPECT: ledger is exposed before classification

- [x] G7: Full suite and native module import checks pass
  CHECK: npm test && node tests/verify-phase1-modules.mjs
  EXPECT: 17 tests passing; PHASE1_MODULES_IMPORTABLE
