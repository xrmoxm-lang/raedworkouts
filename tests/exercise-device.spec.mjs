import { expect, test } from '@playwright/test';

// The app ships Raed's real sync credentials and points at his real server, so
// ANY test that navigates without blocking that host pushes whatever it does to
// his live cloud row. history-delete.spec.mjs deletes sessions. Seven spec files
// had no block at all. Nothing in a test run may ever touch his data.
async function blockLiveSync(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
}


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

async function boot(page, prefs, history, settingsOverride = {}) {
  await page.addInitScript(({ u, p, hist, over }) => {
    localStorage.clear();
    localStorage.setItem('raedworkouts.active_user', u);
    // The override is folded in HERE rather than by a second addInitScript: this
    // one clears storage and runs on every navigation, so anything written by an
    // earlier script is gone by the time the app boots.
    localStorage.setItem(`raedworkouts.${u}.settings.v1`, JSON.stringify({ user_id: u, theme: 'light', skin: 'waraq', lang: 'ar', locale_version: 1, ...over }));
    localStorage.setItem(`raedworkouts.${u}.state.v1`, JSON.stringify({
      schema_version: 2, programme_reference_migration_version: 1,
      profile: { display_name: 'Raed', experience: 'returning', created_at: '2026-08-01T00:00:00.000Z' },
      active_session: null, history: hist, bodyweight_log: [],
      custom_videos: {}, custom_jn_urls: {}, video_hidden: {}, custom_exercises: [],
      programme_overrides: null, prs: {}, msg_index: 0, substitutions: [],
      forced_next_session: 'upper_a',
      exercise_prefs: p,
    }));
  }, { u: user, p: prefs, hist: history, over: settingsOverride });
  await blockLiveSync(page);
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

// Added 2026-09-05. `runner_video_open` was in defaultSettings(), migrated once
// on load, and read by NOTHING — while GATES.md:89-92 recorded it as live and
// verified. Raed asked for this in his own words: «فيه زي هذه العجلة حقة
// الإعدادات إنه مثلاً أحط أخفي الـvideos... وتكون مخفية، أهم شيء يكون real app
// وتتذكر التصرفات».
test('the gear hides the clips during a workout, and remembers it', async ({ page }) => {
  await boot(page, {}, HISTORY);
  await intoSession(page);

  const strip = page.locator('#ex-chest_press_machine .video-row');
  await expect(strip).toHaveCount(1);

  await page.locator('#ex-chest_press_machine [data-exercise-settings]').first().click();
  await page.waitForTimeout(500);
  // The section exists and lists this exercise's own clips.
  await expect(page.locator('#modal [data-runner-video-open]')).toHaveCount(1);
  await expect(page.locator('#modal [data-xs-clip]').first()).toBeVisible();

  await page.locator('#modal [data-runner-video-open]').uncheck();
  await page.waitForTimeout(400);
  await page.locator('#modal-overlay').evaluate((el) => el.classList.remove('show'));
  await page.waitForTimeout(300);
  await expect(strip).toHaveCount(0);

  // «وتتذكر التصرفات» — the choice is written, not just held in memory.
  //
  // NOT tested with page.reload(): boot() installs an addInitScript that calls
  // localStorage.clear(), and that runs on every navigation. A reload here wipes
  // the session, so `.video-row` is absent because there is no CARD — the
  // assertion would pass without the setting doing anything at all. It did, on
  // the first version of this test.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('raedworkouts.dev.settings.v1') || '{}'));
  expect(stored.runner_video_open).toBe(false);

  // And back on again, so the switch is a switch and not a one-way door.
  await page.locator('#ex-chest_press_machine [data-exercise-settings]').first().click();
  await page.waitForTimeout(500);
  await page.locator('#modal [data-runner-video-open]').check();
  await page.waitForTimeout(400);
  await page.locator('#modal-overlay').evaluate((el) => el.classList.remove('show'));
  await page.waitForTimeout(300);
  await expect(page.locator('#ex-chest_press_machine .video-row')).toHaveCount(1);
});

// The other half of "remembered": a session that STARTS with the switch off
// draws no strip. This is the boot path, which the in-page toggle never covers.
test('a workout booted with clips switched off draws no strip', async ({ page }) => {
  await boot(page, {}, HISTORY, { runner_video_open: false });
  await intoSession(page);
  await expect(page.locator('#ex-chest_press_machine')).toHaveCount(1);
  await expect(page.locator('#ex-chest_press_machine .video-row')).toHaveCount(0);
});

// The per-clip marks were a Library-only control. Mid-set that is two screens
// away from the card the clip is on, which is why the thing he asked for never
// felt delivered even though half of it existed.
test('a single clip can be hidden from the card he is standing at', async ({ page }) => {
  await boot(page, {}, HISTORY);
  await intoSession(page);
  const before = await page.locator('#ex-chest_press_machine .video-row a, #ex-chest_press_machine .video-row .video-thumb-wrap').count();
  expect(before).toBeGreaterThan(0);

  await page.locator('#ex-chest_press_machine [data-exercise-settings]').first().click();
  await page.waitForTimeout(500);
  const firstChip = page.locator('#modal [data-xs-clip]').first();
  const key = await firstChip.getAttribute('data-xs-clip');
  // The key names the clip itself, never its position in the list.
  expect(key).toMatch(/^(yt:|url:)/);
  await firstChip.click();
  await page.waitForTimeout(400);
  await expect(page.locator(`#modal [data-xs-clip="${key}"]`)).toHaveClass(/off/);

  await page.locator('#modal-overlay').evaluate((el) => el.classList.remove('show'));
  await page.waitForTimeout(300);
  const after = await page.locator('#ex-chest_press_machine .video-row a, #ex-chest_press_machine .video-row .video-thumb-wrap').count();
  expect(after).toBe(before - 1);
});

// Added 2026-09-05, from his own logged session. He trained Upper A that morning
// and three of its seven exercises — the T-bar row, the rope triceps extension
// and the cable lateral raise — were logged at 0 kg with «وزن الجهاز فقط» ticked.
// That flag lived only on the active session, so he was re-ticking it three
// times every workout, and until he did, the card opened with a blank weight box
// on a machine whose weight he never enters.
test('«machine weight only» is remembered for the exercise, not just the session', async ({ page }) => {
  await boot(page, {}, HISTORY);
  await intoSession(page);

  await page.locator('#ex-chest_press_machine [data-exercise-settings]').first().click();
  await page.waitForTimeout(500);
  await page.locator('#modal [data-machine-weight]').check();
  await page.waitForTimeout(500);

  const prefs = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k))
      || Object.keys(localStorage).find((k) => /\.state\./.test(k));
    return JSON.parse(localStorage[key]).exercise_prefs?.chest_press_machine;
  });
  expect(prefs?.machine_weight, 'the choice belongs to the exercise').toBe(true);
});

