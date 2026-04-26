# Deploy Raedworkouts — from zero

You don't need to know what GitHub or Netlify is. Follow the steps. Each one tells you exactly which button to click.

There are three paths. **Pick one. Don't mix them.**

| Path | Time | Permanent? | Account needed? | Recommended for |
|------|------|------------|-----------------|-----------------|
| A. Netlify Drop | 2 min | Yes (with free account) | Optional | Quick first test on phone |
| B. GitHub Pages + Netlify | 25 min | Yes | Yes (free) | Final, production setup |
| C. Local on phone via WiFi | 3 min | No | No | Just to peek before deploying |

**My recommendation:** Do Path A first (Netlify Drop) tonight to feel the app on your phone. Then when you've decided you like it, do Path B (GitHub Pages) properly so updates push automatically.

---

## Path A — Netlify Drop (2 minutes)

This is the fastest. You drag a folder onto a website and get a live URL.

### A.1 — Get the folder ready
1. On your Mac, find the file `raedworkouts-clean-XXXX.zip` that I gave you (in your Downloads or wherever you saved it).
2. Double-click the .zip. macOS will create a folder called `raedworkouts` next to it.
3. **Important:** the folder you'll drag is `raedworkouts` — not the .zip, not a single file inside.

### A.2 — Drop it
4. Open Safari (or any browser) and go to: **https://app.netlify.com/drop**
5. You'll see a big dashed box that says "Drag and drop your site folder here".
6. Drag the entire `raedworkouts` folder from Finder into that box.
7. Wait ~20 seconds. Netlify uploads + builds.
8. You'll be taken to a page like `https://random-name-abc123.netlify.app`. **That's your live URL.**

### A.3 — Open on your phone
9. Open Safari on your iPhone.
10. Type the Netlify URL.
11. Tap the **Share** icon (square with arrow up) → **Add to Home Screen** → **Add**.
12. Close Safari. Find the Raedworkouts icon on your home screen. Tap it.

### A.4 — Make it permanent (claim the site)
By default, Netlify Drop sites are anonymous. They stay forever, but anyone could theoretically take the URL. To lock it:

13. On the Netlify page (after step 8), click **Claim site** (top right).
14. Sign up with email or GitHub.
15. Now the site is yours. The URL doesn't change. You can rename the URL too: **Site settings → Change site name** → pick whatever you want.

### A.5 — Update later (when I send you a new build)
1. I'll give you a new `raedworkouts-clean-XXXX.zip`.
2. Unzip on your Mac.
3. Go to https://app.netlify.com/drop
4. **If you're logged in**: drag the folder onto the same box. Netlify asks "deploy to which site?" → pick your existing site. Done. Same URL, new content. The phone app updates within ~60 seconds.
5. **If you're not logged in** and don't want to be: just drop the new folder. You'll get a NEW random URL. Update the bookmark on your phone.

---

## Path B — GitHub Pages (the real deal, 25 minutes)

Free, permanent, version-controlled, and once it's set up, every change I send pushes live automatically. This is what you want long-term.

### B.1 — Create a GitHub account (5 min)
1. Go to **https://github.com/signup**
2. Email: use your real email. Pick a username (lowercase, no spaces). Pick a strong password.
3. GitHub will email you a verification code. Type it in.
4. They'll ask "what brings you to GitHub?" — pick anything (Personal use). Skip the questions if you can.
5. **Free plan is fine.** You won't hit any limits with this app.
6. **You don't pay anything.** Ever, for this app. GitHub free tier: 1 GB storage, 100 GB bandwidth/month. We use about 0.2% of that.

### B.2 — Install GitHub Desktop (skip the command line, 3 min)
This makes pushing changes a 1-click operation. No terminal needed.

7. Go to **https://desktop.github.com**
8. Download for macOS. Install.
9. Open GitHub Desktop. Sign in with the account you just made.

### B.3 — Create the repo (3 min)
10. In GitHub Desktop: **File → New repository**
11. Name: `raedworkouts`
12. Local path: pick a folder you'll remember. Like `~/Documents/raedworkouts-repo`
13. **Initialize with README:** unchecked
14. Click **Create repository**.
15. GitHub Desktop creates an empty folder at the path you picked.

