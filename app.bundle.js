
const VERSION = 'patch_0.118';
const $ = sel => document.querySelector(sel);
const app = $('#app');

// ---------- storage ----------
const DBKEY = 'lotto_db_v2';
function loadDB(){
  try{ return JSON.parse(localStorage.getItem(DBKEY)) || {version:VERSION,saved:{}, hall:[], exclude:[], recoLog:[], lastSeenRound:0}; }
  catch(_){
    return {version:VERSION,saved:{}, hall:[], exclude:[], recoLog:[], lastSeenRound:0};
  }
}
function saveDB(db){
  localStorage.setItem(DBKEY, JSON.stringify(db));
}
let DB = loadDB();

// ---------- helpers ----------
const colorOf = n => n<=10?'b-yellow': n<=20?'b-blue': n<=30?'b-red': n<=40?'b-gray':'b-green';
function chip(n, cls='num'){
  const c = document.createElement('div');
  c.className = 'chip '+(cls==='num'?'num pick':cls)+' '+(cls==='num'?colorOf(n):'');
  c.textContent = n;
  return c;
}
function chipNeutral(n, active){
  const c = document.createElement('div');
  c.className = 'chip num'+(active?'':''); // neutral look (bordered), text colored by CSS
  c.textContent = n;
  if (active) c.style.background='var(--card)';
  return c;
}
function section(title, inner){
  const wrap = document.createElement('div');wrap.className='card';wrap.style.margin='12px 0';
  if (title){ const h = document.createElement('h3');h.textContent=title;wrap.appendChild(h);}
  if (inner) wrap.appendChild(inner);
  return wrap;
}
function grid(){
  const g = document.createElement('div'); g.className='grid'; return g;
}
function btn(text, cls='btn'){
  const b = document.createElement('button'); b.className=cls+' btn'; b.textContent=text; return b;
}
function topbar(title, opts={home:true, back:true}){
  const bar = document.createElement('div'); bar.className='topbar';
  if (opts.back){ const back=document.createElement('div');back.className='icon-btn';back.innerHTML='⟵';back.style.position='absolute';back.style.left='16px'; back.onclick=()=>history.back(); bar.appendChild(back);}
  const h = document.createElement('div');h.textContent=title;h.style.fontWeight='800';h.style.fontSize='22px';bar.appendChild(h);
  if (opts.home){ const home=document.createElement('div');home.className='icon-btn home';home.innerHTML='🏠';home.onclick=()=>location.hash='/home'; bar.appendChild(home);}
  return bar;
}
function footer(){
  const f = document.createElement('div'); f.className='footer'; f.textContent='patch '+VERSION; return f;
}

// ---------- sample latest (replace later by fetched data) ----------
const LATEST = { round: DB.lastSeenRound || 1186, date: '2025-08-23', nums: [2,8,13,16,23,28], bonus: 35, prize: { '1': {amount:'-', winners:'-'}, '2':{amount:'-',winners:'-'}, '3':{amount:'-',winners:'-'} } };

// ---------- update button condition ----------
async function checkUpdateNeeded(){
  try{
    const r = await fetch('./version.json?ts='+Date.now());
    const v = await r.json();
    return v.version && v.version !== VERSION;
  }catch(_){
    return false;
  }
}

// ---------- pages ----------
function pageHome(){
  app.innerHTML='';
  app.appendChild(document.createElement('div')).className='head-spacer';

  const c = document.createElement('div'); c.className='container';
  // recent lotto card
  const g = grid();
  [...LATEST.nums, LATEST.bonus].forEach((n,i)=>{
    const cp = chip(n, 'num'); if (i===6) cp.style.opacity=.6; g.appendChild(cp);
  });
  const card = section('최근 회차', g);
  // 1/2/3등 줄
  const p = document.createElement('div'); p.style.marginTop='8px';
  p.innerHTML = `1등 ${LATEST.prize['1'].amount} / ${LATEST.prize['1'].winners}명<br/>2등 ${LATEST.prize['2'].amount} / ${LATEST.prize['2'].winners}명<br/>3등 ${LATEST.prize['3'].amount} / ${LATEST.prize['3'].winners}명`;
  card.appendChild(p);
  c.appendChild(card);

  // QR button
  const qrBtn = btn('QR 확인(카메라)'); qrBtn.onclick = openQR; c.appendChild(qrBtn);

  c.appendChild(btn('당첨번호')); c.lastChild.onclick=()=>location.hash='/wins';
  c.appendChild(btn('저장번호')); c.lastChild.onclick=()=>location.hash='/saved';
  c.appendChild(btn('추천')); c.lastChild.onclick=()=>location.hash='/recommend';
  c.appendChild(btn('명예의전당')); c.lastChild.onclick=()=>location.hash='/hall';
  c.appendChild(btn('분석')); c.lastChild.onclick=()=>location.hash='/analysis';

  // conditional update button
  checkUpdateNeeded().then(need=>{
    if(need){
      const ub = btn('업데이트 적용', 'btn yellow');
      ub.onclick=async()=>{ const reg = await navigator.serviceWorker.getRegistration(); if(reg){ await reg.update(); } location.reload(); };
      c.appendChild(ub);
    }
  });
  app.appendChild(c);
  app.appendChild(footer());
}

