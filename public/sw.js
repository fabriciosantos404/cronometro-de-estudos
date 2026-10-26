/*
 * Service worker — offline support (PWA).
 *
 * Strategy:
 *  - Navigations: network-first (so updates arrive), fall back to the cached
 *    app shell when offline.
 *  - Same-origin static assets: cache-first (Vite fingerprints them, so they
 *    are immutable), populated on first request.
 *  - Cross-origin (fonts): passed through untouched (handled by the browser).
 *
 * The shell is precached on install using URLs relative to this script, so it
 * works both at the domain root and under a sub-path (e.g. GitHub Pages).
 */
const CACHE = 'focus-crono-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', './index.html']).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let fonts/network pass through

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html'))),
    );
    return;
  }

  // Cache-first for fingerprinted static assets.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        }),
    ),
  );
});
