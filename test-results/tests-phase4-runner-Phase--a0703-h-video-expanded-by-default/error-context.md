# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/phase4-runner.spec.mjs >> Phase 4 runner contains all fixed content at 390x844 with video expanded by default
- Location: tests/phase4-runner.spec.mjs:211:1

# Error details

```
Error: video=expanded current set must be visible without list scrolling

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - button "إعدادات التمرين" [ref=e6] [cursor=pointer]: ⚙
        - generic [ref=e7]: جارية · بدأت 12:18 م
        - button "اخرج من التمرين" [ref=e8] [cursor=pointer]: ✕
      - main [ref=e9]:
        - generic [ref=e10]:
          - generic [ref=e11]:
            - heading "Chest Press Machine" [level=1] [ref=e12]:
              - generic [ref=e13]: Chest Press Machine
            - paragraph [ref=e14]:
              - text: بنش آلة ·
              - generic [ref=e15]: "3"
              - text: مجموعات
          - generic [ref=e16]:
            - button "▶ الشرح ⌃" [ref=e17] [cursor=pointer]:
              - text: ▶ الشرح
              - generic [ref=e18]: ⌃
            - link "M1 ▶" [ref=e20] [cursor=pointer]:
              - /url: https://www.youtube.com/shorts/Q1S9ybWYMjE
              - generic [ref=e21]: M1
              - text: ▶
          - generic [ref=e22]:
            - generic [ref=e23]: المجموعة الحالية
            - generic [ref=e24]:
              - generic [ref=e25]: رقم
              - generic [ref=e26]: الوزن
              - generic [ref=e28]: kg
              - generic [ref=e29]: التكرار
              - generic [ref=e30]: تم
            - generic [ref=e31]:
              - generic [ref=e32]:
                - generic [ref=e34]: "1"
                - spinbutton "وزن المجموعة 1" [ref=e35]: "0"
                - generic [ref=e36]: kg
                - spinbutton "تكرارات المجموعة 1" [ref=e37]: "8"
                - button "سجّل المجموعة 1" [ref=e38] [cursor=pointer]: ○
              - generic [ref=e39]:
                - generic [ref=e41]: "2"
                - spinbutton "وزن المجموعة 2" [ref=e42]: "0"
                - generic [ref=e43]: kg
                - spinbutton "تكرارات المجموعة 2" [ref=e44]: "8"
                - button "سجّل المجموعة 2" [ref=e45] [cursor=pointer]: ○
              - generic [ref=e46]:
                - generic [ref=e48]: "3"
                - spinbutton "وزن المجموعة 3" [ref=e49]: "0"
                - generic [ref=e50]: kg
                - spinbutton "تكرارات المجموعة 3" [ref=e51]: "8"
                - button "سجّل المجموعة 3" [ref=e52] [cursor=pointer]: ○
              - generic [ref=e53]:
                - generic [ref=e55]: "1"
                - spinbutton "وزن المجموعة 1" [ref=e56]: "0"
                - generic [ref=e57]: kg
                - spinbutton "تكرارات المجموعة 1" [ref=e58]: "8"
                - button "سجّل المجموعة 1" [ref=e59] [cursor=pointer]: ○
              - generic [ref=e60]:
                - generic [ref=e62]: "1"
                - spinbutton "وزن المجموعة 1" [ref=e63]: "0"
                - generic [ref=e64]: kg
                - spinbutton "تكرارات المجموعة 1" [ref=e65]: "8"
                - button "سجّل المجموعة 1" [ref=e66] [cursor=pointer]: ○
              - generic [ref=e67]:
                - generic [ref=e69]: "1"
                - spinbutton "وزن المجموعة 1" [ref=e70]: "0"
                - generic [ref=e71]: kg
                - spinbutton "تكرارات المجموعة 1" [ref=e72]: "8"
                - button "سجّل المجموعة 1" [ref=e73] [cursor=pointer]: ○
              - generic [ref=e74]:
                - generic [ref=e76]: "1"
                - spinbutton "وزن المجموعة 1" [ref=e77]: "0"
                - generic [ref=e78]: kg
                - spinbutton "تكرارات المجموعة 1" [ref=e79]: "8"
                - button "سجّل المجموعة 1" [ref=e80] [cursor=pointer]: ○
              - generic [ref=e81]:
                - generic [ref=e83]: "1"
                - spinbutton "وزن المجموعة 1" [ref=e84]: "0"
                - generic [ref=e85]: kg
                - spinbutton "تكرارات المجموعة 1" [ref=e86]: "8"
                - button "سجّل المجموعة 1" [ref=e87] [cursor=pointer]: ○
              - generic [ref=e88]:
                - generic [ref=e90]: "1"
                - spinbutton "وزن المجموعة 1" [ref=e91]: "0"
                - generic [ref=e92]: kg
                - spinbutton "تكرارات المجموعة 1" [ref=e93]: "8"
                - button "سجّل المجموعة 1" [ref=e94] [cursor=pointer]: ○
              - generic [ref=e95]:
                - generic [ref=e97]: "1"
                - spinbutton "وزن المجموعة 1" [ref=e98]: "0"
                - generic [ref=e99]: kg
                - spinbutton "تكرارات المجموعة 1" [ref=e100]: "8"
                - button "سجّل المجموعة 1" [ref=e101] [cursor=pointer]: ○
              - generic [ref=e102]:
                - generic [ref=e104]: "1"
                - spinbutton "وزن المجموعة 1" [ref=e105]: "0"
                - generic [ref=e106]: kg
                - spinbutton "تكرارات المجموعة 1" [ref=e107]: "8"
                - button "سجّل المجموعة 1" [ref=e108] [cursor=pointer]: ○
          - paragraph [ref=e109]: المقابض بمحاذاة منتصف الصدر. اعصر الصدر عند النهاية.
          - generic [ref=e110]: آخر مرة · —
      - generic [ref=e111]:
        - button "⏱ 2:00 · راحة" [ref=e112] [cursor=pointer]:
          - generic [ref=e113]: ⏱ 2:00
          - text: · راحة
        - button "+ مجموعة" [ref=e114] [cursor=pointer]
      - button "سجّل المجموعة" [ref=e116] [cursor=pointer]:
        - generic [ref=e117]: سجّل المجموعة
  - generic [ref=e118]: جارٍ المزامنة…
```