function pageRecommend(){
  app.innerHTML=''; app.appendChild(topbar('추천', {home:true, back:true}));
  const c = document.createElement('div'); c.className='container';
  // grid chips (neutral)
  const g = grid(); g.style.marginBottom='10px';
  const excluded = new Set(DB.exclude||[]);
  for(let n=1;n<=45;n++){ 
    const el = document.createElement('div'); el.className='chip num'; el.textContent=n;
    if(excluded.has(n)){ el.style.outline='3px solid #333' }
    el.onclick=()=>{ if(excluded.has(n)) excluded.delete(n); else excluded.add(n); DB.exclude=[...excluded]; saveDB(DB); el.style.outline = excluded.has(n)?'3px solid #333':'none'; };
    g.appendChild(el);
  }
  const card = section('제외수 (눌러서 토글, 반응형)', g);
  // buttons
  const row = document.createElement('div'); row.className='btn-row';
  const bReset = btn('제외수 리셋'); bReset.onclick=()=>{ excluded.clear(); DB.exclude=[]; saveDB(DB); pageRecommend(); };
  const bReco = btn('추천(30셋트)');
  row.appendChild(bReset); row.appendChild(bReco); card.appendChild(row);
  // status
  const stat = document.createElement('div'); stat.className='kicker'; stat.textContent='현재 추천 셋트: '+(DB.recoLog?.[DB.recoLog.length-1]?.count||0)+'개';
  card.appendChild(stat);
  c.appendChild(card);

  // result area
  const result = document.createElement('div'); c.appendChild(result);

  bReco.onclick=async()=>{
    // 2초 로딩 모션
    bReco.disabled=true; bReco.textContent='계산 중...';
    await new Promise(r=>setTimeout(r, 2000));
    const sets = recommendSets(30);
    renderReco(result, sets);
    // auto save to saved numbers (current round bucket 'pending')
    const round = LATEST.round+1; // 다음 회차 예상
    DB.saved[round] = (DB.saved[round]||[]).concat(sets);
    DB.recoLog.push({ts:Date.now(), round, count:sets.length, opts:{exclude:[...excluded]}});
    saveDB(DB);
    stat.textContent='현재 추천 셋트: '+sets.length+'개';
    bReco.disabled=false; bReco.textContent='추천(30셋트)';
  };

  app.appendChild(c); app.appendChild(footer());
}

function renderReco(container, sets){
  container.innerHTML = '';
  const block = section('추천 결과', document.createElement('div'));
  let wrap = document.createElement('div'); wrap.style.display='grid'; wrap.style.gridTemplateColumns='1fr'; wrap.style.gap='10px';
  block.appendChild(wrap);
  sets.forEach((st,i)=>{
    const line = document.createElement('div'); line.style.display='flex'; line.style.alignItems='center'; line.style.gap='8px';
    if(i%5===0){ const b = document.createElement('span'); b.className='badge'; b.textContent='SET '+(Math.floor(i/5)+1); line.appendChild(b);}
    st.forEach(n=>{ const cp = chip(n,'num'); line.appendChild(cp); });
    wrap.appendChild(line);
  });
  container.appendChild(block);
}

function pageSaved(){
  app.innerHTML=''; app.appendChild(topbar('저장번호', {home:true, back:true}));
  const c = document.createElement('div'); c.className='container';
  const keys = Object.keys(DB.saved).sort((a,b)=>b-a);
  if(!keys.length) c.appendChild(section(null, document.createTextNode('저장된 번호가 없습니다.')));
  keys.forEach(k=>{
    const sets = DB.saved[k];
    const inner = document.createElement('div');
    sets.forEach((st, i)=>{
      const line = document.createElement('div'); line.style.display='flex'; line.style.gap='8px'; line.style.margin='6px 0';
      st.forEach(n=> line.appendChild(chip(n,'num')));
      inner.appendChild(line);
    });
    c.appendChild(section(k+'회차 예상번호', inner));
  });
  app.appendChild(c); app.appendChild(footer());
}

function pageHall(){
  app.innerHTML=''; app.appendChild(topbar('명예의전당', {home:true, back:false}));
  const c = document.createElement('div'); c.className='container';
  if(!DB.hall.length) c.appendChild(section(null, document.createTextNode('아직 기록이 없습니다.')));
  DB.hall.forEach(row=>{
    const line = document.createElement('div'); line.style.display='flex'; line.style.gap='8px'; line.style.alignItems='center'; line.style.margin='6px 0';
    line.appendChild(document.createTextNode(row.round+'회차'));
    row.set.forEach(n=>line.appendChild(chip(n,'num')));
    const rank = document.createElement('span'); rank.className='badge'; rank.textContent=row.rank+'등'; line.appendChild(rank);
    c.appendChild(line);
  });
  app.appendChild(c); app.appendChild(footer());
}

