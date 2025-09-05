/* app.js — Lotto Lab Pro (Full overwrite version)
 * 모든 시간: KST (UTC+9)
 */
export const VERSION = 'patch_0.105';

const CONFIG = {
  STATS_WINDOW: 150,
  PORTFOLIO_SIZE: 30,      // = 5게임 × 6묶음
  GROUPS: 6,               // 묶음 수
  GROUP_SIZE: 5,           // 묶음당 게임 수
  MAX_SAVED_SETS: 6,       // 저장 카드 최대 개수
  BACKTEST_WINDOW: 30,
  CONCURRENT_FETCHES: 5
};

const KST_OFFSET = 9 * 60;

/* ========= KST helpers ========= */
function nowKST() {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  return new Date(utc + KST_OFFSET * 60000);
}
function isSatAfter2045() {
  const k = nowKST();
  return (k.getDay() === 6 && (k.getHours() > 20 || (k.getHours() === 20 && k.getMinutes() >= 45)));
}
function isMonAfter7() {
  const k = nowKST();
  return (k.getDay() === 1 && k.getHours() >= 7);
}

/* ========= L5 storage ========= */
const L5 = {
  get(key, def){ try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch(e){ return def; } },
  set(key, val){ localStorage.setItem(key, JSON.stringify(val)); },
};

if (!L5.get('L5.status')) L5.set('L5.status', {count:0,last_round:0,last_updated_at:null, phase1_runs:{round:0,runs:0}});
if (!L5.get('L5.draws')) L5.set('L5.draws', []);
if (!L5.get('L5.draws50')) L5.set('L5.draws50', []);
if (!L5.get('L5.saved_sets')) L5.set('L5.saved_sets', []);
if (!L5.get('L5.exclude_mask')) L5.set('L5.exclude_mask', []);
if (!L5.get('L5.hof')) L5.set('L5.hof', []);
if (!L5.get('L5.meta')) L5.set('L5.meta', { patch: VERSION, build: Date.now(), notes: '오락용, 확률 보장 없음.' });

/* ========= Routing/UI elements ========= */
const header = document.getElementById('app-header');
const headerTitle = document.getElementById('header-title');
const homeBtn = document.getElementById('home-btn');
const view = document.getElementById('view');
const fabTop = document.getElementById('fab-top');
const patchLabel = document.getElementById('patch-label');
const updateBtn = document.getElementById('update-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

patchLabel.textContent = `patch ${VERSION}`;
homeBtn.addEventListener('click', ()=>nav('#home'));
window.addEventListener('hashchange', render);
window.addEventListener('scroll', () => {
  const route = location.hash || '#home';
  if (route === '#home') { fabTop.classList.add('hidden'); return; }
  if (window.scrollY > 250) fabTop.classList.remove('hidden'); else fabTop.classList.add('hidden');
});
fabTop.addEventListener('click', ()=>window.scrollTo({top:0,behavior:'smooth'}));

/* ========= SW update signal → 버튼 노출 ========= */
let swWaiting = false;
window.addEventListener('sw-waiting', ()=>{ swWaiting = true; ensureUpdateBadge(); });

/* ========= Loader ========= */
function showLoader(text='처리 중...'){ loadingText.textContent=text; loadingOverlay.classList.remove('hidden'); }
function hideLoader(){ loadingOverlay.classList.add('hidden'); }

/* ========= Fetch helpers ========= */
async function fetchJSON(url){ const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('HTTP '+res.status); return await res.json(); }
async function fetchText(url){ const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('HTTP '+res.status); return await res.text(); }

/* ========= Lotto fetch ========= */
async function fetchRound(round){
  const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`;
  const j = await fetchJSON(url);
  if (j.returnValue !== 'success') throw new Error('no data for round ' + round);
  const main = [j.drwNo1,j.drwNo2,j.drwNo3,j.drwNo4,j.drwNo5,j.drwNo6].sort((a,b)=>a-b);
  const bonus = j.bnusNo;
  const p23 = await fetchPrize23(round).catch(()=>({rank2: null, rank3: null}));
  return {
    round:j.drwNo, date:j.drwNoDate,
    main, bonus,
    prize:{
      rank1:{ amount:j.firstWinamnt, winners:j.firstPrzwnerCo },
      rank2:p23?.rank2,
      rank3:p23?.rank3
    },
    totSellamnt:j.totSellamnt ?? null
  };
}
async function fetchPrize23(round){
  const urls = [
    `https://r.jina.ai/http://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${round}`,
    `https://r.jina.ai/https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${round}`
  ];
  let text=null;
  for (const u of urls){ try{ text = await fetchText(u); if (text) break; }catch(e){ /*noop*/ } }
  if (!text) throw new Error('p23 fetch fail');
  const clean = text.replace(/\s+/g,' ');
  function parseOne(label){
    let m = new RegExp(label+"[^0-9]*([0-9,]+)명[^0-9]*([0-9,]+)원").exec(clean);
    if (!m) m = new RegExp(label+"[^0-9]*([0-9,]+)원[^0-9]*([0-9,]+)명").exec(clean);
    if (!m) return null;
    try {
      const a = parseInt(m[2].replace(/,/g,'')); 
      const w = parseInt(m[1].replace(/,/g,'')); 
      return { amount:a, winners:w };
    } catch(e) { return null; }
  }
  const rank2 = parseOne('2등');
  const rank3 = parseOne('3등');
  if (!rank2 || !rank3) throw new Error('p23 parse fail');
  return { rank2, rank3 };
}

