const VERSION = "patch_1.102";

const LS = {
  SAVED: 'savedBlocks',
  EXCLUDE: 'excludeSet',
  LAST_REC: 'lastRecVisible',
  HALL: 'hallOfFame',
  META: 'appMeta',
};

const state = { dataFull: [], dataRecent: [], latest: null, view:'#home' };
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function readLS(k,d){ try{const v=localStorage.getItem(k); return v?JSON.parse(v):d;}catch{return d;} }
function writeLS(k,v){ localStorage.setItem(k, JSON.stringify(v)); }

function numClass(n){ if(n<=10)return'chip-n1'; if(n<=20)return'chip-n2'; if(n<=30)return'chip-n3'; if(n<=40)return'chip-n4'; return'chip-n5'; }
function chip(n, colored=true){ const cls=colored?numClass(n):'chip-num'; return `<span class="chip ${cls}">${n}</span>`; }

async function loadJSON(path){ try{ const res=await fetch(path+'?v='+VERSION+'&t='+Date.now()); if(!res.ok) throw 0; return await res.json(); } catch { return []; } }
async function loadData(){
  const [full, recent] = await Promise.all([ loadJSON('data/draws_full.json'), loadJSON('data/draws_recent.json') ]);
  state.dataFull = Array.isArray(full)? full:[]; state.dataRecent = Array.isArray(recent)? recent:[];
  state.latest = state.dataFull.length? state.dataFull[state.dataFull.length-1] : null;
  reflectLatestMeta();
}

function reflectLatestMeta(){
  if(!state.latest) return;
  const meta=readLS(LS.META, {});
  if(meta.latestRound !== state.latest.drwNo){
    localStorage.removeItem(LS.LAST_REC);
    settleSavedWithLatest();
  }
  meta.latestRound = state.latest.drwNo;
  meta.latestDate = state.latest.drwNoDate;
  writeLS(LS.META, meta);
}

function setHeaderFor(viewId){
  const header=$('#app-header'); const fab=$('#fab-up');
  if(viewId==='#home'){ header.classList.add('hidden'); fab.classList.add('hidden'); }
  else { header.classList.remove('hidden'); $('#view-title').textContent = ({'#draws':'당첨번호','#saved':'저장번호','#recommend':'추천','#hall':'명예의전당','#analysis':'분석'})[viewId]||''; }
}

function route(hash){
  const target=hash||'#home'; state.view=target;
  $$('.view').forEach(v=>v.classList.remove('active'));
  const el=document.querySelector(target); if(el) el.classList.add('active');
  setHeaderFor(target);
  if(target==='#home') renderHome();
  if(target==='#draws') renderDraws();
  if(target==='#saved') renderSaved();
  if(target==='#recommend') renderRecommend();
  if(target==='#hall') renderHall();
  if(target==='#analysis') renderAnalysis();
}

function formatPrize(p){
  const fmt=n=> n==null?'-': new Intl.NumberFormat('ko-KR').format(n);
  return `1등 ${fmt(p?.first?.amount)} / ${fmt(p?.first?.winners)}명 · 2등 ${fmt(p?.second?.amount)} / ${fmt(p?.second?.winners)}명 · 3등 ${fmt(p?.third?.amount)} / ${fmt(p?.third?.winners)}명`;
}

function renderLatestHome(){
  if(!state.latest) return;
  const nums=[state.latest.drwtNo1,state.latest.drwtNo2,state.latest.drwtNo3,state.latest.drwtNo4,state.latest.drwtNo5,state.latest.drwtNo6];
  $('#home-draw-chips').innerHTML = nums.map(n=>chip(n,true)).join('') + chip(state.latest.bnusNo,true);
  $('#home-prize-info').textContent = formatPrize(state.latest.prize||{});
}

