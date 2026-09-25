import { expect, test } from './_fixtures.mjs';

// Raed believes rest is automatic: "زر الراحة يعني ما أحتاجه، لأنه خلاص
// أوتوماتيكي، إذا ضغطت check على واحدة ويبدأ الراحة". This pins that it is,
// so the manual rest button stays a convenience rather than a requirement.
const appUrl = 'http://127.0.0.1:8899/index.html';
test.use({ viewport: { width: 390, height: 844 } });

test('the rest timer starts on its own when a working set is ticked', async ({ page }) => {
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent)); if (t) t.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);

  // Round 6 (2026-09-25): the one surface is the floating session clock
  // (`#session-clock`, ui/clock.js). Before any set it shows the elapsed face.
  // What this spec pins is unchanged: nothing is pressed and a countdown
  // appears by itself.
  await expect(page.locator('#session-clock')).toBeVisible();
  await expect(page.locator('#session-clock')).toHaveAttribute('data-face', 'elapsed');

  // The app requires the exercise's ramp sets before a working set can be ticked.
  const ramps = page.locator('[data-set-kind="warmup"]');
  for (let i = 0; i < await ramps.count(); i += 1) {
    await ramps.nth(i).locator('.set-check').click();
    await page.waitForTimeout(200);
  }
  const row = page.locator('[data-set-kind="working"]').first();
  await row.locator('input').nth(0).fill('40');
  await row.locator('input').nth(1).fill('10');
  await page.waitForTimeout(200);
  await row.locator('.set-check').click();

  // Nothing else is pressed: the timer must appear by itself.
  await expect(page.locator('#session-clock')).toHaveAttribute('data-face', 'rest', { timeout: 5000 });
  await expect(page.locator('#session-clock .rt-time')).toHaveText(/^\d{1,2}:\d{2}$/);
  // And nothing else carries a countdown: the row and the dock are retired.
  expect(await page.locator('[data-rest-inline], #rest-timer').count()).toBe(0);
  expect(await page.evaluate(() => document.body.classList.contains('resting'))).toBe(true);
});
