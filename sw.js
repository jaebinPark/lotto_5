/* sw.js — Lotto Lab Pro PWA Service Worker (v104)
 * 전략:
 * - 정적 파일: Cache-First
 * - API(dhlottery, r.jina.ai): Network-First(+타임아웃) → 실패 시 캐시
 * - 업데이트: postMessage({type:'SKIP_WAITING'}) 수신 시 즉시 활성화
 */

const CACHE_VERSION = 'v104';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

/* 배포 자원 목록 (필요시 추가 가능) */
const STATIC_ASSETS = [
  '/',                // GitHub Pages에서 index.html을 이 경로로 서비스
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

/* ====== Install: 정적 자원 프리캐시 ====== */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(STATIC_ASSETS);
      // 대기 없이 바로 대체 준비
      await self.skipWaiting();
    })()
  );
});

/* ====== Activate: 오래된 캐시 정리 + 클레임 ====== */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/* ====== 메시지: 즉시 업데이트 적용 ====== */
self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ====== 유틸: 네트워크 우선(타임아웃) ====== */
async function networkFirstWithTimeout(request, timeoutMs = 6000) {
  const cache = await caches.open(RUNTIME_CACHE);

  // 타임아웃 프라미스
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('network-timeout')), timeoutMs)
  );

  try {
    const response = await Promise.race([fetch(request), timeout]);
    // 성공 시 러ntime 캐시에 갱신 저장(200응답만)
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // 네트워크 실패 → 캐시 폴백
    const cached = await cache.match(request);
    if (cached) return cached;

    // 캐시에도 없으면 정적 캐시 시도
    const staticMatch = await caches.match(request);
    if (staticMatch) return staticMatch;

    // 최종 폴백: 간단한 503
    return new Response('Offline or upstream failed', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/* ====== 유틸: 캐시 우선 ====== */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // 정적/런타임 구분 없이 성공 응답 캐시 (GET만)
    if (request.method === 'GET' && response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 캐시/네트워크 모두 실패
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/* ====== fetch 라우팅 ====== */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // POST/PUT 등은 캐싱하지 않음
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isApi =
    url.hostname.includes('dhlottery.co.kr') ||
    url.hostname.includes('r.jina.ai');

  // API: Network-First, 그 외: Cache-First
  if (isApi) {
    event.respondWith(networkFirstWithTimeout(req, 6000));
  } else {
    event.respondWith(cacheFirst(req));
  }
});