/* ========= Initial backfill ========= */
async function initialBackfill(){
  const status = L5.get('L5.status');
  if (status.count > 0) return;
  showLoader('최신 회차 정보 확인 중...');
  let latest = 0;
  try { latest = await fetchRound(2000).then(d=>d.round); } catch {}
  if (!latest) { hideLoader(); toast('데이터 수집 실패'); return; }
  const out = []; let cur = latest;
  while (cur >= 1){
    const tasks = [];
    for (let i=0; i<CONFIG.CONCURRENT_FETCHES; i++){
      const r = cur - i; if (r >= 1) tasks.push(fetchRound(r).catch(()=>null));
    }
    const arr = await Promise.all(tasks);
    for (const x of arr) if (x) out.push(x);
    cur -= CONFIG.CONCURRENT_FETCHES;
    showLoader(`데이터 수집 중... (${out.length} / ${latest} 회차)`);
    out.sort((a,b)=>a.round-b.round);
    L5.set('L5.draws', out.slice());
    L5.set('L5.draws50', out.slice(-50));
    L5.set('L5.status', { count: out.length, last_round: out.at(-1)?.round || 0, last_updated_at: nowKST().toISOString(), phase1_runs: {round:0,runs:0} });
    await new Promise(r => setTimeout(r, 30));
  }
  hideLoader();
}
/* app.js — Lotto Lab Pro (Full overwrite)
 * 모든 시간: KST (UTC+9)
 */
export const VERSION = 'patch_0.105';

const CONFIG = {
  STATS_WINDOW: 150,
  PORTFOLIO_SIZE: 30,      // = 5게임 × 6묶음
  GROUPS: 6,               // 묶음 수
  GROUP_SIZE: 5,           // 묶음당 게임 수
  MAX_SAVED_SETS: 6,       // 저장 카드 최대 개수
  BACKTEST_WINDOW: 30,
  CONCURRENT_FETCHES: 5
};

const KST_OFFSET = 9 * 60;

/* ========= KST helpers ========= */
function nowKST() {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  return new Date(utc + KST_OFFSET * 60000);
}
function isSatAfter2045() {
  const k = nowKST();
  return (k.getDay() === 6 && (k.getHours() > 20 || (k.getHours() === 20 && k.getMinutes() >= 45)));
}
function isMonAfter7() {
  const k = nowKST();
  return (k.getDay() === 1 && k.getHours() >= 7);
}

/* ========= L5 storage ========= */
const L5 = {
  get(key, def){ try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch(e){ return def; } },
  set(key, val){ localStorage.setItem(key, JSON.stringify(val)); },
};

if (!L5.get('L5.status')) L5.set('L5.status', {count:0,last_round:0,last_updated_at:null, phase1_runs:{round:0,runs:0}});
if (!L5.get('L5.draws')) L5.set('L5.draws', []);
if (!L5.get('L5.draws50')) L5.set('L5.draws50', []);
if (!L5.get('L5.saved_sets')) L5.set('L5.saved_sets', []);
if (!L5.get('L5.exclude_mask')) L5.set('L5.exclude_mask', []);
if (!L5.get('L5.hof')) L5.set('L5.hof', []);
if (!L5.get('L5.meta')) L5.set('L5.meta', { patch: VERSION, build: Date.now(), notes: '오락용, 확률 보장 없음.' });
if (!L5.get('L5.analysisData')) L5.set('L5.analysisData', null);
if (L5.get('L5.sat_pulled_ok') === undefined) L5.set('L5.sat_pulled_ok', false);

