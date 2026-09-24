// The post-workout conditioning block, driven the way Raed drives it.
//
// Raed 2026-09-22 asked for two things at once: a finished session timed in
// hours rather than a raw minute count, and a cool-down he can log and later
// beat. Both are asserted here against the running app, because a cool-down
// that computes correctly and never reaches history is worth nothing, and the
// duration format is exactly the kind of thing that reads fine in the source
// and renders backwards in an RTL page.
import { expect, test } from './_fixtures.mjs';

test.use({ viewport: { width: 390, height: 844 } });

// Bring a fresh profile to the moment the lifting is finished.
//
// The last version of this tapped every set through the runner and never
// arrived: twelve passes over the cards and the session was still open, because
// resolving an exercise depends on rules the UI reaches by a longer road than a
// loop does. That is the failure this codebase has already learned once — a
// state he ARRIVES at is seeded, not tapped — so the session is started for
// real, then its working sets are filled in storage and the page reloaded.
async function driveToDone(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // The fixture fences the whole context, and this is the second fence the
  // suite requires per spec: the sync port is where state is written, and a
  // probe once put a phantom session into Raed's live cloud row.
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.goto('http://localhost:8877', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
    if (t) t.click();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);

  const filled = await page.evaluate(() => {
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
    localStorage[key] = JSON.stringify(profile);
    return n;
  });
  if (!filled) throw new Error('no active session to fill — the runner never started');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  // A reload can land back on the profile picker; the session is still there.
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent));
    if (t) t.click();
  });
  await page.waitForTimeout(1100);
  return errs;
}

test('a finished session is timed on the clock, not in loose minutes', async ({ page }) => {
  const errs = await driveToDone(page);
  const panel = await page.evaluate(() => {
    const el = document.querySelector('[data-session-done] .session-done-time');
    if (!el) return null;
    return { text: el.textContent.trim(), dir: getComputedStyle(el).direction };
  });
  expect(panel, 'the done panel must show a duration').not.toBeNull();
  // m:ss under an hour, h:mm:ss over it. «80 دقيقة» must not come back.
  expect(panel.text, `duration read «${panel?.text}»`).toMatch(/^\d{1,2}:\d{2}(?::\d{2})?$/);
  // A clock reading is Latin digits and colons; RTL would reverse the groups
  // and print a different time.
  expect(panel.dir, 'the clock must be laid out left to right').toBe('ltr');
  expect(errs).toEqual([]);
});

