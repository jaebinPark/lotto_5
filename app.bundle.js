
(()=>{'use strict';
  const VERSION='patch_0.100'; const APP_BUILD='1756547488';
  const L5 = (window.L5 = window.L5 || {});

  const guard = L5.guard = {
    try(scope, fn){ try{ return fn(); }catch(e){ console.error('[guard]', scope, e); toast('오류가 발생했어요 • '+scope); } }
  };

  const subscribers = new Set();
  let state = Object.freeze({ route:'home', title:'홈' });
  const store = L5.store = {
    get:()=>state,
    patch:(p)=>{ state=Object.freeze(Object.assign({},state,p)); scheduleRender(); },
    sub:(fn)=> (subscribers.add(fn), ()=>subscribers.delete(fn))
  };

  let raf=0; function scheduleRender(){ if(raf) return; raf=requestAnimationFrame(()=>{raf=0; render();}); }

  const titles={ home:'홈', draws:'당첨번호', saved:'저장번호', reco:'추천', analysis:'분석', hof:'명예의전당' };
  function parseRoute(){ const h=(location.hash||'#/home').slice(2); const key=h.split('?')[0]||'home'; return titles[key]?key:'home'; }
  function onRoute(){ const key=parseRoute(); store.patch({route:key,title:titles[key]}); }
  addEventListener('hashchange', onRoute); addEventListener('load', onRoute);

  const appEl=document.getElementById('app');

  function header(title){ return `
    <div class="header">
      <div class="header-title">${title}</div>
      <div class="header-right">
        <a class="icon-btn" href="#/home" aria-label="홈으로 이동" title="홈">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 10.5L12 3l9 7.5"></path>
            <path d="M5 10v10h14V10"></path>
          </svg>
        </a>
      </div>
    </div>`; }

  function fab(){ return `<button id="fabTop" class="fab" aria-label="맨 위로">
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 15l-6-6-6 6"></path>
    </svg></button>`; }

  function homeView(){ return `
    <div class="container stack">
      <div class="card center">
        <div class="fit-text"><b>로또 Lab Pro</b></div>
        <div class="truncate-2" style="opacity:.8;margin-top:6px;">기본 UI 쉘 (0.100). 이후 단계에서 데이터/엔진이 순차적으로 활성화됩니다.</div>
      </div>
      <a class="btn" href="#/draws">당첨번호</a>
      <a class="btn" href="#/saved">저장번호</a>
      <a class="btn" href="#/reco">추천</a>
      <a class="btn" href="#/hof">명예의전당</a>
      <a class="btn" href="#/analysis">분석</a>
      <div class="patch">patch ${VERSION}</div>
    </div>`; }

  function placeholderView(name){ return `
    <div class="container stack">
      <div class="card">
        <div class="fit-text"><b>${name}</b></div>
        <div class="truncate-2" style="opacity:.8;margin-top:6px;">이 화면은 0.100에서는 스켈레톤입니다. 이후 단계에서 기능이 활성화됩니다.</div>
      </div>
    </div>`; }

  function toast(msg){ let t=document.querySelector('.__toast'); if(!t){ t=document.createElement('div'); t.className='__toast';
    Object.assign(t.style,{position:'fixed',left:'50%',bottom:'calc(env(safe-area-inset-bottom,0px)+24px)',transform:'translateX(-50%)',background:'var(--ink)',color:'#fff',padding:'10px 14px',borderRadius:'12px',zIndex:50,boxShadow:'var(--shadow)',maxWidth:'80vw',textAlign:'center'});
    document.body.appendChild(t);}
    t.textContent=msg; t.style.opacity=1; clearTimeout(t.__to); t.__to=setTimeout(()=>t.style.opacity=0,2200);
  }

  function render(){
    const s=store.get(); const isHome=s.route==='home';
    document.body.classList.toggle('no-scroll', isHome);
    const view = ({ home:()=>homeView(), draws:()=>placeholderView('당첨번호'),
      saved:()=>placeholderView('저장번호'), reco:()=>placeholderView('추천'),
      analysis:()=>placeholderView('분석'), hof:()=>placeholderView('명예의전당') })[s.route]();
    appEl.innerHTML = `<div class="app">${header(s.title)}${view}</div>${fab()}`;

    const fabEl=document.getElementById('fabTop');
    function onScroll(){ const show=scrollY>300 && !isHome; fabEl.classList.toggle('show', show); }
    if(fabEl){ fabEl.addEventListener('click', ()=>scrollTo({top:0,behavior:'smooth'})); addEventListener('scroll', onScroll, {passive:true}); onScroll(); }
  }

  render();
})();
