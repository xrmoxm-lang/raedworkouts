import { expect, test } from '@playwright/test';

// The app ships Raed's real sync credentials and points at his real server, so
// ANY test that navigates without blocking that host pushes whatever it does to
// his live cloud row. history-delete.spec.mjs deletes sessions. Seven spec files
// had no block at all. Nothing in a test run may ever touch his data.
async function blockLiveSync(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
}


// Deleting the wrong row is the failure that matters here: the list is rendered
// newest-first via [...history].reverse(), so the loop index is the REVERSE
// position. Deleting by it would remove a session from the other end of the log
// and look plausible while doing it.
const appUrl = 'http://127.0.0.1:8899/index.html';
const user = 'hist';

function session(dateISO, name) {
  return {
    date: dateISO, session_id: 'upper_a', session_name: name, duration_min: 60,
    exercises: { chest_press_machine: { sets: [
      { is_warmup: false, weight: 40, reps: 10, completed: true },
    ] } },
  };
}

test.use({ viewport: { width: 390, height: 844 } });

test('deleting a session removes exactly that session', async ({ page }) => {
  await page.addInitScript(({ u, hist }) => {
    localStorage.clear();
    localStorage.setItem('raedworkouts.active_user', u);
    localStorage.setItem(`raedworkouts.${u}.settings.v1`, JSON.stringify({ user_id: u, theme: 'light', skin: 'waraq', lang: 'ar', locale_version: 1 }));
    localStorage.setItem(`raedworkouts.${u}.state.v1`, JSON.stringify({
      schema_version: 2, programme_reference_migration_version: 1,
      profile: { display_name: 'Raed', experience: 'returning', created_at: '2026-08-01T00:00:00.000Z' },
      active_session: null, history: hist, bodyweight_log: [],
      custom_videos: {}, custom_jn_urls: {}, video_hidden: {}, custom_exercises: [],
      programme_overrides: null, prs: {}, msg_index: 0, substitutions: [],
    }));
  }, { u: user, hist: [
    session('2026-08-05T09:00:00.000Z', 'OLDEST'),
    session('2026-08-12T09:00:00.000Z', 'SECOND'),
    session('2026-08-20T09:00:00.000Z', 'THIRD'),
    session('2026-08-30T09:00:00.000Z', 'NEWEST'),
  ] });

  await blockLiveSync(page);

  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.locator('nav.tab-bar button[data-route="history"]').click();
  await page.waitForTimeout(700);

  const cards = page.locator('#page-history .history-card');
  await expect(cards).toHaveCount(4);

  // The guard is an in-app dialog now, not confirm(): an installed PWA may
  // suppress the native one, and a delete that skips its own guard is the worst
  // thing to leave to the shell's discretion.
  // Delete the NEWEST — rendered first, but LAST in state.history. Deleting by
  // the reversed loop index would remove OLDEST instead, and with an odd count
  // and a middle target the two are indistinguishable.
  await cards.nth(0).locator('.date').click();
  await page.waitForTimeout(300);
  await cards.nth(0).locator('[data-delete-session]').click();
  await page.waitForTimeout(400);
  await page.locator('#modal [data-confirm-yes]').click();
  await page.waitForTimeout(700);

  const left = await page.evaluate((u) => {
    const s = JSON.parse(localStorage[`raedworkouts.${u}.state.v1`]);
    return s.history.map((h) => h.session_name);
  }, user);
  expect(left, 'the newest session must be the one removed').toEqual(['OLDEST', 'SECOND', 'THIRD']);
  await expect(cards).toHaveCount(3);
});

test('cancelling the delete leaves the session alone', async ({ page }) => {
  await page.addInitScript(({ u, hist }) => {
    localStorage.clear();
    localStorage.setItem('raedworkouts.active_user', u);
    localStorage.setItem(`raedworkouts.${u}.settings.v1`, JSON.stringify({ user_id: u, theme: 'light', skin: 'waraq', lang: 'ar', locale_version: 1 }));
    localStorage.setItem(`raedworkouts.${u}.state.v1`, JSON.stringify({
      schema_version: 2, programme_reference_migration_version: 1,
      profile: { display_name: 'Raed', experience: 'returning', created_at: '2026-08-01T00:00:00.000Z' },
      active_session: null, history: hist, bodyweight_log: [],
      custom_videos: {}, custom_jn_urls: {}, video_hidden: {}, custom_exercises: [],
      programme_overrides: null, prs: {}, msg_index: 0, substitutions: [],
    }));
  }, { u: user, hist: [session('2026-08-20T09:00:00.000Z', 'ONLY')] });

  await blockLiveSync(page);

  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.locator('nav.tab-bar button[data-route="history"]').click();
  await page.waitForTimeout(700);
  const cards = page.locator('#page-history .history-card');
  await cards.nth(0).locator('.date').click();
  await page.waitForTimeout(300);
  await cards.nth(0).locator('[data-delete-session]').click();
  await page.waitForTimeout(400);
  await page.locator('#modal [data-confirm-no]').click();
  await page.waitForTimeout(500);
  await expect(cards).toHaveCount(1);
});
