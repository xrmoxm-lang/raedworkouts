// Round 6 — the finish screen: the clock is the hero, the cool-down is always
// a line, and finishing without deciding on it can still log it here.
//
// Raed 2026-09-25: «ديزاين الانتهاء مو عجبني … خلينا نركز على الوقت … وما
// حطينا الـpost cardio». ROUND6-FABLE-BRIEF §B.
import { expect, test } from './_fixtures.mjs';

test.use({ viewport: { width: 390, height: 844 } });

async function pickRaed(page) {
  await page.evaluate(() => { const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent)); if (t) t.click(); });
  await page.waitForTimeout(700);
}
// A session with every set logged, 72 minutes old, cool-down untouched.
async function finishedSession(page, mutate = () => {}) {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto('http://localhost:8877', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await pickRaed(page);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(700);
  await page.evaluate((mutateSrc) => {
    const key = Object.keys(localStorage).find((x) => /\.state\./.test(x) && /raed/i.test(x));
    const profile = JSON.parse(localStorage[key]);
    const active = profile.active_session;
    active.started_at = new Date(Date.now() - 72 * 60 * 1000).toISOString();
    Object.values(active.exercises).forEach((entry) => {
      (entry.sets || []).forEach((s) => { if (s.is_warmup) { s.completed = true; return; } s.weight = 40; s.reps = 10; s.rpe = 8; s.completed = true; });
    });
    active.phase = 'lifting';
    // eslint-disable-next-line no-new-func
    new Function('active', mutateSrc)(active);
    localStorage[key] = JSON.stringify(profile);
  }, `(${mutate.toString()})(active)`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await pickRaed(page);
  await page.evaluate(() => document.querySelector('[data-finish-session]')?.click());
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.location.hash)).toBe('#end');
}

test('the hero is the clock in h:mm:ss, above the ledger, and the page opens at its top', async ({ page }) => {
  await finishedSession(page);
  const shape = await page.evaluate(() => {
    const clock = document.querySelector('#page-end [data-end-clock]');
    const ledger = document.querySelector('#page-end [data-end-ledger]');
    const title = document.querySelector('#page-end h2');
    const header = document.querySelector('.app-header').getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      clock: clock?.textContent, clockTop: clock?.getBoundingClientRect().top, clockSize: parseFloat(getComputedStyle(clock).fontSize),
      ledgerTop: ledger?.getBoundingClientRect().top, cells: ledger?.querySelectorAll('.stat').length,
      titleTop: title?.getBoundingClientRect().top,
      headerBottom: header.bottom,
      hero: document.querySelector('#page-end .hero, #page-end .check-draw') ? 'present' : 'absent',
    };
  });
  expect(shape.scrollY, 'the end screen opens at its top').toBe(0);
  expect(shape.clock).toMatch(/^1:1[12]:\d{2}$/);
  expect(shape.clockSize).toBeGreaterThanOrEqual(40);
  expect(shape.clockTop, 'the clock must be visible, not under the header').toBeGreaterThanOrEqual(shape.headerBottom);
  expect(shape.clockTop).toBeLessThan(shape.titleTop);
  expect(shape.titleTop).toBeLessThan(shape.ledgerTop);
  expect(shape.cells).toBe(3);
  expect(shape.hero, 'the generic check-circle is retired').toBe('absent');
});

test('cool-down untouched at finish → «سجّل التهدئة» logs it into the archived session', async ({ page }) => {
  await finishedSession(page);
  await expect(page.locator('#page-end [data-end-cardio="open"]')).toBeVisible();
  await page.locator('#page-end [data-end-cardio-log]').click();
  await page.waitForTimeout(400);
  await expect(page.locator('#page-end [data-end-cardio="form"] [data-cardio-block]')).toBeVisible();
  // The open flag is render-only: the archived session on disk carries no trace of it.
  const persisted = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((x) => /\.state\./.test(x) && /raed/i.test(x));
    return localStorage[key].includes('_cardio_open');
  });
  expect(persisted).toBe(false);
  // Log it with the form's defaults.
  await page.evaluate(() => document.querySelector('#page-end [data-cardio-log]')?.click());
  await page.waitForTimeout(500);
  await expect(page.locator('#page-end [data-end-cardio="logged"] [data-cardio-summary]')).toBeVisible();
  const archived = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((x) => /\.state\./.test(x) && /raed/i.test(x));
    const profile = JSON.parse(localStorage[key]);
    const last = profile.history[profile.history.length - 1];
    return { active: profile.active_session, completed: Boolean(last.cardio?.completed_at), skipped: Boolean(last.cardio?.skipped) };
  });
  expect(archived.active).toBeNull();
  expect(archived.completed, 'the cool-down is on the ARCHIVED session').toBe(true);
  expect(archived.skipped).toBe(false);
});

test('cool-down skipped → one muted line with a way back; logged → the summary line', async ({ page }) => {
  await finishedSession(page, (active) => { active.cardio = { ...(active.cardio || {}), skipped: true, completed_at: null }; });
  await expect(page.locator('#page-end [data-end-cardio="skipped"]')).toBeVisible();
  await page.locator('#page-end [data-end-cardio-log]').click();
  await page.waitForTimeout(400);
  // Un-skipping reopens the form on this screen.
  await expect(page.locator('#page-end [data-cardio-block]')).toBeVisible();
});

test('no toast and no undo after finishing — the screen is the confirmation', async ({ page }) => {
  await finishedSession(page);
  await page.waitForTimeout(1000);
  const toasts = await page.evaluate(() => [...document.querySelectorAll('.toast')].filter((t) => t.offsetParent !== null && /تراجع/.test(t.textContent)).length);
  expect(toasts, 'the finish undo is removed (Raed 2026-09-25)').toBe(0);
});
