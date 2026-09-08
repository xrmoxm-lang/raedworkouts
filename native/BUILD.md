# Raedworkouts Go — the native iPhone app

A WKWebView shell around the v17 web app, plus two native surfaces the PWA cannot
have: a **Live Activity** for the rest countdown (Dynamic Island + Lock Screen)
and a **small Home-Screen widget**. Private, Apple-Developer signed, never the
App Store. Modelled on the طقوس gateway app at `~/Project180/native-app`.

- App target `RaedworkoutsGo` — `com.raedmohammed.raedworkouts`, «Raedworkouts Go», portrait.
- Widget target `RaedworkoutsGoWidget` — `com.raedmohammed.raedworkouts.widget`.
- App Group `group.com.raedmohammed.raedworkouts` — the only channel between them.
- Team `93M7QN4Q5U`, automatic signing, iOS 17.0, Swift 6, XcodeGen.

## Why the web app is bundled, not loaded from Vercel

`Tools/sync-www.sh` copies the worktree's web app into `App/www/` on **every
build** (an XcodeGen `preBuildScripts` step), and the shell serves it from the
bundle over a custom scheme, `raed://app/…`. Two reasons:

1. **The gym has no signal.** A shell that fetches the page cannot open there.
2. **`file://` would throw his data away.** A `file://` page gets an opaque
   origin, so `localStorage` — which *is* the local training state — does not
   persist. `raed://app` is a real tuple origin; it survives relaunches.

`www/` is a **folder reference** (blue folder), so a new module under `core/`
needs no project change. The copy list in `sync-www.sh` is explicit: `tests/`,
`server/`, `node_modules/` and the markdown never reach the phone. `native/` is
in the repo's `.vercelignore` so the site deploy never uploads any of this.

## The bridge contract (`core/native.js` ↔ `App/NativeBridge.swift`)

The page posts `{ type, ...payload }` to `webkit.messageHandlers.native`:

| type | payload | what the shell does |
|---|---|---|
| `rest_start` | `end_ms`, `total_ms`, `session`, `exercise`, `set_label` | ends any live activity, then `Activity<RestAttributes>.request` with `staleDate = end_ms` |
| `rest_cancel` | — | ends every live activity immediately |
| `rest_end` | — | same |
| `summary` | the widget payload below | writes the JSON to the App Group under `rw.summary`, then `WidgetCenter.reloadAllTimelines()` |
| `js_error` | `message` | shell-only; posted by the injected shim so a page that fails to boot is not a silent blank rectangle |

`summary` schema, exactly as `nativeSummary()` builds it:

```json
{ "updated_at": "…", "today": { "name": "علوي أ", "kind": "gym|rest" },
  "week": { "done": 3, "target": 4 }, "streak": 5,
  "last": { "date": "2026-09-06", "name": "سفلي أ", "sets": 19, "kg": "2,514" } | null,
  "active": { "name": "علوي أ", "started_at": "…" } | null }
```

`last.kg` is a **string** — `fmtKgTotal()` formats it web-side. The decoder also
accepts a number, so a future change there cannot blank the line.

Deep link: `raedworkouts://open` (any `raedworkouts://…`) brings the app forward.
The Live Activity and the widget both use it.

## Two things WebKit does that the shell has to work around

1. **A `WKURLSchemeHandler` is never given the request body.** Method, URL and
   headers survive; `httpBody` is nil. The coach's `POST /api/coach?route=answer`
   would arrive empty. A document-start shim (`AppWebView.bodyShim`) therefore
   also carries the body, percent-encoded, in `X-RW-Body` — the questions are
   Arabic and a header must be ASCII. The proxy prefers the real body whenever
   WebKit does deliver one, so the day this is fixed nothing has to change.
2. **`<a download>` on a `blob:` URL renders instead of downloading.** «صدّر
   بياناتي» replaced the whole app with raw JSON and there was no way back.
   `navigationAction.shouldPerformDownload` → `.download`, and `WKDownload`
   lands the file in a share sheet.

`raed://app/api/<path>?<query>` is proxied to
`https://raedworkouts-v16.vercel.app/api/<path>?<query>` — status, `Content-Type`
and body verbatim. That is how the coach reaches the function holding its key;
the key never comes near the phone. `Origin`, `Referer`, `Host` and
`Content-Length` are dropped rather than replayed at Vercel.

