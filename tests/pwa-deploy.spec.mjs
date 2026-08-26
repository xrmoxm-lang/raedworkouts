import { expect, test } from '@playwright/test';

const deployUrl = process.env.PWA_DEPLOY_URL || '';

test.use({
  browserName: 'chromium',
  headless: true,
  viewport: { width: 390, height: 844 },
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  },
});

test('Deploy PWA: HTTPS install metadata, controlled shell, and offline reload all work', async ({ page, context }) => {
  expect(deployUrl, 'set PWA_DEPLOY_URL to the separate HTTPS v16 site; this gate must not pass without it').toMatch(/^https:\/\//);

  const response = await page.goto(deployUrl, { waitUntil: 'domcontentloaded' });
  expect(response?.url()).toMatch(/^https:\/\//);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.href;
    const payload = await fetch(href, { cache: 'no-store' }).then((res) => res.json());
    const registration = await navigator.serviceWorker.ready;
    return {
      manifest: payload,
      activeScript: registration.active?.scriptURL || '',
    };
  });
  expect(manifest.manifest.name).toBe('Raedworkouts');
  expect(manifest.manifest.short_name).toBe('Raedworkouts');
  expect(manifest.manifest.icons.map((icon) => icon.src)).toEqual([
    './icon-192.svg', './icon-512.svg', './icon-maskable-512.svg',
  ]);
  expect(manifest.activeScript).toMatch(/\/sw\.js$/);

  // A reload after ready makes the activated worker the document controller.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const sw = await page.request.get(new URL('sw.js', deployUrl).href, { headers: { 'Cache-Control': 'no-cache' } });
  expect(sw.ok()).toBe(true);
  expect(sw.headers()['cache-control'] || '', 'the host must allow new service-worker code to be checked').toMatch(/no-cache|no-store|must-revalidate/i);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.welcome-screen, [data-home-overview]').first(), 'the installed shell must open after the first online visit with no network').toBeVisible();
  console.log(`PWA_DEPLOY_HTTPS_OFFLINE_PASSED url=${deployUrl} sw=${manifest.activeScript}`);
});
