# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/coach-context.spec.mjs >> the coach is told which exercise he is on, and the switch turns it off
- Location: tests/coach-context.spec.mjs:21:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1
Received: 0

Call Log:
- Timeout 8000ms exceeded while waiting on the predicate
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | // Raed asked for the coach to know which exercise he is standing at, with a
  4  | // switch — and explicitly NOT for a coach that reads his session. These pin
  5  | // both halves: the name is handed over, and nothing else is.
  6  | const appUrl = 'http://127.0.0.1:8899/index.html';
  7  | test.use({ viewport: { width: 390, height: 844 } });
  8  | 
  9  | async function intoSession(page) {
  10 |   await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  11 |   await page.goto(appUrl, { waitUntil: 'networkidle' });
  12 |   await page.waitForTimeout(800);
  13 |   await page.evaluate(() => { const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent)); if (t) t.click(); });
  14 |   await page.waitForTimeout(700);
  15 |   await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  16 |   await page.waitForTimeout(900);
  17 |   await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  18 |   await page.waitForTimeout(900);
  19 | }
  20 | 
  21 | test('the coach is told which exercise he is on, and the switch turns it off', async ({ page }) => {
  22 |   // Spying on fetch in the page rather than intercepting the route: it records
  23 |   // exactly what the app decided to send, which is the thing under test, and it
  24 |   // does not depend on a URL pattern matching.
  25 |   await page.addInitScript(() => {
  26 |     window.__coachCalls = [];
  27 |     const real = window.fetch;
  28 |     window.fetch = function (url, opts) {
  29 |       try {
  30 |         if (String(url).includes('8444/search') && opts?.body) {
  31 |           window.__coachCalls.push(JSON.parse(opts.body));
  32 |         }
  33 |       } catch (_) { /* a body we cannot parse is not this spy's problem */ }
  34 |       return Promise.resolve(new Response(
  35 |         JSON.stringify({ status: 'ok', results: [{ text: 'x', work: 'W', page: 1, score: 0.9 }] }),
  36 |         { status: 200, headers: { 'Content-Type': 'application/json' } }));
  37 |     };
  38 |   });
  39 | 
  40 |   await intoSession(page);
  41 |   const exerciseName = (await page.locator('#page-home .ex.expanded h4').first().textContent()).trim();
  42 | 
  43 |   await page.locator('nav.tab-bar button[data-route="coach"]').click();
  44 |   await page.waitForTimeout(700);
  45 | 
  46 |   await expect(page.locator('[data-coach-context]')).toBeVisible();
  47 |   await expect(page.locator('[data-coach-context]')).toContainText(exerciseName);
  48 | 
  49 |   await page.locator('[data-coach-input]').fill('كم راحة');
  50 |   await page.locator('[data-coach-submit]').click();
> 51 |   await expect.poll(() => page.evaluate(() => window.__coachCalls.length), { timeout: 8000 }).toBe(1);
     |   ^ Error: expect(received).toBe(expected) // Object.is equality
  52 | 
  53 |   const first = await page.evaluate(() => window.__coachCalls[0]);
  54 |   expect(first.question, 'the exercise name rides along with the question').toContain(exerciseName);
  55 |   // Nothing about his sets, loads or history may cross over — he turned down a
  56 |   // coach that reads the session.
  57 |   expect(JSON.stringify(first)).not.toMatch(/weight|reps|completed|history/i);
  58 | 
  59 |   // Turning it off must actually stop it, not just hide the band.
  60 |   await page.locator('[data-coach-context-toggle]').uncheck();
  61 |   await page.waitForTimeout(400);
  62 |   await page.locator('[data-coach-input]').fill('كم راحة');
  63 |   await page.locator('[data-coach-submit]').click();
  64 |   await expect.poll(() => page.evaluate(() => window.__coachCalls.length), { timeout: 8000 }).toBe(2);
  65 | 
  66 |   const second = await page.evaluate(() => window.__coachCalls[1]);
  67 |   expect(second.question, 'with the switch off the question goes alone').toBe('كم راحة');
  68 | });
  69 | 
  70 | test('no context band when no session is running', async ({ page }) => {
  71 |   await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  72 |   await page.goto(appUrl, { waitUntil: 'networkidle' });
  73 |   await page.waitForTimeout(800);
  74 |   await page.evaluate(() => { const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent)); if (t) t.click(); });
  75 |   await page.waitForTimeout(900);
  76 |   // Picking the profile leaves a session in progress, so "no session" has to be
  77 |   // arranged rather than assumed — measured, not guessed.
  78 |   await page.evaluate(() => {
  79 |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k));
  80 |     const s = JSON.parse(localStorage[key]);
  81 |     s.active_session = null;
  82 |     localStorage[key] = JSON.stringify(s);
  83 |   });
  84 |   await page.reload({ waitUntil: 'domcontentloaded' });
  85 |   await page.waitForTimeout(900);
  86 |   await page.locator('nav.tab-bar button[data-route="coach"]').click();
  87 |   await page.waitForTimeout(700);
  88 |   await expect(page.locator('[data-coach-context]')).toHaveCount(0);
  89 | });
  90 | 
```