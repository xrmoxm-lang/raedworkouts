/* Raedworkouts — service worker
 * Strategy:
 *   - App shell (html/css/js): kept fresh automatically.
 *       · navigations  → network-first (always newest HTML when online, cache offline)
 *       · css/js/json   → stale-while-revalidate (instant from cache, refreshed in bg)
 *   - Images + YouTube thumbnails → cache-first (rarely change).
 *   - Supabase API → network-first (live data, cache fallback offline).
 *
 * IMPORTANT: bump VERSION on every deploy that changes app.js / styles.css /
 * index.html. The new SW installs in the background, calls skipWaiting(), and
 * the page (see app.js) reloads itself once to apply — no manual force-refresh.
 */
const VERSION = 'v13';
const CACHE = 'raedworkouts-' + VERSION;
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './app.js',
  './manifest.webmanifest',
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

function isShellAsset(url) {
  return url.origin === location.origin && /\.(css|js|json|webmanifest)$/.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) Supabase API → network-first, cache fallback.
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // 2) Navigations (the HTML document) → network-first so a new deploy shows up.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // 3) Shell assets (css/js/json) → stale-while-revalidate.
  if (isShellAsset(url)) {
    e.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 4) Everything else (images, YouTube thumbnails) → cache-first.
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok && (url.origin === location.origin || url.hostname.endsWith('youtube.com'))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
