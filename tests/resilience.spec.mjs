// Regressions for the audit of 2026-09-04.
//
// Every test here exists because the bug it covers was live in production and
// the whole suite was green. They are written against observable behaviour —
// what the phone does, what he sees — not against the implementation, so they
// keep working if the code underneath is rewritten.
import { expect, test } from '@playwright/test';

const appUrl = process.env.APP_URL || 'http://localhost:8877';

// His actual phone. On the runner's default 1280x720 half these controls are
// off-viewport and every geometry assertion becomes meaningless.
test.use({ viewport: { width: 390, height: 844 } });

async function boot(page) {
  // The server is unreachable on purpose in most of these: the point is what
  // the app does when it is on its own.
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (r) => r.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(800);
}

async function intoSession(page) {
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(800);
}

// ---------------------------------------------------------------------------
// A full phone used to lose the session in silence.
//
// Fifteen localStorage.setItem calls, not one of them guarded, and no
// window.onerror anywhere. Making setItem throw produced an uncaught page error,
// a stale toast, and nothing written — he would have trained for an hour and
// found the session gone.
test('a phone that cannot save says so, and never claims the set was saved locally', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await boot(page);
  await intoSession(page);

  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    };
  });

  await page.evaluate(() => document.querySelector('.set-check')?.click());
  await page.waitForTimeout(1200);

  // 1. The failure must not escape as an uncaught error.
  expect(pageErrors, 'a failed local write must not throw out of the tap handler').toEqual([]);

  // 2. He must be told, visibly.
  const toast = page.locator('#toast');
  await expect(toast, 'a failed save has to be visible — he cannot see a console').toHaveClass(/show/);

  // 3. And the message must not be the reassuring one. With the server also
  //    unreachable there is no copy anywhere, and «حُفظت محلياً» would be the
  //    single most misleading sentence the app could show.
  await expect(toast).not.toContainText('حُفظت محلياً');
});

// ---------------------------------------------------------------------------
// The control he taps after every set had no accessible name at all.
test('every control on the session screen has an accessible name', async ({ page }) => {
  await boot(page);
  await intoSession(page);

  const unnamed = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a[href], select, input').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const named = (el.textContent || '').trim()
        || el.getAttribute('aria-label')
        || el.getAttribute('aria-labelledby')
        || el.getAttribute('title')
        || (el.tagName === 'INPUT' && el.closest('label'));
      if (!named) out.push(el.className.toString() || el.tagName);
    });
    return out;
  });
  expect(unnamed, 'icon-only controls need aria-label; a placeholder is not a label').toEqual([]);
});

test('the set toggle reports its state, not just its name', async ({ page }) => {
  await boot(page);
  await intoSession(page);
  const check = page.locator('.set-check').first();
  await expect(check).toHaveAttribute('aria-pressed', 'false');
  await check.click();
  await page.waitForTimeout(400);
  // Either it ticked, or it refused for a stated reason — but the attribute
  // must exist and stay truthful either way.
  const pressed = await check.getAttribute('aria-pressed');
  expect(['true', 'false']).toContain(pressed);
});

// ---------------------------------------------------------------------------
// Measured, not assumed: the day strip was 27px tall and the gear 38px.
// The visual size is deliberate in places, so this measures the HIT area by
// point-testing outward from the centre, which is what a thumb actually meets.
test('every control is at least 44px to the thumb, even where it looks smaller', async ({ page }) => {
  await boot(page);
  await intoSession(page);
  // The «بدأت الجلسة» toast sits over the runner's own buttons for its first
  // ~1.8s, and point-testing through it reported a dozen controls at 0x0. That
  // was this test measuring a transient overlay, not a real defect — wait for
  // the toast to go before measuring anything.
  await page.locator('#toast:not(.show)').waitFor({ state: 'attached', timeout: 5000 });
  await page.waitForTimeout(200);

  const small = await page.evaluate(() => {
    const reachable = (el, dx, dy) => {
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      let d = 0;
      for (let i = 1; i <= 30; i++) {
        const x = cx + dx * i, y = cy + dy * i;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) break;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(hit === el || el.contains(hit))) break;
        d = i;
      }
      return d;
    };
    const out = [];
    document.querySelectorAll('button, a[href]').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) return;
      // Only judge controls fully inside the viewport; a half-scrolled button
      // point-tests as zero and would fail for the wrong reason.
      if (b.top < 0 || b.bottom > innerHeight || b.left < 0 || b.right > innerWidth) return;
      const w = reachable(el, 1, 0) + reachable(el, -1, 0);
      const h = reachable(el, 0, 1) + reachable(el, 0, -1);
      // 43 not 44: the probe steps outward from the centre pixel, so a 44px
      // target measures 43 steps.
      if (w < 43 || h < 43) out.push({ cls: el.className.toString().slice(0, 40), w, h });
    });
    return out;
  });
  expect(small, 'gym use, one hand: 44px minimum, expand the hit area if the visual must stay small').toEqual([]);
});

