# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/deploy-safe.spec.mjs >> Deploy safety: a fresh seeded profile hint reaches optional-PIN registration, not an impossible keypad
- Location: tests/deploy-safe.spec.mjs:30:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('[data-home-overview]')
Expected: 1
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('[data-home-overview]')
    9 × locator resolved to 0 elements
      - unexpected value "0"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]:
      - img [ref=e4]
      - generic [ref=e6]: Raedworkouts
    - generic [ref=e7]:
      - button "افتح النادي" [ref=e8] [cursor=pointer]:
        - img [ref=e9]
      - button "تلقائي" [ref=e17] [cursor=pointer]:
        - img [ref=e18]
        - generic [ref=e21]: تلقائي
  - main [ref=e22]:
    - generic [ref=e23]:
      - generic [ref=e24]:
        - generic [ref=e25]: الأربعاء · يوم نادٍ
        - heading "علوي أ" [level=2] [ref=e26]
        - paragraph [ref=e27]: علوي أ
        - generic [ref=e28]:
          - generic [ref=e29]: "7"
          - text: تمارين · ~
          - generic [ref=e30]: "70"
          - text: دقيقة
      - generic [ref=e31]:
        - generic [ref=e32]:
          - generic [ref=e33]: "0"
          - generic [ref=e34]: المواظبة
          - generic [ref=e35]: جلسات / 4 أسابيع
        - generic [ref=e36]:
          - generic [ref=e37]: "0"
          - generic [ref=e38]: هذا الأسبوع
          - generic [ref=e39]: مجموعات عمل
        - generic [ref=e40]:
          - generic [ref=e41]: "0"
          - generic [ref=e42]: الحمل الكلي
          - generic [ref=e43]: كغ هذا الأسبوع
      - button "▶ ابدأ علوي أ" [ref=e44] [cursor=pointer]
      - button "اختر تمريناً آخر ▾" [ref=e46] [cursor=pointer]
      - heading "خطة التمرين" [level=3] [ref=e48]
      - generic [ref=e52] [cursor=pointer]:
        - heading "1. Chest Press Machine" [level=4] [ref=e53]
        - generic [ref=e54]:
          - generic [ref=e55]: صدر
          - generic [ref=e56]: 3 × 8-10
          - text: ·
          - strong [ref=e57]: —
      - generic [ref=e61] [cursor=pointer]:
        - heading "2. Lat Pulldown (Neutral Grip)" [level=4] [ref=e62]
        - generic [ref=e63]:
          - generic [ref=e64]: ظهر
          - generic [ref=e65]: 3 × 10-12
          - text: ·
          - strong [ref=e66]: —
      - generic [ref=e70] [cursor=pointer]:
        - heading "3. Shoulder Press (Machine/DB)" [level=4] [ref=e71]
        - generic [ref=e72]:
          - generic [ref=e73]: أكتاف
          - generic [ref=e74]: 3 × 10-12
          - text: ·
          - strong [ref=e75]: —
      - generic [ref=e79] [cursor=pointer]:
        - heading "4. T-Bar Row" [level=4] [ref=e80]
        - generic [ref=e81]:
          - generic [ref=e82]: ظهر علوي
          - generic [ref=e83]: 3 × 10-12
          - text: ·
          - strong [ref=e84]: —
      - generic [ref=e88] [cursor=pointer]:
        - heading "5. Biceps Curl (DB or Cable)" [level=4] [ref=e89]
        - generic [ref=e90]:
          - generic [ref=e91]: باي
          - generic [ref=e92]: 2 × 10-12
          - text: ·
          - strong [ref=e93]: —
      - generic [ref=e97] [cursor=pointer]:
        - heading "6. Single-Arm Rope Triceps Extension" [level=4] [ref=e98]
        - generic [ref=e99]:
          - generic [ref=e100]: تراي
          - generic [ref=e101]: 2 × 10-12
          - text: ·
          - strong [ref=e102]: —
      - generic [ref=e106] [cursor=pointer]:
        - heading "7. Lateral Raise (Cable)" [level=4] [ref=e107]
        - generic [ref=e108]:
          - generic [ref=e109]: الكتف الجانبي
          - generic [ref=e110]: 3 × 10-12
          - text: ·
          - strong [ref=e111]: —
  - navigation [ref=e112]:
    - button "الرئيسية" [ref=e113] [cursor=pointer]:
      - img [ref=e115]
      - generic [ref=e119]: الرئيسية
    - button "المكتبة" [ref=e120] [cursor=pointer]:
      - img [ref=e122]
      - generic [ref=e125]: المكتبة
    - button "السجل" [ref=e126] [cursor=pointer]:
      - img [ref=e128]
      - generic [ref=e131]: السجل
    - button "الإعدادات" [ref=e132] [cursor=pointer]:
      - img [ref=e134]
      - generic [ref=e138]: الإعدادات
    - button "المساعدة" [ref=e139] [cursor=pointer]:
      - img [ref=e141]
      - generic [ref=e143]: المساعدة
  - generic: الملف جاهز محلياً. المزامنة السحابية معلّقة.
