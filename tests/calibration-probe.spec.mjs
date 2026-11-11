import { expect, test } from './_fixtures.mjs';

// The ramp sets, after the effort rating was retired (2026-11-11).
//
// Until then two rules read a ramp set's FEEL:
//   - research/06 §6.3, the first-exposure load probe: a ramp set rated «سهل»
//     filled the working sets with round_to_step(ramp / terminal_ramp_pct);
//   - research/07 §2.7, the warm-up feel adjust: a last ramp rated light/heavy
//     moved every open working set ±7.5%, once.
// Raed: «remove it from the progression completely: easy, hard, medium». Both
// rules went with the rating, because each was keyed on it — there is no
// rating left to key on. This file used to certify those two rules; it now
// holds the invariants that survive them:
//   1. a ramp set is a warm-up and nothing else — ticking it asks no question
//      and moves no working set, on a first exposure or with history;
//   2. untick/re-tick fidgeting never walks the working load anywhere;
//   3. a weight he typed himself is never overwritten by anything a ramp does —
//      including a resumed session whose ramp still carries an old rating.
// What took the probe's place on a first exposure is the existing starter rule:
// the box stays blank behind «معايرة» and he types the load.

const APP = 'http://localhost:8877';

async function boot(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (r) => r.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
    if (t) t.click();
  });
  await page.waitForTimeout(900);
}

async function startSession(page) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
}

async function intoFreshSession(page) {
  await boot(page);
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    parsed.history = []; parsed.active_session = null; parsed.prs = {};
    localStorage[key] = JSON.stringify(parsed);
  });
  await startSession(page);
}

// History on every exercise in the rotation — old logs WITH ratings on them —
// so the working sets arrive carrying a load.
async function intoSessionWithHistory(page, topWeight = 40) {
  await boot(page);
  await page.evaluate((w) => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    const exercises = {};
    for (const ex of window.RW.EXERCISES) {
      exercises[ex.id] = { sets: [
        { is_warmup: true, weight: Math.round(w / 2), reps: 10, completed: true, effort: 'very_hard' },
        { is_warmup: false, weight: w, reps: 10, completed: true, effort: 'easy' },
      ] };
    }
    parsed.history = ['upper_a', 'lower_a', 'upper_b', 'lower_b'].map((id, i) => ({
      date: '2026-08-20', session_id: id, started_at: '2026-08-20T09:00:00Z', ended_at: '2026-08-20T10:00:00Z',
      uid: `h${i}`, prs: [], stats: {}, exercises,
    }));
    parsed.active_session = null;
    localStorage[key] = JSON.stringify(parsed);
  }, topWeight);
  await startSession(page);
}

const activeSession = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  return JSON.parse(localStorage[key]).active_session;
});
const workingOf = (entry) => entry.sets.filter((s) => !s.is_warmup).map((s) => s.weight);
const NO_RATING_CONTROL = '.effort-strip, .effort-picker, [data-ramp-effort]';

test('first exposure: a ramp set he logs and ticks derives no working load and asks nothing', async ({ page }) => {
  await intoFreshSession(page);
  const before = await activeSession(page);
  const id = Object.keys(before.exercises)[0];
  const ramps = before.exercises[id].sets.filter((s) => s.is_warmup).length;
  expect(ramps, 'this exercise must prescribe a ramp, or this proves nothing').toBeGreaterThan(0);
  expect(workingOf(before.exercises[id]).every((w) => w === ''), 'no history → blank, not a made-up load').toBe(true);

  // He starts at the floor, logs 20 × 10 — the exact input the probe used to
  // turn into 20 / pct — and ticks every ramp row.
  await page.evaluate(() => {
    const inputs = [...document.querySelector('.set-grid').querySelectorAll('input')];
    inputs[0].value = '20'; inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    inputs[1].value = '10'; inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const checks = page.locator('.set-grid .set-check');
  for (let i = 0; i < ramps; i += 1) {
    await checks.nth(i).click();
    await page.waitForTimeout(250);
    await expect(page.locator(NO_RATING_CONTROL), 'no rating is asked after a ramp set').toHaveCount(0);
  }

  const state = (await activeSession(page)).exercises[id];
  expect(workingOf(state).every((w) => w === ''), 'the working sets stay his to fill').toBe(true);
  expect(state.calibrated_from).toBeFalsy();
  await expect(page.locator('[data-set-kind="working"] [data-runner-weight-input]').first()).toHaveAttribute('placeholder', 'معايرة');
});

test('with history: ticking every ramp set never moves a working set', async ({ page }) => {
  await intoSessionWithHistory(page);
  const before = await activeSession(page);
  const id = Object.keys(before.exercises)[0];
  const workingBefore = workingOf(before.exercises[id]);
  expect(Number(workingBefore[0]), 'the exercise must arrive with a load').toBeGreaterThan(0);
  const ramps = before.exercises[id].sets.filter((s) => s.is_warmup).length;
  const checks = page.locator('.set-grid .set-check');
  for (let i = 0; i < ramps; i += 1) {
    await checks.nth(i).click();
    await page.waitForTimeout(250);
  }
  await expect(page.locator(NO_RATING_CONTROL)).toHaveCount(0);
  const state = (await activeSession(page)).exercises[id];
  expect(workingOf(state), 'a heavy- or light-feeling ramp no longer changes the load').toEqual(workingBefore);
  expect(state.warmup_feel_applied).toBeFalsy();
});

test('fidgeting with a ramp checkbox never walks the working load anywhere', async ({ page }) => {
  await intoSessionWithHistory(page);
  const before = await activeSession(page);
  const id = Object.keys(before.exercises)[0];
  const workingBefore = workingOf(before.exercises[id]);
  const ramps = before.exercises[id].sets.filter((s) => s.is_warmup).length;
  test.skip(ramps < 1, 'needs a ramp set');
  const checks = page.locator('.set-grid .set-check');
  for (let round = 0; round < 3; round += 1) {
    await checks.nth(ramps - 1).click();
    await page.waitForTimeout(250);
  }
  expect(workingOf((await activeSession(page)).exercises[id])).toEqual(workingBefore);
});

test('a weight he typed himself survives a resumed session whose ramp still carries an old rating', async ({ page }) => {
  await intoFreshSession(page);
  const before = await activeSession(page);
  const id = Object.keys(before.exercises)[0];
  const ramps = before.exercises[id].sets.filter((s) => s.is_warmup).length;
  test.skip(ramps < 2, 'needs an exercise with two ramp sets to re-tick the second');

  // Seeded, not tapped: a session restored from sync after the update, written
  // by the old build — a ramp rated «سهل», his own 55 kg on the working sets.
  await page.evaluate(({ exId, n }) => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    const sets = parsed.active_session.exercises[exId].sets;
    sets[0].weight = 20; sets[0].reps = 10; sets[0].effort = 'easy'; sets[0].completed = true;
    for (const set of sets) if (!set.is_warmup) set.weight = 55;
    sets[n - 1].completed = false;
    localStorage[key] = JSON.stringify(parsed);
  }, { exId: id, n: ramps });
  // domcontentloaded: an active session keeps retrying the blocked sync host.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.locator('.set-grid .set-check').nth(ramps - 1).click();
  await page.waitForTimeout(700);
  const state = (await activeSession(page)).exercises[id];
  expect(workingOf(state).map(Number), 'his 55 kg must survive').toEqual(workingOf(state).map(() => 55));
  expect(state.calibrated_from).toBeFalsy();
  await expect(page.locator(NO_RATING_CONTROL)).toHaveCount(0);
});
