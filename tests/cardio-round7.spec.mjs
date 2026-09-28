// Round 7 on the cardio block, driven in the browser at 390×844.
//
// Raed 2026-09-28: «post-workout is named cool-down, which is not — it should
// be cardio» and «it seems complicated; I wanted much simpler, uniform».
// ROUND7-FABLE-BRIEF §A (copy) and §B (the simplified block). The principle
// under test: the suggestion IS the prefill — on a normal day he taps «سجّل»
// and nothing else.
import { expect, test } from './_fixtures.mjs';

test.use({ viewport: { width: 390, height: 844 } });

// His last completed bout: 15 min, 5.1 mph at 2.5%, four 30 s bursts at 7.3.
// Scored 153. With it behind him, today's one change is the duration: 15 → 20.
const LAST_BOUT = {
  planned_minutes: 15, unit: 'mph', base_speed: 5.1, incline: 2.5,
  burst_count: 4, burst_seconds: 30, burst_speed: 7.3,
  started_at: '2026-09-20T18:00:00.000Z', completed_at: '2026-09-20T18:20:00.000Z', skipped: false,
};

const pickRaed = (page) => page.evaluate(() => {
  const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
  if (t) t.click();
});

// Same road as tests/cardio-round5.spec.mjs: start the session for real, seed
// the working sets (and optionally the last bout) in storage, reload.
async function driveToDone(page, { seedLastBout = null } = {}) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto('http://localhost:8877', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await pickRaed(page);
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
  const filled = await page.evaluate((bout) => {
    const key = Object.keys(localStorage).find((x) => /\.state\./.test(x) && /raed/i.test(x));
    const profile = JSON.parse(localStorage[key]);
    const active = profile.active_session;
    if (!active) return 0;
    let n = 0;
    for (const entry of Object.values(active.exercises || {})) {
      for (const set of entry.sets || []) {
        if (set.is_warmup) { set.completed = true; continue; }
        set.weight = 20; set.reps = 10; set.rpe = 8;
        set.completed = true; set.skipped = false; set.invalid = null;
        n += 1;
      }
    }
    active.phase = 'lifting';
    if (bout && profile.history?.length) profile.history[profile.history.length - 1].cardio = bout;
    localStorage[key] = JSON.stringify(profile);
    return n;
  }, seedLastBout);
  if (!filled) throw new Error('no active session to fill — the runner never started');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  await pickRaed(page);
  await page.waitForTimeout(1100);
  return errs;
}

const liveCardio = (page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find((x) => /\.state\./.test(x) && /raed/i.test(x));
  return JSON.parse(localStorage[key]).active_session?.cardio || null;
});

test('§A — the block is «الكارديو»; «تهدئة» appears nowhere on the done panel', async ({ page }) => {
  const errs = await driveToDone(page);
  const copy = await page.evaluate(() => ({
    head: document.querySelector('[data-cardio-block] .section-head .eyebrow')?.textContent?.trim() || '',
    page: document.querySelector('#page-home')?.textContent || '',
    log: document.querySelector('[data-cardio-log]')?.textContent?.trim() || '',
    skip: document.querySelector('[data-cardio-skip]')?.textContent?.trim() || '',
  }));
  expect(copy.head).toBe('الكارديو');
  expect(copy.page, 'no «تهدئة» anywhere on the page').not.toMatch(/تهدئة/);
  expect(copy.log).toMatch(/^سجّل/);
  expect(copy.skip).toMatch(/^تخطَّ/);
  expect(errs).toEqual([]);
});

