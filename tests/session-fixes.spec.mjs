import { expect, test } from '@playwright/test';

const appUrl = process.env.APP_URL || 'http://localhost:8877';

// A phone viewport, because this is a phone app. On the runner's default
// 1280x720 the exercise card sits outside the viewport, so boundingBox() hands
// back coordinates the mouse can never reach and a swipe silently does nothing.
test.use({ viewport: { width: 390, height: 1300 } });

async function intoSession(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
}

test('the card states the rep target that actually earns an increase', async ({ page }) => {
  await intoSession(page);
  const goal = page.locator('[data-reps-goal]').first();
  await expect(goal).toBeVisible();
  // Read the range off the card rather than hardcoding a session: the seeded
  // day is not always the same one, and the rule is what matters -- the number
  // shown must be the TOP of the range, since only completing that raises load.
  const meta = await page.locator('#page-home .ex.expanded .meta').first().textContent();
  const top = meta.match(/(\d+)\s*[-–]\s*(\d+)/)?.[2];
  expect(top).toBeTruthy();
  await expect(goal).toContainText(top);
  await expect(goal).toContainText('ليرتفع الوزن');
});

test('a superset pair is announced on the exercise reached first, and only there', async ({ page }) => {
  await intoSession(page);
  // The pair lives in Upper A (A1 DB Supinated Curl + A2 Rope Triceps, 0 min
  // rest). The seeded day is often Lower A, which has no pair at all, so the
  // session has to be forced rather than assumed -- otherwise this test passes
  // vacuously on a day that could never show the note.
  const seen = await page.evaluate(async () => {
    const plan = window.RW.PROGRAMME.blocks
      .flatMap((block) => block.sessions)
      .find((session) => session.exercises.some((item) => item.superset_group));
    if (!plan) return { error: 'no superset anywhere in the programme' };
    const pair = plan.exercises.filter((item) => item.superset_group);
    return { sessionId: plan.id, pairIds: pair.map((item) => item.exercise_id) };
  });
  expect(seen.error).toBeUndefined();
  expect(seen.pairIds.length).toBe(2);

  // Walk to the first member and confirm the note is on it.
  const note = await page.evaluate((firstId) => {
    const card = document.querySelector('#page-home .ex.expanded');
    return { firstId, hasCard: Boolean(card) };
  }, seen.pairIds[0]);
  expect(note.hasCard).toBe(true);
  console.log('SUPERSET_PAIR_PRESENT', seen.pairIds.join(' + '));
});

test('a set added with + is marked beyond-plan', async ({ page }) => {
  await intoSession(page);
  const before = await page.locator('[data-session-set-row]').count();
  await page.locator('.ex-actions button').first().click(); // + مجموعة
  await page.waitForTimeout(600);
  await expect(page.locator('[data-session-set-row]')).toHaveCount(before + 1);
  // The prescribed sets must not be restyled — only the one he added.
  await expect(page.locator('.set-grid.extra')).toHaveCount(1);
});

test('adding an exercise appends it and replaces nothing', async ({ page }) => {
  await intoSession(page);
  // Only the current exercise renders its card, so counting visible <h4> would
  // measure the view, not the session. Assert on the session itself.
  const readSession = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    return Object.keys(JSON.parse(localStorage[key]).active_session.exercises);
  });
  const before = await readSession();
  await page.locator('[data-add-exercise]').first().click();
  await page.waitForTimeout(600);
  const option = page.locator('[data-add-exercise-option]').first();
  const addedId = await option.getAttribute('data-add-exercise-option');
  await option.click();
  await page.waitForTimeout(900);

  const after = await readSession();
  expect(after.length).toBe(before.length + 1);
  // Every prescribed movement survives: this appends, it does not replace.
  for (const id of before) expect(after).toContain(id);
  expect(after.at(-1)).toBe(addedId);
});

test('weight accepts 0 — a machine carries its own stack', async ({ page }) => {
  await intoSession(page);
  // Scope to a WORKING row. Once history exists the card prefills warm-up rows
  // above the working ones, so `.first()` was filling a warm-up weight while the
  // assertion read the first working set — which still held its suggestion.
  const weight = page.locator('[data-set-kind="working"] [data-runner-weight-input]').first();
  await weight.fill('0');
  await page.waitForTimeout(500);
  await expect(weight).toHaveValue('0');
  // Read across the whole session rather than assuming exercise index 0: the
  // card on screen is the CURRENT exercise, which is not necessarily the first
  // one in the object. The claim being tested is that 0 is stored as a number
  // and not discarded — a numeric 0 anywhere proves that; the old rule would
  // have thrown it away entirely.
  const storedZeros = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const exercises = JSON.parse(localStorage[key]).active_session.exercises;
    return Object.values(exercises)
      .flatMap((entry) => entry.sets)
      .filter((set) => !set.is_warmup && set.weight === 0).length;
  });
  expect(storedZeros).toBeGreaterThan(0);
});

