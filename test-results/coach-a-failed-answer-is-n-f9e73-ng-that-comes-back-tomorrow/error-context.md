# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: coach.spec.mjs >> a failed answer is not the thing that comes back tomorrow
- Location: tests/coach.spec.mjs:594:1

# Error details

```
TimeoutError: page.reload: Timeout 20000ms exceeded.
Call log:
  - waiting for navigation until "networkidle"
    - navigated to "http://localhost:8877/#coach"

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
      - heading "المدرب" [level=1] [ref=e20]
      - generic [ref=e21]:
        - generic [ref=e22]:
          - img [ref=e24]
          - generic [ref=e27]:
            - generic [ref=e28]: اسأل مكتبتك
            - generic [ref=e29]: الجواب مبنيّ على كتبك، والمقاطع اللي استُعملت تظهر تحته.
        - generic [ref=e30]:
          - textbox "اسأل عن التمرين أو التغذية…" [ref=e31]
          - button "اسأل" [ref=e32] [cursor=pointer]
      - generic [ref=e33]:
        - generic [ref=e34]: "جرّب واحدًا من هذه:"
        - generic [ref=e35]:
          - button "كم مجموعة لكل عضلة في الأسبوع؟" [ref=e36] [cursor=pointer]
          - button "هل أتمرّن حتى الفشل؟" [ref=e37] [cursor=pointer]
          - button "كم بروتينًا للحفاظ على العضلة؟" [ref=e38] [cursor=pointer]
      - generic [ref=e39]:
        - generic [ref=e40]: سألت قريباً
        - button "متى أسوي ديلود" [ref=e42] [cursor=pointer]
      - generic [ref=e43]:
        - generic [ref=e44]: الأجوبة من مكتبتك أنت — كتب جيف نيبارد.
        - generic [ref=e45]: لو كتبك ما تغطي شيئاً، يقول لك بدل ما يخمّن. وأي شيء من الإنترنت يجي مكتوب عليه.
  - navigation [ref=e46]:
    - button "الرئيسية" [ref=e47] [cursor=pointer]:
      - img [ref=e49]
      - generic [ref=e53]: الرئيسية
    - button "المكتبة" [ref=e54] [cursor=pointer]:
      - img [ref=e56]
      - generic [ref=e59]: المكتبة
    - button "السجل" [ref=e60] [cursor=pointer]:
      - img [ref=e62]
      - generic [ref=e65]: السجل
    - button "المدرب" [ref=e66] [cursor=pointer]:
      - img [ref=e68]
      - generic [ref=e71]: المدرب
    - button "الإعدادات" [ref=e72] [cursor=pointer]:
      - img [ref=e74]
      - generic [ref=e78]: الإعدادات
  - alert: فشلت المزامنة السحابية — حُفظت محلياً.
```

# Test source

