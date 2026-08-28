# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/phase6-design.spec.mjs >> Phase 6 keeps v15’s three-stage session flow and its exercise-card workout contract
- Location: tests/phase6-design.spec.mjs:42:1

# Error details

```
Error: the preview must expose one stable control that enters the workout

expect(locator).toHaveCount(expected) failed

Locator:  locator('[data-session-preview]').locator('[data-session-preview-start-workout]')
Expected: 1
Received: 0
Timeout:  5000ms

Call log:
  - the preview must expose one stable control that enters the workout with timeout 5000ms
  - waiting for locator('[data-session-preview]').locator('[data-session-preview-start-workout]')
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
      - button "فاتح" [ref=e17] [cursor=pointer]:
        - img [ref=e18]
        - generic [ref=e21]: فاتح
  - main [ref=e22]:
    - generic [ref=e23]:
      - generic [ref=e24]:
        - heading "عرض التمارين" [level=1] [ref=e25]
        - generic [ref=e26]: علوي أ
      - generic [ref=e27]:
        - article [ref=e28]:
          - generic [ref=e31] [cursor=pointer]:
            - heading "Chest Press Machine" [level=4] [ref=e32]:
              - generic [ref=e33]: Chest Press Machine
            - generic [ref=e34]:
              - generic [ref=e35]: صدر
              - generic [ref=e36]: 3 × 8-10
              - text: ·
              - strong [ref=e37]: —
        - article [ref=e38]:
          - generic [ref=e41] [cursor=pointer]:
            - heading "Lat Pulldown (Neutral Grip)" [level=4] [ref=e42]:
              - generic [ref=e43]: Lat Pulldown (Neutral Grip)
            - generic [ref=e44]:
              - generic [ref=e45]: ظهر
              - generic [ref=e46]: 3 × 10-12
              - text: ·
              - strong [ref=e47]: —
        - article [ref=e48]:
          - generic [ref=e51] [cursor=pointer]:
            - heading "Shoulder Press (Machine/DB)" [level=4] [ref=e52]:
              - generic [ref=e53]: Shoulder Press (Machine/DB)
            - generic [ref=e54]:
              - generic [ref=e55]: أكتاف
              - generic [ref=e56]: 3 × 10-12
              - text: ·
              - strong [ref=e57]: —
        - article [ref=e58]:
          - generic [ref=e61] [cursor=pointer]:
            - heading "T-Bar Row" [level=4] [ref=e62]:
              - generic [ref=e63]: T-Bar Row
            - generic [ref=e64]:
              - generic [ref=e65]: ظهر علوي
              - generic [ref=e66]: 3 × 10-12
              - text: ·
              - strong [ref=e67]: —
        - article [ref=e68]:
          - generic [ref=e71] [cursor=pointer]:
            - heading "Biceps Curl (DB or Cable)" [level=4] [ref=e72]:
              - generic [ref=e73]: Biceps Curl (DB or Cable)
            - generic [ref=e74]:
              - generic [ref=e75]: باي
              - generic [ref=e76]: 2 × 10-12
              - text: ·
              - strong [ref=e77]: —
        - article [ref=e78]:
          - generic [ref=e81] [cursor=pointer]:
            - heading "Single-Arm Rope Triceps Extension" [level=4] [ref=e82]:
              - generic [ref=e83]: Single-Arm Rope Triceps Extension
            - generic [ref=e84]:
              - generic [ref=e85]: تراي
              - generic [ref=e86]: 2 × 10-12
              - text: ·
              - strong [ref=e87]: —
        - article [ref=e88]:
          - generic [ref=e91] [cursor=pointer]:
            - heading "Lateral Raise (Cable)" [level=4] [ref=e92]:
              - generic [ref=e93]: Lateral Raise (Cable)
            - generic [ref=e94]:
              - generic [ref=e95]: الكتف الجانبي
              - generic [ref=e96]: 3 × 10-12
              - text: ·
              - strong [ref=e97]: —
      - button "▶ ابدأ" [ref=e98] [cursor=pointer]
  - navigation [ref=e99]:
    - button "الرئيسية" [ref=e100] [cursor=pointer]:
      - img [ref=e102]
      - generic [ref=e106]: الرئيسية
    - button "المكتبة" [ref=e107] [cursor=pointer]:
      - img [ref=e109]
      - generic [ref=e112]: المكتبة
    - button "السجل" [ref=e113] [cursor=pointer]:
      - img [ref=e115]
      - generic [ref=e118]: السجل
    - button "المدرب الذكي" [ref=e119] [cursor=pointer]:
      - img [ref=e121]
      - generic [ref=e123]: المدرب
    - button "الإعدادات" [ref=e124] [cursor=pointer]:
      - img [ref=e126]
      - generic [ref=e130]: الإعدادات
  - generic [ref=e131]: فشلت المزامنة السحابية — حُفظت محلياً.
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
> 53  |   await expect(beginWorkout, 'the preview must expose one stable control that enters the workout').toHaveCount(1);
      |                                                                                                    ^ Error: the preview must expose one stable control that enters the workout
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
  80  |   await expect(home.locator('[data-home-v15-spotify] a bdi')).toHaveCount(2);
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