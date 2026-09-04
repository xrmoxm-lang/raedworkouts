import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

// The app ships Raed's real sync credentials and points at his real server, so
// ANY test that navigates without blocking that host pushes whatever it does to
// his live cloud row. history-delete.spec.mjs deletes sessions. Seven spec files
// had no block at all. Nothing in a test run may ever touch his data.
async function blockLiveSync(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
}


const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = pathToFileURL(path.join(repoRoot, 'index.html')).href;
const testUser = 'phase6-design';

test.use({
  browserName: 'chromium', headless: true, viewport: { width: 390, height: 844 },
  launchOptions: { args: ['--allow-file-access-from-files'], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
});

function state() {
  return {
    schema_version: 2, programme_reference_migration_version: 1, current_week: 1, current_block: 1,
    profile: { display_name: 'Phase 6', experience: 'returning', created_at: '2026-08-28T00:00:00.000Z' },
    active_session: null, history: [], bodyweight_log: [], custom_videos: {}, custom_jn_urls: {},
    video_hidden: {}, custom_exercises: [], programme_overrides: null, prs: {}, msg_index: 0, substitutions: [],
  };
}

function settings() {
  return {
    user_id: testUser, user_key: '', theme: 'light', skin: 'hadid', rest_seconds: 120,
    vibrate: false, notifications: false, music_platform: 'spotify', block_auto_color: false,
    block_skin_suggestions: {}, block_skin_rejections: {}, lang: 'ar', locale_version: 1,
  };
}

async function openHome(page) {
  await page.addInitScript(({ user, savedState, savedSettings }) => {
    localStorage.clear();
    localStorage.setItem('raedworkouts.active_user', user);
    localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.state.v1`, JSON.stringify(savedState));
    localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.settings.v1`, JSON.stringify(savedSettings));
  }, { user: testUser, savedState: state(), savedSettings: settings() });
  await blockLiveSync(page);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
}

test('Phase 6 starts directly into the v15 warm-up/session path without the retired exercise-preview page', async ({ page }) => {
  await openHome(page);
  const home = page.locator('#page-home');
  await expect(home.locator('[data-home-stat-tiles]')).toHaveCount(1);
  await expect(home.locator('[data-home-working-set-progress]')).toHaveCount(0);

  await home.locator('[data-home-view-exercises]').click();
  await expect(page.locator('[data-session-preview]')).toHaveCount(0);
  await expect(home.locator('.warmup-phase')).toHaveCount(1);
  await expect(home.locator('[data-home-v15-spotify]')).toHaveCount(1);
  console.log('PHASE6_DIRECT_V15_SESSION_FLOW_PASSED');
});

test('Phase 6 moves Help into collapsed Settings groups and frees its tab for the coach', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('.tab[data-route="help"]')).toHaveCount(0);
  await expect(page.locator('.tab[data-route="coach"]')).toHaveCount(1);
  await page.locator('.tab[data-route="settings"]').click();
  const settingsPage = page.locator('#page-settings');
  // Every section is a collapsed disclosure — that is the contract, not the
  // count. Pinning the number meant adding the coach's own section broke this
  // test while the thing it protects (nothing lands open, nothing sits outside
  // a group) was never violated.
  const sections = settingsPage.locator('[data-settings-disclosure]');
  await expect(sections.first()).toBeVisible();
  await expect(settingsPage.locator('[data-settings-disclosure][open]')).toHaveCount(0);
  // Nothing may sit loose above the groups: a card outside them is a card that
  // cannot be collapsed, which is what Raed objected to.
  await expect(settingsPage.locator('> .card')).toHaveCount(0);
  console.log('PHASE6_SETTINGS_NAV_CONTRACT_PASSED');
});
