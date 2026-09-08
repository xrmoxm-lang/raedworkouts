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
  // No learned step (one weight in history) and no equipment set → the 2.5 kg default.
  await expect(first, 'the load must come down one step, not hold at 40').toHaveAttribute('placeholder', '37.5');
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
