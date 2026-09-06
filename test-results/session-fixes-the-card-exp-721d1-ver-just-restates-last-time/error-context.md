# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: session-fixes.spec.mjs >> the card explains a weight DECISION, and never just restates last time
- Location: tests/session-fixes.spec.mjs:474:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.last-time').first()
Expected: 1
Received: 0
Timeout:  10000ms

Call log:
  - Expect "toHaveCount" with timeout 10000ms
  - waiting for locator('.last-time').first()
    14 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]:
      - img [ref=e4]
      - generic [ref=e6]: Raedworkouts Go
    - button "افتح النادي" [ref=e8] [cursor=pointer]:
      - img [ref=e9]
  - main [ref=e17]:
    - generic [ref=e18]:
      - generic [ref=e19]:
        - generic [ref=e20]:
          - generic [ref=e21]: الأحد · يوم نادٍ
          - heading "سفلي أ" [level=2] [ref=e22]
          - generic [ref=e23]:
            - generic [ref=e24]: "6"
            - text: تمارين ·
            - generic [ref=e25]: ~55 دقيقة
          - generic [ref=e26]: الأسبوع 2 · الدورة 1
        - generic [ref=e27]:
          - img [ref=e28]
          - generic [ref=e31]:
            - generic [ref=e32]: "1"
            - generic [ref=e33]: /4
          - generic [ref=e34]: هذا الأسبوع
      - generic [ref=e35]:
        - button "▶ ابدأ سفلي أ" [ref=e36] [cursor=pointer]
        - button "اختر تمريناً آخر ▾" [ref=e38] [cursor=pointer]
        - generic [ref=e39]:
          - generic [ref=e40]:
            - generic [ref=e41]: "اليوم: سفلي أ"
            - generic [ref=e42]:
              - generic "علوي أ" [ref=e43]:
                - generic [ref=e44]: السبت
                - generic [ref=e45]: ●
              - generic [ref=e46]:
                - generic [ref=e47]: الأحد
                - generic [ref=e48]: ·
              - generic [ref=e50]: الاثنين
              - generic [ref=e52]: الثلاثاء
              - generic [ref=e54]: الأربعاء
              - generic [ref=e56]: الخميس
              - generic [ref=e58]: الجمعة
            - generic [ref=e59]: باقي 3 جلسات هذا الأسبوع
          - generic [ref=e60]:
            - generic [ref=e61]:
              - generic [ref=e62]: "5"
              - generic [ref=e63]: المواظبة
              - generic [ref=e64]: جلسات / 4 أسابيع
            - generic [ref=e65]:
              - generic [ref=e66]: "19"
              - generic [ref=e67]: هذا الأسبوع
              - generic [ref=e68]: مجموعات عمل
            - generic [ref=e69]:
              - generic [ref=e70]: 1,691
              - generic [ref=e71]: الحمل الكلي
              - generic [ref=e72]: كغ هذا الأسبوع
        - generic [ref=e73]:
          - generic [ref=e74]:
            - img [ref=e75]
            - generic [ref=e79]: "Apple Music — شغّل وانسَ الموضوع:"
          - generic [ref=e80]:
            - link "Pure Workout" [ref=e81] [cursor=pointer]:
              - /url: https://music.apple.com/sa/search?term=pure%20workout
              - generic [ref=e82]: Pure Workout
            - link "Pump Up" [ref=e83] [cursor=pointer]:
              - /url: https://music.apple.com/sa/search?term=pump%20up%20workout
              - generic [ref=e84]: Pump Up
      - heading "خطة التمرين" [level=3] [ref=e85]
      - generic [ref=e89] [cursor=pointer]:
        - heading "1. Leg Press" [level=4] [ref=e90]
        - generic [ref=e91]:
          - generic [ref=e92]: مقدمة الفخذ
          - generic [ref=e93]: 3 × 10-12
          - text: ·
          - strong [ref=e94]: 52 kg
      - generic [ref=e98] [cursor=pointer]:
        - heading "2. Romanian Deadlift" [level=4] [ref=e99]
        - generic [ref=e100]:
          - generic [ref=e101]: خلف الفخذ
          - generic [ref=e102]: 3 × 10-12
          - text: ·
          - strong [ref=e103]: 15 kg
      - generic [ref=e107] [cursor=pointer]:
        - heading "3. Prone Leg Curl" [level=4] [ref=e108]
        - generic [ref=e109]:
          - generic [ref=e110]: خلف الفخذ
          - generic [ref=e111]: 3 × 10-12
          - text: ·
          - strong [ref=e112]: —
      - generic [ref=e116] [cursor=pointer]:
        - heading "4. Leg Extension" [level=4] [ref=e117]
        - generic [ref=e118]:
          - generic [ref=e119]: مقدمة الفخذ
          - generic [ref=e120]: 3 × 10-12
          - text: ·
          - strong [ref=e121]: 9 kg
      - generic [ref=e125] [cursor=pointer]:
        - heading "5. Standing Calf Raise" [level=4] [ref=e126]
        - generic [ref=e127]:
          - generic [ref=e128]: سمانة
          - generic [ref=e129]: 3 × 10-12
          - text: ·
          - strong [ref=e130]: —
      - generic [ref=e134] [cursor=pointer]:
        - heading "6. Cable Crunch" [level=4] [ref=e135]
        - generic [ref=e136]:
          - generic [ref=e137]: بطن
          - generic [ref=e138]: 3 × 10-12
          - text: ·
          - strong [ref=e139]: 1 kg
  - navigation [ref=e140]:
    - button "الرئيسية" [ref=e141] [cursor=pointer]:
      - img [ref=e143]
      - generic [ref=e147]: الرئيسية
    - button "المدرب" [ref=e148] [cursor=pointer]:
      - img [ref=e150]
      - generic [ref=e153]: المدرب
    - button "السجل" [ref=e154] [cursor=pointer]:
      - img [ref=e156]
      - generic [ref=e159]: السجل
    - button "المكتبة" [ref=e160] [cursor=pointer]:
      - img [ref=e162]
      - generic [ref=e165]: المكتبة
    - button "الإعدادات" [ref=e166] [cursor=pointer]:
      - img [ref=e168]
      - generic [ref=e172]: الإعدادات
  - alert
