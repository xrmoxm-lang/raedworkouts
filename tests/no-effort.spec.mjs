// 2026-11-11 — Raed: «remove it from the progression completely: easy, hard,
// medium. … what is behind in the background should be the previous entry. …
// he can go see the previous history of every session of this exercise.»
//
// In the browser, at 390×844, behind the context fence in _fixtures.mjs:
//   - no effort control or effort line anywhere on the card, ramp or final set;
//   - the final working set ticks without being asked for a rating;
//   - a ramp tick never moves the working sets (probe / feel rules are gone);
//   - set N shows the previous session's set N, with both fallbacks;
//   - an old log full of effort values renders history with no rating word;
//   - ⚙️ → «السجل السابق» lists every session, newest first, every set.
// Seeded state, never tapped into: each is a state he ARRIVES at.
import { expect, test } from './_fixtures.mjs';

const APP = 'http://localhost:8877';
test.use({ viewport: { width: 390, height: 844 } });

const RATING_WORDS = /سهل|متوسط|صعب جد|صعبة جد|خفيف — بقصد|شبه الفشل|قريب من الفشل/;

// Every exercise in the rotation gets the same per-session sets, so whichever
// exercise is focused first has a known previous entry.
function historyWith(setsPerSession) {
  return setsPerSession.map((sets, i) => {
    const exercises = {};
    for (const ex of window.RW.EXERCISES) exercises[ex.id] = { sets };
    const day = String(10 + i * 2).padStart(2, '0');
    return {
      date: `2026-10-${day}`, session_id: ['upper_a', 'lower_a', 'upper_b', 'lower_b'][i % 4],
      started_at: `2026-10-${day}T09:00:00Z`, ended_at: `2026-10-${day}T10:00:00Z`,
      uid: `ne${i}`, prs: [], stats: {}, exercises,
    };
  });
}

async function intoSession(page, setsPerSession) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (r) => r.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
    if (t) t.click();
  });
  await page.waitForTimeout(900);
  await page.evaluate(({ src, sets }) => {
    // eslint-disable-next-line no-new-func
    const build = new Function('window', `return (${src})(${JSON.stringify(sets)});`);
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    parsed.history = sets ? build(window) : [];
    parsed.active_session = null; parsed.prs = {};
    localStorage[key] = JSON.stringify(parsed);
  }, { src: historyWith.toString(), sets: setsPerSession });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
  return errors;
}

const activeSession = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  return JSON.parse(localStorage[key]).active_session;
});
const focusedId = async (page) => Object.keys((await activeSession(page)).exercises)[0];
const W = (weight, reps, effort) => ({ is_warmup: false, weight, reps, completed: true, ...(effort ? { effort } : {}) });

test('set N shows the previous session\'s set N — value and what is behind it', async ({ page }) => {
  const errors = await intoSession(page, [
    [W(30, 12), W(30, 12), W(30, 12)],
    [W(40, 10, 'medium'), W(37.5, 9), W(35, 8, 'very_hard')],
  ]);
  const card = page.locator('#page-home .ex.expanded');
  const rows = card.locator('[data-set-kind="working"]');
  await expect(rows).toHaveCount(3);
  const seen = [];
  for (let i = 0; i < 3; i += 1) {
    const [weight, reps] = [rows.nth(i).locator('input').nth(0), rows.nth(i).locator('input').nth(1)];
    seen.push([await weight.inputValue(), await reps.inputValue(),
      await weight.getAttribute('placeholder'), await reps.getAttribute('placeholder')]);
  }
  expect(seen, 'the latest session, set by set, in the boxes and behind them').toEqual([
    ['40', '10', '40', '10'],
    ['37.5', '9', '37.5', '9'],
    ['35', '8', '35', '8'],
  ]);
  expect(errors).toEqual([]);
});

test('no set N last time → its last set; no history at all → the starter rule', async ({ page }) => {
  await intoSession(page, [[W(40, 10), { is_warmup: false, weight: '', reps: 10, completed: false, skipped: true }, W(35, 7)]]);
  const rows = page.locator('#page-home .ex.expanded [data-set-kind="working"]');
  const values = await rows.evaluateAll((els) => els.map((row) => [...row.querySelectorAll('input')].map((i) => i.value)));
  // Set 2 was skipped: it falls back to the last LOGGED set (35 × 7).
  expect(values).toEqual([['40', '10'], ['35', '7'], ['35', '7']]);
});

