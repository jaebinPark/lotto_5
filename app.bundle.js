/* Lotto Lab Pro - App Bundle
 * VERSION: patch_0.102
 * 0.102 내용:
 * - 해시 라우터 유지 (/home, /winning, /saved, /reco, /hall, /analysis)
 * - 공통 헤더(오른쪽 홈 아이콘), 베이지톤 UI 유지
 * - 로컬 스토리지 안전 래퍼(Store) + 스키마 키
 * - 기기 독립(동기화 없음): 각 기기 브라우저에만 저장
 * - 오버플로우 가드([data-fit]) 유지
 * - 서비스워커 새 버전 감지 시 하단 업데이트 바 노출
 */
(function () {
  'use strict';
  const VERSION = 'patch_0.102';
  const THEME = { bg:'#FBF6F0', card:'#F7EDE2', text:'#2E2A26', primary:'#E1D3C6', highlight:'#F6D58E' };

  const el = (tag, attrs={}, ...children) => {
    const $ = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs||{})) {
      if (k === 'class') $.className = v;
      else if (k === 'style') Object.assign($.style, v);
      else if (k.startsWith('on') && typeof v === 'function') $.addEventListener(k.slice(2), v);
      else $.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c!=null) $.appendChild(typeof c==='string'?document.createTextNode(c):c);
    return $;
  };

  const Store = (()=>{
    const NS = 'lotto5';
    const key = k => `${NS}:${k}`;
    const read = (k,f=null)=>{ try{ const r=localStorage.getItem(key(k)); return r?JSON.parse(r):f }catch(e){ return f } };
    const write = (k,v)=>{ try{ localStorage.setItem(key(k), JSON.stringify(v)); return true }catch(e){ return false } };
    const patch = (k,fn,f)=>{ const cur=read(k,f); const nxt=fn(cur); write(k,nxt); return nxt };
    const remove = (k)=>{ try{ localStorage.removeItem(key(k)) }catch(e){} };
    const keys = ()=> Object.keys(localStorage).filter(s=>s.startsWith(NS+':')).map(s=>s.slice(NS.length+1));
    return { read, write, patch, remove, keys };
  })();

  (function ensureSchema(){
    if (!Store.read('hall')) Store.write('hall', []);
    if (!Store.read('saved')) Store.write('saved', { current:[], history:[] });
    if (!Store.read('prefs')) Store.write('prefs', { exclusions: [], recoPerClick: 30 });
    Store.write('lastSeenBuild', VERSION);
  })();

  function Header(title){
    const homeBtn = el('button', { class:'icon-btn', 'aria-label':'홈으로' }, '🏠');
    homeBtn.addEventListener('click', ()=> go('/home'));
    return el('div', { class:'header' },
      el('div',{class:'spacer'}),
      el('h1',{class:'title','data-fit':''},title),
      el('div',{class:'right'}, homeBtn)
    );
  }

  const UpdateBar = (()=>{
    const bar = el('div', { class:'update-bar hidden' },
      el('span', {}, '새 업데이트가 있습니다.'),
      el('button', { class:'btn-primary', id:'btn-update-now' }, '업데이트')
    );
    bar.querySelector('#btn-update-now').addEventListener('click', async ()=>{
      try{
        const reg = await navigator.serviceWorker.getRegistration();
        if(reg && reg.waiting){ reg.waiting.postMessage({type:'SKIP_WAITING'}); setTimeout(()=>location.reload(),800); }
        else location.reload();
      }catch(e){ location.reload(); }
    });
    return { mount(root){root.appendChild(bar)}, show(){bar.classList.remove('hidden')}, hide(){bar.classList.add('hidden')} };
  })();

  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistration().then(reg=>{
      if(!reg) return;
      reg.addEventListener('updatefound', ()=> UpdateBar.show());
      if(reg.waiting) UpdateBar.show();
    });
    navigator.serviceWorker.addEventListener('controllerchange', ()=> setTimeout(()=>location.reload(),100));
    navigator.serviceWorker.addEventListener('message', e=>{ if(e.data && e.data.type==='NEW_VERSION') UpdateBar.show() });
  }

  function fitText(node, minPx=12){
    const maxWidth = node.clientWidth;
    if(!maxWidth) return;
    let low=minPx, high=parseFloat(getComputedStyle(node).fontSize)||20, ok=low;
    while(low<=high){
      const mid=(low+high>>1);
      node.style.fontSize=mid+'px';
      if(node.scrollWidth<=maxWidth && node.scrollHeight<=node.clientHeight+4){ ok=mid; low=mid+1 } else high=mid-1;
    }
    node.style.fontSize=ok+'px';
  }
  function applyFit(){ document.querySelectorAll('[data-fit]').forEach(n=>fitText(n)); }
  window.addEventListener('resize', applyFit);

  function PageHome(){
    const wrap = el('div',{class:'page'},
      Header('홈'),
      el('div',{class:'card info'},
        el('div',{class:'info-title'},'로또 Lab Pro'),
        el('p',{},'기본 UI 셸 (0.101~0.102). 이후 단계에서 데이터/엔진이 순차적으로 활성화됩니다.')
      ),
      el('div',{class:'grid'},
        NavBtn('당첨번호','/winning'),
        NavBtn('저장번호','/saved'),
        NavBtn('추천','/reco'),
        NavBtn('명예의전당','/hall'),
        NavBtn('분석','/analysis')
      ),
      el('div',{class:'version'},'patch '+VERSION)
    );
    setTimeout(applyFit);
    return wrap;
  }

  function PageWinning(){
    const wrap = el('div',{class:'page'},
      Header('당첨번호'),
      el('div',{class:'card'}, el('p',{},'아직 데이터 연동 전입니다. 이후 업데이트에서 자동 수집/QR 확인이 활성화됩니다.'))
    );
    setTimeout(applyFit);
    return wrap;
  }

  function PageSaved(){
    const saved=Store.read('saved');
    const count=saved.current.length;
    const wrap = el('div',{class:'page'},
      Header('저장번호'),
      el('div',{class:'card'},
        el('p',{},`저장된 현재 세트: ${count}개`),
        el('div',{class:'btn-row'},
          el('button',{class:'btn',id:'btn-save-sample'},'샘플 1세트 저장'),
          el('button',{class:'btn-outline',id:'btn-clear-all'},'전부 삭제')
        ),
        el('p',{class:'tip'},'※ 이 단계는 저장 엔진 테스트용입니다. 다음 단계에서 실제 UI와 함께 연동됩니다.')
      )
    );
    setTimeout(applyFit);
    wrap.querySelector('#btn-save-sample').addEventListener('click',()=>{
      Store.patch('saved',(s)=>{ s.current.push(sampleTicket()); return s },{current:[],history:[]});
      alert('샘플 1세트를 저장했습니다.');
      go('/saved');
    });
    wrap.querySelector('#btn-clear-all').addEventListener('click',()=>{
      if(!confirm('저장된 모든 번호를 삭제할까요?')) return;
      Store.write('saved',{current:[],history:[]}); alert('삭제했습니다.'); go('/saved');
    });
    return wrap;
  }
  function sampleTicket(){
    const nums=Array.from({length:45},(_,i)=>i+1);
    for(let i=nums.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [nums[i],nums[j]]=[nums[j],nums[i]]; }
    return nums.slice(0,6).sort((a,b)=>a-b);
  }

  function PageReco(){
    const prefs=Store.read('prefs');
    const wrap = el('div',{class:'page'},
      Header('추천'),
      el('div',{class:'card'},
        el('p',{},'추천 엔진 연동 전 단계입니다.'),
        el('p',{},`현재 제외수: ${prefs.exclusions.length}개, 클릭당 추천 예정 수: ${prefs.recoPerClick}세트`),
        el('div',{class:'btn-row'},
          el('button',{class:'btn disabled'},'제외수 리셋(다음 단계)'),
          el('button',{class:'btn-primary disabled'},'추천 생성(다음 단계)')
        )
      )
    );
    setTimeout(applyFit);
    return wrap;
  }

  function PageHall(){
    const hall=Store.read('hall');
    const wrap = el('div',{class:'page'},
      Header('명예의전당'),
      el('div',{class:'card'},
        hall.length ? el('ul',{class:'list'}, hall.map(h=>el('li',{},`#${h.round}회 ${h.rank}등 - ${h.set.join(', ')}`))) : el('p',{},'아직 등록된 당첨 기록이 없습니다.')
      )
    );
    setTimeout(applyFit);
    return wrap;
  }

  function PageAnalysis(){
    const wrap = el('div',{class:'page'},
      Header('분석'),
      el('div',{class:'card'}, el('h3',{'data-fit':''},'추천엔진 소개(미리보기)'), el('p',{},'그룹 가중치, 최근성, 지연도 기반의 스코어링과 제약 필터로 조합합니다. 상세 내용은 이후 단계에서 앱 내 카드로 제공됩니다.')),
      el('div',{class:'card'}, el('h3',{},'패치 노트'), el('p',{},'현재 버전: '+VERSION))
    );
    setTimeout(applyFit);
    return wrap;
  }

  const ROOT=document.getElementById('app');
  function NavBtn(label,to){ const b=el('button',{class:'nav-btn','data-fit':''},label); b.addEventListener('click',()=>go(to)); return el('div',{class:'nav-item'},b) }
  function go(path){ if(!path.startsWith('/')) path='/'+path; location.hash='#'+path }
  const PAGES={'/home':PageHome,'/winning':PageWinning,'/saved':PageSaved,'/reco':PageReco,'/hall':PageHall,'/analysis':PageAnalysis};
  function render(){ let path=location.hash.replace('#','')||'/home'; if(!PAGES[path]) path='/home'; ROOT.innerHTML=''; ROOT.appendChild(PAGES[path]()); UpdateBar.mount(document.body) }
  window.addEventListener('hashchange', render);
  window.addEventListener('load', render);
  window.__LOTTO__={ VERSION, Store };
})();
