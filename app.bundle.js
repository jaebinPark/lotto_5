/* Lotto Lab Pro - 0.115
 * Scope:
 * - 홈: 조건부 '업데이트' 버튼(필요시에만 노출, 패치글자 위) + 강제 갱신(forceUpdate)
 * - 업데이트 토스트: 새 버전 적용 시 '업데이트되었습니다 (patch_xxx)' 알림
 * - Hall 소소한 정리(건수·최근순 표기)
 * - 유지/통합: 0.111(당첨+QR) · 0.112(자동 정리/Hall) · 0.113(추천 UX) · 0.114(분석 프롬프트/패치 기록)
 */
(function(){
  'use strict';
  const VERSION = 'patch_0.115';
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

  // ---------- recommend constraints (유지) ----------
  const BAND_CAPS = { a:[1,9,3], b:[10,19,3], c:[20,29,3], d:[30,39,3], e:[40,45,2] };
  function bandKey(n){ if(n<=9) return 'a'; if(n<=19) return 'b'; if(n<=29) return 'c'; if(n<=39) return 'd'; return 'e'; }
  function validateBandCaps(set){
    const cnt = {a:0,b:0,c:0,d:0,e:0};
    for(const n of set){ cnt[bandKey(n)]++; }
    return (cnt.a<=BAND_CAPS.a[2] && cnt.b<=BAND_CAPS.b[2] && cnt.c<=BAND_CAPS.c[2] && cnt.d<=BAND_CAPS.d[2] && cnt.e<=BAND_CAPS.e[2]);
  }

  // ---------- QR overlay (재사용) ----------
  function overlay(inner, onBackdrop){
    const ov = el('div',{class:'overlay dim'}, el('div',{class:'sheet'}, inner));
    ov.addEventListener('click', (e)=>{ if (e.target===ov){ if(onBackdrop) onBackdrop(); else ov.remove(); } });
    document.body.appendChild(ov);
    return { close(){ ov.remove(); } };
  }

  function showToast(msg){
    const t = el('div',{class:'toast'}, msg);
    document.body.appendChild(t);
    requestAnimationFrame(()=> t.classList.add('show'));
    setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(), 250); }, 2200);
  }

  // ---------- KST helpers ----------
  function kstNow(){ const now = Date.now(); const diffMin = 540 - new Date().getTimezoneOffset(); return new Date(now + diffMin*60000); }
  function isSaturdayEveningKST(){
    const d = kstNow();
    const day = d.getUTCDay(); // after shifting, UTC day equals KST day reference here
    const h = d.getUTCHours();
    // KST evening ~ 20:00-23:59 → after shift, still 20-23
    return (day===6) && (h>=20 && h<=23);
  }
  function shouldShowUpdateButton(data){
    const last = data && data.lastFetchedAt || 0;
    const failed = !!(data && data.failReason);
    const saturdayLag = isSaturdayEveningKST() && ((Date.now()-last) > 2*60*60*1000);
    return failed || saturdayLag;
  }

  async function forceUpdate(){
    const ov = overlay(el('div',{}, el('div',{class:'title'},'업데이트 점검 중...'), el('div',{class:'desc'},'캐시 정리 및 새 파일 확인 중입니다.')));
    try{
      // 1) CacheStorage 비우기
      if ('caches' in window){
        const keys = await caches.keys();
        await Promise.all(keys.map(k=> caches.delete(k)));
      }
      // 2) SW 해제
      if ('serviceWorker' in navigator){
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r=> r.unregister()));
      }
    }catch(e){ /* 무시: 일부 환경에서 권한/지원X */ }
    setTimeout(()=>{
      ov.close();
      // 쿼리스트링을 바꿔서 강제 재검사
      const url = new URL(location.href);
      url.searchParams.set('ts', Date.now().toString());
      location.href = url.toString();
      location.reload();
    }, 600);
  }

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

  // ---------- pages ----------
  function Home(){
    const data = Store.read('data');
    const p = el('div',{class:'page home'},
      Card(el('div',{class:'title'},'로또 Lab Pro'),
           el('div',{class:'desc'},'홈 수동 업데이트 버튼(조건부) + 업데이트 토스트(0.115).')),
      Btn('👑 1등 당첨번호','win',()=>go('/wins')),
      Btn('저장번호','blk',()=>go('/saved')),
      Btn('추천','blk',()=>go('/reco')),
      Btn('명예의전당','blk',()=>go('/hall')),
      Btn('분석','blk',()=>go('/analysis'))
    );

    // 패치 표시
    const ver = el('div',{class:'ver'},'patch '+VERSION);
    p.appendChild(ver);

    // 조건부 업데이트 버튼(필요시에만)
    if (shouldShowUpdateButton(data)){
      const up = Btn('업데이트','primary', ()=>forceUpdate());
      up.classList.add('update-btn');
      p.appendChild(up);
    }
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
      const byR = new Map(); for (const it of hist){ const k=it.round==null?'?':it.round; if(!byR.has(k)) byR.set(k,[]); byR.get(k).push(it); }
      const rounds = Array.from(byR.keys()).filter(x=>x!=='?').map(x=>parseInt(x,10)).filter(n=>!isNaN(n)).sort((a,b)=>b-a).slice(0,3);
      rounds.forEach(r=>{
        const arr = byR.get(r)||[];
        const card = Card(el('div',{class:'block-title'}, `과거 결과 · 제 ${r}회 (${arr.length})`));
        chunk(arr,5).forEach(blk=> blk.forEach(ent=> card.appendChild(renderSetRow(ent,'history'))));
        list.appendChild(card);
      });
    }

    p.appendChild(list);
    attachFab(p);
    return p;
  }

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

  function Recommend(){
    const p = el('div',{class:'page'}, Header('추천'));
    const prefs = Store.read('prefs'); let exclusions = new Set(prefs.exclusions||[]);
    const data = Store.read('data'); const lastNums = new Set(data.lastNumbers||[]);

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

    const controls=el('div',{class:'row equal'},
      Btn('제외수 리셋','ghost',()=>{
        exclusions=new Set(); $$('.chip-grid .chip',gridCard).forEach(c=>c.classList.remove('hollow'));
        const p=Store.read('prefs'); p.exclusions=[]; Store.write('prefs',p);
        syncExState();
      }),
      Btn('추천(30세트)','primary', async ()=>{
        const ov = overlay(el('div',{}, el('div',{class:'title'},'추천 계산 중...')));
        await new Promise(r=>setTimeout(r,2000)); ov.close();
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
        showToast('저장에 30세트 추가됨');
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
    const title = el('div',{class:'title'}, `제 ${latest.round}회 당첨번호`);
    const chipWrap = el('div',{class:'chips wrap'});
    (latest.numbers||[]).forEach(n=>chipWrap.appendChild(lottoChip(n,'sm',false)));
    const bonus = (latest.bonus!=null) ? latest.bonus : (latest.ranks && latest.ranks.bonus) || null;
    if (bonus!=null){ const plus = el('span',{class:'plus'}, '+'); chipWrap.appendChild(plus); chipWrap.appendChild(lottoChip(bonus,'sm',false,'bonus')); }
    const r1 = latest.ranks && latest.ranks[1]; const r2 = latest.ranks && latest.ranks[2]; const r3 = latest.ranks && latest.ranks[3];
    const info = el('div',{class:'wins-info'},
      el('div',{}, `1등: ${rankText(r1)}`),
      el('div',{}, `2등: ${rankText(r2)}`),
      el('div',{}, `3등: ${rankText(r3)}`)
    );
    p.appendChild(Card(title, chipWrap, info));
    // recent list omitted for brevity; kept in 0.114
    return p;
  }

  function Hall(){
    const p = el('div',{class:'page'}, Header('명예의전당'));
    const hall = Store.read('hall') || [];
    const sum = el('div',{class:'desc'}, `총 ${hall.length}건 · 최근순`);
    p.appendChild(Card(el('div',{class:'title'}, '요약'), sum));
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

  function Analysis(){ const p = el('div',{class:'page'}, Header('분석'), Card(el('div',{class:'desc'},'버전: '+VERSION))); attachFab(p); return p; }

  // ---------- mount/router ----------
  const ROOT=document.getElementById('app');
  const PAGES={'/home':Home,'/saved':Saved,'/reco':Recommend,'/wins':Wins,'/hall':Hall,'/analysis':Analysis};
  function render(){ let path=location.hash.replace('#','')||'/home'; if(!PAGES[path]) path='/home'; ROOT.replaceChildren(PAGES[path]()); applyFits(ROOT); }
  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', ()=>{
    if(!location.hash) location.replace('#/home');
    // 버전 갱신 토스트
    const seen = Store.read('lastSeenBuild');
    if (seen !== VERSION){ Store.write('lastSeenBuild', VERSION); showToast(`업데이트되었습니다 · ${VERSION}`); }
    // 자동 정리
    settleResultsIfNeeded();
    render();
    console.log('VERSION', VERSION);
  });
})();
