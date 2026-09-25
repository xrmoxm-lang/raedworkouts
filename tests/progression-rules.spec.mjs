// Two rules the research states and the engine did not have until 2026-09-08:
//  - research/06 §5.3 R6 / 22 §2: two consecutive sessions with a working set
//    BELOW the bottom of the rep range walk the load back one equipment step.
//  - research/20 §9.4: an isolation exercise the week-5 rotation introduces
//    takes its first exposure at two working sets with RPE 9 capped to 8.
// Both are seeded, never driven through the UI — the state is one he ARRIVES at.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './_fixtures.mjs';

const APP = 'http://localhost:8877';
const SEED = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '_seed-state.json'), 'utf8'));

async function bootWith(page, state) {
  await page.addInitScript((st) => {
    localStorage.setItem('raedworkouts.Raed.state.v1', JSON.stringify(st));
  }, state);
  // The context fence in _fixtures.mjs is the real guard; these keep the per-spec gate honest too.
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (r) => r.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(APP, { waitUntil: 'load' });
  await page.locator('.welcome-screen, [data-home-overview]').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('#page-home [data-home-view-exercises]')?.click());
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(800);
}

test('two sessions short of the bottom of the range walk the load back one step', async ({ page }) => {
  // 12 seeded sessions end on lower_b, so the next session is upper_a and its
  // first movement is the chest press. Rewrite its last two exposures: 40 kg,
  // every working set under the 8-rep floor.
  const state = structuredClone(SEED);
  const uppers = state.history.filter((s) => s.session_id === 'upper_a').slice(-2);
  for (const session of uppers) {
    const entry = session.exercises.chest_press_machine;
    entry.sets = entry.sets.map((set) => set.is_warmup ? set : { ...set, weight: 40, reps: 6, completed: true });
  }
  await bootWith(page, state);
  await expect(page.locator('#page-home .ex.expanded h4 bdi')).toHaveText('Chest Press Machine');
  const first = page.locator('#page-home [data-set-kind="working"] [data-runner-weight-input]').first();
  // No learned step (one weight in history) and no equipment set → data.js's
  // Matrix stack ladder (Round 6 §D): 40 reads as the «41» label (9 × 4.5359),
  // so one step down is the label below it, 36.
  await expect(first, 'the load must come down one step, not hold at 40').toHaveAttribute('placeholder', '36');
  await expect(page.locator('[data-why-weight]')).toContainText(/نزّل|درجة|خفّض/);
});

test('an isolation the week-5 rotation introduces starts capped: two sets, RPE 8', async ({ page }) => {
  // 16 completed sessions = week 5 = Block B's first week; next up is upper_a,
  // where Machine Lateral Raise arrives with 3 × RPE 8/9/9 on paper.
  const state = structuredClone(SEED);
  const extra = state.history.slice(0, 4).map((s, i) => ({
    ...s, uid: `seed-extra-${i + 1}`,
    date: new Date(Date.UTC(2026, 7, 20 + i * 2)).toISOString(),
    started_at: new Date(Date.UTC(2026, 7, 20 + i * 2, 17)).toISOString(),
  }));
  state.history = [...state.history, ...extra];
  await bootWith(page, state);
  const planned = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const active = JSON.parse(localStorage[key]).active_session;
    return {
      ids: Object.keys(active.exercises),
      lateral: active.exercises.machine_lateral_raise?.planned,
      chest: active.exercises.chest_press_machine?.planned,
      working: Object.fromEntries(Object.entries(active.exercises).map(([id, e]) => [id, e.sets.filter((s) => !s.is_warmup).length])),
    };
  });
  expect(planned.ids, 'week 5 must be Block B').toContain('machine_lateral_raise');
  expect(planned.working.machine_lateral_raise, 'first exposure of a new isolation is two working sets').toBe(2);
  expect(planned.lateral.rpe_set1, 'RPE is capped at 8 on that first exposure').toBeLessThanOrEqual(8);
  expect(planned.lateral.rpe_set2).toBeLessThanOrEqual(8);
  // The compounds are untouched — §8.2 holds them constant through the rotation.
  expect(planned.working.chest_press_machine, 'a compound keeps its full prescription').toBe(3);
});

// Round 5, finding #2. `suggestNextWeight` computed `allHitTarget` with
// `workingSets.every(...)` over whatever countable sets existed and had no
// `sets_target` check at all, while research/22 §2 — canonical on how load
// advances — defines `hit_top` over a COMPLETE exposure, and the canonical
// `domain/progression.js` had always gated on one. So one ticked set in each of
// two half-finished sessions promoted the load, and the note told him he had
// completed the top of the range «في كل المجموعات».
function abandonAfterFirstSet(state, weight) {
  for (const session of state.history.filter((s) => s.session_id === 'upper_a').slice(-2)) {
    const entry = session.exercises.chest_press_machine;
    entry.sets = [
      ...entry.sets.filter((set) => set.is_warmup),
      { is_warmup: false, weight, reps: 10, completed: true, effort: null },
      // The machine was taken. Two prescribed sets never happened.
      { is_warmup: false, weight: '', reps: 10, completed: false, skipped: true },
      { is_warmup: false, weight: '', reps: 10, completed: false, skipped: true },
    ];
  }
  return state;
}

