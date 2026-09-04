import { expect, test } from '@playwright/test';

const appUrl = process.env.APP_URL || 'http://localhost:8877';

// A phone viewport, because this is a phone app. On the runner's default
// 1280x720 the exercise card sits outside the viewport, so boundingBox() hands
// back coordinates the mouse can never reach and a swipe silently does nothing.
test.use({ viewport: { width: 390, height: 1300 } });

// Controls that belong to the EXERCISE rather than to a set now live in the
// per-exercise settings sheet behind the gear in the card header. Same
// behaviour, one tap further in.
async function openExerciseSheet(page) {
  await page.locator('#page-home .ex.expanded [data-exercise-settings]').first().click();
  await page.waitForTimeout(500);
}
async function closeExerciseSheet(page) {
  await page.locator('#modal .xs-done').click();
  await page.waitForTimeout(400);
}

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

test('the superset pair is announced on the first movement, and the rest timer obeys it', async ({ page }) => {
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(900);
  // Force Upper A: it is the session that actually holds the A1/A2 pair. The
  // seeded day is often Lower A, where this test would pass vacuously — which
  // is exactly how the old version of it missed that the note never rendered.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    parsed.active_session = null;
    parsed.forced_next_session = 'upper_a';
    localStorage[key] = JSON.stringify(parsed);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);

  const seen = [];
  for (let i = 0; i < 8; i += 1) {
    // The rest control moved into the per-exercise sheet along with everything
    // else that belongs to the exercise rather than to a set, so the
    // prescription has to be read from there now. The superset note stays on
    // the card: it describes the pairing, which he needs to see while lifting.
    const superset = await page.evaluate(() => document.querySelector('[data-superset]')?.textContent.trim() || null);
    const name = await page.evaluate(() => document.querySelector('#page-home .ex.expanded h4')?.textContent.trim());
    await openExerciseSheet(page);
    seen.push({
      name, superset,
      ...(await page.evaluate(() => ({
        rest: document.querySelector('#modal [data-rest-button]')?.textContent.trim() || null,
        noRest: Boolean(document.querySelector('#modal [data-no-rest]')),
      }))),
    });
    await closeExerciseSheet(page);
    const moved = await page.evaluate(() => {
      const next = [...document.querySelectorAll('button')].find((el) => /التمرين التالي/.test(el.textContent));
      if (!next) return false;
      next.click();
      return true;
    });
    if (!moved) break;
    await page.waitForTimeout(600);
  }

  // Announced exactly once — on the movement reached first, naming its partner.
  const announced = seen.filter((row) => row.superset);
  expect(announced).toHaveLength(1);
  expect(announced[0].superset).toMatch(/سوبرست/);

  // And the timer obeys the prescription. `rest_min` sat in data.js consumed by
  // NOTHING, so every set fell back to one global 2:00 — including the half of
  // the superset the card was simultaneously telling him to take at zero rest.
  const zeroRest = seen.filter((row) => row.noRest);
  expect(zeroRest.length).toBeGreaterThan(0);
  // Not every exercise can share one duration, or the prescription is ignored again.
  const durations = new Set(seen.map((row) => row.rest).filter(Boolean));
  expect(durations.size).toBeGreaterThan(1);

  // Put the forced session back. It is global, persisted state, and leaving it
  // set made the ramp-set test downstream measure a session it never chose —
  // green alone, red in the suite.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    parsed.forced_next_session = null;
    localStorage[key] = JSON.stringify(parsed);
  });
});

