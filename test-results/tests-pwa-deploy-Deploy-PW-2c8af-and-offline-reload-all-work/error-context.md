# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/pwa-deploy.spec.mjs >> Deploy PWA: HTTPS install metadata, controlled shell, and offline reload all work
- Location: tests/pwa-deploy.spec.mjs:15:1

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
  4  | const deployUrl = process.env.PWA_DEPLOY_URL || '';
  5  | 
  6  | test.use({
  7  |   browserName: 'chromium',
  8  |   headless: true,
  9  |   viewport: { width: 390, height: 844 },
  10 |   launchOptions: {
  11 |     executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  12 |   },
  13 | });
  14 | 
  15 | test('Deploy PWA: HTTPS install metadata, controlled shell, and offline reload all work', async ({ page, context }) => {
> 16 |   expect(deployUrl, 'set PWA_DEPLOY_URL to the separate HTTPS v16 site; this gate must not pass without it').toMatch(/^https:\/\//);
     |                                                                                                              ^ Error: set PWA_DEPLOY_URL to the separate HTTPS v16 site; this gate must not pass without it
  17 | 
  18 |   const response = await page.goto(deployUrl, { waitUntil: 'domcontentloaded' });
  19 |   expect(response?.url()).toMatch(/^https:\/\//);
  20 |   await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  21 | 
  22 |   const manifest = await page.evaluate(async () => {
  23 |     const href = document.querySelector('link[rel="manifest"]')?.href;
  24 |     const payload = await fetch(href, { cache: 'no-store' }).then((res) => res.json());
  25 |     const registration = await navigator.serviceWorker.ready;
  26 |     return {
  27 |       manifest: payload,
  28 |       activeScript: registration.active?.scriptURL || '',
  29 |     };
  30 |   });
  31 |   // Renamed to «Raedworkouts Go» on Raed's instruction. Read it from the locale
  32 |   // map rather than hardcoding it again — this assertion is the reason a rename
  33 |   // has to be made in two places, and it should not be a third.
  34 |   expect(manifest.manifest.name).toBe(LOCALE.app_name.en);
  35 |   expect(manifest.manifest.short_name).toBe(LOCALE.app_name.en);
  36 |   expect(manifest.manifest.icons.map((icon) => icon.src)).toEqual([
  37 |     './icon-192.svg', './icon-512.svg', './icon-maskable-512.svg',
  38 |   ]);
  39 |   expect(manifest.activeScript).toMatch(/\/sw\.js$/);
  40 | 
  41 |   // A reload after ready makes the activated worker the document controller.
  42 |   await page.reload({ waitUntil: 'domcontentloaded' });
  43 |   await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  44 |   const sw = await page.request.get(new URL('sw.js', deployUrl).href, { headers: { 'Cache-Control': 'no-cache' } });
  45 |   expect(sw.ok()).toBe(true);
  46 |   expect(sw.headers()['cache-control'] || '', 'the host must allow new service-worker code to be checked').toMatch(/no-cache|no-store|must-revalidate/i);
  47 | 
  48 |   await context.setOffline(true);
  49 |   await page.reload({ waitUntil: 'domcontentloaded' });
  50 |   await expect(page.locator('.welcome-screen, [data-home-overview]').first(), 'the installed shell must open after the first online visit with no network').toBeVisible();
  51 |   console.log(`PWA_DEPLOY_HTTPS_OFFLINE_PASSED url=${deployUrl} sw=${manifest.activeScript}`);
  52 | });
  53 | 
```