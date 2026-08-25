import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testUser = 'phase4-runner';
const appUrl = pathToFileURL(path.join(repoRoot, 'index.html')).href;

test.use({
  browserName: 'chromium',
  headless: true,
  viewport: { width: 390, height: 844 },
  launchOptions: {
    args: ['--allow-file-access-from-files'],
    // CI obtains the matching browser through `npx playwright install`.
    // This override is only for a pre-installed local Chrome for Testing.
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  },
});

function seededState() {
  return {
    schema_version: 2,
    current_week: 1,
    current_block: 1,
    profile: { display_name: 'Runner test', experience: 'returning', created_at: '2026-08-25T00:00:00.000Z' },
    active_session: null,
    history: [],
    bodyweight_log: [],
    custom_videos: {}, custom_jn_urls: {}, video_hidden: {}, custom_exercises: [],
    programme_overrides: null, prs: {}, msg_index: 0, substitutions: [],
  };
}

function seededSettings() {
  return {
    user_id: testUser,
    user_key: '',
    theme: 'light', skin: 'hadid',
    programme_variant: 'ppl_3x',
    focus_mode: true, show_cues: true,
    rest_seconds: 120, vibrate: false, notifications: false,
    music_platform: 'none',
    block_auto_color: false,
    block_skin_suggestions: {}, block_skin_rejections: {},
    lang: 'ar', locale_version: 1,
    runner_video_open: true,
  };
}