/* ========= Routing/UI elements ========= */
const header = document.getElementById('app-header');
const headerTitle = document.getElementById('header-title');
const homeBtn = document.getElementById('home-btn');
const view = document.getElementById('view');
const fabTop = document.getElementById('fab-top');
const patchLabel = document.getElementById('patch-label');
const updateBtn = document.getElementById('update-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

patchLabel.textContent = `patch ${VERSION}`;
homeBtn.addEventListener('click', ()=>nav('#home'));
window.addEventListener('hashchange', render);
window.addEventListener('scroll', () => {
  const route = location.hash || '#home';
  if (route === '#home') { fabTop.classList.add('hidden'); return; }
  if (window.scrollY > 250) fabTop.classList.remove('hidden'); else fabTop.classList.add('hidden');
});
fabTop.addEventListener('click', ()=>window.scrollTo({top:0,behavior:'smooth'}));

/* ========= SW update signal → 버튼 노출 ========= */
let swWaiting = false;
window.addEventListener('sw-waiting', ()=>{ swWaiting = true; ensureUpdateBadge(); });

/* ========= Loader ========= */
function showLoader(text='처리 중...'){ loadingText.textContent=text; loadingOverlay.classList.remove('hidden'); }
function hideLoader(){ loadingOverlay.classList.add('hidden'); }

/* ========= UI helpers ========= */
function chipWinning(n){ const g=n<=10?1:n<=20?2:n<=30?3:n<=40?4:5; const d=document.createElement('div'); d.className='chip win-'+g; d.textContent=String(n).padStart(2,'0'); return d; }
function chipBonus(n){ const c=chipWinning(n); c.classList.add('bonus'); return c; }
function chipNumber(n,sel=false){ const d=document.createElement('div'); d.className='chip num'+(sel?' selected':''); d.textContent=String(n).padStart(2,'0'); d.dataset.value=n; return d; }
function makeWarningCard(ok){ const n=document.createElement('div'); n.className='warning-card '+(ok?'warning-blue':'warning-red'); return n; }
function card(children){ const d=document.createElement('div'); d.className='card'; (Array.isArray(children)?children:[children]).filter(Boolean).forEach(c=>d.appendChild(c)); return d; }
function h2(t){ const e=document.createElement('h2'); e.textContent=t; return e; }
function p(t){ const e=document.createElement('p'); e.textContent=t; e.classList.add('multiline'); return e; }
function row(label, value){ const r=document.createElement('div'); r.className='grid grid-2'; const a=document.createElement('div'); a.textContent=label; const b=document.createElement('div'); b.textContent=value; b.style.textAlign='right'; r.append(a,b); return r; }
const groupInto = (arr, size) => Array.from({length: Math.ceil(arr.length/size)}, (_,i)=>arr.slice(i*size,(i+1)*size));

/* ========= Fetch helpers ========= */
async function fetchJSON(url){ const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('HTTP '+res.status); return await res.json(); }
async function fetchText(url){ const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('HTTP '+res.status); return await res.text(); }

/* ========= Lotto fetch ========= */
async function fetchRound(round){
  const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`;
  const j = await fetchJSON(url);
  if (j.returnValue !== 'success') throw new Error('no data for round ' + round);
  const main = [j.drwNo1,j.drwNo2,j.drwNo3,j.drwNo4,j.drwNo5,j.drwNo6].sort((a,b)=>a-b);
  const bonus = j.bnusNo;
  const p23 = await fetchPrize23(round).catch(()=>({rank2: null, rank3: null}));
  return {
    round:j.drwNo, date:j.drwNoDate,
    main, bonus,
    prize:{
      rank1:{ amount:j.firstWinamnt, winners:j.firstPrzwnerCo },
      rank2:p23?.rank2,
      rank3:p23?.rank3
    },
    totSellamnt:j.totSellamnt ?? null
  };
}
async function fetchPrize23(round){
  const urls = [
    `https://r.jina.ai/http://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${round}`,
    `https://r.jina.ai/https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo=${round}`
  ];
  let text=null;
  for (const u of urls){ try{ text = await fetchText(u); if (text) break; }catch(e){ /*noop*/ } }
  if (!text) throw new Error('p23 fetch fail');
  const clean = text.replace(/\s+/g,' ');
  function parseOne(label){
    let m = new RegExp(label+"[^0-9]*([0-9,]+)명[^0-9]*([0-9,]+)원").exec(clean);
    if (!m) m = new RegExp(label+"[^0-9]*([0-9,]+)원[^0-9]*([0-9,]+)명").exec(clean);
    if (!m) return null;
    try {
      const a = parseInt(m[2].replace(/,/g,'')); 
      const w = parseInt(m[1].replace(/,/g,'')); 
      return { amount:a, winners:w };
    } catch(e) { return null; }
  }
  const rank2 = parseOne('2등');
  const rank3 = parseOne('3등');
  if (!rank2 || !rank3) throw new Error('p23 parse fail');
  return { rank2, rank3 };
}
async function fetchLatestRoundGuess(start=2000){
  let r = start; let got = 0;
  while (r>0){
    try { const d = await fetchRound(r); got = d.round; break; } catch(e){ r--; }
  }
  return got;
}

/* ========= Initial backfill ========= */
async function initialBackfill(){
  const status = L5.get('L5.status');
  if (status.count > 0) return;
  showLoader('최신 회차 정보 확인 중...');
  const latest = await fetchLatestRoundGuess(2000);
  if (!latest) { hideLoader(); toast('데이터 수집 실패'); return; }
  const out = []; let cur = latest;
  while (cur >= 1){
    const tasks = [];
    for (let i=0; i<CONFIG.CONCURRENT_FETCHES; i++){
      const r = cur - i; if (r >= 1) tasks.push(fetchRound(r).catch(()=>null));
    }
    const arr = await Promise.all(tasks);
    for (const x of arr) if (x) out.push(x);
    cur -= CONFIG.CONCURRENT_FETCHES;
    showLoader(`데이터 수집 중... (${out.length} / ${latest} 회차)`);
    out.sort((a,b)=>a.round-b.round);
    L5.set('L5.draws', out.slice());
    L5.set('L5.draws50', out.slice(-50));
    L5.set('L5.status', { count: out.length, last_round: out.at(-1)?.round || 0, last_updated_at: nowKST().toISOString(), phase1_runs: {round:0,runs:0} });
    await new Promise(r => setTimeout(r, 30));
  }
  hideLoader();
}

/* ========= Polling (Sat 20:45+) ========= */
async function tryFetchLatestOnce(){
  const st = L5.get('L5.status');
  if (!st.last_round) return false;
  let r = st.last_round + 1;
  let got=null;
  for (let i=0;i<10;i++){ try{ got = await fetchRound(r); break; } catch(e){ r++; } }
  if (!got) return false;
  const prev=L5.get('L5.draws'); prev.push(got); prev.sort((a,b)=>a.round-b.round);
  L5.set('L5.draws', prev); L5.set('L5.draws50', prev.slice(-50));
  L5.set('L5.status', { count: prev.length, last_round: got.round, last_updated_at: nowKST().toISOString(), phase1_runs: {round:0,runs:0} });
  onNewDrawArrived(got);
  return true;
}

