import { expect, test } from '@playwright/test';

const appUrl = process.env.APP_URL || 'http://localhost:8877';

async function enterApp(page) {
  // Keep the test local and reset custom videos before the app boots.
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (!/\.state\./.test(key)) continue;
      try {
        const parsed = JSON.parse(localStorage[key]);
        parsed.custom_videos = {};
        localStorage[key] = JSON.stringify(parsed);
      } catch { /* a malformed key is not this test's problem */ }
    }
  });
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(700);
}

async function intoSession(page) {
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
}

test('a non-YouTube link is refused rather than stored as a broken video', async ({ page }) => {
  await enterApp(page);
  await intoSession(page);

  // D8 in miniature: a mistyped link is a wrong video, and a wrong video is
  // worse than none. The refusal must leave the store untouched.
  // A prompt then an alert: two dialogs from one click, so the handler has to
  // persist rather than fire once.
  const seen = [];
  page.on('dialog', (dialog) => {
    seen.push(dialog.type());
    return dialog.type() === 'prompt' ? dialog.accept('https://vimeo.com/12345') : dialog.accept();
  });
  await page.locator('[data-video-add]').first().click();
  await page.waitForTimeout(600);

  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /state/i.test(k) && /raed/i.test(k));
    return JSON.parse(localStorage[key]).custom_videos || {};
  });
  expect(Object.values(stored).flat()).not.toContain('https://vimeo.com/12345');
  // The alert is the proof it was actively refused, not silently dropped.
  expect(seen).toEqual(['prompt', 'alert']);
  console.log('BAD_VIDEO_URL_REFUSED');
});

test('a real YouTube link is added and shows up as a tile', async ({ page }) => {
  await enterApp(page);
  await intoSession(page);

  const before = await page.locator('.video-row a, .video-row .video-thumb-wrap').count();
  page.once('dialog', (dialog) => dialog.accept('https://www.youtube.com/shorts/dQw4w9WgXcQ'));
  await page.locator('[data-video-add]').first().click();
  await page.waitForTimeout(800);

  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /state/i.test(k) && /raed/i.test(k));
    return JSON.parse(localStorage[key]).custom_videos || {};
  });
  expect(Object.values(stored).flat()).toContain('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  const after = await page.locator('.video-row a, .video-row .video-thumb-wrap').count();
  expect(after).toBeGreaterThan(before);
  console.log('CUSTOM_VIDEO_ADDED');
});
