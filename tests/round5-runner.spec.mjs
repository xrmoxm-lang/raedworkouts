// Round 5 — the runner, driven the way Raed drives it.
//
// Three confirmed defects, each proved by BREAKING the running app at 390×844
// rather than by reading the source:
//   · finishing a workout cut short deleted it and said nothing was logged;
//   · clearing the weight of a ticked set left the ✓ on a set that counted
//     nowhere;
//   · the fixed rest dock sat on «أنهِ الجلسة» at every scroll position.
import { expect, test } from './_fixtures.mjs';

test.use({ viewport: { width: 390, height: 844 } });

// Boot, pick Raed, start today's session, skip the warm-up. Returns the array
// the spec reads page errors out of.
async function startRunner(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // The fixture fences the whole context; this is the per-spec second fence the
  // suite requires. A probe once wrote a phantom session into his live row.
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto('http://localhost:8877', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await pickRaed(page);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(700);
  return errs;
}

async function pickRaed(page) {
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(800);
}

const readState = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((x) => /\.state\./.test(x) && /raed/i.test(x));
  return JSON.parse(localStorage[key]);
});

test('finishing a workout cut short archives it — it is not «no sets logged»', async ({ page }) => {
  const errs = await startRunner(page);

  // The ordinary shape of a session he had to leave early: real work on the
  // first movements, no single exercise carried to its last set, so
  // `isRunnerExerciseResolved` is false for every one of them. A state he
  // ARRIVES at is seeded, not tapped — the lesson this suite already learned.
  const seeded = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((x) => /\.state\./.test(x) && /raed/i.test(x));
    const profile = JSON.parse(localStorage[key]);
    const active = profile.active_session;
    if (!active) return 0;
    let logged = 0;
    Object.values(active.exercises || {}).slice(0, 3).forEach((entry) => {
      const working = (entry.sets || []).filter((s) => !s.is_warmup);
      (entry.sets || []).filter((s) => s.is_warmup).forEach((s) => { s.completed = true; });
      // Two of three — never the last one, so nothing resolves.
      working.slice(0, 2).forEach((s) => {
        s.weight = 80; s.reps = 10; s.completed = true; s.skipped = false; s.invalid = null;
        logged += 1;
      });
    });
    active.phase = 'lifting';
    localStorage[key] = JSON.stringify(profile);
    return logged;
  });
  expect(seeded, 'the seed must log real working sets').toBeGreaterThan(0);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await pickRaed(page);

  const before = await readState(page);
  const historyBefore = before.history.length;

  // Jump to the last exercise, where the nav's primary IS the finish button.
  await page.evaluate(() => {
    const segs = document.querySelectorAll('.sp-seg');
    segs[segs.length - 1]?.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-finish-session]')?.click());
  await page.waitForTimeout(500);

  const dialog = await page.evaluate(() => ({
    title: document.querySelector('#modal .confirm-head h3')?.textContent || '',
    body: document.querySelector('#modal .confirm-body')?.textContent || '',
    confirm: document.querySelector('#modal [data-confirm-yes]')?.textContent || '',
  }));
  // The app must not claim nothing was logged while it is holding six sets.
  expect(dialog.body, `dialog said «${dialog.body}»`).not.toContain('لم تُسجَّل أي مجموعة');
  expect(dialog.confirm, `affirmative button read «${dialog.confirm}»`).not.toBe('تجاهل الجلسة');

  await page.evaluate(() => document.querySelector('#modal [data-confirm-yes]')?.click());
  await page.waitForTimeout(900);

  const after = await readState(page);
  expect(after.history.length, 'the session must reach history').toBe(historyBefore + 1);
  expect(after.active_session).toBeNull();
  const archived = after.history[after.history.length - 1];
  expect(archived.stats.sets, 'every logged set must be counted').toBe(seeded);
  expect(archived.stats.volume_kg).toBe(seeded * 80 * 10);
  expect(errs).toEqual([]);
});

