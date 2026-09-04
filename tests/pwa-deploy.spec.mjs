import { expect, test } from '@playwright/test';
import { LOCALE } from '../locale.js';

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
  // Renamed to «Raedworkouts Go» on Raed's instruction. Read it from the locale
  // map rather than hardcoding it again — this assertion is the reason a rename
  // has to be made in two places, and it should not be a third.
  expect(manifest.manifest.name).toBe(LOCALE.app_name.en);
  expect(manifest.manifest.short_name).toBe(LOCALE.app_name.en);
  // This used to assert the exact list ['./icon-192.svg','./icon-512.svg',
  // './icon-maskable-512.svg'] — which is to say it actively certified a broken
  // home-screen icon, because iOS accepts no SVG for apple-touch-icon and does
  // not read this array at all. Assert the property that matters instead of the
  // literal contents: a raster icon at both install sizes, a maskable raster,
  // and an apple-touch-icon that is a PNG and actually downloads.
  const iconSrcs = manifest.manifest.icons.map((icon) => icon.src);
  const png = manifest.manifest.icons.filter((icon) => icon.type === 'image/png');
  expect(png.map((i) => i.sizes), `manifest needs raster icons, got ${iconSrcs.join(', ')}`).toEqual(
    expect.arrayContaining(['192x192', '512x512']));
  expect(png.some((i) => (i.purpose || '').includes('maskable')), 'a maskable PNG is required').toBe(true);

  const appleHref = await page.evaluate(() =>
    document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') || '');
  expect(appleHref, 'iOS ignores an SVG apple-touch-icon and falls back to a screenshot').toMatch(/\.png$/);
  const appleIcon = await page.request.get(new URL(appleHref, deployUrl).href);
  expect(appleIcon.ok(), 'the apple-touch-icon must actually exist on the deploy').toBe(true);
  expect(appleIcon.headers()['content-type'] || '').toContain('image/png');
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
