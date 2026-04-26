# How to use Raedworkouts

This is for you, Raed. Read it once. Don't read it again. The whole point of this app is that **you don't think, you just train**.

---

## The one-paragraph version

Tuesday and Saturday mornings, you open the app. The Home screen tells you exactly what to do. Press the green **Start Session** button. Your first exercise appears. Do the warm-up sets the app pre-fills, then your working sets. Tap the circle when each set is done — the rest timer runs automatically. When you're done with that exercise, press **Next exercise**. Repeat 5 times. Press **Finish session**. Walk out. Done.

---

## The Tuesday/Saturday rhythm

|             | What                              | Roughly         |
|-------------|-----------------------------------|-----------------|
| Tuesday AM  | Session A (quad-led full body)    | 5 exercises, ~70 min |
| Saturday AM | Session B (glute-led full body)   | 5 exercises, ~70 min |
| Other days  | App tells you to rest. Eat. Sleep.| —               |

You see one (1) exercise on screen at a time. That's by design. **You only ever need to know the next thing.** Not the whole session. Not the whole week.

---

## What happens when you press Start Session

The app already knows:

- The exercise.
- The weight you should put on the bar (calculated from your last 2 sessions).
- How many warm-up sets to do (and at what weight — 50% × 10, then 75% × 6 for the first exercise of each muscle).
- How many working sets and reps you're aiming for.
- The RPE target (how hard it should feel).
- A one-line cue on form.
- Mohannad's video clips of the machine (you can tap to play).
- A Jeff Nippard form video (the one with the teal border, marked **JN**).
- Two or three alternative exercises in case the machine is taken.

You don't decide any of this. **You just do it.**

---

## When a machine is busy

Tap **⇄ Swap** on that exercise. The app shows you 1–3 alternatives that hit the same muscle. Tap one. Your weight is auto-recalculated. Keep going.

This is the single feature that will save you the most stress at a busy commercial gym. Use it without guilt. The substitute lifts are equally good for hypertrophy.

---

## The set-tracker

Each set has 4 inputs:

```
Weight (kg)   Reps   RPE   ✓
```

- **Weight**: pre-filled with the suggestion. Change it if you used something different.
- **Reps**: how many you actually did.
- **RPE**: optional but useful. 7 = comfortable, 8 = hard but clean, 9 = grinding (don't go here in Block 1), 10 = couldn't do another (never go here in Block 1).
- **✓**: tap when the set is done. The rest timer starts. Your phone buzzes when rest is over.

If you forget RPE, that's fine. Just log weight + reps.

---

## Music — pick once, don't think again

On the active session screen, you'll see a little row of playlist buttons. Tap one **before you start**, get your headphones on, then ignore your phone except to log sets.

- **Tuesday (Session A)** — heavier compounds. Beast Mode / Power Workout vibes.
- **Saturday (Session B)** — glutes, steadier tempo. Mood Booster / Rock Hard vibes.

These are Spotify defaults. You can paste your own playlist URLs by editing `data.js` if you have a favourite — but the defaults will do until you find your own rhythm.

---

## Progressive overload — fully automatic

You don't track this. The app does.

- Hit the top of the rep range at RPE ≤ 8 for **two sessions in a row** → next session, the suggested weight goes up.
- Upper body exercises: +2.5 kg.
- Lower body exercises: +5 kg.
- Accessories (lateral raise, face pull, etc.): you'll be prompted to add reps before adding weight.

You'll see a note like "🔥 You hit 10 @ RPE≤8 for 2 sessions. Bump +2.5 kg." That's the cue. Trust it.

---

## Warm-ups — only where you need them

The skill rule from your Skill.md:

- **First exercise of each muscle group** → 2 warm-up sets are pre-filled (50% × 10, then 75% × 6).
- **Other exercises** → no warm-up. Or one light set if it's a new movement pattern.

The app handles this automatically. The warm-up rows are dimmer and labeled **W1**, **W2**. Working sets start at **1**.

---

## Block 1 (weeks 1–4) is calibration

This is the boring truth: the first 4 weeks are about **finding your weights**, not breaking PRs.

- Don't grind.
- Don't go to RPE 9.
- If a weight feels too light, that's fine for now — finish the session, the app will bump it next time.
- If a weight feels too heavy, drop it 2.5 kg mid-set. Note it. Move on.

In Block 2 (weeks 5–8), Romanian Deadlift gets added. In Block 3 (weeks 9–12), peak — then deload week 12.

---

## The non-negotiables

These are not optional. Without them, the gym does nothing:

1. **Protein**: 130–160 g per day. Track it for at least 2 weeks until you can eyeball it.
2. **Sleep**: ≥ 7 hours. Under 6, skip the gym — you'll be training damage, not muscle.
3. **Form > weight**. Always. If form breaks, drop the weight. The app's cue line is there for a reason.

---

## Saving and syncing

- Every set you log saves automatically to your phone.
- If you set up Supabase (Settings → Cloud sync), it also saves to the cloud and you can use the same app on a laptop or another phone with everything in sync.
- Settings → Export JSON gives you a backup file. Email it to yourself once a week. **This is your ace in the hole** if something goes wrong.

---

## When things go wrong

| Problem                              | Fix                                                                                       |
|--------------------------------------|-------------------------------------------------------------------------------------------|
| Forgot to log a set                  | Go to History → tap the session → eyeball it. Or just move on.                            |
| Too sore to train                    | Skip the day. The app rolls forward. Don't try to "make up" a session.                    |
| Machine not in app                   | Library → tap exercise → **+ Add video**. Paste the YouTube link. It saves.               |
| Weight is way too heavy / too light  | Just type the right number in the Weight box. The next session adjusts.                   |
| Want to change the programme         | Talk to the Raedworkouts skill in chat. It can rewrite the programme.                     |

---

## The mindset

You spent 2 years out of the gym. You'll feel slow. The weights will feel light. You'll question whether the programme is "enough."

It is. **Returning beginners regain muscle faster than anyone**. Your first 12 weeks back will move the needle more than any 12 weeks you do for the next 5 years. Don't waste them by getting fancy.

Stick to:

- Show up Tuesday + Saturday.
- Open the app. Press Start.
- Do what it says.
- Eat protein. Sleep.
- Repeat for 12 weeks.

That's it. The thinking is done. The decisions are made. **Just go.**

— mh