/* ========= Engine V11 ========= */
function lastND(arr,n){ return arr.slice(-n); }
function flatten(a){ return a.flat(); }
function countMap(arr){ const m=new Map(); for(const x of arr) m.set(x,(m.get(x)||0)+1); return m; }
function computeStats150(draws){
  const last150 = lastND(draws, CONFIG.STATS_WINDOW);
  const nums = flatten(last150.map(d=>d.main));
  const cm = countMap(nums);
  const counts = Array.from({length:45}, (_,i)=>cm.get(i+1)||0);
  const mean = counts.reduce((a,b)=>a+b,0)/45;
  const sd = Math.sqrt(counts.reduce((a,b)=>a+(b-mean)**2,0)/45);
  const patterns = countMap(last150.map(d=>{ const o=d.main.filter(x=>x%2).length; return o+':'+(6-o); }));
  const allowedOddEvenRatios = Array.from(patterns.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]);
  const sums = last150.map(d=>d.main.reduce((a,b)=>a+b,0)).sort((a,b)=>a-b);
  const lo = sums[Math.floor(sums.length*0.05)], hi = sums[Math.floor(sums.length*0.95)];
  return { counts, mean, sd, allowedOddEvenRatios, sumRange:[lo,hi] };
}
function groupG1(draws){
  const last = draws.at(-1); if (!last) return new Set();
  const followCount = Array.from({length:46},()=>0);
  const triggerCount = Array.from({length:46},()=>0);
  for (let i=0;i<draws.length-1;i++){ const cur=draws[i].main; const nxt=draws[i+1].main;
    for (const x of last.main) if (cur.includes(x)) triggerCount[x]++;
    for (const x of cur) if (last.main.includes(x)) for (const y of nxt) followCount[y]++;
  }
  const follows=new Set();
  for (let y=1;y<=45;y++){
    for (const x of last.main) if (triggerCount[x]>0 && followCount[y]/triggerCount[x] >= 0.5) { follows.add(y); break; }
  }
  return new Set([...last.main, ...follows]);
}
function groupHotCold(draws, counts, mean, sd, hotZ=1.0, coldZ=-0.6){
  const hot=new Set(), cold=new Set();
  for (let n=1;n<=45;n++){
    const z = (counts[n-1]-mean)/(sd||1);
    if (z>=hotZ) hot.add(n);
    if (z<=coldZ) cold.add(n);
  }
  return {hot,cold};
}
/* G5: "가장 최근 회차 트리거 기준"
   직전 회차의 어떤 번호와도 겹치는 과거회차들의 다음회차에서 '한 번도 등장하지 않은' 숫자 집합 */
