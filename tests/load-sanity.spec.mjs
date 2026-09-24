// Round 5 (health) — one stray zero used to be permanent.
//
// Measured on 2026-09-23 before the fix, at 390×844 on a seeded Raed profile:
// typing 800 × 10 into a chest-press working row and tapping ✓ logged the set,
// wrote `state.prs.chest_press_machine` at Epley score 1066.7, and left 800 kg in the archived
// session, the weekly volume and «آخر مرة» with no way back except Settings →
// clear ALL PRs. `domain/clamps.js` C7 already knew 800 kg is not a human
// pressing motion (2× bodyweight = 164 kg for an 82 kg lifter); it had no caller
// on the data-entry path.
//
// The guard ASKS, it does not refuse — his standing ruling on guards is that one
// that swallows what he entered is worse than the thing it prevents. So: first
// tap states the number back, second tap logs it.
import { expect, test } from './_fixtures.mjs';

const APP = 'http://localhost:8877';

test.use({ viewport: { width: 390, height: 844 } });

const readState = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  return JSON.parse(localStorage[key]);
});

async function pickRaed(page) {
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(900);
}

// Boot, start today's session, skip the warm-up phase, then mark the card's own
// ramp rows done — the runner refuses a working tick while a ramp row above it
// is open, and that refusal is not what this spec is about. A state he ARRIVES
// at is seeded, not tapped.
async function intoRunner(page) {
  // The fixture fences the whole context; these are the per-spec second fence
  // the suite requires. A probe once wrote a phantom session into his live row.
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (r) => r.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(APP, { waitUntil: 'load' });
  await page.locator('.welcome-screen, [data-home-overview]').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  await pickRaed(page);
  await page.evaluate(() => document.querySelector('#page-home [data-home-view-exercises]')?.click());
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const profile = JSON.parse(localStorage[key]);
    Object.values(profile.active_session?.exercises || {}).forEach((entry) => {
      (entry.sets || []).filter((set) => set.is_warmup).forEach((set) => { set.completed = true; });
    });
    localStorage[key] = JSON.stringify(profile);
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);
  await pickRaed(page);
}

// The first working row of the exercise on screen — never the last one, which
// asks for the effort first.
function firstWorkingRow(page) {
  return page.locator('#page-home .ex.expanded [data-set-kind="working"]').first();
}

// What the ledger keeps of a load: the ticked set, the PR cache, and the id of
// the movement it was logged against.
async function ledger(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const profile = JSON.parse(localStorage[key]);
    const active = profile.active_session || {};
    const id = Object.keys(active.exercises || {}).find((k) => (active.exercises[k].sets || []).some((s) => !s.is_warmup));
    const entry = active.exercises?.[id] || {};
    const working = (entry.sets || []).filter((s) => !s.is_warmup);
    return {
      id,
      firstSet: working[0] || null,
      completed: working.filter((s) => s.completed === true).length,
      prs: profile.prs || {},
    };
  });
}

test('a fat-fingered 800 kg is stated back and logged nowhere until he taps again', async ({ page }) => {
  await intoRunner(page);
  const row = firstWorkingRow(page);
  await row.locator('[data-runner-weight-input]').fill('800');
  await row.locator('input[inputmode="numeric"]').fill('10');
  await page.waitForTimeout(600);

  await row.locator('.set-check').click();
  await page.waitForTimeout(400);

  const toastText = await page.locator('#toast.show').textContent();
  expect(toastText, 'the guard states the number back rather than judging it').toContain('800');
  const asked = await ledger(page);
  expect(asked.firstSet.completed, 'the first tap must not log an absurd load').not.toBe(true);
  expect(asked.completed, 'nothing is ticked yet').toBe(0);
  expect(Object.keys(asked.prs), 'and nothing reaches the PR cache, which only Settings can clear')
    .not.toContain(asked.id);
  // The number he typed is still in the box — the guard asks, it never edits.
  await expect(row.locator('[data-runner-weight-input]')).toHaveValue('800');

  // Second tap: it is his ledger. He said it twice, it is logged.
  await row.locator('.set-check').click();
  await page.waitForTimeout(400);
  const confirmed = await ledger(page);
  expect(confirmed.firstSet.completed, 'the second tap logs it').toBe(true);
  expect(confirmed.firstSet.weight).toBe(800);
});

test('correcting the number re-arms the check — a second slip is caught too', async ({ page }) => {
  await intoRunner(page);
  const row = firstWorkingRow(page);
  const weight = row.locator('[data-runner-weight-input]');
  await weight.fill('800');
  await row.locator('input[inputmode="numeric"]').fill('10');
  await page.waitForTimeout(500);
  await row.locator('.set-check').click();
  await page.waitForTimeout(300);

  // He reads the toast, sees the zero, fixes it.
  await weight.fill('80');
  await page.waitForTimeout(600);
  await row.locator('.set-check').click();
  await page.waitForTimeout(400);
  const real = await ledger(page);
  expect(real.firstSet.completed, 'an ordinary load is never questioned').toBe(true);
  expect(real.firstSet.weight).toBe(80);

  // The same slip again, on the same row, must ask again rather than ride the
  // earlier confirmation.
  await row.locator('.set-check').click();   // untick
  await page.waitForTimeout(300);
  await weight.fill('800');
  await page.waitForTimeout(600);
  await row.locator('.set-check').click();
  await page.waitForTimeout(400);
  const again = await ledger(page);
  expect(again.firstSet.completed, 'a corrected box is a new claim, checked again').not.toBe(true);
  await expect(page.locator('#toast.show')).toContainText('800');
});

test('an ordinary working load ticks on the first tap', async ({ page }) => {
  await intoRunner(page);
  const row = firstWorkingRow(page);
  await row.locator('[data-runner-weight-input]').fill('60');
  await row.locator('input[inputmode="numeric"]').fill('10');
  await page.waitForTimeout(600);
  await row.locator('.set-check').click();
  await page.waitForTimeout(400);
  const logged = await ledger(page);
  expect(logged.firstSet.completed, '60 kg on a chest press is a Tuesday, not a typo').toBe(true);
  expect(logged.completed).toBe(1);
});

test('the boxes carry the model\'s own floor, and no ceiling that could rewrite him', async ({ page }) => {
  await intoRunner(page);
  const row = firstWorkingRow(page);
  const weight = row.locator('[data-runner-weight-input]');
  const reps = row.locator('input[inputmode="numeric"]');
  // hasValidWorkingValues (domain/runner-session.js): weight ≥ 0 — zero is a
  // real load on a machine that carries its own stack — and reps ≥ 1.
  await expect(weight).toHaveAttribute('min', '0');
  await expect(reps).toHaveAttribute('min', '1');
  // And no max: a bound here would silently rewrite the number he typed. The
  // ceiling is a question he answers, not a clamp.
  expect(await weight.getAttribute('max'), 'no silent clamp on what he types').toBeNull();
});
