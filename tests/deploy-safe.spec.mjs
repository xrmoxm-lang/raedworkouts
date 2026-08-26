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
    // This recreates the dangerous first-origin state: a UI/profile index
    // claims a PIN, but there is neither a derived local key nor a v16 row.
    localStorage.setItem('raedworkouts.profiles.v1', JSON.stringify([
      { user_id: 'Raed', display_name: 'Raed', experience: 'detrained', has_pin: true },
    ]));
  });
}

test('Deploy safety: a fresh seeded profile hint reaches optional-PIN registration, not an impossible keypad', async ({ page }) => {
  await page.route(`${syncOrigin}/**`, (route) => route.abort());
  await seedFreshProfileHint(page);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

  const raed = page.locator('.profile-tile').filter({ hasText: 'Raed' });
  await expect(raed).toHaveCount(1);
  await raed.click();
  await expect(page.locator('.pin-panel'), 'no v16 credential exists, so a PIN prompt would be unsatisfiable').toHaveCount(0);
  const registration = page.locator('.register-panel');
  await expect(registration).toHaveCount(1);

  // Leaving both fields blank is the supported first-run path. The aborted
  // server makes this a real offline gym-basement case rather than a mock.
  await registration.locator('.btn.primary.full').click();
  await expect(page.locator('[data-home-overview]')).toHaveCount(1);
  const start = page.locator('#page-home button.btn.primary.full').first();
  await expect(start).toContainText('Upper A');
  await start.click();
  await expect(page.locator('[data-session-runner]')).toHaveCount(1);
  console.log('V16_FRESH_PROFILE_NONBLOCKING_PASSED');
});

test('Deploy safety: the fresh v16 profile writes only raed-v16, never Raed', async ({ page }) => {
  const stateWrites = [];
  await page.route(`${syncOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/users') {
      // The v15 row is intentionally present: it must not become a v16 PIN
      // credential or sync target.
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([
        { user_id: 'Raed', display_name: 'Raed', experience: 'detrained', has_pin: true, sessions: 5 },
      ]) });
      return;
    }
    if (url.pathname === '/state' && request.method() === 'POST') {
      stateWrites.push(JSON.parse(request.postData() || '{}'));
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, rev: 1, latest_rev: 1, user_id: 'raed-v16' }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  });
  await seedFreshProfileHint(page);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('.profile-tile').filter({ hasText: 'Raed' }).click();
  await page.locator('.register-panel .btn.primary.full').click();

  await expect.poll(() => stateWrites.length).toBe(1);
  expect(stateWrites[0].user_id, 'the v16 app must never POST to bare Raed').toBe('raed-v16');
  expect(stateWrites[0].settings_json.user_id, 'the local identity is not copied into remote settings').toBeUndefined();
  console.log(`V16_SYNC_NAMESPACE_BROWSER_PASSED user_id=${stateWrites[0].user_id}`);
});

test('Deploy safety: a PIN prompt remains available when the v16 server actually reports a PIN', async ({ page }) => {
  await page.route(`${syncOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/users') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([
        { user_id: 'bassam-v16', display_name: 'Bassam', experience: 'returning', has_pin: true, sessions: 2 },
      ]) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  });
  await page.addInitScript(() => localStorage.clear());
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  const bassam = page.locator('.profile-tile').filter({ hasText: 'Bassam' });
  await expect(bassam).toContainText('برمز');
  await bassam.click();
  await expect(page.locator('.pin-panel'), 'a verified v16 server PIN must still protect Bassam').toHaveCount(1);
  console.log('V16_VERIFIED_PIN_GATE_PASSED');
});
