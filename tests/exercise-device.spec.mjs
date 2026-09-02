import { expect, test } from '@playwright/test';

// The whole point of remembering the machine is that the weight history follows
// it. 60 kg on one leg press is not 60 kg on another, so a suggestion built from
// a mixed history is a suggestion built from nothing. These assertions pin the
// behaviour, not the label.
const appUrl = 'http://127.0.0.1:8899/index.html';
const user = 'dev';

// 57.5 is deliberate: fmtKgTotal rounds to whole kilos, so a half-plate load was
// being reported back to him as 58. Gym plates land on halves constantly.
function logged(dateISO, device, weight) {
  return {
    date: dateISO, session_id: 'upper_a', session_name: 'Upper A', duration_min: 60,
    exercises: { chest_press_machine: {
      device,
      sets: [
        { is_warmup: false, weight, reps: 10, completed: true },
        { is_warmup: false, weight, reps: 10, completed: true },
      ],
    } },
  };
}

async function boot(page, prefs, history) {
  await page.addInitScript(({ u, p, hist }) => {
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
      exercise_prefs: p,
    }));
  }, { u: user, p: prefs, hist: history });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
}

test.use({ viewport: { width: 390, height: 844 } });

const HISTORY = [
  logged('2026-08-10T09:00:00.000Z', 'Hammer Strength', 60),
  logged('2026-08-20T09:00:00.000Z', 'Old Machine', 25),
];

async function intoSession(page) {
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
}

test('the "last time" line follows the selected machine', async ({ page }) => {
  // With "Hammer Strength" selected, the NEWER 25 kg session logged on a
  // different machine must not be what the card reads back.
  await boot(page, { chest_press_machine: { equipment: 'machine', device: 'Hammer Strength', known_devices: ['Hammer Strength', 'Old Machine'] } }, HISTORY);
  await intoSession(page);
  const hammer = await page.locator('#ex-chest_press_machine .last-time').first().textContent();
  expect(hammer, 'must read the 60 kg session on Hammer Strength').toContain('60');
  expect(hammer, 'must not read the 25 kg session from the other machine').not.toContain('25');
});

test('switching machine switches the history the card reads', async ({ page }) => {
  await boot(page, { chest_press_machine: { equipment: 'machine', device: 'Old Machine', known_devices: ['Hammer Strength', 'Old Machine'] } }, HISTORY);
  await intoSession(page);
  const old = await page.locator('#ex-chest_press_machine .last-time').first().textContent();
  expect(old, 'must read the 25 kg session on Old Machine').toContain('25');
});

test('a machine with no history yet still shows the general record', async ({ page }) => {
  // A first session on a new machine must not present an empty card as if he
  // had never performed the movement.
  await boot(page, { chest_press_machine: { equipment: 'machine', device: 'Brand New', known_devices: ['Brand New'] } }, HISTORY);
  await intoSession(page);
  await expect(page.locator('#ex-chest_press_machine .last-time').first()).toBeVisible();
});

test('the settings sheet opens from the exercise card', async ({ page }) => {
  await boot(page, {}, HISTORY);
  await intoSession(page);
  await page.locator('#ex-chest_press_machine [data-exercise-settings]').first().click();
  await page.waitForTimeout(500);
  await expect(page.locator('#modal-overlay.show')).toHaveCount(1);
  // The heading is the movement itself, not a generic "settings" label — the
  // sheet is about this exercise and says so.
  await expect(page.locator('#modal .xs-head h3')).toContainText('Chest Press Machine');
  // The three sections the sheet is built around: what it is performed on,
  // what he has lifted here, and what he can do now.
  await expect(page.locator('#modal')).toContainText('الجهاز');
  await expect(page.locator('#modal [data-exercise-log]')).toBeVisible();
  await expect(page.locator('#modal [data-open-swap]')).toBeVisible();
  // Everything that used to crowd the per-set row is reachable here.
  for (const handle of ['data-add-set', 'data-video-add', 'data-add-exercise', 'data-runner-skip-exercise', 'data-machine-weight']) {
    await expect(page.locator(`#modal [${handle}]`), handle).toHaveCount(1);
  }
});

test('the sheet shows what he has lifted here, per machine', async ({ page }) => {
  await boot(page, { chest_press_machine: { equipment: 'machine', device: 'Hammer Strength', known_devices: ['Hammer Strength', 'Old Machine'] } }, HISTORY);
  await intoSession(page);
  await page.locator('#ex-chest_press_machine [data-exercise-settings]').first().click();
  await page.waitForTimeout(500);
  const log = page.locator('[data-exercise-log]');
  await expect(log).toBeVisible();
  const text = await log.textContent();
  // Both machines must appear: the table exists precisely to show the
  // difference between them, which the per-device history hides while training.
  expect(text).toContain('60');
  expect(text).toContain('25');
  expect(text).toContain('Hammer Strength');
  expect(text).toContain('Old Machine');
});

test('a half-plate load is shown exactly, not rounded', async ({ page }) => {
  await boot(page, { chest_press_machine: { equipment: 'machine', device: 'Hammer Strength', known_devices: ['Hammer Strength'] } },
    [logged('2026-08-16T09:00:00.000Z', 'Hammer Strength', 57.5)]);
  await intoSession(page);
  await page.locator('#ex-chest_press_machine [data-exercise-settings]').first().click();
  await page.waitForTimeout(500);
  const text = await page.locator('[data-exercise-log]').textContent();
  expect(text, 'must show 57.5, not 58').toContain('57.5');
  expect(text).not.toContain('58 ×');
});
