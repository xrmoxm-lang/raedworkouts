// Round 5 — the toast is not allowed to sit on a control.
//
// Two confirmed defects, both proved by BREAKING the running app at 390×844:
//   · finishing a session raised a 9s undo toast ON TOP of the `.end-cta` row:
//     both buttons measured hitH 0, and `elementFromPoint` at the centre of
//     «تم» returned the toast's «تراجع» — so the tap that means "done" called
//     reopenSession() and pulled the session back out of history;
//   · on the runner the same pill landed on «أنهِ الجلسة» (rect y 714.5→758.5,
//     toast band y 713→768) at window.scrollY == maxScroll, i.e. with nowhere
//     left to scroll it clear. The toasts that fire there in his real use are
//     the offline ones — he trains offline.
import { expect, test } from './_fixtures.mjs';

test.use({ viewport: { width: 390, height: 844 } });

async function boot(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // The fixture fences the whole context; these are the per-spec second fence
  // the suite requires. A probe once wrote a phantom session into his live row.
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto('http://localhost:8877', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await pickRaed(page);
  return errs;
}

async function pickRaed(page) {
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(800);
}

async function startSession(page) {
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(700);
}

const readState = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  const s = JSON.parse(localStorage[key]);
  return { active: Boolean(s.active_session), history: (s.history || []).length };
});

// A state he ARRIVES at is seeded, not tapped — the lesson this suite already
// learned. Every working set logged, so finishing saves outright. With
// `leaveLastOpen` the very last working set of the LAST exercise is left for him
// to tick by hand, which is the moment the second finding measured: «آخر عدة»,
// the nav's primary reading «أنهِ الجلسة».
async function logEverything(page, { leaveLastOpen = false } = {}) {
  const logged = await page.evaluate((leaveOpen) => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    const profile = JSON.parse(localStorage[key]);
    const active = profile.active_session;
    if (!active) return 0;
    let n = 0;
    const entries = Object.values(active.exercises || {});
    entries.forEach((entry, idx) => {
      const working = (entry.sets || []).filter((s) => !s.is_warmup);
      const open = leaveOpen && idx === entries.length - 1 ? working[working.length - 1] : null;
      for (const s of entry.sets || []) {
        if (!s.is_warmup) { s.weight = 80; s.reps = 10; n += 1; }
        s.skipped = false;
        s.invalid = null;
        // Filled but NOT ticked: the set he is standing over.
        s.completed = s !== open;
      }
      if (!open) entry.effort = entry.effort || 'right';
    });
    active.phase = 'lifting';
    localStorage[key] = JSON.stringify(profile);
    return n;
  }, leaveLastOpen);
  expect(logged, 'the seed must log real working sets').toBeGreaterThan(0);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await pickRaed(page);
}

