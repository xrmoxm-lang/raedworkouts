import { expect, test } from '@playwright/test';

// Raed asked for the coach to know which exercise he is standing at, with a
// switch — and explicitly NOT for a coach that reads his session. These pin
// both halves: the name is handed over, and nothing else is.
const appUrl = 'http://127.0.0.1:8899/index.html';
test.use({ viewport: { width: 390, height: 844 } });

async function intoSession(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent)); if (t) t.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
}

test('the coach is told which exercise he is on, and the switch turns it off', async ({ page }) => {
  // Spying on fetch in the page rather than intercepting the route: it records
  // exactly what the app decided to send, which is the thing under test, and it
  // does not depend on a URL pattern matching.
  await page.addInitScript(() => {
    window.__coachCalls = [];
    const real = window.fetch;
    window.fetch = function (url, opts) {
      try {
        // Matched on the path, not the host or port. This spy was pinned to
        // "8444/search" and kept passing after the coach moved to /coach on 443
        // and then to /answer — it was spying on a URL nothing called any more.
        if (/\/coach\/(?:search|answer)$/.test(String(url)) && opts?.body) {
          window.__coachCalls.push(JSON.parse(opts.body));
        }
      } catch (_) { /* a body we cannot parse is not this spy's problem */ }
      return Promise.resolve(new Response(
        JSON.stringify({
          status: 'ok',
          answer: { status: 'ok', answered: true, text: 'جواب', used: [0] },
          results: [{ text: 'x', work: 'W', page: 1, score: 0.9 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
  });

  await intoSession(page);
  const exerciseName = (await page.locator('#page-home .ex.expanded h4').first().textContent()).trim();

  await page.locator('nav.tab-bar button[data-route="coach"]').click();
  await page.waitForTimeout(700);

  await expect(page.locator('[data-coach-context]')).toBeVisible();
  await expect(page.locator('[data-coach-context]')).toContainText(exerciseName);

  await page.locator('[data-coach-input]').fill('كم راحة');
  await page.locator('[data-coach-submit]').click();
  await expect.poll(() => page.evaluate(() => window.__coachCalls.length), { timeout: 8000 }).toBe(1);

  const first = await page.evaluate(() => window.__coachCalls[0]);
  // The name travels in its own field. Appended to the question it narrowed
  // every question asked mid-session — "متى أسوي ديلود؟" became "when do I
  // deload for the Chest Press Machine", which his books genuinely do not cover,
  // so a perfectly answerable question came back refused.
  expect(first.context, 'the exercise name is sent as context').toBe(exerciseName);
  expect(first.question, 'the question itself is untouched').toBe('كم راحة');
  // Nothing about his sets, loads or history may cross over — he turned down a
  // coach that reads the session.
  expect(JSON.stringify(first)).not.toMatch(/weight|reps|completed|history/i);

  // Turning it off must actually stop it, not just hide the band.
  await page.locator('[data-coach-context-toggle]').uncheck();
  await page.waitForTimeout(400);
  await page.locator('[data-coach-input]').fill('كم راحة');
  await page.locator('[data-coach-submit]').click();
  await expect.poll(() => page.evaluate(() => window.__coachCalls.length), { timeout: 8000 }).toBe(2);

  const second = await page.evaluate(() => window.__coachCalls[1]);
  expect(second.question, 'with the switch off the question goes alone').toBe('كم راحة');
  expect(second.context, 'and no context field is sent at all').toBeUndefined();
});

test('no context band when no session is running', async ({ page }) => {
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent)); if (t) t.click(); });
  await page.waitForTimeout(900);
  // Picking the profile leaves a session in progress, so "no session" has to be
  // arranged rather than assumed — measured, not guessed.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k));
    const s = JSON.parse(localStorage[key]);
    s.active_session = null;
    localStorage[key] = JSON.stringify(s);
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.locator('nav.tab-bar button[data-route="coach"]').click();
  await page.waitForTimeout(700);
  await expect(page.locator('[data-coach-context]')).toHaveCount(0);
});
