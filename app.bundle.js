/* lotto app bundle - incremental build
 * VERSION: patch_0.103
 * Scope: UI shell + storage + Recommend page (exclude chips, 2s loading, save to storage), Saved page list
 */
(function(){
  const VERSION = 'patch_0.103';
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  // basic DOM helpers
  const el = (tag, attrs={}, ...children) => {
    const node = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})){
      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.substring(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children){
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  };

  // Simple router (hash-based)
  const Router = {
    routes: {},
    mountPoint: null,
    use(mp){ this.mountPoint = mp; },
    add(path, render){ this.routes[path] = render; },
    go(path){ location.hash = '#'+path; },
    start(){
      const apply = () => {
        const key = location.hash.replace(/^#/, '') || 'home';
        const r = this.routes[key] || this.routes['home'];
        if (!r) return;
        this.mountPoint.innerHTML = '';
        this.mountPoint.appendChild(r());
        // scroll top
        window.scrollTo(0,0);
      };
      window.addEventListener('hashchange', apply);
      apply();
    }
  };

  // Storage (localStorage wrapper, safe)
  const Store = (function(){
    const NS = 'lotto5:';
    const defaults = {
      prefs: { exclusions: [], recoPerClick: 30 },
      saved: { current: [], history: [] },
      hall: [],
      lastSeenBuild: null
    };
    const getKey = (k) => NS + k;
    function read(key){ 
      try {
        const v = localStorage.getItem(getKey(key));
        if (!v) { write(key, defaults[key]); return JSON.parse(JSON.stringify(defaults[key])); }
        return JSON.parse(v);
      } catch(e){ console.warn('Store read error', key, e); return JSON.parse(JSON.stringify(defaults[key])); }
    }
    function write(key, val){ try { localStorage.setItem(getKey(key), JSON.stringify(val)); } catch(e){ console.warn('Store write error', key, e); } }
    function keys(){ return Object.keys(defaults).map(k => getKey(k)); }
    function reset(){ for(const k of Object.keys(defaults)) localStorage.removeItem(getKey(k)); }
    return { read, write, keys, reset, defaults };
  })();

  // Colors & chip helpers
  const Colors = {
    bg: '#FBF6F0',
    text: '#2E2A26',
    card: '#F7EFE5',
    shadow: 'rgba(0,0,0,.06)',
    // lotto chip fill by range
    chipFill(n){
      if (n<=10) return '#F4C64E'; // yellow
      if (n<=20) return '#5B8DEF'; // blue-ish
      if (n<=30) return '#F06C6C'; // red
      if (n<=40) return '#B9BDC4'; // gray
      return '#2DBE75'; // green 41~45
    }
  };

  function header(title){
    return el('div', {class:'header'},
      el('div', {class:'hdr-left'}),
      el('div', {class:'hdr-title'}, title),
      el('button', {class:'hdr-home', onclick: ()=>Router.go('home'), 'aria-label':'홈'}, '⌂')
    );
  }

  function card(...children){
    return el('div', {class:'card'}, ...children);
  }

  // Chip: lotto color chip
  function lottoChip(n, opts={}){
    const { hollow=false, small=false } = opts;
    const s = el('div', {class: 'chip ' + (small?'small ':'') + (hollow?'hollow':''), 'data-n': n});
    s.textContent = n;
    s.style.setProperty('--chip-fill', Colors.chipFill(n));
    return s;
  }

  // Chip: number chip neutral (cream bg + dark border/text)
  function numberChip(n, opts={}){
    const { hollow=false, small=false } = opts;
    const s = el('div', {class: 'chip neutral ' + (small?'small ':'') + (hollow?'hollow':''), 'data-n': n});
    s.textContent = n;
    return s;
  }

  // Recommend random (placeholder) with exclusions & safety
  function recommendSets(count, excludeSet){
    const ex = new Set(excludeSet||[]);
    const maxEx = 39; // cannot exclude >= 40 numbers
    if (ex.size > maxEx) return { error: `제외수가 너무 많아요(${ex.size}개). 일부 제외수를 줄여주세요.` };

    const sets = [];
    const pickOne = ()=>{
      const pool = [];
      for(let n=1;n<=45;n++) if(!ex.has(n)) pool.push(n);
      // need at least 6 numbers
      if (pool.length < 6) return null;
      // random 6 unique
      const out = [];
      for(let i=0;i<6;i++){
        const idx = Math.floor(Math.random()*pool.length);
        out.push(...pool.splice(idx,1));
      }
      out.sort((a,b)=>a-b);
      return out;
    };
    let tries = 0;
    while(sets.length < count && tries < count*20){
      const s = pickOne();
      if (!s) break;
      // avoid duplicates
      if (!sets.some(t => t.every((v,i)=>v===s[i]))){
        sets.push(s);
      }
      tries++;
    }
    return { sets };
  }

  // Loading overlay (2s)
  function showLoading(text='계산 중...'){
    const ov = el('div',{class:'overlay'}, el('div',{class:'spinner'},''), el('div',{class:'ov-text'}, text));
    document.body.appendChild(ov);
    return {
      close: ()=>ov.remove()
    };
  }

  // ==== Pages ====

  function Home(){
    const wrap = el('div', {class:'page'});
    wrap.appendChild(header('홈'));
    wrap.appendChild(card(
      el('div', {class:'title'}, '로또 Lab Pro'),
      el('div', {class:'desc'}, '기본 UI 셸. 이후 단계에서 데이터/엔진이 순차적으로 활성화됩니다.')
    ));
    const mkBtn = (label, path)=> el('button', {class:'btn', onclick:()=>Router.go(path)}, label);
    wrap.appendChild(mkBtn('당첨번호', 'wins'));
    wrap.appendChild(mkBtn('저장번호', 'saved'));
    wrap.appendChild(mkBtn('추천', 'reco'));
    wrap.appendChild(mkBtn('명예의전당', 'hall'));
    wrap.appendChild(mkBtn('분석', 'analysis'));
    wrap.appendChild(el('div',{class:'ver'}, 'patch '+VERSION));
    return wrap;
  }

  function Saved(){
    const wrap = el('div', {class:'page'});
    wrap.appendChild(header('저장번호'));
    const state = Store.read('saved');
    const cur = state.current || [];
    const area = el('div',{class:'list'});
    if (cur.length===0){
      area.appendChild(card(el('div',{class:'desc'},'저장된 세트가 없습니다. 추천에서 생성하면 자동 저장됩니다.')));
    } else {
      // render current saved
      const blocks = chunk(cur, 5); // group by 5 blocks
      blocks.forEach((blk,bi)=>{
        const b = card(el('div',{class:'block-title'}, `현재 저장 세트 ${bi*5+1}~${bi*5+blk.length}`));
        blk.forEach(set=> b.appendChild(renderSetRow(set)));
        area.appendChild(b);
      });
    }
    const tools = card(
      el('div',{class:'row'},
        el('button',{class:'btn ghost', onclick: ()=>{
          // sample add
          const sample = [[1,2,3,4,5,6]];
          const s = Store.read('saved');
          s.current = (s.current||[]).concat(sample);
          Store.write('saved', s);
          Router.go('saved'); // rerender
        }}, '샘플 1세트 저장'),
        el('button',{class:'btn danger', onclick: ()=>{
          const s = Store.read('saved'); s.current = []; Store.write('saved', s); Router.go('saved');
        }}, '전부 삭제')
      )
    );
    wrap.appendChild(tools);
    wrap.appendChild(area);
    return wrap;
  }

  function chunk(arr, n){
    const out=[]; for(let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out;
  }

  function renderSetRow(nums){
    const row = el('div',{class:'set-row'});
    nums.forEach(n=> row.appendChild(lottoChip(n,{small:true})));
    return row;
  }

  function Recommend(){
    const wrap = el('div', {class:'page'});
    wrap.appendChild(header('추천'));

    const prefs = Store.read('prefs');
    let exclusions = new Set(prefs.exclusions||[]);

    // grid box
    const box = card(
      el('div',{class:'sub'}, '제외수 (눌러서 토글)'),
      el('div',{class:'chip-grid'})
    );
    const grid = $('.chip-grid', box);
    for(let n=1;n<=45;n++){
      const chip = lottoChip(n, {small:true, hollow: exclusions.has(n)});
      chip.addEventListener('click', ()=>{
        if (exclusions.has(n)) exclusions.delete(n);
        else exclusions.add(n);
        chip.classList.toggle('hollow');
        // persist
        const p = Store.read('prefs'); p.exclusions = Array.from(exclusions); Store.write('prefs', p);
      });
      grid.appendChild(chip);
    }

    const countInfo = el('div',{class:'muted', style:'margin-top:6px;'}, `현재 추천 세트: `);
    const listArea = el('div',{class:'list'});

    const controls = el('div',{class:'row'},
      el('button',{class:'btn ghost', onclick: ()=>{
        exclusions = new Set();
        $$('.chip-grid .chip', box).forEach(c=>c.classList.remove('hollow'));
        const p = Store.read('prefs'); p.exclusions = []; Store.write('prefs', p);
      }}, '제외수 리셋'),
      el('button',{class:'btn primary', onclick: async ()=>{
        // 2s loading
        const ov = showLoading('추천 계산 중...');
        await new Promise(r=>setTimeout(r, 2000));
        ov.close();

        const cnt = (Store.read('prefs').recoPerClick)||30;
        const result = recommendSets(cnt, Array.from(exclusions));
        listArea.innerHTML = '';
        if (result.error){
          listArea.appendChild(card(el('div',{class:'warn'}, result.error)));
          return;
        }
        // render blocks of 5
        const blocks = chunk(result.sets, 5);
        blocks.forEach((blk,bi)=>{
          const b = card(el('div',{class:'block-title'}, `추천 세트 ${bi*5+1}~${bi*5+blk.length}`));
          blk.forEach(set=> b.appendChild(renderSetRow(set)));
          listArea.appendChild(b);
        });
        countInfo.textContent = `현재 추천 세트: ${result.sets.length}개`;

        // auto-save to saved.current
        const sv = Store.read('saved');
        sv.current = (sv.current||[]).concat(result.sets);
        Store.write('saved', sv);
      }}, `추천(${Store.read('prefs').recoPerClick||30}세트)`)
    );
    wrap.appendChild(box);
    wrap.appendChild(controls);
    wrap.appendChild(countInfo);
    wrap.appendChild(listArea);
    return wrap;
  }

  function Hall(){
    const wrap = el('div', {class:'page'});
    wrap.appendChild(header('명예의전당'));
    wrap.appendChild(card(el('div',{class:'desc'}, '아직 기록이 없습니다. 저장번호에서 당첨 시 자동으로 여기에 쌓입니다.')));
    return wrap;
  }

  function Analysis(){
    const wrap = el('div', {class:'page'});
    wrap.appendChild(header('분석'));
    wrap.appendChild(card(el('div',{class:'title'}, '추천 엔진 미리보기'),
      el('div',{class:'desc'}, '현재 단계에서는 무작위 + 제외수만 적용합니다. 이후 단계에서 제약, 가중치, 학습 로직이 추가됩니다.')));
    wrap.appendChild(card(el('div',{class:'desc'}, '버전: '+VERSION)));
    return wrap;
  }

  // Mount App
  function mount(){
    const root = document.getElementById('app');
    root.innerHTML = '';
    Router.use(root);
    Router.add('home', Home);
    Router.add('saved', Saved);
    Router.add('reco', Recommend);
    Router.add('wins', ()=>{ const w=el('div',{class:'page'}); w.appendChild(header('당첨번호')); w.appendChild(card(el('div',{class:'desc'},'추후 단계에서 데이터 연결됩니다.'))); return w; });
    Router.add('hall', Hall);
    Router.add('analysis', Analysis);
    // first route
    Router.start();
  }

  // styles injection guard (for hot replace)
  function ensureBody(){
    document.body.style.background = Colors.bg;
    document.body.style.color = Colors.text;
  }

  window.__LOTTO__ = Object.assign(window.__LOTTO__ || {}, { VERSION, Store, Router });
  window.addEventListener('DOMContentLoaded', ()=>{
    ensureBody();
    mount();
    console.log('VERSION', VERSION);
  });
})();