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

// ---- per-set effort ---------------------------------------------------------
//
// 86 of the 104 rows in his programme prescribe DIFFERENT efforts across their
// sets — chest_press_machine is [7, 7, 8] — and the card rendered one word taken
// from `Math.max`. «صعب» sat under a row whose first two sets are prescribed
// «متوسط», so the app was asking for more than the programme does on 83% of what
// he lifts. He feeds those sets back as fatigue, and the deload trigger reads
// fatigue.
test('the card states the effort of each set, not the hardest one', async ({ page }) => {
  await intoSession(page);

  const shown = await page.evaluate(() => {
    const node = document.querySelector('[data-prescribed-effort]');
    return node ? node.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  expect(shown, 'the prescribed effort must be on the card').toBeTruthy();

  const rpe = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const active = JSON.parse(localStorage[key]).active_session;
    const first = Object.values(active.exercises)[0].planned;
    return [first.rpe_set1, first.rpe_set2, first.rpe_set3].filter((v) => Number.isFinite(v));
  });
  const distinct = new Set(rpe).size;
  // The word count follows the prescription: one word when every set shares a
  // target, one per set when they differ.
  const words = shown.split('·').map((w) => w.trim()).filter(Boolean);
  if (distinct > 1) {
    expect(words.length, `RPE ${JSON.stringify(rpe)} must not collapse to one word`).toBe(rpe.length);
    expect(new Set(words).size, 'and the words must actually differ').toBeGreaterThan(1);
  } else {
    expect(words.length, 'identical targets stay one word — repeating it is noise').toBe(1);
  }
});

test('a row whose sets share a target still reads as one word', async ({ page }) => {
  await intoSession(page);
  const counts = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const active = JSON.parse(localStorage[key]).active_session;
    return Object.values(active.exercises).map((ex) => {
      const p = ex.planned;
      const rpe = [p.rpe_set1, p.rpe_set2, p.rpe_set3].filter((v) => Number.isFinite(v));
      return { rpe, distinct: new Set(rpe).size };
    });
  });
  // The programme genuinely contains both shapes; if it ever stops, this test is
  // no longer testing what it claims.
  expect(counts.some((c) => c.distinct > 1), 'this session must contain a varying row').toBe(true);
});

// ---- block-skin controls ----------------------------------------------------
//
// Declining a skin proposal writes block_skin_rejections[block] = true and the
// domain refuses that block forever after. Changing the mapping wrote only the
// suggestion, so the select could display a skin the app had already decided
// never to offer again. And the list was hard-coded [1, 2, 3] while the
// mesocycle gained a fourth block — the deload, the one week whose whole point
// is that it feels different.
test('choosing a block skin again clears an earlier rejection', async ({ page }) => {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (r) => r.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
    if (t) t.click();
  });
  await page.waitForTimeout(900);

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.settings\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    parsed.block_skin_rejections = { 2: true };
    localStorage[key] = JSON.stringify(parsed);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('.tab-bar .tab[data-route="settings"]').click();
  await page.waitForTimeout(600);
  // Advanced lives inside the Preferences disclosure; open everything.
  await page.evaluate(() => document.querySelectorAll('#page-settings details').forEach((d) => { d.open = true; }));
  await page.waitForTimeout(400);

  const selects = page.locator('.block-skin-select select');
  const count = await selects.count();
  // Every block the programme has, not a hard-coded three.
  const blocks = await page.evaluate(() => new Set((window.RW.PROGRAMME.blocks || []).map((b) => b.block)).size);
  expect(count, 'one select per real block, deload included').toBe(blocks);

  await selects.nth(1).selectOption('rukham');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.settings\./.test(k) && /raed/i.test(k));
    return JSON.parse(localStorage[key]);
  });
  expect(after.block_skin_suggestions['2']).toBe('rukham');
  expect(after.block_skin_rejections['2'], 'a new choice is not still vetoed').toBeFalsy();
});

// ---- the global rest override ----------------------------------------------
//
// v15 let the Settings rest drive every exercise. v16 gave all 104 programme
// rows their own `rest_min` from Nippard, so the setting became a fallback that
// almost never fires — and the ability to shorten a whole session went with it.
// It is back as an explicit opt-in: the prescription stays the default.
test('the rest override is off by default, and never shortens a superset', async ({ page }) => {
  await intoSession(page);
  const rows = await plan(page);
  const a1 = rows.find((r) => r.group === 'A1');
  const normal = rows.find((r) => !r.group && r.rest > 0);

  const restFor = (id) => page.evaluate((exId) => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const settingsKey = Object.keys(localStorage).find((k) => /\.settings\./.test(k) && /raed/i.test(k));
    const st = JSON.parse(localStorage[key]);
    const cfg = JSON.parse(localStorage[settingsKey]);
    const planned = st.active_session.exercises[exId].planned;
    const minutes = Number(planned.rest_min);
    if (!Number.isFinite(minutes)) return cfg.rest_seconds;
    if (cfg.rest_override && minutes > 0) return cfg.rest_seconds;
    return Math.round(minutes * 60);
  }, id);

  // Default: the programme's own number.
  expect(await restFor(normal.id)).toBe(Math.round(normal.rest * 60));
  expect(await restFor(a1.id), 'A1 rests zero because the pair is one round').toBe(0);

  // On: everything else follows the setting — the superset does not.
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /\.settings\./.test(x) && /raed/i.test(x));
    const cfg = JSON.parse(localStorage[k]);
    cfg.rest_override = true; cfg.rest_seconds = 60;
    localStorage[k] = JSON.stringify(cfg);
  });
  expect(await restFor(normal.id), 'a normal exercise follows his number').toBe(60);
  expect(await restFor(a1.id), 'a prescribed 0 is an instruction, not a short rest').toBe(0);
});
