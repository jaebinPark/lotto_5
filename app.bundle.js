
/* lotto app bundle - 0.101
   - Hash router (home/winning/saved/reco/hall/analysis)
   - Common header with right home button
   - Overflow-safe text shrink
   - Update bar (service worker update detect)
*/
(function () {
  'use strict';
  const VERSION = 'patch_0.101';
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const root = document.getElementById('app');

  // ---------- Utilities ----------
  function el(tag, attrs={}, ...children) {
    const node = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})) {
      if (k === 'class') node.className = v;
      else if (k === 'style') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.substring(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function go(hash) {
    if (!hash.startsWith('#')) hash = '#' + hash;
    location.hash = hash;
  }

  // Fit text inside its box by shrinking font-size down to minPx
  function fitText(node, minPx=12) {
    if (!node) return;
    node.style.removeProperty('font-size');
    const maxLoops = 20;
    let loops = 0;
    let fs = parseFloat(getComputedStyle(node).fontSize);
    const boundsOk = () => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight;
    while (!boundsOk() && fs > minPx && loops < maxLoops) {
      fs -= 1;
      node.style.fontSize = fs + 'px';
      loops++;
    }
  }
  function applyFit(root=document) {
    $$('[data-fit]', root).forEach(n => fitText(n));
  }
  window.addEventListener('resize', () => applyFit());

  // ---------- Layout Components ----------
  function Header(title) {
    const titleSpan = el('span', {class: 'title', 'data-fit': ''}, title);
    const right = el('button', {class: 'icon-btn', title: '홈', onclick: () => go('/home')}, '🏠');
    const bar = el('div', {class: 'hdr'},
      el('div', {class: 'spacer'}),
      titleSpan,
      right
    );
    queueMicrotask(() => applyFit(bar));
    return bar;
  }

  function Card(children, cls='card') {
    return el('div', {class: cls}, ...(Array.isArray(children) ? children : [children]));
  }
  function Button(text, onclick) {
    const span = el('span', {'data-fit': ''}, text);
    const btn = el('button', {class: 'btn', onclick}, span);
    queueMicrotask(() => fitText(span));
    return btn;
  }

  // ---------- Pages ----------
  function pageHome() {
    const info = Card([
      el('div', {class:'card-title','data-fit':''}, '로또 Lab Pro'),
      el('div', {class:'card-desc'}, '기본 UI 셸 (0.101). 이후 단계에서 데이터/엔진이 순차적으로 활성화됩니다.')
    ]);
    const menu = el('div', {class:'menu'},
      Button('당첨번호', ()=>go('/winning')),
      Button('저장번호', ()=>go('/saved')),
      Button('추천', ()=>go('/reco')),
      Button('명예의전당', ()=>go('/hall')),
      Button('분석', ()=>go('/analysis'))
    );
    return el('div', {class:'screen'}, info, menu);
  }
  function pagePlaceholder(name) {
    return el('div', {class:'screen'},
      Card([
        el('div', {class:'card-title','data-fit':''}, name),
        el('div', {class:'muted'}, '추후 단계에서 내용이 활성화됩니다.')
      ])
    );
  }
  const PAGES = {
    '/home': () => [Header('홈'), pageHome()],
    '/winning': () => [Header('당첨번호'), pagePlaceholder('당첨번호')],
    '/saved': () => [Header('저장번호'), pagePlaceholder('저장번호')],
    '/reco': () => [Header('추천'), pagePlaceholder('추천')],
    '/hall': () => [Header('명예의전당'), pagePlaceholder('명예의전당')],
    '/analysis': () => [Header('분석'), pagePlaceholder('분석')],
  };

  // ---------- Router ----------
  function parseHash() {
    const h = location.hash.replace(/^#/, '');
    return h || '/home';
  }
  function render() {
    const route = parseHash();
    const maker = PAGES[route] || PAGES['/home'];
    root.replaceChildren();
    const parts = maker();
    parts.forEach(p => root.appendChild(p));
    // version footer
    const ft = el('div', {class:'version'}, 'patch ', VERSION);
    root.appendChild(ft);
    applyFit(root);
  }
  window.addEventListener('hashchange', render);

  // ---------- Update Bar (SW) ----------
  const updBar = (function(){
    const bar = el('div',{class:'update-bar', id:'update-bar'},
      el('span',{class:'update-text','data-fit':''},'새 버전이 준비되었습니다.'),
      el('button',{class:'update-act'},'업데이트 적용')
    );
    document.body.appendChild(bar);
    const applyBtn = $('.update-act', bar);
    applyBtn.addEventListener('click', async () => {
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && reg.waiting) {
            reg.waiting.postMessage({type:'SKIP_WAITING'});
          }
        }
      } catch(e){}
      // fallback: 강제 새로고침
      location.reload();
    });
    function show(){ bar.classList.add('show'); applyFit(bar);}
    return {show};
  })();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return;
      // 이미 대기중인 새 워커가 있으면 표시
      if (reg.waiting) updBar.show();
      reg.addEventListener('updatefound', ()=>{
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', ()=>{
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            updBar.show();
          }
        });
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{
      // 새 SW가 활성화되면 자동 새로고침
      location.reload();
    });
  }

  // init
  if (!location.hash) location.replace('#/home');
  render();
})();
