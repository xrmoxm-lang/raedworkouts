// The three ways this phone could lose a workout without saying so, 2026-09-23.
//
// All three were live with the whole suite green, and all three are about the
// SAME single localStorage key: `raedworkouts.<user>.state.v1` holds every
// session he has ever logged, and everything written to it was written blind.
//
// Written against what the phone does, not how it does it.
import { expect, test } from './_fixtures.mjs';

const appUrl = process.env.APP_URL || 'http://localhost:8877';

// His actual phone.
test.use({ viewport: { width: 390, height: 844 } });

// The two fences the brief requires, spelled out as literals so the unit gate
// in tests/videos.test.mjs can see them, plus a recorder: what the app TRIES to
// push is half of every finding here, and nothing may reach his real row.
async function fenceSync(page, pushes) {
  const fence = (route) => {
    if (pushes && route.request().method() === 'POST') pushes.push(route.request().postData() || '');
    route.abort();
  };
  await page.route('https://raed-hp.tail53bd35.ts.net/**', fence);
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', fence);
}

async function boot(page) {
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

const readState = (page) => page.evaluate(() => {
  const raw = localStorage.getItem('raedworkouts.Raed.state.v1') || '';
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
  return {
    bytes: raw.length,
    parsed: Boolean(parsed),
    history: parsed?.history?.length ?? null,
    prs: parsed ? Object.keys(parsed.prs || {}).length : null,
    active: Boolean(parsed?.active_session),
    done: parsed?.active_session
      ? Object.values(parsed.active_session.exercises || {})
        .flatMap((ex) => ex.sets || [])
        .filter((s) => s.completed && !s.is_warmup).length
      : 0,
  };
});

// ---------------------------------------------------------------------------
// 1. A state blob that will not parse used to be answered with an empty profile
//    — written straight back over the still-readable text, and then pushed over
//    the cloud head on the next boot because base_rev matched. 58,990 bytes and
//    12 sessions became 577 bytes and 0, in both places, and all he was told was
//    «فشلت المزامنة السحابية — حُفظت محلياً».
test('a state blob that will not parse is quarantined, never replaced and never pushed', async ({ page }) => {
  const pushes = [];
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await fenceSync(page, pushes);
  await boot(page);

  const before = await readState(page);
  expect(before.history, 'the seeded profile is the point of this test').toBeGreaterThan(0);

  // Truncation is how a blob really breaks: a write interrupted by eviction, a
  // crash, a full disk. 60% of the text, and the markers any device that had
  // synced successfully would be holding.
  const truncated = await page.evaluate(() => {
    const key = 'raedworkouts.Raed.state.v1';
    const cut = localStorage.getItem(key).slice(0, Math.floor(localStorage.getItem(key).length * 0.6));
    localStorage.setItem(key, cut);
    localStorage.setItem('raedworkouts.Raed.dirty.v1', '1');
    localStorage.setItem('raedworkouts.Raed.lastrev.v1', '354');
    return cut;
  });

  pushes.length = 0;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const after = await page.evaluate(() => ({
    state: localStorage.getItem('raedworkouts.Raed.state.v1'),
    corrupt: localStorage.getItem('raedworkouts.Raed.corrupt.v1'),
    migrationExport: localStorage.getItem('raedworkouts.Raed.programme-migration-export.v1'),
  }));

  expect(after.state, 'the unreadable text is the last local copy — it must be left exactly as found')
    .toBe(truncated);
  expect(after.corrupt, 'and a copy of it must be set aside where nothing overwrites it').toBe(truncated);
  expect(after.migrationExport, 'the pre-migration backup must not be rewritten from an empty state')
    .toBeNull();

  // Nothing empty may be pushed. An empty state with a matching base_rev is
  // exactly what the server's fast path writes verbatim over his history.
  // (The pagehide push from the page being replaced is fine and is counted: it
  // carries the 12 sessions that were still in memory. It is the push from the
  // NEXT boot — history: [], base_rev 354 — that destroyed the cloud copy.)
  for (const body of pushes) {
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (_) { /* a beacon blob, same text */ }
    const history = parsed?.state_json?.history;
    expect(Array.isArray(history) ? history.length : -1,
      'a push carrying an empty state is what took the cloud copy: ' + body.slice(0, 120))
      .toBeGreaterThan(0);
  }

  // A hard fault must still be a controlled one: the recovery screen is of no
  // use behind a page that threw on the way up.
  expect(pageErrors, 'the quarantine path must not throw').toEqual([]);

  // And he is stopped, with the two copies that exist offered to him.
  await expect(page.locator('[data-recover-cloud]')).toBeVisible();
  await expect(page.locator('[data-recover-revisions]')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2. A partially full phone: the 65 KB state write is refused for quota and the
//    698-byte settings write that follows it succeeds. Clearing the alarm on ANY
//    successful write meant the app decided storage had recovered and showed him
//    «حُفظت محلياً» — the one sentence locale.js:905 exists to prevent.
//    tests/resilience.spec.mjs misses this because it throws for EVERY write.
test('a phone that can save a timestamp but not the workout still says nothing was saved', async ({ page }) => {
  await fenceSync(page);
  await boot(page);
  await intoSession(page);

  const beforeState = await readState(page);
  const beforeStamp = await page.evaluate(() => localStorage.getItem('raedworkouts.Raed.lastwrite.v1'));

  await page.evaluate(() => {
    // Real quota behaviour: the big record no longer fits, a timestamp does.
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(v).length > 4000) {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      }
      return real.call(this, k, v);
    };
  });

  await page.evaluate(() => document.querySelector('.set-check')?.click());
  await page.waitForTimeout(1500);

  const toast = page.locator('#toast');
  await expect(toast).toHaveClass(/show/);
  await expect(toast, 'the phone did NOT save it — this is the misleading sentence')
    .not.toContainText('حُفظت محلياً');
  await expect(toast).toContainText('ما انحفظ');

  const afterStamp = await page.evaluate(() => localStorage.getItem('raedworkouts.Raed.lastwrite.v1'));
  expect(afterStamp, 'a «saved at» stamp over a save that did not happen is a lie the next boot believes')
    .toBe(beforeStamp);
  const afterState = await readState(page);
  expect(afterState.done, 'and the set is genuinely not on the phone').toBe(beforeState.done);
});

// ---------------------------------------------------------------------------
// 3. Two windows of the app. One tap in the idle one used to erase the live
//    session in the other: persistLocal serialised the whole in-memory state
//    over the single key with no counter and no compare.
test('one tap in an idle window cannot erase the session running in the other', async ({ page, context }) => {
  await fenceSync(page);
  await boot(page);
  // Tab A parks on home holding the pre-session state, exactly as it would if
  // he opened the app on the phone and left the browser tab behind.
  await page.evaluate(() => { window.location.hash = 'settings'; });
  await page.waitForTimeout(500);

  const training = await context.newPage();
  await fenceSync(training);
  await boot(training);
  await intoSession(training);
  await training.evaluate(() => {
    document.querySelectorAll('.set-check').forEach((box, i) => { if (i < 3) box.click(); });
  });
  await training.waitForTimeout(1200);

  const logged = await readState(training);
  expect(logged.active, 'the training window must have a live session to lose').toBe(true);
  expect(logged.done).toBeGreaterThanOrEqual(1);

  // The idle window saves something of its own: one superset-mode tap.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.seg-btn')].find((b) => !b.classList.contains('active'));
    btn?.click();
  });
  await page.waitForTimeout(1200);

  const afterIdleTap = await readState(page);
  expect(afterIdleTap.active, 'the live session must survive a save from a stale window').toBe(true);
  expect(afterIdleTap.done, 'and every set logged in it must still be there').toBe(logged.done);
  expect(afterIdleTap.history, 'his history must survive it too').toBe(logged.history);
  await training.close();
});

