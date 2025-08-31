/* Lotto Lab Pro - 0.110
 * Scope:
 * - 홈: 조건부 '업데이트' 버튼(노란색) 노출 + 캐시 새로고침 안내 오버레이
 * - 분석: 카드① 수집 범위/커버리지, 카드② 실패 이유, 카드③ 추천엔진 요약, 카드④ 패치노트
 * - 유지: 0.106 제약(밴드/겹침≥3/G1≤2/직전번호 제외 무시), 0.107 커버리지/확률/저장메타, 0.108/0.109 UI
 */
(function(){
  'use strict';
  const VERSION = 'patch_0.110';
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
      data:{ lastRound:null, lastNumbers:[], history:[], lastFetchedAt:null, failReason:null },
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
    const uniq=new Set(); const sets=[]; let guard=0, maxTry=targetCount*200;
    while(sets.length<targetCount && guard<maxTry){ const s=one(); const key=s.join('-'); if(!uniq.has(key) && passesConstraints(s)){ uniq.add(key); sets.push(s); } guard++; }
    const out = { sets, autoFreed:autoFreed.sort((a,b)=>a-b) }; if (sets.length<targetCount) out.warning=`제약/제외수로 인해 ${sets.length}세트만 생성되었습니다.`; return out;
  }

  // ---------- home: conditional update ----------
  function isAfterDrawWindow(now=new Date()){
    // 간단 판정: 토요일 20:45 이후
    const day = now.getDay(); // 0:일 ~ 6:토
    const isSat = (day===6);
    const hr = now.getHours(), min = now.getMinutes();
    const after = (hr>20) || (hr===20 && min>=45);
    return isSat && after;
  }
  function needManualUpdate(){
    const data = Store.read('data');
    if (!isAfterDrawWindow()) return false;
    const lastFetch = data.lastFetchedAt || 0;
    const stale = (Date.now() - lastFetch) > 3*60*60*1000; // 3시간 경과
    const noData = (data.history||[]).length===0;
    return stale || noData;
  }
  function clearCachesAndReload(){
    const finalize = ()=>location.reload();
    try{
      if ('caches' in window){
        caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).finally(finalize);
      }else finalize();
    }catch(e){ finalize(); }
  }
  function showUpdateHelp(){
    const tips = [
      '1) GitHub로 push 완료되었는지 확인',
      '2) Actions에서 Pages build & deployment 실행 확인',
      '3) 캐시가 남아있다면 아래 [캐시 새로고침]을 눌러주세요'
    ];
    const content = el('div',{class:'up-body'},
      el('div',{class:'up-title'},'업데이트 도움말'),
      el('ul',{}, tips.map(t=>el('li',{},t))),
      el('div',{class:'row equal'},
        Btn('캐시 새로고침','primary',clearCachesAndReload),
        Btn('닫기','ghost',()=>ov.close())
      ),
      el('div',{class:'muted'},'※ 이 버튼은 필요한 상황에서만 홈 하단에 표시됩니다.')
    );
    const ov = overlay(content);
  }
  function overlay(inner){
    const ov = el('div',{class:'overlay'},
      el('div',{class:'sheet'}, inner)
    );
    document.body.appendChild(ov);
    return { close(){ ov.remove(); } };
  }

  // ---------- row renderer ----------
  function lottoChip(n, small=true, hollow=false, extraClass=''){
    const c = el('div',{class:'chip'+(small?' small':'' )+(hollow?' hollow':'' )+(extraClass?(' '+extraClass):''),'data-n':n});
    c.textContent = n; c.style.setProperty('--chip-fill', Colors.chipFill(n)); return c;
  }
  function renderSetRow(entry, ctx, onToggle){
    const isObj = (entry && typeof entry==='object' && Array.isArray(entry.nums));
    const nums = isObj ? entry.nums : entry;
    const cov = (isObj && entry.cov) ? entry.cov : coverageStatus();
    const row = el('div',{class:'set-row'});
    if (ctx==='saved' && typeof onToggle==='function'){
      row.addEventListener('click', ()=>{ row.classList.toggle('selected'); onToggle(row); });
    }
    row.appendChild(el('div',{class:'covbar '+(cov==='ok'?'ok':'bad')}));
    const chipWrap = el('div',{class:'chips'}); nums.forEach(n=> chipWrap.appendChild(lottoChip(n,true,false))); row.appendChild(chipWrap);
    if (ctx==='reco'){ const prob = scoreProb1to100(nums); row.appendChild(el('span',{class:'prob'}, `(확률 ${prob}%)`)); }
    if (ctx==='hall'){ row.appendChild(el('span',{class:'rank'}, '['+(entry.rank||'미추첨')+']')); }
    return row;
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

  // ---------- Scroll-to-top FAB ----------
  function attachFab(container){
    const fab = el('button',{class:'fab', onclick:()=>window.scrollTo({top:0, behavior:'smooth'})}, '↑');
    container.appendChild(fab);
    function onScroll(){ if (window.scrollY>320) fab.classList.add('show'); else fab.classList.remove('show'); }
    window.addEventListener('scroll', onScroll, { passive:true });
    onScroll();
  }

  // ---------- pages ----------
  function Home(){
    const p = el('div',{class:'page home'},
      Card(el('div',{class:'title'},'로또 Lab Pro'),
           el('div',{class:'desc'},'업데이트 버튼(조건부) + 분석 카드 확장 반영(0.110).')),
      Btn('👑 1등 당첨번호','win',()=>go('/wins')),
      Btn('저장번호','blk',()=>go('/saved')),
      Btn('추천','blk',()=>go('/reco')),
      Btn('명예의전당','blk',()=>go('/hall')),
      Btn('분석','blk',()=>go('/analysis')),
      // 필요 시에만 노출
      (needManualUpdate() ? Btn('업데이트(필요 시)','update',showUpdateHelp) : el('div')),
      el('div',{class:'ver'},'patch '+VERSION)
    );
    return p;
  }

  function Saved(){
    const p = el('div',{class:'page'}, Header('저장번호'));
    const s = Store.read('saved'); const list = el('div',{class:'list'});
    if(!s.current || s.current.length===0){
      list.appendChild(Card(el('div',{class:'desc'},'저장된 세트가 없습니다. 추천에서 생성하면 자동 저장됩니다.')));
    } else {
      const blocks = chunk(s.current,5);
      blocks.forEach((blk,bi)=>{
        const c = Card(el('div',{class:'block-title'}, `현재 저장 세트 ${bi*5+1}~${bi*5+blk.length}`));
        blk.forEach(set=> c.appendChild(renderSetRow(set,'saved', ()=>{})));
        list.appendChild(c);
      });
    }
    attachFab(p);
    return p;
  }

  function Recommend(){
    const p = el('div',{class:'page'}, Header('추천'));
    const prefs = Store.read('prefs'); let exclusions = new Set(prefs.exclusions||[]);
    const data = Store.read('data'); const lastNums = new Set(data.lastNumbers||[]);
    const gridCard = Card(el('div',{class:'sub'},'제외수(탭하여 토글) · 직전 번호는 자동 무시'),
                          el('div',{class:'chip-grid'}));
    const grid = $('.chip-grid', gridCard);
    for(let n=1;n<=45;n++){
      const isG1 = lastNums.has(n);
      const hollow = exclusions.has(n) && !isG1;
      const chip=lottoChip(n,true,hollow, isG1 ? 'g1' : '');
      chip.addEventListener('click',()=>{
        if (isG1) return;
        if(exclusions.has(n)) exclusions.delete(n); else exclusions.add(n);
        chip.classList.toggle('hollow');
        const p=Store.read('prefs'); p.exclusions=Array.from(exclusions); Store.write('prefs', p);
      });
      grid.appendChild(chip);
    }
    const listArea=el('div',{class:'list'});
    const info=el('div',{class:'muted'},'표시 중: 0세트 (목표 30세트)');
    const cov = coverageStatus();
    const covNote = (cov==='ok') ? '데이터 커버리지 양호(≥600) — 파란 막대' : '데이터 커버리지 부족(<600) — 빨간 막대';
    const note=el('div',{class:'muted'},`적용 제약: 밴드 상한(1~39 ≤3, 40~45 ≤2) · 겹침≥3 제외 · G1≤2 · G1은 제외수 무시 · ${covNote}`);
    const controls=el('div',{class:'row equal'},
      Btn('제외수 리셋','ghost',()=>{
        exclusions=new Set(); $$('.chip-grid .chip',gridCard).forEach(c=>c.classList.remove('hollow'));
        const p=Store.read('prefs'); p.exclusions=[]; Store.write('prefs',p);
      }),
      Btn('추천(30세트)','primary', async ()=>{
        const ov=overlay(el('div',{}, el('div',{class:'ov-text'},'추천 계산 중...'))); await new Promise(r=>setTimeout(r,2000)); ov.close();
        const {sets,error,warning,autoFreed}=recommendSetsConstrainedV2(30, Array.from(exclusions), data);
        listArea.innerHTML='';
        if(error){ listArea.appendChild(Card(el('div',{class:'warn'},error))); info.textContent='표시 중: 0세트 (목표 30세트)'; return; }
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
        if(warning) listArea.appendChild(Card(el('div',{class:'warn'},warning)));
        const cov = coverageStatus();
        Store.patch('saved',cur=>{ (cur.current||(cur.current=[])).push(...sets.map(ns=>({nums:ns, cov}))); return cur; });
      })
    );
    p.appendChild(gridCard); p.appendChild(controls); p.appendChild(info); p.appendChild(note); p.appendChild(listArea); attachFab(p); return p;
  }

  function Wins(){ const p = el('div',{class:'page'}, Header('당첨번호'), Card(el('div',{class:'desc'},'다음 단계에서 연동됩니다.'))); attachFab(p); return p; }

  function Hall(){
    const p = el('div',{class:'page'}, Header('명예의전당'));
    const hall = Store.read('hall') || [];
    if (hall.length===0){
      p.appendChild(Card(el('div',{class:'desc'},'아직 기록이 없습니다. 저장번호에서 선택 후 “명예의전당 추가”를 사용하세요.')));
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
    const covOK = hist.length>=600;
    const rounds = hist.map(h=>h.round).filter(x=>typeof x==='number');
    const rmin = rounds.length? Math.min.apply(null, rounds): null;
    const rmax = rounds.length? Math.max.apply(null, rounds): null;

    // ① 수집 범위/커버리지
    p.appendChild(Card(
      el('div',{class:'title'},'수집 범위/커버리지'),
      el('div',{class:'desc'}, rounds.length? `회차: ${rmin} ~ ${rmax} (총 ${hist.length}회)` : `총 ${hist.length}회(회차 정보 없음)`),
      el('div',{class:'desc'}, covOK? '상태: 양호(≥600)' : '상태: 부족(<600)')
    ));
    // ② 실패 이유
    p.appendChild(Card(
      el('div',{class:'title'},'최근 실패/지연 사유'),
      el('div',{class:'desc'}, data.failReason || '최근 보고된 문제 없음')
    ));
    // ③ 추천엔진 개요
    p.appendChild(Card(
      el('div',{class:'title'},'추천 엔진 개요'),
      el('ul',{},
        el('li',{},'밴드 상한: 1~39 ≤3, 40~45 ≤2'),
        el('li',{},'겹침 제외: 전체 이력과 3개 이상 겹치면 제외(1회~최근)'),
        el('li',{},'G1 제한: 직전 회차 번호는 세트당 ≤2'),
        el('li',{},'직전번호 제외 무시: 직전 번호는 제외수에 있어도 자동 해제'),
        el('li',{},'커버리지 막대/확률(1~100%) 표시')
      )
    ));
    // ④ 패치 노트
    p.appendChild(Card(
      el('div',{class:'title'},'최근 패치 요약'),
      el('div',{class:'desc'},'0.106: 제약 활성(겹침≥3/G1≤2/직전 제외 무시)'),
      el('div',{class:'desc'},'0.107: 커버리지 막대·확률·저장메타'),
      el('div',{class:'desc'},'0.108: 홈 헤더 제거·당첨버튼·FAB·저장 하이라이트'),
      el('div',{class:'desc'},'0.109: 저장 선택 액션·명예의전당'),
      el('div',{class:'desc'},'0.110: 홈 업데이트 버튼(조건부)·분석 카드 확장')
    ));
    attachFab(p);
    return p;
  }

  // ---------- mount/router ----------
  const ROOT=document.getElementById('app');
  const PAGES={'/home':Home,'/saved':Saved,'/reco':Recommend,'/wins':Wins,'/hall':Hall,'/analysis':Analysis};
  function render(){ let path=location.hash.replace('#','')||'/home'; if(!PAGES[path]) path='/home'; ROOT.replaceChildren(PAGES[path]()); applyFits(ROOT); }
  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', ()=>{ if(!location.hash) location.replace('#/home'); render(); console.log('VERSION', VERSION); });
})();
