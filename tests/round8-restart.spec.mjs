import { expect, test } from './_fixtures.mjs';

// Round 8 §1 in the browser: ⚙️ → «البرنامج» → «إعادة الدورة». His shape: 21
// sessions, the last one TODAY (Lower A). After the restart the clock reads
// week 1 · cycle 2 everywhere, the Home week card (the calendar) still shows
// today's session, the log is untouched and the next session is still
// Upper B. Unit coverage: tests/round8.test.mjs.
async function blockLiveSync(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
}

const appUrl = 'http://127.0.0.1:8899/index.html';
const user = 'dev';
const stateKey = `raedworkouts.${user}.state.v1`;

async function boot(page, { active = false } = {}) {
  await page.addInitScript(({ u, key, active }) => {
    if (sessionStorage.getItem('round8-seeded')) return;
    sessionStorage.setItem('round8-seeded', '1');
    localStorage.clear();
    const order = ['upper_a', 'lower_a', 'upper_b', 'lower_b'];
    const now = Date.now();
    // 20 older sessions, three days apart, then one an hour ago.
    const history = Array.from({ length: 21 }, (_, i) => {
      const ms = i === 20 ? now - 3600000 : now - (21 - i) * 3 * 86400000 - 86400000 * 7;
      const d = new Date(ms);
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        uid: `r8-${i}`, date: local, started_at: d.toISOString(), ended_at: new Date(ms + 1800000).toISOString(),
        session_id: i === 20 ? 'lower_a' : order[i % 4], session_name: 'Session', exercises: {},
      };
    });
    localStorage.setItem('raedworkouts.active_user', u);
    localStorage.setItem(`raedworkouts.${u}.settings.v1`, JSON.stringify({ user_id: u, theme: 'light', skin: 'waraq', lang: 'ar', locale_version: 1 }));
    localStorage.setItem(key, JSON.stringify({
      schema_version: 2, programme_reference_migration_version: 1,
      profile: { display_name: 'Raed', experience: 'returning', created_at: '2026-08-01T00:00:00.000Z' },
      active_session: active ? { session_id: 'upper_b', session_name: 'Upper B', date: history[20].date, started_at: new Date().toISOString(), exercises: {} } : null,
      history, bodyweight_log: [], custom_videos: {}, custom_jn_urls: {}, video_hidden: {}, custom_exercises: [],
      programme_overrides: null, prs: {}, msg_index: 0, substitutions: [], forced_next_session: null,
      cycle_announced: 1, exercise_prefs: {},
    }));
  }, { u: user, key: stateKey, active });
  await blockLiveSync(page);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
}

const stored = (page) => page.evaluate((key) => JSON.parse(localStorage[key]), stateKey);

async function openProgramme(page) {
  await page.locator('.tab-bar .tab[data-route="settings"]').click();
  await page.waitForTimeout(400);
  const section = page.locator('details[data-settings-disclosure]').filter({ hasText: 'البرنامج' }).first();
  await section.locator('summary').click();
  return section;
}

test.use({ viewport: { width: 390, height: 844 } });

test('restart: week 1 · cycle 2 everywhere, the week card agrees, the log stays', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#page-home .tb-clock').first()).toContainText('الأسبوع 6');
  await expect(page.locator('[data-week-card] .section-head .num')).toHaveText(/^1\//);

  const section = await openProgramme(page);
  const button = section.locator('[data-programme-restart]');
  await expect(section).toContainText('إعادة الدورة');
  await expect(section).toContainText('يرجع إلى الأسبوع 1 بنفس تمارين البداية. السجل والأوزان تبقى.');
  await expect(button).toHaveText('ابدأ من الأسبوع 1');
  await expect(button).not.toHaveClass(/danger/);
  // Tap target: the box or its ::before hit-area floor, whichever is larger.
  const target = await button.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const before = getComputedStyle(el, '::before');
    return Math.min(Math.max(box.height, parseFloat(before.height) || 0), Math.max(box.width, parseFloat(before.width) || 0));
  });
  expect(target).toBeGreaterThanOrEqual(44);

  // Cancel changes nothing.
  await button.click();
  await expect(page.locator('#modal')).toContainText('تبدأ من الأسبوع الأول؟');
  await expect(page.locator('#modal')).toContainText('ولا يُحذف شيء');
  await page.locator('#modal [data-confirm-no]').click();
  expect((await stored(page)).programme_restart ?? null).toBe(null);

  await button.click();
  await expect(page.locator('#modal [data-confirm-yes]')).toHaveText('ابدأ من جديد');
  await expect(page.locator('#modal [data-confirm-yes]')).not.toHaveClass(/danger/);
  await page.locator('#modal [data-confirm-yes]').click();
  await expect(page.locator('#toast')).toContainText('بدأت الدورة 2 — الأسبوع 1');

  const after = await stored(page);
  expect(after.programme_restart.cycle).toBe(2);
  expect(after.history.length, 'nothing is deleted').toBe(21);
  await expect(page.locator('details[data-settings-disclosure] .sd-hint').filter({ hasText: 'الدورة' }).first())
    .toHaveText('الأسبوع 1 · الدورة 2');

  // Home, after a reload too: the clock, the count and the strip agree.
  for (const pass of ['live', 'reload']) {
    if (pass === 'reload') await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.tab-bar .tab[data-route="home"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#page-home .tb-clock').first(), pass).toHaveText('الأسبوع 1 · الدورة 2');
    // The week card is the CALENDAR: the session he did an hour ago is still there.
    await expect(page.locator('[data-week-card] .section-head .num'), pass).toHaveText(/^1\//);
    await expect(page.locator('[data-week-strip] .week-day.trained'), pass).toHaveCount(1);
    // The rotation is history-driven and not reset: after Lower A, Upper B.
    await expect(page.locator('#page-home .today h1'), pass).toContainText('علوي ب');
  }
});

test('restart is disabled while a session runs', async ({ page }) => {
  await boot(page, { active: true });
  const section = await openProgramme(page);
  const button = section.locator('[data-programme-restart]');
  await expect(button).toBeDisabled();
  await expect(section).toContainText('أنهِ الجلسة الجارية أو تجاهلها أولًا.');
  expect((await stored(page)).programme_restart ?? null).toBe(null);
});
