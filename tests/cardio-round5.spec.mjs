// Round 5 on the cool-down, driven in the browser at 390×844.
//
// Three things this file proves, each of which passed every unit test the day
// it shipped and was still wrong on screen:
//   1. «طبّقه» applies a PRESCRIPTION. It used to apply the previous bout's
//      whole record — completed_at included — so one tap archived a cool-down
//      he never did, stamped with last session's clock.
//   2. A box he empties is not a zero: the totals refuse, and the log button
//      refuses with them.
//   3. The treadmill unit in Settings converts the belt instead of relabelling
//      it (Raed 2026-09-23: the unit is mph).
import { expect, test } from './_fixtures.mjs';

test.use({ viewport: { width: 390, height: 844 } });

// His last completed bout, as it sits in history: 15 min, 5.1 mph base at 2.5%,
// four 30-second bursts at 7.3 — and the timestamps that made the bug critical.
const LAST_BOUT = {
  planned_minutes: 15,
  unit: 'mph',
  base_speed: 5.1,
  incline: 2.5,
  burst_count: 4,
  burst_seconds: 30,
  burst_speed: 7.3,
  started_at: '2026-09-20T18:00:00.000Z',
  completed_at: '2026-09-20T18:20:00.000Z',
  skipped: false,
};

// Same road as tests/cardio.spec.mjs: start the session for real, then seed the
// working sets in storage and reload. Tapping twelve passes over the cards never
// resolves a session — a state he ARRIVES at is seeded, not tapped.
async function driveToDone(page, { seedLastBout = null } = {}) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // The second fence the suite requires, on top of the fixture's context route:
  // the sync port is where state is written, and a probe once put a phantom
  // session into Raed's live cloud row.
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto('http://localhost:8877', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
    if (t) t.click();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);

  const filled = await page.evaluate((bout) => {
    const key = Object.keys(localStorage).find((x) => /\.state\./.test(x) && /raed/i.test(x));
    const profile = JSON.parse(localStorage[key]);
    const active = profile.active_session;
    if (!active) return 0;
    let n = 0;
    for (const entry of Object.values(active.exercises || {})) {
      for (const set of entry.sets || []) {
        if (set.is_warmup) { set.completed = true; continue; }
        set.weight = 20; set.reps = 10; set.rpe = 8;
        set.completed = true; set.skipped = false; set.invalid = null;
        n += 1;
      }
    }
    active.phase = 'lifting';
    // The bout the suggestion will be built from.
    if (bout && profile.history?.length) profile.history[profile.history.length - 1].cardio = bout;
    localStorage[key] = JSON.stringify(profile);
    return n;
  }, seedLastBout);
  if (!filled) throw new Error('no active session to fill — the runner never started');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
    if (t) t.click();
  });
  await page.waitForTimeout(1100);
  return errs;
}

const liveCardio = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((x) => /\.state\./.test(x) && /raed/i.test(x));
  return JSON.parse(localStorage[key]).active_session?.cardio || null;
});

test('applying today\'s suggestion changes the plan and never logs the bout', async ({ page }) => {
  const errs = await driveToDone(page, { seedLastBout: LAST_BOUT });

  const before = await page.evaluate(() => ({
    form: Boolean(document.querySelector('[data-cardio-log]')),
    logged: Boolean(document.querySelector('[data-cardio-logged]')),
    suggestion: document.querySelector('[data-cardio-suggestion]')?.textContent?.trim() || '',
    // «نقطة جهد» is a unit this app coined. Defined once, in the intro.
    effortDef: document.querySelector('[data-cardio-effort-def]')?.textContent || '',
  }));
  expect(before.effortDef, `intro read «${before.effortDef}»`).toContain('MET');
  expect(before.effortDef, 'the definition must say what the score is made of').toMatch(/الشدة.*الدقائق/);
  expect(before.form, 'the live form must be on screen before the tap').toBe(true);
  expect(before.logged).toBe(false);
  // With a completed 15-minute bout behind him the one change is the duration.
  expect(before.suggestion, `suggestion read «${before.suggestion}»`).toMatch(/20/);

  await page.evaluate(() => document.querySelector('[data-cardio-apply]')?.click());
  await page.waitForTimeout(700);

  const after = await page.evaluate(() => ({
    form: Boolean(document.querySelector('[data-cardio-log]')),
    logged: Boolean(document.querySelector('[data-cardio-logged]')),
  }));
  // The whole finding in one line: the form is still a form.
  expect(after.form, 'the cool-down must still be loggable after applying a suggestion').toBe(true);
  expect(after.logged, 'applying a suggestion must not close the block into its logged state').toBe(false);

  const cardio = await liveCardio(page);
  expect(cardio.completed_at, 'today\'s bout must not inherit the previous bout\'s completion').toBeNull();
  expect(cardio.started_at, 'nor its start').toBeNull();
  expect(cardio.skipped).toBe(false);
  expect(Number(cardio.planned_minutes), 'and the change it promised must be applied').toBe(20);
  expect(errs).toEqual([]);
});

