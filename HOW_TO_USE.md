# How to use Raedworkouts

This is for you, Raed. Read it once. Don't read it again. The whole point of this app is that **you don't think, you just train**.

---

## The one-paragraph version

Open the app and press the green **Start Session** button. First complete the 5–10 minute treadmill walk and the 10-rep drills, then the per-exercise ramps the app pre-fills. Working weight and reps are already filled in; tap the circle with one thumb when a set is done. On the final set of an exercise, tap **easy**, **medium**, or **very hard**, then finish it. The rest timer runs automatically. Repeat, then press **Finish session**.

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
- A short warm-up phase: treadmill walk 5–10 min, then 10 reps of each drill (Upper days never show leg drills), capped at 15 min before exercise ramps.
- How many per-exercise ramp sets to do (and at what weight — 50% × 10, then 70% × 6 for the first exercise of each muscle).
- How many working sets and reps you're aiming for.
- The RPE target (how hard it should feel).
- A one-line cue on form.
- Mohannad's video clips of the machine (you can tap to play).
- A Jeff Nippard form video (the one with the teal border, marked **JN**).
- Two or three alternative exercises in case the machine is taken.

You don't decide any of this. **You just do it.**

---

## When a machine is busy

Tap **⇄ Swap** on that exercise. Swipe an alternative left (or tap it), choose whether it lasts this session, this week, or this block, and read the volume result before adopting. A hard volume violation needs an explicit override, which the app records with that scope.

This is the single feature that will save you the most stress at a busy commercial gym. Use it without guilt. The substitute lifts are equally good for hypertrophy.

---

## The set-tracker

Each set has three controls:

```
Weight (kg)   Reps   ✓
```

- **Weight**: pre-filled with the suggestion. Change it if you used something different.
- **Reps**: pre-filled at the bottom of the range. Change them only when you did something different.
- **✓**: tap when the set is done. The rest timer starts. Your phone buzzes when rest is over.

After the final working set only, choose **easy**, **medium**, or **very hard**. It is a simple ranking, not a reps-left number. Very hard can block a reps-earned increase; easy can land one session sooner. It can never create an increase without the completed reps.

Numeric RIR is not part of normal set logging. It remains reserved for the separate weekly calibration set.

---

## Music — pick once, don't think again

On the active session screen, you'll see a little row of playlist buttons. Tap one **before you start**, get your headphones on, then ignore your phone except to log sets.

- **Tuesday (Session A)** — heavier compounds. Beast Mode / Power Workout vibes.
- **Saturday (Session B)** — glutes, steadier tempo. Mood Booster / Rock Hard vibes.

These are Spotify defaults. You can paste your own playlist URLs by editing `data.js` if you have a favourite — but the defaults will do until you find your own rhythm.

---

## Progressive overload — fully automatic

You don't track this. The app does.

- Hit the top of the rep range for **two sessions in a row** → next session, the suggested weight goes up unless the final set was **very hard**.
- If every set hit the top and the final-set rating is **easy**, that reps-earned increase can land one session sooner.
- Upper body exercises: +2.5 kg.
- Lower body exercises: +5 kg.
- Accessories (lateral raise, face pull, etc.): you'll be prompted to add reps before adding weight.

You'll see a note like "Completed 10 on every set twice. Bump +2.5 kg." That's the cue. Trust it.

---

## Warm-ups — only where you need them

The skill rule from your Skill.md:

- **First exercise of each muscle group** → 2 warm-up sets are pre-filled (50% × 10, then 75% × 6).
- **Other exercises** → no warm-up. Or one light set if it's a new movement pattern.

The app handles this automatically. The warm-up rows are dimmer and labeled **W1**, **W2**. Working sets start at **1**.

---

## Weeks 1–2 are re-entry

You trained before. The first two weeks are about returning smoothly while completed reps find the real level — not pretending you are starting from zero.

- Don't grind.
- Do not grind.
- If a weight feels easy and all sets reached the top, choose **easy** on the final set; reps still have to earn the increase.
- If a weight is too heavy, drop it 2.5 kg mid-session. Log the real set and move on.

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