### B.4 — Add the app files (2 min)
16. Open Finder, go to that folder (`~/Documents/raedworkouts-repo`).
17. Open the `raedworkouts-clean-XXXX.zip` I gave you.
18. Inside the unzipped `raedworkouts` folder, **select all the files** (cmd+A): `index.html`, `styles.css`, `app.js`, `data.js`, `manifest.webmanifest`, `sw.js`, `img/` folder, all the .md files.
19. Drag them into the empty repo folder you opened in step 16.
20. Now go back to GitHub Desktop. You'll see all those files listed under "Changes". 
21. At the bottom-left, type a summary: `initial deploy`
22. Click **Commit to main**.
23. At the top, click **Publish repository**. Uncheck "Keep this code private" if you want it public (you do — needed for free GitHub Pages). Click **Publish repository**.

### B.5 — Turn on GitHub Pages (2 min)
24. In your browser, go to **https://github.com/YOUR-USERNAME/raedworkouts**
25. Click the **Settings** tab (top right of the repo page).
26. Left sidebar: **Pages**.
27. Under **Source**, select **Deploy from a branch**.
28. Branch: **main**, folder: **/ (root)**. Click **Save**.
29. Wait ~60 seconds. Refresh the Pages settings tab. At the top, you'll see:
    > Your site is live at `https://YOUR-USERNAME.github.io/raedworkouts/`
30. Click that URL. The app loads.

### B.6 — Install on your iPhone (1 min)
31. Open Safari on your iPhone.
32. Type the GitHub Pages URL.
33. Tap **Share** → **Add to Home Screen** → **Add**.

### B.7 — Updates (when I send a new build) — 30 seconds
1. I'll give you a new zip.
2. Unzip.
3. Drag the new files into your repo folder (Finder will ask "replace?" — say yes).
4. Open GitHub Desktop. You'll see "Changed files".
5. Bottom-left: summary like `update v3 — color picker, JN edit`. Click **Commit to main**.
6. Top: **Push origin**.
7. Wait ~60 seconds. Open the app on your phone. Force-refresh: long-press the reload icon → Reload Without Cache. Done.

(If you forget to refresh, it'll still update — just within a few minutes when the service worker re-checks.)

---

## Path C — Local test on your phone via WiFi (3 minutes)

For when you want to peek without uploading anywhere. **The PWA features won't fully work** (no install-to-home-screen, no offline, no background notifications) because plain HTTP from a phone disables them. Use this only as a quick eyeball test.

1. Mac and iPhone must be on the **same WiFi network**.
2. Open **Terminal** on Mac (cmd+space, type "Terminal", enter).
3. Type, replacing the path with where your unzipped folder is:
   ```bash
   cd ~/Downloads/raedworkouts
   python3 -m http.server 8000
   ```
4. Find your Mac's IP. Open another Terminal tab and type:
   ```bash
   ipconfig getifaddr en0
   ```
   You'll get something like `192.168.1.42`.
5. On iPhone Safari, go to: `http://192.168.1.42:8000` (use the IP from step 4).
6. The app loads. You can click around. **Don't bother trying to install it to home screen — won't work over plain HTTP.**
7. To stop: in Terminal, press `Ctrl+C`.

---

## Troubleshooting

**"Page not found" on GitHub Pages after waiting**
GitHub Pages can take up to 10 min on first deploy. Wait 5–10 min and refresh. If still nothing: Settings → Pages → confirm Source is "Deploy from a branch", main, /(root).

**App is showing old content after I pushed an update**
The service worker is cached. Three fixes (any one works):
- iPhone: in Safari, long-press the reload icon → "Reload Without Cache"
- Or: settings → Safari → Clear History and Website Data
- Or: just wait. The service worker auto-checks for updates every few minutes.

**I see colors I didn't set**
Settings → Advanced → Accent color. The setting persists across browsers but not if you wipe Safari data.

**"Anon key", "Project URL" — what?**
These are for the optional cloud sync. You don't need them to use the app. Skip until later. The app works 100% locally. Cloud sync just lets you use the same data on a laptop and phone.

**I broke something / I want to undo**
GitHub Desktop: **History** tab → right-click the bad commit → **Revert this commit**. Done. App rolls back.

---

## When to come back to me

- New tasks like "swap exercise X for Y" or "add a new exercise" → I'll edit `data.js`, give you a new zip
- New features ("dark mode toggle in another spot", "different stats") → I'll edit, new zip
- Bugs (something doesn't work) → screenshot + describe, I'll fix, new zip

You don't need to learn git. You don't need to learn JavaScript. You drag, I edit. That's the deal.

— mh
