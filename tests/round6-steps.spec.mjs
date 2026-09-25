import { expect, test } from './_fixtures.mjs';

// Round 6 §D.2–D.4 in the browser: the ⚙️ «درجة الجهاز» chips drive the next
// suggestion, the goal line states the load and the step, and a typed «12.5»
// survives everything around it. Unit coverage: tests/round6-steps.test.mjs.
async function blockLiveSync(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
}

const appUrl = 'http://127.0.0.1:8899/index.html';
const user = 'dev';

// Two COMPLETE exposures at the top of chest_press_machine's 8-10 range at
// 20 kg: the two-session bump is earned. Same weight both times, so nothing
// can be LEARNED from gaps — the step comes from data.js or from him.
function earnedSession(dateISO) {
  return {
    date: dateISO, session_id: 'upper_a', session_name: 'Upper A', duration_min: 60,
    exercises: { chest_press_machine: {
      device: 'Matrix Ultra',
      planned: { sets: 3 },
      sets: [0, 1, 2].map(() => ({ is_warmup: false, weight: 20, reps: 10, completed: true })),
    } },
  };
}

async function boot(page) {
  // Seeds ONCE per tab (sessionStorage marker), so a reload keeps what the
  // test wrote instead of re-seeding over it.
  await page.addInitScript(({ u, hist }) => {
    if (sessionStorage.getItem('round6-seeded')) return;
    sessionStorage.setItem('round6-seeded', '1');
    localStorage.clear();
    localStorage.setItem('raedworkouts.active_user', u);
    localStorage.setItem(`raedworkouts.${u}.settings.v1`, JSON.stringify({ user_id: u, theme: 'light', skin: 'waraq', lang: 'ar', locale_version: 1 }));
    localStorage.setItem(`raedworkouts.${u}.state.v1`, JSON.stringify({
      schema_version: 2, programme_reference_migration_version: 1,
      profile: { display_name: 'Raed', experience: 'returning', created_at: '2026-08-01T00:00:00.000Z' },
      active_session: null, history: hist, bodyweight_log: [],
      custom_videos: {}, custom_jn_urls: {}, video_hidden: {}, custom_exercises: [],
      programme_overrides: null, prs: {}, msg_index: 0, substitutions: [],
      forced_next_session: 'upper_a',
      exercise_prefs: { chest_press_machine: { equipment: '', device: 'Matrix Ultra', known_devices: ['Matrix Ultra'] } },
    }));
  }, { u: user, hist: [earnedSession('2026-09-15T09:00:00.000Z'), earnedSession('2026-09-18T09:00:00.000Z')] });
  await blockLiveSync(page);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
}

test.use({ viewport: { width: 390, height: 844 } });

const card = '#ex-chest_press_machine';
const firstWeight = `${card} [data-set-kind="working"] [data-runner-weight-input]`;

async function openSheet(page) {
  await page.locator(`${card} [data-exercise-settings]`).first().click();
  await expect(page.locator('#modal-overlay.show')).toHaveCount(1);
}

test('setting the machine step to 5 in ⚙️ moves the next suggestion by 5', async ({ page }) => {
  await boot(page);
  const weight = page.locator(firstWeight).first();
  // data.js: a Matrix stack is the kg-labelled ladder 5 · 9 · 14 · 18 · 23 ·
  // 27 (n × 4.5359 rounded). 20 is off it → the next label, 23; the goal names
  // the label after that: 27, +4.
  await expect(weight).toHaveAttribute('placeholder', '23');
  const goal = page.locator(`${card} [data-reps-goal]`).first();
  await expect(goal).toContainText('27');
  await expect(goal.locator('[data-step-delta]')).toHaveText('(+4)');

  await openSheet(page);
  await expect(page.locator('#modal [data-equipment-step-now]')).toContainText('سلّم ماتريكس');
  await page.locator('#modal [data-equipment-step-chip="5"]').click();
  await expect(page.locator('#modal [data-equipment-step-chip="5"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#modal [data-equipment-step-now]')).toContainText('5');
  // Stored per MACHINE, because a device is named.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('raedworkouts.dev.state.v1')).exercise_prefs.chest_press_machine);
  expect(stored.steps).toEqual({ 'Matrix Ultra': 5 });
  await page.evaluate(() => document.querySelector('#modal-overlay').classList.remove('show'));

  await expect(weight, '20 + his 5 kg step').toHaveAttribute('placeholder', '25');
  await expect(goal).toContainText('30');
  await expect(goal.locator('[data-step-delta]')).toHaveText('(+5)');

  // Tapping the active chip clears it: back to the Matrix default.
  await openSheet(page);
  await page.locator('#modal [data-equipment-step-chip="5"]').click();
  await page.evaluate(() => document.querySelector('#modal-overlay').classList.remove('show'));
  await expect(weight).toHaveAttribute('placeholder', '23');

  // «سلّم ماتريكس» stores the ladder itself, not a number.
  await openSheet(page);
  const ladder = page.locator('#modal [data-equipment-step-chip="matrix"]');
  await expect(ladder).toHaveText('سلّم ماتريكس');
  await ladder.click();
  await expect(page.locator('#modal [data-equipment-step-chip="matrix"]')).toHaveAttribute('aria-pressed', 'true');
  const ladderStored = await page.evaluate(() => JSON.parse(localStorage.getItem('raedworkouts.dev.state.v1')).exercise_prefs.chest_press_machine);
  expect(ladderStored.steps).toEqual({ 'Matrix Ultra': 'matrix' });
  await page.evaluate(() => document.querySelector('#modal-overlay').classList.remove('show'));
  await expect(weight).toHaveAttribute('placeholder', '23');
});

test('a typed 12.5 survives a step change, the tick, and a reload', async ({ page }) => {
  await boot(page);
  const weight = page.locator(firstWeight).first();
  await weight.fill('12.5');
  await weight.blur();
  // The step control re-renders the card; the load he typed is not a
  // suggestion and must not be rounded onto the new grid.
  await openSheet(page);
  await page.locator('#modal [data-equipment-step-chip="5"]').click();
  await page.evaluate(() => document.querySelector('#modal-overlay').classList.remove('show'));
  await expect(weight).toHaveValue('12.5');

  // The ramp comes first («finish_ramp_first»); tick both ramp rows.
  for (let i = 0; i < await page.locator(`${card} [data-set-kind="warmup"] .set-check`).count(); i += 1) {
    await page.locator(`${card} [data-set-kind="warmup"] .set-check`).nth(i).click();
    await page.waitForTimeout(150);
  }
  const row = page.locator(`${card} [data-set-kind="working"]`).first();
  await row.locator('input').nth(1).fill('10');
  await row.locator('input').nth(1).blur();
  await row.locator('.set-check').click();
  await page.waitForTimeout(400);
  const readStored = () => page.evaluate(() => {
    const parsed = JSON.parse(localStorage.getItem('raedworkouts.dev.state.v1'));
    const sets = parsed.active_session.exercises.chest_press_machine.sets.filter((set) => !set.is_warmup);
    return { weight: sets[0].weight, completed: sets[0].completed };
  });
  expect(await readStored()).toEqual({ weight: 12.5, completed: true });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  expect(await readStored()).toEqual({ weight: 12.5, completed: true });
  await expect(page.locator(firstWeight).first()).toHaveValue('12.5');
});