function groupG5NeverFollowed(draws){
  if (draws.length<2) return new Set();
  const last = draws.at(-1);
  const ever = new Set();
  for (let i=0;i<draws.length-1;i++){
    const cur=draws[i].main, nxt=draws[i+1].main;
    if (cur.some(x=> last.main.includes(x))) for (const y of nxt) ever.add(y);
  }
  const never=new Set(); for (let n=1;n<=45;n++) if (!ever.has(n)) never.add(n);
  return never;
}
// PRNG PCG64 approx
class PCG64 {
  constructor(seed=0n){ this.state = seed||42n; this.inc=1442695040888963407n; }
  next(){ this.state = this.state * 6364136223846793005n + (this.inc|1n); let x = (this.state>>64n) ^ this.state; x = (x>>22n)&((1n<<64n)-1n); const rot=Number(this.state>>122n)&63; const res = Number(((x>>rot)|(x<<((-rot)&63))) & ((1n<<64n)-1n))>>>0; return res/2**32; }
}
function oddEvenKey(set){ const o=set.filter(x=>x%2).length; return o+':'+(6-o); }
function sumOf(a){ return a.reduce((p,c)=>p+c,0); }
function passesHard(set, analysis, draws, g1){
  const s = sumOf(set); const [lo,hi]=analysis.sumRange; if (s<lo||s>hi) return false;
  if (!analysis.allowedOddEvenRatios.includes(oddEvenKey(set))) return false;
  const bands=[[1,9],[10,19],[20,29],[30,39],[40,45]], lim=[3,3,3,3,2];
  for (let i=0;i<bands.length;i++){ const [a,b]=bands[i]; const c=set.filter(x=>x>=a&&x<=b).length; if (c>lim[i]) return false; }
  for (const d of draws){ const inter=d.main.filter(x=>set.includes(x)).length; if (inter>=3) return false; }
  if (set.filter(x=>g1.has(x)).length>2) return false;
  return true;
}
function sampleSet(rng, weights, gsets){
  const cand=[];
  for (const [name,g] of Object.entries(gsets)) for (const n of g) cand.push({n, w:weights[name]||0.1});
  const total=cand.reduce((a,b)=>a+b.w,0);
  const set=new Set();
  while (set.size<6){
    let r=rng.next()*total;
    for (const c of cand){ r-=c.w; if (r<=0){ set.add(c.n); break; } }
  }
  return Array.from(set).sort((a,b)=>a-b);
}
function generatePortfolio(draws, analysis, params){
  const g1=groupG1(draws);
  const {hot:cHot, cold:cCold} = groupHotCold(draws, analysis.counts, analysis.mean, analysis.sd, params.hotZ, params.coldZ);
  const g5=groupG5NeverFollowed(draws);
  const all=new Set(Array.from({length:45},(_,i)=>i+1));
  const g4=new Set([...all].filter(n=>!g1.has(n)&&!cHot.has(n)&&!cCold.has(n)&&!g5.has(n)));
  const gsets={G1:g1,G2:cHot,G3:cCold,G4:g4,G5:g5};

  const seedStr=`round:${L5.get('L5.status').last_round}|build:${L5.get('L5.meta').build}`;
  let seed=0n; for (const ch of seedStr) seed = (seed*131n + BigInt(ch.charCodeAt(0))) & ((1n<<128n)-1n);
  const rng=new PCG64(seed);

  const exclusions=new Set(L5.get('L5.exclude_mask')||[]);
  const out=[]; let guard=0;
  while (out.length<CONFIG.PORTFOLIO_SIZE && guard<4000){
    const s = sampleSet(rng, params.weights, gsets);
    if (s.some(n=>exclusions.has(n))){ guard++; continue; }
    if (!passesHard(s, analysis, draws, g1)){ guard++; continue; }
    if (out.some(x=> x.filter(n=>s.includes(n)).length>3)){ guard++; continue; }
    out.push(s);
  }
  const score=(set)=>{ let v=0; for (const n of set) v+= g1.has(n)?params.weights.G1 : cHot.has(n)?params.weights.G2 : cCold.has(n)?params.weights.G3 : g5.has(n)?params.weights.G5 : params.weights.G4; return v; };
  const vals=out.map(score); const min=Math.min(...vals,0.0001); const max=Math.max(...vals,1);
  const probs=vals.map(v=>Math.round(1+99*(v-min)/(max-min+1e-9)));
  return out.map((set,i)=>({set, prob:probs[i]}));
}
function buildCandidates(){
  const hotZs=[0.8,1.0,1.2], coldZs=[-0.2,-0.6,-1.0];
  const weights=[[0.40,0.30,0.15,0.15,0.02],[0.45,0.25,0.15,0.15,0.02],[0.35,0.35,0.15,0.15,0.02]];
  const list=[]; for (const hz of hotZs) for (const cz of coldZs) for (const w of weights) list.push({hotZ:hz,coldZ:cz,weights:{G1:w[0],G2:w[1],G3:w[2],G4:w[3],G5:Math.min(w[4],0.05)}});
  return list;
}
async function phase1IfNeeded(){
  const draws = L5.get('L5.draws'); if (draws.length<10) return;
  const st=L5.get('L5.status'); const p=st.phase1_runs||{round:0,runs:0};
  if (p.round===st.last_round && p.runs>=3) return;

  const stats=computeStats150(draws);
  const cands=buildCandidates();
  const last30 = lastND(draws, CONFIG.BACKTEST_WINDOW);
  function hitScore(k){ return k<3?0 : k===3?1 : k===4?3 : k===5?10 : 100; }
  const scores=[];
  for (const cand of cands){
    let total=0;
    for (let i=0;i<last30.length-1;i++){
      const upto=draws.slice(0, draws.length-(last30.length-i-1));
      const a=computeStats150(upto);
      const pf=generatePortfolio(upto,a,cand).slice(0,5);
      const next=last30[i+1];
      const best=Math.max(...pf.map(s=> s.set.filter(x=>next.main.includes(x)).length));
      total+=hitScore(best);
    }
    scores.push({cand,total});
  }
  scores.sort((a,b)=>b.total-a.total);
  const best=scores[0].cand;
  L5.set('L5.analysisData', { ...stats, optimizedParameters:best, generatedAt: nowKST().toISOString() });
  st.phase1_runs = { round: st.last_round, runs: (p.round===st.last_round ? p.runs+1 : 1) };
  L5.set('L5.status', st);
}

/* ========= Hooks ========= */
function onNewDrawArrived(newDraw){
  const saved=L5.get('L5.saved_sets');
  const results=[];
  for (const block of saved) for (const set of block.sets){ const inter=set.filter(x=>newDraw.main.includes(x)).length; const rank=inter===6?1:inter===5?2:inter===4?3:0; results.push({set,inter,rank}); }
  const best=results.sort((a,b)=> b.rank-a.rank || b.inter-a.inter)[0];
  if (best && best.rank>0){ const hof=L5.get('L5.hof'); hof.unshift({ round:newDraw.round, main:newDraw.main, bonus:newDraw.bonus, best:best.set, rank:best.rank, at:nowKST().toISOString() }); L5.set('L5.hof', hof.slice(0,200)); }
  L5.set('L5.saved_archived_round', newDraw.round);
  L5.set('L5.last_reco', null);
  const st=L5.get('L5.status'); st.phase1_runs={round:0,runs:0}; L5.set('L5.status', st);
  ensureUpdateBadge(); // 새 데이터 왔으니 배지 재계산
}

/* ========= Screens ========= */
function render(){
  const route=location.hash||'#home';
  header.classList.toggle('hidden', route==='#home');
  headerTitle.textContent = ({'#winning':'당첨번호','#saved':'저장번호','#recommend':'추천','#hall':'명예의전당','#analysis':'분석'}[route]||'');
  view.innerHTML='';
  if (route==='#home') renderHome();
  else if (route==='#winning') renderWinning();
  else if (route==='#saved') renderSaved();
  else if (route==='#recommend') renderRecommend();
  else if (route==='#hall') renderHall();
  else if (route==='#analysis') renderAnalysis();
}

