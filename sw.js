const SW_VERSION = 'patch_0.118';
const CORE = [
  './',
  './index.html',
  './styles.css?v=patch_0.118',
  './app.bundle.js?v=patch_0.118',
  './manifest.webmanifest',
  './version.json',
  './icons/app-icon-180.png',
  './icons/app-icon-192.png',
  './icons/app-icon-512.png'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open('lotto-core-'+SW_VERSION).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>!k.endsWith(SW_VERSION)).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if (url.origin===location.origin){
    e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
  }
});
