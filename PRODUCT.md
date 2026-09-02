# Raedworkouts Go

> Authored 2026-09-02 by Claude during the overnight design pass, from the codebase
> and from Raed's own words across the build. He was asleep and asked for decisions,
> not questions — so this is inferred, not interviewed. **Raed should confirm or
> correct it.** Everything here is quoted or traceable to shipped code.

## Register

**Product.** Design serves the task. This is a tool used mid-workout, not a page
that sells anything. There is no marketing surface, no landing page, no signup.

## Users & Purpose

One primary user: **Raed**, 26, a Saudi physician returning to training after a
detrained period, on a 168-day transformation. Two family members (Bassam,
Abdullah) have profiles but are not yet active users.

**The context is the whole design brief.** He is standing at a machine in a gym,
mid-set, often sweating, phone in one hand, rest timer running. He is not sitting
down browsing. He has 60–90 seconds between sets and the phone may be set down and
picked up repeatedly. This is a *single-handed, glanceable, interruptible* surface.

The primary job on any screen: **log the set I just did, and tell me what to do
next.** Everything else — history, library, coach, settings — is secondary and
visited between sessions, not during them.

## Language & direction

**Arabic-only, RTL.** English survives in exactly three places, deliberately:
exercise names (the vocabulary he actually uses in the gym), numeric entry, and
proper nouns. Every one of those is isolated with `<bdi class="ltr-run">` because
a bare Latin or numeric run inside Arabic gets visually reordered — a grouped
number has already rendered backwards here once ("4,658" → "658,4"). Numbers are
entered in Western digits with `lang="en" dir="ltr"` on the inputs.

Arabic count agreement is honoured (مقطع واحد / مقطعان / ٣ مقاطع), not faked with
a single plural.

## Brand personality

**Plain, exact, unsentimental.** It is a logbook that happens to be beautiful, not
a coach that cheers. Raed is a physician; he reads numbers, and he distrusts
anything that sounds confident without evidence. Motivation in this app comes from
the numbers going up, not from copy telling him he is doing well.

Three words: **quiet, precise, honest.**

The one place warmth is allowed is the end-of-session panel, which is the only
moment he is not mid-task.

## Anti-references

- **Fitness-app maximalism** — streak flames, confetti, badges, "You crushed it!",
  ring animations. He never asked for a single one of these.
- **The dashboard reflex** — hero metric, sparkline, three stat cards. He does not
  want a report; he wants the next set.
- **Anything that speaks with false confidence.** His standing rule about videos
  (D8) generalises to the whole product: *a blank beats a wrong answer.* The coach
  returns sourced passages from books he owns and does not generate prose. An
  unknown weight says «معايرة» (calibration) rather than inventing a load.

## Strategic design principles

1. **The session card outranks everything.** He spends nearly all his time there.
   Big targets, no precision required, nothing important below the fold.
2. **Never delete a feature to tidy a screen.** His explicit standing rule. If a
   screen is crowded, the answer is hierarchy, not removal.
3. **Silence when healthy.** Applies to the UI as it does to his server: no
   "all good" chrome, no status the user did not ask for.
4. **Say what actually happened.** Error copy names the cause and the fix. A sync
   failure that says only "failed" cost a real investigation on 2026-09-01.
5. **Three skins × two themes is a hard constraint, not a nicety.** حديد / ورق /
   رخام each in light and dark. A fix that only holds in one is not a fix.

## Accessibility

Contrast is enforced in CI by `scripts/lint-contrast.mjs`; body text ≥4.5:1 and
the D29 label rule are gates, not aspirations. Tap targets are sized for a sweaty
thumb, which is a stricter constraint than the 44px minimum.
