/* Lotto Lab Pro - 0.107
 * Scope: 커버리지 경고 + 확률표시 + 저장 메타
 * - 커버리지: Store.data.history 길이 < 600 이면 '부족' → 추천/저장 세트 왼쪽에 빨간 막대, 충분하면 파란 막대
 * - 추천행 구성: [막대] + [번호칩×6] + [(확률 XX%)]
 * - 저장 구조: saved.current에 { nums:[...6], cov:'ok'|'bad' }로 저장(기존 배열과 혼용 지원)
 * - 기존 제약 유지: 밴드 상한, 겹침≥3 제외, G1≤2, 직전번호 제외 무시(0.106)
 */
(function(){
  'use strict';
  const VERSION = 'patch_0.107';
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
      data:{ lastRound:null, lastNumbers:[], history:[] },
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
  function lottoChip(n, small=true, hollow=false, extraClass=''){
    const c = el('div',{class:'chip'+(small?' small':'' )+(hollow?' hollow':'' )+(extraClass?(' '+extraClass):''),'data-n':n});
    c.textContent = n; c.style.setProperty('--chip-fill', Colors.chipFill(n)); return c;
  }

  // ---------- coverage / probability ----------
  function coverageStatus(){
    const data = Store.read('data'); const n = (data.history||[]).length;
    return n>=600 ? 'ok' : 'bad';
  }
  function scoreProb1to100(nums){
    // deterministic pseudo score [1..100]
    let h = 7;
    for(const n of nums) h = (h*131 + n*17) % 1000;
    return (h % 100) + 1;
  }

  // ---------- recommend constraints (from 0.106) ----------
  const BAND_CAPS = { a:[1,9,3], b:[10,19,3], c:[20,29,3], d:[30,39,3], e:[40,45,2] };
  function bandKey(n){ if(n<=9) return 'a'; if(n<=19) return 'b'; if(n<=29) return 'c'; if(n<=39) return 'd'; return 'e'; }
  function validateBandCaps(set){
    const cnt = {a:0,b:0,c:0,d:0,e:0};
    for(const n of set){ cnt[bandKey(n)]++; }
    return (cnt.a<=BAND_CAPS.a[2] && cnt.b<=BAND_CAPS.b[2] && cnt.c<=BAND_CAPS.c[2] && cnt.d<=BAND_CAPS.d[2] && cnt.e<=BAND_CAPS.e[2]);
  }
  function recommendSetsConstrainedV2(targetCount, userExclusions, data){
    const last = new Set((data && data.lastNumbers)||[]);
    // 1) 제외수에서 직전 번호 자동 제거
    const effectiveEx = new Set(userExclusions||[]);
    let autoFreed = [];
    for (const n of last){ if (effectiveEx.has(n)){ effectiveEx.delete(n); autoFreed.push(n); } }

    // 2) 풀 구성
    const pool = []; for(let i=1;i<=45;i++) if(!effectiveEx.has(i)) pool.push(i);
    if (pool.length < 6) {
      return { error:`제외수가 너무 많습니다. 남은 숫자 ${pool.length}개로는 6개 조합 불가. 제외수를 줄여주세요.` };
    }

    const history = (data && data.history) || [];
    const ENABLE_G1_LIMIT = last.size>0;           // 직전 번호 편중 제한 ≤2
    const ENABLE_OVERLAP_RULE = history.length>0;  // 전체 이력과 3개 이상 겹치면 제외

    function one(){
      const tmp = pool.slice();
      const out = [];
      for(let k=0;k<6;k++){ const idx=(Math.random()*tmp.length)|0; out.push(tmp.splice(idx,1)[0]); }
      out.sort((a,b)=>a-b); return out;
    }
    function passesConstraints(set){
      if (!validateBandCaps(set)) return false;
      if (ENABLE_G1_LIMIT){
        let g1=0; for(const n of set) if(last.has(n)) g1++;
        if (g1>2) return false;
      }
      if (ENABLE_OVERLAP_RULE){
        for (const h of history){
          const hv = new Set(h.numbers||[]);
          let inter=0; for(const n of set) if(hv.has(n)) inter++;
          if (inter>=3) return false;
        }
      }
      return true;
    }

    const uniq=new Set(); const sets=[];
    let guard=0, maxTry=targetCount*200;
    while(sets.length<targetCount && guard<maxTry){
      const s=one(); const key=s.join('-');
      if(!uniq.has(key) && passesConstraints(s)){ uniq.add(key); sets.push(s); }
      guard++;
    }

    const out = { sets, autoFreed: autoFreed.sort((a,b)=>a-b) };
    if (sets.length<targetCount){
      out.warning = `제약/제외수로 인해 ${sets.length}세트만 생성되었습니다. 제외수를 일부 줄이거나 제약을 완화하세요.`;
    }
    return out;
  }

  function showLoading(text='계산 중...'){
    const ov = el('div',{class:'overlay'}, el('div',{class:'spinner'}), el('div',{class:'ov-text'}, text));
    document.body.appendChild(ov); return { close(){ ov.remove(); } };
  }

  // ---------- row renderer ----------
  function renderSetRow(entry, ctx){
    const isObj = (entry && typeof entry==='object' && Array.isArray(entry.nums));
    const nums = isObj ? entry.nums : entry;
    const cov = (isObj && entry.cov) ? entry.cov : coverageStatus();
    const row = el('div',{class:'set-row'});
    // left bar
    row.appendChild(el('div',{class:'covbar '+(cov==='ok'?'ok':'bad')}));
    // chips
    const chipWrap = el('div',{class:'chips'});
    nums.forEach(n=> chipWrap.appendChild(lottoChip(n,true,false)));
    row.appendChild(chipWrap);
    if (ctx==='reco'){
      const prob = scoreProb1to100(nums);
      row.appendChild(el('span',{class:'prob'}, `(확률 ${prob}%)`));
    }
    return row;
  }

  // ---------- pages ----------
  function Home(){
    const p = el('div',{class:'page'},
      Header('홈'),
      Card(el('div',{class:'title'},'로또 Lab Pro'),
          el('div',{class:'desc'},'커버리지 경고/확률/저장메타(0.107) + 제약(0.106) 유지.')),
      Btn('당첨번호','blk',()=>go('/wins')),
      Btn('저장번호','blk',()=>go('/saved')),
      Btn('추천','blk',()=>go('/reco')),
      Btn('명예의전당','blk',()=>go('/hall')),
      Btn('분석','blk',()=>go('/analysis')),
      el('div',{class:'ver'},'patch '+VERSION)
    );
    return p;
  }

  function Saved(){
    const p = el('div',{class:'page'}, Header('저장번호'));
    const s = Store.read('saved'); const list = el('div',{class:'list'});
    const toNums = (x)=> Array.isArray(x) ? x : (x && x.nums ? x.nums : []);
    if(!s.current || s.current.length===0){
      list.appendChild(Card(el('div',{class:'desc'},'저장된 세트가 없습니다. 추천에서 생성하면 자동 저장됩니다.')));
    } else {
      const blocks = chunk(s.current,5);
      blocks.forEach((blk,bi)=>{
        const c = Card(el('div',{class:'block-title'}, `현재 저장 세트 ${bi*5+1}~${bi*5+blk.length}`));
        blk.forEach(set=> c.appendChild(renderSetRow(set,'saved')));
        list.appendChild(c);
      });
    }
    const tools = Card(el('div',{class:'row equal'},
      Btn('샘플 1세트 저장','ghost',()=>{
        Store.patch('saved',cur=>{ (cur.current||(cur.current=[])).push({nums:[1,2,3,4,5,6], cov:coverageStatus()}); return cur; });
        go('/saved');
      }),
      Btn('전부 삭제','danger',()=>{
        if(!confirm('저장된 모든 번호를 삭제할까요?')) return;
        Store.patch('saved',cur=>{ cur.current=[]; return cur; });
        go('/saved');
      })
    ));
    p.appendChild(tools); p.appendChild(list); return p;
  }

  function Recommend(){
    const p = el('div',{class:'page'}, Header('추천'));
    const prefs = Store.read('prefs'); let exclusions = new Set(prefs.exclusions||[]);
    const data = Store.read('data');
    const lastNums = new Set(data.lastNumbers||[]);

    const gridCard = Card(el('div',{class:'sub'},'제외수(탭하여 토글) · 직전 번호는 자동 무시'),
                          el('div',{class:'chip-grid'}));
    const grid = $('.chip-grid', gridCard);
    for(let n=1;n<=45;n++){
      const isG1 = lastNums.has(n);
      const hollow = exclusions.has(n) && !isG1;
      const chip=lottoChip(n,true,hollow, isG1 ? 'g1' : '');
      chip.addEventListener('click',()=>{
        if (isG1) return; // 직전 번호는 제외 불가
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
        const ov=showLoading('추천 계산 중...'); await new Promise(r=>setTimeout(r,2000)); ov.close();
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
        // 저장(메타 포함)
        const cov = coverageStatus();
        Store.patch('saved',cur=>{ (cur.current||(cur.current=[])).push(...sets.map(ns=>({nums:ns, cov}))); return cur; });
      })
    );
    p.appendChild(gridCard); p.appendChild(controls); p.appendChild(info); p.appendChild(note); p.appendChild(listArea); return p;
  }

  function Wins(){ return el('div',{class:'page'}, Header('당첨번호'), Card(el('div',{class:'desc'},'다음 단계에서 연동됩니다.'))); }
  function Hall(){ return el('div',{class:'page'}, Header('명예의전당'), Card(el('div',{class:'desc'},'아직 기록이 없습니다.'))); }
  function Analysis(){ return el('div',{class:'page'}, Header('분석'),
    Card(el('div',{class:'title'},'커버리지/확률/메타(0.107)'),
         el('div',{class:'desc'},'커버리지<600일 때 붉은 막대, ≥600일 때 파란 막대 표시. 추천행에 (확률 1~100%) 가이드 표시. 저장은 {nums,cov} 메타로 누적.')),
    Card(el('div',{class:'desc'},'버전: '+VERSION))
  ); }

  // ---------- mount/router ----------
  const ROOT=document.getElementById('app');
  const PAGES={'/home':Home,'/saved':Saved,'/reco':Recommend,'/wins':Wins,'/hall':Hall,'/analysis':Analysis};
  function render(){ let path=location.hash.replace('#','')||'/home'; if(!PAGES[path]) path='/home'; ROOT.replaceChildren(PAGES[path]()); applyFits(ROOT); }
  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', ()=>{ if(!location.hash) location.replace('#/home'); render(); console.log('VERSION', VERSION); });
})();
