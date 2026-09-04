import { expect, test } from '@playwright/test';

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

  await expect(page.locator('#rest-timer')).toBeHidden();

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
  await expect(page.locator('#rest-timer')).toBeVisible({ timeout: 5000 });
});