test('a cleared box stops the totals and disables the log', async ({ page }) => {
  const errs = await driveToDone(page);

  const blank = await page.evaluate(async () => {
    const el = document.querySelector('[data-cardio-field="base_speed"]');
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    return {
      warned: Boolean(document.querySelector('[data-cardio-incomplete]')),
      total: document.querySelector('.cardio-total-main')?.textContent || null,
      disabled: document.querySelector('[data-cardio-log]').disabled,
      // An empty speed has no pace either — Number('') is 0, which is a walk.
      paceShown: !document.querySelector('[data-cardio-pace]').hidden,
    };
  });
  // A blank speed used to be read as 0 and priced as standing still: 3.5 METs
  // for fifteen minutes, a total for a bout that does not exist.
  expect(blank.warned, 'an empty speed must be named, not computed around').toBe(true);
  expect(blank.total, 'no total may be printed from a number he never gave').toBeNull();
  expect(blank.disabled, 'and it must not be loggable').toBe(true);
  expect(blank.paceShown, 'a blank speed must not be labelled a walk').toBe(false);

  const refilled = await page.evaluate(async () => {
    const el = document.querySelector('[data-cardio-field="base_speed"]');
    el.value = '5.1';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    return {
      warned: Boolean(document.querySelector('[data-cardio-incomplete]')),
      total: Number(document.querySelector('.cardio-total-main')?.textContent),
      disabled: document.querySelector('[data-cardio-log]').disabled,
    };
  });
  expect(refilled.warned).toBe(false);
  // 13 min jogged at 9.7 METs plus 2 min at 13.4 — the mph bout, in full.
  expect(refilled.total).toBe(153);
  expect(refilled.disabled).toBe(false);
  expect(errs).toEqual([]);
});

test('the treadmill unit is a control, and switching it converts the belt', async ({ page }) => {
  const errs = await driveToDone(page);

  // Default is mph and the block is labelled in it.
  const start = await page.evaluate(() => ({
    speed: document.querySelector('[data-cardio-field="base_speed"]').value,
    label: document.querySelector('[data-cardio-field="base_speed"]').closest('.cardio-field').textContent,
    pace: document.querySelector('[data-cardio-pace]')?.dataset.cardioPace,
  }));
  expect(Number(start.speed)).toBe(5.1);
  expect(start.label, `the unit must ride in the label — read «${start.label}»`).toContain('ميل');
  // 5.1 mph is 137 m/min. That is a jog, and the block has to say so instead of
  // scoring it with the walking equation's Zone 2 band.
  expect(start.pace, 'his base is jogged, not walked').toBe('run');

  await page.evaluate(() => { window.location.hash = 'settings'; });
  await page.waitForTimeout(800);
  const control = await page.evaluate(() => Boolean(document.querySelector('[data-speed-unit-option="kmh"]')));
  expect(control, 'the setting that drives every prescription must have a control').toBe(true);
  await page.evaluate(() => document.querySelector('[data-speed-unit-option="kmh"]').click());
  await page.waitForTimeout(700);

  const switched = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((x) => /\.settings\./.test(x) && /raed/i.test(x));
    return {
      setting: JSON.parse(localStorage[key]).speed_unit,
      toast: document.querySelector('#toast')?.textContent || '',
    };
  });
  expect(switched.setting).toBe('kmh');
  // Saying it out loud is the point: the numbers on his screen moved.
  expect(switched.toast, `toast read «${switched.toast}»`).toMatch(/حُوِّلت|حوّلت/);

  await page.evaluate(() => { window.location.hash = 'home'; });
  await page.waitForTimeout(900);
  const converted = await page.evaluate(() => ({
    speed: Number(document.querySelector('[data-cardio-field="base_speed"]').value),
    burst: Number(document.querySelector('[data-cardio-field="burst_speed"]').value),
    label: document.querySelector('[data-cardio-field="base_speed"]').closest('.cardio-field').textContent,
    total: Number(document.querySelector('.cardio-total-main')?.textContent),
    pace: document.querySelector('[data-cardio-pace]')?.dataset.cardioPace,
  }));
  // The same belt, read off a machine set the other way — 5.1 mph IS 8.2 km/h.
  expect(converted.speed).toBe(8.2);
  expect(converted.burst).toBe(11.7);
  expect(converted.label).toContain('كم');
  // And therefore the same workout: the effort score does not move with the unit.
  expect(converted.total, 'switching the unit must change the numerals, not the work').toBe(153);
  expect(converted.pace).toBe('run');
  expect(errs).toEqual([]);
});
