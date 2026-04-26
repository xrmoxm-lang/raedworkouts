/* Raedworkouts — service worker
 * Cache the app shell so the app works fully offline once loaded.
 * YouTube thumbnails (img.youtube.com) are cached as they're requested.
 */
const CACHE = 'raedworkouts-v3';
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
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Network-first for Supabase API, cache-first for everything else
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Cache successful GETs (including youtube thumbnails)
        if (e.request.method === 'GET' && res.ok && (url.origin === location.origin || url.hostname.endsWith('youtube.com'))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
