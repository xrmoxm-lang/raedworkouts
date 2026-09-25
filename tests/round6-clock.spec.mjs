// Round 6 — the floating session clock and the centred Home tiles.
//
// Raed 2026-09-25: «ديزاين الوقت مو عاجبني، أنا أحب الديزاين floating وأقدر
// أحركه يمين، يسار … زي الدائرة صغيرة»، «وقت التمرين يكون بالساعات»، and
// «الأرقام ما هي سنترال في المواظبة وهذا الأسبوع». ROUND6-FABLE-BRIEF §A, §C.
//
// Raed 2026-09-25, after the preview: «ما أبغاه يطلع، أبغاه يختفي إذا ما فيه
// عداد، مو يطلع وقت الزمن — هذا شيء مرة مهم». The clock is the REST countdown
// and nothing else: it exists only while a rest is running, and never shows the
// session's elapsed time.
import { expect, test } from './_fixtures.mjs';

test.use({ viewport: { width: 390, height: 844 } });

async function boot(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto('http://localhost:8877', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await pickRaed(page);
}
async function pickRaed(page) {
  await page.evaluate(() => { const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent)); if (t) t.click(); });
  await page.waitForTimeout(700);
}
async function startSession(page) {
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(700);
}
const clockState = (page) => page.evaluate(() => {
  const c = document.getElementById('session-clock');
  const r = c?.getBoundingClientRect();
  return c ? {
    hidden: c.hidden, face: c.getAttribute('data-face'), side: c.dataset.side,
    time: c.querySelector('.rt-time')?.textContent || null,
    rect: r ? { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } : null,
    resting: document.body.classList.contains('resting'),
  } : null;
});

test('Home stat tiles are centred columns', async ({ page }) => {
  await boot(page);
  const tiles = await page.evaluate(() => [...document.querySelectorAll('[data-home-stat-tiles] .stat')].map((tile) => {
    const t = tile.getBoundingClientRect();
    const n = tile.querySelector('.stat-num').getBoundingClientRect();
    const c = tile.querySelector('.stat-cap').getBoundingClientRect();
    return { tile: t.left + t.width / 2, num: n.left + n.width / 2, cap: c.left + c.width / 2, align: getComputedStyle(tile).textAlign };
  }));
  expect(tiles.length).toBe(3);
  for (const tile of tiles) {
    expect(tile.align).toBe('center');
    // Number and caption share the column's centre, within a pixel of rounding.
    expect(Math.abs(tile.num - tile.tile), `number centre ${tile.num} vs tile centre ${tile.tile}`).toBeLessThanOrEqual(1.5);
    expect(Math.abs(tile.cap - tile.tile), `caption centre ${tile.cap} vs tile centre ${tile.tile}`).toBeLessThanOrEqual(1.5);
  }
});

// Tick the ramps, then the next working set → a rest starts by itself (the same
// path he takes; tests/rest-autostart.spec.mjs pins that it is automatic).
async function startRestByTicking(page) {
  await page.evaluate(() => { document.querySelectorAll('#page-home .ex.expanded .set-grid.warm .set-check').forEach((b) => b.click()); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelectorAll('#page-home .ex.expanded .effort-strip button').forEach((b) => b.click()); });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#page-home .ex.expanded .set-grid')].filter((r) => !r.classList.contains('warm') && !r.classList.contains('done'));
    rows[0].querySelector('.set-check')?.click();
  });
  await page.waitForTimeout(800);
}
// The app's own module instance (same URL → same ES module), so the test can
// shorten the ONE running rest and watch it run out naturally.
const shortenRest = (page, ms) => page.evaluate(async (left) => {
  const rest = await import('/core/rest.js');
  rest.restTimer.end = Date.now() + left;
}, ms);

