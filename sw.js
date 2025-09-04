const APP_BUILD = 'v104';
self.addEventListener('install', e=>{
  e.waitUntil(caches.open('l5-static-'+APP_BUILD).then(c=>c.addAll([
    './','./index.html','./style.css','./app.js'
  ])));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(k=>!k.includes(APP_BUILD)).map(k=>caches.delete(k))
  )));
});
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
self.addEventListener('message', e=>{
  if (e.data?.type==='SKIP_WAITING') self.skipWaiting();
});