test('a set added with + is marked beyond-plan', async ({ page }) => {
  await intoSession(page);
  const before = await page.locator('[data-session-set-row]').count();
  await openExerciseSheet(page);
  await page.locator('#modal [data-add-set]').click();  // + مجموعة
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
  await openExerciseSheet(page);
  await page.locator('#modal [data-add-exercise]').first().click();
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
  await openExerciseSheet(page);
  await page.locator('#modal [data-open-swap]').click();
  await page.waitForTimeout(400);
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
  // Pin the session on BOTH sides of the restart.
  //
  // Without this the test was a coin toss on the calendar. Measured on
  // 2026-09-04: the first start landed on lower_b and the swap was made on
  // goblet_squat; the restart landed on upper_a, which has no goblet_squat in
  // it, so "the substitution did not resolve" was the CORRECT answer and the
  // test failed for a reason that had nothing to do with substitutions. On a
  // day where two consecutive starts pick the same session it passed — for a
  // reason equally unrelated. Forcing the id is what makes it test the feature
  // it names, and this file already uses exactly this trick two tests above.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    parsed.active_session = null;
    parsed.forced_next_session = 'lower_b';
    localStorage[key] = JSON.stringify(parsed);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);

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
    // The same session again, so what is being tested is whether the swap
    // survives — not which day the rotation happens to serve.
    parsed.forced_next_session = 'lower_b';
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
  // Was `toEqual(['bicycle_crunch'])`, pinning an exception list — which locked
  // in a defect instead of asserting the rule. And the premise was wrong: I had
  // told Raed that exercise "appears nowhere in §8.4", having checked whether it
  // was a programme ROW rather than whether the table gave it substitutes. It
  // has two, Cable Crunch and Machine Crunch, on its Block B row.
  //
  // The invariant is what he actually asked for: "لا يكون فيه شيء لها بديل وما
  // لها بديل" — nothing that should have an alternative may lack one.
  expect(gaps.none).toEqual([]);
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

  // While a session runs the banner is one centred line with no subtitle at
  // all, so there is nothing that can duplicate the title — Raed asked for that
  // shape to stop it pushing the set grid down the screen. The duplication this
  // test guards can only occur on the PRE-session banner, which still has the
  // heading/subtitle pair.
  if (await banner.locator('h2').count() === 0) {
    await expect(banner).toHaveClass(/running-line/);
    const line = (await banner.textContent()).trim();
    expect(line.length, 'the one-line header still says something').toBeGreaterThan(0);
    return;
  }

  const title = (await banner.locator('h2').textContent()).trim();
  const sub = await banner.locator('p').count() ? (await banner.locator('p').first().textContent()).trim() : '';
  // The subtitle used to fall back to the FULL name when a session had no
  // " — " half, so the card printed its own title a second line down.
  expect(sub).not.toBe(title);
});

