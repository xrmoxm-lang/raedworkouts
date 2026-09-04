import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = process.env.SHOT_URL || 'http://127.0.0.1:8899/index.html';
const OUT = process.env.SHOT_DIR || path.join(repoRoot, '..', 'design-shots', 'before');
const SKIN = process.env.SHOT_SKIN || 'hadid';
const THEME = process.env.SHOT_THEME || 'light';
const user = 'shots';
fs.mkdirSync(OUT, { recursive: true });


const REAL_HISTORY = Array.from({ length: 9 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 7, 12 + i * 2)).toISOString(),
  session_key: ['upper_a','lower_a','upper_b','lower_b'][i % 4],
  duration_min: 68 + (i % 3) * 4,
  exercises: [
    { exercise_id: 'chest_press_machine', sets: [
      { weight: 40 + i, reps: 10, completed: true }, { weight: 40 + i, reps: 9, completed: true },
      { weight: 40 + i, reps: 8, completed: true, effort: 'hard' } ] },
    { exercise_id: 'lat_pulldown_neutral', sets: [
      { weight: 50 + i, reps: 11, completed: true }, { weight: 50 + i, reps: 10, completed: true } ] },
  ],
}));

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

function state(history = []) {
  return {
    schema_version: 2, programme_reference_migration_version: 1,
    current_week: 1, current_block: 1,
    profile: { display_name: 'رائد', experience: 'returning', created_at: '2026-08-25T00:00:00.000Z' },
    active_session: null, history, bodyweight_log: [],
    custom_videos: {}, custom_jn_urls: {}, video_hidden: {}, custom_exercises: [],
    programme_overrides: null, prs: {}, msg_index: 0, substitutions: [],
  };
}
function settings(o = {}) {
  return {
    user_id: user, user_key: '', theme: THEME, skin: SKIN,
    rest_seconds: 120, vibrate: false, notifications: false, music_platform: 'spotify',
    block_auto_color: false, block_skin_suggestions: {}, block_skin_rejections: {},
    lang: 'ar', locale_version: 1, runner_video_open: true, ...o,
  };
}
async function open(page, { history = [], s = {} } = {}) {
  await page.addInitScript(({ u, st, se }) => {
    localStorage.clear();
    localStorage.setItem('raedworkouts.active_user', u);
    localStorage.setItem(`raedworkouts.${encodeURIComponent(u)}.state.v1`, JSON.stringify(st));
    localStorage.setItem(`raedworkouts.${encodeURIComponent(u)}.settings.v1`, JSON.stringify(se));
  }, { u: user, st: state(history), se: settings(s) });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${SKIN}-${THEME}-${name}.png`), fullPage: true });

async function toSession(page) {
  const home = page.locator('#page-home');
  await home.locator('[data-home-view-exercises]').click();
  await page.waitForTimeout(400);
  const warmup = home.locator('.warmup-phase');
  await warmup.locator('.warmup-minute-picker button').first().click();
  const drills = warmup.locator('.warmup-drill');
  for (let i = 0; i < await drills.count(); i += 1) await drills.nth(i).click();
  await warmup.locator('.btn.primary.full').click();
  await page.waitForTimeout(600);
  return home;
}

test('capture every screen', async ({ page }) => {
  // Tabs first, from a clean load: once a session is active the runner chrome
  // overlays the tab bar and intercepts the clicks.
  await open(page, { history: process.env.SHOT_EMPTY ? [] : REAL_HISTORY });
  await shot(page, '01-home');

  for (const [tab, name] of [['library','05-library'],['history','06-history'],['coach','07-coach'],['settings','08-settings']]) {
    await page.locator(`nav.tab-bar button[data-route="${tab}"]`).click();
    await page.waitForTimeout(700);
    await shot(page, name);
  }

  // Warm-up
  await page.locator('nav.tab-bar button[data-route="home"]').click();
  await page.waitForTimeout(400);
  await page.locator('#page-home [data-home-view-exercises]').click();
  await page.waitForTimeout(600);
  await shot(page, '02-warmup');

  // Session card
  await page.reload(); await page.waitForTimeout(700);
  await toSession(page);
  await shot(page, '03-session');

  // Swap sheet, from inside the session
  const swap = page.locator('#page-home [data-runner-swap], #page-home [data-swap-open], #page-home [data-open-swap]').first();
  if (await swap.count()) {
    await swap.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, '04-swap');
  }
});
