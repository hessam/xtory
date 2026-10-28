const TILE_CACHE = 'thunderforest-tiles-v1';
const MAX_CACHE_ENTRIES = 2000; // ~2000 tiles × ~30KB = ~60MB max

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  // Clean up old cache versions
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== TILE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Only intercept Thunderforest tile requests
  if (!url.includes('tile.thunderforest.com')) return;

  event.respondWith(
    caches.open(TILE_CACHE).then(cache =>
      cache.match(event.request).then(cached => {
        if (cached) return cached; // Cache HIT — no network request

        // <img> tile requests are no-cors, which yield opaque responses that can't be
        // inspected and count heavily against storage quota. Re-request in CORS mode so
        // only real 200s are cached; if the server rejects CORS, fall back to a plain,
        // uncached fetch so tiles still render.
        const corsRequest = new Request(event.request.url, { mode: 'cors', credentials: 'omit' });
        return fetch(corsRequest).then(response => {
          if (response.ok) {
            cache.put(event.request, response.clone());
            // Evict oldest entries if cache grows too large
            trimCache(cache, MAX_CACHE_ENTRIES);
          }
          return response;
        }).catch(() => fetch(event.request));
      })
    )
  );
});

async function trimCache(cache, maxItems) {
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // Delete oldest 10% when limit is hit
    const toDelete = keys.slice(0, Math.floor(keys.length * 0.1));
    await Promise.all(toDelete.map(k => cache.delete(k)));
  }
}