## The status readout — the `⋯` menu

The playbook's rule: on-device we are blind without it. Five lines, all written
to the App Group, all readable from the menu (tap **حدّث الحالة** to re-read —
the menu is built when the view is, so a line written after that is one tap
behind):

- **الصفحة** — `loaded /index.html`, `provisional_failed:…`, `js_error: …`, `download ok …`
- **الراحة** — `rest_start ok 149s`, `rest_cancel ok`, `activity_failed:…`
- **الملخّص** — `ok 3/4`, `failed:no_app_group`
- **الوسيط** — `GET /api/coach?route=usage body=0 → 200 in 1614ms`
- **الودجت** — `read_ok 3/4`, `no_summary_yet`, `no_app_group`

The rest line and the summary line are deliberately **separate keys**: a
`summary` arrives after every render and would overwrite `rest_start` within
half a second — losing the only line worth reading when the Island is wrong.

`no app group` on any line means the entitlement did not make it into the build
— that, not the widget code, is what to fix.

## Build

```bash
cd ~/RaedWorkoutsV2/worktree-v17/native
xcodegen generate                       # after any project.yml change

# gate: compiles clean, no signing
xcodebuild -project RaedworkoutsGo.xcodeproj -scheme RaedworkoutsGo \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

`RaedworkoutsGo.xcodeproj` and `App/www/` are generated; both are in
`native/.gitignore`. Run `xcodegen generate` on a fresh checkout.

### Simulator

```bash
xcrun simctl boot "iPhone 17 Pro"; open -a Simulator
xcodebuild -project RaedworkoutsGo.xcodeproj -scheme RaedworkoutsGo \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -configuration Debug -derivedDataPath build/sim build
xcrun simctl install booted build/sim/Build/Products/Debug-iphonesimulator/RaedworkoutsGo.app
xcrun simctl launch booted com.raedmohammed.raedworkouts
```

Build **with** signing for anything that touches the widget or the Live Activity:
`CODE_SIGNING_ALLOWED=NO` strips the entitlements, and without the App Group the
widget reads nothing. Read the shared store from the host:

```bash
G=$(xcrun simctl get_app_container booted com.raedmohammed.raedworkouts group.com.raedmohammed.raedworkouts)
plutil -p "$G/Library/Preferences/group.com.raedmohammed.raedworkouts.plist"
```

> ### 🚫 Never sign in as «Raed» in the simulator or in any automated run
>
> The app syncs to his **live** cloud row at `raed-hp.tail53bd35.ts.net:8443`.
> A phantom session was written to it exactly this way. Use the welcome
> screen's **«شخص آخر؟»** and the name `sim`, or drive the bridge with
> `evaluateJavaScript`. This is absolute — it costs him real training history.

### Device

```bash
xcodebuild -project RaedworkoutsGo.xcodeproj -scheme RaedworkoutsGo \
  -sdk iphoneos -destination 'generic/platform=iOS' -configuration Release \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=93M7QN4Q5U build
xcrun devicectl device install app --device 082E4136-FCF1-5B86-A65B-1989A4262838 \
  <path>/RaedworkoutsGo.app
```

The phone must be unlocked and on the network. `-allowProvisioningUpdates`
registers the two new bundle ids and the App Group with the Mac's Xcode account.

## Verify

1. **Offline** — turn the Mac's network off, cold-launch: Home must still draw.
2. **Storage** — sign in as `sim`, terminate, relaunch: still signed in.
3. **Proxy** — Settings → المدرب: the spend ledger fills, and the `الوسيط` line
   reads `→ 200`.
4. **Rest** — complete a working set: `الجسر` reads `rest_start ok <n>s`, the
   Island counts down, ⇧⌘H shows compact, a long press shows expanded, ⌘L shows
   the Lock Screen card. Let it run out → «انتهت الراحة». Cancel (`✕` on the
   rest dock) → the activity disappears.
5. **Widget** — long-press the Home Screen → `+` → Raedworkouts → small.
6. ⚠️ **After reinstalling, iOS may keep running the OLD widget-extension
   binary.** Remove the widget and re-add it (or respring). A stale extension is
   the usual false "still broken".