test('two abandoned exposures do not promote the load, however good the one set was', async ({ page }) => {
  const state = abandonAfterFirstSet(structuredClone(SEED), 20);
  await bootWith(page, state);
  await expect(page.locator('#page-home .ex.expanded h4 bdi')).toHaveText('Chest Press Machine');
  const first = page.locator('#page-home [data-set-kind="working"] [data-runner-weight-input]').first();
  // Measured before the fix: 22.5, prefilled into all three rows, with
  // «أكملت 10 في كل المجموعات مرتين. ارفع 2.5 كغ» underneath.
  await expect(first, 'one of three sets, twice, is not two complete exposures').toHaveAttribute('placeholder', '20');
  // It falls through to «طابق أو تجاوز», the one note the card suppresses — so
  // no load reasoning is printed at all, which is honest: nothing was decided.
  await expect(page.locator('#page-home .ex.expanded [data-why-weight]')).toHaveCount(0);
});

test('three completed sets at the top of the range, twice, still promote it', async ({ page }) => {
  // The control for the test above: same exercise, same weight, same reps — the
  // only difference is that the exposures are complete.
  const state = structuredClone(SEED);
  for (const session of state.history.filter((s) => s.session_id === 'upper_a').slice(-2)) {
    const entry = session.exercises.chest_press_machine;
    entry.sets = [
      ...entry.sets.filter((set) => set.is_warmup),
      ...[0, 1, 2].map(() => ({ is_warmup: false, weight: 20, reps: 10, completed: true, effort: null })),
    ];
  }
  await bootWith(page, state);
  const first = page.locator('#page-home [data-set-kind="working"] [data-runner-weight-input]').first();
  // Round 6 §D: the chest press is a Matrix stack; 20 is off its ladder, so
  // the step lands on the next label, 23 (never 22.5, which no plate says).
  await expect(first).toHaveAttribute('placeholder', '23');
  await expect(page.locator('#page-home .ex.expanded [data-why-weight]')).toContainText('ارفع');
});

// Round 5, finding #3. domain/clamps.js was imported by nothing the browser
// loads: C1-C8 were tested and never ran. The live controller now puts every
// load it proposes that he has NOT already lifted through the pipeline, so C7
// (an engineering absurdity filter: 2× bodyweight on a press) can stop one.
test('a load past any sane multiple of bodyweight is held, not stepped up again', async ({ page }) => {
  const state = structuredClone(SEED);
  state.profile = { ...state.profile, bodyweight_kg: 82 };
  for (const session of state.history.filter((s) => s.session_id === 'upper_a').slice(-2)) {
    const entry = session.exercises.chest_press_machine;
    // A corrupted import, a mis-typed 300 for 30 — however it got there, the
    // rep criterion is met and the old controller would answer 302.5 kg.
    entry.sets = [
      ...entry.sets.filter((set) => set.is_warmup),
      ...[0, 1, 2].map(() => ({ is_warmup: false, weight: 300, reps: 10, completed: true, effort: null })),
    ];
  }
  await bootWith(page, state);
  const first = page.locator('#page-home [data-set-kind="working"] [data-runner-weight-input]').first();
  await expect(first, '302.5 kg is 3.7× his bodyweight on a machine press').toHaveAttribute('placeholder', '300');
  await expect(page.locator('#page-home .ex.expanded [data-why-weight]')).toContainText('سقف الأمان');
});

// Round 5, finding #3's second half: `why_hold_very_hard` and `why_easy_bump`
// are the D16/D17 effort contract on the path Raed actually trains against, and
// neither had a test anywhere — the contract was only asserted against
// `domain/progression.js`, which no screen could reach.
function rewriteLastTwoUpperA(state, latest, previous) {
  const uppers = state.history.filter((s) => s.session_id === 'upper_a').slice(-2);
  for (const [session, sets] of [[uppers[0], previous], [uppers[1], latest]]) {
    const entry = session.exercises.chest_press_machine;
    entry.sets = [...entry.sets.filter((set) => set.is_warmup), ...sets];
  }
  return state;
}
const working = (reps, effort = null) => ({ is_warmup: false, weight: 20, reps, completed: true, effort });

test('«صعبة جدًا» on the final set holds a load the reps had already earned', async ({ page }) => {
  // Both exposures complete at the top of the range, so the two-session bump is
  // earned — and D17 makes effort a brake that can only ever delay it.
  const state = rewriteLastTwoUpperA(
    structuredClone(SEED),
    [working(10), working(10), working(10, 'very_hard')],
    [working(10), working(10), working(10, 'medium')],
  );
  await bootWith(page, state);
  const first = page.locator('#page-home [data-set-kind="working"] [data-runner-weight-input]').first();
  await expect(first, 'very_hard holds the load; it never lowers or raises it').toHaveAttribute('placeholder', '20');
  await expect(page.locator('#page-home .ex.expanded [data-why-weight]')).toContainText('صعبة جدًا');
});

test('«سهل» after one complete top exposure lands the increase a session sooner', async ({ page }) => {
  // The previous exposure fell one rep short, so the two-session branch does not
  // fire. D16: easy may bring a reps-earned increase forward, never create one.
  const state = rewriteLastTwoUpperA(
    structuredClone(SEED),
    [working(10), working(10), working(10, 'easy')],
    [working(9), working(9), working(9, 'medium')],
  );
  await bootWith(page, state);
  const first = page.locator('#page-home [data-set-kind="working"] [data-runner-weight-input]').first();
  await expect(first, 'the next Matrix label above 20').toHaveAttribute('placeholder', '23');
  await expect(page.locator('#page-home .ex.expanded [data-why-weight]')).toContainText('أبكر بجلسة');
});
