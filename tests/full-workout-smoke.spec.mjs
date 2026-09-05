// The one test that walks the whole thing: open the app, pick the profile, start
// the session, skip the warm-up, log every set of every exercise, finish, and
// check what landed in history.
//
// Written 2026-09-05 after an audit that changed the session builder, the
// progression engine, the date stamping, the storage layer, the service worker,
// the sync merge and the home screen across ~15 commits in one night. Every one
// of those had its own targeted test; none of them proved the app still works
// as a whole. This does, and it is the test to run first when something feels
// wrong.
import { expect, test } from '@playwright/test';
test.use({ viewport:{width:390,height:844} });
test('a whole workout, start to finish, on a fresh profile', async ({ page }) => {
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.route('https://raed-hp.tail53bd35.ts.net/**', r=>r.abort());
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', r=>r.abort());
  await page.goto('http://localhost:8877',{waitUntil:'networkidle'}); await page.waitForTimeout(800);
  // 1. welcome -> profile
  await page.evaluate(()=>{const t=[...document.querySelectorAll('.profile-tile')].find(e=>/Raed/.test(e.textContent)); t&&t.click();});
  await page.waitForTimeout(900);
  const home = await page.evaluate(()=>document.querySelector('[data-home-overview]')?.textContent?.trim().slice(0,40));
  expect(home, 'home must announce the day and the session').toBeTruthy();
  // 2. start + warmup
  await page.evaluate(()=>document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(()=>document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(1000);
  // 3. log every set of every exercise
  const done = await page.evaluate(async ()=>{
    let ticked=0;
    for (let ex=0; ex<10; ex++) {
      const rows=[...document.querySelectorAll('.set-grid')];
      for (const row of rows) {
        const ins=[...row.querySelectorAll('input')];
        if (ins.length>=2) { ins[0].value='20'; ins[0].dispatchEvent(new Event('input',{bubbles:true}));
                             ins[1].value='10'; ins[1].dispatchEvent(new Event('input',{bubbles:true})); }
        const eff=row.nextElementSibling?.classList?.contains('effort-strip') ? row.nextElementSibling.querySelector('button') : null; if (eff) eff.click();
        const chk=row.querySelector('.set-check'); if (chk) { chk.click(); ticked++; }
        await new Promise(r=>setTimeout(r,60));
      }
      const next=document.querySelector('.runner-nav .btn.primary'); if(!next) break;
      next.click(); await new Promise(r=>setTimeout(r,350));
    }
    return ticked;
  });
  expect(done, 'the runner must accept a full session of sets').toBeGreaterThan(10);
  // 4. finish
  await page.evaluate(()=>{
    const b=[...document.querySelectorAll('button')].find(x=>/إنهاء|أنهِ/.test(x.textContent)); if(b) b.click();
  });
  await page.waitForTimeout(900);
  await page.evaluate(()=>{ const y=[...document.querySelectorAll('#modal button')].find(b=>/أنهِ|إنهاء|نعم/.test(b.textContent)); if(y) y.click(); });
  await page.waitForTimeout(1200);
  const after = await page.evaluate(()=>{
    const k=Object.keys(localStorage).find(x=>/\.state\./.test(x)&&/raed/i.test(x));
    const p=JSON.parse(localStorage[k]);
    const last=(p.history||[])[p.history.length-1];
    const sets=last?Object.values(last.exercises||{}).reduce((n,e)=>n+(e.sets||[]).filter(s=>!s.is_warmup&&s.completed).length,0):0;
    return { history:(p.history||[]).length, activeCleared:!p.active_session, tombstone:!!p.active_cleared, loggedSets:sets };
  });
  expect(after.history, 'the finished session must reach history').toBeGreaterThan(0);
  expect(after.activeCleared, 'and the active session must be cleared').toBe(true);
  // The tombstone is what stops the sync server handing the finished session
  // straight back as still in progress.
  expect(after.tombstone, 'finishing must record an active_cleared tombstone').toBe(true);
  expect(after.loggedSets, 'the sets he logged must be in the archived session').toBeGreaterThan(0);
  expect(errs).toEqual([]);
});
