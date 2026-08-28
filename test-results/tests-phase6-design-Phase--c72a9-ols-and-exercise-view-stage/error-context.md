# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/phase6-design.spec.mjs >> Phase 6 active Home keeps v15’s music, vibe, exercise list, finish controls, and exercise-view stage
- Location: tests/phase6-design.spec.mjs:67:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('#page-home').locator('[data-home-v15-spotify] a bdi')
Expected: 2
Received: 4
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('#page-home').locator('[data-home-v15-spotify] a bdi')
    9 × locator resolved to 4 elements
      - unexpected value "4"

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]:
      - img [ref=e4]
      - generic [ref=e6]: Raedworkouts
    - generic [ref=e7]:
      - button "افتح النادي" [ref=e8] [cursor=pointer]:
        - img [ref=e9]
      - button "فاتح" [ref=e17] [cursor=pointer]:
        - img [ref=e18]
        - generic [ref=e21]: فاتح
  - main [ref=e22]:
    - generic [ref=e23]:
      - generic [ref=e24]:
        - generic [ref=e25]: جارية · بدأت 9:20 م
        - heading "علوي أ" [level=2] [ref=e26]
        - paragraph
      - generic [ref=e27]:
        - generic [ref=e28]:
          - generic [ref=e29]: "0"
          - generic [ref=e30]: المواظبة
          - generic [ref=e31]: جلسات / 4 أسابيع
        - generic [ref=e32]:
          - generic [ref=e33]: "0"
          - generic [ref=e34]: هذا الأسبوع
          - generic [ref=e35]: مجموعات عمل
        - generic [ref=e36]:
          - generic [ref=e37]: "0"
          - generic [ref=e38]: الحمل الكلي
          - generic [ref=e39]: كغ هذا الأسبوع
      - button "واصل التمرين ↓" [ref=e40] [cursor=pointer]
      - button "عرض التمارين" [ref=e41] [cursor=pointer]
      - generic [ref=e42]:
        - generic [ref=e43]: "🎧 سبوتيفاي — شغّل وانسَ الموضوع:"
        - generic [ref=e44]:
          - link "Beast Mode" [ref=e45] [cursor=pointer]:
            - /url: https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP
            - generic [ref=e46]: Beast Mode
          - link "Power Workout" [ref=e47] [cursor=pointer]:
            - /url: https://open.spotify.com/playlist/37i9dQZF1DX35oM5SPECmN
            - generic [ref=e48]: Power Workout
      - generic [ref=e50]: "🎯 روح اليوم: Big presses first. Save shoulders and arms for the second half."
      - generic [ref=e51]:
        - article [ref=e52]:
          - generic [ref=e53] [cursor=pointer]:
            - generic [ref=e55]:
              - heading "Chest Press Machine" [level=4] [ref=e56]:
                - generic [ref=e57]: Chest Press Machine
              - generic [ref=e58]:
                - generic [ref=e59]: صدر
                - generic [ref=e60]: 3 × 8-10
                - text: ·
                - strong [ref=e61]: —
            - generic [ref=e62]: ▸
        - article [ref=e63]:
          - generic [ref=e64] [cursor=pointer]:
            - generic [ref=e66]:
              - heading "Lat Pulldown (Neutral Grip)" [level=4] [ref=e67]:
                - generic [ref=e68]: Lat Pulldown (Neutral Grip)
              - generic [ref=e69]:
                - generic [ref=e70]: ظهر
                - generic [ref=e71]: 3 × 10-12
                - text: ·
                - strong [ref=e72]: —
            - generic [ref=e73]: ▸
        - article [ref=e74]:
          - generic [ref=e75] [cursor=pointer]:
            - generic [ref=e77]:
              - heading "Shoulder Press (Machine/DB)" [level=4] [ref=e78]:
                - generic [ref=e79]: Shoulder Press (Machine/DB)
              - generic [ref=e80]:
                - generic [ref=e81]: أكتاف
                - generic [ref=e82]: 3 × 10-12
                - text: ·
                - strong [ref=e83]: —
            - generic [ref=e84]: ▸
        - article [ref=e85]:
          - generic [ref=e86] [cursor=pointer]:
            - generic [ref=e88]:
              - heading "T-Bar Row" [level=4] [ref=e89]:
                - generic [ref=e90]: T-Bar Row
              - generic [ref=e91]:
                - generic [ref=e92]: ظهر علوي
                - generic [ref=e93]: 3 × 10-12
                - text: ·
                - strong [ref=e94]: —
            - generic [ref=e95]: ▸
        - article [ref=e96]:
          - generic [ref=e97] [cursor=pointer]:
            - generic [ref=e99]:
              - heading "Biceps Curl (DB or Cable)" [level=4] [ref=e100]:
                - generic [ref=e101]: Biceps Curl (DB or Cable)
              - generic [ref=e102]:
                - generic [ref=e103]: باي
                - generic [ref=e104]: 2 × 10-12
                - text: ·
                - strong [ref=e105]: —
            - generic [ref=e106]: ▸
        - article [ref=e107]:
          - generic [ref=e108] [cursor=pointer]:
            - generic [ref=e110]:
              - heading "Single-Arm Rope Triceps Extension" [level=4] [ref=e111]:
                - generic [ref=e112]: Single-Arm Rope Triceps Extension
              - generic [ref=e113]:
                - generic [ref=e114]: تراي
                - generic [ref=e115]: 2 × 10-12
                - text: ·
                - strong [ref=e116]: —
            - generic [ref=e117]: ▸
        - article [ref=e118]:
          - generic [ref=e119] [cursor=pointer]:
            - generic [ref=e121]:
              - heading "Lateral Raise (Cable)" [level=4] [ref=e122]:
                - generic [ref=e123]: Lateral Raise (Cable)
              - generic [ref=e124]:
                - generic [ref=e125]: الكتف الجانبي
                - generic [ref=e126]: 3 × 10-12
                - text: ·
                - strong [ref=e127]: —
            - generic [ref=e128]: ▸
      - generic [ref=e129]:
        - button "✓ أنهِ الجلسة واحفظها" [ref=e130] [cursor=pointer]
        - button "تجاهل التمرين" [ref=e132] [cursor=pointer]
    - text: ▶ ▶
  - navigation [ref=e133]:
    - button "الرئيسية" [active] [ref=e134] [cursor=pointer]:
      - img [ref=e136]
      - generic [ref=e140]: الرئيسية
    - button "المكتبة" [ref=e141] [cursor=pointer]:
      - img [ref=e143]
      - generic [ref=e146]: المكتبة
    - button "السجل" [ref=e147] [cursor=pointer]:
      - img [ref=e149]
      - generic [ref=e152]: السجل
    - button "المدرب الذكي" [ref=e153] [cursor=pointer]:
      - img [ref=e155]
      - generic [ref=e157]: المدرب
    - button "الإعدادات" [ref=e158] [cursor=pointer]:
      - img [ref=e160]
      - generic [ref=e164]: الإعدادات
  - generic [ref=e165]: فشلت المزامنة السحابية — حُفظت محلياً.
