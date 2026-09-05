# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: session-recovery.spec.mjs >> finishing by accident can be undone from the toast
- Location: tests/session-recovery.spec.mjs:121:1

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-v15-session-progress] .sp-seg').last()

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
          - generic [ref=e21]: السبت · يوم نادٍ
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
            - generic [ref=e41]: تدرّبت اليوم
            - generic [ref=e42]:
              - generic "علوي أ" [ref=e43]:
                - generic [ref=e44]: السبت
                - generic [ref=e45]: ●
              - generic [ref=e47]: الأحد
              - generic [ref=e49]: الاثنين
              - generic [ref=e51]: الثلاثاء
              - generic [ref=e53]: الأربعاء
              - generic [ref=e55]: الخميس
              - generic [ref=e57]: الجمعة
            - generic [ref=e58]: باقي 3 جلسات هذا الأسبوع
          - generic [ref=e59]:
            - generic [ref=e60]:
              - generic [ref=e61]: "5"
              - generic [ref=e62]: المواظبة
              - generic [ref=e63]: جلسات / 4 أسابيع
            - generic [ref=e64]:
              - generic [ref=e65]: "19"
              - generic [ref=e66]: هذا الأسبوع
              - generic [ref=e67]: مجموعات عمل
            - generic [ref=e68]:
              - generic [ref=e69]: 1,691
              - generic [ref=e70]: الحمل الكلي
              - generic [ref=e71]: كغ هذا الأسبوع
        - generic [ref=e72]:
          - generic [ref=e73]:
            - img [ref=e74]
            - generic [ref=e78]: "Apple Music — شغّل وانسَ الموضوع:"
          - generic [ref=e79]:
            - link "Pure Workout" [ref=e80] [cursor=pointer]:
              - /url: https://music.apple.com/sa/search?term=pure%20workout
              - generic [ref=e81]: Pure Workout
            - link "Pump Up" [ref=e82] [cursor=pointer]:
              - /url: https://music.apple.com/sa/search?term=pump%20up%20workout
              - generic [ref=e83]: Pump Up
      - heading "خطة التمرين" [level=3] [ref=e84]
      - generic [ref=e88] [cursor=pointer]:
        - heading "1. Leg Press" [level=4] [ref=e89]
        - generic [ref=e90]:
          - generic [ref=e91]: مقدمة الفخذ
          - generic [ref=e92]: 3 × 10-12
          - text: ·
          - strong [ref=e93]: 52 kg
      - generic [ref=e97] [cursor=pointer]:
        - heading "2. Romanian Deadlift" [level=4] [ref=e98]
        - generic [ref=e99]:
          - generic [ref=e100]: خلف الفخذ
          - generic [ref=e101]: 3 × 10-12
          - text: ·
          - strong [ref=e102]: 15 kg
      - generic [ref=e106] [cursor=pointer]:
        - heading "3. Prone Leg Curl" [level=4] [ref=e107]
        - generic [ref=e108]:
          - generic [ref=e109]: خلف الفخذ
          - generic [ref=e110]: 3 × 10-12
          - text: ·
          - strong [ref=e111]: —
      - generic [ref=e115] [cursor=pointer]:
        - heading "4. Leg Extension" [level=4] [ref=e116]
        - generic [ref=e117]:
          - generic [ref=e118]: مقدمة الفخذ
          - generic [ref=e119]: 3 × 10-12
          - text: ·
          - strong [ref=e120]: 9 kg
      - generic [ref=e124] [cursor=pointer]:
        - heading "5. Standing Calf Raise" [level=4] [ref=e125]
        - generic [ref=e126]:
          - generic [ref=e127]: سمانة
          - generic [ref=e128]: 3 × 10-12
          - text: ·
          - strong [ref=e129]: —
      - generic [ref=e133] [cursor=pointer]:
        - heading "6. Cable Crunch" [level=4] [ref=e134]
        - generic [ref=e135]:
          - generic [ref=e136]: بطن
          - generic [ref=e137]: 3 × 10-12
          - text: ·
          - strong [ref=e138]: 1 kg
  - navigation [ref=e139]:
    - button "الرئيسية" [ref=e140] [cursor=pointer]:
      - img [ref=e142]
      - generic [ref=e146]: الرئيسية
    - button "المدرب" [ref=e147] [cursor=pointer]:
      - img [ref=e149]
      - generic [ref=e152]: المدرب
    - button "السجل" [ref=e153] [cursor=pointer]:
      - img [ref=e155]
      - generic [ref=e158]: السجل
    - button "المكتبة" [ref=e159] [cursor=pointer]:
      - img [ref=e161]
      - generic [ref=e164]: المكتبة
    - button "الإعدادات" [ref=e165] [cursor=pointer]:
      - img [ref=e167]
      - generic [ref=e171]: الإعدادات
  - alert
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | 
  3   | // Raed pressed "finish" by accident and had no way back: the session was gone
  4   | // from the workout screen and the log offered no way in. An hour of work must
  5   | // not be one mis-tap from unreachable.
  6   | const appUrl = 'http://127.0.0.1:8899/index.html';
  7   | test.use({ viewport: { width: 390, height: 844 } });
  8   | 
  9   | async function intoSession(page) {
  10  |   await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
  11  |   await page.goto(appUrl, { waitUntil: 'networkidle' });
  12  |   await page.waitForTimeout(800);
  13  |   await page.evaluate(() => { const t = [...document.querySelectorAll('.profile-tile')].find((e) => /Raed/.test(e.textContent)); if (t) t.click(); });
  14  |   await page.waitForTimeout(700);
  15  |   await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  16  |   await page.waitForTimeout(900);
  17  |   await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  18  |   await page.waitForTimeout(900);
  19  | }
  20  | 
  21  | async function completeFirstExercise(page) {
  22  |   // Every set, not one: an exercise with sets still open is UNRESOLVED, and
  23  |   // finishing then offers to discard rather than save. Saving is the path the
  24  |   // undo exists for.
  25  |   const ramps = page.locator('[data-set-kind="warmup"]');
  26  |   for (let i = 0; i < await ramps.count(); i += 1) {
  27  |     await ramps.nth(i).locator('.set-check').click();
  28  |     await page.waitForTimeout(180);
  29  |   }
  30  |   const working = page.locator('[data-set-kind="working"]');
  31  |   const n = await working.count();
  32  |   for (let i = 0; i < n; i += 1) {
  33  |     const row = working.nth(i);
  34  |     await row.locator('input').nth(0).fill('42.5');
  35  |     await row.locator('input').nth(1).fill('10');
  36  |     await page.waitForTimeout(120);
  37  |     // The final set needs an effort before it will tick — the picker opens by
  38  |     // itself once the set before it is done.
  39  |     if (i === n - 1) {
  40  |       const pick = page.locator('.effort-strip:not([hidden]) .effort-picker button').nth(1);
  41  |       if (await pick.count()) { await pick.click(); await page.waitForTimeout(300); }
  42  |     }
  43  |     await row.locator('.set-check').click();
  44  |     await page.waitForTimeout(320);
  45  |   }
  46  | }
  47  | 
  48  | // "Finish & save" lives on the LAST exercise only now — Raed wanted it in one
  49  | // place so he stops scrolling past it under every card.
  50  | async function goToLastExercise(page) {
  51  |   const segs = page.locator('[data-v15-session-progress] .sp-seg');
> 52  |   await segs.nth(await segs.count() - 1).click();
      |                                          ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  53  |   await page.waitForTimeout(600);
  54  | }
  55  | 
  56  | const readState = (page) => page.evaluate(() => {
  57  |   const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  58  |   const s = JSON.parse(localStorage[key]);
  59  |   return { active: !!s.active_session, history: (s.history || []).length };
  60  | });
  61  | 
  62  | test('the delete-session button says it deletes, and asks in-app', async ({ page }) => {
  63  |   // It was labelled «تجاهل التمرين» — "skip the exercise" — sat under the
  64  |   // exercise card beside a real skip action, ran behind a native confirm()
  65  |   // whose body was that same misleading label, and had no undo. The most
  66  |   // destructive control in the app read like the least.
  67  |   await intoSession(page);
  68  |   await completeFirstExercise(page);
  69  |   const before = await readState(page);
  70  | 
  71  |   // Reachable mid-session, not only at the end: abandoning a session is a
  72  |   // decision made in the middle of one. It is small now rather than a
  73  |   // full-width danger slab, but it is there.
  74  |   const discard = page.locator('[data-discard-session]').first();
  75  |   await expect(discard).toHaveCount(1);
  76  |   // The label must name the SESSION. The one that had to go was «تجاهل التمرين»
  77  |   // — "skip the exercise" — on a button that deleted the whole workout.
  78  |   await expect(discard).toContainText('الجلسة');
  79  |   await expect(discard, 'must not read as skipping one exercise').not.toContainText('تجاهل التمرين');
  80  | 
  81  |   await discard.click();
  82  |   await page.waitForTimeout(500);
  83  |   // In-app dialog, not the native one an installed PWA can suppress.
  84  |   await expect(page.locator('#modal [data-confirm-yes]')).toHaveCount(1);
  85  |   await expect(page.locator('#modal')).toContainText('ما فيه تراجع');
  86  | 
  87  |   await page.locator('#modal [data-confirm-no]').click();
  88  |   await page.waitForTimeout(500);
  89  |   const after = await readState(page);
  90  |   expect(after.active, 'declining keeps the session').toBe(true);
  91  |   expect(after.history).toBe(before.history);
  92  |   console.log('DISCARD_SESSION_NAMED_AND_GUARDED');
  93  | });
  94  | 
  95  | test('finishing with exercises still open asks first, and declining keeps the session', async ({ page }) => {
  96  |   // The guard used to fire only when NOTHING was logged, so the realistic
  97  |   // accident — one exercise done, six untouched, a stray tap on finish — went
  98  |   // straight into history as a completed session and fed the volume ledger a
  99  |   // number he never lifted. The test above tolerated the dialog with an
  100 |   // `if (count)`, so it passed either way and certified nothing.
  101 |   await intoSession(page);
  102 |   await completeFirstExercise(page);
  103 |   const before = await readState(page);
  104 | 
  105 |   await goToLastExercise(page);
  106 |   await page.locator('[data-finish-session]').click();
  107 | 
  108 |   const guard = page.locator('#modal [data-confirm-yes]');
  109 |   await expect(guard, 'the session must not close silently').toHaveCount(1);
  110 |   await expect(page.locator('#modal')).toContainText('ما خلصت');
  111 | 
  112 |   // Declining leaves everything exactly as it was.
  113 |   await page.locator('#modal [data-confirm-no]').click();
  114 |   await page.waitForTimeout(600);
  115 |   const after = await readState(page);
  116 |   expect(after.active, 'the session is still running').toBe(true);
  117 |   expect(after.history, 'and nothing was archived').toBe(before.history);
  118 |   console.log('FINISH_WITH_OPEN_EXERCISES_GUARDED');
  119 | });
  120 | 
  121 | test('finishing by accident can be undone from the toast', async ({ page }) => {
  122 |   await intoSession(page);
  123 |   await completeFirstExercise(page);
  124 |   const before = await readState(page);
  125 | 
  126 |   await goToLastExercise(page);
  127 |   await page.locator('[data-finish-session]').click();
  128 |   // Finishing with sets still open asks first — that guard is itself part of the
  129 |   // protection he asked for. Wait for it rather than sampling: a fixed sleep
  130 |   // raced the dialog's own render.
  131 |   // With the exercise resolved this saves outright; the discard guard only
  132 |   // appears when nothing was logged.
  133 |   await page.waitForTimeout(900);
  134 |   const guard = page.locator('#modal [data-confirm-yes]');
  135 |   if (await guard.count()) { await guard.click(); await page.waitForTimeout(800); }
  136 |   const finished = await readState(page);
  137 |   expect(finished.active, 'the session is closed').toBe(false);
  138 |   expect(finished.history).toBe(before.history + 1);
  139 | 
  140 |   // The undo lives on the toast, and the toast is up for long enough to notice.
  141 |   await page.locator('#toast button').click();
  142 |   await page.waitForTimeout(900);
  143 |   const undone = await readState(page);
  144 |   expect(undone.active, 'the session is live again').toBe(true);
  145 |   expect(undone.history, 'and it is out of the log again').toBe(before.history);
  146 | });
  147 | 
  148 | test('a finished session can be reopened from the log later', async ({ page }) => {
  149 |   await intoSession(page);
  150 |   await completeFirstExercise(page);
  151 |   const before = await readState(page);
  152 | 
```