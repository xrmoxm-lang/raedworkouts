# Raedworkouts Go — the native iPhone app

A WKWebView shell around the v17 web app, plus two native surfaces the PWA cannot
have: a **Live Activity for the whole workout session** (Dynamic Island + Lock
Screen) and a **small Home-Screen widget**. Private, Apple-Developer signed,
never the App Store. Modelled on the طقوس gateway app at `~/Project180/native-app`.

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
| `activity` | the session payload below | `active:false` ⇒ end every live activity · `active:true` with none running ⇒ `Activity<SessionAttributes>.request` · otherwise ⇒ update the running one |
| `summary` | the widget payload below | writes the JSON to the App Group under `rw.summary`, then `WidgetCenter.reloadAllTimelines()` |
| `open_gym` | `scheme`, `fallback` | `UIApplication.open(scheme)`; only if that reports `false` does it open `fallback` |
| `js_error` | `message` | shell-only; posted by the injected shim so a page that fails to boot is not a silent blank rectangle |

`activity` replaced v17r2's `rest_start` / `rest_cancel` / `rest_end`, which are
now logged as `legacy:<type>` — a page old enough to send one can only be a stale
service-worker cache, and that is worth saying out loud.

`activity` payload, exactly as `nativeActivity()` builds it:

```json
{ "active": true, "started_at": "2026-09-08T14:12:05.264Z",
  "session": "علوي أ", "exercise": "Lat Pulldown (Neutral Grip)",
  "set_label": "المجموعة 2 من 3", "exercise_label": "تمرين 3 من 7",
  "since_label": "منذ",
  "rest_ends_at": "2026-09-08T15:11:41.632Z" | null,
  "rest_started_at": "2026-09-08T15:09:11.632Z" | null,
  "done": 2, "total": 7, "skin": "hadid|waraq|rukham" }
```

Every instant is an ISO-8601 string with milliseconds. **Every Arabic string is
built web-side** — the set label, the exercise progress, even the one-word «منذ»
— so no Swift anywhere formats Arabic or puts a number inside it.

It is posted immediately when a session starts, ends or is discarded and when a
rest starts or stops, and debounced 400 ms after every render on the same tick as
`summary`. It carries the WHOLE state every time and is idempotent, so a message
that never arrived repairs itself on the next render rather than leaving the
Island lying.

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

The playbook's rule: on-device we are blind without it. Seven lines, all written
to the App Group, all readable from the menu (tap **حدّث الحالة** to re-read —
the menu is built when the view is, so a line written after that is one tap
behind):

- **الصفحة** — `loaded /index.html`, `provisional_failed:…`, `js_error: …`, `download ok …`
- **الجلسة** — `started 2/7 hadid · المجموعة 2 من 3 rest 149s`, `updated …`, `session_over ended 1`, `activity_failed:…`. The Arabic set label is in the line on purpose: «the Island says the wrong set» is otherwise undiagnosable without a Mac attached
- **النادي** — `opened scope.bit`, `fallback_opened`, `not_installed:no_fallback`, `bad_scheme`
- **الملخّص** — `ok 3/4`, `failed:no_app_group`
- **الوسيط** — `GET /api/coach?route=usage body=0 → 200 in 1614ms`
- **الودجت** — `read_ok 3/4`, `no_summary_yet`, `no_app_group`

The session line and the summary line are deliberately **separate keys**: a
`summary` arrives after every render and would overwrite the activity line within
half a second — losing the only line worth reading when the Island is wrong.

`no app group` on any line means the entitlement did not make it into the build
— that, not the widget code, is what to fix.

## Two things the Live Activity taught us the hard way

1. **A face is rendered once and archived, so a `Date()` comparison inside it
   never flips.** Written as `if state.restEndsAt > Date()`, the compact slot sat
   on «0:00» forever after the rest ran out. The only signal that makes the system
   re-render a face with no update from the app is `context.isStale` reaching the
   `staleDate` — so `restOver` is computed in `SessionLiveActivity` from
   `context.isStale` and handed DOWN into the faces. Measured in the simulator: the
   re-render lands within a minute or two of the deadline, not instantly.
2. **`.fixedSize()` on a `Text(_, style: .timer)` beside a `Spacer(minLength:)`
   crashes the widget extension.** `LayoutSubview.place` asserts on the invalid
   dimension, the renderer's XPC connection dies, and ActivityKit quietly marks
   the activity `dismissed` — so the symptom is "the Island shows nothing" while
   `Activity.request` reported success and the status line reads `started`. The
   crash is in `~/Library/Logs/DiagnosticReports/RaedworkoutsGoWidget-*.ips`;
   look there before believing the bridge.

## Looking at the faces without a phone

`Tools/RenderIslandPreviews.swift` draws the REAL views out of
`Widget/SessionFaces.swift` — compact, minimal, expanded and Lock Screen, in all
three skins and all three states — into one sheet per skin:

```bash
swiftc -parse-as-library -Onone Tools/RenderIslandPreviews.swift \
  Widget/SessionFaces.swift Shared/SessionState.swift Shared/DesignSystem.swift \
  -o /tmp/render_island && /tmp/render_island <output-directory>
```

That is why `SessionState` and the faces are declared apart from
`SessionAttributes`: neither imports ActivityKit, so both compile for the Mac.
The playbook's golden rule still stands — this proves layout, colour and RTL, and
nothing else. `ProgressView(timerInterval:)` (the draining rest bar) renders as a
yellow «unsupported» placeholder on macOS; only a real host draws it.

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
4. **Session** — start a session: `الجلسة` reads `started …`, and the Island
   shows the elapsed time counting up the moment the app is not in front. ⇧⌘H
   shows compact, a long press shows expanded, ⌘L shows the Lock Screen card.
   Complete a working set → the same activity switches to the rest countdown; let
   it run out → «انتهت الراحة» and the elapsed timer comes back, **without the
   activity disappearing**. Finish or discard the session → it disappears.
   The three skins must each recolour it (Settings → المظهر).
5. **Gym** — «افتح النادي» opens In2 Fitness with no delay; `النادي` reads
   `opened scope.bit`. With In2 removed it reads `fallback_opened` and the App
   Store page appears.
6. **Widget** — long-press the Home Screen → `+` → Raedworkouts → small.
7. ⚠️ **After reinstalling, iOS may keep running the OLD widget-extension
   binary.** Remove the widget and re-add it (or respring). A stale extension is
   the usual false "still broken".