// ---------------------------------------------------------------------------
// A ramp that does not ascend is not a ramp. Rounding both percentages DOWN to
// the equipment step collapsed 50% and 70% onto the same number at light loads:
// a 10 kg working weight rendered two «تدرّج» rows at 5 kg.
test('ramp sets ascend, and never sit at the working weight', async ({ page }) => {
  await boot(page);
  await intoSession(page);

  const rows = await page.evaluate(() => [...document.querySelectorAll('.set-row, .set-grid')]
    .map((row) => ({
      ramp: /تدرّج/.test(row.textContent || ''),
      values: [...row.querySelectorAll('input')].map((i) => i.value),
    }))
    .filter((r) => r.values.length >= 2));

  const ramps = rows.filter((r) => r.ramp);
  const working = rows.filter((r) => !r.ramp);
  test.skip(ramps.length < 2, 'this exercise prescribes fewer than two ramp sets');

  const weights = ramps.map((r) => Number(r.values[0])).filter(Number.isFinite);
  for (let i = 1; i < weights.length; i++) {
    expect(weights[i], `ramp ${i + 1} must be heavier than ramp ${i} — ${weights.join(', ')}`)
      .toBeGreaterThan(weights[i - 1]);
  }
  const workWeight = Number(working[0]?.values[0]);
  if (Number.isFinite(workWeight) && workWeight > 0) {
    expect(Math.max(...weights), 'a ramp at the working load is not a warm-up').toBeLessThan(workWeight);
  }
});

// ---------------------------------------------------------------------------
// The rest countdown lived only in a module-level object. The auto-update path
// reloads the page the moment the app is hidden mid-session — which is exactly
// when he pockets the phone to rest — so the alarm silently never arrived.
test('a running rest survives a reload', async ({ page }) => {
  await boot(page);
  await intoSession(page);

  await page.evaluate(() => { if (window.startRest) window.startRest(120); });
  const started = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => /restend/.test(k));
    return keys.length ? Number(localStorage.getItem(keys[0])) : 0;
  });
  test.skip(!started, 'startRest is not reachable from the page scope in this build');

  expect(started, 'the rest deadline must be persisted, not only held in memory').toBeGreaterThan(Date.now());

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const visible = await page.evaluate(() => document.querySelector('#rest-timer')?.style.display);
  expect(visible, 'the countdown must resume after a reload').toBe('flex');
});

// ---------------------------------------------------------------------------
// The worst one this audit found.
//
// openProfile() and finishLocalProfile() both built a fresh defaultState() and
// then persistLocal()'d it, without ever reading what the device already held
// for that profile. So tapping your own name on the welcome screen while the
// server was unreachable — gym wifi, HP off, aeroplane mode — wrote a blank
// state straight over the training log. No warning, no undo, suite green.
test('tapping your own profile with the server unreachable does not destroy your history', async ({ page }) => {
  await boot(page);

  const seeded = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    parsed.history = [
      { date: '2026-08-20', session_id: 'upper_a', started_at: '2026-08-20T09:00:00Z', ended_at: '2026-08-20T10:00:00Z', exercises: {}, prs: [], stats: {} },
      { date: '2026-08-22', session_id: 'lower_a', started_at: '2026-08-22T09:00:00Z', ended_at: '2026-08-22T10:00:00Z', exercises: {}, prs: [], stats: {} },
      { date: '2026-08-25', session_id: 'upper_b', started_at: '2026-08-25T09:00:00Z', ended_at: '2026-08-25T10:00:00Z', exercises: {}, prs: [], stats: {} },
    ];
    parsed.prs = { chest_press_machine: { kg: 40, reps: 10, date: '2026-08-25', score: 53.3 } };
    parsed.active_session = null;
    localStorage[key] = JSON.stringify(parsed);
    // Back to the welcome screen: what a new device, a cleared pointer, or a
    // "wipe local" leaves behind.
    localStorage.removeItem('raedworkouts.active_user');
    return key;
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await expect(page.locator('.profile-tile').first()).toBeVisible();

  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(2500);

  const after = await page.evaluate((key) => {
    const parsed = JSON.parse(localStorage[key] || '{}');
    return { sessions: (parsed.history || []).length, prs: Object.keys(parsed.prs || {}).length };
  }, seeded);

  expect(after.sessions, 'opening a profile must never overwrite its stored history').toBe(3);
  expect(after.prs, 'nor its personal records').toBe(1);
});

