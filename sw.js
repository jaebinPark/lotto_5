const SW_VERSION = 'v1';
const CORE = ['./','./index.html','./app.bundle.js','./styles.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SW_VERSION).then(c => c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k!==SW_VERSION).map(k => caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request;
  e.respondWith(
    caches.match(req).then(cached =>
      cached || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(SW_VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(() => cached)
    )
  );
});