function bindUpdateButton(){
  const btn=$('#update-btn');
  fetch('version.json?v='+Date.now()).then(r=>r.json()).then(vj=>{
    if(vj && vj.version && vj.version!==VERSION){ btn.classList.remove('hidden'); btn.onclick=()=>location.reload(); }
  }).catch(()=>{});
}

function renderHome(){
  renderLatestHome();
  const savedBtn=$('#saved-btn');
  const hof=readLS(LS.HALL, []);
  const hasFirst = hof.some(h=>h.firstPrize);
  if(hasFirst) savedBtn.classList.add('winner'); else savedBtn.classList.remove('winner');
  bindUpdateButton();
}

function renderDraws(){
  if(!state.latest) return;
  const nums=[state.latest.drwtNo1,state.latest.drwtNo2,state.latest.drwtNo3,state.latest.drwtNo4,state.latest.drwtNo5,state.latest.drwtNo6];
  $('#draws-latest-chips').innerHTML = nums.map(n=>chip(n,true)).join('') + chip(state.latest.bnusNo,true);
  $('#draws-latest-prize').textContent = formatPrize(state.latest.prize||{});
  const list=$('#draws-list'); list.innerHTML='';
  const arr=(state.dataFull||[]).slice(-50).reverse();
  arr.forEach(d=>{
    const div=document.createElement('div'); div.className='card draw-card';
    const chips=[d.drwtNo1,d.drwtNo2,d.drwtNo3,d.drwtNo4,d.drwtNo5,d.drwtNo6].map(n=>chip(n,true)).join('') + chip(d.bnusNo,true);
    div.innerHTML = `<div class="card-title">제 ${d.drwNo}회</div><div class="chips-row">${chips}</div><div class="prize-info">${formatPrize(d.prize||{})}</div>`;
    list.appendChild(div);
  });
}

function getSavedBlocks(){ return readLS(LS.SAVED, []); }
function setSavedBlocks(v){ writeLS(LS.SAVED, v); }

function ensureBlockForNextRound(){
  if(!state.latest) return;
  const r=state.latest.drwNo+1; let bl=getSavedBlocks();
  if(!bl.find(b=>b.round===r && !b.settled)){
    bl.unshift({round:r, sets:[], settled:false});
    setSavedBlocks(bl);
  }
}

function renderSaved(){
  ensureBlockForNextRound();
  const a=$('#saved-active'), ar=$('#saved-archive'); a.innerHTML=''; ar.innerHTML='';
  const blocks=getSavedBlocks();
  blocks.forEach((b,bi)=>{
    const container=document.createElement('div'); container.className='block card';
    const title=b.settled? `제 ${b.round}회` : `제 ${b.round}회 예상번호 + ${ddayLabel()}`;
    const head=document.createElement('div'); head.className='block-head';
    const titleEl=document.createElement('div'); titleEl.className='block-title'; titleEl.textContent=title;
    const actions=document.createElement('div'); actions.className='block-actions';
    if(!b.settled){
      const reset=document.createElement('button'); reset.className='btn'; reset.textContent='리셋';
      reset.onclick=()=>{ let all=getSavedBlocks(); all = all.filter((_,idx)=>idx!==bi); setSavedBlocks(all); renderSaved(); };
      actions.appendChild(reset);
    }
    head.append(titleEl, actions); container.appendChild(head);
    for(let g=0; g<6; g++){
      const group=document.createElement('div'); group.className='group';
      for(let s=0; s<5; s++){
        const idx=g*5+s; const set=b.sets[idx];
        const line=document.createElement('div'); line.className='set-line';
        if(set){
          const chips=set.nums.map(n=>chip(n, set.matched?.includes(n))).join('');
          line.innerHTML = `<div class="chips-row">${chips}</div><div class="set-right">${set.status||'미추첨'}</div>`;
          line.onclick=()=> line.classList.toggle('active');
        } else {
          line.innerHTML = `<div class="chips-row"></div><div class="set-right"></div>`;
        }
        group.appendChild(line);
      }
      container.appendChild(group);
    }
    (b.settled?ar:a).appendChild(container);
  });
}