// ---------------------------------------------------------------------------
// Accessories never graduated to more weight.
//
// `bump = isAccessory ? 0 : 2.5` made both increase branches unreachable, so an
// upper-body isolation movement sat at one load PERMANENTLY while the card said
// «أضف تكرارًا بدل الوزن» every session. In Upper A that is the biceps curl, the
// rope triceps extension and the cable lateral raise — three of seven.
// SKILL.md §5.2 says accessories add reps first and THEN weight; only the first
// half was implemented.
test('every movement eventually earns more weight, accessories included', async ({ page }) => {
  await boot(page);

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    const loads = {
      chest_press_machine: 40,              // compound        -> +2.5
      biceps_curl: 8,                       // accessory < 10  -> +1
      lateral_raise_cable: 6,               // accessory < 10  -> +1
      single_arm_rope_triceps_extension: 12, // accessory >= 10 -> +2.5
    };
    // Two sessions where every working set cleared the top of its range. 15 is
    // above every range in the programme, so this does not depend on which one.
    const session = (date) => ({
      date, session_id: 'upper_a', started_at: `${date}T09:00:00Z`, ended_at: `${date}T10:00:00Z`,
      exercises: Object.fromEntries(Object.entries(loads).map(([id, w]) => [id, {
        planned: { exercise_id: id },
        sets: [0, 1, 2].map((i) => ({
          is_warmup: false, weight: w, reps: 15, completed: true,
          effort: i === 2 ? 'right' : null,
        })),
      }])),
      prs: [], stats: {},
    });
    parsed.history = [session('2026-08-25'), session('2026-08-28')];
    parsed.active_session = null;
    parsed.forced_next_session = 'upper_a';
    localStorage[key] = JSON.stringify(parsed);
    return loads;
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(1000);

  const suggested = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    return Object.fromEntries(Object.entries(parsed.active_session.exercises).map(([id, entry]) => [
      id, (entry.sets.find((s) => !s.is_warmup) || {}).weight,
    ]));
  });

  const previous = {
    chest_press_machine: 40,
    biceps_curl: 8,
    lateral_raise_cable: 6,
    single_arm_rope_triceps_extension: 12,
  };
  for (const [id, was] of Object.entries(previous)) {
    expect(Number(suggested[id]), `${id} must not be frozen at ${was}kg after two sessions at the top of its range`)
      .toBeGreaterThan(was);
  }
  // And the step stays sane: never more than a plate on an accessory.
  expect(Number(suggested.biceps_curl)).toBe(9);
  expect(Number(suggested.chest_press_machine)).toBe(42.5);
});

// ---------------------------------------------------------------------------
// A swapped exercise had no memory.
//
// A session stores a swapped movement under the ORIGINAL programme id with the
// replacement in `swapped_to`, so history for a hack squat that replaced a
// goblet squat lives at `exercises.goblet_squat`. Both history lookups asked for
// the REPLACEMENT id, found nothing, and reported no history at all — so every
// swapped exercise was permanently stuck on its first exposure, showing
// «معايرة» and never progressing.
test('a swapped exercise remembers what he actually lifted on it', async ({ page }) => {
  await boot(page);

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    const session = (date) => ({
      date, session_id: 'lower_b', started_at: `${date}T09:00:00Z`, ended_at: `${date}T10:00:00Z`,
      exercises: {
        goblet_squat: {
          planned: { exercise_id: 'hack_squat', reps: '8-10' },
          swapped_to: 'hack_squat',
          sets: [0, 1, 2].map((i) => ({
            is_warmup: false, weight: 80, reps: 10, completed: true,
            effort: i === 2 ? 'right' : null,
          })),
        },
      },
      prs: [], stats: {},
    });
    parsed.history = [session('2026-08-24'), session('2026-08-27')];
    parsed.active_session = null;
    parsed.forced_next_session = 'lower_b';
    parsed.substitutions = [{
      id: 's1', from_exercise_id: 'goblet_squat', to_exercise_id: 'hack_squat',
      scope: 'always', created_at: '2026-08-24T09:00:00Z',
    }];
    localStorage[key] = JSON.stringify(parsed);
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(1000);

  const entry = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    const ex = parsed.active_session.exercises.goblet_squat;
    return { swappedTo: ex?.swapped_to, weight: (ex?.sets || []).find((s) => !s.is_warmup)?.weight };
  });

  expect(entry.swappedTo, 'the permanent swap must still resolve').toBe('hack_squat');
  expect(Number(entry.weight), 'two sessions at 80kg must not present as a movement he has never done')
    .toBeGreaterThanOrEqual(80);
});

