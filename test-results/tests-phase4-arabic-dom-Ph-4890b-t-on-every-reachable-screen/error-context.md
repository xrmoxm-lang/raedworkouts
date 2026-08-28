# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/phase4-arabic-dom.spec.mjs >> Phase 4 Arabic UI renders no undeclared visible Latin text on every reachable screen
- Location: tests/phase4-arabic-dom.spec.mjs:164:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('[data-session-runner][data-runner-phase="lifting"]')
Expected: 1
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('[data-session-runner][data-runner-phase="lifting"]')
    9 × locator resolved to 0 elements
      - unexpected value "0"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]: ▸ ▸ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▸ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▸ ▸ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▸ ▶ ▶ ▶ ▶ ▸ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▸ ▶ ▶ ▸ ▸ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▶ ▸ ▶ ▶ ▶ ▶ ▶ ▶ ▸ ▶ ▶ ▶ ▸ ▶ ▶ ▶ ▶ ▶ ▶ ▸ ▸ ▶ ▶ ▸
  - generic [ref=e3]: فشلت المزامنة السحابية — حُفظت محلياً.
```

# Test source

```ts
  82  |         && rect.width > 0 && rect.height > 0
  83  |         && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  84  |     };
  85  |     const removeRuns = (value, phrases) => {
  86  |       let residual = value;
  87  |       for (const scheme of approvedSchemes) {
  88  |         residual = residual.replace(new RegExp(`${escape(scheme)}(?:\\?name=)?`, 'gi'), ' ');
  89  |       }
  90  |       for (const phrase of phrases) residual = residual.replace(new RegExp(escape(phrase), 'gi'), ' ');
  91  |       return residual
  92  |         .replace(westernNumeral, ' ')
  93  |         .replace(/\bkg\b/g, ' ')
  94  |         .replace(/\b[xX]\b/g, ' ')
  95  |         .replace(/\b(?:M)(?=\d+\b)/g, ' ')
  96  |         .replace(new RegExp(`\\b(?:${abbreviations.map(escape).join('|')})\\b`, 'g'), ' ')
  97  |         .replace(/\s+/g, ' ')
  98  |         .trim();
  99  |     };
  100 |     const normalize = (value) => String(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  101 |     const deferredMatch = (value) => {
  102 |       const visible = normalize(value);
  103 |       // Attribute the entire rendered node to its source string.  This keeps
  104 |       // "Chest, shoulders, triceps" deferred when the renderer has split the
  105 |       // data.js source "Push — Chest, shoulders, triceps" into siblings.
  106 |       return deferred.find((source) => normalize(source).includes(visible));
  107 |     };
  108 |     const found = new Set();
  109 |     const deferredFound = new Set();
  110 |     const activePage = document.querySelector('.page.active');
  111 |     const roots = [
  112 |       activePage?.querySelector('[data-session-runner]') || activePage,
  113 |       document.querySelector('.app-header'),
  114 |       document.querySelector('.tab-bar'),
  115 |       document.querySelector('#rest-timer'),
  116 |     ].filter(Boolean);
  117 |     for (const root of roots) {
  118 |       const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  119 |       let node;
  120 |       while ((node = walker.nextNode())) {
  121 |         const value = node.textContent.trim();
  122 |         if (!value || !latin.test(value) || !isVisible(node.parentElement)) continue;
  123 |         // An allowed exercise/drill/name wins before programme classification.
  124 |         // This makes the buckets mutually exclusive and avoids treating the
  125 |         // word "Pull" inside an exercise name as a deferred programme label.
  126 |         const residual = removeRuns(value, allowed);
  127 |         if (!latin.test(residual)) continue;
  128 |         const matchedDeferred = deferredMatch(value);
  129 |         if (matchedDeferred) {
  130 |           deferredFound.add(matchedDeferred);
  131 |           continue;
  132 |         }
  133 |         if (latin.test(residual)) found.add(value);
  134 |       }
  135 |     }
  136 |     return {
  137 |       offenders: [...found].sort((a, b) => a.localeCompare(b)),
  138 |       deferred: [...deferredFound].sort((a, b) => a.localeCompare(b)),
  139 |     };
  140 |   }, { allowed: allowedLatinRuns, abbreviations: allowedProperNounAbbreviations, deferred: [] });
  141 |   console.log(`PHASE4_ARABIC_DOM screen=${screen} offending=${JSON.stringify(result.offenders)} deferred=${JSON.stringify(result.deferred)}`);
  142 |   return result.offenders.map((text) => ({ screen, text }));
  143 | }
  144 | 
  145 | async function openSignedInArabicApp(page) {
  146 |   await page.route('https://**/*', (route) => route.abort());
  147 |   await page.addInitScript(({ user, state, settings }) => {
  148 |     if (sessionStorage.getItem('phase4-arabic-dom-seeded')) return;
  149 |     localStorage.clear();
  150 |     localStorage.setItem('raedworkouts.active_user', user);
  151 |     localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.state.v1`, JSON.stringify(state));
  152 |     localStorage.setItem(`raedworkouts.${encodeURIComponent(user)}.settings.v1`, JSON.stringify(settings));
  153 |     sessionStorage.setItem('phase4-arabic-dom-seeded', 'true');
  154 |   }, { user: testUser, state: seededState(), settings: seededSettings() });
  155 |   await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  156 |   await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  157 | }
  158 | 
  159 | async function visitTab(page, route) {
  160 |   await page.locator(`.tab[data-route="${route}"]`).click();
  161 |   await expect(page.locator(`#page-${route}`)).toHaveClass(/active/);
  162 | }
  163 | 
  164 | test('Phase 4 Arabic UI renders no undeclared visible Latin text on every reachable screen', async ({ page }) => {
  165 |   const findings = [];
  166 |   // Round 5 translated the live Upper/Lower programme. Keep the zero count
  167 |   // explicit so future programme data cannot be silently treated as deferred.
  168 |   logDeferredProgramme();
  169 |   await openSignedInArabicApp(page);
  170 | 
  171 |   findings.push(...await scanVisibleLatin(page, 'home'));
  172 |   for (const route of ['library', 'history', 'settings', 'help']) {
  173 |     await visitTab(page, route);
  174 |     findings.push(...await scanVisibleLatin(page, route));
  175 |   }
  176 | 
  177 |   await visitTab(page, 'home');
  178 |   await page.locator('#page-home button.btn.primary.full').first().click();
  179 |   await expect(page.locator('[data-session-runner]')).toHaveCount(1);
  180 |   findings.push(...await scanVisibleLatin(page, 'runner-warmup'));
  181 |   await page.locator('[data-runner-skip-warmup]').click();
> 182 |   await expect(page.locator('[data-session-runner][data-runner-phase="lifting"]')).toHaveCount(1);
      |                                                                                    ^ Error: expect(locator).toHaveCount(expected) failed
  183 |   findings.push(...await scanVisibleLatin(page, 'runner-lifting'));
  184 | 
  185 |   await page.evaluate(() => {
  186 |     localStorage.clear();
  187 |     localStorage.setItem('raedworkouts.profiles.v1', JSON.stringify([
  188 |       { user_id: 'arabic-pin-profile', display_name: 'ملف تجريبي', has_pin: true, experience: 'returning' },
  189 |     ]));
  190 |   });
  191 |   await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  192 |   findings.push(...await scanVisibleLatin(page, 'profiles'));
  193 |   await page.getByRole('button', { name: /ملف تجريبي/ }).click();
  194 |   await expect(page.locator('.pin-panel')).toHaveCount(1);
  195 |   findings.push(...await scanVisibleLatin(page, 'profile-pin'));
  196 |   await page.getByRole('button', { name: /الملفات/ }).click();
  197 |   await page.getByRole('button', { name: /شخص آخر/ }).click();
  198 |   await expect(page.locator('.register-panel')).toHaveCount(1);
  199 |   findings.push(...await scanVisibleLatin(page, 'profile-other'));
  200 |   await page.locator('.register-panel input[type="text"]').fill('اختبار');
  201 |   await page.locator('.register-panel .btn.primary.full').click();
  202 |   await expect(page.locator('.register-panel')).toHaveCount(1);
  203 |   findings.push(...await scanVisibleLatin(page, 'profile-register'));
  204 | 
  205 |   expect(findings, 'visible Latin text must be an explicit allowed run on every reachable Arabic screen').toEqual([]);
  206 |   console.log('PHASE4_ARABIC_DOM_PASSED');
  207 | });
  208 | 
```