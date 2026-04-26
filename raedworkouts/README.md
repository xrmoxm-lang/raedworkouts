# Raedworkouts — deployment guide

A self-contained Progressive Web App. Vanilla JS, no build step, no npm. Drop the folder onto any static host and it works.

## What's in here

| File                    | What it does                                                       |
|-------------------------|--------------------------------------------------------------------|
| `index.html`            | App shell + tab nav                                                |
| `styles.css`            | Theming (light/dark CSS vars), mobile-first layout                 |
| `data.js`               | Exercise library + 12-week programme + athlete profile (edit me!)  |
| `app.js`                | All logic: rendering, session state, sync, smart suggestions       |
| `manifest.webmanifest`  | PWA install metadata                                               |
| `sw.js`                 | Service worker (offline + asset cache)                             |
| `HOW_TO_USE.md`         | User-facing guide for Raed                                         |
| `SKILL.md`              | Claude Code / Claude AI skill file (Raedworkouts skill)            |

---

## Deploy in 10 minutes (GitHub Pages — recommended)

### 1) Create a free GitHub account
Go to https://github.com/signup. Verify email.

### 2) Create a new repo
- Click **+ → New repository**
- Name it `raedworkouts` (or anything)
- Set it to **Public**
- Click **Create repository**

### 3) Upload the files
- On the new empty repo page, click **uploading an existing file**
- Drag every file from this `raedworkouts` folder into the upload box
- Commit message: `initial deploy`
- Click **Commit changes**

### 4) Turn on Pages
- Repo → **Settings** → **Pages** (left sidebar)
- Under **Source**, choose **Deploy from a branch**
- Branch: `main`, folder: `/ (root)`
- Click **Save**

Wait ~60 seconds, refresh the Pages settings tab. Your site is live at:

```
https://<your-github-username>.github.io/raedworkouts/
```

### 5) Open it on your phone
- iPhone Safari: paste the URL → tap **Share** → **Add to Home Screen**
- Android Chrome: paste the URL → menu (⋮) → **Install app** / **Add to Home screen**

You now have a "native-feeling" workout app icon on your home screen. It works offline after the first load.

---

## Set up cloud sync (Supabase) — optional but recommended

Without this, your data lives only in **one** browser on **one** device. If you clear cache or switch phones, you lose it. Cloud sync survives all of that.

### 1) Create a Supabase account
- Go to https://supabase.com/dashboard/sign-up
- Sign in with GitHub (uses the account you just made)
- Create a new project. Name it `raedworkouts`. Pick any region. Set a database password (save it somewhere — you won't need it for the app, but Supabase will).
- Wait ~2 min for the project to provision.

### 2) Run the SQL
- Left sidebar → **SQL Editor**
- Paste this:

```sql
create table raedworkouts (
  user_id text primary key,
  state_json jsonb not null,
  settings_json jsonb,
  updated_at timestamptz default now()
);

alter table raedworkouts enable row level security;

create policy "anon read-write own row"
  on raedworkouts
  for all
  using (true)
  with check (true);
```

- Click **Run**.

> Security note: this policy allows anyone with the anon key to read and write any row. That's fine for a single-user app where you keep the anon key private. If you ever want multi-user with isolation, swap the policy for one keyed on `auth.uid()`.

### 3) Grab your project URL and anon key
- Left sidebar → **Project Settings** (gear icon) → **API**
- Copy **Project URL** (looks like `https://abcdefg.supabase.co`)
- Copy the **`anon` `public` key** (long JWT string starting with `eyJ...`)

### 4) Paste them into the app
- Open the deployed app on your phone
- Bottom nav → **Settings** → **Cloud sync (Supabase)**
- Paste **Project URL** and **anon key**
- Set **User ID** to `raed` (or anything — just use the same string everywhere)
- Tap **⬆ Push now** — your data goes to the cloud
- On a second device: open the app, paste the same URL/key/user ID, tap **⬇ Pull now**

Done. Every set you log automatically pushes to the cloud after you save.

---

## Edit the programme

Open `data.js` and edit the `PROGRAMME` object. The structure is documented inline. Common edits:

```js
// Change a starting weight
{ exercise_id: 'leg_press', sets: 3, reps: '10', start_kg: 70, ... }
//                                                    ^^^^^^^

// Add a new exercise to a session
{ exercise_id: 'pec_dec', sets: 2, reps: '12', start_kg: 30, rpe: '8', is_first_of_muscle: false }

// Change to 3 sessions/week
// Add a third session to the `sessions` array, then update getTodayPlannedSession() in app.js
```

If you're working with Claude (the Raedworkouts skill), you can just say "add Pec Dec to Tuesday after the chest press, 2 × 12 starting at 30 kg" — it'll edit `data.js` for you.

---

## Add a new exercise to the library

Open `data.js`, scroll to `EXERCISES`, copy an existing entry, edit:

```js
{
  id: 'cable_fly',                              // unique
  name: 'Cable Fly',
  name_ar: 'تفتيح كيبل',
  primary: ['chest'],                           // muscle keys from MUSCLES
  secondary: ['shoulders'],
  pattern: 'isolation_push',
  mohannad: ['VIDEO_ID_HERE'],                  // YouTube short ID(s)
  jeff_nippard: 'https://...',                  // form video URL
  alternatives: ['chest_fly', 'pec_dec'],       // ids of similar exercises
  cue: 'Slight forward lean. Squeeze across the chest, not at the hands.',
}
```

Or use the in-app **Library → exercise → + Add video** to add additional videos to existing exercises. Those are saved per-user in your data, not the source files.

---

## Updating after deploy

When you change any file:

```
git add . && git commit -m "update programme" && git push
```

Or just re-upload through the GitHub web UI. Pages rebuilds within ~60 seconds.

To force a service-worker refresh after an update, in `sw.js` bump:

```js
const CACHE = 'raedworkouts-v1';
//                                ^^ change to v2, v3, ...
```

---

## Troubleshooting

| Problem                               | Fix                                                                                       |
|---------------------------------------|-------------------------------------------------------------------------------------------|
| App doesn't update after I push       | Hard reload (long-press the reload icon on iOS, or settings → clear cache). Or bump CACHE version in `sw.js`. |
| Sync says "error"                     | Check Project URL has no trailing slash. Check you ran the SQL. Check the table name is exactly `raedworkouts`. |
| Lost data after closing browser       | localStorage cleared. Cloud sync would have prevented this. Set up Supabase.              |
| Wrong exercise/video                  | Edit `data.js` in the repo and push.                                                      |
| Can't install to home screen          | iPhone needs Safari (not Chrome) for Add to Home Screen. Android works in Chrome/Edge.    |

---

## Roadmap (when you want to extend)

- **Volume per muscle per week** chart in History
- **PR auto-detection** with a 🏆 badge on the set when broken
- **Body fat / measurements** tracking next to bodyweight
- **Block transitions** — auto-suggest moving from Block 1 → Block 2 after week 4
- **Apple Health / Google Fit** export for sessions
- **Multiple users** (girlfriend, friend) with proper Supabase RLS

These are deliberately out of scope for v1. Ship, train, then iterate.