```ts
  500 |   await expect(page.locator('[data-coach-answer]')).not.toContainText('[9]');
  501 |   await expect(page.locator('[data-coach-answer]')).not.toContainText('9');
  502 |   // And the card it points at carries the same number.
  503 |   await expect(page.locator('[data-coach-cited] .coach-cite')).toHaveText('2');
  504 |   await expect(page.locator('[data-coach-cited]')).toContainText('Book Two');
  505 |   console.log('COACH_CITATION_MARKERS_RESOLVE');
  506 | });
  507 | 
  508 | test('a refused key reads as a refusal, not as a dead server or an empty answer', async ({ page }) => {
  509 |   // The endpoint is public now, so 401 is a state Raed can actually hit — an
  510 |   // expired or rotated key. Collapsing it into "server down" would send him
  511 |   // restarting a service that is running perfectly.
  512 |   await page.route(COACH, (route) => route.fulfill({
  513 |     status: 401,
  514 |     contentType: 'application/json',
  515 |     body: JSON.stringify({ status: 'unauthorized' }),
  516 |   }));
  517 |   await openCoach(page);
  518 |   await ask(page);
  519 | 
  520 |   await expect(page.locator('[data-coach-error]')).toHaveCount(1);
  521 |   await expect(page.locator('#page-coach')).toContainText('رفضت المكتبة');
  522 |   await expect(page.locator('[data-coach-passage]')).toHaveCount(0);
  523 |   await expect(page.locator('[data-coach-no-match]')).toHaveCount(0);
  524 |   console.log('COACH_UNAUTHORIZED_DISTINGUISHED');
  525 | });
  526 | 
  527 | test('every request carries the access key', async ({ page }) => {
  528 |   let sentKey = null;
  529 |   await page.route(COACH, (route) => {
  530 |     sentKey = route.request().headers()['x-coach-key'] || null;
  531 |     return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'no_match', message: 'no match', results: [] }) });
  532 |   });
  533 |   await openCoach(page);
  534 |   await ask(page);
  535 |   // Without it the public endpoint answers 401 and the coach is simply dead.
  536 |   expect(sentKey).toBeTruthy();
  537 |   expect(sentKey.length).toBeGreaterThan(20);
  538 | });
  539 | 
  540 | // The sequence he actually performs in the gym: ask, go log the set the answer
  541 | // was about, come back. coachState was memory only, so coming back showed the
  542 | // empty ask screen and the only way to see the answer again was to pay for it
  543 | // again — /answer is the one metered call in this app.
  544 | test('the last answer survives leaving the app, and says it is the last one', async ({ page }) => {
  545 |   let calls = 0;
  546 |   await page.route(COACH, (route) => {
  547 |     calls += 1;
  548 |     return route.fulfill({
  549 |       status: 200,
  550 |       contentType: 'application/json',
  551 |       body: JSON.stringify({
  552 |         status: 'ok',
  553 |         answer: answer('دقيقتان إلى ثلاث بين المجموعات المركّبة. (The Hypertrophy Handbook، صفحة ٤٤)', [0]),
  554 |         results: [
  555 |           { text: 'rest 2-3 minutes between sets of compound exercises', work: 'The Hypertrophy Handbook', page: 44, score: 0.91 },
  556 |         ],
  557 |       }),
  558 |     });
  559 |   });
  560 |   await openCoach(page);
  561 |   await ask(page, 'كم راحة بين المجموعات');
  562 |   await expect(page.locator('[data-coach-answer]')).toContainText('دقيقتان');
  563 |   expect(calls).toBe(1);
  564 | 
  565 |   // Leave and come back the hard way — a full reload, which is what closing the
  566 |   // PWA and reopening it does.
  567 |   await page.reload({ waitUntil: 'networkidle' });
  568 |   await page.waitForTimeout(800);
  569 |   await page.evaluate(() => {
  570 |     const tab = [...document.querySelectorAll('.tab')].find((el) => /المدرب/.test(el.textContent));
  571 |     if (tab) tab.click();
  572 |   });
  573 |   await page.waitForTimeout(400);
  574 | 
  575 |   await expect(page.locator('[data-coach-answer]')).toContainText('دقيقتان');
  576 |   // The passage the answer cites came back with it, or the citation is a
  577 |   // dangling reference and the answer is unverifiable.
  578 |   await expect(page.locator('[data-coach-passage]')).toContainText('The Hypertrophy Handbook');
  579 |   // Restored, not re-fetched: no second metered call.
  580 |   expect(calls).toBe(1);
  581 |   // And it says so rather than passing an old answer off as a fresh one.
  582 |   await expect(page.locator('[data-coach-restored]')).toBeVisible();
  583 | 
  584 |   // «سؤال جديد» clears it back to the ask screen with its suggestions.
  585 |   await page.locator('[data-coach-restored] button').click();
  586 |   await page.waitForTimeout(300);
  587 |   await expect(page.locator('[data-coach-answer]')).toHaveCount(0);
  588 |   await expect(page.locator('[data-coach-scope]')).toBeVisible();
  589 | });
  590 | 
  591 | // An error is about a moment that has passed. Restoring «الخادم غير متاح» onto a
  592 | // screen he opens the next morning would be a statement about now that is not
  593 | // true, so only a successful answer is ever kept.
  594 | test('a failed answer is not the thing that comes back tomorrow', async ({ page }) => {
  595 |   await page.route(COACH, (route) => route.fulfill({ status: 503, contentType: 'text/html', body: '<html>down</html>' }));
  596 |   await openCoach(page);
  597 |   await ask(page, 'متى أسوي ديلود');
  598 |   await expect(page.locator('[data-coach-error]')).toBeVisible();
  599 | 
> 600 |   await page.reload({ waitUntil: 'networkidle' });
      |              ^ TimeoutError: page.reload: Timeout 20000ms exceeded.
  601 |   await page.waitForTimeout(800);
  602 |   await page.evaluate(() => {
  603 |     const tab = [...document.querySelectorAll('.tab')].find((el) => /المدرب/.test(el.textContent));
  604 |     if (tab) tab.click();
  605 |   });
  606 |   await page.waitForTimeout(400);
  607 |   await expect(page.locator('[data-coach-error]')).toHaveCount(0);
  608 |   await expect(page.locator('[data-coach-restored]')).toHaveCount(0);
  609 |   await expect(page.locator('[data-coach-scope]')).toBeVisible();
  610 | });
  611 | 
```