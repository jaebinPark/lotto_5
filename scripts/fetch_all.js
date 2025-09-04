// scripts/fetch_all.js
// GitHub Actions에서 "Run workflow" 하면 1회부터 최신까지 전체 수집해서 data/draws.json 생성/갱신
// Node 20 + node-fetch@3 기준 (workflow에서 설치)

import fs from 'node:fs';
import fetch from 'node-fetch';

async function fetchJSON(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
async function fetchText(url){
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.text();
}

// 2등/3등 금액·인원 파싱 (CORS 프록시 텍스트)
async function fetchPrize23(round){
  const urls = [
    `https://r.jina.ai/http://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${round}`,
    `https://r.jina.ai/https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${round}`
  ];
  let text = null;
  for (const u of urls){
    try { text = await fetchText(u); if (text) break; } catch {}
  }
  if (!text) throw new Error('p23 fetch fail');
  const clean = text.replace(/\s+/g,' ');
  const parse = (label) => {
    // "2등 … 1,234명 … 12,345,678원" 또는 금액/명 순서 반대 케이스까지 대응
    const m = new RegExp(label+"[^0-9]*([0-9,]+)명[^0-9]*([0-9,]+)원").exec(clean)
           || new RegExp(label+"[^0-9]*([0-9,]+)원[^0-9]*([0-9,]+)명").exec(clean);
    if (!m) return null;
    return {
      winners: parseInt(m[1].replace(/,/g,'')),
      amount : parseInt(m[2].replace(/,/g,''))
    };
  };
  const r2 = parse('2등');
  const r3 = parse('3등');
  if (!r2 || !r3) throw new Error('p23 parse fail');
  return { rank2: r2, rank3: r3 };
}

async function fetchRound(n){
  const j = await fetchJSON(`https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${n}`);
  if (j.returnValue !== 'success') throw new Error('no data');
  const main = [j.drwNo1,j.drwNo2,j.drwNo3,j.drwNo4,j.drwNo5,j.drwNo6].sort((a,b)=>a-b);
  const p23 = await fetchPrize23(n).catch(()=>({rank2:null, rank3:null}));
  return {
    round: j.drwNo,
    date : j.drwNoDate,
    main, bonus: j.bnusNo,
    prize: {
      rank1: { amount: j.firstWinamnt, winners: j.firstPrzwnerCo },
      rank2: p23.rank2,
      rank3: p23.rank3
    },
    totSellamnt: j.totSellamnt ?? null
  };
}

// 간단 재시도 헬퍼
async function withRetry(fn, tries=3, waitMs=400){
  let last;
  for (let i=0;i<tries;i++){
    try { return await fn(); } catch(e){ last = e; if (i<tries-1) await new Promise(r=>setTimeout(r, waitMs)); }
  }
  throw last;
}

async function run(){
  const out = [];
  let r = 1;
  let consecutiveMiss = 0; // 연속 3회 실패하면 끝(최신을 넘어선 것으로 판단)

  while (consecutiveMiss < 3) {
    try {
      const d = await withRetry(()=>fetchRound(r), 2, 250);
      out.push(d);
      consecutiveMiss = 0;
    } catch {
      consecutiveMiss++;
    }
    r++;
  }

  // 정렬 + 중복 제거
  out.sort((a,b)=>a.round-b.round);
  const uniq = [];
  let prev = -1;
  for (const d of out) {
    if (d.round !== prev) { uniq.push(d); prev = d.round; }
  }

  // 저장
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/draws.json', JSON.stringify(uniq), 'utf-8');
  console.log(`DONE: ${uniq.length} rounds collected. Latest=${uniq.at(-1)?.round ?? 'N/A'}`);
}

run().catch(e=>{ console.error(e); process.exit(1); });