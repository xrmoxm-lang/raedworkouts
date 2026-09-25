// The lifting's last tick starts no rest.
//
// Raed 2026-09-23, in Fable's review of the round-5 rest work: after the last
// working set of the LAST exercise the fixed dock sat on the cool-down form —
// a two-minute countdown for a set that does not exist, covering the totals and
// the log button of the block that actually comes next. A rest is for the set
// that follows it; when nothing follows, there is no rest.
import { expect, test } from './_fixtures.mjs';

test.use({ viewport: { width: 390, height: 844 } });

test('resolving the last exercise starts no rest and clears a running one', async ({ page }) => {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto('http://localhost:8877', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent)); if (t) t.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(700);
  // Everything logged except the last working set of the last exercise — the
  // state he arrives at, seeded rather than tapped (see tests/cardio.spec.mjs).
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((x) => /\.state\./.test(x) && /raed/i.test(x));
    const profile = JSON.parse(localStorage[key]);
    const active = profile.active_session;
    const entries = Object.values(active.exercises);
    entries.forEach((entry, i) => {
      const working = (entry.sets || []).filter((s) => !s.is_warmup);
      (entry.sets || []).forEach((s) => {
        if (s.is_warmup) { s.completed = true; return; }
        s.weight = 20; s.reps = 10; s.rpe = 8; s.skipped = false; s.invalid = null;
        s.completed = !(i === entries.length - 1 && s === working[working.length - 1]);
      });
    });
    active.phase = 'lifting';
    localStorage[key] = JSON.stringify(profile);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => { const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent)); if (t) t.click(); });
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => Boolean(document.querySelector('#page-home .ex.expanded')))).toBe(true);

  // A rest from the set before is still running when he ticks the last one.
  await page.evaluate(() => { document.body.classList.add('resting'); });
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#page-home .ex.expanded .set-grid')].filter((r) => !r.classList.contains('warm') && !r.classList.contains('done'));
    const row = rows[rows.length - 1];
    const strip = row.nextElementSibling;
    if (strip?.classList?.contains('effort-strip')) strip.querySelector('button')?.click();
    row.querySelector('.set-check')?.click();
  });
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => {
    const clock = document.getElementById('session-clock');
    return {
      done: Boolean(document.querySelector('[data-session-done]')),
      resting: document.body.classList.contains('resting'),
      // Round 6: the floating clock is the one surface, and (Raed 2026-09-25)
      // it exists only while a rest counts down — after the last tick it must
      // be gone, not counting a rest that does not exist.
      clockShown: Boolean(clock) && !clock.hidden,
      restKey: Object.keys(localStorage).some((k) => /restend/.test(k)),
    };
  });
  expect(after.done, 'the tick must resolve the session').toBe(true);
  expect(after.resting, 'no rest may run once the lifting is over').toBe(false);
  expect(after.clockShown, 'the clock must not count a rest over the cool-down').toBe(false);
  expect(after.restKey, 'a persisted deadline would resurrect the rest on reload').toBe(false);
});