```

# Test source

```ts
  396 | 
  397 |   const title = (await banner.locator('h2').textContent()).trim();
  398 |   const sub = await banner.locator('p').count() ? (await banner.locator('p').first().textContent()).trim() : '';
  399 |   // The subtitle used to fall back to the FULL name when a session had no
  400 |   // " — " half, so the card printed its own title a second line down.
  401 |   expect(sub).not.toBe(title);
  402 | });
  403 | 
  404 | test('the volume-ledger verdict is Arabic, rebuilt from numbers not translated prose', async ({ page }) => {
  405 |   await intoSession(page);
  406 |   await openExerciseSheet(page);
  407 |   await page.locator('#modal [data-open-swap]').click();
  408 |   await page.waitForTimeout(400);
  409 |   await page.waitForTimeout(600);
  410 |   const option = page.locator('#modal .swap-option').first();
  411 |   test.skip(!(await option.count()), 'this exercise has no alternatives to swap to');
  412 |   await option.click();
  413 |   await page.waitForTimeout(700);
  414 | 
  415 |   const verdict = page.locator('[data-ledger-message]').first();
  416 |   await expect(verdict).toHaveCount(1);
  417 |   const text = await verdict.textContent();
  418 |   // The domain keeps its English sentence for tests and logs; the screen must
  419 |   // not show it. "fractional-set", "crosses the hard", "efficiency band" are
  420 |   // that sentence leaking through.
  421 |   expect(text).not.toMatch(/fractional|efficiency band|crosses the hard|remains inside/i);
  422 |   // Muscle names are rendered through the Arabic label map, not raw ids.
  423 |   expect(text).not.toMatch(/\b(forearms|quads|glutes|triceps|biceps)\b/);
  424 |   expect(text).toMatch(/[؀-ۿ]/);
  425 | });
  426 | 
  427 | test('swiping moves through the exercises in programme order', async ({ page }) => {
  428 |   // Earlier tests in this file swap exercises and append new ones, and that
  429 |   // state persists. Start from a discarded session so this measures the swipe
  430 |   // rather than whatever the previous test left behind.
  431 |   await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  432 |   await page.addInitScript(() => {
  433 |     for (const key of Object.keys(localStorage)) {
  434 |       if (!/\.state\./.test(key)) continue;
  435 |       try {
  436 |         const parsed = JSON.parse(localStorage[key]);
  437 |         parsed.active_session = null;
  438 |         parsed.substitutions = [];
  439 |         localStorage[key] = JSON.stringify(parsed);
  440 |       } catch { /* a malformed key is not this test's problem */ }
  441 |     }
  442 |   });
  443 |   await intoSession(page);
  444 |   const order = await page.evaluate(() => {
  445 |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  446 |     return Object.keys(JSON.parse(localStorage[key]).active_session.exercises);
  447 |   });
  448 |   const current = async () => (await page.locator('#page-home .ex.expanded h4').first().textContent()).trim();
  449 |   const visited = [await current()];
  450 | 
  451 |   for (let i = 0; i < 2; i += 1) {
  452 |     // Drag across the card HEADER. The handler deliberately ignores gestures
  453 |     // that start on an input or a button, and the card body is full of both —
  454 |     // so a fixed offset into the card lands somewhere different depending on
  455 |     // which exercise is showing, and the swipe is silently ignored.
  456 |     const head = page.locator('#page-home .ex.expanded .ex-head').first();
  457 |     const box = await head.boundingBox();
  458 |     const y = box.y + box.height / 2;
  459 |     await page.mouse.move(box.x + box.width - 20, y);
  460 |     await page.mouse.down();
  461 |     // RTL: dragging toward the left edge means "forward".
  462 |     await page.mouse.move(box.x + 20, y, { steps: 14 });
  463 |     await page.mouse.up();
  464 |     await page.waitForTimeout(700);
  465 |     visited.push(await current());
  466 |   }
  467 | 
  468 |   // Three distinct exercises, in the order the programme prescribes — not
  469 |   // shuffled, and not stuck on the same card.
  470 |   expect(new Set(visited).size).toBe(visited.length);
  471 |   expect(visited.length).toBeLessThanOrEqual(order.length);
  472 | });
  473 | 
  474 | test('the card explains a weight DECISION, and never just restates last time', async ({ page }) => {
  475 |   // Raed asked for the reason behind the number ("رقم بدون سبب = المشكلة
  476 |   // الحقيقية"), and then asked for one specific note to go: «المرة الماضية: 10
  477 |   // كغ × 6. اعدلها أو تجاوزها» — "وش أعدلها أو أتجاوزها ما أدري صراحة".
  478 |   //
  479 |   // Both are right, and they are about different notes. Eight of the nine
  480 |   // explain a decision — hold this load, bump it, add a rep because this is an
  481 |   // accessory, today is a calibration. The ninth restates «آخر مرة», which is
  482 |   // printed in full under the sets, and adds an instruction naming no number.
  483 |   // It was also the fallback branch, so it was the one he saw most.
  484 |   await intoSession(page);
  485 |   const why = page.locator('[data-why-weight]');
  486 |   if (await why.count()) {
  487 |     const text = (await why.first().textContent()).trim();
  488 |     expect(text.length).toBeGreaterThan(10);
  489 |     // Arabic, not the engine's English reasoning leaking through.
  490 |     expect(text).toMatch(/[؀-ۿ]/);
  491 |     expect(text).not.toMatch(/Match or beat|Re-entry seed|every set|accessory/i);
  492 |     // Whatever is shown must be a decision, not a repeat of «آخر مرة».
  493 |     expect(text, 'the restatement note must not be rendered').not.toMatch(/اعدلها أو تجاوزها/);
  494 |   }
  495 |   // «آخر مرة» itself still exists — it moved below the sets, it did not go.
> 496 |   await expect(page.locator('.last-time').first()).toHaveCount(1);
      |                                                    ^ Error: expect(locator).toHaveCount(expected) failed
  497 |   // It is an explanation, not a form cue — Raed removed cues on purpose.
  498 |   await expect(page.locator('#page-home')).not.toContainText('Cue:');
  499 | });
  500 | 
  501 | test('during a session the first set row is reachable without scrolling', async ({ page }) => {
  502 |   await page.setViewportSize({ width: 390, height: 844 });
  503 |   await intoSession(page);
  504 | 
  505 |   const top = async (sel) => page.evaluate((s) => {
  506 |     const el = document.querySelector(s);
  507 |     return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null;
  508 |   }, sel);
  509 | 
  510 |   await expect(page.locator('body.session-active')).toHaveCount(1);
  511 |   const firstRow = await top('[data-session-set-row]');
  512 |   // It measured y=952 on an 844px screen before the context block was ordered
  513 |   // below the workout, so logging the opening set of EVERY exercise began with
  514 |   // a scroll. That is the core interaction of the app.
  515 |   expect(firstRow).toBeLessThan(844);
  516 | 
  517 |   // The pre-workout context is not deleted — it is not SHOWN while a session is
  518 |   // running. Raed: "هذي شيلها، هذي المفروض بس تكون موجودة لو ما بديت التمرين".
  519 |   // This assertion used to pin the old mechanism (context ordered below the
  520 |   // exercise) rather than the outcome, so hiding it outright failed a test that
  521 |   // its own stated purpose was satisfied by.
  522 |   await expect(page.locator('[data-home-context]')).toBeHidden();
  523 |   // Still in the DOM, so it returns intact the moment the session ends.
  524 |   await expect(page.locator('[data-week-card]')).toHaveCount(1);
  525 |   await expect(page.locator('[data-home-stat-tiles]')).toHaveCount(1);
  526 | });
  527 | 
  528 | test('before a session home reads top to bottom in its natural order', async ({ page }) => {
  529 |   await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  530 |   await page.goto(appUrl, { waitUntil: 'networkidle' });
  531 |   await page.waitForTimeout(700);
  532 |   await page.evaluate(() => {
  533 |     const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
  534 |     if (tile) tile.click();
  535 |   });
  536 |   await page.waitForTimeout(800);
  537 |   // Clear AFTER the app has loaded and written its state. Clearing beforehand
  538 |   // does nothing on a first load, because there is nothing there yet.
  539 |   await page.evaluate(() => {
  540 |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  541 |     const parsed = JSON.parse(localStorage[key]);
  542 |     parsed.active_session = null;
  543 |     localStorage[key] = JSON.stringify(parsed);
  544 |   });
  545 |   await page.reload({ waitUntil: 'networkidle' });
  546 |   await page.waitForTimeout(900);
  547 |   // No session running, so the reorder must NOT apply — the week and the tiles
  548 |   // are the point of the screen at that moment.
  549 |   await expect(page.locator('body.session-active')).toHaveCount(0);
  550 | });
  551 | 
  552 | test('weekly volume reads the same on every device', async ({ page }) => {
  553 |   await intoSession(page);
  554 |   const volume = await page.locator('[data-home-stat-tiles] .stat-num').first().textContent();
  555 |   // The locale-less formatter followed the DEVICE, so this rendered "267.2" on
  556 |   // one phone and "267,2" on another — and neither matched the weight fields,
  557 |   // which always use a dot. Whole kilos, grouped, no decimal at all.
  558 |   expect(volume.trim()).toMatch(/^\d{1,3}(,\d{3})*$/);
  559 | });
  560 | 
  561 | test('the effort picker appears by itself when the second-to-last set is ticked', async ({ page }) => {
  562 |   await intoSession(page);
  563 | 
  564 |   // Raed removed the trigger button: "الزر الزائد هذا... ما يحتاج يكون ظاهر،
  565 |   // لأنه هو أصلًا أوتوماتيك". A face whose only job is to open something that
  566 |   // opens on its own is chrome, so there is no trigger to assert on any more.
  567 |   await expect(page.locator('[data-effort-trigger]')).toHaveCount(0);
  568 |   await expect(page.locator('.effort-strip:not([hidden])')).toHaveCount(0);
  569 | 
  570 |   // Ramp sets first — the app requires them before a working set can be ticked.
  571 |   const ramps = page.locator('[data-set-kind="warmup"]');
  572 |   for (let i = 0; i < await ramps.count(); i += 1) {
  573 |     await ramps.nth(i).locator('.set-check').click();
  574 |     await page.waitForTimeout(200);
  575 |   }
  576 | 
  577 |   // Tick every working set except the last. The picker must be open by then,
  578 |   // because the last set is the one that needs it.
  579 |   const working = page.locator('[data-set-kind="working"]');
  580 |   const total = await working.count();
  581 |   for (let i = 0; i < total - 1; i += 1) {
  582 |     const row = working.nth(i);
  583 |     await row.locator('input').nth(0).fill('40');
  584 |     await row.locator('input').nth(1).fill('10');
  585 |     await page.waitForTimeout(150);
  586 |     await row.locator('.set-check').click();
  587 |     await page.waitForTimeout(300);
  588 |   }
  589 | 
  590 |   await expect(page.locator('.effort-strip:not([hidden])')).toHaveCount(1);
  591 |   const faces = await page.locator('.effort-strip .effort-emoji').allTextContents();
  592 |   expect(faces.join('')).toBe('😌💪🥵');
  593 | 
  594 |   await page.locator('.effort-strip .effort-picker button').nth(1).click();
  595 |   await page.waitForTimeout(600);
  596 |   // The choice persists and the strip stays visible showing it.
```