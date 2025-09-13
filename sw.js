/*
 * Service Worker for Lotto Lab Pro
 * Strategy:
 * - App Shell (static assets): Cache first, then network.
 * - API/Data (dynamic content): Network first, then cache.
 */
const STATIC_CACHE_NAME = 'lotto-lab-pro-static-v104';
const DYNAMIC_CACHE_NAME = 'lotto-lab-pro-dynamic-v104';

// App Shell: files that are essential for the app to work offline.
// We explicitly list them to avoid caching errors from non-existent files like favicon.ico.
const APP_SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install event: cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching App Shell');
        return cache.addAll(APP_SHELL_FILES);
      })
      .catch(error => {
        // This log is important for debugging future installation issues.
        console.error('[SW] Failed to cache app shell:', error);
      })
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event: serve from cache or network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first for API calls to dhlottery and jina.ai
  if (url.hostname === 'www.dhlottery.co.kr' || url.hostname === 'r.jina.ai') {
    event.respondWith(
      caches.open(DYNAMIC_CACHE_NAME).then(cache => {
        return fetch(event.request).then(networkResponse => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        }).catch(() => {
          // If network fails, try to serve from the dynamic cache
          return cache.match(event.request);
        });
      })
    );
    return;
  }

  // Cache-first for all other requests (our app shell)
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// For the "Update" button to work, allowing the new SW to take control immediately.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
