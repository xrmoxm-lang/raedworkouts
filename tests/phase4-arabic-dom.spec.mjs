import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  ALLOWED_EXERCISE_NAMES,
  ALLOWED_PLAYLIST_TITLES,
  ALLOWED_PROPER_NOUN_ABBREVIATIONS,
  ALLOWED_PROPER_NOUNS,
  ALLOWED_WARMUP_DRILL_NAMES,
} from '../locale.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = pathToFileURL(path.join(repoRoot, 'index.html')).href;
const testUser = 'phase4-arabic-dom';

test.use({
  browserName: 'chromium',
  headless: true,
  viewport: { width: 390, height: 844 },
  launchOptions: {
    args: ['--allow-file-access-from-files'],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  },
});

function seededState() {
  return {
    schema_version: 2,
    programme_reference_migration_version: 1,
    current_week: 1,
    current_block: 1,
    profile: { display_name: 'اختبار', experience: 'returning', created_at: '2026-08-25T00:00:00.000Z' },
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
    focus_mode: true, show_cues: true,
    rest_seconds: 120, vibrate: false, notifications: false,
    music_platform: 'none',
    block_auto_color: false,
    block_skin_suggestions: {}, block_skin_rejections: {},
    lang: 'ar', locale_version: 1,
    runner_video_open: true,
  };
}

const allowedLatinRuns = [
  ...ALLOWED_EXERCISE_NAMES,
  ...ALLOWED_WARMUP_DRILL_NAMES,
  ...ALLOWED_PLAYLIST_TITLES,
  ...ALLOWED_PROPER_NOUNS,
  'Spotify',
].sort((a, b) => b.length - a.length);
const allowedProperNounAbbreviations = ALLOWED_PROPER_NOUN_ABBREVIATIONS;
function logDeferredProgramme() {
  console.log('PHASE4_ARABIC_DOM_DEFERRED count=0');
}

async function scanVisibleLatin(page, screen) {
  const result = await page.evaluate(({ allowed, abbreviations, deferred }) => {
    const latin = /[A-Za-z]/;
    const westernNumeral = /\b\d+(?:[.:×x/+-]\d+)*\b/g;
    const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // These are the two approved technical schemes, not a general URL
    // exception. Strip the fixed parameter name with the shortcut scheme so
    // its syntax cannot leak as the English word "name".
    const approvedSchemes = ['scope.bit://', 'shortcuts://run-shortcut'];
    const isVisible = (element) => {
      if (!element || element.closest('script, style, template, [hidden], [aria-hidden="true"]')) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return element.offsetParent !== null
        && rect.width > 0 && rect.height > 0
        && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    };
    const removeRuns = (value, phrases) => {
      let residual = value;
      for (const scheme of approvedSchemes) {
        residual = residual.replace(new RegExp(`${escape(scheme)}(?:\\?name=)?`, 'gi'), ' ');
      }
      for (const phrase of phrases) residual = residual.replace(new RegExp(escape(phrase), 'gi'), ' ');
      return residual
        .replace(westernNumeral, ' ')
        .replace(/\bkg\b/g, ' ')
        .replace(/\b[xX]\b/g, ' ')
        // A declared abbreviation immediately followed by digits is one label:
        // M1, M2, R1... This was hardcoded to M alone, so adding an R-prefixed
        // tile made the gate fail on a chip that is exactly as allowed as M1.
        // Driven off the abbreviation list now, so the next label needs no edit.
        .replace(new RegExp(`\\b(?:${abbreviations.filter((item) => /^[A-Za-z]+$/.test(item)).map(escape).join('|')})(?=\\d+\\b)`, 'g'), ' ')
        .replace(new RegExp(`\\b(?:${abbreviations.map(escape).join('|')})\\b`, 'g'), ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    const normalize = (value) => String(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    const deferredMatch = (value) => {
      const visible = normalize(value);
      // Attribute the entire rendered node to its source string.  This keeps
      // "Chest, shoulders, triceps" deferred when the renderer has split the
      // data.js source "Push — Chest, shoulders, triceps" into siblings.
      return deferred.find((source) => normalize(source).includes(visible));
    };
    const found = new Set();
    const deferredFound = new Set();
    const activePage = document.querySelector('.page.active');
    const roots = [
      activePage?.querySelector('[data-session-runner]') || activePage,
      document.querySelector('.app-header'),
      document.querySelector('.tab-bar'),
      document.querySelector('#rest-timer'),
    ].filter(Boolean);
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const value = node.textContent.trim();
        if (!value || !latin.test(value) || !isVisible(node.parentElement)) continue;
        // An allowed exercise/drill/name wins before programme classification.
        // This makes the buckets mutually exclusive and avoids treating the
        // word "Pull" inside an exercise name as a deferred programme label.
        const residual = removeRuns(value, allowed);
        if (!latin.test(residual)) continue;
        const matchedDeferred = deferredMatch(value);
        if (matchedDeferred) {
          deferredFound.add(matchedDeferred);
          continue;
        }
        if (latin.test(residual)) found.add(value);
      }
    }
    return {
      offenders: [...found].sort((a, b) => a.localeCompare(b)),
      deferred: [...deferredFound].sort((a, b) => a.localeCompare(b)),
    };
  }, { allowed: allowedLatinRuns, abbreviations: allowedProperNounAbbreviations, deferred: [] });
  console.log(`PHASE4_ARABIC_DOM screen=${screen} offending=${JSON.stringify(result.offenders)} deferred=${JSON.stringify(result.deferred)}`);
  return result.offenders.map((text) => ({ screen, text }));
}

async function openSignedInArabicApp(page) {
  await page.route('https://**/*', (route) => route.abort());
  await page.addInitScript(({ user, state, settings }) => {
    if (sessionStorage.getItem('phase4-arabic-dom-seeded')) return;
    localStorage.clear();
    localStorage.setItem('raedworkouts.active_user', user);
    localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.state.v1`, JSON.stringify(state));
    localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.settings.v1`, JSON.stringify(settings));
    sessionStorage.setItem('phase4-arabic-dom-seeded', 'true');
  }, { user: testUser, state: seededState(), settings: seededSettings() });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
}

