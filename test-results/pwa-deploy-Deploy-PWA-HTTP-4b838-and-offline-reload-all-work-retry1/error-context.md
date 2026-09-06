# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pwa-deploy.spec.mjs >> Deploy PWA: HTTPS install metadata, controlled shell, and offline reload all work
- Location: tests/pwa-deploy.spec.mjs:25:1

# Error details

```
Error: set PWA_DEPLOY_URL to the separate HTTPS v16 site; this gate must not pass without it

expect(received).toMatch(expected)

Expected pattern: /^https:\/\//
Received string:  ""
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | import { LOCALE } from '../locale.js';
  3  | 
  4  | // The app ships Raed's real sync credentials and points at his real server, so
  5  | // ANY test that navigates without blocking that host pushes whatever it does to
  6  | // his live cloud row. history-delete.spec.mjs deletes sessions. Seven spec files
  7  | // had no block at all. Nothing in a test run may ever touch his data.
  8  | async function blockLiveSync(page) {
  9  |   await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  10 |   await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  11 | }
  12 | 
  13 | 
  14 | const deployUrl = process.env.PWA_DEPLOY_URL || '';
  15 | 
  16 | test.use({
  17 |   browserName: 'chromium',
  18 |   headless: true,
  19 |   viewport: { width: 390, height: 844 },
  20 |   launchOptions: {
  21 |     executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  22 |   },
  23 | });
  24 | 
  25 | test('Deploy PWA: HTTPS install metadata, controlled shell, and offline reload all work', async ({ page, context }) => {
> 26 |   expect(deployUrl, 'set PWA_DEPLOY_URL to the separate HTTPS v16 site; this gate must not pass without it').toMatch(/^https:\/\//);
     |                                                                                                              ^ Error: set PWA_DEPLOY_URL to the separate HTTPS v16 site; this gate must not pass without it
  27 | 
  28 |   await blockLiveSync(page);
  29 |   const response = await page.goto(deployUrl, { waitUntil: 'domcontentloaded' });
  30 |   expect(response?.url()).toMatch(/^https:\/\//);
  31 |   await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  32 | 
  33 |   const manifest = await page.evaluate(async () => {
  34 |     const href = document.querySelector('link[rel="manifest"]')?.href;
  35 |     const payload = await fetch(href, { cache: 'no-store' }).then((res) => res.json());
  36 |     const registration = await navigator.serviceWorker.ready;
  37 |     return {
  38 |       manifest: payload,
  39 |       activeScript: registration.active?.scriptURL || '',
  40 |     };
  41 |   });
  42 |   // Renamed to «Raedworkouts Go» on Raed's instruction. Read it from the locale
  43 |   // map rather than hardcoding it again — this assertion is the reason a rename
  44 |   // has to be made in two places, and it should not be a third.
  45 |   expect(manifest.manifest.name).toBe(LOCALE.app_name.en);
  46 |   expect(manifest.manifest.short_name).toBe(LOCALE.app_name.en);
  47 |   // This used to assert the exact list ['./icon-192.svg','./icon-512.svg',
  48 |   // './icon-maskable-512.svg'] — which is to say it actively certified a broken
  49 |   // home-screen icon, because iOS accepts no SVG for apple-touch-icon and does
  50 |   // not read this array at all. Assert the property that matters instead of the
  51 |   // literal contents: a raster icon at both install sizes, a maskable raster,
  52 |   // and an apple-touch-icon that is a PNG and actually downloads.
  53 |   const iconSrcs = manifest.manifest.icons.map((icon) => icon.src);
  54 |   const png = manifest.manifest.icons.filter((icon) => icon.type === 'image/png');
  55 |   expect(png.map((i) => i.sizes), `manifest needs raster icons, got ${iconSrcs.join(', ')}`).toEqual(
  56 |     expect.arrayContaining(['192x192', '512x512']));
  57 |   expect(png.some((i) => (i.purpose || '').includes('maskable')), 'a maskable PNG is required').toBe(true);
  58 | 
  59 |   const appleHref = await page.evaluate(() =>
  60 |     document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') || '');
  61 |   expect(appleHref, 'iOS ignores an SVG apple-touch-icon and falls back to a screenshot').toMatch(/\.png$/);
  62 |   const appleIcon = await page.request.get(new URL(appleHref, deployUrl).href);
  63 |   expect(appleIcon.ok(), 'the apple-touch-icon must actually exist on the deploy').toBe(true);
  64 |   expect(appleIcon.headers()['content-type'] || '').toContain('image/png');
  65 |   expect(manifest.activeScript).toMatch(/\/sw\.js$/);
  66 | 
  67 |   // A reload after ready makes the activated worker the document controller.
  68 |   await page.reload({ waitUntil: 'domcontentloaded' });
  69 |   await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  70 |   const sw = await page.request.get(new URL('sw.js', deployUrl).href, { headers: { 'Cache-Control': 'no-cache' } });
  71 |   expect(sw.ok()).toBe(true);
  72 |   expect(sw.headers()['cache-control'] || '', 'the host must allow new service-worker code to be checked').toMatch(/no-cache|no-store|must-revalidate/i);
  73 | 
  74 |   await context.setOffline(true);
  75 |   await page.reload({ waitUntil: 'domcontentloaded' });
  76 |   await expect(page.locator('.welcome-screen, [data-home-overview]').first(), 'the installed shell must open after the first online visit with no network').toBeVisible();
  77 |   console.log(`PWA_DEPLOY_HTTPS_OFFLINE_PASSED url=${deployUrl} sw=${manifest.activeScript}`);
  78 | });
  79 | 
```