// ---------------------------------------------------------------------------
// 4. And the way out has to work. The recovery screen is the only thing between
//    him and a lost history once a blob has gone bad, so it is driven here
//    against a served head rather than assumed.
test('restoring from the server ends the quarantine and brings his sessions back', async ({ page }) => {
  const head = {
    user_id: 'raed-v16',
    state_json: {
      schema_version: 2,
      programme_reference_migration_version: 1,
      current_week: 2,
      current_block: 1,
      profile: { display_name: 'Raed', experience: 'detrained', bodyweight_kg: 82, created_at: '2026-09-01T00:00:00Z' },
      active_session: null,
      history: [
        { date: '2026-09-20', session_id: 'upper_a', uid: 'srv-1', started_at: '2026-09-20T17:00:00Z', ended_at: '2026-09-20T18:00:00Z', exercises: {} },
        { date: '2026-09-21', session_id: 'lower_b', uid: 'srv-2', started_at: '2026-09-21T17:00:00Z', ended_at: '2026-09-21T18:00:00Z', exercises: {} },
      ],
      prs: { chest_press_machine: { kg: 60, reps: 8, score: 74, date: '2026-09-20' } },
    },
    settings_json: { lang: 'ar', theme: 'auto', skin: 'hadid' },
    updated_at: '2026-09-21T18:00:00Z',
    latest_rev: 400,
  };
  // The same two literal fences, serving a head instead of aborting the GET.
  // Nothing leaves the browser either way — fulfil() never reaches the network.
  const serve = (route) => {
    const request = route.request();
    if (request.method() === 'GET' && request.url().includes('/state')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(head) });
    }
    return route.abort();
  };
  await page.route('https://raed-hp.tail53bd35.ts.net/**', serve);
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', serve);

  await boot(page);
  await page.evaluate(() => {
    const key = 'raedworkouts.Raed.state.v1';
    localStorage.setItem(key, localStorage.getItem(key).slice(0, 400));
    localStorage.setItem('raedworkouts.Raed.lastrev.v1', '354');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-recover-cloud]')).toBeVisible();

  await page.locator('[data-recover-cloud]').click();
  await page.waitForTimeout(1500);

  const after = await readState(page);
  expect(after.parsed, 'after a restore the state key must parse again').toBe(true);
  expect(after.history, "and hold the server's sessions").toBe(2);
  expect(after.prs).toBe(1);
  // The modal's markup stays in #modal until the next dialog reuses it; what
  // matters is that it is off the screen and not re-armed.
  await expect(page.locator('[data-recover-cloud]'), 'the blocking screen is done').toBeHidden();

  const kept = await page.evaluate(() => localStorage.getItem('raedworkouts.Raed.corrupt.v1'));
  expect(kept, 'the quarantined copy is his, and nothing but him deletes it').not.toBeNull();

  // And saving works again: the quarantine must not outlive the restore.
  await page.evaluate(() => { window.location.hash = 'settings'; });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.seg-btn')].find((b) => !b.classList.contains('active'));
    btn?.click();
  });
  await page.waitForTimeout(800);
  const stamp = await page.evaluate(() => localStorage.getItem('raedworkouts.Raed.lastwrite.v1'));
  expect(stamp, 'writing is allowed again once he has chosen a copy').not.toBeNull();
});