test('the cool-down computes, records, and gives him a number to beat', async ({ page }) => {
  const errs = await driveToDone(page);

  const present = await page.evaluate(() => Boolean(document.querySelector('[data-cardio-block]')));
  expect(present, 'the cool-down block must appear once the lifting is done').toBe(true);

  // His own numbers: 15 min, 5.1 base, 2.5% grade, 4 bursts of 30s at 7.3 —
  // in MPH since 2026-09-23, which is what makes the base a jog and moves the
  // whole bout from the walking equation to the running one.
  const totals = await page.evaluate(async () => {
    const set = (field, value) => {
      const el = document.querySelector(`[data-cardio-field="${field}"]`);
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('base_speed', 5.1);
    set('incline', 2.5);
    set('burst_speed', 7.3);
    await new Promise((r) => setTimeout(r, 200));
    const node = document.querySelector('[data-cardio-totals]');
    return { text: node?.textContent || '', main: node?.querySelector('.cardio-total-main')?.textContent };
  });
  // 13 min jogged at 9.7 METs plus 2 min at 13.4 is 153 MET-minutes. The exact
  // number is the point: it is what the next bout has to beat. Read as km/h the
  // same three numbers scored 76 — the unit is not a label, it is the workout.
  expect(Number(totals.main), `totals read «${totals.text}»`).toBe(153);
  // 1.35 miles is the ground actually covered at those speeds (2.17 km, stored
  // in km and shown in the unit his treadmill is showing him).
  expect(totals.text).toContain('1.35');
  expect(totals.text, 'the distance must be labelled in his unit').toContain('ميل');

  // Raed's open paren bug, on this block's own copy. Checking the block's
  // textContent proves nothing — the characters are balanced however they are
  // split. The defect is STRUCTURAL: the isolated run swallowed the closing
  // bracket and left the opener outside in the Arabic node, where the bidi
  // algorithm mirrors it and draws a second «)». So the test is that no
  // isolated run carries a bracket its own text does not close.
  const runs = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll('[data-cardio-block] .ltr-run')) {
      const text = el.textContent || '';
      let depth = 0;
      let worst = 0;
      for (const ch of text) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        worst = Math.min(worst, depth);
      }
      if (depth !== 0 || worst < 0) bad.push(text);
    }
    return bad;
  });
  expect(runs, 'an isolated run must not hold half a bracket pair').toEqual([]);

  // A jogged base gets the fact, not a verdict: the Zone 2 band and the solved
  // grade are both answers from the WALKING equation, and 5.1 mph is 137 m/min.
  const jog = await page.evaluate(() => ({
    fact: document.querySelector('[data-cardio-base-fact]')?.textContent || '',
    band: document.querySelector('[data-cardio-band]')?.textContent || null,
  }));
  expect(jog.fact, 'a jogged base must be priced, not scored against a walking band').toContain('9.7');
  expect(jog.band, 'and it gets no band verdict at all').toBeNull();

  // Drop the belt to a real walk and the solved incline comes back — this is
  // the «most beneficial incline» he asked to have calculated. At 3.0 mph
  // (80.5 m/min) the walk needs 5.5% to reach the band.
  const walking = await page.evaluate(async () => {
    const el = document.querySelector('[data-cardio-field="base_speed"]');
    el.value = '3';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    return {
      pace: document.querySelector('[data-cardio-pace]')?.dataset.cardioPace,
      ideal: document.querySelector('.cardio-ideal')?.textContent || '',
      band: document.querySelector('[data-cardio-band]')?.dataset.cardioBand || null,
    };
  });
  expect(walking.pace).toBe('walk');
  expect(walking.ideal, 'the block must state the incline that reaches the zone').toContain('5.5');
  // Three states, not two: at 2.5% this walk is UNDER the band.
  expect(walking.band).toBe('under');

  // Back to his own belt speed before the rest of the bout is dialled in.
  await page.evaluate(async () => {
    const el = document.querySelector('[data-cardio-field="base_speed"]');
    el.value = '5.1';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
  });

  // Break it. Twelve bursts is the stepper's ceiling, so the only way to overrun
  // a bout is the combination he could actually dial in: the short 10-minute
  // option with the long 60-second bursts. Twelve of those is twelve minutes
  // inside ten, and the block has to say so rather than quietly clip the walk
  // to zero and keep printing a total.
  const overfilled = await page.evaluate(async () => {
    const pick = (label) => {
      const btn = [...document.querySelectorAll('.seg-btn')].find((b) => b.textContent.trim().startsWith(label));
      if (btn) btn.click();
    };
    pick('10');
    await new Promise((r) => setTimeout(r, 250));
    pick('60');
    await new Promise((r) => setTimeout(r, 250));
    for (let i = 0; i < 14; i += 1) {
      const plus = [...document.querySelectorAll('.cardio-step')].find((b) => b.textContent.trim() === '+');
      if (!plus || plus.disabled) break;
      plus.click();
      await new Promise((r) => setTimeout(r, 110));
    }
    await new Promise((r) => setTimeout(r, 250));
    return Boolean(document.querySelector('[data-cardio-overfilled]'));
  });
  expect(overfilled, 'bursts that overrun the bout must be called out, not quietly clipped').toBe(true);

  // Back to a bout he could really do, then log it and close the session.
  await page.evaluate(async () => {
    const pick = (label) => {
      const btn = [...document.querySelectorAll('.seg-btn')].find((b) => b.textContent.trim().startsWith(label));
      if (btn) btn.click();
    };
    pick('15');
    await new Promise((r) => setTimeout(r, 250));
    pick('30');
    await new Promise((r) => setTimeout(r, 250));
    for (let i = 0; i < 20; i += 1) {
      const value = Number(document.querySelector('.cardio-step-value')?.textContent || 0);
      if (value <= 4) break;
      const minus = [...document.querySelectorAll('.cardio-step')].find((b) => b.textContent.trim() === '\u2212');
      if (!minus || minus.disabled) break;
      minus.click();
      await new Promise((r) => setTimeout(r, 110));
    }
    await new Promise((r) => setTimeout(r, 200));
    document.querySelector('[data-cardio-log]')?.click();
  });
  await page.waitForTimeout(700);
  const logged = await page.evaluate(() => ({
    row: Boolean(document.querySelector('[data-cardio-logged]')),
    // The score the block itself settled on, read off the closed row's head.
    // Asserted as a literal further down it would only be pinning whatever the
    // taps above happened to dial in; what matters is that the SAME number
    // reaches the end screen and the log.
    effort: document.querySelector('[data-cardio-block] .section-head .num')?.textContent?.trim() || '',
  }));
  expect(logged.row, 'logging must close the form into a summary row').toBe(true);
  expect(Number(logged.effort), 'the closed row must carry the bout\'s score').toBeGreaterThan(0);

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /إنهاء|أنهِ/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const y = [...document.querySelectorAll('#modal button')].find((b) => /أنهِ|إنهاء|نعم/.test(b.textContent));
    if (y) y.click();
  });
  await page.waitForTimeout(1200);

  // He logged it and then never saw it again: the end screen counted sets, reps
  // and volume and said nothing about the twenty minutes on the treadmill or
  // how long the session took. Both are on it now.
  const end = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#page-end .stats-grid .stat')];
    return {
      count: cells.length,
      duration: cells[3]?.querySelector('.num')?.textContent?.trim() || '',
      cardio: document.querySelector('#page-end [data-cardio-summary]')?.textContent || null,
    };
  });
  expect(end.count, 'the end screen carries four stats, the fourth being the clock').toBe(4);
  // The same clock format the done panel uses: m:ss under an hour.
  expect(end.duration, `duration read «${end.duration}»`).toMatch(/^\d{1,2}:\d{2}(?::\d{2})?$/);
  expect(end.cardio, 'the cool-down must be summarised where the session is summarised').not.toBeNull();
  expect(end.cardio, 'and it must be the same score the block logged').toContain(logged.effort);
  expect(end.cardio).toContain('ميل');

  // And in the log, muted, on the row for that session.
  await page.evaluate(() => { window.location.hash = 'history'; });
  await page.waitForTimeout(900);
  const inHistory = await page.evaluate(() => {
    const line = document.querySelector('#page-history [data-cardio-summary]');
    return line ? { text: line.textContent, muted: line.classList.contains('muted') } : null;
  });
  expect(inHistory, 'the log must show the cool-down it archived').not.toBeNull();
  expect(inHistory.text).toContain(logged.effort);
  expect(inHistory.muted, 'quietly — the row is about the lifting').toBe(true);

  // The whole point: it has to survive into history, or there is nothing to beat.
  const stored = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /\.state\./.test(x) && /raed/i.test(x));
    const p = JSON.parse(localStorage[k]);
    const last = (p.history || [])[p.history.length - 1];
    return last?.cardio || null;
  });
  expect(stored, 'the cool-down must be archived with the session').not.toBeNull();
  expect(stored.completed_at, 'and it must be marked completed').toBeTruthy();
  expect(Number(stored.base_speed)).toBe(5.1);
  expect(Number(stored.incline)).toBe(2.5);
  expect(errs).toEqual([]);
});