# Test source

```ts
  82  |   // rather than baking a row count into this gate.
  83  |   await page.evaluate((user) => {
  84  |     const stateKey = `raedworkouts.${encodeURIComponent(user)}.state.v1`;
  85  |     const current = JSON.parse(localStorage.getItem(stateKey));
  86  |     const entries = Object.entries(current.active_session.exercises || {});
  87  |     const [longestIndex] = entries.reduce((best, [, exercise], index) =>
  88  |       (exercise.sets.length > best[1] ? [index, exercise.sets.length] : best), [0, -1]);
  89  |     current.active_session.runner_exercise_index = longestIndex;
  90  |     localStorage.setItem(stateKey, JSON.stringify(current));
  91  |   }, testUser);
  92  |   await page.reload({ waitUntil: 'domcontentloaded' });
  93  | }
  94  | 
  95  | async function recordRunnerGeometry(page, state) {
  96  |   if (process.env.PHASE4_FORCE_RUNNER_OVERFLOW === '1') {
  97  |     // Test-only positive control: this never reaches the application files.
  98  |     // It proves the local-overflow assertion still catches clipped content.
  99  |     await page.evaluate(() => {
  100 |       const list = document.querySelector('[data-runner-set-list]');
  101 |       const current = list?.querySelector('.runner-set-row.current');
  102 |       if (!list || !current || list.querySelector('[data-runner-overflow-fixture]')) return;
  103 |       // Test-only positive control: enough real-shaped rows to make the list
  104 |       // scroll, then its scroll position deliberately hides the actual current
  105 |       // row. Production files never receive this fixture or an env hook.
  106 |       for (let i = 0; i < 8; i += 1) {
  107 |         const fixture = current.cloneNode(true);
  108 |         fixture.classList.remove('current');
  109 |         fixture.dataset.runnerOverflowFixture = 'true';
  110 |         list.appendChild(fixture);
  111 |       }
  112 |       list.scrollTop = list.scrollHeight;
  113 |     });
  114 |   }
  115 | 
  116 |   const geometry = await page.evaluate(() => {
  117 |     const shell = document.querySelector('.runner-shell');
  118 |     const main = document.querySelector('.runner-main');
  119 |     const panel = document.querySelector('[data-runner-set-panel]');
  120 |     const list = document.querySelector('[data-runner-set-list]');
  121 |     const currentRow = list?.querySelector('.runner-set-row.current');
  122 |     const dimensions = (element) => ({
  123 |       clientHeight: element.clientHeight,
  124 |       scrollHeight: element.scrollHeight,
  125 |       top: Math.round(element.getBoundingClientRect().top),
  126 |       bottom: Math.round(element.getBoundingClientRect().bottom),
  127 |     });
  128 |     const belowFold = [...shell.querySelectorAll('*')]
  129 |       .map((element) => ({ element, rect: element.getBoundingClientRect() }))
  130 |       .filter(({ rect }) => rect.width > 0 && rect.height > 0 && rect.top >= window.innerHeight)
  131 |       .map(({ element, rect }) => `${element.tagName.toLowerCase()}.${[...element.classList].join('.') || 'none'}@${Math.round(rect.top)}px`);
  132 |     const listRect = list.getBoundingClientRect();
  133 |     const currentRect = currentRow.getBoundingClientRect();
  134 |     const fixedZones = {
  135 |       shell,
  136 |       topbar: shell.querySelector('.runner-topbar'),
  137 |       main,
  138 |       card: shell.querySelector('.runner-card'),
  139 |       panel,
  140 |       cue: shell.querySelector('.runner-cue'),
  141 |       lastTime: shell.querySelector('.runner-last-time'),
  142 |       actions: shell.querySelector('.runner-bottom-actions'),
  143 |       bottomBar: shell.querySelector('.runner-bottom-bar'),
  144 |     };
  145 |     return {
  146 |       viewport: window.innerHeight,
  147 |       documentHeight: document.documentElement.scrollHeight,
  148 |       documentLayers: {
  149 |         html: dimensions(document.documentElement),
  150 |         body: dimensions(document.body),
  151 |         page: dimensions(document.querySelector('#page-runner')),
  152 |       },
  153 |       shell: dimensions(shell),
  154 |       main: dimensions(main),
  155 |       panel: dimensions(panel),
  156 |       list: dimensions(list),
  157 |       fixedZones: Object.fromEntries(Object.entries(fixedZones)
  158 |         .filter(([, element]) => element)
  159 |         .map(([name, element]) => [name, dimensions(element)])),
  160 |       current: {
  161 |         top: Math.round(currentRect.top), bottom: Math.round(currentRect.bottom),
  162 |         listTop: Math.round(listRect.top), listBottom: Math.round(listRect.bottom),
  163 |         fullyVisible: currentRect.top >= listRect.top && currentRect.bottom <= listRect.bottom,
  164 |       },
  165 |       belowFold,
  166 |     };
  167 |   });
  168 | 
  169 |   const line = (name, value) =>
  170 |     `${name} client=${value.clientHeight}px scroll=${value.scrollHeight}px spare=${value.clientHeight - value.scrollHeight}px`;
  171 |   console.log(`PHASE4_RUNNER_GEOMETRY ${state}: document=${geometry.documentHeight}px viewport=${geometry.viewport}px shell=${geometry.shell.clientHeight}px viewportMargin=${geometry.viewport - geometry.shell.clientHeight}px`);
  172 |   console.log(`PHASE4_RUNNER_DOCUMENT_LAYERS ${state}: html=${geometry.documentLayers.html.clientHeight}/${geometry.documentLayers.html.scrollHeight} body=${geometry.documentLayers.body.clientHeight}/${geometry.documentLayers.body.scrollHeight} page=${geometry.documentLayers.page.clientHeight}/${geometry.documentLayers.page.scrollHeight}`);
  173 |   console.log(`PHASE4_RUNNER_GEOMETRY ${state}: ${line('shell', geometry.shell)} ${line('main', geometry.main)} ${line('setPanel', geometry.panel)} ${line('setList', geometry.list)}`);
  174 |   console.log(`PHASE4_RUNNER_CURRENT_SET ${state}: row=${geometry.current.top}-${geometry.current.bottom}px list=${geometry.current.listTop}-${geometry.current.listBottom}px visible=${geometry.current.fullyVisible}`);
  175 |   console.log(`PHASE4_RUNNER_BELOW_FOLD ${state}: ${JSON.stringify(geometry.belowFold)}`);
  176 | 
  177 |   expect(Math.abs(geometry.shell.clientHeight - geometry.viewport), `${state} shell must fill the viewport`).toBeLessThanOrEqual(3);
  178 |   expect(geometry.documentHeight, `${state} document must not scroll`).toBeLessThanOrEqual(geometry.viewport);
  179 |   for (const [name, value] of Object.entries(geometry.fixedZones)) {
  180 |     expect(value.scrollHeight, `${state} ${name} must not hide vertical content`).toBeLessThanOrEqual(value.clientHeight);
  181 |   }
> 182 |   expect(geometry.current.fullyVisible, `${state} current set must be visible without list scrolling`).toBe(true);
      |                                                                                                        ^ Error: video=expanded current set must be visible without list scrolling
  183 |   expect(geometry.belowFold, `${state} runner must not place content below the viewport`).toEqual([]);
  184 | }
  185 | 
  186 | async function requireLongestExerciseRunner(page) {
  187 |   const runner = page.locator('[data-session-runner]');
  188 |   await expect(runner).toHaveCount(1);
  189 |   await expect(runner).toHaveAttribute('data-runner-phase', 'lifting');
  190 |   await expect(page.locator('[data-home-overview]')).toHaveCount(0);
  191 |   await expect(page.locator('[data-home-stat-tiles]')).toHaveCount(0);
  192 |   await expect(page.locator('[data-home-continue]')).toHaveCount(0);
  193 |   const renderedRows = await runner.locator('[data-runner-set-row]').count();
  194 |   const longestRows = await page.evaluate((user) => {
  195 |     const stateKey = `raedworkouts.${encodeURIComponent(user)}.state.v1`;
  196 |     const current = JSON.parse(localStorage.getItem(stateKey));
  197 |     return Math.max(...Object.values(current.active_session.exercises || {}).map((exercise) => exercise.sets.length));
  198 |   }, testUser);
  199 |   expect(renderedRows, 'runner must render the longest exercise in the loaded programme').toBe(longestRows);
  200 |   return runner;
  201 | }
  202 | 
  203 | test('Phase 4 runner contains all fixed content at 390x844 with video collapsed', async ({ page }) => {
  204 |   await openStartedRunner(page);
  205 |   await page.locator('[data-runner-video-toggle]').click();
  206 |   await recordRunnerGeometry(page, 'video=collapsed');
  207 |   await requireLongestExerciseRunner(page);
  208 |   console.log('PHASE4_RUNNER_COLLAPSED_PASSED');
  209 | });
  210 | 
  211 | test('Phase 4 runner contains all fixed content at 390x844 with video expanded by default', async ({ page }) => {
  212 |   await openStartedRunner(page);
  213 |   const videoToggle = page.locator('[data-runner-video-toggle]');
  214 |   await recordRunnerGeometry(page, 'video=expanded');
  215 |   const runner = await requireLongestExerciseRunner(page);
  216 |   await expect(videoToggle).toHaveCount(1);
  217 |   await expect(runner.locator('[data-runner-video][data-expanded="true"]')).toHaveCount(1);
  218 |   console.log('PHASE4_RUNNER_EXPANDED_PASSED');
  219 | });
  220 | 
  221 | test('Phase 4 runner persists its video and cue switches per profile', async ({ page }) => {
  222 |   await openStartedRunner(page);
  223 |   await requireLongestExerciseRunner(page);
  224 |   await page.locator('[data-runner-settings-button]').click();
  225 |   await page.locator('[data-runner-video-setting]').click();
  226 |   await page.locator('[data-runner-cues-setting]').click();
  227 |   await page.locator('[data-runner-settings-close]').click();
  228 |   await page.reload({ waitUntil: 'domcontentloaded' });
  229 |   const runner = await requireLongestExerciseRunner(page);
  230 |   await expect(runner.locator('[data-runner-video][data-expanded="false"]')).toHaveCount(1);
  231 |   await expect(runner.locator('.runner-cue')).toHaveCount(0);
  232 |   console.log('PHASE4_RUNNER_PREFERENCES_PASSED');
  233 | });
  234 | 
  235 | test('Phase 4 runner records a skipped warm-up, uses swipe only for exercise navigation, and leaves without ending', async ({ page }) => {
  236 |   await openStartedRunner(page);
  237 |   const runner = await requireLongestExerciseRunner(page);
  238 |   const beforeIndex = Number(await runner.getAttribute('data-runner-exercise-index'));
  239 |   const total = Number(await runner.getAttribute('data-runner-exercise-total'));
  240 | 
  241 |   const swipeForward = beforeIndex < total - 1;
  242 |   await runner.locator('.runner-main').dispatchEvent('pointerdown', { clientX: swipeForward ? 320 : 80, clientY: 280 });
  243 |   await runner.locator('.runner-main').dispatchEvent('pointerup', { clientX: swipeForward ? 80 : 320, clientY: 280 });
  244 |   const afterIndex = Number(await runner.getAttribute('data-runner-exercise-index'));
  245 |   const afterTotal = Number(await runner.getAttribute('data-runner-exercise-total'));
  246 |   expect(afterTotal, 'a swipe must stay inside the same session').toBe(total);
  247 |   expect(afterIndex, 'a horizontal swipe must move to an adjacent exercise').toBe(beforeIndex + (swipeForward ? 1 : -1));
  248 | 
  249 |   await page.locator('[data-runner-leave-button]').click();
  250 |   await expect(page.locator('[data-home-overview]')).toHaveCount(1);
  251 |   await expect(page.locator('[data-home-continue]')).toHaveCount(1);
  252 |   const persisted = await page.evaluate((user) => {
  253 |     const stateKey = `raedworkouts.${encodeURIComponent(user)}.state.v1`;
  254 |     return JSON.parse(localStorage.getItem(stateKey)).active_session;
  255 |   }, testUser);
  256 |   expect(persisted, 'leaving the runner must not end the session').toBeTruthy();
  257 |   expect(persisted.phase).toBe('lifting');
  258 |   expect(persisted.warmup.skipped).toBe(true);
  259 |   console.log('PHASE4_RUNNER_SESSION_LIFECYCLE_PASSED');
  260 | });
  261 | 
```