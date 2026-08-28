# Gates: v16 Phase 1 foundation

<!-- OWNS merged into one ledger header: Phase 1 = domain/**, tests/**, package.json, data.js; Phase 2 = app.js, styles.css, domain/substitutions.js, research/22-progression-engine.md, research/24-data-model.md, tests/phase2.test.mjs, dashboard.html generator; Phase 3 = styles.css, index.html, app.js, manifest.webmanifest, icon-*.svg, scripts/build-dashboard.mjs, scripts/lint-contrast.mjs, scripts/verify-phase3-identity.mjs, package.json, dashboard.html, GATES.md; Phase 4 = app.js, styles.css, index.html, scripts/lint-contrast.mjs, tests/phase4-runner.spec.mjs, package.json, GATES.md. -->
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

# Gates: v16 Phase 4 session runner

- [ ] G15: The 390×844 runner contains its own shell, main, and set-panel content without clipping in either video state, and the home overview is absent from its DOM
  CHECK: npm run test:runner
  EXPECT: /PHASE4_RUNNER_COLLAPSED_PASSED[\s\S]*PHASE4_RUNNER_EXPANDED_PASSED/
  EVIDENCE: SUPERSEDED INSTRUMENT — document scrollHeight was blind behind overflow:hidden. External positive control (a test-only, env-triggered fixture; no application code) proved it: collapsed shell client=844 scroll=844 spare=0 while main client=692 scroll=1116 spare=-424; expanded main client=692 scroll=1248 spare=-556; exit=1, 2 failed. The local geometry gate first passed externally: collapsed viewport=844 shell=844 viewportMargin=0, main=692/692, setPanel=482/482, belowFold=[]; expanded viewport=844 shell=844 viewportMargin=0, main=692/692, setPanel=350/350, belowFold=[]; exit=0, 4 passed. After the 52px-target redesign, its real gate correctly failed: collapsed main=692/692, setPanel=448/448; expanded main=692/692, setPanel=316/322, spare=-6; exit=1, 1 failed. Its matching positive control still failed with document spare=0 but main spare=-458 collapsed / -590 expanded. The row gap is now reduced from 4px to 2px, a computed 10px reclaim across five rows; external re-verification is pending. Claude runs this gate outside the Codex sandbox because Chromium aborts in the sandbox.

- [x] G16: Runner video and cue settings persist per profile across reload
  CHECK: npm run test:runner
  EXPECT: PHASE4_RUNNER_PREFERENCES_PASSED
  EVIDENCE: external Playwright exit=0; 4 passed.

- [x] G17: The runner records a skipped warm-up, uses horizontal swipe only to change exercises, and leaves without ending the active session
  CHECK: npm run test:runner
  EXPECT: PHASE4_RUNNER_SESSION_LIFECYCLE_PASSED
  EVIDENCE: external Playwright exit=0; 4 passed.

- [ ] G18: An empty PIN creates a PIN-free profile while an existing PIN still gates that profile
  CHECK: node --test tests/phase4.test.mjs
  EXPECT: PHASE4_PIN_RULE_PASSED
  EVIDENCE: local npm test exit=0; PHASE4_PIN_RULE_PASSED emitted after both PIN-direction assertions.

- [ ] G19: The Arabic UI uses one locale map; declared English exceptions and each deferred legacy-programme value are printed on every successful run
  CHECK: node scripts/verify-arabic-ui.mjs
  EXPECT: ARABIC_UI_VERIFIED
  EVIDENCE: local node exit=0; translated=238, exerciseNames=33, warmupDrills=5, playlistTitles=19, properNouns=2, deferred=26, then ARABIC_UI_VERIFIED.

- [ ] G20: Every reachable rendered Arabic screen contains only declared Latin runs
  CHECK: npm run test:arabic-dom
  EXPECT: PHASE4_ARABIC_DOM_PASSED
  EVIDENCE: UNVERIFIED — written against the current build to prove its pre-session Home wiring fails before the render-path fixes land.

# Gates: v16 Phase 5 Upper/Lower programme

Scope extension: the catalogue crosswalk, two-block Upper/Lower prescription, its substitution targets,
and the independently recomputed weekly volume ledger. The research rep-range linter is read-only and
lives at the repository root; it is never modified from this worktree.

- [x] G21: Every catalogue record has exactly one primary muscle, including the Phase 5 additions
  CHECK: node --test tests/phase5.test.mjs
  EXPECT: PHASE5_CATALOGUE_PRIMARY_INVARIANT_PASSED
  EVIDENCE: exit=0; PHASE5_CATALOGUE_PRIMARY_INVARIANT_PASSED; PHASE5_CATALOGUE_CROSSWALK_PASSED

- [ ] G22: The adopted prescription's source CSV retains its active 12-rep ceiling
  CHECK: (cd /Users/raedmohammed/RaedWorkoutsV2 && node research/lint-rep-ranges.mjs)
  EXPECT: REP_RANGE_LINT_PASS
  EVIDENCE: PENDING — read-only check against the adopted research source

- [ ] G23: The real catalogue re-derives the locked 75 / 116.5 / 158 ledger and its 4-set floor
  CHECK: node --test tests/phase5.test.mjs
  EXPECT: PHASE5_LEDGER_REDERIVED
  EVIDENCE: PENDING

- [ ] G24: The complete Node suite keeps all pre-existing behaviour green after the programme port
  CHECK: npm test
  EXPECT: /# fail 0[\s\S]*CONTRAST_LINT_PASSED/
  EVIDENCE: PENDING

- [ ] G25: Main remains pinned at 4627432 while Phase 5 changes stay in this worktree
  CHECK: test "$(git rev-parse main)" = "4627432fc5fce240503702bf040ada2e9f01b487" && git diff --stat main && printf 'MAIN_ANCHORED\n'
  EXPECT: MAIN_ANCHORED
  EVIDENCE: PENDING

# Gates: v16 parallel deployment safety

Scope extension: a separate HTTPS v16 PWA must have independent HP sync rows,
must not block a fresh profile on a legacy PIN hint, and must retain a usable
shell after the first online visit goes offline. v15's app and its bare server
rows are explicitly out of scope and unreachable from the v16 client.

- [x] G26: Every v16 server identity is namespaced and HP allowlist provisioning preserves bare v15 rows
  CHECK: node --test tests/deploy-safe.test.mjs
  EXPECT: /V16_SYNC_NAMESPACE_PASSED[\s\S]*V16_ALLOWLIST_ADDITIVE_PASSED/
  EVIDENCE: exit=0; node test run locally; both additive namespace assertions emitted their success markers.

- [ ] G27: A fresh browser origin reaches optional-PIN registration even if an unverified state fetch returns 401, and emits only a namespaced v16 state write
  CHECK: npm run test:deploy-safe
  EXPECT: /V16_FRESH_PROFILE_NONBLOCKING_PASSED[\s\S]*V16_FRESH_PROFILE_401_REGISTRATION_PASSED[\s\S]*V16_SYNC_NAMESPACE_BROWSER_PASSED[\s\S]*V16_VERIFIED_PIN_GATE_PASSED/
  EVIDENCE: FAILING-FIRST — Raed's clean-origin run of the stashed branch reached the numeric keypad and «أدخل رمزك» with no route forward. The new test reproduces that direct path with `/users=[]` and an unverified `/state` 401; its pre-fix expectation is zero `.pin-key` buttons and a reachable «أنشئ الملف». Green external verification is pending because Chromium aborts in the Codex sandbox.

- [ ] G28: The separate HTTPS deployment installs the approved manifest/icons, receives current service-worker code, and reloads offline after first visit
  CHECK: PWA_DEPLOY_URL=https://YOUR-SEPARATE-V16-SITE.netlify.app npm run test:pwa-deploy
  EXPECT: PWA_DEPLOY_HTTPS_OFFLINE_PASSED
  EVIDENCE: PENDING — requires the separate deployed HTTPS URL; the command fails loudly if PWA_DEPLOY_URL is unset or non-HTTPS.

# Gates: v16 overnight runner usability release (N2, N4, N5)

Scope extension: tomorrow's workout must keep the focused v16 runner while restoring
the Spotify hand-off and non-corrupt skip behaviour Raed relied on in v15. The
progress and session-switching layout are deliberately deferred to Raed's current
design review. v15 remains a read-only reference; no bare v15 sync identity,
programme migration, or app rename is in scope.

- [ ] G29: At 390 px every set row fits its weight, reps, and done controls without horizontal scrolling
  CHECK: npm run test:runner
  EXPECT: RUNNER_SET_ROW_WIDTH_PASSED
  EVIDENCE: PENDING — browser gate; Raed runs Playwright outside the Codex sandbox.

- [ ] G30: A valid set logs, an explicit exercise skip advances without a zero row or volume credit, and an invalid attempt is retained after one prompt
  CHECK: npm run test:runner && node --test tests/overnight-runner.test.mjs
  EXPECT: RUNNER_SKIP_POLICY_PASSED
  EVIDENCE: PENDING — includes browser wiring plus a deterministic state-policy test.

- [ ] G31: Runner Spotify uses the same selected-platform playlist hand-off as v15 rather than a warm-up-only redesign
  CHECK: npm run test:runner
  EXPECT: RUNNER_SPOTIFY_V15_HANDOFF_PASSED
  EVIDENCE: PENDING — the browser assertion verifies the selected-platform hand-off users actually tap.

- [ ] G33: The production v16 PWA is rebuilt under a new service-worker cache version and remains installable/offline on its separate HTTPS origin
  CHECK: PWA_DEPLOY_URL=https://raedworkouts-v16.vercel.app npm run test:pwa-deploy
  EXPECT: PWA_DEPLOY_HTTPS_OFFLINE_PASSED
  EVIDENCE: PENDING — must run against the new production deployment, never against v15.

# Gates: v16 local grounded coach foundation

Scope extension: a local-CPU-only retrieval index over the complete extracted
corpus, grounded citations/refusal/error semantics, and the checkpointed static
coach graph. Voice, UI wiring, paid providers, and deployment are out of scope.

- [ ] G34: The HP builds the complete local BGE index and independently reports source, chunk, vector, and database measurements
  CHECK: python3 server/coach_index.py build --corpus ../sources/text --db /tmp/raedcoach-index.sqlite
  EXPECT: LOCAL_INDEX_BUILT
  EVIDENCE: BLOCKED — the Codex sandbox prevents SSH to the HP (`Operation not permitted` before authentication). This check must run there, using its local fastembed venv; it makes no API call.

- [x] G35: Grounded Q&A returns citations, refuses genuinely uncovered content, and surfaces a query-rewrite failure as an error
  CHECK: python3 -m unittest server.tests.test_coach_ai.CoachQuestionAnswerTests
  EXPECT: COACH_QA_PATHS_PASSED
  EVIDENCE: exit=0; 4 tests passed; deliberate Arabic rewrite exception emitted QUERY_REWRITE_ERROR_SURFACED rather than not_in_sources.

- [x] G36: The checkpointed question graph enforces its contracts, does not permit model-supplied loads, and preserves the existing deterministic clamp boundary
  CHECK: python3 -m unittest server.tests.test_coach_ai.CoachGraphTests && node scripts/verify-coach-ai.mjs
  EXPECT: COACH_GRAPH_CONTRACTS_PASSED
  EVIDENCE: exit=0; 3 graph tests passed; deliberate load_kg output emitted MODEL_LOAD_REJECTED; static bridge check passed.
