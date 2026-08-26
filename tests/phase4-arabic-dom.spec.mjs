import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  ALLOWED_EXERCISE_NAMES,
  ALLOWED_PLAYLIST_TITLES,
  ALLOWED_PROPER_NOUN_ABBREVIATIONS,
  ALLOWED_PROPER_NOUNS,
  ALLOWED_WARMUP_DRILL_NAMES,
  LOCALE,
} from '../locale.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = pathToFileURL(path.join(repoRoot, 'index.html')).href;
const testUser = 'phase4-arabic-dom';
const appSource = fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8');
const dataSource = fs.readFileSync(path.join(repoRoot, 'data.js'), 'utf8');
const dataSandbox = { window: {} };
vm.createContext(dataSandbox);
vm.runInContext(dataSource, dataSandbox, { filename: 'data.js' });

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

const allowedLatinRuns = [
  ...ALLOWED_EXERCISE_NAMES,
  ...ALLOWED_WARMUP_DRILL_NAMES,
  ...ALLOWED_PLAYLIST_TITLES,
  ...ALLOWED_PROPER_NOUNS,
  'Spotify',
].sort((a, b) => b.length - a.length);
const allowedProperNounAbbreviations = ALLOWED_PROPER_NOUN_ABBREVIATIONS;
const deferredProgrammeEntries = new Map();
const addDeferredProgrammeEntry = (value, source) => {
  if (typeof value !== 'string' || !value.trim() || !/[A-Za-z]/.test(value)) return;
  if (!deferredProgrammeEntries.has(value)) deferredProgrammeEntries.set(value, new Set());
  deferredProgrammeEntries.get(value).add(source);
};
for (const programme of [dataSandbox.window.RW?.PROGRAMME, dataSandbox.window.RW?.PROGRAMME_PPL]) {
  if (!programme) continue;
  addDeferredProgrammeEntry(programme.block_name, 'programme block name');
  for (const note of programme.notes || []) addDeferredProgrammeEntry(note, 'programme note');
  for (const session of programme.sessions || []) {
    addDeferredProgrammeEntry(session.day, 'programme session day');
    addDeferredProgrammeEntry(session.name, 'programme session name');
    addDeferredProgrammeEntry(session.mood, 'programme session mood');
  }
}
// Help contains two programme descriptions which are not data.js values, but
// are just as D6-bound. They remain visible and explicitly reported below.
const deferredProgrammeUiRuns = [
  LOCALE.programme_tied_ppl_help?.en,
  LOCALE.programme_tied_fullbody_help?.en,
]
  .filter((value) => /[A-Za-z]/.test(value));
const deferredProgrammeVariantEntries = new Map();
for (const match of appSource.matchAll(/(?:^|\n)\s*(\w+):\s*\{\s*label:\s*'([^']+)',\s*desc:\s*'([^']+)',\s*programme_tied:\s*true\s*\}/g)) {
  const [, key, label, description] = match;
  deferredProgrammeVariantEntries.set(label, `app.js programme variant ${key} label`);
  deferredProgrammeVariantEntries.set(description, `app.js programme variant ${key} description`);
}
if (deferredProgrammeVariantEntries.size !== 4) {
  throw new Error('G20 could not read every programme-tied VARIANTS label and description from app.js');
}
// Preserve the complete deferred source text.  Renderers may split a session
// name across sibling elements, but those pieces still originate in this one
// data.js source string.
const deferredProgrammeSources = [...new Set([
  ...deferredProgrammeEntries.keys(),
  ...deferredProgrammeUiRuns,
  ...deferredProgrammeVariantEntries.keys(),
])].sort((a, b) => b.length - a.length);

function logDeferredProgramme() {
  console.log(`PHASE4_ARABIC_DOM_DEFERRED count=${deferredProgrammeEntries.size}`);
  for (const [value, sources] of [...deferredProgrammeEntries.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`DEFERRED — awaits the Upper/Lower port (D6) (${[...sources].join(', ')}): ${JSON.stringify(value)}`);
  }
  for (const value of deferredProgrammeUiRuns.sort((a, b) => a.localeCompare(b))) {
    console.log(`DEFERRED — awaits the Upper/Lower port (D6) (programme-tied Help copy): ${JSON.stringify(value)}`);
  }
  for (const [value, source] of [...deferredProgrammeVariantEntries.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`DEFERRED — awaits the Upper/Lower port (D6) (${source}): ${JSON.stringify(value)}`);
  }
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
        .replace(/\b(?:M)(?=\d+\b)/g, ' ')
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
  }, { allowed: allowedLatinRuns, abbreviations: allowedProperNounAbbreviations, deferred: deferredProgrammeSources });
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
  // A green DOM scan must remain explicit about the D6 programme material it
  // permits. This mirrors the source verifier rather than hiding exceptions.
  logDeferredProgramme();
  await openSignedInArabicApp(page);

  findings.push(...await scanVisibleLatin(page, 'home'));
  for (const route of ['library', 'history', 'settings', 'help']) {
    await visitTab(page, route);
    findings.push(...await scanVisibleLatin(page, route));
  }

  await visitTab(page, 'home');
  await page.locator('#page-home button.btn.primary.full').first().click();
  await expect(page.locator('[data-session-runner]')).toHaveCount(1);
  findings.push(...await scanVisibleLatin(page, 'runner-warmup'));
  await page.locator('[data-runner-skip-warmup]').click();
  await expect(page.locator('[data-session-runner][data-runner-phase="lifting"]')).toHaveCount(1);
  findings.push(...await scanVisibleLatin(page, 'runner-lifting'));

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('raedworkouts.profiles.v1', JSON.stringify([
      { user_id: 'arabic-pin-profile', display_name: 'ملف تجريبي', has_pin: true, experience: 'returning' },
    ]));
  });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  findings.push(...await scanVisibleLatin(page, 'profiles'));
  await page.getByRole('button', { name: /ملف تجريبي/ }).click();
  await expect(page.locator('.pin-panel')).toHaveCount(1);
  findings.push(...await scanVisibleLatin(page, 'profile-pin'));
  await page.getByRole('button', { name: /الملفات/ }).click();
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