// What the finding measured: the toast's own band, and for each control the
// PAINTED stack at its centre — elementFromPoint alone cannot say WHO is on top.
const measureAgainstToast = (page, selector) => page.evaluate((sel) => {
  const toast = document.getElementById('toast');
  const tr = toast.getBoundingClientRect();
  const controls = [...document.querySelectorAll(sel)].filter((c) => {
    const r = c.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return {
    shown: toast.classList.contains('show'),
    pointerEvents: getComputedStyle(toast).pointerEvents,
    text: toast.textContent.trim(),
    toastRect: [tr.left, tr.top, tr.width, tr.height].map(Math.round),
    hasAction: Boolean(toast.querySelector('button')),
    scrollY: Math.round(window.scrollY),
    maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    controls: controls.map((c) => {
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const hit = document.elementFromPoint(cx, r.top + r.height / 2);
      // hitH: how much of the control's own height actually answers a tap —
      // 0 for both end CTAs before this fix, for the full nine seconds.
      let live = 0;
      for (let y = r.top + 4; y < r.bottom - 4; y += 4) {
        const at = document.elementFromPoint(cx, y);
        if (at && (at === c || c.contains(at))) live += 4;
      }
      return {
        label: c.textContent.trim().slice(0, 16),
        rect: [r.left, r.top, r.width, r.height].map(Math.round),
        hit: hit ? `${hit.tagName}.${hit.className}` : 'none',
        hitIsSelf: Boolean(hit && (hit === c || c.contains(hit))),
        hitIsToast: Boolean(hit && (hit === toast || toast.contains(hit))),
        hitH: live,
        // The geometric claim, independent of hit testing: does the pill
        // overlap this control's rect at all?
        overlapsToast: !(r.right <= tr.left || r.left >= tr.right || r.bottom <= tr.top || r.top >= tr.bottom),
      };
    }),
  };
}, selector);

test('the undo toast cannot take the tap that means «تم»', async ({ page }) => {
  const errs = await boot(page);
  await startSession(page);
  const before = await readState(page);
  await logEverything(page);

  await page.evaluate(() => {
    const segs = document.querySelectorAll('.sp-seg');
    segs[segs.length - 1]?.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-finish-session]')?.click());
  await page.waitForTimeout(700);
  const guard = page.locator('#modal [data-confirm-yes]');
  if (await guard.count()) { await guard.click(); await page.waitForTimeout(700); }

  const saved = await readState(page);
  expect(saved.active, 'the session must actually be saved first').toBe(false);
  expect(saved.history).toBe(before.history + 1);

  // 1.5s in: the toast is up, and it is up for nine seconds (core/session.js).
  await page.waitForTimeout(800);
  const end = await measureAgainstToast(page, '#page-end .end-cta a, #page-end .end-cta button');
  expect(end.shown, 'the undo toast must be on screen — that is the state under test').toBe(true);
  expect(end.hasAction, 'and it must still carry the undo').toBe(true);
  expect(end.controls.length, 'the end screen offers two CTAs').toBe(2);

  for (const c of end.controls) {
    expect(c.hitIsToast, `«${c.label}» at ${c.rect} hit-tested to ${c.hit} (toast ${end.toastRect})`).toBe(false);
    expect(c.hitIsSelf, `«${c.label}» at ${c.rect} hit-tested to ${c.hit} (toast ${end.toastRect})`).toBe(true);
    expect(c.hitH, `«${c.label}» answered a tap over ${c.hitH}px of its ${c.rect[3]}px height`)
      .toBeGreaterThanOrEqual(c.rect[3] - 12);
    expect(c.overlapsToast, `the toast ${end.toastRect} still overlaps «${c.label}» ${c.rect}`).toBe(false);
  }
  // He cannot scroll them clear either — that is why the toast is what moves.
  expect(end.maxScroll, 'the end screen barely scrolls').toBeLessThan(200);

  // And the undo it carries is still one tap away: the fix moves the toast, it
  // does not disarm it.
  await page.locator('#toast button').click();
  await page.waitForTimeout(900);
  const undone = await readState(page);
  expect(undone.active, 'the session is live again').toBe(true);
  expect(undone.history, 'and it is out of the log again').toBe(before.history);
  expect(errs).toEqual([]);
});

test('an offline toast never lands on «أنهِ الجلسة»', async ({ page }) => {
  const errs = await boot(page);
  await startSession(page);
  // His «آخر عدة»: everything logged but the last working set of the last
  // exercise, so the nav's primary is «أنهِ الجلسة» and the card has not yet
  // collapsed into its own finish button.
  await logEverything(page, { leaveLastOpen: true });

  await page.evaluate(() => {
    const segs = document.querySelectorAll('.sp-seg');
    segs[segs.length - 1]?.click();
  });
  await page.waitForTimeout(500);
  // Standing over that last set, the nav's primary is «أنهِ الجلسة» — a
  // `grow-2` button 203.5px wide, not the full-width one the done panel shows
  // once every exercise is resolved. That is the button the finding measured.
  // Where he is standing: the bottom of the page, nothing left to scroll.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);

  // The real toast, raised through the app's own toast() with the app's own
  // copy — app.js does exactly this when a sync fails with no connection, and
  // he trains offline. No faking: the module the page imports here is the
  // module the app is running.
  await page.evaluate(async () => {
    const [dom, i18n] = await Promise.all([import('/core/dom.js'), import('/core/i18n.js')]);
    dom.toast(i18n.t('sync_failed_offline'), 6000);
  });
  await page.waitForTimeout(500);

  const runner = await measureAgainstToast(page, '.runner-nav [data-finish-session]');
  expect(runner.shown).toBe(true);
  expect(runner.pointerEvents, 'a message must not be a tap target').toBe('none');
  expect(runner.controls.length, 'the last exercise must offer the finish button').toBe(1);
  const finish = runner.controls[0];
  expect(runner.scrollY, 'and he is already at the bottom — there is nowhere to scroll it clear')
    .toBe(runner.maxScroll);
  expect(finish.hitIsToast,
    `«${finish.label}» at ${finish.rect} hit-tested to ${finish.hit} (toast ${runner.toastRect}, scrollY ${runner.scrollY}/${runner.maxScroll})`).toBe(false);
  expect(finish.hitIsSelf,
    `«${finish.label}» at ${finish.rect} hit-tested to ${finish.hit} (toast ${runner.toastRect})`).toBe(true);
  expect(finish.hitH, `the finish button answered a tap over ${finish.hitH}px of ${finish.rect[3]}px`)
    .toBeGreaterThanOrEqual(finish.rect[3] - 12);
  expect(finish.overlapsToast, `the toast ${runner.toastRect} still overlaps ${finish.rect}`).toBe(false);

  // And rule 1 on its own — the fallback for a page too dense for the hop to
  // clear, where the toast keeps its seat: pin it back over the button and the
  // button must STILL answer the tap, because a message is not a tap target.
  const pinned = await page.evaluate(() => {
    const toast = document.getElementById('toast');
    toast.style.setProperty('--toast-lift', '0px');
    const b = document.querySelector('.runner-nav [data-finish-session]');
    const r = b.getBoundingClientRect();
    const tr = toast.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      overlaps: !(r.right <= tr.left || r.left >= tr.right || r.bottom <= tr.top || r.top >= tr.bottom),
      hitIsSelf: Boolean(hit && (hit === b || b.contains(hit))),
      hit: hit ? `${hit.tagName}.${hit.className}` : 'none',
    };
  });
  expect(pinned.overlaps, 'the pinned toast must really sit on it, or this proves nothing').toBe(true);
  expect(pinned.hitIsSelf, `with the toast pinned over it, «أنهِ الجلسة» hit-tested to ${pinned.hit}`).toBe(true);
  expect(errs).toEqual([]);
});