test('clearing the weight of a ticked set takes the ✓ with it', async ({ page }) => {
  const errs = await startRunner(page);

  // Ramp rows first — the app refuses a working set while a ramp above it is open.
  await page.evaluate(() => {
    document.querySelectorAll('[data-set-kind="warmup"] .set-check').forEach((b) => b.click());
  });
  await page.waitForTimeout(500);

  // Working set 1: 80 × 12, ticked.
  await page.evaluate(() => {
    const row = document.querySelectorAll('[data-set-kind="working"]')[0];
    const [w, r] = row.querySelectorAll('input');
    w.value = '80'; w.dispatchEvent(new Event('input', { bubbles: true }));
    r.value = '12'; r.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    document.querySelectorAll('[data-set-kind="working"]')[0].querySelector('.set-check').click();
  });
  await page.waitForTimeout(600);

  const ticked = await page.evaluate(() => {
    const row = document.querySelectorAll('[data-set-kind="working"]')[0];
    return { cls: row.className, check: row.querySelector('.set-check').textContent.trim() };
  });
  expect(ticked.cls, 'the set must actually be ticked first').toContain('done');
  expect(ticked.check).toBe('✓');

  // The field select-alls on focus, so select-then-delete is exactly the gesture
  // the app invites when he goes back to correct a load.
  await page.evaluate(() => {
    const row = document.querySelectorAll('[data-set-kind="working"]')[0];
    const w = row.querySelector('input');
    w.focus();
    w.value = '';
    w.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(700);  // past the 400ms persist debounce

  const cleared = await page.evaluate(() => {
    const row = document.querySelectorAll('[data-set-kind="working"]')[0];
    return {
      cls: row.className,
      check: row.querySelector('.set-check').textContent.trim(),
      pressed: row.querySelector('.set-check').getAttribute('aria-pressed'),
      weightBox: row.querySelector('input').value,
    };
  });
  // A set that counts nowhere may not keep showing as logged.
  expect(cleared.cls, `row still read «${cleared.cls}»`).not.toContain('done');
  expect(cleared.check, 'the ✓ must go with the number').toBe('');
  expect(cleared.pressed).toBe('false');
  // And it must not have taken the caret or the box's contents with it.
  expect(cleared.weightBox).toBe('');

  const model = await readState(page);
  const set = Object.values(model.active_session.exercises)
    .flatMap((e) => e.sets).find((s) => !s.is_warmup && s.weight === '');
  expect(set, 'the cleared set must still exist in the model').toBeTruthy();
  expect(set.completed, 'and it must no longer be marked completed').toBe(false);
  expect(errs).toEqual([]);
});

test('resting never covers the nav, and the countdown follows him off the runner', async ({ page }) => {
  const errs = await startRunner(page);

  // The last exercise, where the nav's primary is «أنهِ الجلسة» — his «آخر عدة».
  await page.evaluate(() => {
    const segs = document.querySelectorAll('.sp-seg');
    segs[segs.length - 1]?.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.querySelectorAll('[data-set-kind="warmup"] .set-check').forEach((b) => b.click());
  });
  await page.waitForTimeout(500);

  // Tick every working set, answering the final-set effort picker when it opens.
  const rows = await page.evaluate(() => document.querySelectorAll('[data-set-kind="working"]').length);
  for (let i = 0; i < rows; i += 1) {
    await page.evaluate((idx) => {
      const row = document.querySelectorAll('[data-set-kind="working"]')[idx];
      const [w, r] = row.querySelectorAll('input');
      w.value = '80'; w.dispatchEvent(new Event('input', { bubbles: true }));
      r.value = '10'; r.dispatchEvent(new Event('input', { bubbles: true }));
    }, i);
    await page.waitForTimeout(200);
    await page.evaluate((idx) => {
      document.querySelectorAll('[data-set-kind="working"]')[idx]?.querySelector('.set-check')?.click();
    }, i);
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      document.querySelector('.effort-strip:not([hidden]) .effort-picker button')?.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate((idx) => {
      document.querySelectorAll('[data-set-kind="working"]')[idx]?.querySelector('.set-check:not(.checked)')?.click();
    }, i);
    await page.waitForTimeout(350);
  }

  // Round 6 (2026-09-25): the row and the dock are retired for ONE floating
  // 56px clock he parks himself (`#session-clock`, ui/clock.js). What this test
  // pins is unchanged from round 5: at the moment he ticks his last set, nothing
  // sits on either nav button — not a rest surface, not the tab bar.
  const measure = () => page.evaluate(() => {
    const nav = document.querySelector('.runner-nav');
    const clock = document.getElementById('session-clock');
    const tab = document.querySelector('.tab-bar').getBoundingClientRect();
    return {
      resting: document.body.classList.contains('resting'),
      scrollY: Math.round(window.scrollY),
      clockShown: Boolean(clock) && !clock.hidden,
      clockTime: clock?.querySelector('.rt-time')?.textContent || null,
      legacy: document.querySelectorAll('#rest-timer, [data-rest-inline]').length,
      tabTop: Math.round(tab.top),
      maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight),
      buttons: [...(nav?.querySelectorAll('button') || [])].map((b) => {
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          label: b.textContent.trim(),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          hit: hit ? `${hit.tagName}.${hit.className}` : 'none',
          hitIsRest: Boolean(hit && hit.closest('[data-rest-surface]')),
          hitIsSelf: Boolean(hit && (hit === b || b.contains(hit))),
        };
      }),
    };
  });

  const at0 = await measure();
  expect(at0.resting, 'ticking the last working set must start the rest').toBe(true);
  expect(at0.clockShown, 'the floating clock must be showing').toBe(true);
  expect(at0.clockTime, 'and counting the rest down').toMatch(/^\d{1,2}:\d{2}$/);
  expect(at0.legacy, 'the round-5 row and dock must be gone').toBe(0);
  const finish = at0.buttons.find((b) => /أنهِ الجلسة/.test(b.label));
  expect(finish, 'the last exercise must offer the finish button').toBeTruthy();

  // The defect, at the scroll position he is actually at — he has not scrolled,
  // he has just ticked his last set. Nothing may be on top of either button.
  expect(at0.buttons.every((b) => !b.hitIsRest),
    `at scrollY ${at0.scrollY} the nav hit-tested to ${JSON.stringify(at0.buttons.map((b) => b.hit))}`).toBe(true);
  expect(at0.buttons.every((b) => b.hitIsSelf),
    `at scrollY ${at0.scrollY} the nav hit-tested to ${JSON.stringify(at0.buttons.map((b) => b.hit))}`).toBe(true);
  expect(Math.max(...at0.buttons.map((b) => b.bottom)),
    `nav bottom vs tab top ${at0.tabTop} at scrollY ${at0.scrollY}`).toBeLessThanOrEqual(at0.tabTop);

  // …and at the bottom of the page, where the button must be genuinely tappable.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const atMax = await measure();
  expect(atMax.buttons.every((b) => !b.hitIsRest),
    `at max scroll the nav hit-tested to ${JSON.stringify(atMax.buttons.map((b) => b.hit))}`).toBe(true);
  const finishAtMax = atMax.buttons.find((b) => /أنهِ الجلسة/.test(b.label));
  expect(finishAtMax.hitIsSelf, `«أنهِ الجلسة» hit-tested to ${finishAtMax.hit}`).toBe(true);
  expect(finishAtMax.bottom, 'and it must sit clear of the tab bar').toBeLessThanOrEqual(atMax.tabTop);
  expect(atMax.clockTime).toMatch(/^\d{1,2}:\d{2}$/);

  // Off the runner the same clock is there — it is how he knows he is still
  // resting. (It never carries the session's elapsed time: Raed 2026-09-25.)
  await page.evaluate(() => { window.location.hash = 'coach'; });
  await page.waitForTimeout(500);
  const onCoach = await page.evaluate(() => {
    const clock = document.getElementById('session-clock');
    return { shown: Boolean(clock) && !clock.hidden, resting: document.body.classList.contains('resting') };
  });
  expect(onCoach.shown, 'the clock must show on every page while a rest runs').toBe(true);
  expect(onCoach.resting).toBe(true);

  // Back to the runner.
  await page.evaluate(() => { window.location.hash = 'home'; });
  await page.waitForTimeout(500);

  // A reload mid-rest resumes on the persisted deadline, on the clock.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await pickRaed(page);
  const resumed = await page.evaluate(() => {
    const clock = document.getElementById('session-clock');
    return {
      resting: document.body.classList.contains('resting'),
      shown: Boolean(clock) && !clock.hidden,
      time: clock?.querySelector('.rt-time')?.textContent || null,
    };
  });
  expect(resumed.resting, 'a reload mid-rest must resume the rest').toBe(true);
  expect(resumed.shown, 'and the clock with it').toBe(true);
  expect(resumed.time).toMatch(/^\d{1,2}:\d{2}$/);

  // Skipping from the clock's pill cancels the one timer: the class, the clock
  // itself and the persisted deadline all go.
  await page.evaluate(() => document.querySelector('#session-clock .sc-disc').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 10, clientY: 10 })));
  await page.evaluate(() => document.querySelector('#session-clock .sc-disc').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 10, clientY: 10 })));
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('[data-clock-skip]')?.click());
  await page.waitForTimeout(400);
  const cancelled = await page.evaluate(() => ({
    resting: document.body.classList.contains('resting'),
    shown: !document.getElementById('session-clock').hidden,
    restend: Object.keys(localStorage).filter((k) => /restend/.test(k)).length,
  }));
  expect(cancelled.resting).toBe(false);
  expect(cancelled.shown, 'no rest → no clock (Raed 2026-09-25)').toBe(false);
  expect(cancelled.restend, 'the persisted deadline must be cleared').toBe(0);
  expect(errs).toEqual([]);
});