function cardLatestDraw(){
  const draws=L5.get('L5.draws'); const last=draws.at(-1);
  const box=document.createElement('div'); box.className='card';
  if (!last){ box.appendChild(p('수집된 당첨번호가 없습니다. 수동으로 데이터를 수집해주세요.')); return box; }
  const top=document.createElement('div'); top.textContent=`${last.round}회차  ·  ${last.date}`;
  const mid=document.createElement('div'); mid.className='chips'; last.main.forEach(n=>mid.appendChild(chipWinning(n))); mid.appendChild(chipBonus(last.bonus));
  const bot=document.createElement('div'); bot.className='grid grid-2';
  const fmt=(v)=> v==null?'정보 없음': (typeof v==='number'? v.toLocaleString() : String(v));
  const r1l=document.createElement('div'); r1l.textContent='1등 금액 / 인원'; const r1v=document.createElement('div'); r1v.style.textAlign='right'; r1v.textContent=`${fmt(last.prize?.rank1?.amount)} / ${fmt(last.prize?.rank1?.winners)}`;
  const r2l=document.createElement('div'); r2l.textContent='2등 금액 / 인원'; const r2v=document.createElement('div'); r2v.style.textAlign='right'; r2v.textContent=`${fmt(last.prize?.rank2?.amount)} / ${fmt(last.prize?.rank2?.winners)}`;
  const r3l=document.createElement('div'); r3l.textContent='3등 금액 / 인원'; const r3v=document.createElement('div'); r3v.style.textAlign='right'; r3v.textContent=`${fmt(last.prize?.rank3?.amount)} / ${fmt(last.prize?.rank3?.winners)}`;
  bot.append(r1l,r1v,r2l,r2v,r3l,r3v);
  box.append(top,mid,bot);
  return box;
}
function renderHome(){
  const space=document.createElement('div'); space.className='home-top-space'; view.appendChild(space);
  view.appendChild(cardLatestDraw());
  const btns=document.createElement('div'); btns.className='home-buttons';
  const mk=(t,h)=>{ const b=document.createElement('button'); b.className='btn big-button'; b.textContent=t; b.onclick=()=>nav(h); return b; };
  const savedBtn = mk('저장번호','#saved');
  const hof=L5.get('L5.hof'); if (hof[0]?.rank===1){ Object.assign(savedBtn.style,{ background:'#E53935', color:'#FFD54F', border:'3px solid #2E2A26', padding:'28px 18px' }); savedBtn.textContent='👑 1등당첨'; }
  btns.append(mk('당첨번호','#winning'), savedBtn, mk('추천','#recommend'), mk('명예의전당','#hall'), mk('분석','#analysis'));
  view.appendChild(btns);
}
function renderWinning(){
  view.appendChild(cardLatestDraw());
  const b=document.createElement('button'); b.className='btn btn-primary'; b.textContent='QR 스캔/업로드'; b.onclick=showQRModal; view.appendChild(b);
  const draws=L5.get('L5.draws'); const recent=draws.slice(0,-1).slice(-30).reverse();
  for (const d of recent){
    const c=document.createElement('div'); c.className='card';
    const top=document.createElement('div'); top.textContent=`${d.round}회차  ·  ${d.date}`;
    const mid=document.createElement('div'); mid.className='chips'; d.main.forEach(n=>mid.appendChild(chipWinning(n))); mid.appendChild(chipBonus(d.bonus));
    c.append(top,mid); view.appendChild(c);
  }
}
function showQRModal(){
  const bd=document.createElement('div'); bd.className='modal-backdrop';
  const modal=document.createElement('div'); modal.className='modal';
  modal.append(h2('확인하러가기'), p('QR 인식 URL로 이동합니다.'));
  const go=document.createElement('a'); go.className='btn btn-primary'; go.href='https://m.dhlottery.co.kr/qr.do?method=winQr'; go.textContent='확인하러가기';
  const close=document.createElement('button'); close.className='btn'; close.textContent='닫기'; close.onclick=()=>bd.remove();
  const row=document.createElement('div'); row.style.display='flex'; row.style.gap='8px'; row.append(go,close);
  modal.append(row); bd.appendChild(modal); bd.addEventListener('click',e=>{ if (e.target===bd) bd.remove(); }); document.body.appendChild(bd);
}