test('the clock is hidden with no rest running (even mid-session, on every page), shows the moment a rest starts, and goes on skip/cancel/end', async ({ page }) => {
  await boot(page);
  // No session: no clock.
  expect((await clockState(page)).hidden).toBe(true);

  await startSession(page);
  // Raed: «أبغاه يختفي إذا ما فيه عداد». A session with no rest has no clock —
  // not an elapsed face, nothing — on any page.
  const idle = await clockState(page);
  expect(idle.hidden, 'mid-session with no rest the clock must be hidden').toBe(true);
  for (const route of ['coach', 'library', 'history', 'settings', 'home']) {
    await page.evaluate((r) => { window.location.hash = r; }, route);
    await page.waitForTimeout(400);
    expect((await clockState(page)).hidden, `no clock on #${route} without a rest`).toBe(true);
  }

  // The rest starts → the clock is there, on the countdown.
  await startRestByTicking(page);
  const home = await clockState(page);
  expect(home.resting).toBe(true);
  expect(home.hidden, 'the clock must show the moment a rest starts').toBe(false);
  expect(home.time).toMatch(/^\d{1,2}:\d{2}$/);
  // There is no second face to switch to.
  expect(home.face, 'no elapsed face exists any more').toBeNull();
  expect(home.rect.w).toBe(56);
  expect(home.rect.h).toBe(56);
  const tabTop = await page.evaluate(() => Math.round(document.querySelector('.tab-bar').getBoundingClientRect().top));
  expect(home.rect.bottom, 'the clock must sit above the tab bar').toBeLessThanOrEqual(tabTop);
  // Default anchor is the start edge — physical right in RTL.
  expect(home.side).toBe('right');
  expect(home.rect.right).toBe(390 - 12);
  // Resting, it follows him to every page.
  for (const route of ['coach', 'history', 'home']) {
    await page.evaluate((r) => { window.location.hash = r; }, route);
    await page.waitForTimeout(400);
    expect((await clockState(page)).hidden, `the countdown on #${route}`).toBe(false);
  }
  // Retired surfaces must not exist at all.
  expect(await page.locator('#rest-timer, [data-rest-inline], .rest-row').count()).toBe(0);

  // Skip from the pill → gone, not back to a session time.
  await page.locator('#session-clock .sc-disc').click();
  await page.waitForTimeout(200);
  await page.locator('[data-clock-skip]').click();
  await page.waitForTimeout(400);
  const skipped = await clockState(page);
  expect(skipped.resting).toBe(false);
  expect(skipped.hidden, 'skip must hide the clock').toBe(true);

  // Another rest on the one timer (the real tick path is proven above) →
  // back; cancelled from outside the clock → gone.
  await page.evaluate(async () => { (await import('/core/rest.js')).startRest(90); });
  await page.waitForTimeout(300);
  expect((await clockState(page)).hidden, 'the second rest shows the clock again').toBe(false);
  await page.evaluate(async () => { (await import('/core/rest.js')).cancelRest(); });
  await page.waitForTimeout(300);
  expect((await clockState(page)).hidden, 'cancel must hide the clock').toBe(true);

  // A rest that runs out on its own → gone the moment it hits 0:00.
  await page.evaluate(async () => { (await import('/core/rest.js')).startRest(90); });
  await page.waitForTimeout(300);
  expect((await clockState(page)).hidden).toBe(false);
  await shortenRest(page, 600);
  await page.waitForTimeout(1200);
  const ended = await clockState(page);
  expect(ended.resting).toBe(false);
  expect(ended.hidden, 'a rest that ends must take the clock with it').toBe(true);
});

test('a drag snaps to the nearer edge, is remembered across reload, and a tap opens the rest pill', async ({ page }) => {
  await boot(page);
  await startSession(page);
  await startRestByTicking(page);
  // Plenty of rest for a drag and a reload.
  await page.evaluate(async () => {
    const rest = await import('/core/rest.js');
    rest.extendRest(120);
  });
  const before = await clockState(page);
  expect(before.hidden).toBe(false);
  expect(before.side).toBe('right');

  // Drag 200px left and 250px up.
  const box = await page.locator('#session-clock .sc-disc').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2 - 250, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await clockState(page);
  expect(after.side, 'released left of centre → snaps to the left edge').toBe('left');
  expect(after.rect.left).toBe(12);
  expect(after.rect.top, 'and it kept the height he dropped it at').toBeLessThan(before.rect.top - 200);
  // A drag is not a tap: no pill.
  expect(await page.locator('#session-clock .sc-pill').isHidden()).toBe(true);

  const stored = await page.evaluate(() => Object.entries(localStorage).find(([k]) => /clockpos/.test(k))?.[1] || null);
  expect(stored).toBeTruthy();
  expect(JSON.parse(stored).side).toBe('left');

  // The rest resumes on reload, and the clock comes back where he left it.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await pickRaed(page);
  const resumed = await clockState(page);
  expect(resumed.hidden).toBe(false);
  expect(resumed.side).toBe('left');
  expect(Math.abs(resumed.rect.top - after.rect.top), 'the position survives a reload').toBeLessThanOrEqual(2);

  // Tap → the pill: the rest's own actions, and no session time anywhere.
  await page.locator('#session-clock .sc-disc').click();
  await page.waitForTimeout(200);
  const pill = page.locator('#session-clock .sc-pill');
  await expect(pill).toBeVisible();
  await expect(pill.locator('[data-clock-extend]')).toBeVisible();
  await expect(pill.locator('[data-clock-skip]')).toBeVisible();
  expect(await pill.locator('.sc-pill-time, .sc-pill-since').count(), 'no elapsed/started-at in the pill').toBe(0);
  // Tap again → closed.
  await page.locator('#session-clock .sc-disc').click();
  await page.waitForTimeout(200);
  await expect(pill).toBeHidden();
});

