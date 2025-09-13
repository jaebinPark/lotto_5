/* sw.js — Lotto Lab Pro service worker (v104)
 * - App Shell 프리캐시
 * - 데이터/외부 API 런타임 캐싱
 * - 업데이트 즉시반영: postMessage({type:'SKIP_WAITING'}) 지원
 */

const CACHE_VERSION = 'llp-v104';
const APP_SHELL = [
  // HTML (이름 대소문자 혼용 대비)
  './',
  './index.html',
  './Index.hyml',

  // 핵심 자원
  './app.js',
  './style.css',
  './manifest.webmanifest',

  // 아이콘 (있으면 캐시)
  './icons/icon-192.png',
  './icons/icon-512.png',

  // 사전 수집된 데이터(있으면 사용)
  './data/draws.json',
  './data/latest.json',
];

// 도메인별 캐싱 정책
const RUNTIME_CACHE = {
  // 내부 정적/데이터: 캐시 우선
  cacheFirst: [
    self.location.origin,
  ],
  // 외부 API: 네트워크 우선(실패 시 캐시)
  networkFirst: [
    'https://www.dhlottery.co.kr',
    'https://r.jina.ai',
    'http://www.dhlottery.co.kr',
  ],
};

// ===== Install =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => {
      // 설치 즉시 대기 상태로 들어가게 하고, 페이지에서 SKIP_WAITING 메시지로 교체
      // 명시적 skipWaiting은 메시지로만 수행 (안전)
    })
  );
});

// ===== Activate =====
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 이전 버전 캐시 정리
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ===== 메시지 (즉시 업데이트 반영) =====
self.addEventListener('message', (event) => {
  const { data } = event;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ===== Fetch =====
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // GET 만 캐싱
  if (req.method !== 'GET') return;

  // 캐시 우선: 동일 오리진 정적/데이터
  if (RUNTIME_CACHE.cacheFirst.some(origin => url.origin === origin)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // 네트워크 우선: 외부 API (dhlottery, r.jina.ai)
  if (RUNTIME_CACHE.networkFirst.some(origin => url.origin === origin)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 그 외는 기본적으로 캐시 우선 (폰트/CDN 등)
  event.respondWith(cacheFirst(req));
});

// ===== 전략 구현 =====
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request, { ignoreVary: true, ignoreSearch: false });
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    // 성공 응답만 캐시
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
  } catch (e) {
    // 오프라인/실패 시 캐시 결과 없으면 그대로 에러 전파
    throw e;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    // 네트워크 우선 시도 (타임아웃 6초)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (resp && resp.ok) {
      cache.put(request, resp.clone());
      return resp;
    }
    // 비정상 응답이면 캐시 폴백
    const cached = await cache.match(request);
    if (cached) return cached;
    return resp; // 어쩔 수 없이 그대로 반환
  } catch (e) {
    // 네트워크 실패 → 캐시 폴백
    const cached = await cache.match(request);
    if (cached) return cached;
    throw e;
  }
}