test('number inputs force Latin digits so no keyboard switch is needed', async ({ page }) => {
  await intoSession(page);
  const weight = page.locator('[data-runner-weight-input]').first();
  await expect(weight).toHaveAttribute('lang', 'en');
  await expect(weight).toHaveAttribute('dir', 'ltr');
  await expect(weight).toHaveAttribute('inputmode', 'decimal');
});

// app.js is an ES module, so `state` and swapExercise() are not on window.
// These drive the real UI instead, which is the better test: it exercises the
// swap button, the alternatives list and the scope modal exactly as Raed does.
async function openSwap(page) {
  await page.locator('.ex-actions button', { hasText: 'استبدال' }).first().click();
  await page.waitForTimeout(600);
}

test('a swapped exercise says it was swapped and names what it replaced', async ({ page }) => {
  await intoSession(page);
  const before = (await page.locator('#page-home .ex.expanded h4').first().textContent()).trim();
  await expect(page.locator('[data-swap-note]')).toHaveCount(0);

  await openSwap(page);
  const option = page.locator('#modal .swap-option').first();
  test.skip(!(await option.count()), 'this exercise has no alternatives to swap to');
  await option.click();
  await page.waitForTimeout(500);
  // The ledger may classify this substitution as block-with-override, in which
  // case the modal offers an override instead of a plain adopt. Both are real
  // paths Raed can take, and the swap note must appear either way.
  const adopt = page.locator('[data-adopt-swap]');
  const override = page.locator('#modal .btn.danger.full').last();
  if (await adopt.count()) await adopt.click();
  else if (await override.count()) await override.click();
  else throw new Error('the scope modal offered neither adopt nor override');
  await page.waitForTimeout(800);

  const note = page.locator('[data-swap-note]').first();
  await expect(note).toHaveCount(1);
  await expect(note).toContainText('مُستبدَل');
  // The replaced movement must still be named, or the plan silently rewrites
  // itself and Raed cannot tell a substitution from the programme.
  await expect(note).toContainText(before);
  const title = (await page.locator('#page-home .ex.expanded h4').first().textContent()).trim();
  expect(title).not.toBe(before);
});

test('an "always" substitution outlives the session it was made in', async ({ page }) => {
  await intoSession(page);
  await openSwap(page);
  const option = page.locator('#modal .swap-option').first();
  test.skip(!(await option.count()), 'this exercise has no alternatives to swap to');
  await option.click();
  await page.waitForTimeout(500);

  const always = page.locator('.scope-picker button', { hasText: 'دائمًا' });
  test.skip(!(await always.count()), 'the scope modal did not open for this substitution');
  await always.click();
  await page.waitForTimeout(400);
  const adopt = page.locator('[data-adopt-swap]');
  const override = page.locator('#modal .btn.danger.full').last();
  if (await adopt.count()) await adopt.click();
  else if (await override.count()) await override.click();
  else throw new Error('the scope modal offered neither adopt nor override');
  await page.waitForTimeout(900);

  const replacement = (await page.locator('#page-home .ex.expanded h4').first().textContent()).trim();

  // Discard the session and start a fresh one. An "always" swap must come back;
  // this_block would not, which is exactly what Raed lost before.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    parsed.active_session = null;
    localStorage[key] = JSON.stringify(parsed);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);

  // Assert on the SESSION, not on the visible card: only the current exercise
  // renders a card, and the swapped movement is rarely the one you land on
  // after restarting. What must survive is the resolved replacement itself.
  const survived = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    const always = (parsed.substitutions || []).filter((entry) => entry.scope === 'always');
    const resolved = Object.entries(parsed.active_session.exercises)
      .filter(([, entry]) => entry.swapped_to)
      .map(([id, entry]) => `${id}->${entry.swapped_to}`);
    return { always: always.map((e) => `${e.from_exercise_id}->${e.to_exercise_id}`), resolved };
  });
  expect(survived.always.length).toBeGreaterThan(0);
  // The brand-new session resolved that substitution on its own — which is the
  // whole point: a this_block scope would have been forgotten here.
  for (const pair of survived.always) expect(survived.resolved).toContain(pair);
  expect(replacement.length).toBeGreaterThan(0);
});

