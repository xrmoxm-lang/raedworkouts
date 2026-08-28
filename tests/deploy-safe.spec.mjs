import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = pathToFileURL(path.join(repoRoot, 'index.html')).href;
const syncOrigin = 'https://raed-hp.tail53bd35.ts.net:8443';

test.use({
  browserName: 'chromium',
  headless: true,
  viewport: { width: 390, height: 844 },
  launchOptions: {
    args: ['--allow-file-access-from-files'],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  },
});

async function seedFreshProfileHint(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    // This reproduces the formerly dangerous fresh-origin state. The stale
    // hint must be ignored: profiles now open directly, with no PIN UI.
    localStorage.setItem('raedworkouts.profiles.v1', JSON.stringify([
      { user_id: 'Raed', display_name: 'Raed', experience: 'detrained', has_pin: true },
    ]));
  });
}

async function expectNoPinUi(page) {
  await expect(page.locator('.pin-panel, .pin-key, input[type="password"]')).toHaveCount(0);
  await expect(page.getByText(/أدخل الرمز|أدخل رمزك|رمز الدخول/)).toHaveCount(0);
}

test('Deploy safety: a fresh seeded profile opens directly and exposes no PIN UI', async ({ page }) => {
  await page.route(`${syncOrigin}/**`, (route) => route.abort());
  await seedFreshProfileHint(page);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

  const raed = page.locator('.profile-tile').filter({ hasText: 'Raed' });
  await expect(raed).toHaveCount(1);
  await raed.click();

  await expectNoPinUi(page);
  await expect(page.locator('[data-home-overview]')).toHaveCount(1);
  const start = page.locator('#page-home button.btn.primary.full').first();
  await expect(start).toContainText('علوي أ');
  await start.click();
  await expect(page.locator('#page-home .warmup-phase')).toHaveCount(1);
  console.log('V16_FRESH_PROFILE_DIRECT_OPEN_PASSED');
});

test('Deploy safety: even a legacy server credential cannot restore a PIN gate', async ({ page }) => {
  await page.route(`${syncOrigin}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/users') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([
        { user_id: 'bassam-v16', display_name: 'Bassam', experience: 'returning', has_pin: true, sessions: 2 },
      ]) });
      return;
    }
    if (pathname === '/state' && route.request().method() === 'GET') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'credential_retired' }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('.profile-tile').filter({ hasText: 'Bassam' }).click();

  await expectNoPinUi(page);
  await expect(page.locator('[data-home-overview]')).toHaveCount(1);
  console.log('V16_LEGACY_CREDENTIAL_NEVER_GATES_PASSED');
});

test('Deploy safety: direct first-run sync writes only a namespaced v16 row without a credential header', async ({ page }) => {
  const stateWrites = [];
  const registerCalls = [];
  await page.route(`${syncOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/users') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([
        { user_id: 'Raed', display_name: 'Raed', experience: 'detrained', has_pin: true, sessions: 5 },
      ]) });
      return;
    }
    if (url.pathname === '/register') {
      registerCalls.push(request);
      await route.fulfill({ status: 410, contentType: 'application/json', body: JSON.stringify({ error: 'retired' }) });
      return;
    }
    if (url.pathname === '/state' && request.method() === 'GET') {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
      return;
    }
    if (url.pathname === '/state' && request.method() === 'POST') {
      stateWrites.push({ body: JSON.parse(request.postData() || '{}'), headers: request.headers() });
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, rev: 1, latest_rev: 1, user_id: 'raed-v16' }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  });
  await seedFreshProfileHint(page);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('.profile-tile').filter({ hasText: 'Raed' }).click();

  await expect.poll(() => stateWrites.length).toBe(1);
  expect(stateWrites[0].body.user_id, 'the v16 app must never POST to bare Raed').toBe('raed-v16');
  expect(stateWrites[0].body.settings_json.user_id, 'the local identity is not copied into remote settings').toBeUndefined();
  expect(stateWrites[0].headers['x-user-key'], 'no retired credential header may leave the client').toBeUndefined();
  expect(registerCalls, 'profile setup must not call the retired credential endpoint').toHaveLength(0);
  console.log(`V16_SYNC_NAMESPACE_BROWSER_PASSED user_id=${stateWrites[0].body.user_id}`);
});

test('Deploy safety: no reachable profile, settings, or help screen contains PIN controls', async ({ page }) => {
  await page.route(`${syncOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/users') {
      await route.fulfill({ contentType: 'application/json', body: '[]' });
      return;
    }
    if (url.pathname === '/state' && route.request().method() === 'GET') {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, rev: 1 }) });
  });
  await seedFreshProfileHint(page);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await expectNoPinUi(page);
  await page.locator('.profile-tile').filter({ hasText: 'Raed' }).click();
  for (const route of ['home', 'settings']) {
    if (route !== 'home') await page.locator(`.tab[data-route="${route}"]`).click();
    await expectNoPinUi(page);
  }
  await page.locator('#page-settings [data-settings-disclosure]').last().locator('summary').click();
  await expectNoPinUi(page);
  console.log('V16_NO_PIN_UI_PASSED');
});