function renderSaved(){
  const draws=L5.get('L5.draws'); const last=draws.at(-1);
  if (last) view.appendChild(cardLatestDraw());
  const saved=L5.get('L5.saved_sets');
  if (!saved.length){ view.appendChild(card(p('추천번호가 없습니다.'))); return; }
  const archivedRound=L5.get('L5.saved_archived_round')||0;

  saved.forEach((block,bi)=>{
    const wrap=document.createElement('div'); wrap.className='card';
    const title=document.createElement('div'); title.textContent=`${block.round}회차 예상번호 | D-7`; wrap.appendChild(title);
    const engineOk= !!L5.get('L5.analysisData') && (L5.get('L5.draws').length===L5.get('L5.status').count);
    wrap.appendChild(makeWarningCard(engineOk));

    // 30세트 → 6묶음(각 5게임)
    const groups = groupInto(block.sets, CONFIG.GROUP_SIZE); // 6개 기대
    groups.forEach((sets, gi)=>{
      const gCard=document.createElement('div'); gCard.className='card';
      const gTitle=document.createElement('div'); gTitle.textContent=`묶음 ${gi+1}`;
      const grid=document.createElement('div'); grid.className='grid grid-5';

      sets.forEach(set=>{
        const box=document.createElement('div'); box.className='card';
        const chips=document.createElement('div'); chips.className='chips';
        if (archivedRound===last?.round){ for (const n of set) chips.appendChild(last.main.includes(n)?chipWinning(n):chipNumber(n)); }
        else { for (const n of set) chips.appendChild(chipNumber(n)); }
        box.appendChild(chips);
        const res=document.createElement('div');
        if (archivedRound===last?.round){ const k=set.filter(x=>last.main.includes(x)).length; res.textContent = (k===6?'치킨':k===5?'2등':k===4?'3등':'낙첨'); }
        else res.textContent='미추첨';
        box.appendChild(res);
        grid.appendChild(box);
      });
      gCard.append(gTitle, grid);
      wrap.appendChild(gCard);
    });

    const del=document.createElement('button'); del.className='btn btn-danger'; del.textContent='이 카드 삭제';
    if (archivedRound===last?.round) del.style.display='none';
    del.onclick=()=>{ const arr=L5.get('L5.saved_sets'); arr.splice(bi,1); L5.set('L5.saved_sets',arr); render(); };
    wrap.appendChild(del);
    view.appendChild(wrap);
  });
}

function renderRecommend(){
  const analysis=L5.get('L5.analysisData'); const draws=L5.get('L5.draws');
  const engineOk = !!analysis && (draws.length===L5.get('L5.status').count);
  view.appendChild(makeWarningCard(engineOk));

  // 제외수 선택 그리드
  const grid=document.createElement('div'); grid.className='grid grid-10';
  const mask=new Set(L5.get('L5.exclude_mask'));
  for (let n=1;n<=45;n++){
    const node = mask.has(n) ? chipNumber(n,true) : chipWinning(n);
    node.onclick=()=>{ const m=new Set(L5.get('L5.exclude_mask')); if (m.has(n)) m.delete(n); else m.add(n); L5.set('L5.exclude_mask',Array.from(m)); renderRecommend(); };
    grid.appendChild(node);
  }
  view.appendChild(card([h2('제외수 선택'),grid]));

  // 버튼 2개: 제외수 리셋 / 추천 실행
  const btnRow=document.createElement('div'); btnRow.style.display='flex'; btnRow.style.gap='8px';
  const resetBtn=document.createElement('button'); resetBtn.className='btn'; resetBtn.textContent='제외수 리셋';
  resetBtn.onclick=()=>{ L5.set('L5.exclude_mask', []); renderRecommend(); };
  const run=document.createElement('button'); run.className='btn btn-primary'; run.textContent='추천 실행';
  btnRow.append(resetBtn, run);
  view.appendChild(btnRow);

  const resultBox=document.createElement('div'); view.appendChild(resultBox);

  run.onclick=async()=>{
    run.disabled=true; resetBtn.disabled=true;
    showLoader('최적 파라미터로 번호 생성 중...');
    // UX: 2초 로딩 애니메이션 유지
    await new Promise(r => setTimeout(r, 2000));

    if (!L5.get('L5.analysisData')) await phase1IfNeeded();
    const draws=L5.get('L5.draws'); const analysis=L5.get('L5.analysisData');
    // G1 보호: 제외수에서 제거
    const g1=groupG1(draws); const m=new Set(L5.get('L5.exclude_mask')); for (const n of g1) if (m.has(n)) m.delete(n); L5.set('L5.exclude_mask',Array.from(m));

    const pf = generatePortfolio(draws, analysis, analysis.optimizedParameters);

    // 저장: 30세트 묶음 형태
    const block={ round: L5.get('L5.status').last_round+1, sets: pf.map(x=>x.set) };
    const saved=L5.get('L5.saved_sets'); saved.unshift(block); L5.set('L5.saved_sets', saved.slice(0, CONFIG.MAX_SAVED_SETS));

    // 결과 렌더: 6묶음 × 5게임
    resultBox.innerHTML='';
    const groups = groupInto(pf, CONFIG.GROUP_SIZE); // 6개 기대
    groups.forEach((items, gi)=>{
      const gCard=document.createElement('div'); gCard.className='card';
      const gTitle=document.createElement('div'); gTitle.textContent=`묶음 ${gi+1}`;
      const gridR=document.createElement('div'); gridR.className='grid grid-5';
      items.forEach(item=>{
        const c=document.createElement('div'); c.className='card';
        const chips=document.createElement('div'); chips.className='chips';
        item.set.forEach(n=>chips.appendChild(chipNumber(n)));
        const prob=document.createElement('div'); prob.textContent=item.prob+'%';
        c.append(chips,prob); gridR.appendChild(c);
      });
      gCard.append(gTitle, gridR); resultBox.appendChild(gCard);
    });

    run.disabled=false; resetBtn.disabled=false;
    hideLoader();
    L5.set('L5.last_reco', pf);
  };
}

