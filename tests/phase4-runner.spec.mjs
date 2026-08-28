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
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  },
});

function seededState({ history = [] } = {}) {
  return {
    schema_version: 2,
    programme_reference_migration_version: 1,
    current_week: 1,
    current_block: 1,
    profile: { display_name: 'Runner test', experience: 'returning', created_at: '2026-08-25T00:00:00.000Z' },
    active_session: null,
    history,
    bodyweight_log: [],
    custom_videos: {}, custom_jn_urls: {}, video_hidden: {}, custom_exercises: [],
    programme_overrides: null, prs: {}, msg_index: 0, substitutions: [],
  };
}

function seededSettings(overrides = {}) {
  return {
    user_id: testUser,
    user_key: '',
    theme: 'light', skin: 'hadid',
    rest_seconds: 120, vibrate: false, notifications: false,
    music_platform: 'spotify',
    block_auto_color: false,
    block_skin_suggestions: {}, block_skin_rejections: {},
    lang: 'ar', locale_version: 1,
    runner_video_open: true,
    ...overrides,
  };
}

async function openSeededHome(page, { history = [], settings = {} } = {}) {
  await page.addInitScript(({ user, state, savedSettings }) => {
    if (sessionStorage.getItem('phase4-runner-seeded')) return;
    localStorage.clear();
    localStorage.setItem('raedworkouts.active_user', user);
    localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.state.v1`, JSON.stringify(state));
    localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.settings.v1`, JSON.stringify(savedSettings));
    sessionStorage.setItem('phase4-runner-seeded', 'true');
  }, { user: testUser, state: seededState({ history }), savedSettings: seededSettings(settings) });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
}

async function startAndCompleteWarmup(page) {
  const home = page.locator('#page-home');
  await home.locator('[data-home-view-exercises]').click();
  await expect(page.locator('[data-session-preview]'), 'Raed retired the duplicate exercise-preview stage').toHaveCount(0);

  const warmup = home.locator('.warmup-phase');
  await expect(warmup).toBeVisible();
  await warmup.locator('.warmup-minute-picker button').first().click();
  const drills = warmup.locator('.warmup-drill');
  const drillCount = await drills.count();
  expect(drillCount, 'an upper or lower warm-up must expose its mapped drills').toBeGreaterThan(0);
  for (let index = 0; index < drillCount; index += 1) await drills.nth(index).click();
  const beginLifting = warmup.locator('.btn.primary.full');
  await expect(beginLifting).toBeEnabled();
  await beginLifting.click();
  await expect(home.locator('.ex.expanded')).toHaveCount(1);
  return home;
}

test('v15 session on Home has one music card, English exercise names, videos, and no retired focus or cue chrome', async ({ page }) => {
  await openSeededHome(page);
  const home = await startAndCompleteWarmup(page);

  await expect(home.locator('[data-home-v15-spotify]'), 'the home hand-off must render once, not once per active-session branch').toHaveCount(1);
  await expect(home.locator('[data-home-v15-spotify] a')).toHaveCount(2);
  await expect(home.locator('[data-home-v15-spotify] a bdi')).toHaveCount(2);
  await expect(home.locator('[data-v15-session-progress]')).toHaveCount(1);
  await expect(home.locator('.ex.expanded .ex-thumb.body-img')).toHaveCount(1);
  await expect(home.locator('.ex.expanded .video-row')).toHaveCount(1);
  await expect(home.locator('.ex.expanded h4 bdi')).toHaveText('Chest Press Machine');
  await expect(home).not.toContainText(/Focus mode|وضع التركيز|Cues on|التلميحات|Cue:|Session notes|Today: Last session not fully logged/i);
  console.log('V15_SESSION_HOME_CONTRACT_PASSED');
});

test('set rows never need horizontal scrolling at 390px', async ({ page }) => {
  await openSeededHome(page);
  const home = await startAndCompleteWarmup(page);
  const widths = await home.locator('[data-session-set-row]').evaluateAll((rows) => rows.map((row) => ({
    clientWidth: row.clientWidth,
    scrollWidth: row.scrollWidth,
  })));
  console.log(`RUNNER_SET_ROW_WIDTH rows=${JSON.stringify(widths)}`);
  expect(widths.length, 'a v15 session must render at least one set row').toBeGreaterThan(0);
  expect(widths.every(({ clientWidth, scrollWidth }) => scrollWidth <= clientWidth), 'weight, reps, and done must fit without horizontal sliding').toBe(true);
  console.log('RUNNER_SET_ROW_WIDTH_PASSED');
});

test('skipping is explicit, writes no zero row, and immediately resolves the exercise', async ({ page }) => {
  await openSeededHome(page);
  const home = await startAndCompleteWarmup(page);
  const before = await page.evaluate((user) => {
    const key = `raedworkouts.${encodeURIComponent(user)}.state.v1`;
    return Object.keys(JSON.parse(localStorage.getItem(key)).active_session.exercises)[0];
  }, testUser);

  await home.locator('[data-runner-skip-exercise]').click();
  const persisted = await page.evaluate((user) => {
    const key = `raedworkouts.${encodeURIComponent(user)}.state.v1`;
    return JSON.parse(localStorage.getItem(key)).active_session;
  }, testUser);
  const skipped = persisted.exercises[before];
  expect(skipped.skipped, 'machine unavailable is an explicit skip, not a fake completion').toBe(true);
  const working = skipped.sets.filter((set) => !set.is_warmup);
  expect(working.every((set) => set.skipped && !set.completed), 'skipping cannot manufacture completed sets').toBe(true);
  expect(working.every((set) => set.weight !== 0 && set.weight !== '0'), 'skipping cannot manufacture a 0 kg row').toBe(true);
  console.log('RUNNER_SKIP_POLICY_PASSED');
});

test('an unseeded movement stays blank, while a real suggestion is a placeholder and never an input value', async ({ page }) => {
  await openSeededHome(page);
  const home = await startAndCompleteWarmup(page);
  const unseeded = home.locator('[data-session-set-row][data-set-kind="working"] [data-runner-weight-input]').first();
  await expect(unseeded).toHaveValue('');
  await expect(unseeded).toHaveAttribute('placeholder', '');
  await expect(home).not.toContainText('0 kg');

  await page.evaluate((user) => {
    const key = `raedworkouts.${encodeURIComponent(user)}.state.v1`;
    const current = JSON.parse(localStorage.getItem(key));
    const exerciseId = Object.keys(current.active_session.exercises)[0];
    current.history.push({
      date: '2026-08-27', session_id: 'seeded-history', exercises: {
        [exerciseId]: {
          sets: [{ is_warmup: false, weight: 27.5, reps: 10, effort: 'medium', completed: true }],
        },
      },
    });
    localStorage.setItem(key, JSON.stringify(current));
  }, testUser);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const seeded = page.locator('#page-home [data-session-set-row][data-set-kind="working"] [data-runner-weight-input]').first();
  await expect(seeded).toHaveValue('');
  await expect(seeded).toHaveAttribute('placeholder', '27.5');
  console.log('PHASE5_UNSEEDED_WEIGHT_RULE_PASSED');
});