function nextKSTSaturday2040(){
  const now = new Date();
  const kstNowMs = now.getTime() + (9*60 - now.getTimezoneOffset())*60000;
  const kst = new Date(kstNowMs);
  const day = kst.getDay();
  let diff = (6 - day);
  const target = new Date(kst.getFullYear(), kst.getMonth(), kst.getDate()+diff, 20, 40, 0, 0);
  if(diff===0 && kst > target) diff = 7;
  const finalTarget = new Date(kst.getFullYear(), kst.getMonth(), kst.getDate()+diff, 20, 40, 0, 0);
  const localMs = finalTarget.getTime() - (9*60 - now.getTimezoneOffset())*60000;
  return new Date(localMs);
}
function ddayLabel(){
  const target = nextKSTSaturday2040();
  const now = new Date();
  const days = Math.ceil((target - now) / (24*60*60*1000));
  return days>0 ? `D-${days}` : 'D-DAY';
}

function getExclude(){ return new Set(readLS(LS.EXCLUDE, [])); }
function setExclude(s){ writeLS(LS.EXCLUDE, Array.from(s)); }

function renderRecommend(){
  const grid=$('#exclude-grid'); grid.innerHTML='';
  const ex=getExclude();
  for(let n=1;n<=45;n++){
    const b=document.createElement('button');
    if(ex.has(n)) b.className='chip chip-num chip-ex';
    else b.className='chip '+numClass(n);
    b.textContent=n;
    b.onclick=()=>{ const cur=getExclude(); cur.has(n)?cur.delete(n):cur.add(n); setExclude(cur); renderRecommend(); };
    grid.appendChild(b);
  }
  const container=$('#recommend-results'); container.innerHTML='';
  const last=readLS(LS.LAST_REC,null);
  if(last && state.latest && last.round === state.latest.drwNo+1){
    container.appendChild(renderResultBlocks(last.sets, hasRecent600()));
  }
}

function hasRecent600(){ return (state.dataRecent||[]).length >= 600; }

function renderResultLine(nums, ok){
  const line=document.createElement('div'); line.className='result-line card';
  const warn=document.createElement('div'); warn.className='warn-badge ' + (ok?'warn-blue':'warn-red');
  const chips=document.createElement('div'); chips.className='chips-row'; chips.innerHTML = nums.map(n=>chip(n,true)).join('');
  const prob=document.createElement('div'); prob.className='prob'; prob.textContent='확률 ' + (Math.floor(Math.random()*100)+1);
  line.append(warn, chips, prob); return line;
}

function renderResultBlocks(sets, ok){
  const wrap=document.createElement('div');
  for(let g=0; g<6; g++){
    const block=document.createElement('div'); block.className='result-block';
    const bt=document.createElement('div'); bt.className='block-title'; bt.textContent=`묶음 ${g+1}`;
    block.appendChild(bt);
    for(let s=0; s<5; s++){
      const idx=g*5+s; const set=sets[idx];
      if(set) block.appendChild(renderResultLine(set, ok));
    }
    wrap.appendChild(block);
  }
  return wrap;
}

async function recommend30(){
  const ok600 = hasRecent600();
  if(!ok600) alert('최근 600회 수집이 충족되지 않았습니다. 경고 표시와 함께 추천을 진행합니다.');
  const btn=$('#do-recommend'); btn.disabled=true; btn.textContent='계산 중...';
  await new Promise(r=>setTimeout(r,2000));
  try{
    const sets = generateRecommendations(30);
    const container = $('#recommend-results'); container.innerHTML='';
    container.appendChild(renderResultBlocks(sets, ok600));
    writeLS(LS.LAST_REC, { round: state.latest? state.latest.drwNo+1:null, sets });
    persistSavedFromRecommend(sets);
  } finally { btn.disabled=false; btn.textContent='추천(30셋트)'; }
}

