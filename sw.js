/* Raedworkouts — service worker
 * Strategy:
 *   - App shell (html/css/js): kept fresh automatically.
 *       · navigations  → network-first (always newest HTML when online, cache offline)
 *       · core css/js/json/modules → network-first (reload means new build)
 *   - Images + YouTube thumbnails → cache-first (rarely change).
 *   - Sync API → network-only. API failures must reject; never return HTML.
 *
 * IMPORTANT: bump VERSION on every deploy that changes app.js / styles.css /
 * index.html. The new SW installs in the background, calls skipWaiting(), and
 * the page (see app.js) reloads itself once to apply — no manual force-refresh.
 */
const VERSION = 'v92';
const CACHE = 'raedworkouts-' + VERSION;
// Deliberately NOT versioned: YouTube thumbnails do not change when the app
// does, and re-downloading 100+ of them over gym signal after every deploy is
// the opposite of offline support. Capped, and exempted from the activate sweep.
const MEDIA_CACHE = 'raedworkouts-media';
const MEDIA_MAX = 160;
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './app.js',
  './locale.js',
  './domain/skin-suggestions.mjs',
  './domain/substitutions.js',
  './domain/programme.js',
  './domain/sync-identity.js',
  './domain/runner-session.js',
  './manifest.webmanifest',
  './icon-192.svg',
  './icon-512.svg',
  './icon-maskable-512.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './img/body_chest.png',
  './img/body_back.png',
  './img/body_bicep.png',
  './img/body_quads.png',
  './img/body_glutes.png',
  './img/body_calves.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== MEDIA_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Oldest-first eviction. `cache.keys()` returns insertion order, which is close
// enough to LRU for a pile of thumbnails and costs nothing to maintain.
function trimCache(cache, max) {
  return cache.keys().then(keys => {
    if (keys.length <= max) return;
    return Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
  }).catch(() => {});
}

// Allow the page to trigger an immediate activation if it ever wants to.
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

// `.mjs` was missing here, and domain/skin-suggestions.mjs is the one ES module
// in the app that does not end in `.js`. It failed this test, fell through to
// the cache-first catch-all, and — being in SHELL — could then never be
// refreshed by anything short of a VERSION bump. Every other domain module was
// network-first. `m?js` closes it.
function isCoreAsset(url) {
  return url.origin === location.origin && /\.(css|m?js|json|webmanifest)$/.test(url.pathname);
}
function isSyncHost(url) {
  return url.hostname.endsWith('.ts.net') || url.hostname === 'raed-hp.tail53bd35.ts.net';
}
function isYoutubeThumb(url) {
  return url.hostname === 'img.youtube.com';
}
// A navigation response is only fit to become the offline shell if it is a real
// 2xx HTML document that was not redirected. See the long note in branch 2.
function isStorableShell(res) {
  if (!res || !res.ok || res.redirected || res.type === 'opaqueredirect') return false;
  return (res.headers.get('content-type') || '').includes('text/html');
}
// The thumbnails are requested by plain <img> tags, so they are `no-cors` and
// come back OPAQUE: type 'opaque', status 0, and therefore `res.ok === false`.
// Guarding the put on `res.ok` alone meant this cache never stored a single
// byte and the cache-first branch never hit — the whole offline-thumbnail
// mechanism was dead, exactly like `superset_group` was. Opaque has to be
// opted into by name.
function isStorableMedia(res) {
  return Boolean(res) && (res.ok || res.type === 'opaque');
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) Sync API → network-only. Offline callers should receive a real failure.
  if (isSyncHost(url)) {
    e.respondWith(fetch(req));
    return;
  }

  // 2) Navigations (the HTML document) → network-first so a new deploy shows up.
  // `cache: 'no-store'` deliberately bypasses an intermediary's stale HTTP
  // object.  This is the v15 stale-host failure mode: the PWA cache was
  // correct, but the network path was serving an old build forever.
  //
  // The put below is GUARDED. It used to store whatever came back, with no
  // `res.ok` check — unlike branch 3 immediately underneath, which always had
  // one. `Cache.put()` stores non-2xx bodies without complaining, so gym WiFi
  // behind a captive portal (HTTP 200 + a login page), a half-finished deploy
  // (404) or a one-second host 500 would each overwrite `./index.html` in the
  // live cache. The next offline open served that page instead of the app, and
  // it stayed bricked until the next successful online load. A redirected
  // response is refused outright by the browser when replayed for a navigation,
  // so that case failed to a blank screen with no fallback at all.
  //
  // Only a real, non-redirected, 2xx HTML document is allowed to become the
  // offline shell.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          if (isStorableShell(res)) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // 3) Core app assets → network-first. Filenames are stable (there is no
  // bundler hash), so stale-while-revalidate would run yesterday's app.js for
  // one more reload. Offline still falls back to the exact pre-cached shell.
  if (isCoreAsset(url)) {
    e.respondWith(
      fetch(req, { cache: 'no-store' }).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // 4) YouTube thumbnails → cache-first. They are stable and need offline support.
  // They live in their own unversioned cache so a deploy does not force him to
  // re-download every thumbnail over gym signal, and so a capped pile of opaque
  // images can never crowd out the app shell. Opaque entries are padded heavily
  // against the storage quota, hence the cap.
  if (isYoutubeThumb(url)) {
    e.respondWith(
      caches.open(MEDIA_CACHE).then(c => c.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (isStorableMedia(res)) {
            const copy = res.clone();
            c.put(req, copy).then(() => trimCache(c, MEDIA_MAX)).catch(() => {});
          }
          return res;
        }).catch(() => c.match(req));
      }))
    );
    return;
  }

  // 5) Cross-origin non-navigation requests → network-only. Do not fallback to app HTML.
  if (url.origin !== location.origin) {
    e.respondWith(fetch(req));
    return;
  }

  // 6) Everything else same-origin (images) → cache-first.
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req));
    })
  );
});
