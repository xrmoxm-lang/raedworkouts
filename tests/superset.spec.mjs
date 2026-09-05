import { expect, test } from '@playwright/test';

// [PPL] E p.27 L:1292-1302, carried into research/06 §«Superset note»:
// «Do not rest after completing the first set of the A1 exercise and move right
// into the first set of the A2 exercise. Then rest for the time period indicated
// in the A2 row.»
//
// Every one of his four sessions ends with an A1/A2 pair, so this is the last two
// exercises of every workout he does. The app printed the instruction on the card
// — «سوبرست — بلا راحة قبل Cable Crunch» — and then left him standing on A1,
// where the next control under his thumb is A1 set 2. The interface prescribed
// the opposite of the note printed on it.

const APP = 'http://localhost:8877';

async function intoSession(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (r) => r.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
    if (t) t.click();
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
}

const plan = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  const active = JSON.parse(localStorage[key]).active_session;
  return Object.entries(active.exercises).map(([id, st], i) => ({
    i, id, group: st.planned?.superset_group || null, rest: st.planned?.rest_min,
  }));
});

const focused = (page) => page.evaluate(() => document.querySelector('.ex-info h4, .ex h4')?.textContent?.trim());

async function goTo(page, index) {
  for (let i = 0; i < index; i += 1) {
    await page.evaluate(() => [...document.querySelectorAll('.runner-nav .btn.primary')]
      .find((b) => !/أنهِ|إنهاء/.test(b.textContent))?.click());
    await page.waitForTimeout(320);
  }
}

// Warm-ups are per-movement, not part of the alternation. They have to be out of
// the way or the next tick is a RAMP set — and the rule deliberately ignores
// those, so the test would exercise nothing. That is exactly how the second test
// below first passed against a mutation that deleted the rule's own guard.
async function clearRamps(page) {
  await page.evaluate(async () => {
    for (const grid of document.querySelectorAll('.set-grid')) {
      if (!grid.closest('[data-set-kind="warmup"]')) continue;
      const check = grid.querySelector('.set-check');
      if (!check || check.classList.contains('checked')) continue;
      check.click();
      await new Promise((r) => setTimeout(r, 150));
    }
  });
  await page.waitForTimeout(500);
}

// Ticks the first unfinished working set on screen.
async function logOneWorkingSet(page) {
  await page.evaluate(async () => {
    for (const row of document.querySelectorAll('.set-grid')) {
      const check = row.querySelector('.set-check');
      if (!check || check.classList.contains('checked')) continue;
      const inputs = [...row.querySelectorAll('input')];
      if (inputs.length >= 2) {
        inputs[0].value = '10'; inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].value = '10'; inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, 150));
      check.click();
      return;
    }
  });
  await page.waitForTimeout(800);
}

test('a set of A1 sends him straight into A2, and A2 sends him back', async ({ page }) => {
  await intoSession(page);
  const rows = await plan(page);
  const a1 = rows.find((r) => r.group === 'A1');
  const a2 = rows.find((r) => r.group === 'A2');
  expect(a1, 'every session in this programme ends with an A1/A2 pair').toBeTruthy();
  expect(a2).toBeTruthy();
  // The source's own rest rule for the pair, already in data.js.
  expect(a1.rest, 'no rest is prescribed after A1').toBe(0);
  expect(a2.rest, 'the rest of the round is the A2 row').toBeGreaterThan(0);

  await goTo(page, a1.i);
  const onA1 = await focused(page);
  expect(onA1).toBeTruthy();

  await clearRamps(page);

  await logOneWorkingSet(page);
  const afterA1 = await focused(page);
  expect(afterA1, 'a working set of A1 must move him to A2').not.toBe(onA1);

  // ...and completing A2's set brings him back for the next round.
  await logOneWorkingSet(page);
  const afterA2 = await focused(page);
  expect(afterA2, 'A2 returns him to A1 for the next round').toBe(onA1);
});

test('the alternation stops once the partner owes nothing', async ({ page }) => {
  await intoSession(page);
  const rows = await plan(page);
  const a1 = rows.find((r) => r.group === 'A1');
  const a2 = rows.find((r) => r.group === 'A2');

  // A2 is already finished. Ticking A1 must then leave him where he is rather
  // than bouncing him onto a card with nothing left to do on it.
  await page.evaluate((id) => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    for (const set of parsed.active_session.exercises[id].sets) set.completed = true;
    localStorage[key] = JSON.stringify(parsed);
  }, a2.id);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  await goTo(page, a1.i);
  await clearRamps(page);
  const before = await focused(page);
  await logOneWorkingSet(page);
  expect(await focused(page), 'nothing owed on A2, so stay put').toBe(before);
});