test('resting: the countdown, +30 s, and skip — all on the one timer', async ({ page }) => {
  await boot(page);
  await startSession(page);
  await startRestByTicking(page);
  const resting = await clockState(page);
  expect(resting.resting).toBe(true);
  expect(resting.hidden).toBe(false);
  expect(resting.time).toMatch(/^\d{1,2}:\d{2}$/);
  // The ring drains from --p on the surface itself.
  const p = await page.evaluate(() => parseFloat(document.getElementById('session-clock').style.getPropertyValue('--p')));
  expect(p).toBeGreaterThan(0.9);
  expect(p).toBeLessThanOrEqual(1);
  // The ring is always the accent countdown — never the hairline idle face.
  const fillOpacity = await page.evaluate(() => getComputedStyle(document.querySelector('#session-clock .sc-fill')).opacity);
  expect(fillOpacity).toBe('1');

  // +30 s moves the persisted deadline.
  const deadlineBefore = await page.evaluate(() => Number(localStorage.getItem(Object.keys(localStorage).find((k) => /restend/.test(k)))));
  await page.locator('#session-clock .sc-disc').click();
  await page.waitForTimeout(200);
  await page.locator('[data-clock-extend]').click();
  await page.waitForTimeout(200);
  const deadlineAfter = await page.evaluate(() => Number(localStorage.getItem(Object.keys(localStorage).find((k) => /restend/.test(k)))));
  expect(deadlineAfter - deadlineBefore).toBeGreaterThanOrEqual(29_000);
  expect(deadlineAfter - deadlineBefore).toBeLessThanOrEqual(31_000);

  // Skip cancels the one timer everywhere, and the clock goes with it.
  await page.locator('[data-clock-skip]').click();
  await page.waitForTimeout(400);
  const done = await clockState(page);
  expect(done.resting).toBe(false);
  expect(done.hidden).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).some((k) => /restend/.test(k)))).toBe(false);
  await expect(page.locator('#session-clock .sc-pill')).toBeHidden();
});

test('finishing hides the clock, even mid-rest', async ({ page }) => {
  await boot(page);
  await startSession(page);
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((x) => /\.state\./.test(x) && /raed/i.test(x));
    const profile = JSON.parse(localStorage[key]);
    Object.values(profile.active_session.exercises).forEach((entry) => {
      (entry.sets || []).forEach((s) => { if (s.is_warmup) { s.completed = true; return; } s.weight = 40; s.reps = 10; s.rpe = 8; s.completed = true; });
    });
    profile.active_session.phase = 'lifting';
    localStorage[key] = JSON.stringify(profile);
  });
  // A rest from the last set is still running when he finishes: start one on
  // the app's own timer so its deadline is persisted and resumes on reload.
  await page.evaluate(async () => {
    const rest = await import('/core/rest.js');
    rest.startRest(120);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await pickRaed(page);
  expect((await clockState(page)).hidden, 'the resumed rest shows the clock').toBe(false);
  await page.evaluate(() => document.querySelector('[data-finish-session]')?.click());
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.location.hash)).toBe('#end');
  expect((await clockState(page)).hidden).toBe(true);
});
