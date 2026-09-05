# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: resilience.spec.mjs >> weeks 1 and 2 ramp him back in, and week 3 releases
- Location: tests/resilience.spec.mjs:720:1

# Error details

```
TimeoutError: page.reload: Timeout 20000ms exceeded.
Call log:
  - waiting for navigation until "networkidle"
    - navigated to "http://localhost:8877/#home"

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
          - generic [ref=e21]: السبت · يوم نادٍ
          - heading "علوي أ" [level=2] [ref=e22]
          - generic [ref=e23]:
            - generic [ref=e24]: "7"
            - text: تمارين ·
            - generic [ref=e25]: ~65 دقيقة
          - generic [ref=e26]: الأسبوع 2 · الدورة 1
        - generic [ref=e27]:
          - img [ref=e28]
          - generic [ref=e30]:
            - generic [ref=e31]: "0"
            - generic [ref=e32]: /4
          - generic [ref=e33]: هذا الأسبوع
      - generic [ref=e34]:
        - button "▶ ابدأ علوي أ" [ref=e35] [cursor=pointer]
        - button "اختر تمريناً آخر ▾" [ref=e37] [cursor=pointer]
        - generic [ref=e38]:
          - generic [ref=e39]:
            - generic [ref=e40]: "اليوم: علوي أ"
            - generic [ref=e41]:
              - generic [ref=e42]:
                - generic [ref=e43]: السبت
                - generic [ref=e44]: ·
              - generic [ref=e46]: الأحد
              - generic [ref=e48]: الاثنين
              - generic [ref=e50]: الثلاثاء
              - generic [ref=e52]: الأربعاء
              - generic [ref=e54]: الخميس
              - generic [ref=e56]: الجمعة
            - generic [ref=e57]: باقي 4 جلسات هذا الأسبوع
          - generic [ref=e58]:
            - generic [ref=e59]:
              - generic [ref=e60]: "0"
              - generic [ref=e61]: المواظبة
              - generic [ref=e62]: جلسات / 4 أسابيع
            - generic [ref=e63]:
              - generic [ref=e64]: "0"
              - generic [ref=e65]: هذا الأسبوع
              - generic [ref=e66]: مجموعات عمل
            - generic [ref=e67]:
              - generic [ref=e68]: "0"
              - generic [ref=e69]: الحمل الكلي
              - generic [ref=e70]: كغ هذا الأسبوع
        - generic [ref=e71]:
          - generic [ref=e72]: "🎧 سبوتيفاي — شغّل وانسَ الموضوع:"
          - generic [ref=e73]:
            - link "Heavy Lifting" [ref=e74] [cursor=pointer]:
              - /url: https://music.youtube.com/search?q=heavy+lifting+workout+playlist
              - generic [ref=e75]: Heavy Lifting
            - link "Hard Rap Workout" [ref=e76] [cursor=pointer]:
              - /url: https://music.youtube.com/search?q=hard+rap+workout+playlist
              - generic [ref=e77]: Hard Rap Workout
      - heading "خطة التمرين" [level=3] [ref=e78]
      - generic [ref=e82] [cursor=pointer]:
        - heading "1. Chest Press Machine" [level=4] [ref=e83]
        - generic [ref=e84]:
          - generic [ref=e85]: صدر
          - generic [ref=e86]: 3 × 8-10
          - text: ·
          - strong [ref=e87]: —
      - generic [ref=e91] [cursor=pointer]:
        - heading "2. Lat Pulldown (Neutral Grip)" [level=4] [ref=e92]
        - generic [ref=e93]:
          - generic [ref=e94]: ظهر
          - generic [ref=e95]: 3 × 10-12
          - text: ·
          - strong [ref=e96]: —
      - generic [ref=e100] [cursor=pointer]:
        - heading "3. Shoulder Press (Machine/DB)" [level=4] [ref=e101]
        - generic [ref=e102]:
          - generic [ref=e103]: أكتاف
          - generic [ref=e104]: 3 × 10-12
          - text: ·
          - strong [ref=e105]: —
      - generic [ref=e109] [cursor=pointer]:
        - heading "4. T-Bar Row" [level=4] [ref=e110]
        - generic [ref=e111]:
          - generic [ref=e112]: ظهر علوي
          - generic [ref=e113]: 3 × 10-12
          - text: ·
          - strong [ref=e114]: —
      - generic [ref=e118] [cursor=pointer]:
        - heading "5. Biceps Curl (DB or Cable)" [level=4] [ref=e119]
        - generic [ref=e120]:
          - generic [ref=e121]: باي
          - generic [ref=e122]: 2 × 10-12
          - text: ·
          - strong [ref=e123]: —
      - generic [ref=e127] [cursor=pointer]:
        - heading "6. Single-Arm Rope Triceps Extension" [level=4] [ref=e128]
        - generic [ref=e129]:
          - generic [ref=e130]: تراي
          - generic [ref=e131]: 2 × 10-12
          - text: ·
          - strong [ref=e132]: —
      - generic [ref=e136] [cursor=pointer]:
        - heading "7. Lateral Raise (Cable)" [level=4] [ref=e137]
        - generic [ref=e138]:
          - generic [ref=e139]: الكتف الجانبي
          - generic [ref=e140]: 3 × 10-12
          - text: ·
          - strong [ref=e141]: —
  - navigation [ref=e142]:
    - button "الرئيسية" [ref=e143] [cursor=pointer]:
      - img [ref=e145]
      - generic [ref=e149]: الرئيسية
    - button "المكتبة" [ref=e150] [cursor=pointer]:
      - img [ref=e152]
      - generic [ref=e155]: المكتبة
    - button "السجل" [ref=e156] [cursor=pointer]:
      - img [ref=e158]
      - generic [ref=e161]: السجل
    - button "المدرب" [ref=e162] [cursor=pointer]:
      - img [ref=e164]
      - generic [ref=e167]: المدرب
    - button "الإعدادات" [ref=e168] [cursor=pointer]:
      - img [ref=e170]
      - generic [ref=e174]: الإعدادات
  - alert: فشلت المزامنة السحابية — حُفظت محلياً.
```