function persistSavedFromRecommend(sets){
  ensureBlockForNextRound();
  const blocks=getSavedBlocks(); const r= state.latest? state.latest.drwNo+1:null;
  const b=blocks.find(x=>x.round===r && !x.settled); if(!b) return;
  const merged=(b.sets||[]).concat(sets.map(s=>({ nums:s, status:'미추첨', matched:[] })));
  b.sets = merged.slice(0,30);
  setSavedBlocks(blocks);
}

function generateRecommendations(count){
  const data = state.dataFull||[];
  const L = data.length? data[data.length-1] : null;
  const lastNums = L? [L.drwtNo1,L.drwtNo2,L.drwtNo3,L.drwtNo4,L.drwtNo5,L.drwtNo6] : [];
  const ex = new Set(readLS(LS.EXCLUDE, []));
  const exclude = new Set(Array.from(ex).filter(n=>!lastNums.includes(n)));

  const freq=new Array(46).fill(0), lastSeen=new Array(46).fill(0);
  data.forEach((d,idx)=>{ [d.drwtNo1,d.drwtNo2,d.drwtNo3,d.drwtNo4,d.drwtNo5,d.drwtNo6].forEach(n=>{ freq[n]++; lastSeen[n]=idx+1; }); });
  const mu=(data.length*6)/45; const sigma=Math.sqrt(mu*(1-6/45))||1;
  const z=(n)=> (freq[n]-mu)/sigma;

  const gw={G1:0.40,G2:0.30,G3:0.15,G4:0.15};
  const isG1=n=> lastNums.includes(n);
  const isG2=n=> z(n)>=1.0;
  const overdueRank=(()=>{ const pairs=[]; for(let n=1;n<=45;n++) pairs.push([n, data.length-(lastSeen[n]||0)]); pairs.sort((a,b)=>b[1]-a[1]); const top75=new Set(pairs.slice(0,Math.floor(45*0.75)).map(p=>p[0])); return n=> top75.has(n); })();
  const isG3=n=> overdueRank(n) && freq[n]<=mu;
  const weight=n=>{ const g=isG1(n)?'G1': isG2(n)?'G2': isG3(n)?'G3':'G4'; const recent=Math.pow(0.93, (data.length-(lastSeen[n]||0))); const dec=Math.pow(0.98, freq[n]); const w=1+0.8*freq[n]+0.6*(isG3(n)?1:0)+0.6*recent; return gw[g]*w*dec; };

  function roulette(pool){ const arr=Array.from(pool); const sc=arr.map(n=>Math.max(0.0001,weight(n))); const sum=sc.reduce((a,b)=>a+b,0); let r=Math.random()*sum; for(let i=0;i<arr.length;i++){ r-=sc[i]; if(r<=0) return arr[i]; } return arr[arr.length-1]; }
  function bucketsOK(nums){ const c={a:0,b:0,c:0,d:0,e:0}; nums.forEach(n=>{ if(n<=9)c.a++; else if(n<=19)c.b++; else if(n<=29)c.c++; else if(n<=39)c.d++; else c.e++; }); return c.a<=3&&c.b<=3&&c.c<=3&&c.d<=3&&c.e<=2; }
  function g1LimitOK(nums){ return nums.filter(n=>lastNums.includes(n)).length<=2; }
  function intersectCount(a,d){ const arr=[d.drwtNo1,d.drwtNo2,d.drwtNo3,d.drwtNo4,d.drwtNo5,d.drwtNo6]; return a.filter(n=>arr.includes(n)).length; }
  function historyOK(nums){ return data.every(d=> intersectCount(nums,d)<=2 ); }

  const pool=new Set(); for(let n=1;n<=45;n++) if(!exclude.has(n)) pool.add(n);
  const out=[];
  let guard=0;
  while(out.length<count && guard<count*800){
    guard++;
    const pick=new Set();
    while(pick.size<6){
      pick.add(roulette(pool));
      const arr=[...pick].sort((a,b)=>a-b);
      if(arr.some(n=>exclude.has(n)) || !bucketsOK(arr) || !g1LimitOK(arr)){ pick.clear(); continue; }
      if(pick.size>6) break;
    }
    const arr=[...pick].sort((a,b)=>a-b);
    if(arr.length===6 && historyOK(arr)){
      if(!out.some(s=> s.join(',')===arr.join(','))) out.push(arr);
    }
  }
  return out;
}

