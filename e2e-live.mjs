// End to end the way his phone does it: the deployed page, the public funnel,
// the real server, the real model. No mocks anywhere in this file.
//
//   node e2e-live.mjs                 # a general question and an unanswerable one
//   node e2e-live.mjs "سؤالك هنا"     # anything else
import { webkit } from '@playwright/test';

const APP = 'https://raedworkouts-v16.vercel.app';
const QUESTIONS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['متى أسوي ديلود؟', 'كم تكرار أسوي؟', 'وش أفضل وصفة كبسة لحم؟'];

const browser = await webkit.launch();
const page = await browser.newPage();
const calls = [];
page.on('request', (r) => { if (r.url().includes('/coach/')) calls.push(r.url()); });

await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
  if (tile) tile.click();
});
await page.waitForTimeout(800);
await page.evaluate(() => {
  const tab = [...document.querySelectorAll('.tab')].find((el) => /المدرب/.test(el.textContent));
  if (tab) tab.click();
});
await page.waitForTimeout(500);

const band = await page.locator('[data-coach-context]').count();
console.log(band ? 'session running: the exercise name goes as context' : 'no session: question only');

for (const q of QUESTIONS) {
  await page.fill('[data-coach-input]', q);
  await page.click('[data-coach-submit]');
  await page.waitForFunction(() => !document.querySelector('[data-coach-loading]'), null, { timeout: 60000 });
  await page.waitForTimeout(400);
  const answered = await page.locator('[data-coach-answer]').count();
  const refused = await page.locator('[data-coach-unanswered]').count();
  const cited = await page.locator('[data-coach-cited]').count();
  const text = await page.locator('.coach-answer-text').first().textContent().catch(() => '(none)');
  console.log(`\n=== ${q}`);
  console.log(`    answer=${answered} refusal=${refused} cited=${cited}`);
  console.log(`    ${(text || '').trim().slice(0, 240)}`);
}
console.log('\nrequests:', [...new Set(calls)].join(', '));
// Written outside the repo: anything left here would be deployed.
await page.screenshot({ path: '/tmp/coach-live.png', fullPage: true });
await browser.close();
