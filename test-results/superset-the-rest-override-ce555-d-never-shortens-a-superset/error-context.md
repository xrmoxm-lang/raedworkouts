# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: superset.spec.mjs >> the rest override is off by default, and never shortens a superset
- Location: tests/superset.spec.mjs:243:1

# Error details

```
Error: page.evaluate: TypeError: Cannot read properties of null (reading 'exercises')
    at eval (eval at evaluate (:302:30), <anonymous>:4:32)
    at UtilityScript.evaluate (<anonymous>:304:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
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