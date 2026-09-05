// The settings rows gained a state line on 2026-09-05 — «Raed · 82 kg»,
// «الأسبوع 2 · الدورة 1» — to kill the dead space that made seven identical
// slabs unreadable without opening all seven. It is 11.5px, so it needs the full
// 4.5:1, and it has to hold in all three skins in both themes. Measured, because
// a muted token that reads fine on paper can vanish on حديد dark.
import { expect, test } from '@playwright/test';
test.use({ viewport:{width:390,height:844} });
const lum = c => { const [r,g,b]=c.match(/\d+/g).map(Number).map(v=>{v/=255; return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;}); return 0.2126*r+0.7152*g+0.0722*b; };
const ratio=(a,c)=>{const l1=lum(a),l2=lum(c); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);};
test('the new settings hint is readable in all six skin/theme pairs', async ({ page }) => {
  await page.route('https://raed-hp.tail53bd35.ts.net/**', r=>r.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', r=>r.abort());
  await page.goto('http://localhost:8877',{waitUntil:'networkidle'}); await page.waitForTimeout(700);
  await page.evaluate(()=>{const t=[...document.querySelectorAll('.profile-tile')].find(e=>/Raed/.test(e.textContent)); t&&t.click();});
  await page.waitForTimeout(900);
  const bad=[];
  for (const skin of ['hadid','waraq','rukham']) for (const theme of ['light','dark']) {
    await page.evaluate(([s,t])=>{const k=Object.keys(localStorage).find(x=>/\.settings\./.test(x)&&/raed/i.test(x));
      const st=JSON.parse(localStorage[k]); st.skin=s; st.theme=t; localStorage[k]=JSON.stringify(st);},[skin,theme]);
    await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(600);
    await page.locator('.tab-bar .tab[data-route="settings"]').click(); await page.waitForTimeout(400);
    const r = await page.evaluate(()=>{ const hint=document.querySelector('.sd-hint'); const sum=hint.closest('summary');
      return { fg:getComputedStyle(hint).color, bg:getComputedStyle(sum).backgroundColor }; });
    const cr = ratio(r.fg, r.bg);
    console.log(`  ${skin}/${theme}: ${cr.toFixed(2)}:1`);
    if (cr < 4.5) bad.push(`${skin}/${theme} ${cr.toFixed(2)}:1`);
  }
  expect(bad, 'the hint is 11.5px, so it needs the full 4.5:1').toEqual([]);
});
