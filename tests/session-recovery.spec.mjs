import { expect, test } from '@playwright/test';

// Raed pressed "finish" by accident and had no way back: the session was gone
// from the workout screen and the log offered no way in. An hour of work must
// not be one mis-tap from unreachable.
const appUrl = 'http://127.0.0.1:8899/index.html';
test.use({ viewport: { width: 390, height: 844 } });

async function intoSession(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent)); if (t) t.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
}

async function completeFirstExercise(page) {
  // Every set, not one: an exercise with sets still open is UNRESOLVED, and
  // finishing then offers to discard rather than save. Saving is the path the
  // undo exists for.
  const ramps = page.locator('[data-set-kind="warmup"]');
  for (let i = 0; i < await ramps.count(); i += 1) {
    await ramps.nth(i).locator('.set-check').click();
    await page.waitForTimeout(180);
  }
  const working = page.locator('[data-set-kind="working"]');
  const n = await working.count();
  for (let i = 0; i < n; i += 1) {
    const row = working.nth(i);
    await row.locator('input').nth(0).fill('42.5');
    await row.locator('input').nth(1).fill('10');
    await page.waitForTimeout(120);
    // The final set needs an effort before it will tick — the picker opens by
    // itself once the set before it is done.
    if (i === n - 1) {
      const pick = page.locator('.effort-strip:not([hidden]) .effort-picker button').nth(1);
      if (await pick.count()) { await pick.click(); await page.waitForTimeout(300); }
    }
    await row.locator('.set-check').click();
    await page.waitForTimeout(320);
  }
}

// "Finish & save" lives on the LAST exercise only now — Raed wanted it in one
// place so he stops scrolling past it under every card.
async function goToLastExercise(page) {
  const segs = page.locator('[data-v15-session-progress] .sp-seg');
  await segs.nth(await segs.count() - 1).click();
  await page.waitForTimeout(600);
}

const readState = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  const s = JSON.parse(localStorage[key]);
  return { active: !!s.active_session, history: (s.history || []).length };
});

test('the delete-session button says it deletes, and asks in-app', async ({ page }) => {
  // It was labelled «تجاهل التمرين» — "skip the exercise" — sat under the
  // exercise card beside a real skip action, ran behind a native confirm()
  // whose body was that same misleading label, and had no undo. The most
  // destructive control in the app read like the least.
  await intoSession(page);
  await completeFirstExercise(page);
  const before = await readState(page);

  // Reachable mid-session, not only at the end: abandoning a session is a
  // decision made in the middle of one. It is small now rather than a
  // full-width danger slab, but it is there.
  const discard = page.locator('[data-discard-session]').first();
  await expect(discard).toHaveCount(1);
  // The label must name the SESSION. The one that had to go was «تجاهل التمرين»
  // — "skip the exercise" — on a button that deleted the whole workout.
  await expect(discard).toContainText('الجلسة');
  await expect(discard, 'must not read as skipping one exercise').not.toContainText('تجاهل التمرين');

  await discard.click();
  await page.waitForTimeout(500);
  // In-app dialog, not the native one an installed PWA can suppress.
  await expect(page.locator('#modal [data-confirm-yes]')).toHaveCount(1);
  await expect(page.locator('#modal')).toContainText('ما فيه تراجع');

  await page.locator('#modal [data-confirm-no]').click();
  await page.waitForTimeout(500);
  const after = await readState(page);
  expect(after.active, 'declining keeps the session').toBe(true);
  expect(after.history).toBe(before.history);
  console.log('DISCARD_SESSION_NAMED_AND_GUARDED');
});

test('finishing with exercises still open asks first, and declining keeps the session', async ({ page }) => {
  // The guard used to fire only when NOTHING was logged, so the realistic
  // accident — one exercise done, six untouched, a stray tap on finish — went
  // straight into history as a completed session and fed the volume ledger a
  // number he never lifted. The test above tolerated the dialog with an
  // `if (count)`, so it passed either way and certified nothing.
  await intoSession(page);
  await completeFirstExercise(page);
  const before = await readState(page);

  await goToLastExercise(page);
  await page.locator('[data-finish-session]').click();

  const guard = page.locator('#modal [data-confirm-yes]');
  await expect(guard, 'the session must not close silently').toHaveCount(1);
  await expect(page.locator('#modal')).toContainText('ما خلصت');

  // Declining leaves everything exactly as it was.
  await page.locator('#modal [data-confirm-no]').click();
  await page.waitForTimeout(600);
  const after = await readState(page);
  expect(after.active, 'the session is still running').toBe(true);
  expect(after.history, 'and nothing was archived').toBe(before.history);
  console.log('FINISH_WITH_OPEN_EXERCISES_GUARDED');
});

test('finishing by accident can be undone from the toast', async ({ page }) => {
  await intoSession(page);
  await completeFirstExercise(page);
  const before = await readState(page);

  await goToLastExercise(page);
  await page.locator('[data-finish-session]').click();
  // Finishing with sets still open asks first — that guard is itself part of the
  // protection he asked for. Wait for it rather than sampling: a fixed sleep
  // raced the dialog's own render.
  // With the exercise resolved this saves outright; the discard guard only
  // appears when nothing was logged.
  await page.waitForTimeout(900);
  const guard = page.locator('#modal [data-confirm-yes]');
  if (await guard.count()) { await guard.click(); await page.waitForTimeout(800); }
  const finished = await readState(page);
  expect(finished.active, 'the session is closed').toBe(false);
  expect(finished.history).toBe(before.history + 1);

  // The undo lives on the toast, and the toast is up for long enough to notice.
  await page.locator('#toast button').click();
  await page.waitForTimeout(900);
  const undone = await readState(page);
  expect(undone.active, 'the session is live again').toBe(true);
  expect(undone.history, 'and it is out of the log again').toBe(before.history);
});

test('a finished session can be reopened from the log later', async ({ page }) => {
  await intoSession(page);
  await completeFirstExercise(page);
  const before = await readState(page);

  await goToLastExercise(page);
  await page.locator('[data-finish-session]').click();
  await page.waitForTimeout(900);
  const guard2 = page.locator('#modal [data-confirm-yes]');
  if (await guard2.count()) { await guard2.click(); }
  await page.waitForTimeout(1200);
  // Let the undo toast expire — this is the path he needs when he notices later.
  await page.waitForTimeout(9500);

  await page.locator('nav.tab-bar button[data-route="history"]').click();
  await page.waitForTimeout(800);
  const card = page.locator('#page-history .history-card').first();
  await card.locator('.date').click();
  await page.waitForTimeout(300);
  await card.locator('[data-reopen-session]').click();
  await page.waitForTimeout(400);
  await page.locator('#modal [data-confirm-yes]').click();
  await page.waitForTimeout(900);

  const after = await readState(page);
  expect(after.active, 'it is the session in progress again').toBe(true);
  expect(after.history, 'and it left the log').toBe(before.history);
});
