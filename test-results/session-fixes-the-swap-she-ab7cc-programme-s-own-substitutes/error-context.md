# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: session-fixes.spec.mjs >> the swap sheet leads with the programme's own substitutes
- Location: tests/session-fixes.spec.mjs:838:1

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('#page-home .ex.expanded [data-exercise-settings]').first()

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
  1   | import { expect, test } from '@playwright/test';
  2   | 
  3   | const appUrl = process.env.APP_URL || 'http://localhost:8877';
  4   | 
  5   | // A phone viewport, because this is a phone app. On the runner's default
  6   | // 1280x720 the exercise card sits outside the viewport, so boundingBox() hands
  7   | // back coordinates the mouse can never reach and a swipe silently does nothing.
  8   | test.use({ viewport: { width: 390, height: 1300 } });
  9   | 
  10  | // Controls that belong to the EXERCISE rather than to a set now live in the
  11  | // per-exercise settings sheet behind the gear in the card header. Same
  12  | // behaviour, one tap further in.
  13  | async function openExerciseSheet(page) {
> 14  |   await page.locator('#page-home .ex.expanded [data-exercise-settings]').first().click();
      |                                                                                  ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  15  |   await page.waitForTimeout(500);
  16  | }
  17  | async function closeExerciseSheet(page) {
  18  |   await page.locator('#modal .xs-done').click();
  19  |   await page.waitForTimeout(400);
  20  | }
  21  | 
  22  | async function intoSession(page) {
  23  |   await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  24  |   await page.goto(appUrl, { waitUntil: 'networkidle' });
  25  |   await page.waitForTimeout(800);
  26  |   await page.evaluate(() => {
  27  |     const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
  28  |     if (tile) tile.click();
  29  |   });
  30  |   await page.waitForTimeout(700);
  31  |   await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  32  |   await page.waitForTimeout(900);
  33  |   await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  34  |   await page.waitForTimeout(900);
  35  | }
  36  | 
  37  | test('the card states the rep target that actually earns an increase', async ({ page }) => {
  38  |   await intoSession(page);
  39  |   const goal = page.locator('[data-reps-goal]').first();
  40  |   await expect(goal).toBeVisible();
  41  |   // Read the range off the card rather than hardcoding a session: the seeded
  42  |   // day is not always the same one, and the rule is what matters -- the number
  43  |   // shown must be the TOP of the range, since only completing that raises load.
  44  |   const meta = await page.locator('#page-home .ex.expanded .meta').first().textContent();
  45  |   const top = meta.match(/(\d+)\s*[-–]\s*(\d+)/)?.[2];
  46  |   expect(top).toBeTruthy();
  47  |   await expect(goal).toContainText(top);
  48  |   await expect(goal).toContainText('ليرتفع الوزن');
  49  | });
  50  | 
  51  | test('the superset pair is announced on the first movement, and the rest timer obeys it', async ({ page }) => {
  52  |   await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  53  |   await page.goto(appUrl, { waitUntil: 'networkidle' });
  54  |   await page.waitForTimeout(800);
  55  |   await page.evaluate(() => {
  56  |     const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
  57  |     if (tile) tile.click();
  58  |   });
  59  |   await page.waitForTimeout(900);
  60  |   // Force Upper A: it is the session that actually holds the A1/A2 pair. The
  61  |   // seeded day is often Lower A, where this test would pass vacuously — which
  62  |   // is exactly how the old version of it missed that the note never rendered.
  63  |   await page.evaluate(() => {
  64  |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  65  |     const parsed = JSON.parse(localStorage[key]);
  66  |     parsed.active_session = null;
  67  |     parsed.forced_next_session = 'upper_a';
  68  |     localStorage[key] = JSON.stringify(parsed);
  69  |   });
  70  |   await page.reload({ waitUntil: 'networkidle' });
  71  |   await page.waitForTimeout(900);
  72  |   await page.evaluate(() => {
  73  |     const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
  74  |     if (tile) tile.click();
  75  |   });
  76  |   await page.waitForTimeout(700);
  77  |   await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  78  |   await page.waitForTimeout(900);
  79  |   await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  80  |   await page.waitForTimeout(900);
  81  | 
  82  |   const seen = [];
  83  |   for (let i = 0; i < 8; i += 1) {
  84  |     // The rest control moved into the per-exercise sheet along with everything
  85  |     // else that belongs to the exercise rather than to a set, so the
  86  |     // prescription has to be read from there now. The superset note stays on
  87  |     // the card: it describes the pairing, which he needs to see while lifting.
  88  |     const superset = await page.evaluate(() => document.querySelector('[data-superset]')?.textContent.trim() || null);
  89  |     const name = await page.evaluate(() => document.querySelector('#page-home .ex.expanded h4')?.textContent.trim());
  90  |     await openExerciseSheet(page);
  91  |     seen.push({
  92  |       name, superset,
  93  |       ...(await page.evaluate(() => ({
  94  |         rest: document.querySelector('#modal [data-rest-button]')?.textContent.trim() || null,
  95  |         noRest: Boolean(document.querySelector('#modal [data-no-rest]')),
  96  |       }))),
  97  |     });
  98  |     await closeExerciseSheet(page);
  99  |     const moved = await page.evaluate(() => {
  100 |       const next = [...document.querySelectorAll('button')].find((el) => /التمرين التالي/.test(el.textContent));
  101 |       if (!next) return false;
  102 |       next.click();
  103 |       return true;
  104 |     });
  105 |     if (!moved) break;
  106 |     await page.waitForTimeout(600);
  107 |   }
  108 | 
  109 |   // Announced exactly once — on the movement reached first, naming its partner.
  110 |   const announced = seen.filter((row) => row.superset);
  111 |   expect(announced).toHaveLength(1);
  112 |   expect(announced[0].superset).toMatch(/سوبرست/);
  113 | 
  114 |   // And the timer obeys the prescription. `rest_min` sat in data.js consumed by
```