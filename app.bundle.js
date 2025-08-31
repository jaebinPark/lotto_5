/* Lotto Lab Pro - 0.114
 * Scope:
 * - 분석 화면에 '프롬프트' 버튼 + 패치 기록 카드 추가
 * - 유지/통합: 0.111(당첨화면+QR), 0.112(저장 자동 정리/Hall), 0.113(추천 UX)
 */
(function(){
  'use strict';
  const VERSION = 'patch_0.114';
  const $ = (s,el=document)=>el.querySelector(s);
  const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));

  // ---------- helpers ----------
  const el = (tag, attrs={}, ...children) => {
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})){
      if (k==='class') n.className = v;
      else if (k==='style') Object.assign(n.style, v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c!=null) n.appendChild(typeof c==='string'?document.createTextNode(c):c);
    return n;
  };
  function chunk(arr, size){ const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }
  function go(path){ if(!path.startsWith('/')) path='/'+path; location.hash='#'+path; }
  function fitBox(node, min=12){
    const max = node.clientWidth||0; if(!max) return;
    let low=min, high=parseFloat(getComputedStyle(node).fontSize)||20, ok=low;
    while(low<=high){
      const mid=(low+high>>1);
      node.style.fontSize=mid+'px';
      if(node.scrollWidth<=max && node.scrollHeight<=node.clientHeight+4){ ok=mid; low=mid+1 } else high=mid-1;
    }
    node.style.fontSize=ok+'px';
  }
  function applyFits(root=document){ root.querySelectorAll('[data-fit]').forEach(n=>fitBox(n)); }
  window.addEventListener('resize', ()=>applyFits());

  // ---------- storage ----------
  const Store = (()=>{
    const NS='lotto5:';
    const def = {
      prefs:{exclusions:[],recoPerClick:30},
      saved:{current:[],history:[]},
      hall:[],
      data:{ lastRound:null, lastNumbers:[], lastBonus:null, history:[], lastFetchedAt:null, failReason:null },
      lastSeenBuild: VERSION
    };
    const key = k => NS+k;
    function read(k){ try{ const r=localStorage.getItem(key(k)); if(!r){ write(k,def[k]); return JSON.parse(JSON.stringify(def[k])); } return JSON.parse(r) }catch(e){ return JSON.parse(JSON.stringify(def[k])) } }
    function write(k,v){ try{ localStorage.setItem(key(k), JSON.stringify(v)); }catch(e){} }
    function patch(k,fn){ const cur=read(k); const nxt=fn(cur); write(k,nxt); return nxt; }
    return { read, write, patch };
  })();

  // ---------- theming ----------
  const Colors = {
    chipFill(n){
      if(n<=10) return '#F4C64E';
      if(n<=20) return '#5B8DEF';
      if(n<=30) return '#F06C6C';
      if(n<=40) return '#B9BDC4';
      return '#2DBE75';
    }
  };

  // ---------- coverage / probability ----------
  function coverageStatus(){
    const data = Store.read('data'); const n = (data.history||[]).length;
    return n>=600 ? 'ok' : 'bad';
  }
  function scoreProb1to100(nums){ let h = 7; for(const n of nums) h = (h*131 + n*17) % 1000; return (h % 100) + 1; }

  // ---------- recommend constraints (0.106 유지) ----------
  const BAND_CAPS = { a:[1,9,3], b:[10,19,3], c:[20,29,3], d:[30,39,3], e:[40,45,2] };
  function bandKey(n){ if(n<=9) return 'a'; if(n<=19) return 'b'; if(n<=29) return 'c'; if(n<=39) return 'd'; return 'e'; }
  function validateBandCaps(set){
    const cnt = {a:0,b:0,c:0,d:0,e:0};
    for(const n of set){ cnt[bandKey(n)]++; }
    return (cnt.a<=BAND_CAPS.a[2] && cnt.b<=BAND_CAPS.b[2] && cnt.c<=BAND_CAPS.c[2] && cnt.d<=BAND_CAPS.d[2] && cnt.e<=BAND_CAPS.e[2]);
  }
  function recommendSetsConstrainedV2(targetCount, userExclusions, data){
    const last = new Set((data && data.lastNumbers)||[]);
    const effectiveEx = new Set(userExclusions||[]);
    let autoFreed = []; for (const n of last){ if (effectiveEx.has(n)){ effectiveEx.delete(n); autoFreed.push(n); } }
    const pool = []; for(let i=1;i<=45;i++) if(!effectiveEx.has(i)) pool.push(i);
    if (pool.length < 6) return { error:`제외수가 너무 많습니다. 남은 숫자 ${pool.length}개로는 6개 조합 불가. 제외수를 줄여주세요.` };
    const history = (data && data.history) || [];
    const ENABLE_G1_LIMIT = last.size>0; const ENABLE_OVERLAP_RULE = history.length>0;
    function one(){ const tmp=pool.slice(); const out=[]; for(let k=0;k<6;k++){ const idx=(Math.random()*tmp.length)|0; out.push(tmp.splice(idx,1)[0]); } out.sort((a,b)=>a-b); return out; }
    function passesConstraints(set){
      if (!validateBandCaps(set)) return false;
      if (ENABLE_G1_LIMIT){ let g1=0; for(const n of set) if(last.has(n)) g1++; if (g1>2) return false; }
      if (ENABLE_OVERLAP_RULE){ for (const h of history){ const hv=new Set(h.numbers||[]); let inter=0; for(const n of set) if(hv.has(n)) inter++; if (inter>=3) return false; } }
      return true;
    }
    const uniq=new Set(); const sets=[]; let guard=0, maxTry=targetCount*220;
    while(sets.length<targetCount && guard<maxTry){ const s=one(); const key=s.join('-'); if(!uniq.has(key) && passesConstraints(s)){ uniq.add(key); sets.push(s); } guard++; }
    const out = { sets, autoFreed:autoFreed.sort((a,b)=>a-b) }; if (sets.length<targetCount) out.warning=`제약/제외수로 인해 ${sets.length}세트만 생성되었습니다.`; return out;
  }

  // ---------- overlay helpers ----------
  function overlay(inner, onBackdrop){
    const ov = el('div',{class:'overlay dim'}, el('div',{class:'sheet'}, inner));
    ov.addEventListener('click', (e)=>{ if (e.target===ov){ if(onBackdrop) onBackdrop(); else ov.remove(); } });
    document.body.appendChild(ov);
    return { close(){ ov.remove(); } };
  }

  // ---------- QR overlay (Wins) ----------
  function showQrOverlay(){
    let stopped=false, mediaStream=null, animId=0;
    const txt = el('div',{class:'qr-title'}, 'QR 확인');
    const video = el('video',{class:'qr-video',playsinline:'',autoplay:''});
    const actionBar = el('div',{class:'qr-actions'},
      Btn('사진으로 스캔','ghost', pickImage),
      Btn('닫기','danger', close)
    );
    const centerBtn = el('a',{class:'qr-go','href':'#','target':'_blank',style:{display:'none'}}, '확인하러가기');
    const sheet = el('div',{class:'qr-sheet'},
      txt, el('div',{class:'qr-wrap'}, video, centerBtn), actionBar
    );
    const ov = overlay(sheet, close);

    function close(){
      stopped=true;
      try{ if (animId) cancelAnimationFrame(animId); }catch(e){}
      try{ if(mediaStream){ mediaStream.getTracks().forEach(t=>t.stop()); mediaStream=null; } }catch(e){}
      ov.close();
    }

    async function startLive(){
      const hasBD = 'BarcodeDetector' in window;
      if (!hasBD){
        txt.textContent='QR 라이브 스캔을 지원하지 않는 기기입니다. [사진으로 스캔]을 사용하세요.';
        return;
      }
      const detector = new window.BarcodeDetector({formats:['qr_code']});
      try{
        mediaStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
        video.srcObject = mediaStream;
        await video.play();
      }catch(err){
        txt.textContent = '카메라 권한이 없어 라이브 스캔을 사용할 수 없습니다. [사진으로 스캔]을 사용하세요.';
        return;
      }
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      async function tick(){
        if(stopped) return;
        if(video.readyState>=2){
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          ctx.drawImage(video,0,0,canvas.width,canvas.height);
          try{
            const bitmap = await createImageBitmap(canvas);
            const codes = await detector.detect(bitmap);
            if(codes && codes.length){
              const raw = codes[0].rawValue||'';
              onDetected(raw); return;
            }
          }catch(e){}
        }
        animId = requestAnimationFrame(tick);
      }
      tick();
    }

    async function pickImage(){
      const input = el('input',{type:'file',accept:'image/*'});
      input.addEventListener('change', async ()=>{
        const f = input.files && input.files[0]; if(!f) return;
        const hasBD = 'BarcodeDetector' in window;
        if(!hasBD){ txt.textContent='이 기기에서 사진 스캔을 지원하지 않습니다.'; return; }
        try{
          const detector = new window.BarcodeDetector({formats:['qr_code']});
          const img = await createImageBitmap(f);
          const codes = await detector.detect(img);
          if(codes && codes.length){ onDetected(codes[0].rawValue||''); } else { txt.textContent='QR 이 감지되지 않았습니다.'; }
        }catch(e){ txt.textContent='스캔 중 오류가 발생했습니다.'; }
      });
      input.click();
    }

    function onDetected(url){
      video.classList.add('blur');
      centerBtn.style.display='block';
      centerBtn.setAttribute('href', url);
      centerBtn.textContent = '확인하러가기';
    }

    startLive();
  }

  // ---------- prompt + patch log content ----------
  const PROMPT_SUMMARY = [
    'UI/색상: 배경 파스텔 베이지(#FBF6F0), 카드·버튼 연한 베이지, 텍스트 #2E2A26.',
    '번호칩 색: 1–10 노랑, 11–20 파랑, 21–30 빨강, 31–40 회색, 41–45 초록 (글자 흰색).',
    '홈: 상단 30px 여백, 버튼 1열(당첨/저장/추천/명예의전당/분석), 필요시 하단 업데이트 버튼.',
    '당첨: 최신 박스(번호 6+보너스, 1~3등 금액/인원, QR 확인), 아래 최근 50개 나열.',
    '저장: 추천 생성 시 자동 저장(30세트=5×6). 최신회차 반영 시 자동 정리→과거, 1~3등은 Hall 자동 축적.',
    '추천: 제외수 토글(직전번호는 자동 무시), 제약=밴드 상한(1~39 ≤3, 40~45 ≤2)·G1≤2·겹침≥3 제외·밴드 분포, 30세트 생성, 커버리지 막대(파랑/빨강), 가이드 카드.',
    '분석: 수집 범위/실패사유/엔진 개요/패치 기록 + 프롬프트 버튼(이 텍스트 보기/복사).'
  ].join('\n');
  const PATCH_LOG = [
    {v:'0.110', m:'홈 조건부 “업데이트” 버튼 + 분석 카드 세트(수집/실패/엔진/패치요약).'},
    {v:'0.111', m:'당첨 화면 완성(최신 박스 + 50 리스트 + QR 스캔).'},
    {v:'0.112', m:'저장 자동 정리 + 1~3등 Hall 자동 축적 + 저장 히스토리(최근 3회).'},
    {v:'0.113', m:'추천 UX: 제외수 상태바/가이드 카드/버튼 동일 높이/칩 랩 강화.'},
    {v:'0.114', m:'분석 “프롬프트” 버튼 + 패치 기록 카드.'}
  ];

  // ---------- wins helpers ----------
  function getRoundEntry(data, round){
    const hist = data.history||[];
    for(const it of hist){ if(it.round===round) return it; }
    return null;
  }
  function pickLatest(data){
    const hist = data.history||[];
    if (data.lastRound && data.lastNumbers && data.lastNumbers.length){
      return { round:data.lastRound, numbers:data.lastNumbers, bonus:data.lastBonus, ranks:data.ranks||null };
    }
    if (hist.length===0) return null;
    let best = hist[0];
    for(const it of hist){ if(typeof it.round==='number' && typeof best.round==='number'){ if (it.round>best.round) best=it; } }
    return best;
  }
  function classifyRank(setNums, roundEnt){
    if(!roundEnt || !Array.isArray(roundEnt.numbers)) return {rankNum:0, rankLabel:'미추첨', matches:0, bonus:false};
    const win = new Set(roundEnt.numbers||[]); const bonus = roundEnt.bonus;
    let m=0; for(const n of setNums) if(win.has(n)) m++;
    const b = (bonus!=null) && setNums.includes(bonus);
    let r=0; let label='낙첨';
    if (m===6) { r=1; label='1등'; }
    else if (m===5 && b) { r=2; label='2등'; }
    else if (m===5) { r=3; label='3등'; }
    else if (m===4) { r=4; label='4등'; }
    else if (m===3) { r=5; label='5등'; }
    else { r=0; label='낙첨'; }
    return {rankNum:r, rankLabel:label, matches:m, bonus:b};
  }

  // ---------- FAB ----------
  function attachFab(container){
    const fab = el('button',{class:'fab', onclick:()=>window.scrollTo({top:0, behavior:'smooth'})}, '↑');
    container.appendChild(fab);
    function onScroll(){ if (window.scrollY>320) fab.classList.add('show'); else fab.classList.remove('show'); }
    window.addEventListener('scroll', onScroll, { passive:true });
    onScroll();
  }

  // ---------- auto-settle on load (0.112) ----------
  function settleResultsIfNeeded(){
    const data = Store.read('data'); const lastRound = data.lastRound;
    if (!lastRound) return;
    const ent = getRoundEntry(data, lastRound) || pickLatest(data);
    if (!ent) return;
    Store.patch('saved', cur=>{
      const next = { current:[], history: cur.history || [] };
      for (const item of (cur.current||[])){
        const tR = item.targetRound;
        if (typeof tR==='number' && tR<=lastRound){
          const cls = classifyRank(item.nums||item.numbers||item, ent);
          next.history.unshift({ nums:(item.nums||item.numbers||item), cov:item.cov||coverageStatus(), round:tR, rank:cls.rankLabel, rankNum:cls.rankNum, matches:cls.matches, bonusHit:cls.bonus, when:Date.now() });
          if (cls.rankNum>=1 && cls.rankNum<=3){
            Store.patch('hall', h=>{ (h||=[]).unshift({ nums:(item.nums||item.numbers||item), cov:item.cov||coverageStatus(), rank:cls.rankLabel, when:Date.now() }); return h; });
          }
        } else {
          next.current.push(item);
        }
      }
      cur.current = next.current;
      cur.history = next.history;
      return cur;
    });
  }

  // ---------- components ----------
  function Header(title){
    const t = el('h1',{class:'ttl','data-fit':''}, title);
    const h = el('div',{class:'hdr'},
      el('div',{class:'sp'}),
      el('div',{class:'twrap'}, t),
      el('button',{class:'home',onclick:()=>go('/home'),'aria-label':'홈'},'🏠')
    );
    queueMicrotask(()=>applyFits(h));
    return h;
  }
  function Card(...kids){ return el('div',{class:'card'},...kids); }
  function Btn(text, cls, cb){ const span=el('span',{'data-fit':''},text); const b=el('button',{class:'btn '+(cls||''),onclick:cb},span); queueMicrotask(()=>fitBox(span)); return b; }
  function lottoChip(n, size='sm', hollow=false, extraClass=''){
    const cls = 'chip ' + (size==='xs'?'xs':(size==='lg'?'':'sm')) + (hollow?' hollow':'') + (extraClass?(' '+extraClass):'');
    const c = el('div',{class:cls,'data-n':n});
    c.textContent = n; c.style.setProperty('--chip-fill', Colors.chipFill(n)); return c;
  }

  // ---------- row renderer ----------
  function renderSetRow(entry, ctx){
    const isObj = (entry && typeof entry==='object' && Array.isArray(entry.nums));
    const nums = isObj ? entry.nums : entry;
    const cov = (isObj && entry.cov) ? entry.cov : coverageStatus();
    const row = el('div',{class:'set-row'});
    row.appendChild(el('div',{class:'covbar '+(cov==='ok'?'ok':'bad')}));
    const chipWrap = el('div',{class:'chips'}); nums.forEach(n=> chipWrap.appendChild(lottoChip(n,'sm',false))); row.appendChild(chipWrap);
    if (ctx==='reco'){ const prob = scoreProb1to100(nums); row.appendChild(el('span',{class:'prob'}, `(확률 ${prob}%)`)); }
    if (ctx==='hall'){ row.appendChild(el('span',{class:'rank'}, '['+(entry.rank||'미추첨')+']')); }
    if (ctx==='history'){ row.appendChild(el('span',{class:'badge-rank'}, '['+(entry.rank||'미추첨')+']')); }
    return row;
  }

  // ---------- pages ----------
  function Home(){
    const p = el('div',{class:'page home'},
      Card(el('div',{class:'title'},'로또 Lab Pro'),
           el('div',{class:'desc'},'분석 “프롬프트/패치 기록”(0.114).')),
      Btn('👑 1등 당첨번호','win',()=>go('/wins')),
      Btn('저장번호','blk',()=>go('/saved')),
      Btn('추천','blk',()=>go('/reco')),
      Btn('명예의전당','blk',()=>go('/hall')),
      Btn('분석','blk',()=>go('/analysis')),
      el('div',{class:'ver'},'patch '+VERSION)
    );
    return p;
  }

  function Saved(){
    settleResultsIfNeeded();
    const p = el('div',{class:'page'}, Header('저장번호'));
    const s = Store.read('saved');
    const list = el('div',{class:'list'});

    const cur = s.current||[];
    const curCard = Card(el('div',{class:'block-title'}, `현재 저장 세트 (${cur.length})`));
    if (cur.length===0) curCard.appendChild(el('div',{class:'desc'},'현재 저장된 세트가 없습니다.'));
    else chunk(cur,5).forEach(blk=> blk.forEach(set=> curCard.appendChild(renderSetRow(set,'saved'))));
    list.appendChild(curCard);

    const hist = (s.history||[]).slice();
    if (hist.length){
      const byR = new Map(); for (const it of hist){ const k=it.round==null?'?':it.round; if(!byR.has(k)) byR[k]=[]; (byR[k]||(byR[k]=[])).push(it); }
      const rounds = Object.keys(byR).filter(x=>x!=='?').map(x=>parseInt(x,10)).filter(n=>!isNaN(n)).sort((a,b)=>b-a).slice(0,3);
      rounds.forEach(r=>{
        const arr = byR[r]||[];
        const card = Card(el('div',{class:'block-title'}, `과거 결과 · 제 ${r}회 (${arr.length})`));
        chunk(arr,5).forEach(blk=> blk.forEach(ent=> card.appendChild(renderSetRow(ent,'history'))));
        list.appendChild(card);
      });
    }

    p.appendChild(list);
    attachFab(p);
    return p;
  }

  function Recommend(){
    const p = el('div',{class:'page'}, Header('추천'));
    const prefs = Store.read('prefs'); let exclusions = new Set(prefs.exclusions||[]);
    const data = Store.read('data'); const lastNums = new Set(data.lastNumbers||[]);
    const nextRound = (data.lastRound||0)+1;

    const gridCard = Card(
      el('div',{class:'sub'},'제외수(탭하여 토글) · 직전 번호는 자동 무시'),
      el('div',{class:'ex-state'}, ''),
      el('div',{class:'chip-grid'})
    );
    const exState = $('.ex-state', gridCard);
    function syncExState(){
      const total = 45; const ex = Array.from(exclusions).filter(n=>!lastNums.has(n)).length;
      const freed = Array.from(exclusions).filter(n=>lastNums.has(n)).length;
      const pool = total - ex;
      exState.textContent = `제외수 ${ex}개 · 사용 가능 ${pool}개` + (freed? ` (직전번호 ${freed}개 자동 해제)` : '');
      exState.className = 'ex-state ' + (pool<12 ? 'bad' : (pool<18?'warn':'ok'));
    }
    const grid = $('.chip-grid', gridCard);
    for(let n=1;n<=45;n++){
      const isG1 = lastNums.has(n);
      const hollow = exclusions.has(n) && !isG1;
      const chip=lottoChip(n,'sm',hollow, isG1 ? 'g1' : '');
      chip.addEventListener('click',()=>{
        if (isG1) return;
        if(exclusions.has(n)) exclusions.delete(n); else exclusions.add(n);
        chip.classList.toggle('hollow');
        const p=Store.read('prefs'); p.exclusions=Array.from(exclusions); Store.write('prefs', p);
        syncExState();
      });
      grid.appendChild(chip);
    }
    syncExState();

    const listArea=el('div',{class:'list'});
    const info=el('div',{class:'muted'},'표시 중: 0세트 (목표 30세트)');
    const cov = coverageStatus();
    const covNote = (cov==='ok') ? '데이터 커버리지 양호(≥600) — 파란 막대' : '데이터 커버리지 부족(<600) — 빨간 막대';
    const note=el('div',{class:'muted'},`적용 제약: 밴드 상한(1~39 ≤3, 40~45 ≤2) · 겹침≥3 제외 · G1≤2 · G1은 제외수 무시 · ${covNote}`);

    function showGuide(reason){
      const tips = [
        '제외수를 줄여 사용 가능 숫자를 늘리기',
        '40~45 밴드(최대 2개) 제약 고려해 고른 분포 유지',
        '겹침≥3 제외 규칙 활성화로 과거와 과한 중복 피하기',
        '직전 회차 번호는 세트당 최대 2개(G1≤2)'
      ];
      const card = Card(
        el('div',{class:'title'}, '추천 세트가 충분히 생성되지 않았습니다'),
        el('div',{class:'desc'}, reason || '제약/제외수가 많을 수 있어요.'),
        el('ul',{}, tips.map(t=>el('li',{},t)))
      );
      listArea.appendChild(card);
    }

    const controls=el('div',{class:'row equal'},
      Btn('제외수 리셋','ghost',()=>{
        exclusions=new Set(); $$('.chip-grid .chip',gridCard).forEach(c=>c.classList.remove('hollow'));
        const p=Store.read('prefs'); p.exclusions=[]; Store.write('prefs',p);
        syncExState();
      }),
      Btn('추천(30세트)','primary', async ()=>{
        const ov = el('div',{class:'overlay dim'}, el('div',{class:'ov-inner'}, el('div',{class:'ov-text'},'추천 계산 중...'))); document.body.appendChild(ov);
        await new Promise(r=>setTimeout(r,2000)); ov.remove();

        const {sets,error,warning,autoFreed}=recommendSetsConstrainedV2(30, Array.from(exclusions), data);
        listArea.innerHTML='';
        if(error){
          listArea.appendChild(Card(el('div',{class:'warn'},error)));
          showGuide('사용 가능한 숫자가 6개 미만입니다.');
          info.textContent='표시 중: 0세트 (목표 30세트)';
          return;
        }
        if (autoFreed && autoFreed.length){
          listArea.appendChild(Card(el('div',{class:'desc'}, `직전 번호가 제외수에 포함되어 자동 해제됨: ${autoFreed.join(', ')}`)));
        }
        const blocks=chunk(sets,5);
        blocks.forEach((blk,bi)=>{
          const c=Card(el('div',{class:'block-title'},`추천 세트 ${bi*5+1}~${bi*5+blk.length}`));
          blk.forEach(set=>c.appendChild(renderSetRow(set,'reco')));
          listArea.appendChild(c);
        });
        info.textContent=`표시 중: ${sets.length}세트 (목표 30세트)`;
        if(warning){
          listArea.appendChild(Card(el('div',{class:'warn'},warning)));
          showGuide('현재 제약 조건에서 생성 가능한 세트가 제한되었습니다.');
        }
        const cov = coverageStatus();
        Store.patch('saved',cur=>{ (cur.current||(cur.current=[])).push(...sets.map(ns=>({nums:ns, cov, targetRound:(data.lastRound||0)+1, createdAt:Date.now()}))); return cur; });
      })
    );
    p.appendChild(gridCard); p.appendChild(controls); p.appendChild(info); p.appendChild(note); p.appendChild(listArea); return p;
  }

  function Wins(){
    const p = el('div',{class:'page'}, Header('당첨번호'));
    const data = Store.read('data');
    const latest = pickLatest(data);
    if (!latest){
      p.appendChild(Card(el('div',{class:'desc'},'수집된 당첨번호가 없습니다. 토요일 추첨 이후 자동 수집/업데이트를 기다리거나, 홈의 업데이트 도움말을 참고하세요.')));
      return p;
    }

    function rankText(r){ if(!r) return '—'; const w=(r.winners!=null? r.winners+'명':'?'); const a=(r.amount!=null? r.amount:'?'); return `${a} / ${w}`; }
    function buildTopCard(ent){
      const title = el('div',{class:'title'}, `제 ${ent.round}회 당첨번호`);
      const chipWrap = el('div',{class:'chips wrap'});
      (ent.numbers||[]).forEach(n=>chipWrap.appendChild(lottoChip(n,'sm',false)));
      const bonus = (ent.bonus!=null) ? ent.bonus : (ent.ranks && ent.ranks.bonus) || null;
      if (bonus!=null){ const plus = el('span',{class:'plus'}, '+'); chipWrap.appendChild(plus); chipWrap.appendChild(lottoChip(bonus,'sm',false,'bonus')); }
      const r1 = ent.ranks && ent.ranks[1]; const r2 = ent.ranks && ent.ranks[2]; const r3 = ent.ranks && ent.ranks[3];
      const info = el('div',{class:'wins-info'},
        el('div',{}, `1등: ${rankText(r1)}`),
        el('div',{}, `2등: ${rankText(r2)}`),
        el('div',{}, `3등: ${rankText(r3)}`)
      );
      const qrBtn = Btn('QR 확인','primary', showQrOverlay);
      return Card(title, chipWrap, info, qrBtn);
    }

    p.appendChild(buildTopCard(latest));

    const others = (data.history||[])
      .filter(it => (latest.round!=null && it.round!=null) ? it.round!==latest.round : true)
      .sort((a,b)=> (b.round||0)-(a.round||0))
      .slice(0,50);

    if (others.length){
      const list = el('div',{class:'list'});
      others.forEach(ent=>{
        const title = el('div',{class:'block-title'}, `제 ${ent.round||'?'}회`);
        const chipWrap = el('div',{class:'chips wrap'});
        (ent.numbers||[]).forEach(n=>chipWrap.appendChild(lottoChip(n,'xs',false)));
        if (ent.bonus!=null){ const plus = el('span',{class:'plus'}, '+'); chipWrap.appendChild(plus); chipWrap.appendChild(lottoChip(ent.bonus,'xs',false,'bonus')); }
        const r1 = ent.ranks && ent.ranks[1]; const r2 = ent.ranks && ent.ranks[2]; const r3 = ent.ranks && ent.ranks[3];
        const info = el('div',{class:'wins-info small'},
          el('div',{}, `1등: ${rankText(r1)}`),
          el('div',{}, `2등: ${rankText(r2)}`),
          el('div',{}, `3등: ${rankText(r3)}`)
        );
        list.appendChild(Card(title, chipWrap, info));
      });
      p.appendChild(list);
    } else {
      p.appendChild(Card(el('div',{class:'desc'},'과거 회차 표시가 없습니다.')));
    }
    attachFab(p);
    return p;
  }

  function Hall(){
    const p = el('div',{class:'page'}, Header('명예의전당'));
    const hall = Store.read('hall') || [];
    if (hall.length===0){
      p.appendChild(Card(el('div',{class:'desc'},'아직 기록이 없습니다. 저장번호에서 자동/수동으로 추가됩니다.')));
    } else {
      const list = el('div',{class:'list'});
      const blocks = chunk(hall, 5);
      blocks.forEach((blk, bi)=>{
        const c = Card(el('div',{class:'block-title'}, `명예의전당 ${bi*5+1}~${bi*5+blk.length}`));
        blk.forEach(entry=> c.appendChild(renderSetRow(entry,'hall')));
        list.appendChild(c);
      });
      p.appendChild(list);
    }
    attachFab(p);
    return p;
  }

  function Analysis(){
    const p = el('div',{class:'page'}, Header('분석'));
    const data = Store.read('data');
    const hist = data.history||[];
    const rounds = hist.map(x=>x.round).filter(x=>typeof x==='number').sort((a,b)=>a-b);
    const minR = rounds[0]; const maxR = rounds[rounds.length-1];
    const cov = coverageStatus();

    const card1 = Card(
      el('div',{class:'title'}, '수집 범위/커버리지'),
      el('div',{class:'desc'}, rounds.length ? `제 ${minR} ~ ${maxR}회 · 총 ${rounds.length}건 · 상태: ${cov==='ok'?'양호(≥600)':'부족(<600)'}` : '데이터 없음')
    );
    const card2 = Card(
      el('div',{class:'title'}, '최근 실패/지연 사유'),
      el('div',{class:'desc'}, data.failReason || '—')
    );
    const card3 = Card(
      el('div',{class:'title'}, '추천 엔진 개요'),
      el('ul',{}, [
        el('li',{}, '밴드 상한: 1~39 각 밴드 최대 3개, 40~45 최대 2개'),
        el('li',{}, '직전 회차 번호(G1) 세트당 최대 2개'),
        el('li',{}, '과거와 겹침≥3 세트 제외(1회차~최근까지)'),
        el('li',{}, '직전 번호는 제외수 설정시 자동 해제(무시)'),
        el('li',{}, '세트당 확률 표시는 1~100 점수형')
      ])
    );
    const card4 = Card(
      el('div',{class:'title'}, '패치 기록'),
      el('ul',{}, PATCH_LOG.map(it=> el('li',{}, `${it.v} — ${it.m}`)))
    );
    const promptBtn = Btn('프롬프트','primary', ()=>{
      const pre = el('pre',{class:'prompt-pre'}, PROMPT_SUMMARY);
      const copy = Btn('복사','blk', async ()=>{
        try{ await navigator.clipboard.writeText(PROMPT_SUMMARY); copy.textContent='복사됨'; setTimeout(()=>copy.textContent='복사', 1500);}catch(e){ copy.textContent='복사 실패'; setTimeout(()=>copy.textContent='복사', 1500); }
      });
      const close = Btn('닫기','danger', ()=>ov.close());
      const ov = overlay(el('div',{class:'prompt-sheet'}, el('div',{class:'title'},'프롬프트 요약'), pre, el('div',{class:'row'}, copy, close)));
    });

    p.appendChild(card1); p.appendChild(card2); p.appendChild(card3); p.appendChild(card4); p.appendChild(promptBtn);
    attachFab(p);
    return p;
  }

  // ---------- mount/router ----------
  const ROOT=document.getElementById('app');
  const PAGES={'/home':Home,'/saved':Saved,'/reco':Recommend,'/wins':Wins,'/hall':Hall,'/analysis':Analysis};
  function render(){ let path=location.hash.replace('#','')||'/home'; if(!PAGES[path]) path='/home'; ROOT.replaceChildren(PAGES[path]()); applyFits(ROOT); }
  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', ()=>{ if(!location.hash) location.replace('#/home'); settleResultsIfNeeded(); render(); console.log('VERSION', VERSION); });
})();
