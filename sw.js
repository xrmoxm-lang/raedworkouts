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
const VERSION = 'v44';
const CACHE = 'raedworkouts-' + VERSION;
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
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Allow the page to trigger an immediate activation if it ever wants to.
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

function isCoreAsset(url) {
  return url.origin === location.origin && /\.(css|js|json|webmanifest)$/.test(url.pathname);
}
function isSyncHost(url) {
  return url.hostname.endsWith('.ts.net') || url.hostname === 'raed-hp.tail53bd35.ts.net';
}
function isYoutubeThumb(url) {
  return url.hostname === 'img.youtube.com';
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
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
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
  if (isYoutubeThumb(url)) {
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