test('§B — the suggestion is the prefill, applied once; his edit survives a re-render and a reload', async ({ page }) => {
  const errs = await driveToDone(page, { seedLastBout: LAST_BOUT });

  const first = await page.evaluate(() => ({
    active: document.querySelector('[data-cardio-block] .seg-btn.active')?.textContent?.trim() || '',
    applyBtn: document.querySelectorAll('[data-cardio-apply]').length,
    line: document.querySelector('[data-cardio-suggestion]')?.textContent?.trim() || '',
  }));
  // Written INTO the fields — no «طبّقه» to press.
  expect(first.applyBtn, 'no «طبّقه» button: the suggestion is already applied').toBe(0);
  expect(first.active, 'the duration control shows the suggested 20').toBe('20');
  expect(first.line, `today line read «${first.line}»`).toMatch(/20/);
  const c1 = await liveCardio(page);
  expect(Number(c1.planned_minutes)).toBe(20);
  expect(c1.applied_suggestion).toBe(true);
  // A prescription, never the old record: nothing is logged by prefilling.
  expect(c1.completed_at).toBeNull();
  expect(c1.started_at).toBeNull();
  expect(Number(c1.burst_seconds)).toBe(30);
  expect(Number(c1.burst_speed)).toBe(7.3);

  // His own edits: 25 minutes and a 5.4 belt.
  await page.evaluate(async () => {
    [...document.querySelectorAll('[data-cardio-block] .seg-btn')].find((b) => b.textContent.trim() === '25')?.click();
    await new Promise((r) => setTimeout(r, 250));
    const el = document.querySelector('[data-cardio-field="base_speed"]');
    el.value = '5.4';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // A re-render (away and back) and a reload must not re-apply the suggestion.
  await page.evaluate(() => { window.location.hash = 'history'; });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.location.hash = 'home'; });
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await pickRaed(page);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    active: document.querySelector('[data-cardio-block] .seg-btn.active')?.textContent?.trim() || '',
    speed: document.querySelector('[data-cardio-field="base_speed"]')?.value,
  }));
  expect(after.active, 'his 25 must survive the re-render').toBe('25');
  expect(Number(after.speed), 'and his 5.4').toBe(5.4);
  const c2 = await liveCardio(page);
  expect(Number(c2.planned_minutes)).toBe(25);
  expect(Number(c2.base_speed)).toBe(5.4);
  expect(errs).toEqual([]);
});

test('§B — burst details are collapsed, the totals are one line, and the block is under 520px', async ({ page }) => {
  const errs = await driveToDone(page, { seedLastBout: LAST_BOUT });
  const shape = await page.evaluate(() => {
    const block = document.querySelector('[data-cardio-block]');
    const more = block.querySelector('details.cardio-more');
    const totals = block.querySelector('[data-cardio-totals]');
    const log = block.querySelector('[data-cardio-log]');
    return {
      height: Math.round(block.getBoundingClientRect().height),
      more: Boolean(more),
      open: more ? more.open : null,
      summary: more?.querySelector('summary')?.textContent || '',
      burstSecsInside: Boolean(more?.querySelector('[data-cardio-burst-seconds]')),
      burstSpeedInside: Boolean(more?.querySelector('[data-cardio-field="burst_speed"]')),
      totalsLines: totals ? totals.children.length : -1,
      totalsText: totals?.textContent || '',
      beaten: totals?.firstElementChild?.classList.contains('beaten') || false,
      removed: block.querySelectorAll('.cardio-intro, [data-cardio-effort-def], .cardio-target, [data-cardio-apply], [data-cardio-pace], [data-cardio-base-fact], .cardio-ideal, [data-cardio-band], [data-cardio-versus]').length,
      logWidth: Math.round(log.getBoundingClientRect().width),
      blockWidth: Math.round(block.getBoundingClientRect().width),
      logPrimary: log.classList.contains('primary'),
      best: block.querySelector('.section-head [data-cardio-best]')?.textContent || '',
    };
  });
  console.log(`cardio block height at 390×844, details closed: ${shape.height}px`);
  expect(shape.more, 'burst seconds + speed live in a <details class="cardio-more">').toBe(true);
  expect(shape.open, 'closed by default').toBe(false);
  expect(shape.summary, `summary read «${shape.summary}»`).toMatch(/30/);
  expect(shape.summary).toMatch(/7\.3/);
  expect(shape.burstSecsInside).toBe(true);
  expect(shape.burstSpeedInside).toBe(true);
  expect(shape.removed, 'intro, definition, suggestion box, MET note, pace label, band and versus lines are gone').toBe(0);
  expect(shape.totalsLines, 'totals are ONE line').toBe(1);
  expect(shape.totalsText).toMatch(/نقطة جهد/);
  expect(shape.totalsText).toMatch(/ميل/);
  // 20 min beats the 153 of the 15-min bout → accent + «رقم جديد».
  expect(shape.beaten).toBe(true);
  expect(shape.totalsText).toMatch(/رقم جديد/);
  expect(shape.best, 'the best score sits in the header').toMatch(/153/);
  expect(shape.logPrimary, '«سجّل» is the primary').toBe(true);
  expect(shape.logWidth, 'compact, not full width').toBeLessThan(shape.blockWidth / 2);
  expect(shape.height, `block height ${shape.height}px`).toBeLessThan(520);
  expect(errs).toEqual([]);
});