function renderHall(){
  const list=L5.get('L5.hof'); if (!list.length){ view.appendChild(card(p('기록이 없습니다.'))); return; }
  for (const h of list){
    const c=document.createElement('div'); c.className='card';
    const top=document.createElement('div'); top.textContent=`${h.round}회차`;
    const mid=document.createElement('div'); mid.className='chips'; h.main.forEach(n=>mid.appendChild(chipWinning(n))); mid.appendChild(chipBonus(h.bonus));
    const bot=document.createElement('div'); bot.className='chips';
    const set=h.best||[]; const has2nd=h.rank===2;
    for (const n of set) bot.appendChild(h.main.includes(n)?chipWinning(n) : (has2nd && n===h.bonus)?chipBonus(n) : chipNumber(n));
    const rank=document.createElement('div'); rank.textContent=(h.rank===1?'1등':h.rank===2?'2등':h.rank===3?'3등':'낙첨');
    c.append(top,mid,bot,rank); view.appendChild(c);
  }
}

function renderAnalysis(){
  const analysis=L5.get('L5.analysisData');
  const c1=card([h2('이번주 엔진 분석 현황')]);
  if (analysis){
    c1.append(row('sumRange', analysis.sumRange.join(' ~ ')));
    c1.append(row('홀짝 허용', analysis.allowedOddEvenRatios.join(', ')));
    c1.append(row('최적 파라미터 hotZ/coldZ', analysis.optimizedParameters.hotZ+' / '+analysis.optimizedParameters.coldZ));
    c1.append(row('가중치', JSON.stringify(analysis.optimizedParameters.weights)));
  } else c1.append(p('분석 데이터 없음'));
  view.appendChild(c1);

  const c2=card([h2('G1~G5 조정 시뮬레이션 당첨횟수'), p('백테스트 결과는 Phase 1 수행 시 계산됩니다.')]);
  c2.classList.add('multiline'); // 분석 카드 줄바꿈 허용
  view.appendChild(c2);

  const draws=L5.get('L5.draws');
  const c3=card([h2('당첨번호 수집 기록'), row('총 이력 수', String(draws.length)), row('최신 회차', String(L5.get('L5.status').last_round)) ]);
  c3.classList.add('multiline');
  view.appendChild(c3);

  const c4=card([h2('에러/충돌 내용'), p('현재 없음')]); c4.classList.add('multiline'); view.appendChild(c4);
  const c5=card([h2('패치 정보'), row('패치', L5.get('L5.meta').patch), row('빌드', String(new Date(L5.get('L5.meta').build).toLocaleString('ko-KR')) )]); c5.classList.add('multiline'); view.appendChild(c5);
}

/* ========= Update badge logic ========= */
function dataIncomplete(){
  const draws=L5.get('L5.draws'); const last=draws.at(-1);
  if (!last) return true;
  if (!last.prize?.rank2 || !last.prize?.rank3) return true; // 2,3등 정보 누락
  return false;
}
function ensureUpdateBadge(){
  const should = swWaiting || dataIncomplete() || (isSatAfter2045() && !L5.get('L5.sat_pulled_ok'));
  updateBtn.classList.toggle('hidden', !should);
}

/* ========= Toast ========= */
let toastTimer=null;
function toast(msg){ const ex=document.getElementById('toast'); ex?.remove(); const t=document.createElement('div'); t.id='toast'; t.textContent=msg; Object.assign(t.style,{position:'fixed',left:'50%',bottom:'100px',transform:'translateX(-50%)',background:'#333',color:'#fff',padding:'10px 16px',borderRadius:'999px',zIndex:9999,opacity:'0.95'}); document.body.appendChild(t); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.remove(), 2500); }

/* ========= Boot ========= */
async function boot(){
  render();

  // 월요일 07:00 이후 1회 자동 정리(중복 방지)
  if (isMonAfter7()){
    const today = nowKST().toISOString().slice(0,10);
    if (L5.get('L5.saved_cleared_at') !== today){
      L5.set('L5.saved_sets', []);
      L5.set('L5.saved_cleared_at', today);
    }
  }

  // 최초 전체백필
  if (L5.get('L5.status').count === 0) {
    await initialBackfill().catch(console.warn);
    showLoader('엔진 최적화 중 (Phase 1)...');
    await phase1IfNeeded().catch(console.warn);
    hideLoader();
  }

  // 토요일 20:45 이후 접속: 홈 전 로딩 수집
  if (isSatAfter2045()){
    showLoader('최신 회차 수집 중...');
    let ok = await tryFetchLatestOnce();
    if (!ok){ await new Promise(r=>setTimeout(r, 800)); ok = await tryFetchLatestOnce(); }
    if (ok){ L5.set('L5.sat_pulled_ok', true); await phase1IfNeeded().catch(console.warn); hideLoader(); }
    else { L5.set('L5.sat_pulled_ok', false); hideLoader(); }
  }

  ensureUpdateBadge();
  // Phase1 최신화는 백그라운드 허용
  phase1IfNeeded().catch(console.warn);
}
document.addEventListener('DOMContentLoaded', boot);

/* ========= Update button action ========= */
updateBtn.addEventListener('click', async ()=>{
  showLoader('업데이트 적용 중...');
  try{
    // 1) SW 즉시 활성화
    if (navigator.serviceWorker?.controller){
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) reg.waiting?.postMessage({type:'SKIP_WAITING'});
    }
    // 2) 토요일 수집 실패한 경우 한 번 더 시도
    if (isSatAfter2045() && !L5.get('L5.sat_pulled_ok')){
      await tryFetchLatestOnce();
    }
    // 3) Phase1 보정
    await phase1IfNeeded().catch(()=>{});
  } finally {
    hideLoader();
    location.reload();
  }
});

/* ========= Navigation ========= */
function nav(hash){ if (location.hash !== hash) location.hash = hash; else render(); }
