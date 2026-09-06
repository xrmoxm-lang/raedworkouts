# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: resilience.spec.mjs >> the card states the effort the programme asks for, and says it differently in a deload
- Location: tests/resilience.spec.mjs:616:1

# Error details

```
Error: a normal week must state a target effort

expect(received).toMatch(expected)

Expected pattern: /صعب|متوسط|قريب من الفشل|شبه الفشل/
Received string:  ""
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
  529 | });
  530 | 
  531 | // ---------------------------------------------------------------------------
  532 | // Two things that were dead rather than wrong.
  533 | //
  534 | // `state.current_block` is written NOWHERE — initialised to 1 in defaultState()
  535 | // and read in exactly one place. So the block the app thought it was in was
  536 | // permanently 1, isBlockTransition was permanently false, and every block
  537 | // announcement was unreachable: the "block N begins" toast, the block-boundary
  538 | // skin offer, and the deload week's own explanation. The programme's real
  539 | // position comes from derivedBlock().
  540 | //
  541 | // A deload week that arrives with no explanation reads as the app breaking —
  542 | // fewer sets, lower targets, same weights — or gets sandbagged, which [LADDER]
  543 | // L9844 warns about by name.
  544 | test('entering the deload week explains itself, in Arabic', async ({ page }) => {
  545 |   await boot(page);
  546 | 
  547 |   await page.evaluate(() => {
  548 |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  549 |     const parsed = JSON.parse(localStorage[key]);
  550 |     // 44 completed sessions = 11 weeks done = week 12 = the deload block.
  551 |     parsed.history = Array.from({ length: 44 }, (_, i) => ({
  552 |       date: '2026-01-01', session_id: ['upper_a', 'lower_a', 'upper_b', 'lower_b'][i % 4],
  553 |       started_at: '2026-01-01T09:00:00Z', ended_at: '2026-01-01T10:00:00Z', uid: `u${i}`,
  554 |       exercises: { chest_press_machine: { planned: { exercise_id: 'chest_press_machine', reps: '8-10' },
  555 |         sets: [{ is_warmup: false, weight: 40, reps: 10, completed: true }] } },
  556 |       prs: [], stats: {},
  557 |     }));
  558 |     parsed.active_session = null;
  559 |     parsed._last_toasted_block = 3;   // he was in Block C; this is a real crossing
  560 |     localStorage[key] = JSON.stringify(parsed);
  561 |   });
  562 | 
  563 |   await page.reload({ waitUntil: 'networkidle' });
  564 |   await page.waitForTimeout(1000);
  565 |   await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  566 |   await page.waitForTimeout(1600);
  567 | 
  568 |   const toast = page.locator('#toast');
  569 |   await expect(toast).toHaveClass(/show/);
  570 |   await expect(toast, 'the deload must say what it is and that it is deliberate').toContainText('تفريغ');
  571 | });
  572 | 
  573 | // The deload must be trainable, not just reachable: two of its rows drop to a
  574 | // single working set, and a single-set exercise is the case that used to hide
  575 | // the effort picker the check button demanded.
  576 | test('a deload session builds with reduced sets and no errors', async ({ page }) => {
  577 |   const pageErrors = [];
  578 |   page.on('pageerror', (e) => pageErrors.push(e.message));
  579 |   await boot(page);
  580 | 
  581 |   await page.evaluate(() => {
  582 |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  583 |     const parsed = JSON.parse(localStorage[key]);
  584 |     parsed.history = Array.from({ length: 44 }, (_, i) => ({
  585 |       date: '2026-01-01', session_id: ['upper_a', 'lower_a', 'upper_b', 'lower_b'][i % 4],
  586 |       started_at: '2026-01-01T09:00:00Z', ended_at: '2026-01-01T10:00:00Z', uid: `u${i}`,
  587 |       exercises: {}, prs: [], stats: {},
  588 |     }));
  589 |     parsed.active_session = null;
  590 |     localStorage[key] = JSON.stringify(parsed);
  591 |   });
  592 |   await page.reload({ waitUntil: 'networkidle' });
  593 |   await page.waitForTimeout(1000);
  594 |   await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  595 |   await page.waitForTimeout(900);
  596 |   await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  597 |   await page.waitForTimeout(1000);
  598 | 
  599 |   const counts = await page.evaluate(() => {
  600 |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  601 |     const parsed = JSON.parse(localStorage[key]);
  602 |     return Object.values(parsed.active_session.exercises)
  603 |       .map((e) => e.sets.filter((s) => !s.is_warmup).length);
  604 |   });
  605 |   expect(counts.length, 'the deload session must build').toBeGreaterThan(0);
  606 |   expect(Math.max(...counts), 'no deload exercise may keep three working sets').toBeLessThanOrEqual(2);
  607 |   expect(pageErrors, 'a one-working-set exercise must not throw').toEqual([]);
  608 | });
  609 | 
  610 | // ---------------------------------------------------------------------------
  611 | // The programme states an effort for every set — Block B raises it, the week-12
  612 | // deload lowers it — and `planned.rpe` was read NOWHERE in app.js. So none of it
  613 | // reached him. Worst case: the deload became "one fewer set" while the source
  614 | // (research/06 §7.4) prescribes the SAME weight with the effort taken off. A
  615 | // deload trained at normal intensity is not a deload.
  616 | test('the card states the effort the programme asks for, and says it differently in a deload', async ({ page }) => {
  617 |   await boot(page);
  618 |   await intoSession(page);
  619 | 
  620 |   // Two lines since 2026-09-05: the rep goal, and the effort under it. They were
  621 |   // one line, and three effort words after the goal sentence wrapped into a
  622 |   // run-on. Read each from its own element.
  623 |   const read = () => page.evaluate(() => ({
  624 |     goal: document.querySelector('[data-reps-goal]')?.textContent?.trim() || '',
  625 |     effort: document.querySelector('[data-prescribed-effort]')?.textContent?.trim() || '',
  626 |   }));
  627 | 
  628 |   const normal = await read();
> 629 |   expect(normal.effort, 'a normal week must state a target effort').toMatch(/صعب|متوسط|قريب من الفشل|شبه الفشل/);
      |                                                                     ^ Error: a normal week must state a target effort
  630 |   expect(normal.goal, 'and it still explains what earns a load increase').toContain('ليرتفع الوزن');
  631 | 
  632 |   // 44 completed sessions = week 12 = the deload block.
  633 |   await page.evaluate(() => {
  634 |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  635 |     const parsed = JSON.parse(localStorage[key]);
  636 |     parsed.history = Array.from({ length: 44 }, (_, i) => ({
  637 |       date: '2026-01-01', session_id: ['upper_a', 'lower_a', 'upper_b', 'lower_b'][i % 4],
  638 |       started_at: '2026-01-01T09:00:00Z', ended_at: '2026-01-01T10:00:00Z', uid: `u${i}`,
  639 |       exercises: {}, prs: [], stats: {},
  640 |     }));
  641 |     parsed.active_session = null;
  642 |     localStorage[key] = JSON.stringify(parsed);
  643 |   });
  644 |   await page.reload({ waitUntil: 'networkidle' });
  645 |   await page.waitForTimeout(1000);
  646 |   await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  647 |   await page.waitForTimeout(900);
  648 |   await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  649 |   await page.waitForTimeout(1000);
  650 | 
  651 |   const deload = await read();
  652 |   expect(deload.effort, 'the deload must ask for less effort, in words').toContain('خفيف');
  653 |   expect(deload.goal, 'and must NOT promise a load increase in the same breath').not.toContain('ليرتفع الوزن');
  654 | });
  655 | 
  656 | // ---------------------------------------------------------------------------
  657 | // The load increment used to be a body-part guess: +5 kg lower, +2.5 upper,
  658 | // 0 for accessories. research/06 §5.2 carries a red-flag callout naming this app
  659 | // by line number — the lower/upper split appears in NO source, and the sources'
  660 | // own worked examples use the same increment for a barbell squat and a triceps
  661 | // pressdown. The rule is step(E) = the smallest increment physically available,
  662 | // fallback 2.5 kg.
  663 | test('the load increment comes from the equipment, learned from his own logs', async ({ page }) => {
  664 |   await boot(page);
  665 | 
  666 |   await page.evaluate(() => {
  667 |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  668 |     const parsed = JSON.parse(localStorage[key]);
  669 |     const session = (date, loads) => ({
  670 |       date, session_id: 'upper_a', started_at: `${date}T09:00:00Z`, ended_at: `${date}T10:00:00Z`, uid: `s${date}`,
  671 |       exercises: Object.fromEntries(Object.entries(loads).map(([id, w]) => [id, {
  672 |         planned: { exercise_id: id, reps: '8-10' },
  673 |         sets: [0, 1, 2].map((_, i) => ({
  674 |           is_warmup: false, weight: w, reps: 15, completed: true, effort: i === 2 ? 'right' : null,
  675 |         })),
  676 |       }])),
  677 |       prs: [], stats: {},
  678 |     });
  679 |     // Chest press on a 5 kg pin stack; biceps curl on 2.5 kg dumbbells. The gaps
  680 |     // between the loads he actually logged ARE the smallest available increment.
  681 |     parsed.history = [
  682 |       session('2026-08-20', { chest_press_machine: 35, biceps_curl: 7.5 }),
  683 |       session('2026-08-24', { chest_press_machine: 40, biceps_curl: 10 }),
  684 |       session('2026-08-28', { chest_press_machine: 40, biceps_curl: 10 }),
  685 |     ];
  686 |     parsed.active_session = null;
  687 |     parsed.forced_next_session = 'upper_a';
  688 |     localStorage[key] = JSON.stringify(parsed);
  689 |   });
  690 | 
  691 |   await page.reload({ waitUntil: 'networkidle' });
  692 |   await page.waitForTimeout(1000);
  693 |   await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  694 |   await page.waitForTimeout(1000);
  695 | 
  696 |   const suggested = await page.evaluate(() => {
  697 |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  698 |     const parsed = JSON.parse(localStorage[key]);
  699 |     const first = (id) => (parsed.active_session.exercises[id]?.sets || []).find((s) => !s.is_warmup)?.weight;
  700 |     return { press: Number(first('chest_press_machine')), curl: Number(first('biceps_curl')) };
  701 |   });
  702 | 
  703 |   // A 5 kg stack steps by 5, and suggesting 42.5 would be a weight he cannot set.
  704 |   expect(suggested.press, 'a 5 kg pin stack must step by 5').toBe(45);
  705 |   // Dumbbells step by 2.5 — the SAME rule, not a body-part exception.
  706 |   expect(suggested.curl, 'a 2.5 kg dumbbell jump must step by 2.5').toBe(12.5);
  707 | });
  708 | 
  709 | // ---------------------------------------------------------------------------
  710 | // D19's re-entry ramp was prose. The Settings screen has been telling Raed "the
  711 | // first two weeks are a re-entry ramp" while session creation built the ordinary
  712 | // Block A rows. research/20 §8.3 gives the table; nothing read it.
  713 | //
  714 | //   week 1  compounds 6/6/6, isolation 7/7/7, TWO working sets on first exposure
  715 | //   week 2  compounds 6/7/7, isolation 7/8/8, full sets
  716 | //   week 3+ as printed
  717 | //
  718 | // Cycle 1 only — he re-enters after a layoff once, and week 12's deload handles
  719 | // fatigue from then on.
  720 | test('weeks 1 and 2 ramp him back in, and week 3 releases', async ({ page }) => {
  721 |   await boot(page);
  722 | 
  723 |   const atWeek = async (completed) => {
  724 |     await page.evaluate((n) => {
  725 |       const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  726 |       const parsed = JSON.parse(localStorage[key]);
  727 |       parsed.history = Array.from({ length: n }, (_, i) => ({
  728 |         date: '2026-01-01', session_id: ['upper_a', 'lower_a', 'upper_b', 'lower_b'][i % 4],
  729 |         started_at: '2026-01-01T09:00:00Z', ended_at: '2026-01-01T10:00:00Z', uid: `u${i}`,
```