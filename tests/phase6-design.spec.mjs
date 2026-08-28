import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = pathToFileURL(path.join(repoRoot, 'index.html')).href;
const testUser = 'phase6-design';

test.use({
  browserName: 'chromium', headless: true, viewport: { width: 390, height: 844 },
  launchOptions: { args: ['--allow-file-access-from-files'], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
});

function seededState() {
  return {
    schema_version: 2, programme_reference_migration_version: 1, current_week: 1, current_block: 1,
    profile: { display_name: 'Phase 6', experience: 'returning', created_at: '2026-08-28T00:00:00.000Z' },
    active_session: null, history: [], bodyweight_log: [], custom_videos: {}, custom_jn_urls: {},
    video_hidden: {}, custom_exercises: [], programme_overrides: null, prs: {}, msg_index: 0, substitutions: [],
  };
}

function seededSettings() {
  return {
    user_id: testUser, user_key: '', theme: 'light', skin: 'hadid', rest_seconds: 120,
    vibrate: false, notifications: false, music_platform: 'spotify', block_auto_color: false,
    block_skin_suggestions: {}, block_skin_rejections: {}, lang: 'ar', locale_version: 1,
    runner_video_open: true,
  };
}

async function openHome(page) {
  await page.addInitScript(({ user, state, settings }) => {
    localStorage.clear();
    localStorage.setItem('raedworkouts.active_user', user);
    localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.state.v1`, JSON.stringify(state));
    localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.settings.v1`, JSON.stringify(settings));
  }, { user: testUser, state: seededState(), settings: seededSettings() });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
}

test('Phase 6 keeps v15’s three-stage session flow and its exercise-card workout contract', async ({ page }) => {
  await openHome(page);
  const home = page.locator('#page-home');
  await expect(home.locator('[data-home-stat-tiles]')).toHaveCount(1);
  await expect(home.locator('[data-home-working-set-progress]')).toHaveCount(0);

  await home.locator('[data-home-view-exercises]').click();
  const preview = page.locator('[data-session-preview]');
  await expect(preview).toBeVisible();
  await expect(preview.locator('[data-session-preview-exercise]')).not.toHaveCount(0);
  const beginWorkout = preview.locator('[data-session-preview-start-workout]');
  await expect(beginWorkout, 'the preview must expose one stable control that enters the workout').toHaveCount(1);
  await beginWorkout.click();
  await page.locator('[data-runner-skip-warmup]').click();

  const workout = page.locator('[data-session-runner]');
  await expect(workout).toBeVisible();
  await expect(workout.locator('[data-v15-segmented-progress]')).toHaveCount(1);
  await expect(workout.locator('[data-v15-video-strip]')).toHaveCount(1);
  await expect(workout.locator('[data-v15-last-time]')).toHaveCount(1);
  await expect(workout.locator('[data-runner-previous], [data-runner-reset-set]')).toHaveCount(2);
  await expect(workout).not.toContainText(/Exercise \d+ of \d+|Focus mode|Cue:|Session notes|Today: Last session not fully logged/i);
  console.log('PHASE6_V15_FLOW_CONTRACT_PASSED');
});

test('Phase 6 active Home keeps v15’s music, vibe, exercise list, finish controls, and exercise-view stage', async ({ page }) => {
  await openHome(page);
  await page.locator('[data-home-view-exercises]').click();
  await page.locator('[data-session-preview-start]').click();
  await page.locator('[data-runner-skip-warmup]').click();
  await page.locator('.tab[data-route="home"]').click();

  const home = page.locator('#page-home');
  await expect(home.locator('[data-home-v15-spotify]')).toHaveCount(1);
  await expect(home.locator('[data-home-spotify-handoff]')).toHaveText('🎧 سبوتيفاي — شغّل وانسَ الموضوع:');
  await expect(home.locator('[data-home-spotify-handoff]')).not.toContainText('press play');
  await expect(home.locator('[data-home-v15-spotify] a')).toHaveCount(2);
  await expect(home.locator('[data-home-v15-spotify] a')).toHaveText(['Beast Mode', 'Power Workout']);
  await expect(home.locator('[data-home-v15-spotify] a bdi')).toHaveCount(2);
  await expect(home.locator('[data-home-vibe]')).toHaveCount(1);
  await expect(home.locator('[data-home-vibe]')).toContainText('الضغطات الكبيرة أولًا. اترك الأكتاف والذراعين للنصف الأخير.');
  await expect(home.locator('[data-home-exercise-list] [data-home-exercise]')).not.toHaveCount(0);
  await expect(home.locator('[data-home-view-exercises]')).toHaveCount(1);
  await expect(home.locator('[data-home-finish], [data-home-discard]')).toHaveCount(2);

  await home.locator('[data-home-view-exercises]').click();
  await expect(page.locator('[data-session-preview]')).toBeVisible();
  await expect(page.locator('[data-session-preview-continue]')).toHaveCount(1);
  console.log('PHASE6_ACTIVE_HOME_V15_BLOCKS_PASSED');
});

test('Phase 6 turns the old Help tab into collapsed sections in Settings and frees its tab for the coach', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('.tab[data-route="help"]')).toHaveCount(0);
  await expect(page.locator('.tab[data-route="coach"]')).toHaveCount(1);
  await page.locator('.tab[data-route="settings"]').click();
  const settings = page.locator('#page-settings');
  await expect(settings.locator('[data-settings-disclosure]')).toHaveCount(6);
  await expect(settings.locator('[data-settings-disclosure][open]')).toHaveCount(0);
  console.log('PHASE6_SETTINGS_NAV_CONTRACT_PASSED');
});
