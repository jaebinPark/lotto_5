/* sw.js — Lotto Lab Pro PWA Service Worker (FULL REPLACE)
 * 캐시 전략:
 *  - 앱 셸(HTML/CSS/JS/아이콘/매니페스트): Stale-While-Revalidate
 *  - 로또 API(dhlottery): Network-First(+타임아웃) → 실패시 캐시
 *  - 기타 GET 요청: 기본적으로 Stale-While-Revalidate
 * 업데이트:
 *  - 클라이언트에서 postMessage({type:'SKIP_WAITING'}) 수신 시 즉시 활성화
 */

const SW_VERSION = 'v104'; // 캐시 버전 (필요 시 변경)
const SHELL_CACHE = `shell-${SW_VERSION}`;
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;
const API_CACHE = `api-${SW_VERSION}`;

// 앱 셸 프리캐시 (루트에 배포한 파일 경로 기준)
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 네트워크 우선(타임아웃) 헬퍼
async function networkFirstWithTimeout(req, cacheName, timeoutMs = 7000) {
  const cache = await caches.open(cacheName);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    const netRes = await fetch(req, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);

    if (netRes && netRes.ok) {
      cache.put(req, netRes.clone());
      return netRes;
    }
    // 네트워크는 응답했지만 ok 아님 → 캐시 폴백
    const cached = await cache.match(req, { ignoreSearch: false });
    if (cached) return cached;
    return netRes; // 그대로 반환(오류상태)
  } catch (err) {
    // 네트워크 실패 → 캐시 폴백
    const cached = await cache.match(req, { ignoreSearch: false });
    if (cached) return cached;
    throw err;
  }
}

// Stale-While-Revalidate 헬퍼(정적 리소스용)
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedPromise = cache.match(req, { ignoreSearch: false });
  const netPromise = fetch(req, { cache: 'no-store' })
    .then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);

  const cached = await cachedPromise;
  return cached || (await netPromise) || new Response('', { status: 504 });
}

/* ========= Install ========= */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => {
        // 기본적으로 대기(기존 세션 존중). 즉시 활성화는 메시지 통해 수행.
        // self.skipWaiting();
      })
  );
});

/* ========= Activate ========= */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 오래된 캐시 정리
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => ![SHELL_CACHE, RUNTIME_CACHE, API_CACHE].includes(k))
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ========= Message (강제 업데이트) ========= */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ========= Fetch ========= */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 비-GET 요청은 건너뜀(네트워크로 직행)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 동일 출처의 앱 셸(정적) → Stale-While-Revalidate
  const isSameOrigin = url.origin === self.location.origin;
  const isShellAsset =
    isSameOrigin &&
    (url.pathname === '/' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.webmanifest') ||
      url.pathname.startsWith('/icons/'));

  if (isShellAsset) {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }

  // 로또 API (dhlottery) → Network-First(+타임아웃)
  const isLottoApi =
    /dhlottery\.co\.kr/.test(url.hostname);

  if (isLottoApi) {
    event.respondWith(networkFirstWithTimeout(req, API_CACHE, 7000));
    return;
  }

  // 기타 GET → Stale-While-Revalidate(런타임 캐시)
  event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
});

/* ========= Fallbacks (선택: 오프라인 페이지 등 필요 시) =========
self.addEventListener('fetch', (event) => {
  // 위 조건들 이후 커스텀 폴백을 추가하고 싶으면 여기에 작성
});
*/
