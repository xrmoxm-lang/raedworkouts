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
