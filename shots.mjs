// Screenshots of the screens Raed named, at phone width, so I audit what he
// actually sees rather than what the CSS says.
import { webkit } from '@playwright/test';

const APP = process.env.SHOT_URL || 'https://raedworkouts-v16.vercel.app';
const OUT = process.env.SHOT_DIR || '/tmp/shots';
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
  if (t) t.click();
});
await page.waitForTimeout(900);

// Clear any running session so home shows the pre-start state he described.
await page.evaluate(() => {
  for (const key of Object.keys(localStorage)) {
    if (!/^raedworkouts\..*\.state\.v1$/.test(key)) continue;
    try {
      const s = JSON.parse(localStorage.getItem(key));
      if (s && typeof s === 'object') { s.active_session = null; localStorage.setItem(key, JSON.stringify(s)); }
    } catch (_) { /* not a session */ }
  }
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/01-home.png`, fullPage: true });

// Into the session: warm-up first.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) => /ابدأ|أبدأ/.test(e.textContent));
  if (b) b.click();
});
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/02-warmup.png`, fullPage: true });

// Past the warm-up into the first exercise.
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) => /التالي|ابدأ التمارين|انتهيت/.test(e.textContent));
  if (b) b.click();
});
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/03-exercise.png`, fullPage: true });

// The per-exercise settings sheet.
const gear = await page.locator('[data-exercise-settings]').first();
if (await gear.count()) {
  await gear.click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/04-settings.png`, fullPage: true });
}

console.log('shots in', OUT);
await browser.close();
