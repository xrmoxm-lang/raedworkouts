import { expect, test } from '@playwright/test';

// research/06 §6.3 — the first exposure to a movement, with no history behind
// it. Step 1 of the source algorithm is titled «Ask nothing. Start at the
// floor»; the app was doing the opposite, printing «لا سجلّ بعد — اختر وزنًا
// تتحكّم فيه» and handing the whole question back on exactly the exercises he
// is least able to answer. One week into the programme, that is most of them.
//
//   terminal_ramp_pct = 0.60 (1 ramp) | 0.70 (2) | 0.85 (>=3)
//   first_working_weight = round_to_step(weight_at_RPE_4to5 / terminal_ramp_pct)

const APP = 'http://localhost:8877';

async function intoFreshSession(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (r) => r.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
    if (t) t.click();
  });
  await page.waitForTimeout(900);
  // No history at all: every exercise is a first exposure.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    parsed.history = []; parsed.active_session = null; parsed.prs = {};
    localStorage[key] = JSON.stringify(parsed);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
}

const activeSession = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  return JSON.parse(localStorage[key]).active_session;
});

test('a ramp set that comes back easy sets the working load, by the source table', async ({ page }) => {
  await intoFreshSession(page);

  // A first exposure leaves the ramp rows blank — the app does not know what the
  // lightest pin on his machine weighs, and inventing one would be a fabricated
  // number. The picker is there because §6.3 step 2 says «Log the RPE».
  await expect(page.locator('[data-ramp-effort]').first()).toBeVisible();

  const before = await activeSession(page);
  const firstId = Object.keys(before.exercises)[0];
  const rampCount = before.exercises[firstId].sets.filter((s) => s.is_warmup).length;
  expect(rampCount, 'this exercise must prescribe a ramp for the probe to apply').toBeGreaterThan(0);
  // Nothing prescribed on the working sets yet.
  expect(before.exercises[firstId].sets.filter((s) => !s.is_warmup).every((s) => !s.weight)).toBe(true);

  // He starts at the floor, logs it, and it comes back easy.
  await page.evaluate(() => {
    const row = document.querySelector('.set-grid');
    const inputs = [...row.querySelectorAll('input')];
    inputs[0].value = '20'; inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    inputs[1].value = '10'; inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  await page.locator('.set-grid .set-check').first().click();
  await page.waitForTimeout(300);
  await page.locator('[data-ramp-effort] button').first().click();   // «سهل»
  await page.waitForTimeout(700);

  const after = await activeSession(page);
  const state = after.exercises[firstId];
  const pct = rampCount === 1 ? 0.60 : rampCount === 2 ? 0.70 : 0.85;
  const derived = state.sets.filter((s) => !s.is_warmup)[0].weight;
  expect(derived, 'the working sets must be filled from the probe').toBeGreaterThan(0);

  // The number is 20 / pct, rounded to the equipment step — not a guess, and not
  // simply the ramp weight copied down.
  const expected = 20 / pct;
  expect(Math.abs(Number(derived) - expected), `20 / ${pct} = ${expected}, got ${derived}`).toBeLessThanOrEqual(5);
  expect(Number(derived)).toBeGreaterThan(20);
  expect(state.calibrated_from.pct).toBe(pct);
  expect(state.calibrated_from.weight).toBe(20);

  // Every working set gets it, not only the first.
  for (const set of state.sets.filter((s) => !s.is_warmup)) expect(set.weight).toBe(derived);
});

test('a ramp that is not easy derives nothing', async ({ page }) => {
  await intoFreshSession(page);
  const before = await activeSession(page);
  const firstId = Object.keys(before.exercises)[0];

  await page.evaluate(() => {
    const row = document.querySelector('.set-grid');
    const inputs = [...row.querySelectorAll('input')];
    inputs[0].value = '20'; inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    inputs[1].value = '10'; inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  await page.locator('.set-grid .set-check').first().click();
  await page.waitForTimeout(300);
  // «صعب» — the third face. RPE 4–5 is what the source keys on, and this is not it.
  await page.locator('[data-ramp-effort] button').nth(2).click();
  await page.waitForTimeout(700);

  const after = await activeSession(page);
  const state = after.exercises[firstId];
  expect(state.calibrated_from, 'a hard ramp set is not the probe').toBeFalsy();
  expect(state.sets.filter((s) => !s.is_warmup).every((s) => !s.weight)).toBe(true);
});

test('a weight he typed himself is never overwritten by the probe', async ({ page }) => {
  await intoFreshSession(page);
  const before = await activeSession(page);
  const firstId = Object.keys(before.exercises)[0];
  const rampCount = before.exercises[firstId].sets.filter((s) => s.is_warmup).length;
  test.skip(rampCount < 2, 'needs an exercise with two ramp sets to re-tick the second');

  // The state this guards is one he arrives at by RESUMING, not by tapping: a
  // session restored from sync or reopened after the app was closed, carrying a
  // working weight he typed AND a ramp set already rated. There is no effort
  // picker on the ramp rows in that state — the app stops offering to calibrate
  // once a working load exists — so the tap alone can never reach it, and the
  // guard inside applyCalibrationProbe is what actually holds. Seeding the
  // session is the only honest way to stand in it.
  await page.evaluate(({ id, n }) => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    const sets = parsed.active_session.exercises[id].sets;
    sets[0].weight = 20; sets[0].reps = 10; sets[0].effort = 'easy'; sets[0].completed = true;
    for (const set of sets) if (!set.is_warmup) set.weight = 55;   // his own number
    sets[n - 1].completed = false;                                  // a ramp left to tick
    localStorage[key] = JSON.stringify(parsed);
  }, { id: firstId, n: rampCount });
  // domcontentloaded, not networkidle: an active session keeps retrying the
  // blocked sync host, so the network never goes quiet and the reload times out.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  // Ticking the remaining ramp set runs the probe again. It must decline.
  const checks = page.locator('.set-grid .set-check');
  await checks.nth(rampCount - 1).click();
  await page.waitForTimeout(700);

  const after = await activeSession(page);
  const state = after.exercises[firstId];
  expect(Number(state.sets.filter((s) => !s.is_warmup)[0].weight), 'his 55 kg must survive').toBe(55);
  expect(state.calibrated_from, 'nothing was calibrated — he had already decided').toBeFalsy();
});
