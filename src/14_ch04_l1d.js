/* ======================= chapter: L1d lookup ======================= */
App.chapter({id: 'l1d', num: '04', short: 'L1d lookup', title: 'Inside an L1d lookup',
sub: 'Physical tag in hand, the access meets the 32 KB, 8-way L1d: one set read, eight tags compared at once, one way selected, eight bytes aligned. Then the same set under pressure: fills, pseudo-LRU victims, a dirty eviction and a conflict miss.',
build: function(root){
  var h = App.h, s = App.s, g = App.g, hx = App.hx;
  /* ---------- page map: same frames as every other chapter ---------- */
  var PFN = {'7ffd4a3c2': 0x1a3f7cn, '7ffd4a3c1': 0x0a47en, '7ffd4a3c3': 0x0f9d2n, '7f3a91c05': 0x2e8f0n, '7f3a91e2b': 0x3a0c4n, '7ffd4a3e9': 0x11b02n, '55555555a': 0x1c07an, '555555555': 0x2b4e1n};
  [0x2c417n, 0x09d33n, 0x31a5cn, 0x1e7b0n, 0x27c11n, 0x0c9f4n, 0x35e08n, 0x14a66n, 0x2f1d9n, 0x1b3c2n, 0x0e6a1n, 0x3c77en].forEach(function(p, k){ PFN[(0x7f3a8c000n + BigInt(k)).toString(16)] = p; });
  function pfnOf(vpn){ var k = vpn.toString(16); if (!(k in PFN)) PFN[k] = 0x20000n | ((vpn * 2654435761n) & 0x1ffffn); return PFN[k]; }
  function tr(va){ return (pfnOf(va >> 12n) << 12n) | (va & 0xfffn); }
  function cp(set){ return set.map(function(x){ return {v: x.v, d: x.d, tag: x.tag, words: x.words ? x.words.slice() : null, va: x.va, pa: x.pa}; }); }
  function mkState(){
    var st = {sets: [], plru: [], back: {}};
    st.line = function(pl){ var k = pl.toString(); if (!st.back[k]){ var w = []; for (var i = 0; i < 8; i++) w.push((pl >> 6n) % 900n + BigInt(i) * 100n); st.back[k] = w; } return st.back[k].slice(); };
    st.back[tr(0x7ffd4a3c2e40n).toString()] = [0n, 0n, 0n, 41n, 0n, 0n, 0n, 0n];
    for (var si = 0; si < 64; si++){ var set = []; for (var w = 0; w < 8; w++) set.push({v: 0, d: 0, tag: 0n, words: null, va: null, pa: null}); st.sets.push(set); st.plru.push([0, 0, 0, 0, 0, 0, 0]); }
    function put(si, w, va, d){ var pa = tr(va) & ~63n; st.sets[si][w] = {v: 1, d: d, tag: pa >> 12n, words: st.line(pa), va: va & ~63n, pa: pa}; }
    for (si = 0; si < 64; si++) if (si !== 57) for (w = 0; w < 5; w++) put(si, w, 0x7f3a90000000n + BigInt(w) * 0x1000n + BigInt(si) * 64n, 0);
    put(57, 0, 0x7ffd4a3c1e40n, 0); put(57, 1, 0x7f3a91c05e40n, 0); put(57, 3, 0x7ffd4a3c2e40n, 0); put(57, 4, 0x7ffd4a3e9e40n, 1); put(57, 6, 0x7f3a91e2be40n, 0);
    put(42, 6, 0x7ffd4a3c2a80n, 0); put(11, 6, 0x55555555a2c0n, 0);
    st.plru[57] = [1, 0, 1, 1, 0, 0, 1];
    return st;
  }
  function touch(b, w){ b[0] = w < 4 ? 1 : 0; if (w < 4) b[1] = (w & 3) < 2 ? 1 : 0; else b[2] = (w & 3) < 2 ? 1 : 0; b[3 + (w >> 1)] = (w & 1) ? 0 : 1; }
  function victimPath(b){ var n1 = b[0] ? 2 : 1, n2 = 3 + (n1 - 1) * 2 + b[n1]; return {nodes: [0, n1, n2], way: (n2 - 3) * 2 + b[n2]}; }
  function pathTo(w){ return [0, w < 4 ? 1 : 2, 3 + (w >> 1)]; }
  function access(st, a){
    var pa = tr(a.va), si = Number((a.va >> 6n) & 63n), tag = pa >> 12n, off = Number(a.va & 63n), wi = off >> 3;
    var set = st.sets[si], r = {a: a, va: a.va, pa: pa, si: si, tag: tag, off: off, wi: wi, before: cp(set), pl0: st.plru[si].slice()};
    r.cmp = set.map(function(x){ return !!x.v && x.tag === tag; });
    var hw = r.cmp.indexOf(true);
    if (hw >= 0){ r.hit = true; r.way = hw; }
    else {
      r.hit = false;
      var inv = -1; for (var i = 0; i < 8; i++) if (!set[i].v){ inv = i; break; }
      if (inv >= 0){ r.way = inv; r.byInvalid = true; } else { var vp = victimPath(st.plru[si]); r.way = vp.way; r.vnodes = vp.nodes; }
      var old = set[r.way];
      if (old.v){ r.evict = {va: old.va, pa: old.pa, tag: old.tag, d: old.d, words: old.words.slice()}; if (old.d){ st.back[old.pa.toString()] = old.words.slice(); r.wb = true; } }
      var ln = pa & ~63n;
      set[r.way] = {v: 1, d: 0, tag: tag, words: st.line(ln), va: a.va & ~63n, pa: ln};
    }
    var L = set[r.way];
    if (a.st){ r.wasDirty = !!L.d && r.hit; L.words[wi] = a.val; L.d = 1; r.val = a.val; } else r.val = L.words[wi];
    touch(st.plru[si], r.way); r.pl1 = st.plru[si].slice(); r.after = cp(set);
    return r;
  }
  var custom = [];
  function presets(){
    var L = [{va: 0x7ffd4a3c2e58n, who: 'C1.ld reads hist[123]'}, {va: 0x7ffd4a3c2e58n, st: 1, val: 42n, who: 'C1\u2019s store commits: hist[123] = 42'}, {va: 0x7ffd4a3c2e58n, st: 1, val: 43n, who: 'C2\u2019s store commits: hist[123] = 43'}];
    var st = mkState(); L.forEach(function(a){ access(st, a); });
    for (var k = 0; k < 12; k++){
      var a = {va: 0x7f3a8c000e40n + BigInt(k) * 0x1000n, who: 'load buf[' + (k * 512) + '] (another array, 4 KB stride)'};
      L.push(a); var r = access(st, a);
      if (r.evict && r.evict.tag === 0x1a3f7cn) break;
    }
    L.push({va: 0x7ffd4a3c2e58n, who: 'hist[123] read again'});
    return L;
  }

  /* ---------- intro ---------- */
  var intro = h('div', {'class': 'grid2 l1-intro'}, root);
  h('div', {'class': 'card'}, intro, '<h3>Geometry</h3><p>32 KB / 64-byte lines = 512 lines, arranged as 64 ' + g('set', 'sets') + ' \u00d7 8 ' + g('way', 'ways') + '. Bits 5:0 are the ' + g('offset') + ', bits 11:6 the ' + g('index') + ', bits 47:12 the ' + g('tag') + '. Index + offset = 12 bits = the page offset, so the set is chosen from the virtual address while the tag comes from the physical address: ' + g('vipt') + ' (Chapter 03).</p>');
  h('div', {'class': 'card'}, intro, '<h3>What one way stores</h3><p>' + g('valid', 'V') + ', ' + g('dirty', 'D') + ', a 36-bit physical tag and 64 data bytes. The index is never stored: the row it sits in is the index. On a ' + g('wbk', 'write-back') + ' the line\u2019s physical address is rebuilt as tag \u2016 index \u2016 000000. Replacement below is tree ' + g('plru') + '; AMD does not publish the exact L1d policy.</p>');

  /* ---------- SVG ---------- */
  var wrap = h('div', {'class': 'scroller l1-canvas'}, root);
  var sv = s('svg', {viewBox: '0 0 1200 800', style: 'min-width:920px'}, wrap);
  var E = {};
  function box(x, y, w, ht, t, cls){ var gr = s('g', null, sv); s('rect', {x: x, y: y, width: w, height: ht, rx: 9, 'class': cls || 'box'}, gr); if (t) s('text', {x: x + 10, y: y + 18, 'class': 'h'}, gr, t); return gr; }
  E.va = box(10, 14, 640, 86, 'Virtual address (from the AGU or the store queue)');
  E.fv = [['VPN \u00b7 bits 47:12 \u2192 DTLB', 20, 300, 'a1'], ['index \u00b7 bits 11:6', 330, 150, 'a2'], ['offset \u00b7 bits 5:0', 490, 150, 'a3']].map(function(f){
    s('rect', {x: f[1], y: 42, width: f[2], height: 34, rx: 5, 'class': f[3] + 'b'}, E.va);
    var t = s('text', {x: f[1] + f[2] / 2, y: 64, 'text-anchor': 'middle', 'class': 'm', 'font-size': 13}, E.va, '');
    s('text', {x: f[1] + f[2] / 2, y: 90, 'text-anchor': 'middle', 'class': 's'}, E.va, f[0]);
    return t;
  });
  E.tlb = box(670, 14, 240, 86, 'DTLB (Chapter 03)');
  E.tlbT = s('text', {x: 680, y: 50, 'class': 'm', 'font-size': 12}, E.tlb, ''); E.tlbT2 = s('text', {x: 680, y: 72, 'class': 'm', 'font-size': 12}, E.tlb, '');
  s('text', {x: 680, y: 92, 'class': 's'}, E.tlb, 'physical tag = PA bits 47:12');
  E.op = box(930, 14, 260, 86, 'Access');
  E.opT = s('text', {x: 940, y: 50, 'class': 'm', 'font-size': 12.5}, E.op, ''); E.opT2 = s('text', {x: 940, y: 72, 'font-size': 12}, E.op, ''); E.opT3 = s('text', {x: 940, y: 92, 'class': 's'}, E.op, '');
  /* wires: PA tag bus and index path */
  E.wTag = s('path', {d: 'M 790 100 L 790 118 L 462 118 L 462 530', 'class': 'wire'}, sv);
  s('text', {x: 470, y: 132, 'class': 's'}, sv, 'PA tag bus');
  E.wIdx = s('path', {d: 'M 480 59 L 480 110 L 55 110 L 55 138', 'class': 'wire'}, sv);
  /* decoder */
  E.dec = box(10, 140, 92, 400, '');
  s('text', {x: 20, y: 160, 'class': 'h'}, E.dec, 'row'); s('text', {x: 20, y: 176, 'class': 'h'}, E.dec, 'decoder'); s('text', {x: 20, y: 192, 'class': 's'}, E.dec, '6 \u2192 64');
  E.wl = [];
  for (var i = 0; i < 64; i++){ var yy = 206 + i * 5.1; E.wl.push(s('line', {x1: 86, x2: 102, y1: yy, y2: yy, stroke: 'var(--bd2)', 'stroke-width': 1}, E.dec)); }
  E.wlT = s('text', {x: 20, y: 530, 'class': 's'}, E.dec, '');
  /* tag array */
  E.tagA = box(120, 140, 316, 400, 'Tag SRAM \u2014 set 57');
  ['way', 'V', 'D', 'tag = PA[47:12]'].forEach(function(t, k){ s('text', {x: [128, 162, 192, 226][k], y: 176, 'class': 's'}, E.tagA, t); });
  E.rows = [];
  for (var w = 0; w < 8; w++){
    var y = 184 + w * 44, R = {};
    R.bg = s('rect', {x: 124, y: y, width: 308, height: 38, rx: 5, 'class': 'sunk'}, E.tagA);
    s('text', {x: 132, y: y + 24, 'class': 'm', 'font-size': 12}, E.tagA, w);
    R.vR = s('rect', {x: 156, y: y + 8, width: 24, height: 22, rx: 3, 'class': 'box'}, E.tagA); R.v = s('text', {x: 168, y: y + 24, 'text-anchor': 'middle', 'class': 'm', 'font-size': 12}, E.tagA, '');
    R.dR = s('rect', {x: 186, y: y + 8, width: 24, height: 22, rx: 3, 'class': 'box'}, E.tagA); R.d = s('text', {x: 198, y: y + 24, 'text-anchor': 'middle', 'class': 'm', 'font-size': 12}, E.tagA, '');
    R.tR = s('rect', {x: 218, y: y + 8, width: 206, height: 22, rx: 3, 'class': 'box'}, E.tagA); R.t = s('text', {x: 226, y: y + 24, 'class': 'm', 'font-size': 12}, E.tagA, '');
    R.note = s('text', {x: 330, y: y + 24, 'class': 's'}, E.tagA, '');
    /* comparator + AND */
    R.w1 = s('path', {d: 'M 436 ' + (y + 15) + ' L 488 ' + (y + 15), 'class': 'wire'}, sv);
    R.w2 = s('path', {d: 'M 462 ' + (y + 25) + ' L 488 ' + (y + 25), 'class': 'wire'}, sv);
    R.cmpC = s('circle', {cx: 502, cy: y + 20, r: 14, 'class': 'box'}, sv);
    R.cmpT = s('text', {x: 502, y: y + 25, 'text-anchor': 'middle', 'class': 'm', 'font-size': 14}, sv, '=');
    R.andP = s('path', {d: 'M 526 ' + (y + 8) + ' L 538 ' + (y + 8) + ' A 12 12 0 0 1 538 ' + (y + 32) + ' L 526 ' + (y + 32) + ' Z', 'class': 'box'}, sv);
    s('text', {x: 529, y: y + 24, 'class': 's', 'font-size': 8.5}, sv, '&');
    R.hb = s('text', {x: 566, y: y + 25, 'text-anchor': 'middle', 'class': 'm', 'font-size': 13}, sv, '');
    /* data words */
    R.words = [];
    for (var k = 0; k < 8; k++){
      var x = 592 + k * 51;
      R.words.push({r: s('rect', {x: x, y: y + 6, width: 48, height: 26, rx: 3, 'class': 'sunk'}, sv), t: s('text', {x: x + 24, y: y + 24, 'text-anchor': 'middle', 'class': 'm', 'font-size': 10.5}, sv, '')});
    }
    E.rows.push(R);
  }
  s('text', {x: 440, y: 548, 'class': 's'}, sv, 'sense amps \u2192 comparators, AND valid');
  E.dataA = s('text', {x: 592, y: 162, 'class': 'h'}, sv, 'Data SRAM \u2014 set 57: 8 ways \u00d7 64 bytes');
  s('text', {x: 592, y: 178, 'class': 's'}, sv, 'each cell = 8 bytes; hist line: hist[120] \u2026 hist[127]');
  E.mux = s('path', {d: 'M 1004 184 L 1046 214 L 1046 504 L 1004 534 Z', 'class': 'box'}, sv);
  s('text', {x: 1025, y: 364, 'text-anchor': 'middle', 'class': 's', transform: 'rotate(-90 1025 364)'}, sv, '8:1 way mux');
  E.selW = s('path', {d: 'M 566 528 L 566 556 L 1025 556 L 1025 522', 'class': 'wire'}, sv);
  s('text', {x: 700, y: 570, 'class': 's'}, sv, 'hit vector selects a hit; replacement selects a refill way');
  E.lb = box(1060, 184, 130, 350, '');
  s('text', {x: 1070, y: 204, 'class': 'h'}, E.lb, 'line buffer'); s('text', {x: 1070, y: 220, 'class': 's'}, E.lb, '64 bytes');
  s('text', {x: 1070, y: 262, 'class': 'h'}, E.lb, 'aligner');
  E.alT = s('text', {x: 1070, y: 280, 'class': 's'}, E.lb, '');
  E.alT2 = s('text', {x: 1070, y: 296, 'class': 's'}, E.lb, '');
  E.outT = s('text', {x: 1070, y: 340, 'class': 'h'}, E.lb, '');
  E.outV = s('text', {x: 1070, y: 368, 'class': 'm', 'font-size': 18}, E.lb, '');
  E.outT2 = s('text', {x: 1070, y: 392, 'class': 's'}, E.lb, '');
  /* OR, pLRU, L2, stats */
  E.or = box(10, 590, 220, 196, 'Hit logic');
  s('path', {d: 'M 30 640 Q 70 640 90 668 Q 70 696 30 696 Q 44 668 30 640 Z', 'class': 'box'}, E.or);
  s('text', {x: 36, y: 672, 'class': 's'}, E.or, 'OR\u00d78');
  E.orT = s('text', {x: 104, y: 676, 'class': 'h', 'font-size': 20}, E.or, '');
  E.orT2 = s('text', {x: 20, y: 730, 'font-size': 12}, E.or, ''); E.orT3 = s('text', {x: 20, y: 750, 'class': 's'}, E.or, '');
  E.pl = box(245, 590, 355, 196, 'pLRU bits of this set (7 per set)');
  var NP = [[422, 632], [334, 682], [510, 682], [290, 730], [378, 730], [466, 730], [554, 730]];
  E.edges = [];
  [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]].forEach(function(e){ E.edges.push({e: e, p: s('line', {x1: NP[e[0]][0], y1: NP[e[0]][1], x2: NP[e[1]][0], y2: NP[e[1]][1], 'class': 'wire'}, E.pl)}); });
  E.leafE = [];
  for (w = 0; w < 8; w++){ var pn = NP[3 + (w >> 1)], lx = pn[0] + ((w & 1) ? 20 : -20); E.leafE.push(s('line', {x1: pn[0], y1: pn[1], x2: lx, y2: 764, 'class': 'wire'}, E.pl)); s('text', {x: lx, y: 778, 'text-anchor': 'middle', 'class': 's m'}, E.pl, 'w' + w); }
  E.nodes = NP.map(function(p){ var c = s('circle', {cx: p[0], cy: p[1], r: 13, 'class': 'box'}, E.pl); var t = s('text', {x: p[0], y: p[1] + 4.5, 'text-anchor': 'middle', 'class': 'm', 'font-size': 12}, E.pl, ''); return {c: c, t: t}; });
  E.l2 = box(615, 590, 330, 196, 'Miss path: MAB \u2192 L2');
  E.l2T = []; for (i = 0; i < 7; i++) E.l2T.push(s('text', {x: 625, y: 636 + i * 22, 'font-size': 12}, E.l2, ''));
  E.st = box(960, 590, 230, 196, 'Totals so far');
  E.stT = []; for (i = 0; i < 7; i++) E.stT.push(s('text', {x: 970, y: 636 + i * 22, 'font-size': 12}, E.st, ''));

  h('p', {'class': 'note l1-legend'}, root, 'pLRU tree bits: 0 points to the older left half; 1 points to the older right half. Shortened data cells show \u2026 followed by the low four hex digits of the 64-bit word. Long decimal labels use a middle \u2026; the narration gives the full value.');
  var stp = App.stepper(root, {render: draw, pills: false});
  stp.el.classList.add('l1-stepper');
  var cu = h('div', {'class': 'card l1-custom'}, root);
  cu.innerHTML = '<h3>Run your own access</h3><div class="stp"><input class="l1va" value="0x7ffd4a3c5e58" style="width:170px" aria-label="virtual address"><select class="l1op" aria-label="access operation"><option value="ld">load</option><option value="st">store</option></select><input class="l1v" value="7" style="width:70px" aria-label="store value"><button class="pri l1go">add after the sequence</button><button class="l1clr">remove mine</button></div><p class="note l1err" role="alert" style="color:var(--bad);display:none"></p><p class="note">Enter an 8-byte-aligned user address below 0x800000000000. An unknown page gets a model frame and synthetic line data; this is not a page walk. A store value must fit in a signed 64-bit long. A custom store represents a retired store draining into the L1d. Each access runs against the cache state the sequence left behind. Change only bits 12 and up to stay in set 57.</p>';
  var err = cu.querySelector('.l1err');
  var opSel = cu.querySelector('.l1op'), valIn = cu.querySelector('.l1v');
  function syncStoreValue(){
    var store = opSel.value === 'st';
    valIn.disabled = !store; valIn.setAttribute('aria-disabled', store ? 'false' : 'true');
    valIn.title = store ? 'Value written by the store' : 'Store value is only used for a store';
  }
  opSel.addEventListener('change', syncStoreValue); syncStoreValue();
  function showErr(msg){ err.textContent = msg; err.style.display = msg ? '' : 'none'; }
  cu.querySelector('.l1go').onclick = function(){
    var addrText = cu.querySelector('.l1va').value.trim();
    if (!addrText){ showErr('Enter an address such as 0x7ffd4a3c5e58.'); return; }
    var v; try { v = BigInt(addrText); } catch(e){ showErr('Enter an address such as 0x7ffd4a3c5e58.'); return; }
    if (v < 0n || v >= 0x800000000000n || v % 8n !== 0n){ showErr('Use an 8-byte-aligned user address below 0x800000000000.'); return; }
    var op = cu.querySelector('.l1op').value, val = 0n;
    if (op === 'st'){
      var valText = cu.querySelector('.l1v').value.trim();
      if (!valText){ showErr('Enter a signed 64-bit store value.'); return; }
      try { val = BigInt(valText); } catch(e){ showErr('Enter a signed 64-bit store value.'); return; }
      if (val < -(1n << 63n) || val >= (1n << 63n)){ showErr('The store value must fit in a signed 64-bit long.'); return; }
    }
    showErr('');
    custom.push({va: v, st: op === 'st' ? 1 : 0, val: val, who: 'your ' + (op === 'st' ? 'store' : 'load')});
    rebuild(true);
  };
  cu.querySelector('.l1clr').onclick = function(){ custom = []; showErr(''); rebuild(false); };

  var R0 = [];
  function rebuild(toEnd){
    var list = presets().concat(custom), st = mkState(), tot = {h: 0, m: 0, wb: 0, fill: 0, abs: 0, stores: 0};
    R0 = list.map(function(a){
      var r = access(st, a);
      if (r.hit) tot.h++; else { tot.m++; tot.fill++; } if (r.wb) tot.wb++;
      if (a.st){ tot.stores++; if (r.hit) tot.abs++; }
      r.tot = JSON.parse(JSON.stringify(tot)); return r;
    });
    var fr = [];
    R0.forEach(function(r, k){
      if (k === 0) ['split', 'read', 'compare', 'select'].forEach(function(ph){ fr.push(frame(r, k, ph)); });
      else if (r.hit) fr.push(frame(r, k, 'all'));
      else {
        fr.push(frame(r, k, 'miss'));
        if (r.wb) fr.push(frame(r, k, 'writeback'));
        fr.push(frame(r, k, 'fill'));
      }
    });
    stp.set(fr);
    if (toEnd) stp.go(fr.length - 1);
  }
  function tg(t){ return '0x' + t.toString(16).padStart(9, '0'); }
  function frame(r, k, ph){
    var f = {r: r, ph: ph, k: k}, a = r.a, n = k + 1, setTxt = 'set ' + r.si;
    var addr = '<code>' + hx(r.va) + '</code>';
    if (ph === 'split'){ f.t = 'Access 1, step 1: split the address'; f.d = 'C1\u2019s load of hist[123] arrives with VA ' + addr + '. Bits 11:6 = 111001 = <b>57</b> go straight to the row decoder. Bits 47:12, the VPN 0x7ffd4a3c2, go to the ' + g('dtlb') + ', which returns PFN 0x1a3f7c: the physical tag. Bits 5:0 = <b>24</b> wait until the end, where they pick bytes 24\u201331 of the line.'; return f; }
    if (ph === 'read'){ f.t = 'Step 2: read the whole set'; f.d = 'The decoder raises wordline 57. In all 8 ways at once, set 57\u2019s V, D and tag bits and its 64 data bytes flow out through the sense amplifiers: 8 tags and 512 data bytes read for one 8-byte load. The hardware reads every way because it does not yet know which one holds the line.'; return f; }
    if (ph === 'compare'){ f.t = 'Step 3: eight tag compares in parallel'; f.d = 'Eight comparators check PA tag 0x1a3f7c against the eight stored tags in the same cycle; each result is ANDed with its valid bit. <b>Way 3 matches.</b> The OR of the eight hit lines is the hit signal. The comparators are why associativity costs area and power: 8 ways means 8 of them, firing on every access.'; return f; }
    if (ph === 'select'){ f.t = 'Step 4: select the way, align the bytes'; f.d = 'The hit vector drives the 8:1 way mux: way 3\u2019s 64 bytes reach the line buffer, the aligner takes bytes 24\u201331, and <b>41</b> goes to the load\u2019s destination register. The pLRU bits of set 57 now point away from way 3.'; return f; }
    if (ph === 'miss'){
      f.t = 'Access ' + n + ': tag miss in set ' + r.si;
      f.d = 'The eight valid-gated comparators all output 0 for PA tag <code>' + tg(r.tag) + '</code>. The hit vector is 00000000. The existing tag/data rows are still shown; the MAB requests line <code>' + hx(r.pa & ~63n) + '</code> from L2. ' + (r.byInvalid ? 'Invalid way ' + r.way + ' can receive it.' : 'The set is full; the replacement bits choose way ' + r.way + ' for eviction.');
      return f;
    }
    if (ph === 'writeback'){
      f.t = 'Access ' + n + ': write back the dirty victim';
      f.d = 'Before replacement, way ' + r.way + ' holds dirty line <code>' + hx(r.evict.pa) + '</code>. L2 has an older copy, so the 64 cached bytes go to L2. The tag and data rows below still show the old set; the incoming line has not filled its way yet.';
      return f;
    }
    f.t = 'Access ' + n + ': ' + a.who + (ph === 'fill' ? ' — refill' : '');
    var d = (a.st ? 'Store ' + a.val + ' to ' : 'Load from ') + addr + ' (PA <code>' + hx(r.pa) + '</code>) \u2192 ' + setTxt + ', tag ' + tg(r.tag) + '. ';
    if (r.hit){
      d += '<b>Hit in way ' + r.way + '.</b> ';
      if (a.st) d += r.wasDirty ? (k === 2 ? 'D was already 1: both histogram stores landed in the L1d and <b>nothing went to L2</b>. Two stores, zero bytes of write traffic: ' + g('wbk') + ' coalesces them.' : 'D was already 1. This store changes the cached line; no write-back to L2 happens yet.') : 'Bytes ' + r.off + '\u2013' + (r.off + 7) + ' become ' + a.val + ' and D is set to 1. The L2 copy is now stale; the L1d holds the only current value.';
      else d += 'Value ' + r.val + '.';
    } else {
      d += '<b>Miss:</b> no valid way holds tag ' + tg(r.tag) + '. A ' + g('mab') + ' entry requests the line from L2. ';
      if (r.byInvalid) d += 'Way ' + r.way + ' is invalid, so it is filled without evicting anything.';
      else {
        d += 'All 8 ways are valid, so the pLRU bits choose the victim: <b>way ' + r.way + '</b>' + (r.evict ? ' (' + (r.evict.tag === 0x1a3f7cn ? 'the hist[120..127] line' : 'line ' + hx(r.evict.pa)) + ')' : '') + '. ';
        d += r.wb ? 'It is dirty, so its 64 bytes are <b>written back to L2</b> before the new line takes the way.' : 'It is clean: the L2 (inclusive) already has an identical copy, so it is dropped.';
      }
      if (a.who.indexOf('again') >= 0) d += ' This is a <b>conflict miss</b>: the program touched only ' + (R0.length > 0 ? n - 3 : n) + ' distinct lines, a few hundred bytes, far below 32 KB, but more than 8 of them map to set 57. The line comes back from L2 with value <b>' + r.val + '</b>: the write-back kept it.';
      else if (!a.st) d += ' Value ' + r.val + '.';
      if (a.st) d += ' The store then writes bytes ' + r.off + '\u2013' + (r.off + 7) + ' and sets D (' + g('walloc') + ').';
    }
    if (r.si === 57 && k >= 3 && k < 5 && !r.hit) d += ' All of these addresses differ only in bits 12 and up, so bits 11:6 are always 57.';
    f.d = d; return f;
  }
  function wordTxt(v){ if (v === null || v === undefined) return ''; return v > -10000n && v < 100000n ? v.toString() : '\u2026' + BigInt.asUintN(64, v).toString(16).padStart(16, '0').slice(-4); }
  function decimalTxt(v){ var t = String(v); return t.length <= 14 ? t : t.slice(0, 6) + '\u2026' + t.slice(-6); }
  function draw(f){
    var r = f.r, ph = f.ph, showAfter = ph === 'select' || ph === 'all' || ph === 'fill';
    var res = ph === 'compare' || ph === 'all' || ph === 'select' || ph === 'miss' || ph === 'writeback';
    var set = showAfter ? r.after : r.before;
    E.fv[0].textContent = hx(r.va >> 12n); E.fv[1].textContent = r.si + ' = ' + r.si.toString(2).padStart(6, '0'); E.fv[2].textContent = r.off + ' = ' + r.off.toString(2).padStart(6, '0');
    E.tlbT.textContent = 'VPN ' + (r.va >> 12n).toString(16); E.tlbT2.textContent = '\u2192 PFN ' + (r.pa >> 12n).toString(16) + ' (tag)';
    E.opT.textContent = (r.a.st ? 'STORE 8 B, value ' + decimalTxt(r.a.val) : 'LOAD 8 B'); E.opT2.textContent = r.a.who; E.opT3.textContent = 'PA ' + hx(r.pa);
    var on = function(el, v){ el.setAttribute('class', v ? 'on' : ''); };
    on(E.va, ph === 'split' || ph === 'all'); on(E.tlb, ph === 'split' || ph === 'all');
    E.wTag.setAttribute('class', 'wire' + (ph !== 'read' ? ' on' : '')); E.wIdx.setAttribute('class', 'wire' + (ph === 'split' || ph === 'read' || ph === 'all' ? ' on' : ''));
    on(E.dec, ph === 'read' || ph === 'split' || ph === 'all');
    E.wl.forEach(function(l, i){ l.setAttribute('stroke', i === r.si ? 'var(--act)' : 'var(--bd2)'); l.setAttribute('stroke-width', i === r.si ? 3 : 1); l.setAttribute('x1', i === r.si ? 60 : 86); });
    E.wlT.textContent = 'wordline ' + r.si;
    E.dataA.textContent = 'Data SRAM \u2014 set ' + r.si + ': 8 ways \u00d7 64 bytes';
    E.tagA.querySelector('.h').textContent = 'Tag SRAM \u2014 set ' + r.si;
    E.rows.forEach(function(R, w){
      var x = set[w], hitW = res && r.cmp[w], sel = showAfter && w === r.way;
      R.bg.setAttribute('class', sel ? (r.hit ? 'okb' : 'a2b') : ph === 'read' ? 'a4b' : 'sunk');
      R.v.textContent = x.v; R.d.textContent = x.v ? x.d : '';
      R.dR.setAttribute('class', x.v && x.d ? 'a1b' : 'box'); R.vR.setAttribute('class', x.v ? 'box' : 'sunk');
      R.t.textContent = x.v ? tg(x.tag) : '\u2014';
      R.note.textContent = sel && !r.hit ? 'filled' : (x.v && x.tag === 0x1a3f7cn ? 'hist line' : '');
      R.cmpC.setAttribute('class', res ? (r.cmp[w] ? 'okb' : 'sunk') : ph === 'read' ? 'box' : 'sunk');
      R.cmpT.textContent = res ? (r.cmp[w] ? '=' : '\u2260') : ph === 'fill' ? '\u00b7' : '=';
      R.andP.setAttribute('class', hitW ? 'okb' : 'box');
      R.hb.textContent = res ? (r.cmp[w] ? '1' : '0') : ''; R.hb.setAttribute('fill', res && r.cmp[w] ? 'var(--ok)' : '');
      R.w1.setAttribute('class', 'wire' + (ph === 'read' || ph === 'compare' ? ' on' : ''));
      R.w2.setAttribute('class', 'wire' + (ph === 'compare' || ph === 'split' ? ' on' : ''));
      R.words.forEach(function(c, i){
        c.t.textContent = x.v ? wordTxt(x.words[i]) : '';
        var hl = showAfter && w === r.way && i === r.wi;
        c.r.setAttribute('class', hl ? (r.a.st ? 'a1b' : 'okb') : ph === 'read' && x.v ? 'a4b' : x.v ? 'box' : 'sunk');
      });
    });
    E.mux.setAttribute('class', showAfter ? 'on box' : 'box'); E.selW.setAttribute('class', 'wire' + (showAfter && r.hit ? ' on' : ''));
    on(E.lb, showAfter);
    E.alT.textContent = showAfter ? 'offset ' + r.off + ' \u2192 bytes ' + r.off + '\u2013' + (r.off + 7) : '';
    E.alT2.textContent = showAfter ? 'word ' + r.wi + ' of the line' : '';
    E.outT.textContent = showAfter ? (r.a.st ? 'store merges' : 'load result') : '';
    E.outV.textContent = showAfter ? decimalTxt(r.val) : '';
    E.outT2.textContent = showAfter ? (r.a.st ? 'into way ' + r.way + ', D = 1' : 'to the destination register') : '';
    E.orT.textContent = ph === 'fill' ? 'REFILL' : res ? (r.hit ? 'HIT' : 'MISS') : ''; E.orT.setAttribute('fill', r.hit ? 'var(--ok)' : 'var(--bad)');
    E.orT2.textContent = ph === 'fill' ? 'comparators idle during refill' : res ? 'hit vector (w7..w0): ' + r.cmp.slice().reverse().map(function(b){ return b ? 1 : 0; }).join('') : '';
    E.orT3.textContent = ph === 'fill' ? 'replacement filled way ' + r.way : res ? (r.hit ? 'selects way ' + r.way : 'no hit way; request L2') : '';
    on(E.or, res || ph === 'fill');
    /* pLRU */
    var bits = showAfter ? r.pl1 : r.pl0, path = showAfter ? pathTo(r.way) : (ph === 'miss' || ph === 'writeback') ? r.vnodes : null;
    E.nodes.forEach(function(nd, i){ nd.t.textContent = bits[i]; nd.c.setAttribute('class', path && path.indexOf(i) >= 0 ? 'on box' : 'box'); });
    E.edges.forEach(function(e){ e.p.setAttribute('class', 'wire' + (path && path.indexOf(e.e[0]) >= 0 && path.indexOf(e.e[1]) >= 0 ? ' on' : '')); });
    E.leafE.forEach(function(l, w){ l.setAttribute('class', 'wire' + (path && w === r.way ? ' on' : '')); });
    on(E.pl, showAfter || ph === 'miss' || ph === 'writeback');
    /* miss path */
    var L = [];
    if ((showAfter || ph === 'miss' || ph === 'writeback') && !r.hit){
      L.push('MAB entry: line PA ' + hx(r.pa & ~63n));
      L.push('victim: way ' + r.way + (r.byInvalid ? ' (invalid, free)' : ' (chosen by pLRU)'));
      if (r.evict) L.push((showAfter ? 'evicted: ' : 'victim line: ') + (r.evict.tag === 0x1a3f7cn ? 'hist[120..127]' : 'PA ' + hx(r.evict.pa)) + (r.evict.d ? ', dirty' : ', clean'));
      if (ph === 'writeback' || showAfter) L.push(r.wb ? '\u2191 64 B written back to L2' : 'no write-back needed');
      if (showAfter){ L.push('\u2193 64 B filled from L2: 2 \u00d7 32 B transfers'); L.push('new line: V = 1, D = ' + (r.a.st ? '1 (store merged)' : '0')); }
    } else if (showAfter) L.push('hit: no L2 traffic');
    E.l2T.forEach(function(t, i){ t.textContent = L[i] || ''; t.setAttribute('fill', /written back/.test(L[i] || '') ? 'var(--a1)' : /filled/.test(L[i] || '') ? 'var(--a2)' : ''); });
    on(E.l2, (showAfter || ph === 'miss' || ph === 'writeback') && !r.hit);
    var T = showAfter ? r.tot : f.k ? R0[f.k - 1].tot : {h:0,m:0,fill:0,wb:0,stores:0,abs:0};
    var S = ['completed accesses: ' + (f.k + (showAfter ? 1 : 0)), 'hits: ' + T.h + '   misses: ' + T.m, 'lines filled from L2: ' + T.fill, 'dirty write-backs: ' + T.wb, 'stores: ' + T.stores + ' (' + T.abs + ' hit the L1d)', 'bytes read from L2: ' + T.fill * 64, 'bytes written to L2: ' + T.wb * 64];
    E.stT.forEach(function(t, i){ t.textContent = showAfter || f.k > 0 ? S[i] : ''; });
  }
  rebuild(false);
  return {key: stp.key};
}});
