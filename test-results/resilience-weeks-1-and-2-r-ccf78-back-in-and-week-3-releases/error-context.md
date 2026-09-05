# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: resilience.spec.mjs >> weeks 1 and 2 ramp him back in, and week 3 releases
- Location: tests/resilience.spec.mjs:714:1

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
        - generic [ref=e20]: السبت · يوم نادٍ
        - heading "علوي أ" [level=2] [ref=e21]
        - generic [ref=e22]:
          - generic [ref=e23]: "7"
          - text: تمارين · ~
          - generic [ref=e24]: "65"
          - text: دقيقة
      - generic [ref=e25]:
        - generic [ref=e26]:
          - generic [ref=e27]: "اليوم: علوي أ"
          - generic [ref=e28]:
            - generic [ref=e29]:
              - generic [ref=e30]: السبت
              - generic [ref=e31]: ·
            - generic [ref=e33]: الأحد
            - generic [ref=e35]: الاثنين
            - generic [ref=e37]: الثلاثاء
            - generic [ref=e39]: الأربعاء
            - generic [ref=e41]: الخميس
            - generic [ref=e43]: الجمعة
          - generic [ref=e44]: باقي 4 جلسات هذا الأسبوع
        - generic [ref=e45]:
          - generic [ref=e46]:
            - generic [ref=e47]: "0"
            - generic [ref=e48]: المواظبة
            - generic [ref=e49]: جلسات / 4 أسابيع
          - generic [ref=e50]:
            - generic [ref=e51]: "0"
            - generic [ref=e52]: هذا الأسبوع
            - generic [ref=e53]: مجموعات عمل
          - generic [ref=e54]:
            - generic [ref=e55]: "0"
            - generic [ref=e56]: الحمل الكلي
            - generic [ref=e57]: كغ هذا الأسبوع
        - button "▶ ابدأ علوي أ" [ref=e58] [cursor=pointer]
        - button "اختر تمريناً آخر ▾" [ref=e60] [cursor=pointer]
        - generic [ref=e61]:
          - generic [ref=e62]: "🎧 سبوتيفاي — شغّل وانسَ الموضوع:"
          - generic [ref=e63]:
            - link "Heavy Lifting" [ref=e64] [cursor=pointer]:
              - /url: https://music.youtube.com/search?q=heavy+lifting+workout+playlist
              - generic [ref=e65]: Heavy Lifting
            - link "Hard Rap Workout" [ref=e66] [cursor=pointer]:
              - /url: https://music.youtube.com/search?q=hard+rap+workout+playlist
              - generic [ref=e67]: Hard Rap Workout
      - heading "خطة التمرين" [level=3] [ref=e68]
      - generic [ref=e72] [cursor=pointer]:
        - heading "1. Chest Press Machine" [level=4] [ref=e73]
        - generic [ref=e74]:
          - generic [ref=e75]: صدر
          - generic [ref=e76]: 3 × 8-10
          - text: ·
          - strong [ref=e77]: —
      - generic [ref=e81] [cursor=pointer]:
        - heading "2. Lat Pulldown (Neutral Grip)" [level=4] [ref=e82]
        - generic [ref=e83]:
          - generic [ref=e84]: ظهر
          - generic [ref=e85]: 3 × 10-12
          - text: ·
          - strong [ref=e86]: —
      - generic [ref=e90] [cursor=pointer]:
        - heading "3. Shoulder Press (Machine/DB)" [level=4] [ref=e91]
        - generic [ref=e92]:
          - generic [ref=e93]: أكتاف
          - generic [ref=e94]: 3 × 10-12
          - text: ·
          - strong [ref=e95]: —
      - generic [ref=e99] [cursor=pointer]:
        - heading "4. T-Bar Row" [level=4] [ref=e100]
        - generic [ref=e101]:
          - generic [ref=e102]: ظهر علوي
          - generic [ref=e103]: 3 × 10-12
          - text: ·
          - strong [ref=e104]: —
      - generic [ref=e108] [cursor=pointer]:
        - heading "5. Biceps Curl (DB or Cable)" [level=4] [ref=e109]
        - generic [ref=e110]:
          - generic [ref=e111]: باي
          - generic [ref=e112]: 2 × 10-12
          - text: ·
          - strong [ref=e113]: —
      - generic [ref=e117] [cursor=pointer]:
        - heading "6. Single-Arm Rope Triceps Extension" [level=4] [ref=e118]
        - generic [ref=e119]:
          - generic [ref=e120]: تراي
          - generic [ref=e121]: 2 × 10-12
          - text: ·
          - strong [ref=e122]: —
      - generic [ref=e126] [cursor=pointer]:
        - heading "7. Lateral Raise (Cable)" [level=4] [ref=e127]
        - generic [ref=e128]:
          - generic [ref=e129]: الكتف الجانبي
          - generic [ref=e130]: 3 × 10-12
          - text: ·
          - strong [ref=e131]: —
  - navigation [ref=e132]:
    - button "الرئيسية" [ref=e133] [cursor=pointer]:
      - img [ref=e135]
      - generic [ref=e139]: الرئيسية
    - button "المكتبة" [ref=e140] [cursor=pointer]:
      - img [ref=e142]
      - generic [ref=e145]: المكتبة
    - button "السجل" [ref=e146] [cursor=pointer]:
      - img [ref=e148]
      - generic [ref=e151]: السجل
    - button "المدرب" [ref=e152] [cursor=pointer]:
      - img [ref=e154]
      - generic [ref=e157]: المدرب
    - button "الإعدادات" [ref=e158] [cursor=pointer]:
      - img [ref=e160]
      - generic [ref=e164]: الإعدادات
  - alert: فشلت المزامنة السحابية — حُفظت محلياً.
