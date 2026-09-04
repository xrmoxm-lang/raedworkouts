import { expect, test } from '@playwright/test';

// The app ships Raed's real sync credentials and points at his real server, so
// ANY test that navigates without blocking that host pushes whatever it does to
// his live cloud row. history-delete.spec.mjs deletes sessions. Seven spec files
// had no block at all. Nothing in a test run may ever touch his data.
async function blockLiveSync(page) {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', (route) => route.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
}

test.use({ viewport: { width: 390, height: 844 } });
// Every Latin or numeric run inside Arabic must be isolated in a <bdi>/.ltr-run,
// or the bidi algorithm may reorder it against the surrounding text. This is not
// theoretical here: "4,658" once rendered as "658,4" on a live tile, and the
// regression arrived while fixing an unrelated bug on the same component.
// This walks every visible text node on every screen and fails on the risky
// shape — mixed Arabic + multi-character Latin/number in one un-isolated node.
test('no un-isolated Latin or numeric runs inside Arabic, on any screen', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('raedworkouts.active_user', 'b');
    localStorage.setItem('raedworkouts.b.settings.v1', JSON.stringify({ user_id: 'b', theme: 'light', skin: 'hadid', lang: 'ar', locale_version: 1 }));
  });
  await blockLiveSync(page);
  await page.goto(process.env.BIDI_URL || 'http://127.0.0.1:8899/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  // Any run of Latin/digits that is NOT inside a bdi/ltr-run is a bidi risk:
  // the algorithm may reorder it relative to the Arabic around it.
  const scan = () => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const txt = n.nodeValue || '';
      if (!/[A-Za-z0-9]/.test(txt)) continue;
      const el = n.parentElement;
      if (!el || el.offsetParent === null) continue;
      const isolated = el.closest('bdi, .ltr-run, [dir="ltr"], input, code');
      const arabic = /[؀-ۿ]/.test(txt);
      // A mixed Arabic+Latin/number run in one un-isolated node is the risky shape.
      if (arabic && !isolated && /\d{2,}|[A-Za-z]{2,}/.test(txt)) {
        out.push({ text: txt.trim().slice(0, 70), tag: el.tagName, cls: el.className?.toString().slice(0, 40) });
      }
    }
    return out;
  };
  const risks = await page.evaluate(scan);
  expect(risks, 'home').toEqual([]);

  for (const tab of ['library','history','coach','settings']) {
    await page.locator(`nav.tab-bar button[data-route="${tab}"]`).click();
    await page.waitForTimeout(700);
    const r = await page.evaluate(scan);
    expect(r, tab).toEqual([]);
  }
  // And the session card, the screen he actually lives on.
  await page.locator('nav.tab-bar button[data-route="home"]').click();
  await page.waitForTimeout(400);
  await page.locator('#page-home [data-home-view-exercises]').click();
  await page.waitForTimeout(500);
  const wp = page.locator('#page-home .warmup-phase');
  await wp.locator('.warmup-minute-picker button').first().click();
  const d = wp.locator('.warmup-drill');
  for (let i = 0; i < await d.count(); i += 1) await d.nth(i).click();
  await wp.locator('.btn.primary.full').click();
  await page.waitForTimeout(700);
  const rs = await page.evaluate(scan);
  expect(rs, 'session').toEqual([]);
});
