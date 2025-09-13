#!/usr/bin/env node
/**
 * scripts/fetch_all.js
 * - Node 18+ 환경에서 실행
 * - 1회차부터 최신까지 전회차 수집
 * - 각 회차의 1등 + 2/3등 (금액/인원)까지 함께 수집
 * - 결과를 data/draws.json, data/latest.json 로 저장 (경로가 없으면 생성)
 *
 * 사용법:
 *   node scripts/fetch_all.js
 *   node scripts/fetch_all.js --out data/draws.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- Path helpers ----
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');
const OUT_DIR    = path.resolve(ROOT, 'data');

const args = process.argv.slice(2);
const outArgIdx = args.indexOf('--out');
const OUT_FILE = outArgIdx >= 0 ? path.resolve(ROOT, args[outArgIdx + 1] ?? 'data/draws.json')
                                : path.resolve(OUT_DIR, 'draws.json');
const OUT_LATEST = path.resolve(OUT_DIR, 'latest.json');

// ---- Fetch helpers ----
async function fetchJSON(url){
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return await res.json();
}
async function fetchText(url){
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return await res.text();
}

// ---- Lotto API (same schema as app.js) ----
async function fetchPrize23(round){
  const urls = [
    `https://r.jina.ai/http://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${round}`,
    `https://r.jina.ai/https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${round}`
  ];
  let text = null;
  for (const u of urls){
    try { text = await fetchText(u); if (text) break; } catch(e) { /* try next */ }
  }
  if (!text) throw new Error('p23 fetch fail');
  const clean = text.replace(/\s+/g,' ');
  function parseOne(label){
    let m = new RegExp(label+"[^0-9]*([0-9,]+)명[^0-9]*([0-9,]+)원").exec(clean);
    if (!m) m = new RegExp(label+"[^0-9]*([0-9,]+)원[^0-9]*([0-9,]+)명").exec(clean);
    if (!m) return null;
    try {
      const a = parseInt(m[2].replace(/,/g,'')); // amount
      const w = parseInt(m[1].replace(/,/g,'')); // winners
      return { amount:a, winners:w };
    } catch { return null; }
  }
  const rank2 = parseOne('2등');
  const rank3 = parseOne('3등');
  if (!rank2 || !rank3) throw new Error('p23 parse fail');
  return { rank2, rank3 };
}

async function fetchRound(round){
  const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`;
  const j = await fetchJSON(url);
  if (j.returnValue !== 'success') throw new Error('no data');
  const main = [j.drwNo1,j.drwNo2,j.drwNo3,j.drwNo4,j.drwNo5,j.drwNo6].sort((a,b)=>a-b);
  const bonus = j.bnusNo;
  let rank2 = null, rank3 = null;
  try {
    const p23 = await fetchPrize23(round);
    rank2 = p23.rank2; rank3 = p23.rank3;
  } catch {
    // keep nulls if parsing fails
  }
  return {
    round: j.drwNo,
    date: j.drwNoDate,
    main,
    bonus,
    prize: {
      rank1: { amount: j.firstWinamnt, winners: j.firstPrzwnerCo },
      rank2,
      rank3
    },
    totSellamnt: j.totSellamnt ?? null
  };
}

// ---- Discover latest round by incrementing until failures ----
async function discoverLatestRound() {
  // 빠르고 안전하게 찾기:
  // 1) 상한을 넉넉히 추정 (예: 3000)
  // 2) 이분 탐색으로 마지막 성공 회차 찾기
  const LOW = 1;
  let hi = 3000;

  // 상한 조정: hi가 실제보다 작을 수 있으므로 점프 확장
  while (true) {
    try {
      await fetchRound(hi);
      // 성공이면 더 올려본다
      hi += 500;
      if (hi > 10000) break; // 안전 멈춤
    } catch {
      // 실패면 이분 탐색 들어간다
      break;
    }
  }

  let lo = LOW, ok = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    try {
      await fetchRound(mid);
      ok = mid;       // mid 성공
      lo = mid + 1;   // 더 위를 확인
    } catch {
      hi = mid - 1;   // 아래로 내림
    }
  }
  if (!ok) throw new Error('latest round not found');
  return ok;
}

// ---- Main runner ----
async function run(){
  const startedAt = new Date();
  console.log(`[fetch_all] 시작: ${startedAt.toISOString()}`);

  // 출력 경로 준비
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  // 최신 회차 탐색
  const latest = await discoverLatestRound();
  console.log(`[fetch_all] 최신 회차: ${latest}`);

  // 병렬 청크 수집
  const CONC = 8;
  const results = [];
  let cur = 1;

  async function worker(id){
    while (true) {
      let r;
      // 원자적 증가
      r = cur;
      cur += 1;
      if (r > latest) return;

      try {
        const d = await fetchRound(r);
        results.push(d);
        if (r % 50 === 0 || r === latest) {
          console.log(`[fetch_all] 수집 ${r}/${latest}`);
        }
      } catch (e) {
        // 회차가 비어있거나 네트워크 문제일 수 있음 — 재시도 한 번
        try {
          const d2 = await fetchRound(r);
          results.push(d2);
          console.log(`[fetch_all] 재시도 성공 r=${r}`);
        } catch {
          console.warn(`[fetch_all] 회차 실패 r=${r}: ${e?.message || e}`);
        }
      }
    }
  }

  const workers = Array.from({length:CONC}, (_,i)=>worker(i));
  await Promise.all(workers);

  // 회차 정렬 및 저장
  results.sort((a,b)=>a.round-b.round);
  const latestObj = results.at(-1);

  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2), 'utf8');
  fs.writeFileSync(OUT_LATEST, JSON.stringify(latestObj, null, 2), 'utf8');

  console.log(`[fetch_all] 저장 완료: ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`[fetch_all] 저장 완료: ${path.relative(ROOT, OUT_LATEST)}`);
  console.log(`[fetch_all] 총 ${results.length} 회차, 최신 ${latestObj?.round}회`);
  console.log(`[fetch_all] 끝: ${new Date().toISOString()} (소요 ${(Date.now()-startedAt.getTime())/1000}s)`);
}

// ---- Exec ----
run().catch(err=>{
  console.error(`[fetch_all] 오류:`, err);
  process.exit(1);
});
