# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: resilience.spec.mjs >> every control is at least 44px to the thumb, even where it looks smaller
- Location: tests/resilience.spec.mjs:114:1

# Error details

```
Error: gym use, one hand: 44px minimum, expand the hit area if the visual must stay small

expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 17

- Array []
+ Array [
+   Object {
+     "cls": "btn tiny ghost session-chooser-toggle",
+     "h": 31,
+     "w": 60,
+   },
+   Object {
+     "cls": "btn tiny",
+     "h": 31,
+     "w": 60,
+   },
+   Object {
+     "cls": "btn tiny",
+     "h": 31,
+     "w": 60,
+   },
+ ]
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
  53  |       e.name = 'QuotaExceededError';
  54  |       throw e;
  55  |     };
  56  |   });
  57  | 
  58  |   await page.evaluate(() => document.querySelector('.set-check')?.click());
  59  |   await page.waitForTimeout(1200);
  60  | 
  61  |   // 1. The failure must not escape as an uncaught error.
  62  |   expect(pageErrors, 'a failed local write must not throw out of the tap handler').toEqual([]);
  63  | 
  64  |   // 2. He must be told, visibly.
  65  |   const toast = page.locator('#toast');
  66  |   await expect(toast, 'a failed save has to be visible — he cannot see a console').toHaveClass(/show/);
  67  | 
  68  |   // 3. And the message must not be the reassuring one. With the server also
  69  |   //    unreachable there is no copy anywhere, and «حُفظت محلياً» would be the
  70  |   //    single most misleading sentence the app could show.
  71  |   await expect(toast).not.toContainText('حُفظت محلياً');
  72  | });
  73  | 
  74  | // ---------------------------------------------------------------------------
  75  | // The control he taps after every set had no accessible name at all.
  76  | test('every control on the session screen has an accessible name', async ({ page }) => {
  77  |   await boot(page);
  78  |   await intoSession(page);
  79  | 
  80  |   const unnamed = await page.evaluate(() => {
  81  |     const out = [];
  82  |     document.querySelectorAll('button, a[href], select, input').forEach((el) => {
  83  |       const r = el.getBoundingClientRect();
  84  |       if (!r.width || !r.height) return;
  85  |       const named = (el.textContent || '').trim()
  86  |         || el.getAttribute('aria-label')
  87  |         || el.getAttribute('aria-labelledby')
  88  |         || el.getAttribute('title')
  89  |         || (el.tagName === 'INPUT' && el.closest('label'));
  90  |       if (!named) out.push(el.className.toString() || el.tagName);
  91  |     });
  92  |     return out;
  93  |   });
  94  |   expect(unnamed, 'icon-only controls need aria-label; a placeholder is not a label').toEqual([]);
  95  | });
  96  | 
  97  | test('the set toggle reports its state, not just its name', async ({ page }) => {
  98  |   await boot(page);
  99  |   await intoSession(page);
  100 |   const check = page.locator('.set-check').first();
  101 |   await expect(check).toHaveAttribute('aria-pressed', 'false');
  102 |   await check.click();
  103 |   await page.waitForTimeout(400);
  104 |   // Either it ticked, or it refused for a stated reason — but the attribute
  105 |   // must exist and stay truthful either way.
  106 |   const pressed = await check.getAttribute('aria-pressed');
  107 |   expect(['true', 'false']).toContain(pressed);
  108 | });
  109 | 
  110 | // ---------------------------------------------------------------------------
  111 | // Measured, not assumed: the day strip was 27px tall and the gear 38px.
  112 | // The visual size is deliberate in places, so this measures the HIT area by
  113 | // point-testing outward from the centre, which is what a thumb actually meets.
  114 | test('every control is at least 44px to the thumb, even where it looks smaller', async ({ page }) => {
  115 |   await boot(page);
  116 |   await intoSession(page);
  117 |   // The «بدأت الجلسة» toast sits over the runner's own buttons for its first
  118 |   // ~1.8s, and point-testing through it reported a dozen controls at 0x0. That
  119 |   // was this test measuring a transient overlay, not a real defect — wait for
  120 |   // the toast to go before measuring anything.
  121 |   await page.locator('#toast:not(.show)').waitFor({ state: 'attached', timeout: 5000 });
  122 |   await page.waitForTimeout(200);
  123 | 
  124 |   const small = await page.evaluate(() => {
  125 |     const reachable = (el, dx, dy) => {
  126 |       const b = el.getBoundingClientRect();
  127 |       const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  128 |       let d = 0;
  129 |       for (let i = 1; i <= 30; i++) {
  130 |         const x = cx + dx * i, y = cy + dy * i;
  131 |         if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) break;
  132 |         const hit = document.elementFromPoint(x, y);
  133 |         if (!hit || !(hit === el || el.contains(hit))) break;
  134 |         d = i;
  135 |       }
  136 |       return d;
  137 |     };
  138 |     const out = [];
  139 |     document.querySelectorAll('button, a[href]').forEach((el) => {
  140 |       const b = el.getBoundingClientRect();
  141 |       if (!b.width || !b.height) return;
  142 |       // Only judge controls fully inside the viewport; a half-scrolled button
  143 |       // point-tests as zero and would fail for the wrong reason.
  144 |       if (b.top < 0 || b.bottom > innerHeight || b.left < 0 || b.right > innerWidth) return;
  145 |       const w = reachable(el, 1, 0) + reachable(el, -1, 0);
  146 |       const h = reachable(el, 0, 1) + reachable(el, 0, -1);
  147 |       // 43 not 44: the probe steps outward from the centre pixel, so a 44px
  148 |       // target measures 43 steps.
  149 |       if (w < 43 || h < 43) out.push({ cls: el.className.toString().slice(0, 40), w, h });
  150 |     });
  151 |     return out;
  152 |   });
> 153 |   expect(small, 'gym use, one hand: 44px minimum, expand the hit area if the visual must stay small').toEqual([]);
      |                                                                                                       ^ Error: gym use, one hand: 44px minimum, expand the hit area if the visual must stay small
  154 | });
  155 | 
  156 | // ---------------------------------------------------------------------------
  157 | // A ramp that does not ascend is not a ramp. Rounding both percentages DOWN to
  158 | // the equipment step collapsed 50% and 70% onto the same number at light loads:
  159 | // a 10 kg working weight rendered two «تدرّج» rows at 5 kg.
  160 | test('ramp sets ascend, and never sit at the working weight', async ({ page }) => {
  161 |   await boot(page);
  162 |   await intoSession(page);
  163 | 
  164 |   const rows = await page.evaluate(() => [...document.querySelectorAll('.set-row, .set-grid')]
  165 |     .map((row) => ({
  166 |       ramp: /تدرّج/.test(row.textContent || ''),
  167 |       values: [...row.querySelectorAll('input')].map((i) => i.value),
  168 |     }))
  169 |     .filter((r) => r.values.length >= 2));
  170 | 
  171 |   const ramps = rows.filter((r) => r.ramp);
  172 |   const working = rows.filter((r) => !r.ramp);
  173 |   test.skip(ramps.length < 2, 'this exercise prescribes fewer than two ramp sets');
  174 | 
  175 |   const weights = ramps.map((r) => Number(r.values[0])).filter(Number.isFinite);
  176 |   for (let i = 1; i < weights.length; i++) {
  177 |     expect(weights[i], `ramp ${i + 1} must be heavier than ramp ${i} — ${weights.join(', ')}`)
  178 |       .toBeGreaterThan(weights[i - 1]);
  179 |   }
  180 |   const workWeight = Number(working[0]?.values[0]);
  181 |   if (Number.isFinite(workWeight) && workWeight > 0) {
  182 |     expect(Math.max(...weights), 'a ramp at the working load is not a warm-up').toBeLessThan(workWeight);
  183 |   }
  184 | });
  185 | 
  186 | // ---------------------------------------------------------------------------
  187 | // The rest countdown lived only in a module-level object. The auto-update path
  188 | // reloads the page the moment the app is hidden mid-session — which is exactly
  189 | // when he pockets the phone to rest — so the alarm silently never arrived.
  190 | test('a running rest survives a reload', async ({ page }) => {
  191 |   await boot(page);
  192 |   await intoSession(page);
  193 | 
  194 |   await page.evaluate(() => { if (window.startRest) window.startRest(120); });
  195 |   const started = await page.evaluate(() => {
  196 |     const keys = Object.keys(localStorage).filter((k) => /restend/.test(k));
  197 |     return keys.length ? Number(localStorage.getItem(keys[0])) : 0;
  198 |   });
  199 |   test.skip(!started, 'startRest is not reachable from the page scope in this build');
  200 | 
  201 |   expect(started, 'the rest deadline must be persisted, not only held in memory').toBeGreaterThan(Date.now());
  202 | 
  203 |   await page.reload({ waitUntil: 'networkidle' });
  204 |   await page.waitForTimeout(1500);
  205 |   const visible = await page.evaluate(() => document.querySelector('#rest-timer')?.style.display);
  206 |   expect(visible, 'the countdown must resume after a reload').toBe('flex');
  207 | });
  208 | 
  209 | // ---------------------------------------------------------------------------
  210 | // The worst one this audit found.
  211 | //
  212 | // openProfile() and finishLocalProfile() both built a fresh defaultState() and
  213 | // then persistLocal()'d it, without ever reading what the device already held
  214 | // for that profile. So tapping your own name on the welcome screen while the
  215 | // server was unreachable — gym wifi, HP off, aeroplane mode — wrote a blank
  216 | // state straight over the training log. No warning, no undo, suite green.
  217 | test('tapping your own profile with the server unreachable does not destroy your history', async ({ page }) => {
  218 |   await boot(page);
  219 | 
  220 |   const seeded = await page.evaluate(() => {
  221 |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  222 |     const parsed = JSON.parse(localStorage[key]);
  223 |     parsed.history = [
  224 |       { date: '2026-08-20', session_id: 'upper_a', started_at: '2026-08-20T09:00:00Z', ended_at: '2026-08-20T10:00:00Z', exercises: {}, prs: [], stats: {} },
  225 |       { date: '2026-08-22', session_id: 'lower_a', started_at: '2026-08-22T09:00:00Z', ended_at: '2026-08-22T10:00:00Z', exercises: {}, prs: [], stats: {} },
  226 |       { date: '2026-08-25', session_id: 'upper_b', started_at: '2026-08-25T09:00:00Z', ended_at: '2026-08-25T10:00:00Z', exercises: {}, prs: [], stats: {} },
  227 |     ];
  228 |     parsed.prs = { chest_press_machine: { kg: 40, reps: 10, date: '2026-08-25', score: 53.3 } };
  229 |     parsed.active_session = null;
  230 |     localStorage[key] = JSON.stringify(parsed);
  231 |     // Back to the welcome screen: what a new device, a cleared pointer, or a
  232 |     // "wipe local" leaves behind.
  233 |     localStorage.removeItem('raedworkouts.active_user');
  234 |     return key;
  235 |   });
  236 | 
  237 |   await page.reload({ waitUntil: 'networkidle' });
  238 |   await page.waitForTimeout(900);
  239 |   await expect(page.locator('.profile-tile').first()).toBeVisible();
  240 | 
  241 |   await page.evaluate(() => {
  242 |     const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
  243 |     if (tile) tile.click();
  244 |   });
  245 |   await page.waitForTimeout(2500);
  246 | 
  247 |   const after = await page.evaluate((key) => {
  248 |     const parsed = JSON.parse(localStorage[key] || '{}');
  249 |     return { sessions: (parsed.history || []).length, prs: Object.keys(parsed.prs || {}).length };
  250 |   }, seeded);
  251 | 
  252 |   expect(after.sessions, 'opening a profile must never overwrite its stored history').toBe(3);
  253 |   expect(after.prs, 'nor its personal records').toBe(1);
```