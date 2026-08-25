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
    lang: 'en',
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
  if (await skipWarmup.count()) await skipWarmup.click();

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
      const main = document.querySelector('.runner-main');
      if (!main || main.querySelector('[data-runner-overflow-fixture]')) return;
      const fixture = document.createElement('div');
      fixture.dataset.runnerOverflowFixture = 'true';
      fixture.textContent = 'runner overflow fixture';
      fixture.style.cssText = 'flex:0 0 900px; height:900px; width:100%;';
      main.appendChild(fixture);
    });
  }

  const geometry = await page.evaluate(() => {
    const shell = document.querySelector('.runner-shell');
    const main = document.querySelector('.runner-main');
    const panel = document.querySelector('[data-runner-set-panel]');
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
    return {
      viewport: window.innerHeight,
      shell: dimensions(shell),
      main: dimensions(main),
      panel: dimensions(panel),
      belowFold,
    };
  });

  const line = (name, value) =>
    `${name} client=${value.clientHeight}px scroll=${value.scrollHeight}px spare=${value.clientHeight - value.scrollHeight}px`;
  console.log(`PHASE4_RUNNER_GEOMETRY ${state}: viewport=${geometry.viewport}px shell=${geometry.shell.clientHeight}px viewportMargin=${geometry.viewport - geometry.shell.clientHeight}px`);
  console.log(`PHASE4_RUNNER_GEOMETRY ${state}: ${line('shell', geometry.shell)} ${line('main', geometry.main)} ${line('setPanel', geometry.panel)}`);
  console.log(`PHASE4_RUNNER_BELOW_FOLD ${state}: ${JSON.stringify(geometry.belowFold)}`);

  expect(Math.abs(geometry.shell.clientHeight - geometry.viewport), `${state} shell must fill the viewport`).toBeLessThanOrEqual(3);
  for (const [name, value] of Object.entries({ shell: geometry.shell, main: geometry.main, setPanel: geometry.panel })) {
    expect(value.scrollHeight, `${state} ${name} must not hide vertical content`).toBeLessThanOrEqual(value.clientHeight);
  }
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

test('Phase 4 runner contains all content at 390x844 with video collapsed', async ({ page }) => {
  await openStartedRunner(page);
  await recordRunnerGeometry(page, 'video=collapsed');
  await requireLongestExerciseRunner(page);
  console.log('PHASE4_RUNNER_COLLAPSED_PASSED');
});

test('Phase 4 runner contains all content at 390x844 with video expanded', async ({ page }) => {
  await openStartedRunner(page);
  const videoToggle = page.locator('[data-runner-video-toggle]');
  if (await videoToggle.count()) await videoToggle.click();
  await recordRunnerGeometry(page, 'video=expanded');
  const runner = await requireLongestExerciseRunner(page);
  await expect(videoToggle).toHaveCount(1);
  await expect(runner.locator('[data-runner-video][data-expanded="true"]')).toHaveCount(1);
  console.log('PHASE4_RUNNER_EXPANDED_PASSED');
});

test('Phase 4 runner persists its video and cue switches per profile', async ({ page }) => {
  await openStartedRunner(page);
  await requireLongestExerciseRunner(page);
  await page.getByRole('button', { name: 'Workout settings' }).click();
  await page.locator('[data-runner-video-setting]').click();
  await page.locator('[data-runner-cues-setting]').click();
  await page.getByRole('button', { name: 'تم' }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  const runner = await requireLongestExerciseRunner(page);
  await expect(runner.locator('[data-runner-video][data-expanded="true"]')).toHaveCount(1);
  await expect(runner.locator('.runner-cue')).toHaveCount(0);
  console.log('PHASE4_RUNNER_PREFERENCES_PASSED');
});

test('Phase 4 runner records a skipped warm-up, uses swipe only for exercise navigation, and leaves without ending', async ({ page }) => {
  await openStartedRunner(page);
  const runner = await requireLongestExerciseRunner(page);
  const beforeSwipe = await runner.locator('.runner-progress > bdi').textContent();
  const [beforeIndex, total] = beforeSwipe.split('/').map((part) => Number(part.trim()));

  const swipeForward = beforeIndex < total;
  await runner.locator('.runner-main').dispatchEvent('pointerdown', { clientX: swipeForward ? 320 : 80, clientY: 280 });
  await runner.locator('.runner-main').dispatchEvent('pointerup', { clientX: swipeForward ? 80 : 320, clientY: 280 });
  const afterSwipe = await runner.locator('.runner-progress > bdi').textContent();
  const [afterIndex, afterTotal] = afterSwipe.split('/').map((part) => Number(part.trim()));
  expect(afterTotal, 'a swipe must stay inside the same session').toBe(total);
  expect(afterIndex, 'a horizontal swipe must move to an adjacent exercise').toBe(beforeIndex + (swipeForward ? 1 : -1));

  await page.getByRole('button', { name: 'Leave workout' }).click();
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
