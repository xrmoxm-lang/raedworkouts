# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/pwa-deploy.spec.mjs >> Deploy PWA: HTTPS install metadata, controlled shell, and offline reload all work
- Location: tests/pwa-deploy.spec.mjs:14:1

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
  2  | 
  3  | const deployUrl = process.env.PWA_DEPLOY_URL || '';
  4  | 
  5  | test.use({
  6  |   browserName: 'chromium',
  7  |   headless: true,
  8  |   viewport: { width: 390, height: 844 },
  9  |   launchOptions: {
  10 |     executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  11 |   },
  12 | });
  13 | 
  14 | test('Deploy PWA: HTTPS install metadata, controlled shell, and offline reload all work', async ({ page, context }) => {
> 15 |   expect(deployUrl, 'set PWA_DEPLOY_URL to the separate HTTPS v16 site; this gate must not pass without it').toMatch(/^https:\/\//);
     |                                                                                                              ^ Error: set PWA_DEPLOY_URL to the separate HTTPS v16 site; this gate must not pass without it
  16 | 
  17 |   const response = await page.goto(deployUrl, { waitUntil: 'domcontentloaded' });
  18 |   expect(response?.url()).toMatch(/^https:\/\//);
  19 |   await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  20 | 
  21 |   const manifest = await page.evaluate(async () => {
  22 |     const href = document.querySelector('link[rel="manifest"]')?.href;
  23 |     const payload = await fetch(href, { cache: 'no-store' }).then((res) => res.json());
  24 |     const registration = await navigator.serviceWorker.ready;
  25 |     return {
  26 |       manifest: payload,
  27 |       activeScript: registration.active?.scriptURL || '',
  28 |     };
  29 |   });
  30 |   expect(manifest.manifest.name).toBe('Raedworkouts');
  31 |   expect(manifest.manifest.short_name).toBe('Raedworkouts');
  32 |   expect(manifest.manifest.icons.map((icon) => icon.src)).toEqual([
  33 |     './icon-192.svg', './icon-512.svg', './icon-maskable-512.svg',
  34 |   ]);
  35 |   expect(manifest.activeScript).toMatch(/\/sw\.js$/);
  36 | 
  37 |   // A reload after ready makes the activated worker the document controller.
  38 |   await page.reload({ waitUntil: 'domcontentloaded' });
  39 |   await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  40 |   const sw = await page.request.get(new URL('sw.js', deployUrl).href, { headers: { 'Cache-Control': 'no-cache' } });
  41 |   expect(sw.ok()).toBe(true);
  42 |   expect(sw.headers()['cache-control'] || '', 'the host must allow new service-worker code to be checked').toMatch(/no-cache|no-store|must-revalidate/i);
  43 | 
  44 |   await context.setOffline(true);
  45 |   await page.reload({ waitUntil: 'domcontentloaded' });
  46 |   await expect(page.locator('.welcome-screen, [data-home-overview]').first(), 'the installed shell must open after the first online visit with no network').toBeVisible();
  47 |   console.log(`PWA_DEPLOY_HTTPS_OFFLINE_PASSED url=${deployUrl} sw=${manifest.activeScript}`);
  48 | });
  49 | 
```