function settleSavedWithLatest(){
  if(!state.latest) return;
  const blocks=getSavedBlocks(); const cur=state.latest.drwNo;
  const live=blocks.find(b=>!b.settled && b.round===cur);
  if(!live) return;
  const drawn=[state.latest.drwtNo1,state.latest.drwtNo2,state.latest.drwtNo3,state.latest.drwtNo4,state.latest.drwtNo5,state.latest.drwtNo6];
  live.settled=true;
  (live.sets||[]).forEach(s=>{
    const hit = s.nums.filter(n=>drawn.includes(n));
    s.matched = hit;
    const k=hit.length;
    s.status = k>=3? `${k}개 일치` : '미추첨';
  });
  writeLS(LS.SAVED, blocks);
  const hof=readLS(LS.HALL, []);
  const winners=(live.sets||[]).filter(s=> (s.matched?.length||0)>=3);
  hof.unshift({ round: state.latest.drwNo, firstPrize: winners.some(s=>s.matched.length===6), sets: winners });
  writeLS(LS.HALL, hof);
}

function renderHall(){
  const root=$('#hall-cards'); root.innerHTML='';
  const hof=readLS(LS.HALL, []);
  hof.forEach(h=>{
    const card=document.createElement('div'); card.className='card hof-card';
    const head=document.createElement('div'); head.className='hof-head card-title'; head.textContent=`제 ${h.round}회`;
    const chips = state.dataFull.find(d=>d.drwNo===h.round);
    if(chips){
      const nums=[chips.drwtNo1,chips.drwtNo2,chips.drwtNo3,chips.drwtNo4,chips.drwtNo5,chips.drwtNo6];
      const top=`<div class="chips-row">${nums.map(n=>chip(n,true)).join('')}${chip(chips.bnusNo,true)}</div>`;
      card.innerHTML = head.outerHTML + top;
    } else {
      card.appendChild(head);
    }
    (h.sets||[]).forEach(s=>{
      const line=document.createElement('div'); line.className='set-line';
      line.innerHTML=`<div class="chips-row">${s.nums.map(n=>chip(n, s.matched?.includes(n))).join('')}</div><div class="set-right">${s.matched?.length||0}개 일치</div>`;
      card.appendChild(line);
    });
    root.appendChild(card);
  });
}

function renderAnalysis(){
  const rc=$('#range-card');
  const cnt=state.dataFull.length;
  if(cnt){
    const first=state.dataFull[0]?.drwNo; const last=state.dataFull[cnt-1]?.drwNo;
    rc.textContent = `${first}회 ~ ${last}회 (총 ${cnt}회 수집)`;
  } else rc.textContent='데이터 없음';
  $('#engine-card').textContent = '가중랜덤 + 제약(G1≤2, 10대별≤3, 40~45≤2, 최근600 경고, 과거 교집합≤2)';
  fetch('PATCH_NOTES.txt?v='+Date.now()).then(r=>r.text()).then(t=> $('#patch-notes').textContent=t).catch(()=>{});
}

function onScroll(){
  if(state.view==='#home') return;
  const y = document.scrollingElement.scrollTop || 0;
  $('#fab-up').classList.toggle('hidden', y<300);
}

// nav binds
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-nav]');
  if(btn){ location.hash = btn.getAttribute('data-nav'); }
});