async function openStartedRunner(page) {
  await page.addInitScript(({ user, state, settings }) => {
    // This script also runs after reload. Seed once per test page so a reload
    // verifies persisted settings instead of recreating the original profile.
    if (sessionStorage.getItem('phase4-runner-seeded')) return;
    localStorage.clear();
    localStorage.setItem('raedworkouts.active_user', user);
    localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.state.v1`, JSON.stringify(state));
    localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.settings.v1`, JSON.stringify(settings));
    sessionStorage.setItem('phase4-runner-seeded', 'true');
  }, { user: testUser, state: seededState(), settings: seededSettings() });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  const start = page.locator('#page-home button.btn.primary.full').first();
  await expect(start).toBeVisible();
  await start.click();

  // The Phase 4 runner has this explicit bypass for the test's target exercise.
  // Before it exists, the old post-start home still supplies the real failing
  // scroll measurement below.
  const skipWarmup = page.locator('[data-runner-skip-warmup]');
  if (await skipWarmup.count()) {
    // Skip remains available but deliberately quiet.  The only bottom-bar
    // action is positive completion, and it cannot run until warm-up is done.
    await expect(skipWarmup).toHaveCount(1);
    const completeWarmup = page.locator('[data-runner-complete-warmup]');
    await expect(completeWarmup).toHaveCount(1);
    await expect(completeWarmup).toBeDisabled();
    await skipWarmup.click();
  }

  // Choose the actual longest rendered exercise from the active programme,
  // rather than baking a row count into this gate.
  await page.evaluate((user) => {
    const stateKey = `raedworkouts.${encodeURIComponent(user)}.state.v1`;
    const current = JSON.parse(localStorage.getItem(stateKey));
    const entries = Object.entries(current.active_session.exercises || {});
    const [longestIndex] = entries.reduce((best, [, exercise], index) =>
      (exercise.sets.length > best[1] ? [index, exercise.sets.length] : best), [0, -1]);
    current.active_session.runner_exercise_index = longestIndex;
    localStorage.setItem(stateKey, JSON.stringify(current));
  }, testUser);
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function recordRunnerGeometry(page, state) {
  if (process.env.PHASE4_FORCE_RUNNER_OVERFLOW === '1') {
    // Test-only positive control: this never reaches the application files.
    // It proves the local-overflow assertion still catches clipped content.
    await page.evaluate(() => {
      const list = document.querySelector('[data-runner-set-list]');
      const current = list?.querySelector('.runner-set-row.current');
      if (!list || !current || list.querySelector('[data-runner-overflow-fixture]')) return;
      // Test-only positive control: enough real-shaped rows to make the list
      // scroll, then its scroll position deliberately hides the actual current
      // row. Production files never receive this fixture or an env hook.
      for (let i = 0; i < 8; i += 1) {
        const fixture = current.cloneNode(true);
        fixture.classList.remove('current');
        fixture.dataset.runnerOverflowFixture = 'true';
        list.appendChild(fixture);
      }
      list.scrollTop = list.scrollHeight;
    });
  }

  const geometry = await page.evaluate(() => {
    const shell = document.querySelector('.runner-shell');
    const main = document.querySelector('.runner-main');
    const panel = document.querySelector('[data-runner-set-panel]');
    const list = document.querySelector('[data-runner-set-list]');
    const currentRow = list?.querySelector('.runner-set-row.current');
    const dimensions = (element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      top: Math.round(element.getBoundingClientRect().top),
      bottom: Math.round(element.getBoundingClientRect().bottom),
    });
    const belowFold = [...shell.querySelectorAll('*')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.top >= window.innerHeight)
      .map(({ element, rect }) => `${element.tagName.toLowerCase()}.${[...element.classList].join('.') || 'none'}@${Math.round(rect.top)}px`);
    const listRect = list.getBoundingClientRect();
    const currentRect = currentRow.getBoundingClientRect();
    const fixedZones = {
      shell,
      topbar: shell.querySelector('.runner-topbar'),
      main,
      card: shell.querySelector('.runner-card'),
      panel,
      cue: shell.querySelector('.runner-cue'),
      lastTime: shell.querySelector('.runner-last-time'),
      actions: shell.querySelector('.runner-bottom-actions'),
      bottomBar: shell.querySelector('.runner-bottom-bar'),
    };
    return {
      viewport: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      documentLayers: {
        html: dimensions(document.documentElement),
        body: dimensions(document.body),
        page: dimensions(document.querySelector('#page-runner')),
      },
      shell: dimensions(shell),
      main: dimensions(main),
      panel: dimensions(panel),
      list: dimensions(list),
      fixedZones: Object.fromEntries(Object.entries(fixedZones)
        .filter(([, element]) => element)
        .map(([name, element]) => [name, dimensions(element)])),
      current: {
        top: Math.round(currentRect.top), bottom: Math.round(currentRect.bottom),
        listTop: Math.round(listRect.top), listBottom: Math.round(listRect.bottom),
        fullyVisible: currentRect.top >= listRect.top && currentRect.bottom <= listRect.bottom,
      },
      belowFold,
    };
  });

  const line = (name, value) =>
    `${name} client=${value.clientHeight}px scroll=${value.scrollHeight}px spare=${value.clientHeight - value.scrollHeight}px`;
  console.log(`PHASE4_RUNNER_GEOMETRY ${state}: document=${geometry.documentHeight}px viewport=${geometry.viewport}px shell=${geometry.shell.clientHeight}px viewportMargin=${geometry.viewport - geometry.shell.clientHeight}px`);
  console.log(`PHASE4_RUNNER_DOCUMENT_LAYERS ${state}: html=${geometry.documentLayers.html.clientHeight}/${geometry.documentLayers.html.scrollHeight} body=${geometry.documentLayers.body.clientHeight}/${geometry.documentLayers.body.scrollHeight} page=${geometry.documentLayers.page.clientHeight}/${geometry.documentLayers.page.scrollHeight}`);
  console.log(`PHASE4_RUNNER_GEOMETRY ${state}: ${line('shell', geometry.shell)} ${line('main', geometry.main)} ${line('setPanel', geometry.panel)} ${line('setList', geometry.list)}`);
  console.log(`PHASE4_RUNNER_CURRENT_SET ${state}: row=${geometry.current.top}-${geometry.current.bottom}px list=${geometry.current.listTop}-${geometry.current.listBottom}px visible=${geometry.current.fullyVisible}`);
  console.log(`PHASE4_RUNNER_BELOW_FOLD ${state}: ${JSON.stringify(geometry.belowFold)}`);

  expect(Math.abs(geometry.shell.clientHeight - geometry.viewport), `${state} shell must fill the viewport`).toBeLessThanOrEqual(3);
  expect(geometry.documentHeight, `${state} document must not scroll`).toBeLessThanOrEqual(geometry.viewport);
  for (const [name, value] of Object.entries(geometry.fixedZones)) {
    expect(value.scrollHeight, `${state} ${name} must not hide vertical content`).toBeLessThanOrEqual(value.clientHeight);
  }
  expect(geometry.current.fullyVisible, `${state} current set must be visible without list scrolling`).toBe(true);
  expect(geometry.belowFold, `${state} runner must not place content below the viewport`).toEqual([]);
}

