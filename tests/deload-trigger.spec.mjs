import { expect, test } from '@playwright/test';

// research/06 §7.2 rules: «[LADDER] wins. No scheduled deload in the first
// block. Deload on trigger, with a week-12 backstop.» Only the backstop was
// built. The rule itself is unit-tested in deload-trigger.test.mjs; this file
// checks the three things only a browser can: that he is asked, that answering
// books the week, and that the booked week actually trains lighter.

const APP = 'http://localhost:8877';

async function boot(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (r) => r.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(900);
}

async function patchState(page, patch) {
  await page.evaluate((p) => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    localStorage[key] = JSON.stringify({ ...JSON.parse(localStorage[key]), ...p });
  }, patch);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
}

// «أنهِ الجلسة» is rendered on the LAST exercise only — Raed asked for it in one
// place — so finishing means walking the whole session first.
async function finishSession(page) {
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
  // Sets have to be logged, not just walked past: endSession() DISCARDS a
  // session in which nothing was resolved, so an empty walk-through reaches the
  // home screen with history untouched and no end screen at all. That is what
  // the first version of this helper did, and the test failed claiming the
  // check-in was missing from a screen that had never rendered.
  await page.evaluate(async () => {
    for (let i = 0; i < 12; i += 1) {
      for (const row of document.querySelectorAll('.set-grid')) {
        const inputs = [...row.querySelectorAll('input')];
        if (inputs.length >= 2) {
          inputs[0].value = '20'; inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          inputs[1].value = '10'; inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        }
        row.parentElement?.querySelector('.effort-strip button')?.click();
        row.querySelector('.set-check')?.click();
        await new Promise((r) => setTimeout(r, 60));
      }
      const next = [...document.querySelectorAll('.runner-nav .btn.primary')]
        .find((b) => !/أنهِ|إنهاء/.test(b.textContent));
      if (!next) break;
      next.click();
      await new Promise((r) => setTimeout(r, 320));
    }
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /أنهِ الجلسة|إنهاء/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const y = [...document.querySelectorAll('#modal button')].find((b) => /أنهِ|إنهاء|نعم|احفظ/.test(b.textContent));
    if (y) y.click();
  });
  await page.waitForTimeout(1400);
}

// The week he is standing in, read AFTER any history patch. Computing it before
// one is how the first version of this file booked the deload for the wrong week
// and then asserted the badge was missing.
const currentWeekId = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  const done = (JSON.parse(localStorage[key]).history || []).length;
  const weeks = Math.floor(done / 4);
  return `${1 + Math.floor(weeks / 12)}:${1 + (weeks % 12)}`;
});

const readState = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  return JSON.parse(localStorage[key]);
});

// A day he trained, so §7.1's precondition holds: «if you're not actually
// training hard yet, you don't need a deload at all» ([LADDER] L9791).
function trainedToday() {
  const iso = new Date().toLocaleDateString('en-CA');
  return [{
    date: iso, session_id: 'upper_a', started_at: `${iso}T09:00:00Z`, ended_at: `${iso}T10:00:00Z`,
    uid: 'seed-1', prs: [], stats: {},
    exercises: { chest_press_machine: { sets: [{ is_warmup: false, weight: 40, reps: 10, completed: true }] } },
  }];
}

test('he is asked once a week, after a session, and two signs book the deload', async ({ page }) => {
  await boot(page);
  await patchState(page, {
    history: trainedToday(), active_session: null, wellbeing_checks: [], triggered_deload: null,
  });

  await finishSession(page);

  const check = page.locator('[data-wellbeing-check]');
  await expect(check, 'the weekly check belongs on the end screen').toHaveCount(1);
  // Five chips: the sixth sign is detected, never asked.
  await expect(page.locator('[data-wellbeing-sign]')).toHaveCount(5);
  // Nothing selected yet, so there is nothing to save.
  await expect(page.locator('[data-wellbeing-save]')).toBeDisabled();

  await page.locator('[data-wellbeing-sign="poor_sleep"]').click();
  await page.locator('[data-wellbeing-sign="no_motivation"]').click();
  await page.locator('[data-wellbeing-save]').click();
  await page.waitForTimeout(500);

  await expect(page.locator('[data-wellbeing-done]')).toContainText('تخفيف');
  const state = await readState(page);
  expect(state.triggered_deload, 'two signs must book a deload').not.toBe(null);
  expect(state.triggered_deload.signs.sort()).toEqual(['no_motivation', 'poor_sleep']);
  // Booked for a LATER week, never the one he just reported on.
  expect(state.wellbeing_checks).toHaveLength(1);
  expect(state.triggered_deload.week_id).not.toBe(state.wellbeing_checks[0].week_id);
});

test('the booked week trains lighter, and says so', async ({ page }) => {
  await boot(page);
  await patchState(page, {
    history: trainedToday(), active_session: null, wellbeing_checks: [], triggered_deload: null,
  });
  // Book it for the week he is standing in — read after the history patch, since
  // the history is what defines which week that is.
  const now = await currentWeekId(page);
  await patchState(page, {
    triggered_deload: { week_id: now, signs: ['poor_sleep', 'no_motivation'], at: new Date().toISOString() },
  });

  // Home says it. A week of fewer sets with no explanation reads as the app
  // losing his programme — [LADDER] L9844 warns about the opposite too, that an
  // unexplained deload gets sandbagged.
  await expect(page.locator('[data-deload-running]')).toHaveCount(1);

  const planned = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#page-home .ex.plan-row .meta, #page-home .ex.plan-row')];
    return rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
  });
  // The deload block cuts one working set per exercise: nothing on the plan is
  // prescribed at 3 sets while it is running.
  expect(planned, 'a deload week must not prescribe 3 working sets').not.toMatch(/3 ×/);

  // And it does NOT advance the programme clock — the week and cycle he sees are
  // still his own, not the deload block's week 12.
  await expect(page.locator('.tb-clock')).not.toContainText('12');
});

test('the question does not come back once it is answered', async ({ page }) => {
  await boot(page);
  await patchState(page, { history: trainedToday(), active_session: null, triggered_deload: null, wellbeing_checks: [] });
  const weekId = await currentWeekId(page);
  // «كله تمام» already recorded for this week.
  await patchState(page, { wellbeing_checks: [{ week_id: weekId, signs: [], at: new Date().toISOString() }] });

  await finishSession(page);
  await expect(page.locator('[data-wellbeing-check]')).toHaveCount(0);
});