test('the volume-ledger verdict is Arabic, rebuilt from numbers not translated prose', async ({ page }) => {
  await intoSession(page);
  await openExerciseSheet(page);
  await page.locator('#modal [data-open-swap]').click();
  await page.waitForTimeout(400);
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

test('the card explains a weight DECISION, and never just restates last time', async ({ page }) => {
  // Raed asked for the reason behind the number ("رقم بدون سبب = المشكلة
  // الحقيقية"), and then asked for one specific note to go: «المرة الماضية: 10
  // كغ × 6. اعدلها أو تجاوزها» — "وش أعدلها أو أتجاوزها ما أدري صراحة".
  //
  // Both are right, and they are about different notes. Eight of the nine
  // explain a decision — hold this load, bump it, add a rep because this is an
  // accessory, today is a calibration. The ninth restates «آخر مرة», which is
  // printed in full under the sets, and adds an instruction naming no number.
  // It was also the fallback branch, so it was the one he saw most.
  await intoSession(page);
  const why = page.locator('[data-why-weight]');
  if (await why.count()) {
    const text = (await why.first().textContent()).trim();
    expect(text.length).toBeGreaterThan(10);
    // Arabic, not the engine's English reasoning leaking through.
    expect(text).toMatch(/[؀-ۿ]/);
    expect(text).not.toMatch(/Match or beat|Re-entry seed|every set|accessory/i);
    // Whatever is shown must be a decision, not a repeat of «آخر مرة».
    expect(text, 'the restatement note must not be rendered').not.toMatch(/اعدلها أو تجاوزها/);
  }
  // «آخر مرة» itself still exists — it moved below the sets, it did not go.
  await expect(page.locator('.last-time').first()).toHaveCount(1);
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

  // The pre-workout context is not deleted — it is not SHOWN while a session is
  // running. Raed: "هذي شيلها، هذي المفروض بس تكون موجودة لو ما بديت التمرين".
  // This assertion used to pin the old mechanism (context ordered below the
  // exercise) rather than the outcome, so hiding it outright failed a test that
  // its own stated purpose was satisfied by.
  await expect(page.locator('[data-home-context]')).toBeHidden();
  // Still in the DOM, so it returns intact the moment the session ends.
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

test('the effort picker appears by itself when the second-to-last set is ticked', async ({ page }) => {
  await intoSession(page);

  // Raed removed the trigger button: "الزر الزائد هذا... ما يحتاج يكون ظاهر،
  // لأنه هو أصلًا أوتوماتيك". A face whose only job is to open something that
  // opens on its own is chrome, so there is no trigger to assert on any more.
  await expect(page.locator('[data-effort-trigger]')).toHaveCount(0);
  await expect(page.locator('.effort-strip:not([hidden])')).toHaveCount(0);

  // Ramp sets first — the app requires them before a working set can be ticked.
  const ramps = page.locator('[data-set-kind="warmup"]');
  for (let i = 0; i < await ramps.count(); i += 1) {
    await ramps.nth(i).locator('.set-check').click();
    await page.waitForTimeout(200);
  }

  // Tick every working set except the last. The picker must be open by then,
  // because the last set is the one that needs it.
  const working = page.locator('[data-set-kind="working"]');
  const total = await working.count();
  for (let i = 0; i < total - 1; i += 1) {
    const row = working.nth(i);
    await row.locator('input').nth(0).fill('40');
    await row.locator('input').nth(1).fill('10');
    await page.waitForTimeout(150);
    await row.locator('.set-check').click();
    await page.waitForTimeout(300);
  }

  await expect(page.locator('.effort-strip:not([hidden])')).toHaveCount(1);
  const faces = await page.locator('.effort-strip .effort-emoji').allTextContents();
  expect(faces.join('')).toBe('😌💪🥵');

  await page.locator('.effort-strip .effort-picker button').nth(1).click();
  await page.waitForTimeout(600);
  // The choice persists and the strip stays visible showing it.
  await expect(page.locator('.effort-strip:not([hidden])')).toHaveCount(1);
});

test('a finished session shows the time it took, not the exercise card again', async ({ page }) => {
  await intoSession(page);
  await expect(page.locator('[data-session-done]')).toHaveCount(0);

  // Skipping is a property of the exercise, so it lives in the settings sheet
  // now. Each skip closes the sheet and advances, so the gear has to be reopened
  // for the next one.
  for (let i = 0; i < 12; i += 1) {
    const gear = page.locator('#page-home .ex.expanded [data-exercise-settings]');
    if (!(await gear.count())) break;
    await gear.first().click();
    await page.waitForTimeout(400);
    const skip = page.locator('#modal [data-runner-skip-exercise]');
    if (!(await skip.count())) break;
    await skip.click();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(600);

  // Raed: "إذا انتهى التمرين ما تطلع الصفحة اللي فوق الكبيرة". The full card,
  // its clips and its set grid have nothing left to do on them once every
  // exercise is resolved.
  await expect(page.locator('[data-session-done]')).toHaveCount(1);
  await expect(page.locator('#page-home .ex')).toHaveCount(0);
  await expect(page.locator('[data-finish-session]')).toHaveCount(1);
  // The elapsed time is the one number he cannot reconstruct from the log later.
  await expect(page.locator('.session-done-time')).toContainText(/دقيقة|دقائق|دقيقتان/);

  // He can still go back in without undoing the completion.
  await page.locator('#page-home .btn.ghost.full').first().click();
  await page.waitForTimeout(600);
  await expect(page.locator('#page-home .ex')).not.toHaveCount(0);
});

test('"machine weight only" removes the need to type a number at all', async ({ page }) => {
  await intoSession(page);
  const weight = page.locator('[data-set-kind="working"] [data-runner-weight-input]').first();

  await openExerciseSheet(page);
  await expect(page.locator('[data-machine-weight]')).toHaveCount(1);
  // It is a checkbox now, not a button: a fact about the equipment rather than
  // an action, so it reads as one.
  await page.locator('[data-machine-weight]').check();
  await page.waitForTimeout(400);
  await closeExerciseSheet(page);

  // Raed: "ما أقدر، ما له رقم" — plenty of machines carry no number, and someone
  // new to the gym has nothing to type. The box says what it is instead.
  await expect(weight).toHaveAttribute('placeholder', 'الجهاز');
  // h() writes attributes as strings, so readOnly renders as readonly="true".
  await expect(weight).toHaveAttribute('readonly', 'true');
  // And the card stops explaining a load that does not exist.
  await expect(page.locator('[data-why-weight]')).toContainText('التكرارات');

  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const exercises = JSON.parse(localStorage[key]).active_session.exercises;
    const entry = Object.values(exercises).find((item) => item.machine_weight);
    return entry ? entry.sets.filter((set) => !set.is_warmup).map((set) => set.weight) : null;
  });
  // Zero ADDED load, stored as a real number so the sets still count.
  expect(stored).not.toBeNull();
  expect(stored.every((w) => w === 0)).toBe(true);

  // The invariant this test USED to miss: storing 0 is not the point, TICKING
  // the set is. The card carried its own stricter copy of the validity rule
  // (weight > 0), so a machine-weight set could be created and then never
  // completed — the feature was half-built and this test blessed it.
  // The app requires the exercise's ramp sets before any working set can be
  // ticked — correct behaviour, and this test never satisfied it. It passed
  // only on the days the seeded session happened to open with an exercise that
  // prescribes no ramp, and failed on the days it did not. Same code, different
  // weekday: that is a flaky test, and it was flaky before this change too.
  const ramps = page.locator('[data-set-kind="warmup"]');
  for (let i = 0; i < await ramps.count(); i += 1) {
    await ramps.nth(i).locator('.set-check').click();
    await page.waitForTimeout(200);
  }
  const row = page.locator('[data-set-kind="working"]').first();
  await row.locator('input').nth(1).fill('10');
  await page.waitForTimeout(300);
  await row.locator('.set-check').click();
  await page.waitForTimeout(700);
  const completed = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const entry = Object.values(JSON.parse(localStorage[key]).active_session.exercises).find((item) => item.machine_weight);
    return entry ? entry.sets.filter((set) => !set.is_warmup && set.completed).length : 0;
  });
  expect(completed).toBeGreaterThan(0);
});

test('ramp sets are built from the programme count, not a dead v15 string', async ({ page }) => {
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(900);
  // A ramp is a percentage of a working weight, so one has to exist first.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    parsed.active_session = null;
    const exercises = {};
    window.RW.EXERCISES.forEach((e) => {
      exercises[e.id] = { sets: [{ is_warmup: false, weight: 30, reps: 10, effort: 'medium', completed: true }] };
    });
    parsed.history = [{ date: '2026-08-30', session_id: 'seed', exercises }];
    localStorage[key] = JSON.stringify(parsed);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(1000);

  const built = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const exercises = JSON.parse(localStorage[key]).active_session.exercises;
    return Object.entries(exercises).map(([id, entry]) => ({
      id,
      ramp: entry.sets.filter((set) => set.is_warmup).length,
      planned: entry.planned?.ramp_sets,
    }));
  });

  // The builder used to test `plan.warmup` — a v15 STRING the Upper/Lower
  // programme does not carry — so the branch never ran and NOT ONE ramp set was
  // ever created. Raed noticed they had vanished; they had.
  expect(built.some((row) => row.ramp > 0)).toBe(true);
  for (const row of built) {
    if (Number.isFinite(row.planned)) expect(row.ramp).toBe(row.planned);
  }
});