async function visitTab(page, route) {
  await page.locator(`.tab[data-route="${route}"]`).click();
  await expect(page.locator(`#page-${route}`)).toHaveClass(/active/);
}

test('Phase 4 Arabic UI renders no undeclared visible Latin text on every reachable screen', async ({ page }) => {
  const findings = [];
  // Round 5 translated the live Upper/Lower programme. Keep the zero count
  // explicit so future programme data cannot be silently treated as deferred.
  logDeferredProgramme();
  await openSignedInArabicApp(page);

  findings.push(...await scanVisibleLatin(page, 'home'));
  for (const route of ['library', 'history', 'settings']) {
    await visitTab(page, route);
    findings.push(...await scanVisibleLatin(page, route));
  }
  // Phase 6 moved Help into Settings. Opening its disclosure proves the
  // merged destination remains reachable without reviving the old Help tab.
  await page.locator('#page-settings [data-settings-disclosure]').last().locator('summary').click();
  findings.push(...await scanVisibleLatin(page, 'settings-help'));

  await visitTab(page, 'home');
  await page.locator('#page-home button.btn.primary.full').first().click();
  await expect(page.locator('[data-session-preview]')).toHaveCount(0);
  const warmup = page.locator('#page-home .warmup-phase');
  await expect(warmup).toHaveCount(1);
  findings.push(...await scanVisibleLatin(page, 'session-warmup'));
  await warmup.locator('.warmup-minute-picker button').first().click();
  const drills = warmup.locator('.warmup-drill');
  const drillCount = await drills.count();
  for (let index = 0; index < drillCount; index += 1) await drills.nth(index).click();
  await warmup.locator('.btn.primary.full').click();
  await expect(page.locator('#page-home .ex.expanded')).toHaveCount(1);
  findings.push(...await scanVisibleLatin(page, 'session-lifting'));

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('raedworkouts.profiles.v1', JSON.stringify([
      { user_id: 'arabic-profile', display_name: 'ملف تجريبي', experience: 'returning' },
    ]));
  });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  findings.push(...await scanVisibleLatin(page, 'profiles'));
  await page.getByRole('button', { name: /ملف تجريبي/ }).click();
  await expect(page.locator('.pin-panel, .pin-key, input[type="password"]')).toHaveCount(0);
  // A fresh profile is correctly on its planned-session Home, not in an
  // active workout. The old active-banner assertion made this gate fail after
  // every clean profile launch despite the screen being reachable and valid.
  await expect(page.locator('#page-home')).toHaveClass(/active/);
  await expect(page.locator('#page-home [data-home-stat-tiles]')).toHaveCount(1);
  await expect(page.locator('#page-home [data-home-view-exercises]')).toHaveCount(1);
  findings.push(...await scanVisibleLatin(page, 'profile-direct'));

  await page.evaluate(() => localStorage.removeItem('raedworkouts.active_user'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /شخص آخر/ }).click();
  await expect(page.locator('.register-panel')).toHaveCount(1);
  findings.push(...await scanVisibleLatin(page, 'profile-other'));
  await page.locator('.register-panel input[type="text"]').fill('اختبار');
  await page.locator('.register-panel .btn.primary.full').click();
  await expect(page.locator('.register-panel')).toHaveCount(1);
  findings.push(...await scanVisibleLatin(page, 'profile-register'));

  expect(findings, 'visible Latin text must be an explicit allowed run on every reachable Arabic screen').toEqual([]);
  console.log('PHASE4_ARABIC_DOM_PASSED');
});
