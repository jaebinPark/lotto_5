const CACHE = 'lotto-cache-patch_1.102';
const FILES = [
  './','index.html','assets/styles.css','assets/app.js','manifest.webmanifest',
  'icons/icon-192.png','icons/icon-512.png','data/draws_full.json','data/draws_recent.json','version.json'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
});