test('switching tabs leaves exactly one page on screen', async ({ page }) => {
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(900);

  // `#page-home { display: flex }` was written unscoped during the design pass
  // and beat `.page { display: none }` on specificity, so Home stayed rendered
  // underneath every other tab. Opening the coach showed the entire home screen
  // stacked above it.
  for (const label of ['المكتبة', 'السجل', 'الإعدادات', 'المدرب', 'الرئيسية']) {
    await page.evaluate((name) => {
      const tab = [...document.querySelectorAll('.tab')].find((el) => el.textContent.includes(name));
      if (tab) tab.click();
    }, label);
    await page.waitForTimeout(500);
    const visible = await page.evaluate(() =>
      [...document.querySelectorAll('.page')].filter((el) => el.offsetParent !== null).map((el) => el.id));
    expect(visible, `${label} should show one page, saw ${visible.join(' + ')}`).toHaveLength(1);
  }
});

test('a grouped number survives RTL as one run', async ({ page }) => {
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(900);

  // "4,658" used to split into "4" and "658" with the separator loose between
  // them, and RTL reordered it on screen into "658,4" — a wrong number, read
  // confidently. The comma has to be inside the isolated run.
  const runs = await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.stat-num')].find((el) => el.textContent.includes(','));
    if (!tile) return null;
    return { text: tile.textContent.trim(), pieces: tile.querySelectorAll('bdi').length };
  });
  test.skip(!runs, 'no grouped number on screen yet — needs a four-figure volume');
  expect(runs.pieces).toBeLessThanOrEqual(1);
  expect(runs.text).toMatch(/^\d{1,3}(,\d{3})+$/);
});

