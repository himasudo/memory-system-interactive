/* ======================= core ======================= */
var App = (function(){
  var NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, parent, text){
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(tag, attrs, parent, html){
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs){
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style' && typeof attrs[k] === 'object') for (var sk in attrs[k]) e.style[sk] = attrs[k][sk];
      else e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function hx(v, w){ var t = (typeof v === 'bigint' ? v : BigInt(v)).toString(16); if (w) t = t.padStart(w, '0'); return '0x' + t; }
  function hb(v){ return v.toString(16).padStart(2, '0'); }

  /* ---------- the running example: one program, one set of addresses ---------- */
  var EX = {
    fn: 0x555555555180n, loop: 0x555555555190n, ret: 0x5555555551a1n,
    data: 0x55555555a2c0n, hist: 0x7ffd4a3c2a80n, rsp: 0x7ffd4a3c2a58n, retAddr: 0x5555555552d4n,
    n: 3, bytes: [123, 123, 7, 46, 200, 123], histInit: {123: 41, 7: 9, 46: 3, 200: 17},
    /* VA page -> PFN, fixed for every chapter */
    pages: { '555555555': 0x2b4e1n, '55555555a': 0x1c07an, '7ffd4a3c2': 0x1a3f7cn, '7ffd4a3c3': 0x0f9d2n },
    cr3: 0x10a3b000n
  };
  EX.histAddr = function(k){ return EX.hist + BigInt(k) * 8n; };
  EX.pa = function(va){
    var vpn = (va >> 12n).toString(16), pfn = EX.pages[vpn];
    return pfn === undefined ? null : (pfn << 12n) | (va & 0xfffn);
  };

  /* ---------- latency config (published ballpark defaults; user can overwrite with measurements) ---------- */
  var CFG = { ghz: 4.0, l1: 4, l2: 12, l3: 35, dramNs: 90, tscGhz: 2.297 };
  var CFG_DEF = JSON.parse(JSON.stringify(CFG));
  try { var sv = localStorage.getItem('memE2E.cfg'); if (sv){ var o = JSON.parse(sv); for (var k in o) if (k in CFG) CFG[k] = +o[k]; } } catch(e){}
  var cfgListeners = [];
  function dramCycles(){ return Math.round(CFG.l3 + CFG.dramNs * CFG.ghz); }
  function onCfg(fn){ cfgListeners.push(fn); }

  /* ---------- glossary ---------- */
  var G = {};
  function gloss(key, title, def){ G[key] = {t: title, d: def}; }
  function g(key, label){ return '<dfn data-g="' + key + '">' + (label || (G[key] ? G[key].t : key)) + '</dfn>'; }

  /* ---------- chapters + router ---------- */
  var chapters = [], built = {}, cur = null;
  function chapter(def){ chapters.push(def); }

  function chapterGroup(num){
    var n = +num;
    if (n === 0) return 'Overview';
    if (n <= 3) return 'Core path';
    if (n <= 9) return 'Memory system';
    return 'System path';
  }

  function chapterIndex(id){
    for (var i = 0; i < chapters.length; i++) if (chapters[i].id === id) return i;
    return 0;
  }

  function chapterArt(id){
    var art;
    if (id === 'map'){
      art = h('div', {'class':'chapter-art art-map','aria-hidden':'true'});
      art.innerHTML = '<div class="art-cap">ONE ACCESS / WHOLE MACHINE</div>' +
        '<div class="art-path"><i class="ap-core">CORE</i><b>→</b><i>L1D</i><b>→</b><i>L2</i><b>→</b><i>L3</i><b>→</b><i class="ap-dram">DRAM</i></div>' +
        '<div class="art-address">0x7ffd4a3c2e58 <span>→</span> 0x1a3f7ce58</div>' +
        '<div class="art-grid" aria-hidden="true"></div>';
    } else if (id === 'core'){
      art = h('div', {'class':'chapter-art art-core','aria-hidden':'true'});
      art.innerHTML = '<div class="art-cap">OUT-OF-ORDER / LIVE STATE</div>' +
        '<div class="pipe-row"><span>FETCH</span><i></i><i class="hot"></i><i></i><i></i></div>' +
        '<div class="pipe-row"><span>RENAME</span><i class="hot"></i><i></i><i></i><i></i><i></i><i></i></div>' +
        '<div class="pipe-row"><span>ISSUE</span><i></i><i class="ready"></i><i class="hot"></i><i></i><i></i></div>' +
        '<div class="pipe-row"><span>RETIRE</span><i class="ready"></i><i class="ready"></i><i></i><i></i></div>' +
        '<div class="art-cycle">cycle <b>17</b> · 7 µops in flight</div>';
    } else if (id === 'l1d'){
      art = h('div', {'class':'chapter-art art-l1d','aria-hidden':'true'});
      art.innerHTML = '<div class="art-cap">SET 57 / 8-WAY LOOKUP</div>' +
        '<div class="cache-address"><span>tag 0x1a3f7c</span><span>index 57</span><span>off 24</span></div>' +
        '<div class="cache-ways">' + [0,1,2,3,4,5,6,7].map(function(n){ return '<i class="' + (n === 3 ? 'hit' : '') + '"><b>w' + n + '</b><em>' + (n === 3 ? 'HIT' : '≠') + '</em></i>'; }).join('') + '</div>' +
        '<div class="cache-result">way 3 <b>→ 41</b></div>';
    }
    return art || null;
  }

  function makeChapterHeader(sec, ch){
    var hd = h('header', {'class': 'chh'}, sec);
    var copy = h('div', {'class': 'ch-copy'}, hd);
    h('div', {'class': 'num'}, copy, 'CHAPTER ' + ch.num + ' · ' + chapterGroup(ch.num));
    h('h1', null, copy, ch.title);
    if (ch.sub) h('p', null, copy, ch.sub);
    var art = chapterArt(ch.id);
    if (art){ hd.classList.add('has-art'); hd.appendChild(art); }
  }

  function makeChapterFooter(sec, ch){
    var idx = chapterIndex(ch.id), prev = idx > 0 ? chapters[idx - 1] : null, next = idx < chapters.length - 1 ? chapters[idx + 1] : null;
    if (!prev && !next) return;
    var foot = h('footer', {'class':'chapter-footer','aria-label':'Continue through the atlas'}, sec);
    if (prev){
      var bp = h('button', {'class':'chapter-jump prev',type:'button'}, foot,
        '<span>← previous</span><strong>' + prev.num + ' · ' + prev.short + '</strong>');
      bp.onclick = function(){ go(prev.id); };
    } else h('span', {'class':'chapter-jump-spacer'}, foot);
    if (next){
      var bn = h('button', {'class':'chapter-jump next',type:'button'}, foot,
        '<span>next →</span><strong>' + next.num + ' · ' + next.short + '</strong>');
      bn.onclick = function(){ go(next.id); };
    }
  }

  function show(id){
    var ch = chapters.filter(function(c){ return c.id === id; })[0] || chapters[0];
    if (!built[ch.id]){
      var sec = h('section', {'class': 'ch ch-' + ch.id, id: 'ch-' + ch.id, 'data-group': chapterGroup(ch.num)}, document.getElementById('main'));
      makeChapterHeader(sec, ch);
      var body = h('div', {'class': 'stack chapter-body'}, sec);
      built[ch.id] = {sec: sec, api: ch.build(body) || {}};
      enhanceChapter(sec);
      makeChapterFooter(sec, ch);
    }
    for (var k in built) built[k].sec.classList.toggle('show', k === ch.id);
    cur = ch.id;
    var links = document.querySelectorAll('#nav a');
    for (var i = 0; i < links.length; i++) links[i].classList.toggle('cur', links[i].dataset.id === ch.id);
    var a = document.querySelector('#nav a.cur'); if (a && a.scrollIntoView) a.scrollIntoView({block: 'nearest'});
    var cn = document.getElementById('crumbNum'), ct = document.getElementById('crumbTitle');
    if (cn) cn.textContent = ch.num;
    if (ct) ct.textContent = ch.short;
    closeNav();
    if (built[ch.id].api.onShow) built[ch.id].api.onShow();
  }

  function go(id){
    if (location.hash !== '#' + id) location.hash = id; else show(id);
    window.scrollTo({top: 0, behavior: 'auto'});
  }

  function start(){
    initTheme();
    initShell();
    var nav = document.getElementById('nav'), lastGroup = null;
    chapters.forEach(function(c){
      var grp = chapterGroup(c.num);
      if (grp !== lastGroup){ h('div', {'class': 'nav-group'}, nav, grp); lastGroup = grp; }
      var a = h('a', {href: '#' + c.id}, nav,
        '<span class="nav-num">' + c.num + '</span><span class="nav-label">' + c.short + '</span><span class="nav-arrow">›</span>');
      a.dataset.id = c.id;
      a.addEventListener('mouseup', function(){ a.blur(); });
    });
    window.addEventListener('hashchange', function(){ show(location.hash.slice(1)); window.scrollTo({top: 0, behavior: 'auto'}); });
    show(location.hash.slice(1) || chapters[0].id);
    initPop(); initCfg();
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape'){
        if (document.body.classList.contains('viz-open')) closeFullscreenViz();
        closeNav();
      }
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      var api = built[cur] && built[cur].api;
      if (api && api.key && api.key(e.key)) e.preventDefault();
    });
  }

  /* ---------- shell / theme ---------- */
  function initShell(){
    var btn = document.getElementById('navToggle'), scrim = document.getElementById('sideScrim'), pin = document.getElementById('sidebarPin');
    if (btn) btn.onclick = function(){
      var on = document.body.classList.toggle('nav-open');
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    };
    if (scrim) scrim.onclick = closeNav;
    var pinned = false; try { pinned = localStorage.getItem('memE2E.navPinned') === '1'; } catch(e){}
    document.body.classList.toggle('nav-pinned', pinned);
    if (pin){
      pin.setAttribute('aria-pressed', pinned ? 'true' : 'false');
      pin.title = pinned ? 'Let navigation collapse again' : 'Keep navigation expanded';
      pin.onclick = function(){
        pinned = !document.body.classList.contains('nav-pinned');
        document.body.classList.toggle('nav-pinned', pinned);
        pin.setAttribute('aria-pressed', pinned ? 'true' : 'false');
        pin.title = pinned ? 'Let navigation collapse again' : 'Keep navigation expanded';
        try { localStorage.setItem('memE2E.navPinned', pinned ? '1' : '0'); } catch(e){}
      };
    }
  }
  function closeNav(){
    document.body.classList.remove('nav-open');
    var btn = document.getElementById('navToggle'); if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  function initTheme(){
    /* V3 has one art direction: dark. Keep the attribute explicit so diagrams, SVGs and
       browser controls cannot drift with OS theme changes. */
    document.documentElement.setAttribute('data-theme', 'dark');
    try { localStorage.removeItem('memE2E.theme'); } catch(e){}
  }

  /* ---------- canvas enhancement ---------- */
  var fullscreenViz = null;
  function closeFullscreenViz(){
    if (!fullscreenViz) return;
    fullscreenViz.classList.remove('is-fullscreen');
    document.body.classList.remove('viz-open');
    var b = fullscreenViz.querySelector('[data-viz-full]'); if (b) b.textContent = 'focus canvas';
    var sc = fullscreenViz.querySelector('.scroller'); if (sc && sc._vizApply) setTimeout(sc._vizApply, 20);
    fullscreenViz = null;
  }

  function enhanceScroller(sc){
    if (!sc || sc.dataset.enhanced || !sc.querySelector('svg')) return;
    sc.dataset.enhanced = '1';
    var svg = sc.querySelector('svg'), vb = (svg.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
    var baseW = vb.length === 4 && vb[2] ? vb[2] : 1000;
    var originalVB = vb.length === 4 ? vb.slice() : [0, 0, baseW, Math.round(baseW * .6)];
    var inlineMin = parseFloat((svg.style.minWidth || '').replace('px','')); if (inlineMin) baseW = Math.max(baseW, inlineMin);
    svg.style.minWidth = '0';
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');
    svg.setAttribute('overflow','visible');
    sc._vizOriginalViewBox = originalVB.slice();

    function safeBox(box, pad){
      var b=(box || originalVB).slice(), p=pad === undefined ? Math.max(18, Math.min(44, Math.min(b[2],b[3])*.055)) : pad;
      return [b[0]-p,b[1]-p,b[2]+p*2,b[3]+p*2];
    }
    sc._vizSafeBox = safeBox;
    sc._vizSetViewBox = function(box){
      var b = safeBox(box || originalVB);
      svg.setAttribute('viewBox', b.join(' '));
      if (sc._vizApply) setTimeout(sc._vizApply, 0);
    };
    sc._vizAnimateViewBox = function(box){
      var target = safeBox(box || originalVB), reduce = false;
      try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}
      var from = (svg.getAttribute('viewBox') || safeBox(originalVB).join(' ')).trim().split(/\s+/).map(Number);
      if (reduce || from.length !== 4 || target.length !== 4){ sc._vizSetViewBox(box); return; }
      if (sc._vizRAF) cancelAnimationFrame(sc._vizRAF);
      var t0 = performance.now(), dur = 520;
      frame.classList.add('camera-moving','focus-transition');
      function ease(t){ return t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
      function tick(now){
        var q = Math.min(1, (now - t0) / dur), e = ease(q), cur = [];
        for (var n = 0; n < 4; n++) cur[n] = from[n] + (target[n] - from[n]) * e;
        svg.setAttribute('viewBox', cur.join(' '));
        if (q < 1) sc._vizRAF = requestAnimationFrame(tick);
        else {
          frame.classList.remove('camera-moving');
          setTimeout(function(){ frame.classList.remove('focus-transition'); },220);
          if (sc._vizApply) setTimeout(sc._vizApply, 0);
        }
      }
      sc._vizRAF = requestAnimationFrame(tick);
    };

    var frame = document.createElement('div'); frame.className = 'viz-frame';
    if (sc.classList.contains('map-canvas')) frame.classList.add('map-viz');
    if (sc.classList.contains('core-floorplan')) frame.classList.add('core-viz');
    if (sc.classList.contains('l1-canvas')) frame.classList.add('l1-viz');
    sc.parentNode.insertBefore(frame, sc); frame.appendChild(sc);
    if (baseW < 760 && !inlineMin){
      sc.dataset.enhanced = 'lite'; sc.classList.add('viz-lite'); sc._vizSetViewBox(originalVB); return;
    }
    var bar = document.createElement('div'); bar.className = 'viz-bar'; frame.insertBefore(bar, sc);
    h('span', {'class': 'viz-label'}, bar, 'hardware canvas');
    h('span', {'class':'viz-sub'}, bar, 'switch views instead of zooming');
    h('span', {'class': 'grow'}, bar);
    var bFull = h('button', {type:'button','class':'viz-focus','aria-label':'Open hardware canvas in full viewport','data-viz-full':'1'}, bar, 'focus canvas');

    function apply(){
      svg.style.width = '100%';
      svg.style.height = frame.classList.contains('is-fullscreen') ? '100%' : 'auto';
    }
    sc._vizApply = apply;
    bFull.onclick = function(){
      if (frame.classList.contains('is-fullscreen')){ closeFullscreenViz(); return; }
      if (fullscreenViz) closeFullscreenViz();
      fullscreenViz = frame; frame.classList.add('is-fullscreen'); document.body.classList.add('viz-open'); bFull.textContent = 'exit focus';
      setTimeout(apply, 20);
    };
    window.addEventListener('resize', function(){ setTimeout(apply, 20); }, {passive:true});
    sc._vizSetViewBox(originalVB);
    setTimeout(apply, 0);
  }

  function makeDisclosure(node, title, copy, open){
    if (!node || node.parentNode && node.parentNode.classList && node.parentNode.classList.contains('concept-disclosure')) return null;
    var d = document.createElement('details'); d.className = 'concept-disclosure'; d.open = !!open;
    var sm = document.createElement('summary');
    sm.innerHTML = '<span><b>' + title + '</b>' + (copy ? '<small>' + copy + '</small>' : '') + '</span><i class="disclosure-chevron" aria-hidden="true">›</i>';
    node.parentNode.insertBefore(d, node); d.appendChild(sm); d.appendChild(node); return d;
  }

  var TERM_COLORS = {core:'#a78bfa',xlate:'#60a5fa',cache:'#4ade80',memory:'#22d3ee',io:'#a3e635',order:'#fb7185',coh:'#e879f9',pref:'#fde047'};
  var TERM_LABEL = {core:'CPU core',xlate:'Translation',cache:'Cache',memory:'DRAM',io:'Devices & I/O',order:'Memory ordering',coh:'Coherence',pref:'Prefetching'};
  function termCategory(key){
    var sets = {
      core:'isa uop mop pc bp btb ras l1i itlb fetchwin predecode decode opcache uq fusion zx modrm rex rename rat crat prf freelist dispatch rob sched wakeup issue port alu agu bypass lsu lq sq sta std stlf disamb retire commit senior squash mispredict spec smt ipc mab',
      xlate:'va pa page vpn pfn mmu tlb dtlb pte pml4 cr3 walk pwc reach huge pcid pf ftouch',
      cache:'line set way tag index offset hit miss valid dirty wbk wthru walloc rfo evict plru vipt incl victimc shadow pfilter ccx mlp ltu wset sloc tloc sram',
      memory:'dramcell fabric umc channel dimm bank row rowbuf act tcl burst refresh',
      io:'pcie tlp rc mmio bar doorbell dma iommu iova msix nvme iocoh',
      order:'memtype pat wc nt clflush fence tso',
      coh:'coh moesi st_m st_o st_e st_s st_i probe fshare',
      pref:'pref stream stride swpf late pollute memwall'
    };
    for (var k in sets) if ((' ' + sets[k] + ' ').indexOf(' ' + key + ' ') >= 0) return k;
    return 'core';
  }

  function glossGraphic(key){
    var cat = termCategory(key), c = TERM_COLORS[cat] || '#94a3b8';
    function svg(inner){ return '<div class="term-mini" style="--mini:'+c+'"><svg viewBox="0 0 320 92" aria-hidden="true">'+inner+'</svg></div>'; }
    if (key === 'tlb' || key === 'dtlb' || key === 'walk' || key === 'pml4') return svg('<rect x="8" y="28" width="74" height="36" rx="7"/><text x="45" y="50">VA</text><path d="M86 46H120"/><rect x="124" y="18" width="82" height="56" rx="8" class="hot"/><text x="165" y="42">TLB</text><text x="165" y="58" class="s">VPN → PFN</text><path d="M210 46H244"/><rect x="248" y="28" width="64" height="36" rx="7"/><text x="280" y="50">PA</text>');
    if (key === 'rob' || key === 'retire') return svg('<path d="M70 46a42 30 0 1 0 84 0a42 30 0 1 0-84 0" class="ring"/><circle cx="87" cy="27" r="6" class="hot"/><circle cx="137" cy="65" r="6"/><path d="M170 46H236"/><text x="203" y="34" class="s">oldest first</text><rect x="240" y="28" width="70" height="36" rx="7"/><text x="275" y="50">RETIRE</text>');
    if (key === 'sq' || key === 'stlf' || key === 'commit') return svg('<rect x="10" y="18" width="76" height="56" rx="8"/><text x="48" y="42">CORE</text><text x="48" y="58" class="s">store</text><path d="M90 46H126"/><rect x="130" y="14" width="84" height="64" rx="8" class="hot"/><text x="172" y="40">SQ</text><text x="172" y="57" class="s">addr + data</text><path d="M218 46H252"/><rect x="256" y="18" width="56" height="56" rx="8"/><text x="284" y="50">L1d</text>');
    if (key === 'line' || key === 'set' || key === 'way' || key === 'plru') return svg('<text x="10" y="18" class="s">one 64-byte cache line</text><rect x="10" y="28" width="300" height="38" rx="7"/><path d="M47 28V66M84 28V66M121 28V66M158 28V66M195 28V66M232 28V66M269 28V66"/><rect x="121" y="28" width="37" height="38" class="hot"/><text x="139" y="51">8B</text>');
    if (key === 'moesi' || key === 'coh' || key === 'probe') return svg('<circle cx="42" cy="46" r="22" class="hot"/><text x="42" y="51">M</text><circle cx="112" cy="24" r="20"/><text x="112" y="29">O</text><circle cx="112" cy="68" r="20"/><text x="112" y="73">E</text><circle cx="202" cy="24" r="20"/><text x="202" y="29">S</text><circle cx="276" cy="46" r="22"/><text x="276" y="51">I</text><path d="M66 42L90 29M66 51L90 63M133 24H178M133 68L255 50M223 27L257 39"/>');
    if (key === 'rowbuf' || key === 'bank' || key === 'dramcell') return svg('<text x="10" y="18" class="s">DRAM bank</text><g class="grid"><rect x="10" y="26" width="220" height="48" rx="5"/><path d="M10 38H230M10 50H230M10 62H230M42 26V74M74 26V74M106 26V74M138 26V74M170 26V74M202 26V74"/></g><rect x="10" y="49" width="220" height="13" class="hot"/><path d="M238 55H270"/><rect x="274" y="34" width="38" height="42" rx="5"/><text x="293" y="51">row</text><text x="293" y="64">buf</text>');
    if (key === 'dma' || key === 'iommu' || key === 'nvme') return svg('<rect x="8" y="26" width="70" height="40" rx="7"/><text x="43" y="50">NVMe</text><path d="M82 46H120"/><rect x="124" y="20" width="76" height="52" rx="8" class="hot"/><text x="162" y="43">IOMMU</text><text x="162" y="59" class="s">IOVA → PA</text><path d="M204 46H242"/><rect x="246" y="26" width="66" height="40" rx="7"/><text x="279" y="50">RAM</text>');
    return '';
  }

  function addFocusStrip(sec, sc, views, opts){
    if (!sc || sc.dataset.focusStrip) return null; sc.dataset.focusStrip = '1'; opts = opts || {};
    var frame = sc.closest('.viz-frame'); if (!frame || !views || !views.length) return null;
    var strip = document.createElement('div'); strip.className = 'focus-strip';
    h('span', {'class':'focus-label'}, strip, opts.label || 'hardware view');
    var bPrev = h('button',{type:'button','class':'focus-step','aria-label':'Previous hardware view'},strip,'‹');
    var rail = h('div', {'class':'focus-tabs','role':'tablist'}, strip);
    var bNext = h('button',{type:'button','class':'focus-step','aria-label':'Next hardware view'},strip,'›');
    var scroller = frame.querySelector('.scroller'); frame.insertBefore(strip, scroller || null);
    var active = null, auto = opts.auto !== false, bs = {}, activeIndex = 0, follow = null;
    function set(id, source){
      var v = views.filter(function(x){ return x.id === id; })[0] || views[0]; if (!v) return;
      active = v.id; activeIndex = Math.max(0, views.indexOf(v)); if (source === 'manual') auto = false;
      if (sc._vizAnimateViewBox) sc._vizAnimateViewBox(v.box); else if (sc._vizSetViewBox) sc._vizSetViewBox(v.box);
      for (var k in bs){ var on = k === active; bs[k].classList.toggle('on', on); bs[k].setAttribute('aria-selected', on ? 'true' : 'false'); }
      if (follow) follow.classList.toggle('on', auto);
      strip.dataset.active = active;
      var onb=bs[active]; if(onb && onb.scrollIntoView) onb.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
      frame.classList.remove('view-switched'); void frame.offsetWidth; frame.classList.add('view-switched');
      setTimeout(function(){frame.classList.remove('view-switched');},620);
    }
    views.forEach(function(v){
      var b = h('button',{type:'button','data-view':v.id,'role':'tab','aria-selected':'false'},rail,v.label); bs[v.id]=b; b.onclick=function(){set(v.id,'manual');};
    });
    bPrev.onclick=function(){ set(views[(activeIndex - 1 + views.length) % views.length].id,'manual'); };
    bNext.onclick=function(){ set(views[(activeIndex + 1) % views.length].id,'manual'); };
    if (opts.follow !== false){
      follow = h('button',{type:'button','class':'focus-follow'},strip,'follow step');
      follow.onclick=function(){ auto=!auto; follow.classList.toggle('on',auto); if(auto && opts.current) set(opts.current(),'follow'); };
    }
    var api = {set:set, follow:function(id){ if(auto) set(id,'follow'); }, isAuto:function(){return auto;}, strip:strip, views:views};
    set((opts.initial || views[0].id),'init');
    return api;
  }

  function compactInputHelp(card){
    if (!card || card.dataset.compactHelp) return; card.dataset.compactHelp='1';
    var ps = card.querySelectorAll('p.note'); if (!ps.length) return;
    var help = ps[ps.length-1]; if (help.classList.contains('l1err')) return;
    var d=document.createElement('details'); d.className='control-help'; var sm=document.createElement('summary'); sm.textContent='input rules'; d.appendChild(sm);
    help.parentNode.insertBefore(d, help); d.appendChild(help);
  }

  function enhanceCoreWorkbench(sec){
    var intro=sec.querySelector('.core-intro'); makeDisclosure(intro,'How the model works','Keep the full model assumptions and Zen+ size comparison available without occupying the simulator viewport.',false);
    var sc=sec.querySelector('.core-floorplan');
    var cam=addFocusStrip(sec,sc,[
      {id:'overview',label:'Overview',box:[0,0,1200,445]},
      {id:'front',label:'Front end',box:[0,0,820,304]},
      {id:'rename',label:'Rename',box:[540,62,660,245]},
      {id:'execute',label:'Execute',box:[0,130,850,315]},
      {id:'memory',label:'Load / store',box:[430,160,770,285]},
      {id:'retire',label:'Retire',box:[0,95,700,260]}
    ],{auto:false,follow:false,initial:'overview',label:'hardware view'});
    sec._cameraFocus=cam;
    var gantt=sec.querySelector('.core-gantt'); makeDisclosure(gantt,'Pipeline timeline','Open the full µop × cycle Gantt only when you need the dense chronology.',false);
  }

  function enhanceTranslationWorkbench(sec){
    var body=sec.querySelector('.chapter-body'); if(!body || body.dataset.workbench) return; body.dataset.workbench='1';
    var grids=body.querySelectorAll(':scope > .grid2'); if(grids[0]) makeDisclosure(grids[0],'Translation model','Why translation is required and why a DTLB hit overlaps the VIPT L1d lookup.',false);
    if(grids[1]) makeDisclosure(grids[1],'Deeper translation notes','TLB reach, PCIDs and context-switch behavior stay here when you want the details.',false);
    var scenario=null; Array.prototype.some.call(body.children,function(el){ if(el.classList && el.classList.contains('stp') && !el.classList.contains('stepper-bar')){scenario=el; return true;} return false; });
    var step=body.querySelector('.stepper'), sc=body.querySelector('.scroller'); if(!step || !sc) return;
    var frame=sc.closest('.viz-frame');
    var lab=document.createElement('div'); lab.className='sim-workbench xlate-workbench'; frame.parentNode.insertBefore(lab, frame);
    var rail=document.createElement('aside'); rail.className='lab-rail'; var stage=document.createElement('div'); stage.className='lab-stage'; lab.appendChild(rail); lab.appendChild(stage);
    if(scenario){scenario.classList.add('scenario-dock'); rail.appendChild(scenario);} step.classList.add('xlate-stepper'); rail.appendChild(step); stage.appendChild(frame);
    var cam=addFocusStrip(sec,sc,[
      {id:'overview',label:'Overview',box:[0,0,1200,720]},
      {id:'address',label:'Address',box:[0,0,1200,330]},
      {id:'tlb',label:'TLBs',box:[0,115,1200,300]},
      {id:'walk',label:'Page walk',box:[0,320,1200,400]},
      {id:'entry',label:'PTE bits',box:[0,520,800,240]},
      {id:'pa',label:'Physical address',box:[760,500,440,264]}
    ],{initial:'overview',label:'translation view'});
    sec._cameraFocus=cam;
    step.addEventListener('memstepchange',function(e){ var f=e.detail.frame,id='overview'; if(f.p==='VA') id='address'; else if(f.p==='lookup'||f.l2) id='tlb'; else if(f.lvl||f.walker||f.kernel||f.pte!==undefined) id='walk'; else if(f.pa) id='pa'; cam.follow(id); });
  }

  function enhanceL1Workbench(sec){
    var body=sec.querySelector('.chapter-body'); if(!body || body.dataset.workbench) return; body.dataset.workbench='1';
    var intro=body.querySelector('.l1-intro'); makeDisclosure(intro,'Cache geometry & metadata','The full set/way/VIPT and line-metadata explanation remains available without pushing the live cache below the fold.',false);
    var step=body.querySelector('.l1-stepper'), custom=body.querySelector('.l1-custom'), sc=body.querySelector('.l1-canvas'); if(!step||!custom||!sc) return;
    compactInputHelp(custom); custom.classList.add('sticky-input');
    var frame=sc.closest('.viz-frame'), legend=body.querySelector('.l1-legend');
    var lab=document.createElement('div'); lab.className='sim-workbench l1-workbench'; frame.parentNode.insertBefore(lab, frame);
    var rail=document.createElement('aside'); rail.className='lab-rail'; var stage=document.createElement('div'); stage.className='lab-stage'; lab.appendChild(rail);lab.appendChild(stage);
    rail.appendChild(custom); rail.appendChild(step); stage.appendChild(frame); if(legend) stage.appendChild(legend);
    var cam=addFocusStrip(sec,sc,[
      {id:'overview',label:'Overview',box:[0,0,1200,800]},
      {id:'address',label:'Address',box:[0,0,1200,180]},
      {id:'set',label:'Set read',box:[0,110,650,470]},
      {id:'compare',label:'Tag compare',box:[110,120,520,470]},
      {id:'data',label:'Data / mux',box:[560,110,640,470]},
      {id:'replace',label:'Replacement',box:[210,545,760,285]},
      {id:'miss',label:'Miss path',box:[580,545,620,285]}
    ],{initial:'overview',label:'cache view'});
    sec._cameraFocus=cam;
    step.addEventListener('memstepchange',function(e){ var ph=e.detail.frame.ph,id='overview'; if(ph==='split')id='address'; else if(ph==='read')id='set'; else if(ph==='compare')id='compare'; else if(ph==='select'||ph==='all')id='data'; else if(ph==='miss'||ph==='writeback'||ph==='fill')id='miss'; cam.follow(id); });
  }

  function directChild(body, selector){
    if(!body) return null;
    for(var i=0;i<body.children.length;i++) if(body.children[i].matches && body.children[i].matches(selector)) return body.children[i];
    return null;
  }

  function buildGenericWorkbench(sec, opts){
    opts=opts||{}; var body=sec.querySelector('.chapter-body'); if(!body || body.dataset.genericWorkbench) return null;
    var sc=opts.scroller || body.querySelector('.scroller'); if(!sc) return null;
    var frame=sc.closest('.viz-frame'); if(!frame) return null;
    var step=opts.stepper || directChild(body,'.stepper');
    var scenario=opts.scenario || directChild(body,'.stp:not(.stepper-bar)');
    var lab=document.createElement('div'); lab.className='sim-workbench generic-workbench '+(opts.className||'');
    frame.parentNode.insertBefore(lab,frame);
    var rail=document.createElement('aside'); rail.className='lab-rail'; var stage=document.createElement('div'); stage.className='lab-stage';
    lab.appendChild(rail); lab.appendChild(stage);
    if(scenario && scenario.parentNode){ scenario.classList.add('scenario-dock'); rail.appendChild(scenario); }
    if(opts.railExtra) opts.railExtra.forEach(function(n){ if(n&&n.parentNode) rail.appendChild(n); });
    if(step && step.parentNode){ step.classList.add('guided-stepper'); rail.appendChild(step); }
    stage.appendChild(frame);
    if(opts.stageExtra) opts.stageExtra.forEach(function(n){ if(n&&n.parentNode) stage.appendChild(n); });
    body.dataset.genericWorkbench='1';
    var cam=opts.views ? addFocusStrip(sec,sc,opts.views,{initial:(opts.initial||'overview'),label:(opts.label||'hardware view'),follow:opts.follow!==false}) : null;
    if(cam) sec._cameraFocus=cam;
    if(step && cam && opts.stepMap){
      step.addEventListener('memstepchange',function(e){ var id=opts.stepMap(e.detail.frame,e.detail.index)||'overview'; cam.follow(id); });
    }
    return {lab:lab,rail:rail,stage:stage,camera:cam,stepper:step,scenario:scenario,frame:frame};
  }

  function enhanceAllChapterWorkbench(sec){
    var id=sec.id;
    if(id==='ch-map'){
      var sc=sec.querySelector('.map-canvas'); if(sc) sec._cameraFocus=addFocusStrip(sec,sc,[
        {id:'overview',label:'Whole machine',box:[0,0,1200,760]},
        {id:'core',label:'CPU + caches',box:[15,35,780,405]},
        {id:'memory',label:'Fabric + DRAM',box:[0,350,800,410]},
        {id:'io',label:'I/O + devices',box:[760,20,440,740]}
      ],{auto:false,follow:false,initial:'overview',label:'system view'});
    }
    if(id==='ch-hier'){
      buildGenericWorkbench(sec,{className:'hier-workbench',views:[
        {id:'overview',label:'Overview',box:[0,0,1200,560]},
        {id:'core',label:'Core + L2',box:[0,0,760,275]},
        {id:'l3',label:'L3 + shadows',box:[0,245,980,160]},
        {id:'fabric',label:'Fabric',box:[0,360,1200,125]},
        {id:'dram',label:'Memory',box:[0,440,1200,120]}
      ],stepMap:function(f){ var p=(f.p||'').toLowerCase(); if(p.indexOf('l1')>=0||p.indexOf('l2')>=0)return'core'; if(p.indexOf('l3')>=0||p.indexOf('shadow')>=0||p.indexOf('probe')>=0)return'l3'; if(p.indexOf('fabric')>=0)return'fabric'; if(p.indexOf('dram')>=0||p.indexOf('return')>=0)return'dram'; return'overview'; }});
    }
    if(id==='ch-dram'){
      buildGenericWorkbench(sec,{className:'dram-workbench',scenario:null,views:[
        {id:'overview',label:'Overview',box:[0,0,1200,730]},
        {id:'queue',label:'Requests',box:[0,0,620,220]},
        {id:'address',label:'Address map',box:[590,0,610,220]},
        {id:'banks',label:'Banks',box:[0,190,520,300]},
        {id:'row',label:'Open row',box:[465,190,735,300]},
        {id:'timeline',label:'Commands',box:[0,455,1200,275]}
      ],stepMap:function(f){ var p=(f.p||''); if(p==='map')return'address'; if(/^ACT|^RD|^PRE/.test(p))return p.indexOf('RD')===0?'row':'banks'; if(p==='REF')return'timeline'; return'overview'; }});
    }
    if(id==='ch-stores'){
      buildGenericWorkbench(sec,{className:'stores-workbench',views:[
        {id:'overview',label:'Overview',box:[0,0,1200,400]},
        {id:'queue',label:'Store queue',box:[0,0,330,290]},
        {id:'l1',label:'L1 ownership',box:[280,0,350,290]},
        {id:'peer',label:'Peer core',box:[600,0,315,290]},
        {id:'coherence',label:'L3 / probes',box:[860,0,340,300]},
        {id:'dram',label:'DRAM',box:[0,285,1200,115]}
      ],stepMap:function(f){ var p=(f.p||'').toLowerCase(); if(p==='execute'||p==='retire')return'queue'; if(p==='commit'||p==='coalesce')return'l1'; if(p==='upgrade'||p==='invalidate')return'peer'; if(p==='rfo'||p==='fill')return'coherence'; if(p==='stale')return'dram'; return'overview'; }});
    }
    if(id==='ch-coh'){
      var stats=sec.querySelector('.chapter-body > .card:last-child'),free=sec.querySelector('.chapter-body > .card[style*=\"display:none\"]');
      buildGenericWorkbench(sec,{className:'coh-workbench',railExtra:free?[free]:[],stageExtra:stats?[stats]:[],views:[
        {id:'overview',label:'Overview',box:[0,0,1200,430]},
        {id:'cores',label:'Private caches',box:[0,0,1200,205]},
        {id:'directory',label:'L3 directory',box:[0,195,1200,125]},
        {id:'memory',label:'DRAM',box:[0,315,1200,115]}
      ],stepMap:function(f){ return f && f.A && f.A.length ? 'cores' : 'overview'; }});
    }
    if(id==='ch-pref'){
      var body=sec.querySelector('.chapter-body'),sc=directChild(body,'.scroller'),note=directChild(body,'.card:not(.grid2 .card)');
      buildGenericWorkbench(sec,{className:'pref-workbench',scroller:sc,stepper:null,stageExtra:note?[note]:[],views:[
        {id:'overview',label:'Full run',box:[0,0,1200,520]},
        {id:'early',label:'Warm-up',box:[0,0,650,420]},
        {id:'late',label:'Steady state',box:[540,0,660,420]}
      ],follow:false});
    }
    if(id==='ch-dev'){
      buildGenericWorkbench(sec,{className:'dev-workbench',scenario:null,views:[
        {id:'overview',label:'Overview',box:[0,0,1200,600]},
        {id:'cpu',label:'CPU + queues',box:[0,0,590,600]},
        {id:'iommu',label:'IOMMU / PCIe',box:[540,170,360,430]},
        {id:'ssd',label:'NVMe SSD',box:[860,0,340,600]},
        {id:'memory',label:'Host memory',box:[0,220,780,380]}
      ],stepMap:function(f){ var p=(f.p||'').toLowerCase(); if(p==='command'||p==='consume'||p==='use')return'cpu'; if(p==='doorbell'||p==='mwr'||p==='fetch'||p==='msi-x')return'iommu'; if(p==='flash')return'ssd'; if(p==='data'||p==='cqe')return'memory'; return'overview'; }});
    }
  }

  function enhanceCoreInspector(sec){
    var grid = sec.querySelector('.pgrid');
    if (!grid || grid.dataset.inspector) return;
    grid.dataset.inspector = '1'; grid.classList.add('inspector-mode');
    var cards = Array.prototype.slice.call(grid.children);
    if (!cards.length) return;
    var labels = ['Front end','RAT','Registers','ROB','Schedulers','Ports','Load queue','Store queue','Memory'];
    var deck = document.createElement('div'); deck.className = 'inspector-deck';
    var head = h('div', {'class':'inspector-head'}, deck, '<div><span>state inspector</span><strong>Open one structure without losing the cycle context.</strong></div>');
    var tabs = h('div', {'class':'inspector-tabs','role':'tablist','aria-label':'Core state inspector'}, deck);
    grid.parentNode.insertBefore(deck, grid);
    function select(k){
      cards.forEach(function(card, i){ card.classList.toggle('inspector-active', k === 'all' || i === k); });
      var bs = tabs.querySelectorAll('button'); for (var j = 0; j < bs.length; j++) bs[j].classList.toggle('on', bs[j].dataset.k === String(k));
      grid.classList.toggle('show-all', k === 'all');
    }
    cards.forEach(function(card, i){
      var b = h('button', {type:'button','data-k':String(i),'role':'tab'}, tabs, labels[i] || ('Panel ' + (i + 1)));
      b.onclick = function(){ select(i); };
    });
    var all = h('button', {type:'button','class':'all-state','data-k':'all','role':'tab'}, tabs, 'all state');
    all.onclick = function(){ select('all'); };
    var map = {bp:0,ic:0,pd:0,de:0,uq:0,rn:1,rob:3,alus:4,agus:4,alup:5,agup:5,lsu:8,l2:8};
    var blocks = sec.querySelectorAll('[data-core-block]');
    for (var i = 0; i < blocks.length; i++) (function(el){
      var k = map[el.getAttribute('data-core-block')]; if (k === undefined) return;
      el.setAttribute('tabindex','0'); el.setAttribute('role','button');
      function open(){
        select(k);
        if (sec._cameraFocus){
          var vm={bp:'front',ic:'front',pd:'front',de:'front',uq:'front',rn:'rename',rob:'retire',alus:'execute',agus:'execute',alup:'execute',agup:'execute',lsu:'memory',l2:'memory'};
          if(vm[el.getAttribute('data-core-block')]) sec._cameraFocus.set(vm[el.getAttribute('data-core-block')],'manual');
        }
        var r = deck.getBoundingClientRect(); if (r.top < 70 || r.bottom > window.innerHeight) deck.scrollIntoView({block:'nearest',behavior:'smooth'});
      }
      el.addEventListener('click', open); el.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); } });
    })(blocks[i]);
    select(0);
  }

  function wrapLearningScene(body, id, title, copy, nodes){
    nodes = (nodes || []).filter(function(n){ return n && n.parentNode; }); if (!nodes.length) return null;
    var scene = document.createElement('section'); scene.className = 'learning-scene'; scene.dataset.scene = id;
    var first = nodes[0]; first.parentNode.insertBefore(scene, first);
    var lead = document.createElement('div'); lead.className = 'scene-lead';
    lead.innerHTML = '<span class="scene-kicker"></span><div><h2>' + title + '</h2>' + (copy ? '<p>' + copy + '</p>' : '') + '</div>';
    scene.appendChild(lead); nodes.forEach(function(n){ scene.appendChild(n); }); return scene;
  }

  function makeGuidedJourney(sec, defs){
    if (!sec || sec.dataset.guided || !defs || !defs.length) return; sec.dataset.guided = '1';
    var body = sec.querySelector('.chapter-body'); if (!body) return;
    var scenes = defs.map(function(d){ return wrapLearningScene(body,d.id,d.title,d.copy,d.nodes); }).filter(Boolean); if (!scenes.length) return;
    var nav = document.createElement('div'); nav.className = 'learning-journey';
    var head = h('div', {'class':'journey-head'}, nav, '<div><span>guided chapter</span><strong>One concept at a time</strong></div>');
    var controls = h('div', {'class':'journey-controls'}, nav);
    var bPrev = h('button',{type:'button','class':'journey-arrow','aria-label':'Previous learning scene'},controls,'←');
    var track = h('div', {'class':'journey-track','role':'tablist','aria-label':'Chapter learning path'}, controls);
    var bNext = h('button',{type:'button','class':'journey-arrow','aria-label':'Next learning scene'},controls,'→');
    var bAll = h('button',{type:'button','class':'journey-all'},controls,'show all');
    body.insertBefore(nav, body.firstChild);
    var buttons=[], current=0, all=false; nav.style.setProperty('--journey-count', scenes.length);
    scenes.forEach(function(scene,i){
      var d=defs[i] || {}; var b=h('button',{type:'button','role':'tab','aria-selected':'false'},track,'<b>'+String(i+1).padStart(2,'0')+'</b><span>'+d.title+'</span>');
      b.onclick=function(){ all=false; bAll.textContent='show all'; select(i,true); }; buttons.push(b);
      var foot=h('div',{'class':'scene-nav'},scene);
      if(i>0){ var p=h('button',{type:'button','class':'scene-prev'},foot,'← '+defs[i-1].title); p.onclick=function(){select(i-1,true);}; }
      else h('span',{'class':'scene-nav-spacer'},foot);
      if(i<scenes.length-1){ var n=h('button',{type:'button','class':'scene-next pri'},foot,'Continue · '+defs[i+1].title+' →'); n.onclick=function(){select(i+1,true);}; }
      else { var done=h('button',{type:'button','class':'scene-next pri'},foot,'Chapter complete · review all'); done.onclick=function(){ bAll.click(); }; }
    });
    function updateSceneKickers(){ scenes.forEach(function(scene,i){ var k=scene.querySelector('.scene-kicker'); if(k) k.textContent=(i===0?'START HERE · ':'')+(i+1)+' / '+scenes.length; }); }
    function select(i, scroll){
      current=Math.max(0,Math.min(scenes.length-1,i)); sec.classList.toggle('guided-all',all);
      scenes.forEach(function(scene,k){ scene.hidden = !all && k!==current; scene.classList.toggle('scene-active',all || k===current); });
      buttons.forEach(function(b,k){ var on=k===current&&!all; b.classList.toggle('on',on); b.setAttribute('aria-selected',on?'true':'false'); });
      bPrev.disabled=all||current===0; bNext.disabled=all||current===scenes.length-1;
      if(!all){ var scs=scenes[current].querySelectorAll('.scroller'); for(var q=0;q<scs.length;q++) if(scs[q]._vizApply) setTimeout(scs[q]._vizApply,20); }
      if(scroll){ var r=nav.getBoundingClientRect(); if(r.top < 0 || r.top > 100) nav.scrollIntoView({block:'start',behavior:'smooth'}); }
    }
    bPrev.onclick=function(){ if(!all)select(current-1,true); }; bNext.onclick=function(){ if(!all)select(current+1,true); };
    bAll.onclick=function(){ all=!all; bAll.textContent=all?'focus mode':'show all'; select(current,false); };
    updateSceneKickers(); select(0,false);
  }

  function installGuidedJourney(sec){
    var body=sec.querySelector('.chapter-body'); if(!body) return;
    var ds=sec.querySelectorAll('.concept-disclosure');
    function q(sel){return sec.querySelector(sel);} function kids(sel){return Array.prototype.slice.call(body.querySelectorAll(':scope > '+sel));}
    if(sec.id==='ch-map'){
      makeGuidedJourney(sec,[
        {id:'atlas',title:'See the whole machine',copy:'Start with the system map. Select blocks instead of reading every label at once.',nodes:[q('.map-workbench')]},
        {id:'route',title:'Follow the route',copy:'Use the chapter route only after the hardware map is familiar.',nodes:[q('.route-index')]}
      ]);
    } else if(sec.id==='ch-code'){
      var tops=Array.prototype.slice.call(body.children);
      makeGuidedJourney(sec,[
        {id:'orient',title:'Orient',copy:'Anchor the calling convention and the exact running example.',nodes:[tops[0]]},
        {id:'map',title:'C → assembly',copy:'Hover and select one source line or instruction at a time.',nodes:[tops[1]]},
        {id:'decode',title:'Decode one instruction',copy:'Read the encoding fields and the µops for the selected instruction.',nodes:[tops[2]]},
        {id:'bytes',title:'See the bytes',copy:'Place the same instructions back into memory and the fetch window.',nodes:[tops[3]]},
        {id:'predecode',title:'Why predecode exists',copy:'Finish with instruction boundaries and the decoder feed.',nodes:[tops[4]]}
      ]);
    } else if(sec.id==='ch-core'){
      makeGuidedJourney(sec,[
        {id:'orient',title:'Orient',copy:'Understand what the model represents before touching the cycle controls.',nodes:[ds[0]]},
        {id:'run',title:'Run the core',copy:'Step the machine. The active structures and signal paths change with the cycle.',nodes:[q('.core-controls'),q('.core-viz'),q('.core-events')]},
        {id:'inspect',title:'Inspect state',copy:'Open one structure at a time while keeping the current cycle fixed.',nodes:[q('.inspector-deck'),q('.core-state-grid')]},
        {id:'timeline',title:'Read the timeline',copy:'Use the dense µop × cycle view only after you have a mental model of the hardware.',nodes:[ds[1]]}
      ]);
    } else if(sec.id==='ch-xlate'){
      makeGuidedJourney(sec,[
        {id:'orient',title:'Orient',copy:'Start with the reason translation exists and what a TLB hit buys you.',nodes:[ds[0]]},
        {id:'translate',title:'Translate an address',copy:'Walk one virtual address through the TLBs, page walker and physical address.',nodes:[q('.xlate-workbench')]},
        {id:'fault',title:'Handle a fault',copy:'See what changes when translation leaves hardware and enters the kernel.',nodes:[q('.xlate-kernel')]},
        {id:'depth',title:'Go deeper',copy:'Keep TLB reach, PCID and context-switch details available without crowding the main path.',nodes:[ds[1]]}
      ]);
    } else if(sec.id==='ch-l1d'){
      makeGuidedJourney(sec,[
        {id:'orient',title:'Orient',copy:'Learn the cache geometry and metadata once, then move into the live lookup.',nodes:[ds[0]]},
        {id:'lookup',title:'Run a lookup',copy:'Change the address or operation, then follow the highlighted set, tags, way and miss path.',nodes:[q('.l1-workbench')]}
      ]);
    } else if(sec.id==='ch-hier'){
      var cards=kids('.card');
      makeGuidedJourney(sec,[
        {id:'orient',title:'Orient',copy:'Understand inclusion, victim behavior and the role of shadow tags.',nodes:[directChild(body,'.grid2')]},
        {id:'miss',title:'Follow one miss',copy:'Choose where the line lives and follow the request outward and the line back.',nodes:[q('.hier-workbench')]},
        {id:'latency',title:'Compare latency',copy:'See how each cache level changes load-to-use time.',nodes:[cards[0]]},
        {id:'parallel',title:'Overlap misses',copy:'Contrast independent memory-level parallelism with a serialized pointer chase.',nodes:[cards[1]]},
        {id:'links',title:'Check the links',copy:'Finish with transfer widths and the cost of moving one 64-byte line.',nodes:[cards[2]]}
      ]);
    } else if(sec.id==='ch-dram'){
      makeGuidedJourney(sec,[
        {id:'orient',title:'Orient',copy:'Learn the bank/row model and the timing vocabulary first.',nodes:[directChild(body,'.grid2')]},
        {id:'commands',title:'Run the commands',copy:'Step ACT, RD, PRE and REF while the view follows the active part of DRAM.',nodes:[q('.dram-workbench')]},
        {id:'meaning',title:'Connect the costs',copy:'Compare row hit, closed-row and conflict costs without losing the device-level picture.',nodes:[directChild(body,'.grid3')]}
      ]);
    } else if(sec.id==='ch-stores'){
      var rem=Array.prototype.slice.call(body.children).filter(function(n){return n!==q('.stores-workbench');});
      makeGuidedJourney(sec,[
        {id:'path',title:'Run a store',copy:'Follow execution, retirement, ownership and commit as one guided path.',nodes:[q('.stores-workbench')]},
        {id:'types',title:'Change the memory type',copy:'Keep write-combining and memory-type rules as a separate concept.',nodes:[rem[0],rem[1]]},
        {id:'ordering',title:'Reason about ordering',copy:'Finish with fences and the ordering rules that the store queue exposes.',nodes:[rem[2]]}
      ]);
    } else if(sec.id==='ch-coh'){
      makeGuidedJourney(sec,[
        {id:'orient',title:'Orient',copy:'Learn the five states and how the L3 directory targets probes.',nodes:[directChild(body,'.grid2')]},
        {id:'run',title:'Run coherence',copy:'Switch scenarios, step one operation at a time, and watch ownership move between cores.',nodes:[q('.coh-workbench')]}
      ]);
    } else if(sec.id==='ch-pref'){
      makeGuidedJourney(sec,[
        {id:'orient',title:'Orient',copy:'Separate what the model assumes from what Zen+ actually publishes.',nodes:[directChild(body,'.grid2')]},
        {id:'experiment',title:'Experiment with prediction',copy:'Change pattern and distance, then compare covered, late and useless prefetches.',nodes:[q('.pref-workbench')]}
      ]);
    } else if(sec.id==='ch-dev'){
      makeGuidedJourney(sec,[
        {id:'orient',title:'Orient',copy:'Separate MMIO from DMA and understand the two NVMe rings.',nodes:[directChild(body,'.grid2')]},
        {id:'trace',title:'Trace one NVMe read',copy:'Step from the submission queue to flash, DMA, interrupt and application read.',nodes:[q('.dev-workbench')]},
        {id:'connect',title:'Connect the mechanisms',copy:'Use the cross-chapter summary only after the end-to-end path is clear.',nodes:[kids('.grid2').slice(-1)[0]]}
      ]);
    } else if(sec.id==='ch-e2e'){
      var top=Array.prototype.slice.call(body.children);
      makeGuidedJourney(sec,[
        {id:'scenario',title:'Choose the scenario',copy:'Pick translation, cache level and DRAM row state, then read the resulting critical path.',nodes:[top[0],top[1]]},
        {id:'steps',title:'Inspect the critical path',copy:'Open the step table only after the timeline gives you the shape of the cost.',nodes:[top[2]]},
        {id:'after',title:'What happens after',copy:'Finish with the state left behind by this instruction.',nodes:[top[3]]}
      ]);
    } else if(sec.id==='ch-gloss'){
      /* The glossary is intentionally search-first rather than a fake multi-step journey. */
      body.classList.add('glossary-workspace');
    }
  }

  function pulseActiveVisualization(sec){
    var frames=sec.querySelectorAll('.viz-frame');
    for(var i=0;i<frames.length;i++){
      var f=frames[i]; f.classList.remove('step-pulse'); void f.offsetWidth; f.classList.add('step-pulse');
      var active=f.querySelectorAll('svg .on,svg .flow,svg .bsel,svg .cur,svg .chg');
      for(var a=0;a<active.length;a++){
        var el=active[a]; el.classList.remove('attention-pulse'); try{void el.getBBox();}catch(er){void el.offsetWidth;} el.classList.add('attention-pulse');
        (function(x){setTimeout(function(){x.classList.remove('attention-pulse');},780);})(el);
      }
      (function(x){setTimeout(function(){x.classList.remove('step-pulse');},820);})(f);
    }
    var narr=sec.querySelectorAll('.narr');
    for(var j=0;j<narr.length;j++){ var n=narr[j]; n.classList.remove('narr-change'); void n.offsetWidth; n.classList.add('narr-change'); }
  }

  function enhanceChapter(sec){
    var sc = sec.querySelectorAll('.scroller'); for (var i = 0; i < sc.length; i++) enhanceScroller(sc[i]);
    var terms = sec.querySelectorAll('dfn[data-g]');
    for (var j = 0; j < terms.length; j++){
      terms[j].tabIndex = 0; terms[j].setAttribute('role','button');
      terms[j].classList.add('term-' + termCategory(terms[j].dataset.g));
      if (terms[j].textContent.length <= 24) terms[j].classList.add('term-nowrap');
    }
    if (sec.id === 'ch-core'){ enhanceCoreWorkbench(sec); enhanceCoreInspector(sec); }
    if (sec.id === 'ch-xlate') enhanceTranslationWorkbench(sec);
    if (sec.id === 'ch-l1d') enhanceL1Workbench(sec);
    enhanceAllChapterWorkbench(sec);
    installGuidedJourney(sec);
    sec.addEventListener('memstepchange', function(){ pulseActiveVisualization(sec); });
    sec.addEventListener('click',function(e){ if(e.target.closest && (e.target.closest('.seg button') || e.target.closest('.pill') || e.target.closest('.focus-tabs button'))) requestAnimationFrame(function(){pulseActiveVisualization(sec);}); });
    sec.addEventListener('change',function(e){ if(e.target.matches && 'INPUT SELECT'.indexOf(e.target.tagName)>=0) requestAnimationFrame(function(){pulseActiveVisualization(sec);}); });
  }

  /* ---------- popover ---------- */
  function initPop(){
    var pop = document.getElementById('pop'), locked = false, closeTimer = null, openTimer = null, active = null;
    pop.classList.add('gloss-pop');
    function place(t){
      var r = t.getBoundingClientRect(), w = Math.min(400, window.innerWidth - 24);
      pop.style.width = w + 'px'; pop.style.maxWidth = w + 'px'; pop.style.display = 'block';
      var ph = pop.offsetHeight, x = Math.max(12, Math.min(r.left + r.width / 2 - 36, window.innerWidth - w - 12));
      var y = r.bottom + 12, side = 'below';
      if (y + ph > window.innerHeight - 12){ y = Math.max(12, r.top - ph - 12); side = 'above'; }
      pop.style.left = x + 'px'; pop.style.top = y + 'px'; pop.dataset.side = side;
      pop.style.setProperty('--caret', Math.max(16, Math.min(w - 28, r.left + Math.min(r.width, 60) / 2 - x - 6)) + 'px');
    }
    function hidePop(){ pop.style.display='none'; pop.classList.remove('pop-in'); if(active) active.classList.remove('term-open'); active=null; }
    function esc(x){ return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
    function footer(key){
      var out = '', home = App.TERM_HOME && App.TERM_HOME[key], here = location.hash.slice(1), lab = App.CH_LABEL && App.CH_LABEL[home];
      if (home && lab && home !== here) out += '<a class="term-pop-ch" href="#' + home + '"><span>Taught in</span><b>' + lab[0] + ' \u00b7 ' + lab[1] + '</b><i aria-hidden="true">\u2192</i></a>';
      var src = (App.SRC && App.SRC[key]) || [];
      if (src.length) out += '<div class="term-pop-src"><span>Learn more</span>' + src.map(function(x){ return '<a href="' + esc(x[1]) + '" target="_blank" rel="noopener noreferrer"><b>' + esc(x[0]) + '</b><small>' + esc(x[2]) + ' \u2197</small></a>'; }).join('') + '</div>';
      return out ? '<div class="term-pop-foot">' + out + '</div>' : '';
    }
    function open(t, lock){
      clearTimeout(closeTimer);
      if (active && active !== t) active.classList.remove('term-open');
      active = t; locked = !!lock; t.classList.add('term-open');
      var key=t.dataset.g,d=G[key],cat=termCategory(key);
      var title=d?d.t:key,def=d?d.d:'(no entry)';
      pop.className = 'pop gloss-pop term-' + cat;
      pop.innerHTML='<i class="term-pop-caret" aria-hidden="true"></i><div class="term-pop-head"><span class="term-pop-cat">'+TERM_LABEL[cat]+'</span><b>'+title+'</b><button type="button" class="term-pop-close" aria-label="Close definition">\u00d7</button></div>'+glossGraphic(key)+'<p class="term-pop-def">'+def+'</p>'+footer(key);
      pop.querySelector('.term-pop-close').onclick=function(){locked=false;hidePop();};
      var chl = pop.querySelector('.term-pop-ch'); if (chl) chl.onclick = function(){ locked=false; hidePop(); };
      place(t);
      pop.classList.remove('pop-in'); void pop.offsetWidth; pop.classList.add('pop-in');
    }
    function scheduleClose(){ clearTimeout(closeTimer); closeTimer=setTimeout(function(){ if(!locked && !pop.matches(':hover')){hidePop();} },220); }
    document.addEventListener('mouseover',function(e){
      var t=e.target.closest&&e.target.closest('dfn[data-g]'); if(!t || t===active || (e.relatedTarget&&t.contains(e.relatedTarget))) return;
      clearTimeout(openTimer); openTimer=setTimeout(function(){open(t,false);},110);
    });
    document.addEventListener('mouseout',function(e){ var t=e.target.closest&&e.target.closest('dfn[data-g]'); if(t && !(e.relatedTarget&&t.contains(e.relatedTarget))) scheduleClose(); });
    pop.addEventListener('mouseenter',function(){clearTimeout(closeTimer);}); pop.addEventListener('mouseleave',scheduleClose);
    document.addEventListener('click', function(e){
      var t = e.target.closest && e.target.closest('dfn[data-g]');
      if (t){ open(t, true); e.stopPropagation(); return; }
      if (!e.target.closest('#pop')){ locked=false; hidePop(); }
    });
    document.addEventListener('focusin',function(e){ var t=e.target&&e.target.matches&&e.target.matches('dfn[data-g]')?e.target:null; if(t)open(t,false); });
    document.addEventListener('focusout',function(e){ if(e.target&&e.target.matches&&e.target.matches('dfn[data-g]'))scheduleClose(); });
    document.addEventListener('keydown', function(e){
      var t = e.target && e.target.matches && e.target.matches('dfn[data-g]') ? e.target : null;
      if (t && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); open(t, true); }
      if(e.key==='Escape' && active){locked=false;hidePop();}
    });
    window.addEventListener('scroll', function(){ if(!locked){hidePop();} }, {passive:true});
  }

  /* ---------- config drawer ---------- */
  function initCfg(){
    var dr = document.getElementById('cfg'), inn = document.getElementById('cfgIn');
    var rows = [
      ['ghz', 'Core clock (GHz)', '3750H max boost is 4.0; base 2.3'],
      ['l1', 'L1d load-to-use (cycles)', 'published Zen+: 4'],
      ['l2', 'L2 load-to-use (cycles)', 'published Zen+: 12 minimum'],
      ['l3', 'L3 load-to-use (cycles)', 'published Zen/Zen+ average: ~35'],
      ['dramNs', 'DRAM extra latency beyond L3 (ns)', 'ballpark only; depends on DIMMs'],
      ['tscGhz', 'TSC frequency (GHz)', 'measure your own with RDTSC against CLOCK_MONOTONIC']
    ];
    var html = '<h2>Latency model</h2><p class="note">Defaults are published Zen/Zen+ figures (WikiChip, 7-cpu.com), <b>not measurements from your machine</b>. Replace them with your own pointer-chase / working-set measurements and every dependent chapter updates.</p>';
    rows.forEach(function(r){ html += '<label><span>' + r[1] + '<small>' + r[2] + '</small></span><input type="number" step="any" min="0" data-k="' + r[0] + '" value="' + CFG[r[0]] + '"></label>'; });
    html += '<p class="note" id="cfgDram" style="margin-top:14px"></p><div style="display:flex;gap:8px;margin-top:18px"><button id="cfgReset">reset published defaults</button><button class="pri" id="cfgClose" style="margin-left:auto">done</button></div>';
    inn.innerHTML = html;
    function upd(){ document.getElementById('cfgDram').textContent = 'Current DRAM load-to-use model: ' + dramCycles() + ' cycles = ' + (dramCycles() / CFG.ghz).toFixed(1) + ' ns.'; }
    upd();
    inn.addEventListener('change', function(e){
      var k = e.target.dataset && e.target.dataset.k; if (!k) return;
      var v = parseFloat(e.target.value); if (!(v > 0)){ e.target.value = CFG[k]; return; }
      CFG[k] = v; try { localStorage.setItem('memE2E.cfg', JSON.stringify(CFG)); } catch(er){}
      upd(); cfgListeners.forEach(function(f){ f(); });
    });
    document.getElementById('cfgReset').onclick = function(){
      for (var k in CFG_DEF) CFG[k] = CFG_DEF[k];
      var ins = inn.querySelectorAll('input'); for (var i = 0; i < ins.length; i++) ins[i].value = CFG[ins[i].dataset.k];
      try { localStorage.removeItem('memE2E.cfg'); } catch(er){}
      upd(); cfgListeners.forEach(function(f){ f(); });
    };
    var opens = document.querySelectorAll('[data-open-cfg]'); for (var i = 0; i < opens.length; i++) opens[i].onclick = function(){ dr.classList.add('show'); };
    document.getElementById('cfgClose').onclick = function(){ dr.classList.remove('show'); };
    dr.addEventListener('click', function(e){ if (e.target === dr) dr.classList.remove('show'); });
  }

  /* ---------- stepper: frames = [{t: title, d: html, ...}] ---------- */
  function stepper(parent, opts){
    var wrap = h('div', {'class': 'stack stepper'}, parent);
    var bar = h('div', {'class': 'stp stepper-bar'}, wrap);
    var bBack = h('button', {type:'button'}, bar, '← back');
    var cnt = h('span', {'class': 'cnt'}, bar);
    var bNext = h('button', {'class': 'pri',type:'button'}, bar, 'next →');
    var bReset = h('button', {'class':'ghost',type:'button'}, bar, 'restart');
    h('span', {'class': 'grow'}, bar);
    var pills = h('div', {'class': 'pills'}, bar);
    var prog = h('div', {'class':'step-progress'}, wrap), progFill = h('i', null, prog);
    var narr = h('div', {'class': 'narr'}, wrap);
    var frames = [], i = 0;
    function render(){
      var f = frames[i]; if (!f) return;
      cnt.textContent = (i + 1) + ' / ' + frames.length;
      bBack.disabled = i === 0; bNext.disabled = i === frames.length - 1;
      progFill.style.width = (frames.length <= 1 ? 100 : (i / (frames.length - 1)) * 100) + '%';
      narr.innerHTML = '<h4>' + f.t + '</h4>' + (f.d.charAt(0) === '<' ? f.d : '<p>' + f.d + '</p>');
      var ps = pills.children;
      for (var k = 0; k < ps.length; k++) ps[k].className = 'pill' + (k === i ? ' cur' : k < i ? ' done' : '');
      if (ps[i] && ps[i].scrollIntoView) ps[i].scrollIntoView({block:'nearest',inline:'nearest'});
      opts.render(f, i);
      try { wrap.dispatchEvent(new CustomEvent('memstepchange',{bubbles:true,detail:{frame:f,index:i,total:frames.length}})); } catch(e){}
    }
    function set(fr, keep){
      frames = fr; if (!keep || i >= frames.length) i = 0;
      pills.innerHTML = '';
      if (opts.pills !== false) frames.forEach(function(f, k){
        var p = h('button', {'class': 'pill',type:'button'}, pills, f.p || String(k + 1));
        p.onclick = function(){ i = k; render(); };
      });
      render();
    }
    bBack.onclick = function(){ if (i > 0){ i--; render(); } };
    bNext.onclick = function(){ if (i < frames.length - 1){ i++; render(); } };
    bReset.onclick = function(){ i = 0; render(); };
    return {
      el: wrap, set: set, render: render,
      key: function(k){ if (k === 'ArrowRight'){ bNext.onclick(); return true; } if (k === 'ArrowLeft'){ bBack.onclick(); return true; } return false; },
      get i(){ return i; }, go: function(k){ i = Math.max(0, Math.min(frames.length - 1, k)); render(); }
    };
  }

  function seg(parent, items, onPick, init){
    var w = h('div', {'class': 'seg'}, parent), bs = [];
    items.forEach(function(it){
      var b = h('button', {type:'button'}, w, it[1]); bs.push(b);
      b.onclick = function(){ bs.forEach(function(x){ x.classList.remove('on'); }); b.classList.add('on'); onPick(it[0]); };
      if (it[0] === init) b.classList.add('on');
    });
    return w;
  }

  return {termCategory: termCategory, TERM_COLORS: TERM_COLORS, TERM_LABEL: TERM_LABEL, s: s, h: h, hx: hx, hb: hb, EX: EX, CFG: CFG, dramCycles: dramCycles, onCfg: onCfg,
          gloss: gloss, g: g, G: G, chapter: chapter, start: start, go: go, stepper: stepper, seg: seg};
})();
