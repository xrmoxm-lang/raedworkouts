import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testUser = 'phase4-runner';
const appUrl = pathToFileURL(path.join(repoRoot, 'index.html')).href;

test.use({
  browserName: 'chromium',
  channel: 'chrome',
  headless: true,
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ['--allow-file-access-from-files'] },
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
    localStorage.clear();
    localStorage.setItem('raedworkouts.active_user', user);
    localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.state.v1`, JSON.stringify(state));
    localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.settings.v1`, JSON.stringify(settings));
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
}

async function recordNoScrollMeasurement(page, state) {
  const measure = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  const margin = measure.innerHeight - measure.scrollHeight;
  console.log(`PHASE4_RUNNER_HEIGHT ${state}: scrollHeight=${measure.scrollHeight}px innerHeight=${measure.innerHeight}px margin=${margin}px`);
  expect(measure.scrollHeight, `${state} runner document must not scroll`).toBeLessThanOrEqual(measure.innerHeight);
}

async function requireLongestExerciseRunner(page) {
  const runner = page.locator('[data-session-runner]');
  await expect(runner).toHaveCount(1);
  await expect(runner).toHaveAttribute('data-runner-phase', 'lifting');
  // The seeded PPL Push session begins with Incline Chest Press: 2 ramp rows +
  // 3 working rows, the longest rendered exercise in the loaded programme.
  await expect(runner.locator('[data-runner-set-row]')).toHaveCount(5);
  return runner;
}

test('Phase 4 runner has no document scroll at 390x844 with video collapsed', async ({ page }) => {
  await openStartedRunner(page);
  await recordNoScrollMeasurement(page, 'video=collapsed');
  await requireLongestExerciseRunner(page);
});

test('Phase 4 runner has no document scroll at 390x844 with video expanded', async ({ page }) => {
  await openStartedRunner(page);
  const videoToggle = page.locator('[data-runner-video-toggle]');
  if (await videoToggle.count()) await videoToggle.click();
  await recordNoScrollMeasurement(page, 'video=expanded');
  const runner = await requireLongestExerciseRunner(page);
  await expect(videoToggle).toHaveCount(1);
  await expect(runner.locator('[data-runner-video][data-expanded="true"]')).toHaveCount(1);
});
