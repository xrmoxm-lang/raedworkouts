# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings-hint-contrast.spec.mjs >> the new settings hint is readable in all six skin/theme pairs
- Location: tests/settings-hint-contrast.spec.mjs:10:1

# Error details

```
TimeoutError: page.reload: Timeout 20000ms exceeded.
Call log:
  - waiting for navigation until "networkidle"
    - navigated to "http://localhost:8877/#settings"

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
        - heading "الإعدادات" [level=1] [ref=e20]
        - generic [ref=e21]: الملف والبرنامج والمزامنة والبيانات.
      - group [ref=e22]:
        - generic "الملف Raed · 82 kg" [ref=e23] [cursor=pointer]:
          - img [ref=e25]
          - generic [ref=e28]:
            - generic [ref=e29]: الملف
            - generic [ref=e31]:
              - text: Raed
              - generic [ref=e32]: · 82 kg
        - option "جديد على النادي"
        - option "تدرّبت سابقًا وعائد" [selected]
        - option "تدرّبت سابقًا وعائد"
        - option "أتدرّب حاليًا"
      - group [ref=e33]:
        - generic "البرنامج الأسبوع 1 · الدورة 1" [ref=e34] [cursor=pointer]:
          - img [ref=e36]
          - generic [ref=e39]:
            - generic [ref=e40]: البرنامج
            - generic [ref=e41]: الأسبوع 1 · الدورة 1
      - group [ref=e42]:
        - generic "المدرب الموديل والمصروف" [ref=e43] [cursor=pointer]:
          - img [ref=e45]
          - generic [ref=e48]:
            - generic [ref=e49]: المدرب
            - generic [ref=e50]: الموديل والمصروف
      - group [ref=e51]:
        - generic "تفضيلات حديد · غامق" [ref=e52] [cursor=pointer]:
          - img [ref=e54]
          - generic [ref=e55]:
            - generic [ref=e56]: تفضيلات
            - generic [ref=e57]: حديد · غامق
        - text: ▸
        - option "غير محدد" [selected]
        - option "حديد"
        - option "ورق"
        - option "رخام"
        - option "غير محدد" [selected]
        - option "حديد"
        - option "ورق"
        - option "رخام"
        - option "غير محدد" [selected]
        - option "حديد"
        - option "ورق"
        - option "رخام"
        - option "غير محدد" [selected]
        - option "حديد"
        - option "ورق"
        - option "رخام"
      - group [ref=e58]:
        - generic "الموسيقى Spotify" [ref=e59] [cursor=pointer]:
          - img [ref=e61]
          - generic [ref=e65]:
            - generic [ref=e66]: الموسيقى
            - generic [ref=e67]: Spotify
      - group [ref=e68]:
        - generic "سحب البيانات آخر مزامنة 6 سبتمبر" [ref=e69] [cursor=pointer]:
          - img [ref=e71]
          - generic [ref=e74]:
            - generic [ref=e75]: سحب البيانات
            - generic [ref=e76]: آخر مزامنة 6 سبتمبر
      - group [ref=e77]:
        - generic "المساعدة" [ref=e78] [cursor=pointer]:
          - img [ref=e80]
          - generic [ref=e83]: المساعدة
  - navigation [ref=e84]:
    - button "الرئيسية" [ref=e85] [cursor=pointer]:
      - img [ref=e87]
      - generic [ref=e91]: الرئيسية
    - button "المدرب" [ref=e92] [cursor=pointer]:
      - img [ref=e94]
      - generic [ref=e97]: المدرب
    - button "السجل" [ref=e98] [cursor=pointer]:
      - img [ref=e100]
      - generic [ref=e103]: السجل
    - button "المكتبة" [ref=e104] [cursor=pointer]:
      - img [ref=e106]
      - generic [ref=e109]: المكتبة
    - button "الإعدادات" [ref=e110] [cursor=pointer]:
      - img [ref=e112]
      - generic [ref=e116]: الإعدادات
  - alert: فشلت المزامنة السحابية — حُفظت محلياً.
```

# Test source

```ts
  1  | // The settings rows gained a state line on 2026-09-05 — «Raed · 82 kg»,
  2  | // «الأسبوع 2 · الدورة 1» — to kill the dead space that made seven identical
  3  | // slabs unreadable without opening all seven. It is 11.5px, so it needs the full
  4  | // 4.5:1, and it has to hold in all three skins in both themes. Measured, because
  5  | // a muted token that reads fine on paper can vanish on حديد dark.
  6  | import { expect, test } from '@playwright/test';
  7  | test.use({ viewport:{width:390,height:844} });
  8  | const lum = c => { const [r,g,b]=c.match(/\d+/g).map(Number).map(v=>{v/=255; return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;}); return 0.2126*r+0.7152*g+0.0722*b; };
  9  | const ratio=(a,c)=>{const l1=lum(a),l2=lum(c); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);};
  10 | test('the new settings hint is readable in all six skin/theme pairs', async ({ page }) => {
  11 |   await page.route('https://raed-hp.tail53bd35.ts.net/**', r=>r.abort());
  12 |   await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', r=>r.abort());
  13 |   await page.goto('http://localhost:8877',{waitUntil:'networkidle'}); await page.waitForTimeout(700);
  14 |   await page.evaluate(()=>{const t=[...document.querySelectorAll('.profile-tile')].find(e=>/Raed/.test(e.textContent)); t&&t.click();});
  15 |   await page.waitForTimeout(900);
  16 |   const bad=[];
  17 |   for (const skin of ['hadid','waraq','rukham']) for (const theme of ['light','dark']) {
  18 |     await page.evaluate(([s,t])=>{const k=Object.keys(localStorage).find(x=>/\.settings\./.test(x)&&/raed/i.test(x));
  19 |       const st=JSON.parse(localStorage[k]); st.skin=s; st.theme=t; localStorage[k]=JSON.stringify(st);},[skin,theme]);
> 20 |     await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(600);
     |                ^ TimeoutError: page.reload: Timeout 20000ms exceeded.
  21 |     await page.locator('.tab-bar .tab[data-route="settings"]').click(); await page.waitForTimeout(400);
  22 |     const r = await page.evaluate(()=>{ const hint=document.querySelector('.sd-hint'); const sum=hint.closest('summary');
  23 |       return { fg:getComputedStyle(hint).color, bg:getComputedStyle(sum).backgroundColor }; });
  24 |     const cr = ratio(r.fg, r.bg);
  25 |     console.log(`  ${skin}/${theme}: ${cr.toFixed(2)}:1`);
  26 |     if (cr < 4.5) bad.push(`${skin}/${theme} ${cr.toFixed(2)}:1`);
  27 |   }
  28 |   expect(bad, 'the hint is 11.5px, so it needs the full 4.5:1').toEqual([]);
  29 | });
  30 | 
```