// The first-exposure ramp case lives in calibration-probe.spec.mjs, with the
// other invariants that survived the probe.

test('the final working set ticks without a rating, and no effort word is on the card', async ({ page }) => {
  const errors = await intoSession(page, [[W(40, 10), W(40, 10), W(40, 10)]]);
  const card = page.locator('#page-home .ex.expanded');
  await expect(card.locator('[data-prescribed-effort], .effort-line, .effort-strip, .effort-picker')).toHaveCount(0);
  await expect(card).not.toContainText(RATING_WORDS);
  const id = await focusedId(page);
  const before = (await activeSession(page)).exercises[id].sets;
  const ramps = before.filter((s) => s.is_warmup).length;
  for (let i = 0; i < ramps; i += 1) {
    await card.locator('[data-set-kind="warmup"] .set-check').nth(i).click();
    await page.waitForTimeout(250);
  }
  const working = (await activeSession(page)).exercises[id].sets.filter((s) => !s.is_warmup).map((s) => s.weight);
  expect(working, 'a ramp tick never moves the working sets').toEqual([40, 40, 40]);
  const checks = page.locator(`#ex-${id} [data-set-kind="working"] .set-check`);
  for (let i = 0; i < 3; i += 1) {
    await checks.nth(i).click();
    await page.waitForTimeout(300);
  }
  const done = (await activeSession(page)).exercises[id].sets.filter((s) => !s.is_warmup);
  expect(done.map((s) => s.completed), 'the last set is logged on the first tap').toEqual([true, true, true]);
  expect(done.some((s) => 'effort' in s), 'nothing writes a rating any more').toBe(false);
  await expect(page.locator('#toast')).not.toContainText(RATING_WORDS);
  expect(errors).toEqual([]);
});

test('an old log carrying ratings renders the history with no rating word', async ({ page }) => {
  const errors = await intoSession(page, [
    [W(30, 12, 'easy'), W(30, 12, 'medium'), W(30, 11, 'very_hard')],
    [W(32.5, 10, 'right'), W(32.5, 10), W(32.5, 9, 'easy')],
  ]);
  await page.locator('.tab[data-route="history"]').click();
  await page.waitForTimeout(600);
  await page.locator('.history-card-head').first().click();
  await page.waitForTimeout(400);
  const page_ = page.locator('#page-history');
  await expect(page_).toContainText('32.5×10');
  await expect(page_).not.toContainText(RATING_WORDS);
  expect(errors).toEqual([]);
});

test('⚙️ → «السجل السابق» lists every session, newest first, every set', async ({ page }) => {
  // Five sessions: more than the sheet's three-row summary.
  const errors = await intoSession(page, [
    [W(20, 10)], [W(22.5, 10)], [W(25, 10), W(25, 9)], [W(27.5, 8)], [W(30, 10, 'easy'), W(30, 9), W(27.5, 8)],
  ]);
  const id = await focusedId(page);
  await page.locator(`#ex-${id} [data-exercise-settings]`).first().click();
  await expect(page.locator('#modal [data-exercise-log] tbody tr'), 'the summary stays three rows').toHaveCount(3);
  await page.locator('#modal [data-previous-log]').click();
  const rows = page.locator('#modal [data-previous-log-list] [data-previous-log-row]');
  await expect(rows).toHaveCount(5);
  const sets = await rows.evaluateAll((els) => els.map((row) => row.querySelector('.xs-log-load').textContent.trim()));
  expect(sets).toEqual(['30 × 10 · 30 × 9 · 27.5 × 8', '27.5 × 8', '25 × 10 · 25 × 9', '22.5 × 10', '20 × 10']);
  await expect(page.locator('#modal')).not.toContainText(RATING_WORDS);
  // Back returns to the exercise's sheet, not out of it.
  await page.locator('#modal [data-previous-log-back]').click();
  await expect(page.locator('#modal [data-exercise-log]')).toHaveCount(1);
  // Measured, not assumed: nothing in the sheet scrolls sideways at 390px.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});