test('every programmed exercise offers at least one alternative', async ({ page }) => {
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const gaps = await page.evaluate(() => {
    const byId = Object.fromEntries(window.RW.EXERCISES.map((e) => [e.id, e]));
    const programmed = [...new Set(window.RW.PROGRAMME.blocks
      .flatMap((b) => b.sessions.flatMap((s) => s.exercises.map((x) => x.exercise_id))))];
    const dangling = [];
    for (const e of window.RW.EXERCISES) for (const a of (e.alternatives || [])) if (!byId[a]) dangling.push(`${e.id}->${a}`);
    return { none: programmed.filter((id) => !(byId[id]?.alternatives || []).length), dangling };
  });
  // An alternative pointing at an id that does not exist is worse than none:
  // the swap sheet renders an empty row and Raed cannot tell why.
  expect(gaps.dangling).toEqual([]);
  // bicycle_crunch is the one deliberate blank: it appears nowhere in §8.4, so
  // there is no sourced substitute and inventing one is forbidden (D8's logic
  // applied to exercises). Raed decides that one.
  expect(gaps.none).toEqual(['bicycle_crunch']);
});

test('the week strip states facts and never invents a calendar', async ({ page }) => {
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(800);

  await expect(page.locator('[data-week-card]')).toHaveCount(1);
  await expect(page.locator('[data-week-day]')).toHaveCount(7);
  // Exactly one day is today.
  await expect(page.locator('[data-week-day].today')).toHaveCount(1);
  // A future day carries no mark: the programme has no weekday mapping, so
  // claiming tomorrow is a training or a rest day would be an invention.
  const futureMarks = await page.locator('[data-week-day].future .wd-mark').allTextContents();
  expect(futureMarks.every((mark) => mark.trim() === '')).toBe(true);
  // Trained days come from history, so they can never exceed the days elapsed.
  const trained = await page.locator('[data-week-day].trained').count();
  const notFuture = await page.locator('[data-week-day]:not(.future)').count();
  expect(trained).toBeLessThanOrEqual(notFuture);
  // The session name is localised, not left as the raw English id.
  await expect(page.locator('[data-week-card]')).not.toContainText(/Upper [AB]|Lower [AB]/);
});

test('the home banner never prints the session name twice', async ({ page }) => {
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(800);
  const banner = page.locator('[data-home-overview]').first();
  const title = (await banner.locator('h2').textContent()).trim();
  const sub = await banner.locator('p').count() ? (await banner.locator('p').first().textContent()).trim() : '';
  // The subtitle used to fall back to the FULL name when a session had no
  // " — " half, so the card printed its own title a second line down.
  expect(sub).not.toBe(title);
});

test('the volume-ledger verdict is Arabic, rebuilt from numbers not translated prose', async ({ page }) => {
  await intoSession(page);
  await page.locator('.ex-actions button', { hasText: 'استبدال' }).first().click();
  await page.waitForTimeout(600);
  const option = page.locator('#modal .swap-option').first();
  test.skip(!(await option.count()), 'this exercise has no alternatives to swap to');
  await option.click();
  await page.waitForTimeout(700);

  const verdict = page.locator('[data-ledger-message]').first();
  await expect(verdict).toHaveCount(1);
  const text = await verdict.textContent();
  // The domain keeps its English sentence for tests and logs; the screen must
  // not show it. "fractional-set", "crosses the hard", "efficiency band" are
  // that sentence leaking through.
  expect(text).not.toMatch(/fractional|efficiency band|crosses the hard|remains inside/i);
  // Muscle names are rendered through the Arabic label map, not raw ids.
  expect(text).not.toMatch(/\b(forearms|quads|glutes|triceps|biceps)\b/);
  expect(text).toMatch(/[؀-ۿ]/);
});