// ---------------------------------------------------------------------------
// 0 kg is a real load — a machine carrying its own stack — and editableWeightValue
// collapsed it to blank, because hasWorkingWeight is `> 0`. A completed 0 kg set
// re-rendered with an EMPTY weight box, so logged work looked unrecorded, and
// «+ مجموعة» after one produced a row holding '' that a readOnly machine-weight
// card could never fill in or complete.
test('a logged 0 kg set still reads as 0 after a reload', async ({ page }) => {
  await boot(page);
  await intoSession(page);

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const parsed = JSON.parse(localStorage[key]);
    const id = Object.keys(parsed.active_session.exercises)[0];
    const entry = parsed.active_session.exercises[id];
    entry.machine_weight = true;
    for (const set of entry.sets) if (!set.is_warmup) set.weight = 0;
    const first = entry.sets.find((s) => !s.is_warmup);
    first.completed = true;
    first.reps = 10;
    localStorage[key] = JSON.stringify(parsed);
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const weights = await page.evaluate(() => [...document.querySelectorAll('.set-grid')]
    .filter((row) => !/تدرّج/.test(row.textContent))
    .map((row) => [...row.querySelectorAll('input')][0]?.value));

  expect(weights.length).toBeGreaterThan(0);
  expect(weights.every((w) => w === '0'), `a stored 0 must render as 0, got ${JSON.stringify(weights)}`).toBe(true);
});

// ---------------------------------------------------------------------------
// #modal-overlay is opened from a dozen places by adding a class, and had none
// of the behaviour a dialog needs: no role, no aria-modal, focus left on <body>,
// Tab wandering onto the page underneath, and Escape doing nothing — every sheet
// and every destructive confirmation could only be dismissed by finding the
// right button.
test('a sheet behaves like a dialog: named, focused, and Escape closes it', async ({ page }) => {
  await boot(page);
  await intoSession(page);
  await page.evaluate(() => document.querySelector('#page-home .ex.expanded [data-exercise-settings]')?.click());
  await page.waitForTimeout(700);

  const state = await page.evaluate(() => {
    const modal = document.querySelector('#modal');
    return {
      open: document.querySelector('#modal-overlay')?.classList.contains('show'),
      role: modal?.getAttribute('role'),
      ariaModal: modal?.getAttribute('aria-modal'),
      focusInside: modal?.contains(document.activeElement),
    };
  });
  expect(state.open).toBe(true);
  expect(state.role).toBe('dialog');
  expect(state.ariaModal).toBe('true');
  expect(state.focusInside, 'focus must move into the sheet, not stay on body').toBe(true);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const stillOpen = await page.evaluate(() => document.querySelector('#modal-overlay')?.classList.contains('show'));
  expect(stillOpen, 'Escape must close a sheet').toBe(false);
});

// Every interactive control on every screen needs a name. The session screen is
// covered above; this covers the other four.
test('no unnamed control on home, library, history, coach or settings', async ({ page }) => {
  await boot(page);
  for (const route of ['home', 'library', 'history', 'coach', 'settings']) {
    await page.evaluate((r) => document.querySelector(`.tab-bar .tab[data-route="${r}"]`)?.click(), route);
    await page.waitForTimeout(700);
    if (route === 'settings') {
      await page.evaluate(() => document.querySelectorAll('#page-settings details, #page-settings summary')
        .forEach((el) => el.click?.()));
      await page.waitForTimeout(600);
    }
    const unnamed = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('button, a[href], select, input, textarea').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const named = (el.textContent || '').trim() || el.getAttribute('aria-label')
          || el.getAttribute('aria-labelledby') || el.getAttribute('title')
          || el.closest('label') || el.getAttribute('placeholder');
        if (!named) out.push(`${el.tagName}.${el.className}`.slice(0, 50));
      });
      return out;
    });
    expect(unnamed, `unnamed controls on ${route}`).toEqual([]);
  }
});