async function requireLongestExerciseRunner(page) {
  const runner = page.locator('[data-session-runner]');
  await expect(runner).toHaveCount(1);
  await expect(runner).toHaveAttribute('data-runner-phase', 'lifting');
  await expect(page.locator('[data-home-overview]')).toHaveCount(0);
  await expect(page.locator('[data-home-stat-tiles]')).toHaveCount(0);
  await expect(page.locator('[data-home-continue]')).toHaveCount(0);
  const renderedRows = await runner.locator('[data-runner-set-row]').count();
  const longestRows = await page.evaluate((user) => {
    const stateKey = `raedworkouts.${encodeURIComponent(user)}.state.v1`;
    const current = JSON.parse(localStorage.getItem(stateKey));
    return Math.max(...Object.values(current.active_session.exercises || {}).map((exercise) => exercise.sets.length));
  }, testUser);
  expect(renderedRows, 'runner must render the longest exercise in the loaded programme').toBe(longestRows);
  return runner;
}

test('Phase 4 runner contains all fixed content at 390x844 with video collapsed', async ({ page }) => {
  await openStartedRunner(page);
  await page.locator('[data-runner-video-toggle]').click();
  await recordRunnerGeometry(page, 'video=collapsed');
  await requireLongestExerciseRunner(page);
  console.log('PHASE4_RUNNER_COLLAPSED_PASSED');
});

test('Phase 4 runner contains all fixed content at 390x844 with video expanded by default', async ({ page }) => {
  await openStartedRunner(page);
  const videoToggle = page.locator('[data-runner-video-toggle]');
  await recordRunnerGeometry(page, 'video=expanded');
  const runner = await requireLongestExerciseRunner(page);
  await expect(videoToggle).toHaveCount(1);
  await expect(runner.locator('[data-runner-video][data-expanded="true"]')).toHaveCount(1);
  console.log('PHASE4_RUNNER_EXPANDED_PASSED');
});

test('Phase 4 runner persists its video and cue switches per profile', async ({ page }) => {
  await openStartedRunner(page);
  await requireLongestExerciseRunner(page);
  await page.locator('[data-runner-settings-button]').click();
  await page.locator('[data-runner-video-setting]').click();
  await page.locator('[data-runner-cues-setting]').click();
  await page.locator('[data-runner-settings-close]').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  const runner = await requireLongestExerciseRunner(page);
  await expect(runner.locator('[data-runner-video][data-expanded="false"]')).toHaveCount(1);
  await expect(runner.locator('.runner-cue')).toHaveCount(0);
  console.log('PHASE4_RUNNER_PREFERENCES_PASSED');
});

test('Phase 4 runner records a skipped warm-up, uses swipe only for exercise navigation, and leaves without ending', async ({ page }) => {
  await openStartedRunner(page);
  const runner = await requireLongestExerciseRunner(page);
  const beforeIndex = Number(await runner.getAttribute('data-runner-exercise-index'));
  const total = Number(await runner.getAttribute('data-runner-exercise-total'));

  const swipeForward = beforeIndex < total - 1;
  await runner.locator('.runner-main').dispatchEvent('pointerdown', { clientX: swipeForward ? 320 : 80, clientY: 280 });
  await runner.locator('.runner-main').dispatchEvent('pointerup', { clientX: swipeForward ? 80 : 320, clientY: 280 });
  const afterIndex = Number(await runner.getAttribute('data-runner-exercise-index'));
  const afterTotal = Number(await runner.getAttribute('data-runner-exercise-total'));
  expect(afterTotal, 'a swipe must stay inside the same session').toBe(total);
  expect(afterIndex, 'a horizontal swipe must move to an adjacent exercise').toBe(beforeIndex + (swipeForward ? 1 : -1));

  await page.locator('[data-runner-leave-button]').click();
  await expect(page.locator('[data-home-overview]')).toHaveCount(1);
  await expect(page.locator('[data-home-continue]')).toHaveCount(1);
  const persisted = await page.evaluate((user) => {
    const stateKey = `raedworkouts.${encodeURIComponent(user)}.state.v1`;
    return JSON.parse(localStorage.getItem(stateKey)).active_session;
  }, testUser);
  expect(persisted, 'leaving the runner must not end the session').toBeTruthy();
  expect(persisted.phase).toBe('lifting');
  expect(persisted.warmup.skipped).toBe(true);
  console.log('PHASE4_RUNNER_SESSION_LIFECYCLE_PASSED');
});
