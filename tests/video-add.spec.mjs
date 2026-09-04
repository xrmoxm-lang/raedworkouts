import { expect, test } from '@playwright/test';

const appUrl = process.env.APP_URL || 'http://localhost:8877';

async function enterApp(page) {
  // Keep the test local and reset custom videos before the app boots.
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  // Reset once, at first boot — NOT on every navigation. An init script runs
  // again on reload, so the unguarded version wiped the clip the reload test
  // exists to check and made the app look like it had lost it.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('video-add-reset')) return;
    sessionStorage.setItem('video-add-reset', '1');
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

// Raed is building this library himself, from his phone, one clip at a time.
// The old flow used a native prompt(), which an installed PWA can suppress
// outright — and his synced state carried ZERO custom videos, which is what
// sent me looking. These pin the path he actually uses.

async function openAddVideo(page) {
  await page.locator('#page-home .ex.expanded [data-exercise-settings]').first().click();
  await page.waitForTimeout(500);
  await page.locator('#modal [data-video-add]').first().click();
  await page.waitForTimeout(500);
}

const storedVideos = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => /state/i.test(k) && /raed/i.test(k));
  return JSON.parse(localStorage[key]).custom_videos || {};
});

test('a non-YouTube link is refused rather than stored as a broken video', async ({ page }) => {
  await enterApp(page);
  await intoSession(page);
  await openAddVideo(page);

  // D8 in miniature: a mistyped link is a wrong video, and a wrong video is
  // worse than none. The refusal must leave the store untouched.
  await page.locator('#modal [data-video-url]').fill('https://vimeo.com/12345');
  await page.locator('#modal [data-video-commit]').click();
  await page.waitForTimeout(500);

  await expect(page.locator('#modal [data-video-status]')).not.toBeEmpty();
  expect(Object.values(await storedVideos(page)).flat()).not.toContain('https://vimeo.com/12345');
  console.log('BAD_VIDEO_URL_REFUSED');
});

test('a pasted YouTube link is stored, previewed, and survives a reload', async ({ page }) => {
  await enterApp(page);
  await intoSession(page);
  await openAddVideo(page);

  await page.locator('#modal [data-video-url]').fill('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  // The thumbnail appears before he commits — proof the link resolves to a real
  // video rather than a mistyped id that becomes a permanent dead tile.
  await expect(page.locator('#modal [data-video-preview] img')).toBeVisible();

  await page.locator('#modal [data-video-commit]').click();
  await page.waitForTimeout(900);

  const stored = await storedVideos(page);
  expect(Object.values(stored).flat()).toContain('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  // It must say what actually happened, not just "added".
  await expect(page.locator('#modal [data-video-status]')).toContainText(/جوالك|خادمك/);

  // The clip he just added is listed with a remove control.
  await expect(page.locator('#modal [data-video-remove="0"]')).toHaveCount(1);

  // And it is still there after a reload — the part that matters when he is
  // adding clips one at a time over weeks.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const after = await storedVideos(page);
  expect(Object.values(after).flat()).toContain('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  console.log('CUSTOM_VIDEO_ADDED');
});

test('the same clip cannot be added twice, in either URL form', async ({ page }) => {
  await enterApp(page);
  await intoSession(page);
  await openAddVideo(page);

  await page.locator('#modal [data-video-url]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.locator('#modal [data-video-commit]').click();
  await page.waitForTimeout(700);

  // Same video, different URL shape. Comparing strings would store it twice;
  // comparing video ids is the only way that holds.
  await page.locator('#modal [data-video-url]').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.locator('#modal [data-video-commit]').click();
  await page.waitForTimeout(600);

  const clips = Object.values(await storedVideos(page)).flat();
  expect(clips.filter((u) => u.includes('dQw4w9WgXcQ'))).toHaveLength(1);
  await expect(page.locator('#modal [data-video-status]')).toContainText(/موجود/);
});