```

# Test source

```ts
  1   | import path from 'node:path';
  2   | import { fileURLToPath, pathToFileURL } from 'node:url';
  3   | import { expect, test } from '@playwright/test';
  4   | 
  5   | const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  6   | const appUrl = pathToFileURL(path.join(repoRoot, 'index.html')).href;
  7   | const testUser = 'phase6-design';
  8   | 
  9   | test.use({
  10  |   browserName: 'chromium', headless: true, viewport: { width: 390, height: 844 },
  11  |   launchOptions: { args: ['--allow-file-access-from-files'], executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
  12  | });
  13  | 
  14  | function seededState() {
  15  |   return {
  16  |     schema_version: 2, programme_reference_migration_version: 1, current_week: 1, current_block: 1,
  17  |     profile: { display_name: 'Phase 6', experience: 'returning', created_at: '2026-08-28T00:00:00.000Z' },
  18  |     active_session: null, history: [], bodyweight_log: [], custom_videos: {}, custom_jn_urls: {},
  19  |     video_hidden: {}, custom_exercises: [], programme_overrides: null, prs: {}, msg_index: 0, substitutions: [],
  20  |   };
  21  | }
  22  | 
  23  | function seededSettings() {
  24  |   return {
  25  |     user_id: testUser, user_key: '', theme: 'light', skin: 'hadid', rest_seconds: 120,
  26  |     vibrate: false, notifications: false, music_platform: 'spotify', block_auto_color: false,
  27  |     block_skin_suggestions: {}, block_skin_rejections: {}, lang: 'ar', locale_version: 1,
  28  |     runner_video_open: true,
  29  |   };
  30  | }
  31  | 
  32  | async function openHome(page) {
  33  |   await page.addInitScript(({ user, state, settings }) => {
  34  |     localStorage.clear();
  35  |     localStorage.setItem('raedworkouts.active_user', user);
  36  |     localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.state.v1`, JSON.stringify(state));
  37  |     localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.settings.v1`, JSON.stringify(settings));
  38  |   }, { user: testUser, state: seededState(), settings: seededSettings() });
  39  |   await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  40  | }
  41  | 
  42  | test('Phase 6 keeps v15’s three-stage session flow and its exercise-card workout contract', async ({ page }) => {
  43  |   await openHome(page);
  44  |   const home = page.locator('#page-home');
  45  |   await expect(home.locator('[data-home-stat-tiles]')).toHaveCount(1);
  46  |   await expect(home.locator('[data-home-working-set-progress]')).toHaveCount(0);
  47  | 
  48  |   await home.locator('[data-home-view-exercises]').click();
  49  |   const preview = page.locator('[data-session-preview]');
  50  |   await expect(preview).toBeVisible();
  51  |   await expect(preview.locator('[data-session-preview-exercise]')).not.toHaveCount(0);
  52  |   const beginWorkout = preview.locator('[data-session-preview-start-workout]');
  53  |   await expect(beginWorkout, 'the preview must expose one stable control that enters the workout').toHaveCount(1);
  54  |   await beginWorkout.click();
  55  |   await page.locator('[data-runner-skip-warmup]').click();
  56  | 
  57  |   const workout = page.locator('[data-session-runner]');
  58  |   await expect(workout).toBeVisible();
  59  |   await expect(workout.locator('[data-v15-segmented-progress]')).toHaveCount(1);
  60  |   await expect(workout.locator('[data-v15-video-strip]')).toHaveCount(1);
  61  |   await expect(workout.locator('[data-v15-last-time]')).toHaveCount(1);
  62  |   await expect(workout.locator('[data-runner-previous], [data-runner-reset-set]')).toHaveCount(2);
  63  |   await expect(workout).not.toContainText(/Exercise \d+ of \d+|Focus mode|Cue:|Session notes|Today: Last session not fully logged/i);
  64  |   console.log('PHASE6_V15_FLOW_CONTRACT_PASSED');
  65  | });
  66  | 
  67  | test('Phase 6 active Home keeps v15’s music, vibe, exercise list, finish controls, and exercise-view stage', async ({ page }) => {
  68  |   await openHome(page);
  69  |   await page.locator('[data-home-view-exercises]').click();
  70  |   await page.locator('[data-session-preview-start]').click();
  71  |   await page.locator('[data-runner-skip-warmup]').click();
  72  |   await page.locator('.tab[data-route="home"]').click();
  73  | 
  74  |   const home = page.locator('#page-home');
  75  |   await expect(home.locator('[data-home-v15-spotify]')).toHaveCount(1);
  76  |   await expect(home.locator('[data-home-spotify-handoff]')).toHaveText('🎧 سبوتيفاي — شغّل وانسَ الموضوع:');
  77  |   await expect(home.locator('[data-home-spotify-handoff]')).not.toContainText('press play');
  78  |   await expect(home.locator('[data-home-v15-spotify] a')).toHaveCount(2);
  79  |   await expect(home.locator('[data-home-v15-spotify] a')).toHaveText(['Beast Mode', 'Power Workout']);
> 80  |   await expect(home.locator('[data-home-v15-spotify] a bdi')).toHaveCount(2);
      |                                                               ^ Error: expect(locator).toHaveCount(expected) failed
  81  |   await expect(home.locator('[data-home-vibe]')).toHaveCount(1);
  82  |   await expect(home.locator('[data-home-vibe]')).toContainText('الضغطات الكبيرة أولًا. اترك الأكتاف والذراعين للنصف الأخير.');
  83  |   await expect(home.locator('[data-home-exercise-list] [data-home-exercise]')).not.toHaveCount(0);
  84  |   await expect(home.locator('[data-home-view-exercises]')).toHaveCount(1);
  85  |   await expect(home.locator('[data-home-finish], [data-home-discard]')).toHaveCount(2);
  86  | 
  87  |   await home.locator('[data-home-view-exercises]').click();
  88  |   await expect(page.locator('[data-session-preview]')).toBeVisible();
  89  |   await expect(page.locator('[data-session-preview-continue]')).toHaveCount(1);
  90  |   console.log('PHASE6_ACTIVE_HOME_V15_BLOCKS_PASSED');
  91  | });
  92  | 
  93  | test('Phase 6 turns the old Help tab into collapsed sections in Settings and frees its tab for the coach', async ({ page }) => {
  94  |   await openHome(page);
  95  |   await expect(page.locator('.tab[data-route="help"]')).toHaveCount(0);
  96  |   await expect(page.locator('.tab[data-route="coach"]')).toHaveCount(1);
  97  |   await page.locator('.tab[data-route="settings"]').click();
  98  |   const settings = page.locator('#page-settings');
  99  |   await expect(settings.locator('[data-settings-disclosure]')).toHaveCount(6);
  100 |   await expect(settings.locator('[data-settings-disclosure][open]')).toHaveCount(0);
  101 |   console.log('PHASE6_SETTINGS_NAV_CONTRACT_PASSED');
  102 | });
  103 | 
```