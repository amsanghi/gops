// GOPS 3.x service worker.
// Strategy:
//   - HTML pages: network-first (so deploys go live without a force-refresh)
//   - JS/CSS/assets: stale-while-revalidate (instant load + background update)
//   - Cross-origin (fonts, PeerJS CDN): cache-first with revalidation
//   - Versioned cache → bumping `CACHE` forces a one-shot purge across clients.

const CACHE = 'gops-cache-v6';
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/app.js',
  './js/constants.js',
  './js/util.js',
  './js/storage.js',
  './js/state.js',
  './js/effects.js',
  './js/render.js',
  './js/ai.js',
  './js/game.js',
  './js/multi.js',
  './js/modes.js',
  './js/ui.js',
  './js/share.js',
  './js/timer.js',
  './js/achievements.js',
  './js/coach.js',
  './js/charts.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Analytics: never cache or intercept. Hits must go straight to network.
  if (url.hostname.endsWith('goatcounter.com')) return;

  // For HTML navigation requests: network-first to pick up new deploys.
  if (e.request.mode === 'navigate' || (e.request.destination === 'document')) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Same-origin static assets: stale-while-revalidate.
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  // Cross-origin (fonts, PeerJS CDN): cache-first.
  e.respondWith(cacheFirst(e.request));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const resp = await fetch(req);
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch {
    const cached = await cache.match(req);
    return cached || cache.match('./index.html');
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then(resp => {
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  }).catch(() => null);
  return cached || networkPromise || fetch(req);
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) {
    // refresh in background
    fetch(req).then(resp => { if (resp.ok) cache.put(req, resp.clone()); }).catch(() => {});
    return cached;
  }
  try {
    const resp = await fetch(req);
    if (resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (e) {
    return new Response('', { status: 504 });
  }
}

// Allow page to force-skip-waiting when it detects a new SW.
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