# Test source

```ts
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
  730 |         exercises: {}, prs: [], stats: {},
  731 |       }));
  732 |       parsed.active_session = null;
  733 |       parsed.forced_next_session = 'upper_a';
  734 |       localStorage[key] = JSON.stringify(parsed);
  735 |     }, completed);
> 736 |     await page.reload({ waitUntil: 'networkidle' });
      |                ^ TimeoutError: page.reload: Timeout 20000ms exceeded.
  737 |     await page.waitForTimeout(900);
  738 |     await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  739 |     await page.waitForTimeout(800);
  740 |     await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  741 |     await page.waitForTimeout(900);
  742 |     return page.evaluate(() => {
  743 |       const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  744 |       const parsed = JSON.parse(localStorage[key]);
  745 |       const entry = parsed.active_session.exercises.chest_press_machine;
  746 |       return {
  747 |         sets: (entry?.sets || []).filter((s) => !s.is_warmup).length,
  748 |         // The effort moved to its own line on 2026-09-05, so that it can state
  749 |         // one word PER SET instead of the hardest of the three.
  750 |         effort: document.querySelector('[data-prescribed-effort]')?.textContent?.trim() || '',
  751 |       };
  752 |     });
  753 |   };
  754 | 
  755 |   // Week 1: two working sets on a movement he has never done, and the gentlest
  756 |   // effort band the app has words for.
  757 |   const w1 = await atWeek(0);
  758 |   expect(w1.sets, 'week 1 caps first exposure at two working sets').toBe(2);
  759 |   expect(w1.effort).toContain('خفيف');
  760 | 
  761 |   // Week 2: full sets, one band up.
  762 |   const w2 = await atWeek(4);
  763 |   expect(w2.sets, 'week 2 restores the full prescription').toBe(3);
  764 |   expect(w2.effort).toContain('متوسط');
  765 | 
  766 |   // Week 3: the ramp is over.
  767 |   const w3 = await atWeek(8);
  768 |   expect(w3.sets).toBe(3);
  769 |   expect(w3.effort, 'week 3 is Block A as printed').toContain('صعب');
  770 | });
  771 | 
  772 | // ---------------------------------------------------------------------------
  773 | // "Today training / tomorrow rest, at a glance, before I leave the house" is
  774 | // something Raed asked for four separate times and never got. The rest branch
  775 | // existed in the code but was UNREACHABLE: it required `planned` to be falsy,
  776 | // and getTodayPlannedSession() always returns the next session in the rotation.
  777 | // Every single day said «يوم نادٍ», including days he had already finished his
  778 | // week on.
  779 | //
  780 | // The rotation is history-driven on purpose — a missed Tuesday must not break it
  781 | // — so the app cannot claim Tuesday is Upper A. What it can say honestly is
  782 | // whether he still owes the week a session, counted against `weekly_layout`,
  783 | // which had sat in data.js consumed by nothing.
  784 | test('home tells him whether today is a training day or a rest day', async ({ page }) => {
  785 |   // Pinned to a Wednesday so earlier days of the same Saudi week exist to fill.
  786 |   await page.clock.setFixedTime(new Date('2026-09-09T08:00:00+03:00'));
  787 |   await boot(page);
  788 | 
  789 |   const withSessionsOn = async (dates) => {
  790 |     await page.evaluate((ds) => {
  791 |       const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  792 |       const parsed = JSON.parse(localStorage[key]);
  793 |       parsed.history = ds.map((d, i) => ({
  794 |         date: d, session_id: ['upper_a', 'lower_a', 'upper_b', 'lower_b'][i % 4],
  795 |         started_at: `${d}T09:00:00Z`, ended_at: `${d}T10:00:00Z`, uid: `w${i}`,
  796 |         exercises: {}, prs: [], stats: {},
  797 |       }));
  798 |       parsed.active_session = null;
  799 |       localStorage[key] = JSON.stringify(parsed);
  800 |     }, dates);
  801 |     await page.reload({ waitUntil: 'networkidle' });
  802 |     await page.waitForTimeout(1000);
  803 |     return page.evaluate(() => document.querySelector('[data-home-overview]')?.textContent?.trim() || '');
  804 |   };
  805 | 
  806 |   // Week starts Saturday 2026-09-05. Two done, two still owed.
  807 |   const midWeek = await withSessionsOn(['2026-09-05', '2026-09-06']);
  808 |   expect(midWeek, 'with sessions still owed it is a gym day').toContain('يوم نادٍ');
  809 | 
  810 |   // All four done — the week is complete and nothing was trained today.
  811 |   const weekDone = await withSessionsOn(['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08']);
  812 |   expect(weekDone, 'the rest branch must actually be reachable').toContain('يوم راحة');
  813 |   expect(weekDone, 'and it says what is waiting').toContain('الجاي');
  814 |   // The session name must be localised BEFORE interpolation, or the line renders
  815 |   // half-English — the trap the week strip already documents.
  816 |   expect(weekDone, 'no raw English session name').not.toMatch(/Upper|Lower/);
  817 | });
  818 | 
  819 | // ---------------------------------------------------------------------------
  820 | // Raed caught this one himself: "إذا غيرت مصدر الموسيقى بالإعدادات ما يتغير" —
  821 | // and it worked in v15.
  822 | //
  823 | // v15 carried spotify / youtube_music / apple_music per session. v16 ported only
  824 | // Spotify while the Settings picker kept offering all three, and the resolver
  825 | // falls back to Spotify when a platform has no data — so the control looked like
  826 | // it worked and silently ignored him. A picker that offers a choice and drops it
  827 | // is worse than one that offers nothing.
  828 | test('changing the music source changes the links', async ({ page }) => {
  829 |   await boot(page);
  830 | 
  831 |   const linksFor = async (platform) => {
  832 |     await page.evaluate((p) => {
  833 |       const key = Object.keys(localStorage).find((k) => /\.settings\./.test(k) && /raed/i.test(k));
  834 |       const settings = JSON.parse(localStorage[key]);
  835 |       settings.music_platform = p;
  836 |       localStorage[key] = JSON.stringify(settings);
```