// And a fresh session picks it up, with the loads already zeroed.
test('a new session opens already set to machine weight', async ({ page }) => {
  await boot(page, { chest_press_machine: { equipment: 'machine', device: '', known_devices: [], machine_weight: true } }, HISTORY);
  await intoSession(page);

  const state = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k));
    const active = JSON.parse(localStorage[key]).active_session;
    const entry = active.exercises.chest_press_machine;
    return {
      flag: entry.machine_weight,
      workingWeights: entry.sets.filter((s) => !s.is_warmup).map((s) => s.weight),
    };
  });
  expect(state.flag, 'the remembered choice is applied').toBe(true);
  expect(state.workingWeights.every((w) => Number(w) === 0), 'and the loads it implies are set').toBe(true);

  // The WORKING box is read-only and shows the machine placeholder rather than
  // sitting blank — he never types a weight here. `.set-grid input` first() is a
  // ramp row, which keeps its own computed load exactly as the gear toggle
  // leaves it, so index by the working set.
  const rampCount = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k));
    return JSON.parse(localStorage[key]).active_session.exercises.chest_press_machine
      .sets.filter((s) => s.is_warmup).length;
  });
  const workingWeight = page.locator('#ex-chest_press_machine [data-runner-weight-input]').nth(rampCount);
  await expect(workingWeight).toHaveJSProperty('readOnly', true);
  await expect(workingWeight).toHaveAttribute('placeholder', 'الجهاز');
});