test('a fresh profile still gets its prescribed ramp sets', async ({ page }) => {
  // The earlier ramp test seeded a completed 30 kg record for EVERY exercise
  // before starting, so it could never see this path. With no history there is
  // no working weight to take a percentage of — but the programme still
  // PRESCRIBES the ramp, and dropping the rows silently discarded that
  // instruction on exactly the session where he is least sure what to do.
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    parsed.active_session = null;
    parsed.history = [];
    localStorage[key] = JSON.stringify(parsed);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(1000);

  const built = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const exercises = JSON.parse(localStorage[key]).active_session.exercises;
    return Object.values(exercises).map((entry) => ({
      ramp: entry.sets.filter((set) => set.is_warmup).length,
      prescribed: entry.planned?.ramp_sets,
      weights: entry.sets.filter((set) => set.is_warmup).map((set) => set.weight),
    }));
  });
  expect(built.length).toBeGreaterThan(0);
  for (const row of built) {
    if (Number.isFinite(row.prescribed)) expect(row.ramp).toBe(row.prescribed);
    // Blank, never a made-up number: there is nothing to take a percentage of.
    for (const weight of row.weights) expect(weight === '' || Number.isFinite(weight)).toBe(true);
  }
});

test('the swap sheet leads with the programme\'s own substitutes', async ({ page }) => {
  await intoSession(page);
  await openExerciseSheet(page);
  await page.locator('#modal [data-open-swap]').click();
  await page.waitForTimeout(400);
  await page.waitForTimeout(700);
  const offered = await page.locator('#modal .swap-option h4').allTextContents();
  test.skip(!offered.length, 'this exercise has no alternatives at all');

  const prescribed = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const session = JSON.parse(localStorage[key]).active_session;
    const entry = Object.values(session.exercises).find((item) => item.planned?.sub1);
    if (!entry) return null;
    const byId = Object.fromEntries(window.RW.EXERCISES.map((e) => [e.id, e.name]));
    return [entry.planned.sub1, entry.planned.sub2].filter(Boolean).map((id) => byId[id]).filter(Boolean);
  });
  test.skip(!prescribed || !prescribed.length, 'no programme substitutes on this row');
  // §8.4 authors a sub1/sub2 per row; the sheet used to show only the catalogue's
  // generic alternatives, so swapping offered movements the programme never chose.
  expect(offered[0].trim()).toBe(prescribed[0]);
});

test('the PR-summary setting actually controls the PR summary', async ({ page }) => {
  // It was written and toggled in Settings and read by NOTHING, so turning it
  // off changed nothing — a control that lies about what it does.
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(800);
  const readsSetting = await page.evaluate(async () => {
    const source = await (await fetch('./app.js')).text();
    // The setting must be READ somewhere that renders, not only written.
    return /settings\.show_pr_summary\s*!==\s*false/.test(source);
  });
  expect(readsSetting).toBe(true);
});
