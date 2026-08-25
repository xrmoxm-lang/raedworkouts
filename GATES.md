# Gates: v16 Phase 1 foundation

<!-- OWNS merged into one ledger header: Phase 1 = domain/**, tests/**, package.json, data.js; Phase 2 = app.js, styles.css, domain/substitutions.js, research/22-progression-engine.md, research/24-data-model.md, tests/phase2.test.mjs, dashboard.html generator; Phase 3 = styles.css, index.html, app.js, manifest.webmanifest, icon-*.svg, scripts/build-dashboard.mjs, scripts/lint-contrast.mjs, scripts/verify-phase3-identity.mjs, package.json, dashboard.html, GATES.md. -->
OWNS: domain/**, tests/**, package.json, data.js, styles.css, index.html, app.js, manifest.webmanifest, icon-192.svg, icon-512.svg, icon-maskable-512.svg, scripts/build-dashboard.mjs, scripts/lint-contrast.mjs, scripts/verify-phase3-identity.mjs, dashboard.html, GATES.md

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

- [x] G4: D16/D17 final-set effort only brakes reps-earned increases
  CHECK: node --test --test-name-pattern="D16/D17" tests/phase2.test.mjs
  EXPECT: very_hard is never higher than the same no-effort input
  EVIDENCE: exit=0; 1 pass, 0 fail

- [x] G5: D18/D19 and the ordered warm-up phase are data-checked
  CHECK: node --test --test-name-pattern="D18|warm-up" tests/phase2.test.mjs
  EXPECT: compounds 8–10; upper excludes leg drills; treadmill 5–10, 15-minute cap
  EVIDENCE: exit=0; 3 pass, 0 fail

- [x] G6: D24 substitution ledger has clean, warn, and block-with-override branches
  CHECK: node --test --test-name-pattern="D24" tests/phase2.test.mjs
  EXPECT: ledger is exposed before classification
  EVIDENCE: exit=0; 1 pass, 0 fail

- [x] G7: Full suite and native module import checks pass
  CHECK: npm test && node tests/verify-phase1-modules.mjs
  EXPECT: /PHASE1_TESTS_PASSED[\s\S]*# fail 0[\s\S]*PHASE1_MODULES_IMPORTABLE/
  EVIDENCE: exit=0; output=PHASE1_TESTS_PASSED … # fail 0 … PHASE1_MODULES_IMPORTABLE

# Gates: v16 Phase 3 adopted identity

Scope extension: three adopted skins across light, dark, and automatic modes; no retired teal identity; contrast-checked tokens and generated dashboard.

- [x] G8: The complete test suite includes and passes the independently calculated contrast linter
  CHECK: npm test
  EXPECT: CONTRAST_LINT_PASSED
  EVIDENCE: exit=0; 20 pass, 0 fail; output=CONTRAST_LINT_PASSED

- [x] G9: No retired v15 identity token remains in a shipped application artifact
  CHECK: node scripts/verify-phase3-identity.mjs
  EXPECT: PHASE3_IDENTITY_VERIFIED
  EVIDENCE: exit=0; output=PHASE3_IDENTITY_VERIFIED

- [x] G10: All three skins resolve complete light and dark token sets with every specified contrast pair above its floor
  CHECK: node scripts/lint-contrast.mjs
  EXPECT: CONTRAST_LINT_PASSED
  EVIDENCE: exit=0; output=CONTRAST_LINT_PASSED

- [x] G11: The D29 label uses the accent or its same-hue lightened form on both card and elevated surfaces
  CHECK: node scripts/lint-contrast.mjs
  EXPECT: D29_LABEL_RULE_PASSED
  EVIDENCE: exit=0; output=D29_LABEL_RULE_PASSED

- [ ] G12: The generator writes a dashboard with no retired identity or Push/Pull/Legs session label
  CHECK: node scripts/build-dashboard.mjs
  EXPECT: DASHBOARD_BUILT
  EVIDENCE: UNVERIFIED — exit=1 in this sandbox before generation: EPERM writing the intended repository-root target /Users/raedmohammed/RaedWorkoutsV2/dashboard.html. An isolated temporary-root execution of the unchanged generator emitted DASHBOARD_BUILT; a cloned PPL-labelled input failed its emitted-snapshot assertion.

- [ ] G13: Six session-screen screenshots at 390 px have received Claude's one-handed design review
  EVIDENCE: UNVERIFIED — explicitly reserved for Claude's Phase 3 design review

- [x] G14: Main remains pinned at 4627432 and the repository worktree diff is emitted for review
  CHECK: test "$(git rev-parse main)" = "4627432fc5fce240503702bf040ada2e9f01b487" && git diff --stat main && printf 'MAIN_ANCHORED\\n'
  EXPECT: MAIN_ANCHORED
  EVIDENCE: exit=0; output=MAIN_ANCHORED; git diff --stat main emitted