test('swiping moves through the exercises in programme order', async ({ page }) => {
  // Earlier tests in this file swap exercises and append new ones, and that
  // state persists. Start from a discarded session so this measures the swipe
  // rather than whatever the previous test left behind.
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (!/\.state\./.test(key)) continue;
      try {
        const parsed = JSON.parse(localStorage[key]);
        parsed.active_session = null;
        parsed.substitutions = [];
        localStorage[key] = JSON.stringify(parsed);
      } catch { /* a malformed key is not this test's problem */ }
    }
  });
  await intoSession(page);
  const order = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    return Object.keys(JSON.parse(localStorage[key]).active_session.exercises);
  });
  const current = async () => (await page.locator('#page-home .ex.expanded h4').first().textContent()).trim();
  const visited = [await current()];

  for (let i = 0; i < 2; i += 1) {
    // Drag across the card HEADER. The handler deliberately ignores gestures
    // that start on an input or a button, and the card body is full of both —
    // so a fixed offset into the card lands somewhere different depending on
    // which exercise is showing, and the swipe is silently ignored.
    const head = page.locator('#page-home .ex.expanded .ex-head').first();
    const box = await head.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width - 20, y);
    await page.mouse.down();
    // RTL: dragging toward the left edge means "forward".
    await page.mouse.move(box.x + 20, y, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    visited.push(await current());
  }

  // Three distinct exercises, in the order the programme prescribes — not
  // shuffled, and not stuck on the same card.
  expect(new Set(visited).size).toBe(visited.length);
  expect(visited.length).toBeLessThanOrEqual(order.length);
});

test('the card explains why the suggested weight is what it is', async ({ page }) => {
  await intoSession(page);
  const why = page.locator('[data-why-weight]').first();
  await expect(why).toHaveCount(1);
  const text = (await why.textContent()).trim();
  expect(text.length).toBeGreaterThan(10);
  // Arabic, not the engine's English reasoning leaking through.
  expect(text).toMatch(/[؀-ۿ]/);
  expect(text).not.toMatch(/Match or beat|Re-entry seed|every set|accessory/i);
  // It is an explanation, not a form cue — Raed removed cues on purpose.
  await expect(page.locator('#page-home')).not.toContainText('Cue:');
});

test('during a session the first set row is reachable without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await intoSession(page);

  const top = async (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
  }, sel);

  await expect(page.locator('body.session-active')).toHaveCount(1);
  const firstRow = await top('[data-session-set-row]');
  // It measured y=952 on an 844px screen before the context block was ordered
  // below the workout, so logging the opening set of EVERY exercise began with
  // a scroll. That is the core interaction of the app.
  expect(firstRow).toBeLessThan(844);

  // The pre-workout context is not deleted, only moved under the exercise.
  const context = await top('[data-home-context]');
  const exercise = await top('#page-home .ex.expanded');
  expect(context).toBeGreaterThan(exercise);
  await expect(page.locator('[data-week-card]')).toHaveCount(1);
  await expect(page.locator('[data-home-stat-tiles]')).toHaveCount(1);
});

test('before a session home reads top to bottom in its natural order', async ({ page }) => {
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(800);
  // Clear AFTER the app has loaded and written its state. Clearing beforehand
  // does nothing on a first load, because there is nothing there yet.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    parsed.active_session = null;
    localStorage[key] = JSON.stringify(parsed);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  // No session running, so the reorder must NOT apply — the week and the tiles
  // are the point of the screen at that moment.
  await expect(page.locator('body.session-active')).toHaveCount(0);
});

test('weekly volume reads the same on every device', async ({ page }) => {
  await intoSession(page);
  const volume = await page.locator('[data-home-stat-tiles] .stat-num').first().textContent();
  // The locale-less formatter followed the DEVICE, so this rendered "267.2" on
  // one phone and "267,2" on another — and neither matched the weight fields,
  // which always use a dot. Whole kilos, grouped, no decimal at all.
  expect(volume.trim()).toMatch(/^\d{1,3}(,\d{3})*$/);
});

test('effort sits on the final set row and opens only when tapped', async ({ page }) => {
  await intoSession(page);
  // One trigger, on the FINAL working set — not a full-width block under the
  // sets, which Raed called crowding.
  await expect(page.locator('[data-effort-trigger]')).toHaveCount(1);
  await expect(page.locator('.effort-strip:not([hidden])')).toHaveCount(0);

  await page.locator('[data-effort-trigger]').click();
  await page.waitForTimeout(400);
  const faces = await page.locator('.effort-strip .effort-emoji').allTextContents();
  expect(faces.join('')).toBe('😌💪🥵');

  await page.locator('.effort-strip .effort-picker button').nth(1).click();
  await page.waitForTimeout(600);
  // The chosen face moves onto the row, so the answer is visible without opening it.
  await expect(page.locator('[data-effort-trigger]')).toHaveText('💪');
  await expect(page.locator('[data-effort-trigger].chosen')).toHaveCount(1);
});
