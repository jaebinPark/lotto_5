// sw.js — PWA 서비스워커 (앱셸 캐시 + 강제 업데이트 + 데이터 네트워크 우선)
const CACHE_VERSION = 'lotto-lab-pro-v104.2';
const CACHE_NAME = `app-cache-${CACHE_VERSION}`;

// 앱셸(정적) 파일 목록 — 프로젝트 경로에 맞게 조정
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './sw.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ===== Install: 앱셸 선캐시 =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()) // 새 SW가 바로 대기 상태로
  );
});

// ===== Activate: 구캐시 정리 + 즉시 클라이언트 제어 =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((n) => (n !== CACHE_NAME ? caches.delete(n) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

// ===== Fetch 전략 =====
// 1) dhlottery / r.jina.ai 등 '데이터'는 네트워크 우선(타임아웃 후 캐시)
// 2) 같은 출처의 정적 리소스(앱셸)는 캐시 우선
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // 데이터 엔드포인트 식별
  const isData =
    url.hostname.includes('dhlottery.co.kr') ||
    url.hostname.includes('r.jina.ai') ||
    url.pathname.startsWith('/data/');

  if (isData) {
    event.respondWith(networkFirst(req));
  } else if (isSameOrigin) {
    // 앱셸/정적: 캐시우선
    event.respondWith(cacheFirst(req));
  }
});

// ---- helpers ----
async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;

  const res = await fetch(req);
  // 성공 응답만 캐시
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);

  // 4초 타임아웃 네트워크 시도
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(req, { signal: controller.signal });
    clearTimeout(t);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    clearTimeout(t);
    // 네트워크 실패 시 캐시 폴백
    const cached = await cache.match(req);
    if (cached) return cached;
    // 그래도 없으면 원요청 시도(마지막 보루)
    return fetch(req).catch(() => new Response('Offline', { status: 503 }));
  }
}

// 메시지로 강제 업데이트 (앱에서 reg.waiting.postMessage({type:'SKIP_WAITING'}))
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});