```

# Test source

```ts
  1   | import path from 'node:path';
  2   | import { fileURLToPath, pathToFileURL } from 'node:url';
  3   | import { expect, test } from '@playwright/test';
  4   | 
  5   | const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  6   | const appUrl = pathToFileURL(path.join(repoRoot, 'index.html')).href;
  7   | const syncOrigin = 'https://raed-hp.tail53bd35.ts.net:8443';
  8   | 
  9   | test.use({
  10  |   browserName: 'chromium',
  11  |   headless: true,
  12  |   viewport: { width: 390, height: 844 },
  13  |   launchOptions: {
  14  |     args: ['--allow-file-access-from-files'],
  15  |     executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  16  |   },
  17  | });
  18  | 
  19  | async function seedFreshProfileHint(page) {
  20  |   await page.addInitScript(() => {
  21  |     localStorage.clear();
  22  |     // This recreates the dangerous first-origin state: a UI/profile index
  23  |     // claims a PIN, but there is neither a derived local key nor a v16 row.
  24  |     localStorage.setItem('raedworkouts.profiles.v1', JSON.stringify([
  25  |       { user_id: 'Raed', display_name: 'Raed', experience: 'detrained', has_pin: true },
  26  |     ]));
  27  |   });
  28  | }
  29  | 
  30  | test('Deploy safety: a fresh seeded profile hint reaches optional-PIN registration, not an impossible keypad', async ({ page }) => {
  31  |   await page.route(`${syncOrigin}/**`, (route) => route.abort());
  32  |   await seedFreshProfileHint(page);
  33  |   await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  34  | 
  35  |   const raed = page.locator('.profile-tile').filter({ hasText: 'Raed' });
  36  |   await expect(raed).toHaveCount(1);
  37  |   await raed.click();
  38  |   await expect(page.locator('.pin-panel'), 'no v16 credential exists, so a PIN prompt would be unsatisfiable').toHaveCount(0);
  39  |   const registration = page.locator('.register-panel');
  40  |   await expect(registration).toHaveCount(1);
  41  | 
  42  |   // Leaving both fields blank is the supported first-run path. The aborted
  43  |   // server makes this a real offline gym-basement case rather than a mock.
  44  |   await registration.locator('.btn.primary.full').click();
> 45  |   await expect(page.locator('[data-home-overview]')).toHaveCount(1);
      |                                                      ^ Error: expect(locator).toHaveCount(expected) failed
  46  |   const start = page.locator('#page-home button.btn.primary.full').first();
  47  |   await expect(start).toContainText('Upper A');
  48  |   await start.click();
  49  |   await expect(page.locator('[data-session-runner]')).toHaveCount(1);
  50  |   console.log('V16_FRESH_PROFILE_NONBLOCKING_PASSED');
  51  | });
  52  | 
  53  | test('Deploy safety: the fresh v16 profile writes only raed-v16, never Raed', async ({ page }) => {
  54  |   const stateWrites = [];
  55  |   await page.route(`${syncOrigin}/**`, async (route) => {
  56  |     const request = route.request();
  57  |     const url = new URL(request.url());
  58  |     if (url.pathname === '/users') {
  59  |       // The v15 row is intentionally present: it must not become a v16 PIN
  60  |       // credential or sync target.
  61  |       await route.fulfill({ contentType: 'application/json', body: JSON.stringify([
  62  |         { user_id: 'Raed', display_name: 'Raed', experience: 'detrained', has_pin: true, sessions: 5 },
  63  |       ]) });
  64  |       return;
  65  |     }
  66  |     if (url.pathname === '/state' && request.method() === 'POST') {
  67  |       stateWrites.push(JSON.parse(request.postData() || '{}'));
  68  |       await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, rev: 1, latest_rev: 1, user_id: 'raed-v16' }) });
  69  |       return;
  70  |     }
  71  |     await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  72  |   });
  73  |   await seedFreshProfileHint(page);
  74  |   await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  75  |   await page.locator('.profile-tile').filter({ hasText: 'Raed' }).click();
  76  |   await page.locator('.register-panel .btn.primary.full').click();
  77  | 
  78  |   await expect.poll(() => stateWrites.length).toBe(1);
  79  |   expect(stateWrites[0].user_id, 'the v16 app must never POST to bare Raed').toBe('raed-v16');
  80  |   expect(stateWrites[0].settings_json.user_id, 'the local identity is not copied into remote settings').toBeUndefined();
  81  |   console.log(`V16_SYNC_NAMESPACE_BROWSER_PASSED user_id=${stateWrites[0].user_id}`);
  82  | });
  83  | 
  84  | test('Deploy safety: a PIN prompt remains available when the v16 server actually reports a PIN', async ({ page }) => {
  85  |   await page.route(`${syncOrigin}/**`, async (route) => {
  86  |     const url = new URL(route.request().url());
  87  |     if (url.pathname === '/users') {
  88  |       await route.fulfill({ contentType: 'application/json', body: JSON.stringify([
  89  |         { user_id: 'bassam-v16', display_name: 'Bassam', experience: 'returning', has_pin: true, sessions: 2 },
  90  |       ]) });
  91  |       return;
  92  |     }
  93  |     await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not_found' }) });
  94  |   });
  95  |   await page.addInitScript(() => localStorage.clear());
  96  |   await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  97  |   const bassam = page.locator('.profile-tile').filter({ hasText: 'Bassam' });
  98  |   await expect(bassam).toContainText('برمز');
  99  |   await bassam.click();
  100 |   await expect(page.locator('.pin-panel'), 'a verified v16 server PIN must still protect Bassam').toHaveCount(1);
  101 |   console.log('V16_VERIFIED_PIN_GATE_PASSED');
  102 | });
  103 | 
```