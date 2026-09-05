# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: coach.spec.mjs >> the passage count agrees in Arabic: singular, dual, then plural
- Location: tests/coach.spec.mjs:184:1

# Error details

```
TimeoutError: page.goto: Timeout 20000ms exceeded.
Call log:
  - navigating to "http://localhost:8877/", waiting until "networkidle"

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
          - heading "علوي أ" [level=2] [ref=e22]
          - generic [ref=e23]:
            - generic [ref=e24]: "7"
            - text: تمارين ·
            - generic [ref=e25]: ~65 دقيقة
          - generic [ref=e26]: الأسبوع 2 · الدورة 1
        - generic [ref=e27]:
          - img [ref=e28]
          - generic [ref=e30]:
            - generic [ref=e31]: "0"
            - generic [ref=e32]: /4
          - generic [ref=e33]: هذا الأسبوع
      - generic [ref=e34]:
        - button "▶ ابدأ علوي أ" [ref=e35] [cursor=pointer]
        - button "اختر تمريناً آخر ▾" [ref=e37] [cursor=pointer]
        - generic [ref=e38]:
          - generic [ref=e39]:
            - generic [ref=e40]: "اليوم: علوي أ"
            - generic [ref=e41]:
              - generic [ref=e42]:
                - generic [ref=e43]: السبت
                - generic [ref=e44]: ·
              - generic [ref=e46]: الأحد
              - generic [ref=e48]: الاثنين
              - generic [ref=e50]: الثلاثاء
              - generic [ref=e52]: الأربعاء
              - generic [ref=e54]: الخميس
              - generic [ref=e56]: الجمعة
            - generic [ref=e57]: باقي 4 جلسات هذا الأسبوع
          - generic [ref=e58]:
            - generic [ref=e59]:
              - generic [ref=e60]: "4"
              - generic [ref=e61]: المواظبة
              - generic [ref=e62]: جلسات / 4 أسابيع
            - generic [ref=e63]:
              - generic [ref=e64]: "0"
              - generic [ref=e65]: هذا الأسبوع
              - generic [ref=e66]: مجموعات عمل
            - generic [ref=e67]:
              - generic [ref=e68]: "0"
              - generic [ref=e69]: الحمل الكلي
              - generic [ref=e70]: كغ هذا الأسبوع
        - generic [ref=e71]:
          - generic [ref=e72]: "🎧 سبوتيفاي — شغّل وانسَ الموضوع:"
          - generic [ref=e73]:
            - link "Heavy Lifting" [ref=e74] [cursor=pointer]:
              - /url: https://music.youtube.com/search?q=heavy+lifting+workout+playlist
              - generic [ref=e75]: Heavy Lifting
            - link "Hard Rap Workout" [ref=e76] [cursor=pointer]:
              - /url: https://music.youtube.com/search?q=hard+rap+workout+playlist
              - generic [ref=e77]: Hard Rap Workout
      - heading "خطة التمرين" [level=3] [ref=e78]
      - generic [ref=e82] [cursor=pointer]:
        - heading "1. Chest Press Machine" [level=4] [ref=e83]
        - generic [ref=e84]:
          - generic [ref=e85]: صدر
          - generic [ref=e86]: 3 × 8-10
          - text: ·
          - strong [ref=e87]: 10 kg
      - generic [ref=e91] [cursor=pointer]:
        - heading "2. Lat Pulldown (Neutral Grip)" [level=4] [ref=e92]
        - generic [ref=e93]:
          - generic [ref=e94]: ظهر
          - generic [ref=e95]: 3 × 10-12
          - text: ·
          - strong [ref=e96]: 32 kg
      - generic [ref=e100] [cursor=pointer]:
        - heading "3. Shoulder Press (Machine/DB)" [level=4] [ref=e101]
        - generic [ref=e102]:
          - generic [ref=e103]: أكتاف
          - generic [ref=e104]: 3 × 10-12
          - text: ·
          - strong [ref=e105]: 16 kg
      - generic [ref=e109] [cursor=pointer]:
        - heading "4. T-Bar Row" [level=4] [ref=e110]
        - generic [ref=e111]:
          - generic [ref=e112]: ظهر علوي
          - generic [ref=e113]: 3 × 10-12
          - text: ·
          - strong [ref=e114]: 17 kg
      - generic [ref=e118] [cursor=pointer]:
        - heading "5. Biceps Curl (DB or Cable)" [level=4] [ref=e119]
        - generic [ref=e120]:
          - generic [ref=e121]: باي
          - generic [ref=e122]: 2 × 10-12
          - text: ·
          - strong [ref=e123]: 5 kg
      - generic [ref=e127] [cursor=pointer]:
        - heading "6. Single-Arm Rope Triceps Extension" [level=4] [ref=e128]
        - generic [ref=e129]:
          - generic [ref=e130]: تراي
          - generic [ref=e131]: 2 × 10-12
          - text: ·
          - strong [ref=e132]: —
      - generic [ref=e136] [cursor=pointer]:
        - heading "7. Lateral Raise (Cable)" [level=4] [ref=e137]
        - generic [ref=e138]:
          - generic [ref=e139]: الكتف الجانبي
          - generic [ref=e140]: 3 × 10-12
          - text: ·
          - strong [ref=e141]: 1 kg
  - navigation [ref=e142]:
    - button "الرئيسية" [ref=e143] [cursor=pointer]:
      - img [ref=e145]
      - generic [ref=e149]: الرئيسية
    - button "المكتبة" [ref=e150] [cursor=pointer]:
      - img [ref=e152]
      - generic [ref=e155]: المكتبة
    - button "السجل" [ref=e156] [cursor=pointer]:
      - img [ref=e158]
      - generic [ref=e161]: السجل
    - button "المدرب" [ref=e162] [cursor=pointer]:
      - img [ref=e164]
      - generic [ref=e167]: المدرب
    - button "الإعدادات" [ref=e168] [cursor=pointer]:
      - img [ref=e170]
      - generic [ref=e174]: الإعدادات
  - alert: فشلت المزامنة السحابية — حُفظت محلياً.
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | 
  3   | const appUrl = process.env.APP_URL || 'http://localhost:8877';
  4   | // The coach moved off :8444 — Tailscale Funnel serves only 443, 8443 and 10000,
  5   | // so :8444 answered nobody from the internet and the coach needed Tailscale
  6   | // switched on. It rides the 443 funnel on /coach now, and the path is /answer:
  7   | // the server runs the same retrieval and then writes the answer from what it
  8   | // found, so the OpenAI key never reaches this page.
  9   | const COACH = 'https://raed-hp.tail53bd35.ts.net/coach/answer';
  10  | 
  11  | const answer = (text, used) => ({ status: 'ok', answered: true, text, used, model: 'gpt-5.6-luna' });
  12  | const refusal = (text) => ({ status: 'ok', answered: false, text, used: [] });
  13  | 
  14  | async function openCoach(page) {
  15  |   // The sync host, blocked host-wide.
  16  |   //
  17  |   // This file named the hostname in its COACH constant and routed exactly one
  18  |   // path — /coach/answer — so the guard in videos.test.mjs, which only looked
  19  |   // for the hostname anywhere in the file, passed while every other request to
  20  |   // that host went straight through to Raed's live server. It did: on
  21  |   // 2026-09-05 his real cloud row was carrying `coach_last_answer` from a test
  22  |   // fixture (model "gpt-5.6-luna") and a coach_recent list reading «السؤال
  23  |   // الأول», «السؤال الثاني». Removed at rev 645; his 4 sessions and 24 PRs were
  24  |   // untouched, and that was luck, not design.
  25  |   //
  26  |   // Registered BEFORE the /coach/answer route in each test? No — Playwright
  27  |   // matches the most recently added route first, so the specific COACH route
  28  |   // registered in the test body still wins over this catch-all.
  29  |   await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (r) => r.abort());
> 30  |   await page.goto(appUrl, { waitUntil: 'networkidle' });
      |              ^ TimeoutError: page.goto: Timeout 20000ms exceeded.
  31  |   await page.waitForTimeout(800);
  32  |   await page.evaluate(() => {
  33  |     const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
  34  |     if (tile) tile.click();
  35  |   });
  36  |   await page.waitForTimeout(600);
  37  |   // Selecting the profile seeds a running session, so the coach appends the
  38  |   // exercise name to every question. That is a real feature with its own spec
  39  |   // (coach-context.spec.mjs); here it would silently rewrite what these tests
  40  |   // think they sent. Clear it in storage and reload — app.js is a module, so
  41  |   // the state is not reachable on window, but its key is.
  42  |   await page.evaluate(() => {
  43  |     for (const key of Object.keys(localStorage)) {
  44  |       if (!/^raedworkouts\..*\.state\.v1$/.test(key)) continue;
  45  |       try {
  46  |         const parsed = JSON.parse(localStorage.getItem(key));
  47  |         if (parsed && typeof parsed === 'object') {
  48  |           parsed.active_session = null;
  49  |           localStorage.setItem(key, JSON.stringify(parsed));
  50  |         }
  51  |       } catch (_) { /* a value we cannot parse is not a session */ }
  52  |     }
  53  |   });
  54  |   await page.reload({ waitUntil: 'networkidle' });
  55  |   await page.waitForTimeout(800);
  56  |   await page.evaluate(() => {
  57  |     const tab = [...document.querySelectorAll('.tab')].find((el) => /المدرب/.test(el.textContent));
  58  |     if (tab) tab.click();
  59  |   });
  60  |   await page.waitForTimeout(400);
  61  |   // The band is the visible proof the session is gone; without it the tests
  62  |   // below would pass on the wrong question and nobody would know.
  63  |   await expect(page.locator('[data-coach-context]')).toHaveCount(0);
  64  | }
  65  | 
  66  | async function ask(page, question = 'كم مجموعة لكل عضلة') {
  67  |   await page.fill('[data-coach-input]', question);
  68  |   await page.click('[data-coach-submit]');
  69  |   await page.waitForTimeout(700);
  70  | }
  71  | 
  72  | test('the answer is shown above the passages it was built from', async ({ page }) => {
  73  |   await page.route(COACH, (route) => route.fulfill({
  74  |     status: 200,
  75  |     contentType: 'application/json',
  76  |     body: JSON.stringify({
  77  |       status: 'ok',
  78  |       answer: answer('استهدف 10 مجموعات على الأقل لكل عضلة أسبوعياً. (The Hypertrophy Handbook، صفحة ٩٢)', [1]),
  79  |       results: [
  80  |         { text: 'multiple sets (3-5 sets) per muscle group are thought to be required to maximize hypertrophy', work: 'High Frequency Full Body Program', page: 90, score: 0.89 },
  81  |         { text: 'When it comes to per-week volume, James Krieger recommends an absolute minimum of 10 sets', work: 'The Hypertrophy Handbook', page: 92, score: 0.87 },
  82  |       ],
  83  |     }),
  84  |   }));
  85  |   await openCoach(page);
  86  |   await ask(page);
  87  | 
  88  |   await expect(page.locator('[data-coach-answer]')).toHaveCount(1);
  89  |   await expect(page.locator('[data-coach-answer]')).toContainText('10 مجموعات');
  90  |   // Cited first and marked; the uncited one is collapsed behind a disclosure.
  91  |   await expect(page.locator('[data-coach-cited]')).toHaveCount(1);
  92  |   await expect(page.locator('[data-coach-cited]')).toContainText('The Hypertrophy Handbook');
  93  |   await expect(page.locator('[data-coach-cited]')).toContainText('صفحة 92');
  94  |   await expect(page.locator('[data-coach-more]')).toHaveCount(1);
  95  |   // Book titles are English; h() isolates Latin runs itself, so exactly one <bdi>
  96  |   // per run and never a nested pair.
  97  |   await expect(page.locator('#page-coach bdi bdi')).toHaveCount(0);
  98  |   console.log('COACH_ANSWER_OVER_SOURCES');
  99  | });
  100 | 
  101 | test('"the books do not cover this" never renders as an answer', async ({ page }) => {
  102 |   // The single most important guarantee in the feature. Retrieval always returns
  103 |   // its top matches, whatever was asked — so on an off-topic question the model
  104 |   // is handed five real passages about something else. If a refusal rendered in
  105 |   // the answer slot with confident-looking sources underneath, the coach would
  106 |   // be doing exactly what it was built not to do.
  107 |   await page.route(COACH, (route) => route.fulfill({
  108 |     status: 200,
  109 |     contentType: 'application/json',
  110 |     body: JSON.stringify({
  111 |       status: 'ok',
  112 |       answer: refusal('كتب رائد لا تغطي وصفة كبسة اللحم.'),
  113 |       results: [
  114 |         { text: 'you would end up consuming an additional 109 grams of carbohydrates from quinoa', work: 'The Ultimate Guide to Body Recomposition', page: 140, score: 0.51 },
  115 |       ],
  116 |     }),
  117 |   }));
  118 |   await openCoach(page);
  119 |   await ask(page, 'وش أفضل وصفة كبسة لحم؟');
  120 | 
  121 |   await expect(page.locator('[data-coach-unanswered]')).toHaveCount(1);
  122 |   await expect(page.locator('[data-coach-answer]')).toHaveCount(0);
  123 |   await expect(page.locator('#page-coach')).toContainText('ليس في كتبك');
  124 |   // No passage is marked as a source, because none was used.
  125 |   await expect(page.locator('[data-coach-cited]')).toHaveCount(0);
  126 |   console.log('COACH_REFUSAL_NOT_AN_ANSWER');
  127 | });
  128 | 
  129 | test('a no-match is its own state, never an answer and never an error', async ({ page }) => {
  130 |   await page.route(COACH, (route) => route.fulfill({
```