$('#fab-up').addEventListener('click', ()=> window.scrollTo({top:0, behavior:'smooth'}));
$('#home-btn').addEventListener('click', ()=> route('#home'));
$('#do-recommend').addEventListener('click', recommend30);
$('#exclude-reset').addEventListener('click', ()=>{ writeLS(LS.EXCLUDE, []); renderRecommend(); });
$('#prompt-btn').addEventListener('click', ()=> alert('프롬프트 기록은 분석 카드에 반영됩니다.'));

// ==== QR overlay with BarcodeDetector + photo fallback ====
const qrBtn = document.getElementById('qr-btn');
const qrOv = document.getElementById('qr-overlay');
const qrGo = document.getElementById('qr-go');
const qrCancel = document.getElementById('qr-cancel');
const qrPick = document.getElementById('qr-pick');
const qrFile = document.getElementById('qr-file');
const qrVideo = document.getElementById('qr-video');
let mediaStream=null, recognizedUrl='';
let detector=null, rafId=null;

async function ensureDetector(){
  if('BarcodeDetector' in window){
    const formats = await BarcodeDetector.getSupportedFormats().catch(()=>[]);
    if(formats && (formats.includes('qr_code') || formats.includes('qr'))){
      detector = new BarcodeDetector({ formats: ['qr_code','qr'] });
      return true;
    }
  }
  return false;
}

async function scanLoop(){
  if(!detector || !qrVideo || qrVideo.readyState < 2){ rafId = requestAnimationFrame(scanLoop); return; }
  try{
    const det = await detector.detect(qrVideo);
    if(det && det.length){
      const raw = det[0].rawValue || det[0].rawData || '';
      const m = /https?:\/\/[^\s]+/i.exec(raw);
      recognizedUrl = m ? m[0] : (raw || '');
      if(recognizedUrl){ qrGo.classList.remove('hidden'); cancelAnimationFrame(rafId); rafId=null; return; }
    }
  }catch(e){ /* ignore */ }
  rafId = requestAnimationFrame(scanLoop);
}

async function startQR(){
  qrOv.classList.remove('hidden');
  recognizedUrl=''; qrGo.classList.add('hidden');
  const supported = await ensureDetector();
  try{
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' }, audio:false });
    qrVideo.srcObject = mediaStream;
  }catch(e){ /* ignore */ }
  if(supported){ scanLoop(); }
}

function stopQR(){
  if(mediaStream){ mediaStream.getTracks().forEach(t=>t.stop()); mediaStream=null; }
  if(rafId){ cancelAnimationFrame(rafId); rafId=null; }
  recognizedUrl=''; qrGo.classList.add('hidden');
  qrOv.classList.add('hidden');
}

async function detectFromFile(file){
  const ok = await ensureDetector();
  if(!ok){ alert('이 기기에서는 QR 인식이 지원되지 않습니다.'); return; }
  const bmp = await createImageBitmap(await fileToImage(file));
  const res = await detector.detect(bmp);
  if(res && res.length){
    const raw = res[0].rawValue || res[0].rawData || '';
    const m = /https?:\/\/[^\s]+/i.exec(raw);
    recognizedUrl = m ? m[0] : (raw || '');
    if(recognizedUrl){ qrGo.classList.remove('hidden'); }
  } else { alert('QR을 인식하지 못했습니다.'); }
}
function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{ resolve(img); URL.revokeObjectURL(url); };
    img.onerror = reject;
    img.src = url;
  });
}

if(qrBtn){ qrBtn.addEventListener('click', startQR); }
qrCancel.addEventListener('click', stopQR);
qrGo.addEventListener('click', ()=>{ if(recognizedUrl){ location.href = recognizedUrl; }});
qrPick.addEventListener('click', ()=> qrFile.click());
qrFile.addEventListener('change', (e)=>{ const f=e.target.files?.[0]; if(f) detectFromFile(f); });

// ====

window.addEventListener('hashchange', ()=> route(location.hash));
window.addEventListener('scroll', onScroll);
loadData().then(()=> route(location.hash||'#home'));