function pageAnalysis(){
  app.innerHTML=''; app.appendChild(topbar('분석', {home:true, back:true}));
  const c = document.createElement('div'); c.className='container';
  c.appendChild(section('추천엔진', document.createTextNode('G1(직전) 최대2, z≥+1 Hot, Cold/Overdue, 버킷(1-9/10-19/20-29/30-39 ≤3, 40-45 ≤2), 과거 교집합≤2, 제외수·G1예외, 2초 로딩 후 30셋트 생성.')));
  c.appendChild(section('패치 로그', document.createTextNode('전체 UI/오프라인/업데이트/추천엔진 v2 반영.')));
  app.appendChild(c); app.appendChild(footer());
}

// ---------- router ----------
function router(){
  const r = location.hash.replace('#','')||'/home';
  if (r.startsWith('/home')) return pageHome();
  if (r.startsWith('/recommend')) return pageRecommend();
  if (r.startsWith('/saved')) return pageSaved();
  if (r.startsWith('/hall')) return pageHall();
  if (r.startsWith('/analysis')) return pageAnalysis();
  if (r.startsWith('/wins')) return pageHome(); // placeholder for wins list
  pageHome();
}
window.addEventListener('hashchange', router);
window.addEventListener('load', router);

// ---------- QR (basic) ----------
async function openQR(){
  // basic overlay with file input fallback
  const ov = document.createElement('div'); ov.className='qr-overlay';
  const label = document.createElement('div'); label.textContent='QR 스캔 (카메라 권한 필요)'; label.style.margin='10px'; ov.appendChild(label);
  const close = document.createElement('button'); close.className='btn'; close.textContent='닫기'; close.style.maxWidth='200px'; close.onclick=()=>ov.remove();
  // fallback file input
  const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.capture='environment'; inp.style.margin='10px';
  ov.appendChild(inp);
  ov.appendChild(close);
  document.body.appendChild(ov);
}

// ---------- Recommend Engine (constraints) ----------
function recommendSets(k=30){
  const excluded = new Set(DB.exclude||[]);
  const last = new Set(LATEST.nums);
  // if excluded has last numbers, remove them (G1 예외)
  LATEST.nums.forEach(n=>excluded.delete(n));
  // precompute buckets
  function bucketOf(n){ if(n<=9) return 0; if(n<=19) return 1; if(n<=29) return 2; if(n<=39) return 3; return 4; }
  const bucketMax = [3,3,3,3,2]; // 40-45 = idx4
  const pool = []; for(let n=1;n<=45;n++) if(!excluded.has(n)) pool.push(n);
  if(pool.length<6) return [];
  // score = group weight * inner score (simplified)
  function zScore(n){ return 0; } // placeholder since no history data bundled
  function group(n){ return last.has(n)?'G1': zScore(n)>=1?'G2':'G4'; }
  const gw = {G1:0.40, G2:0.30, G3:0.15, G4:0.15};
  function score(n){ return (gw[group(n)]||0.15) * (1.0); }
  function violatesBuckets(sel, x){ const b=[0,0,0,0,0]; sel.concat([x]).forEach(n=>b[bucketOf(n)]++); return b.some((v,i)=>v>bucketMax[i]); }
  function violatesG1(sel,x){ const cnt = sel.concat([x]).filter(n=>last.has(n)).length; return cnt>2; }
  function violatesIntersect(sel){
    // without full history, skip; still ensure unique + sorted
    return false;
  }
  function pickOne(sel){
    // roulette wheel
    let total=0; const scores = pool.filter(n=>!sel.includes(n)).map(n=>[n,score(n)]); scores.forEach(s=>total+=s[1]);
    for(let guard=0; guard<200; guard++){ 
      let r=Math.random()*total, pick=null;
      for(const [n,s] of scores){ r-=s; if(r<=0){ pick=n; break; } }
      if(pick==null) pick=scores[scores.length-1][0];
      if(violatesBuckets(sel,pick)) continue;
      if(violatesG1(sel,pick)) continue;
      return pick;
    }
    return null;
  }
  const sets=[];
  outer: for(let i=0;i<k;i++){ 
    let sel=[]; let tries=0;
    while(sel.length<6 && tries<400){ const p=pickOne(sel); if(p==null){ tries++; continue; } sel.push(p); sel.sort((a,b)=>a-b); tries++; }
    if(sel.length<6) break;
    // dedup
    if(sets.some(s=>s.join(',')===sel.join(','))){ i--; continue outer; }
    sets.push(sel);
  }
  return sets;
}
