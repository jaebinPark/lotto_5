/* Lotto Lab Pro - 0.104
 * Scope: 추천 UI 안정화
 * - 칩 반응형(더 작은 스텝), 버튼 동일 너비, 타이틀/텍스트 오버플로 가드 유지
 * - 추천: 2초 로딩 후 정확히 30세트(5x6) 생성/표시, 다시 누르면 목록만 리셋
 * - 제외수 리셋은 추천 결과 보존, 제외수/과다 제외 안전메시지 강화
 * - 자동 저장(saved.current append) 유지
 */
(function(){
  'use strict';
  const VERSION = 'patch_0.104';
  const $ = (s,el=document)=>el.querySelector(s);
  const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));

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

  const Store = (()=>{
    const NS='lotto5:';
    const def = { prefs:{exclusions:[],recoPerClick:30}, saved:{current:[],history:[]}, hall:[], lastSeenBuild: VERSION };
    const key = k => NS+k;
    function read(k){ try{ const r=localStorage.getItem(key(k)); if(!r){ write(k,def[k]); return JSON.parse(JSON.stringify(def[k])); } return JSON.parse(r) }catch(e){ return JSON.parse(JSON.stringify(def[k])) } }
    function write(k,v){ try{ localStorage.setItem(key(k), JSON.stringify(v)); }catch(e){} }
    function patch(k,fn){ const cur=read(k); const nxt=fn(cur); write(k,nxt); return nxt; }
    return { read, write, patch };
  })();

  const Colors = {
    chipFill(n){
      if(n<=10) return '#F4C64E';
      if(n<=20) return '#5B8DEF';
      if(n<=30) return '#F06C6C';
      if(n<=40) return '#B9BDC4';
      return '#2DBE75';
    }
  };

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
  function lottoChip(n, small=true, hollow=false){
    const c = el('div',{class:'chip'+(small?' small':'' )+(hollow?' hollow':''),'data-n':n});
    c.textContent = n; c.style.setProperty('--chip-fill', Colors.chipFill(n)); return c;
  }

  function recommendSetsExactly(targetCount, exclusions){
    const ex = new Set(exclusions||[]);
    const pool = []; for(let i=1;i<=45;i++) if(!ex.has(i)) pool.push(i);
    if (pool.length < 6) {
      return { error:`제외수가 너무 많습니다. 남은 숫자 ${pool.length}개로는 6개 조합 불가. 제외수를 줄여주세요.` };
    }
    if (ex.size >= 45) return { error:`모든 숫자를 제외할 수는 없습니다.` };
    function one(){
      const tmp = pool.slice();
      const out = [];
      for(let k=0;k<6;k++){ const idx=(Math.random()*tmp.length)|0; out.push(tmp.splice(idx,1)[0]); }
      out.sort((a,b)=>a-b); return out;
    }
    const uniq=new Set(), sets=[]; let guard=0, maxTry=targetCount*40;
    while(sets.length<targetCount && guard<maxTry){
      const s=one(); const key=s.join('-'); if(!uniq.has(key)){ uniq.add(key); sets.push(s); } guard++;
    }
    if (sets.length<targetCount) return { warning:`가능한 조합이 적어 ${sets.length}세트만 생성되었습니다. 제외수를 일부 줄여보세요.`, sets };
    return { sets };
  }

  function showLoading(text='계산 중...'){
    const ov = el('div',{class:'overlay'}, el('div',{class:'spinner'}), el('div',{class:'ov-text'}, text));
    document.body.appendChild(ov); return { close(){ ov.remove(); } };
  }

  function Home(){
    const p = el('div',{class:'page'}, Header('홈'),
      Card(el('div',{class:'title'},'로또 Lab Pro'), el('div',{class:'desc'},'추천 UI 안정화 단계(0.104).')),
      Btn('당첨번호','blk',()=>go('/wins')),
      Btn('저장번호','blk',()=>go('/saved')),
      Btn('추천','blk',()=>go('/reco')),
      Btn('명예의전당','blk',()=>go('/hall')),
      Btn('분석','blk',()=>go('/analysis')),
      el('div',{class:'ver'},'patch '+VERSION)
    ); return p;
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
        blk.forEach(set=> c.appendChild(renderSetRow(set)));
        list.appendChild(c);
      });
    }
    const tools = Card(el('div',{class:'row equal'},
      Btn('샘플 1세트 저장','ghost',()=>{ Store.patch('saved',cur=>{ (cur.current||(cur.current=[])).push([1,2,3,4,5,6]); return cur; }); go('/saved'); }),
      Btn('전부 삭제','danger',()=>{ if(!confirm('저장된 모든 번호를 삭제할까요?')) return; Store.patch('saved',cur=>{ cur.current=[]; return cur; }); go('/saved'); })
    ));
    p.appendChild(tools); p.appendChild(list); return p;
  }
  function renderSetRow(set){ const row=el('div',{class:'set-row'}); set.forEach(n=>row.appendChild(lottoChip(n,true,false))); return row; }

  function Recommend(){
    const p = el('div',{class:'page'}, Header('추천'));
    const prefs = Store.read('prefs'); let exclusions = new Set(prefs.exclusions||[]);
    const gridCard = Card(el('div',{class:'sub'},'제외수(탭하여 토글)'), el('div',{class:'chip-grid'}));
    const grid = $('.chip-grid', gridCard);
    for(let n=1;n<=45;n++){
      const chip=lottoChip(n,true,exclusions.has(n));
      chip.addEventListener('click',()=>{
        if(exclusions.has(n)) exclusions.delete(n); else exclusions.add(n);
        chip.classList.toggle('hollow');
        const p=Store.read('prefs'); p.exclusions=Array.from(exclusions); Store.write('prefs', p);
      });
      grid.appendChild(chip);
    }
    const listArea=el('div',{class:'list'});
    const info=el('div',{class:'muted'},'표시 중: 0세트 (목표 30세트)');
    const controls=el('div',{class:'row equal'},
      Btn('제외수 리셋','ghost',()=>{
        exclusions=new Set(); $$('.chip-grid .chip',gridCard).forEach(c=>c.classList.remove('hollow'));
        const p=Store.read('prefs'); p.exclusions=[]; Store.write('prefs',p);
      }),
      Btn('추천(30세트)','primary', async ()=>{
        const ov=showLoading('추천 계산 중...'); await new Promise(r=>setTimeout(r,2000)); ov.close();
        const {sets,error,warning}=recommendSetsExactly(30, Array.from(exclusions));
        listArea.innerHTML='';
        if(error){ listArea.appendChild(Card(el('div',{class:'warn'},error))); info.textContent='표시 중: 0세트 (목표 30세트)'; return; }
        const blocks=chunk(sets,5);
        blocks.forEach((blk,bi)=>{
          const c=Card(el('div',{class:'block-title'},`추천 세트 ${bi*5+1}~${bi*5+blk.length}`));
          blk.forEach(set=>c.appendChild(renderSetRow(set)));
          listArea.appendChild(c);
        });
        info.textContent=`표시 중: ${sets.length}세트 (목표 30세트)`;
        if(warning) listArea.appendChild(Card(el('div',{class:'warn'},warning)));
        Store.patch('saved',cur=>{ (cur.current||(cur.current=[])).push(...sets); return cur; });
      })
    );
    p.appendChild(gridCard); p.appendChild(controls); p.appendChild(info); p.appendChild(listArea); return p;
  }

  function Wins(){ return el('div',{class:'page'}, Header('당첨번호'), Card(el('div',{class:'desc'},'다음 단계에서 연동됩니다.'))); }
  function Hall(){ return el('div',{class:'page'}, Header('명예의전당'), Card(el('div',{class:'desc'},'아직 기록이 없습니다.'))); }
  function Analysis(){ return el('div',{class:'page'}, Header('분석'), Card(el('div',{class:'title'},'추천엔진 소개'), el('div',{class:'desc'},'현재는 무작위+제외수만 적용합니다. 다음 단계에서 제약/가중치 추가.')), Card(el('div',{class:'desc'},'버전: '+VERSION))); }

  const ROOT=document.getElementById('app');
  const PAGES={'/home':Home,'/saved':Saved,'/reco':Recommend,'/wins':Wins,'/hall':Hall,'/analysis':Analysis};
  function render(){ let path=location.hash.replace('#','')||'/home'; if(!PAGES[path]) path='/home'; ROOT.replaceChildren(PAGES[path]()); applyFits(ROOT); }
  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', ()=>{ if(!location.hash) location.replace('#/home'); render(); console.log('VERSION', VERSION); });
})();