```

# Test source

```ts
  630 |       date: '2026-01-01', session_id: ['upper_a', 'lower_a', 'upper_b', 'lower_b'][i % 4],
  631 |       started_at: '2026-01-01T09:00:00Z', ended_at: '2026-01-01T10:00:00Z', uid: `u${i}`,
  632 |       exercises: {}, prs: [], stats: {},
  633 |     }));
  634 |     parsed.active_session = null;
  635 |     localStorage[key] = JSON.stringify(parsed);
  636 |   });
  637 |   await page.reload({ waitUntil: 'networkidle' });
  638 |   await page.waitForTimeout(1000);
  639 |   await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  640 |   await page.waitForTimeout(900);
  641 |   await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  642 |   await page.waitForTimeout(1000);
  643 | 
  644 |   const deload = await page.evaluate(() =>
  645 |     document.querySelector('[data-reps-goal]')?.textContent?.trim() || '');
  646 |   expect(deload, 'the deload must ask for less effort, in words').toContain('خفيف');
  647 |   expect(deload, 'and must NOT promise a load increase in the same breath').not.toContain('ليرتفع الوزن');
  648 | });
  649 | 
  650 | // ---------------------------------------------------------------------------
  651 | // The load increment used to be a body-part guess: +5 kg lower, +2.5 upper,
  652 | // 0 for accessories. research/06 §5.2 carries a red-flag callout naming this app
  653 | // by line number — the lower/upper split appears in NO source, and the sources'
  654 | // own worked examples use the same increment for a barbell squat and a triceps
  655 | // pressdown. The rule is step(E) = the smallest increment physically available,
  656 | // fallback 2.5 kg.
  657 | test('the load increment comes from the equipment, learned from his own logs', async ({ page }) => {
  658 |   await boot(page);
  659 | 
  660 |   await page.evaluate(() => {
  661 |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  662 |     const parsed = JSON.parse(localStorage[key]);
  663 |     const session = (date, loads) => ({
  664 |       date, session_id: 'upper_a', started_at: `${date}T09:00:00Z`, ended_at: `${date}T10:00:00Z`, uid: `s${date}`,
  665 |       exercises: Object.fromEntries(Object.entries(loads).map(([id, w]) => [id, {
  666 |         planned: { exercise_id: id, reps: '8-10' },
  667 |         sets: [0, 1, 2].map((_, i) => ({
  668 |           is_warmup: false, weight: w, reps: 15, completed: true, effort: i === 2 ? 'right' : null,
  669 |         })),
  670 |       }])),
  671 |       prs: [], stats: {},
  672 |     });
  673 |     // Chest press on a 5 kg pin stack; biceps curl on 2.5 kg dumbbells. The gaps
  674 |     // between the loads he actually logged ARE the smallest available increment.
  675 |     parsed.history = [
  676 |       session('2026-08-20', { chest_press_machine: 35, biceps_curl: 7.5 }),
  677 |       session('2026-08-24', { chest_press_machine: 40, biceps_curl: 10 }),
  678 |       session('2026-08-28', { chest_press_machine: 40, biceps_curl: 10 }),
  679 |     ];
  680 |     parsed.active_session = null;
  681 |     parsed.forced_next_session = 'upper_a';
  682 |     localStorage[key] = JSON.stringify(parsed);
  683 |   });
  684 | 
  685 |   await page.reload({ waitUntil: 'networkidle' });
  686 |   await page.waitForTimeout(1000);
  687 |   await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  688 |   await page.waitForTimeout(1000);
  689 | 
  690 |   const suggested = await page.evaluate(() => {
  691 |     const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  692 |     const parsed = JSON.parse(localStorage[key]);
  693 |     const first = (id) => (parsed.active_session.exercises[id]?.sets || []).find((s) => !s.is_warmup)?.weight;
  694 |     return { press: Number(first('chest_press_machine')), curl: Number(first('biceps_curl')) };
  695 |   });
  696 | 
  697 |   // A 5 kg stack steps by 5, and suggesting 42.5 would be a weight he cannot set.
  698 |   expect(suggested.press, 'a 5 kg pin stack must step by 5').toBe(45);
  699 |   // Dumbbells step by 2.5 — the SAME rule, not a body-part exception.
  700 |   expect(suggested.curl, 'a 2.5 kg dumbbell jump must step by 2.5').toBe(12.5);
  701 | });
  702 | 
  703 | // ---------------------------------------------------------------------------
  704 | // D19's re-entry ramp was prose. The Settings screen has been telling Raed "the
  705 | // first two weeks are a re-entry ramp" while session creation built the ordinary
  706 | // Block A rows. research/20 §8.3 gives the table; nothing read it.
  707 | //
  708 | //   week 1  compounds 6/6/6, isolation 7/7/7, TWO working sets on first exposure
  709 | //   week 2  compounds 6/7/7, isolation 7/8/8, full sets
  710 | //   week 3+ as printed
  711 | //
  712 | // Cycle 1 only — he re-enters after a layoff once, and week 12's deload handles
  713 | // fatigue from then on.
  714 | test('weeks 1 and 2 ramp him back in, and week 3 releases', async ({ page }) => {
  715 |   await boot(page);
  716 | 
  717 |   const atWeek = async (completed) => {
  718 |     await page.evaluate((n) => {
  719 |       const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  720 |       const parsed = JSON.parse(localStorage[key]);
  721 |       parsed.history = Array.from({ length: n }, (_, i) => ({
  722 |         date: '2026-01-01', session_id: ['upper_a', 'lower_a', 'upper_b', 'lower_b'][i % 4],
  723 |         started_at: '2026-01-01T09:00:00Z', ended_at: '2026-01-01T10:00:00Z', uid: `u${i}`,
  724 |         exercises: {}, prs: [], stats: {},
  725 |       }));
  726 |       parsed.active_session = null;
  727 |       parsed.forced_next_session = 'upper_a';
  728 |       localStorage[key] = JSON.stringify(parsed);
  729 |     }, completed);
> 730 |     await page.reload({ waitUntil: 'networkidle' });
      |                ^ TimeoutError: page.reload: Timeout 20000ms exceeded.
  731 |     await page.waitForTimeout(900);
  732 |     await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  733 |     await page.waitForTimeout(800);
  734 |     await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  735 |     await page.waitForTimeout(900);
  736 |     return page.evaluate(() => {
  737 |       const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  738 |       const parsed = JSON.parse(localStorage[key]);
  739 |       const entry = parsed.active_session.exercises.chest_press_machine;
  740 |       return {
  741 |         sets: (entry?.sets || []).filter((s) => !s.is_warmup).length,
  742 |         goal: document.querySelector('[data-reps-goal]')?.textContent?.trim() || '',
  743 |       };
  744 |     });
  745 |   };
  746 | 
  747 |   // Week 1: two working sets on a movement he has never done, and the gentlest
  748 |   // effort band the app has words for.
  749 |   const w1 = await atWeek(0);
  750 |   expect(w1.sets, 'week 1 caps first exposure at two working sets').toBe(2);
  751 |   expect(w1.goal).toContain('خفيف');
  752 | 
  753 |   // Week 2: full sets, one band up.
  754 |   const w2 = await atWeek(4);
  755 |   expect(w2.sets, 'week 2 restores the full prescription').toBe(3);
  756 |   expect(w2.goal).toContain('متوسط');
  757 | 
  758 |   // Week 3: the ramp is over.
  759 |   const w3 = await atWeek(8);
  760 |   expect(w3.sets).toBe(3);
  761 |   expect(w3.goal, 'week 3 is Block A as printed').toContain('صعب');
  762 | });
  763 | 
  764 | // ---------------------------------------------------------------------------
  765 | // "Today training / tomorrow rest, at a glance, before I leave the house" is
  766 | // something Raed asked for four separate times and never got. The rest branch
  767 | // existed in the code but was UNREACHABLE: it required `planned` to be falsy,
  768 | // and getTodayPlannedSession() always returns the next session in the rotation.
  769 | // Every single day said «يوم نادٍ», including days he had already finished his
  770 | // week on.
  771 | //
  772 | // The rotation is history-driven on purpose — a missed Tuesday must not break it
  773 | // — so the app cannot claim Tuesday is Upper A. What it can say honestly is
  774 | // whether he still owes the week a session, counted against `weekly_layout`,
  775 | // which had sat in data.js consumed by nothing.
  776 | test('home tells him whether today is a training day or a rest day', async ({ page }) => {
  777 |   // Pinned to a Wednesday so earlier days of the same Saudi week exist to fill.
  778 |   await page.clock.setFixedTime(new Date('2026-09-09T08:00:00+03:00'));
  779 |   await boot(page);
  780 | 
  781 |   const withSessionsOn = async (dates) => {
  782 |     await page.evaluate((ds) => {
  783 |       const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
  784 |       const parsed = JSON.parse(localStorage[key]);
  785 |       parsed.history = ds.map((d, i) => ({
  786 |         date: d, session_id: ['upper_a', 'lower_a', 'upper_b', 'lower_b'][i % 4],
  787 |         started_at: `${d}T09:00:00Z`, ended_at: `${d}T10:00:00Z`, uid: `w${i}`,
  788 |         exercises: {}, prs: [], stats: {},
  789 |       }));
  790 |       parsed.active_session = null;
  791 |       localStorage[key] = JSON.stringify(parsed);
  792 |     }, dates);
  793 |     await page.reload({ waitUntil: 'networkidle' });
  794 |     await page.waitForTimeout(1000);
  795 |     return page.evaluate(() => document.querySelector('[data-home-overview]')?.textContent?.trim() || '');
  796 |   };
  797 | 
  798 |   // Week starts Saturday 2026-09-05. Two done, two still owed.
  799 |   const midWeek = await withSessionsOn(['2026-09-05', '2026-09-06']);
  800 |   expect(midWeek, 'with sessions still owed it is a gym day').toContain('يوم نادٍ');
  801 | 
  802 |   // All four done — the week is complete and nothing was trained today.
  803 |   const weekDone = await withSessionsOn(['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08']);
  804 |   expect(weekDone, 'the rest branch must actually be reachable').toContain('يوم راحة');
  805 |   expect(weekDone, 'and it says what is waiting').toContain('الجاي');
  806 |   // The session name must be localised BEFORE interpolation, or the line renders
  807 |   // half-English — the trap the week strip already documents.
  808 |   expect(weekDone, 'no raw English session name').not.toMatch(/Upper|Lower/);
  809 | });
  810 | 
  811 | // ---------------------------------------------------------------------------
  812 | // Raed caught this one himself: "إذا غيرت مصدر الموسيقى بالإعدادات ما يتغير" —
  813 | // and it worked in v15.
  814 | //
  815 | // v15 carried spotify / youtube_music / apple_music per session. v16 ported only
  816 | // Spotify while the Settings picker kept offering all three, and the resolver
  817 | // falls back to Spotify when a platform has no data — so the control looked like
  818 | // it worked and silently ignored him. A picker that offers a choice and drops it
  819 | // is worse than one that offers nothing.
  820 | test('changing the music source changes the links', async ({ page }) => {
  821 |   await boot(page);
  822 | 
  823 |   const linksFor = async (platform) => {
  824 |     await page.evaluate((p) => {
  825 |       const key = Object.keys(localStorage).find((k) => /\.settings\./.test(k) && /raed/i.test(k));
  826 |       const settings = JSON.parse(localStorage[key]);
  827 |       settings.music_platform = p;
  828 |       localStorage[key] = JSON.stringify(settings);
  829 |     }, platform);
  830 |     await page.reload({ waitUntil: 'networkidle' });
```