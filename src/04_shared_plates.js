/* ======================= full-width plates ======================= */
/* Large, detailed diagrams ("plates") shown inside their chapters and again on the Atlas page.
   Chapters are built lazily, so everything a plate needs lives here: the shared data below is the
   single source the chapters read too (DDR4 timings, the four DRAM requests, the page walk, the
   end-to-end step model).
   A plate is a .scroller with one SVG; it sets scroller._views so the core attaches the usual view
   tabs (no zoom buttons). Each builder returns {set(state)} where the chapter can drive it. */
(function(){
  var h = App.h, s = App.s, HW = App.HW, T = HW.txt, R = HW.rect;

  /* ---------- shared data ---------- */
  /* DDR4-2400 timings in memory-clock cycles (tCK in ns), used by the DRAM chapter. */
  App.DDR4 = {tck: 0.833, CL: 17, RCD: 17, RP: 17, RAS: 39, BL: 4, RRDL: 6, CCDL: 6, RTP: 9};
  /* The DRAM chapter's four requests: A is the hist[123] line. */
  App.DRAMREQ = [
    {id: 'A', what: 'hist[120..127] (C1.ld)', pa: 0x1a3f7ce40n, arr: 0, kind: 'closed', rd: 17},
    {id: 'D', what: 'data[0..63] (A1)', pa: 0x1c07a2c0n, arr: 0, kind: 'closed', rd: 23},
    {id: 'B', what: 'hist[136..143]', pa: 0x1a3f7cec0n, arr: 5, kind: 'hit', rd: 29},
    {id: 'C', what: 'a line 256 KB higher', pa: 0x1a3fbce40n, arr: 10, kind: 'conflict', rd: 73}
  ];
  /* The page walk of the translation chapter. */
  App.WALK = {va: 0x7ffd4a3c2e58n, cr3: 0x10a3b000n, levels: [
    {n: 'PML4', base: 0x10a3b000n, idx: 255, val: 0x11e2d067n},
    {n: 'PDPT', base: 0x11e2d000n, idx: 501, val: 0x13f4a067n},
    {n: 'PD',   base: 0x13f4a000n, idx: 81,  val: 0x1b6e9067n},
    {n: 'PT',   base: 0x1b6e9000n, idx: 450, val: 0x80000001a3f7c067n}
  ]};
  /* The end-to-end chapter's critical-path model. o = {tlb: 'hit'|'walk', lvl: 'L1'|'L2'|'L3'|'DRAM', row: 'hit'|'closed'|'conflict'} */
  App.E2E = {steps: function(o){
    var CFG = App.CFG, ghz = CFG.ghz, S = [];
    var add = function(n, c, src, ch, what, sh){ S.push({n: n, c: Math.max(0, Math.round(c)), src: src, ch: ch, what: what, sh: sh || n}); };
    add('front end: fetch, predecode, decode, \u00b5op queue', 5, 'model', 'core', 'L1i hit, op cache or decoders', 'front end');
    add('rename + dispatch', 2, 'model', 'core', 'RAT, free list, ROB, scheduler, LQ/SQ entries', 'rename');
    add('wait for rax from A1 (data[] load, L1d hit)', CFG.l1, 'published', 'core', 'the address depends on this load', 'wait for rax');
    add('AGU: rdx + rax\u00d78', 1, 'model', 'core', 'VA 0x7ffd4a3c2e58', 'AGU');
    if (o.tlb === 'walk') add('DTLB + L2 TLB miss, page walk', 2 * CFG.l2 + 2, 'assumed', 'xlate', 'PML4E/PDPTE from the walk cache, PDE and PTE from L2', 'page walk');
    var lat = o.lvl === 'L1' ? CFG.l1 : o.lvl === 'L2' ? CFG.l2 : o.lvl === 'L3' ? CFG.l3 : App.dramCycles();
    add('load hist[123]: ' + {L1: 'L1d hit', L2: 'L1 miss, L2 hit', L3: 'L2 miss, L3 hit', DRAM: 'miss to DRAM'}[o.lvl], lat, 'published', o.lvl === 'L1' ? 'l1d' : o.lvl === 'DRAM' ? 'dram' : 'hier', o.lvl === 'DRAM' ? 'L3 ' + CFG.l3 + ' cycles + ' + CFG.dramNs + ' ns (latency settings)' : 'load-to-use', 'load hist[123]');
    if (o.lvl === 'DRAM' && o.row !== 'closed') add(o.row === 'hit' ? 'row already open: saves ACT' : 'row conflict: extra PRE', (o.row === 'hit' ? -14.2 : 14.2) * ghz, 'derived', 'dram', 'device-time difference from [[ch:dram]] (\u00b1 14.2 ns)');
    add('add: tmp + 1', 1, 'published', 'core', '1-cycle ALU op');
    add('store address + data into the SQ', 2, 'model', 'core', 'STA / STD');
    add('retire (older instructions already done)', 1, 'model', 'core', 'ROB head');
    add('commit to L1d: line is E after the load, becomes M', 1, 'model', 'stores', 'no RFO needed');
    S.forEach(function(x){ if (x.n.indexOf('row already open') === 0) x.neg = true; });
    return S;
  }};

  /* ---------- scaffold ---------- */
  function plate(container, o){
    var wrap = h('div', {'class': 'plate-scene' + (o.cls ? ' ' + o.cls : '')}, container);
    if (o.caption) h('p', {'class': 'note plate-caption'}, wrap, o.caption);
    var sc = h('div', {'class': 'scroller plate-canvas'}, wrap);
    var sv = s('svg', {viewBox: '0 0 ' + o.w + ' ' + o.h, style: 'min-width:' + (o.minW || 900) + 'px'}, sc);
    s('defs', null, sv).innerHTML = '<marker id="pl-ar-' + o.id + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1L9 5L1 9z" fill="context-stroke"/></marker>';
    sc._views = o.views; sc._viewLabel = o.viewLabel || 'plate view';
    return {wrap: wrap, sc: sc, sv: sv, arrow: 'url(#pl-ar-' + o.id + ')'};
  }
  function line(g, x1, y1, x2, y2, cls, extra){ var a = {x1: x1, y1: y1, x2: x2, y2: y2, 'class': cls || 'wire'}; for (var k in extra || {}) a[k] = extra[k]; return s('line', a, g); }
  function path(g, d, cls, extra){ var a = {d: d, 'class': cls || 'wire'}; for (var k in extra || {}) a[k] = extra[k]; return s('path', a, g); }
  function head(g, x, y, t){ return T(g, x, y, t, {size: 13.5, fill: 'var(--tx)', weight: 650}); }
  function setCls(el, c){ el.setAttribute('class', c); }

  /* ---------- plate 1: inside one DDR4 x8 chip ---------- */
  function dramPlate(container){
    var D = App.DDR4, F = HW.dramMap, Q = {};
    App.DRAMREQ.forEach(function(r){ Q[r.id] = {r: r, f: F(r.pa)}; });
    var A = Q.A.f;
    var P = plate(container, {id: 'dram', w: 1200, h: 792, cls: 'plate-dram',
      caption: 'Request A (the hist[123] line) from physical address to capacitors, then the same requests on the channel\u2019s command and data bus. Device structure is the standard DDR4 x8 organisation; subarray sizes vary by vendor.',
      views: [{id: 'overview', label: 'Whole plate', box: [0, 0, 1200, 792]}, {id: 'path', label: 'Address \u2192 chip', box: [0, 0, 1200, 176]},
              {id: 'bank', label: 'Subarrays + cells', box: [0, 178, 1200, 366]}, {id: 'timing', label: 'Command timing', box: [0, 548, 1200, 244]}]});
    var sv = P.sv, E = {};

    /* band 1: address -> rank -> chip -> bank */
    R(sv, 10, 12, 300, 156, 'box', 9); head(sv, 22, 34, 'Physical address'); T(sv, 22, 52, '0x' + Q.A.r.pa.toString(16), {size: 12, cls: 'm', fill: 'var(--tx2)'});
    var segs = [[33, 18, 'a1b'], [17, 16, 'a3b'], [15, 14, 'a3b'], [13, 7, 'a2b'], [6, 6, 'a4b'], [5, 0, 'sunk']];
    segs.forEach(function(sg){ var x = 22 + (33 - sg[0]) * 8; R(sv, x, 64, (sg[0] - sg[1] + 1) * 8 - 1, 16, sg[2], 2); T(sv, x, 61, sg[0], {size: 8, fill: 'var(--tx3)'}); });
    T(sv, 22, 100, 'bits 33:18 \u2192 row ' + A.row, {size: 10.5, fill: 'var(--a1)'});
    T(sv, 22, 116, 'bits 17:16 \u2192 bank group ' + A.bg + ' \u00b7 15:14 \u2192 bank ' + A.bank, {size: 10.5, fill: 'var(--a3)'});
    T(sv, 22, 132, 'bits 13:7 \u2192 column ' + A.col + ' \u00b7 bit 6 \u2192 channel ' + A.ch + ' (' + 'AB'[A.ch] + ')', {size: 10.5, fill: 'var(--a2)'});
    T(sv, 22, 154, 'example layout used throughout this site', {size: 9.5, fill: 'var(--tx3)'});
    path(sv, 'M 312 90 L 328 90', 'wire', {'marker-end': P.arrow});
    R(sv, 330, 12, 270, 156, 'box', 9); head(sv, 342, 34, 'Channel ' + A.ch + ' (' + 'AB'[A.ch] + '): one rank');
    for (var k = 0; k < 8; k++){ R(sv, 344 + k * 31, 48, 26, 42, 'a4b', 3); T(sv, 357 + k * 31, 73, k, {size: 9, anchor: 'middle', fill: 'var(--tx)'}); T(sv, 357 + k * 31, 102, 'DQ' + k * 8, {size: 7.5, anchor: 'middle', fill: 'var(--tx3)'}); }
    T(sv, 342, 124, 'each x8 chip drives 8 of the 64 data bits', {size: 10, fill: 'var(--tx2)'});
    T(sv, 342, 140, 'the same ACT / RD goes to all 8 chips', {size: 10, fill: 'var(--tx2)'});
    T(sv, 342, 156, '8 chips \u00d7 8 bits \u00d7 8 beats = 64 bytes', {size: 10, fill: 'var(--tx2)'});
    path(sv, 'M 602 90 L 618 90', 'wire', {'marker-end': P.arrow});
    R(sv, 620, 12, 250, 156, 'box', 9); head(sv, 632, 34, 'One chip: 16 banks');
    E.bank = {};
    for (var bg = 0; bg < 4; bg++){
      T(sv, 632, 58 + bg * 28, 'BG' + bg, {size: 9, fill: 'var(--tx3)'});
      for (var b = 0; b < 4; b++){ var r = R(sv, 664 + b * 49, 44 + bg * 28, 44, 22, 'sunk', 3); E.bank[bg + '/' + b] = r; T(sv, 686 + b * 49, 59 + bg * 28, 'bank ' + b, {size: 8.5, anchor: 'middle', fill: 'var(--tx2)'}); }
    }
    path(sv, 'M 872 90 L 888 90', 'wire', {'marker-end': P.arrow});
    R(sv, 890, 12, 300, 156, 'box', 9); head(sv, 902, 34, 'Bank ' + A.bank + ': 65,536 rows \u00d7 1 KB');
    R(sv, 902, 42, 276, 80, 'sunk', 3);
    var ry = 42 + 80 * (A.row / 65536);
    E.bankRow = line(sv, 902, ry, 1178, ry, 'wire', {style: 'stroke:var(--a1);stroke-width:2.2'});
    T(sv, 1176, ry - 4, 'row ' + A.row, {size: 9, anchor: 'end', fill: 'var(--a1)'});
    E.rowbuf = R(sv, 902, 126, 276, 14, 'a2b', 2);
    var cx = 902 + 276 * (A.col / 128);
    path(sv, 'M ' + cx + ' 124 l -4 -6 l 8 0 z', 'wire', {style: 'fill:var(--a2);stroke:none'});
    T(sv, 902, 158, 'row buffer = sense amps \u00b7 column ' + A.col + ' marked', {size: 9.5, fill: 'var(--tx3)'});

    /* band 2: subarrays + cell array */
    R(sv, 10, 186, 380, 352, 'box', 9); head(sv, 22, 208, 'Bank ' + A.bank + ', physically: subarrays');
    R(sv, 22, 220, 18, 280, 'a3b', 3); T(sv, 35, 360, 'row decoder', {size: 9, anchor: 'middle', fill: 'var(--tx2)'}).setAttribute('transform', 'rotate(-90 35 360)');
    for (k = 0; k < 8; k++){
      var y = 220 + k * 35;
      R(sv, 48, y, 330, 25, k === 4 ? 'a1b' : 'sunk', 3);
      R(sv, 48, y + 27, 330, 6, 'a2b', 1.5);
      if (k === 0) T(sv, 56, y + 16, 'subarray', {size: 9.5, fill: 'var(--tx3)'});
      if (k === 1) T(sv, 372, y + 16, '\u2191 local sense-amp stripe', {size: 9, anchor: 'end', fill: 'var(--tx3)'});
      if (k === 4) T(sv, 56, y + 16, 'the subarray holding row ' + A.row, {size: 9.5, fill: 'var(--tx)'});
    }
    T(sv, 22, 516, 'rows per subarray: a few hundred to ~1,000 (vendor-specific)', {size: 9.5, fill: 'var(--tx3)'});
    T(sv, 22, 530, 'neighbouring subarrays share each sense-amp stripe', {size: 9.5, fill: 'var(--tx3)'});
    path(sv, 'M 378 360 L 408 196 M 378 385 L 408 536', 'wire', {style: 'stroke-dasharray:4 3;opacity:.6'});

    R(sv, 410, 186, 780, 352, 'box', 9); head(sv, 422, 208, 'Cell array around row ' + A.row + ': one transistor + one capacitor per bit');
    E.eq = T(sv, 1178, 208, 'bitlines held at VDD/2 between activations', {size: 9.5, anchor: 'end', fill: 'var(--tx3)'});
    var rows = [A.row - 2, A.row - 1, A.row, A.row + 1, A.row + 2, A.row + 3], BLX = [], WLY = [];
    for (var j = 0; j < 12; j++) BLX.push(526 + j * 54);
    rows.forEach(function(rw, i){ WLY.push(240 + i * 38); });
    E.bl = BLX.map(function(x){ return line(sv, x, 224, x, 466, 'wire'); });
    E.wl = {}; rows.forEach(function(rw, i){ E.wl[rw] = line(sv, 498, WLY[i], 1182, WLY[i], 'wire'); T(sv, 422, WLY[i] + 4, 'row ' + rw, {size: 9.5, cls: 'm', fill: rw === A.row || rw === A.row + 1 ? 'var(--tx)' : 'var(--tx3)'}); });
    E.cells = {};
    rows.forEach(function(rw, i){
      E.cells[rw] = [];
      BLX.forEach(function(x, jj){
        var bit = ((rw * 7 + jj * 13) % 5) < 2, y0 = WLY[i];
        line(sv, x, y0 + 12, x + 12, y0 + 12, 'wire');
        line(sv, x + 16, y0, x + 16, y0 + 6, 'wire');
        var tr = R(sv, x + 11, y0 + 6, 10, 10, 'sunk', 1.5);
        var cap = s('circle', {cx: x + 30, cy: y0 + 12, r: 5, 'class': bit ? 'a2b' : 'sunk'}, sv);
        line(sv, x + 21, y0 + 12, x + 25, y0 + 12, 'wire');
        E.cells[rw].push({tr: tr, cap: cap, bit: bit});
      });
    });
    E.sa = BLX.map(function(x){ return path(sv, 'M ' + (x - 9) + ' 470 L ' + (x + 9) + ' 470 L ' + x + ' 486 z', 'a2b'); });
    T(sv, 422, 482, 'sense amps', {size: 9.5, fill: 'var(--tx2)'});
    E.col = path(sv, 'M ' + (BLX[4] - 10) + ' 494 L ' + (BLX[4] - 10) + ' 500 L ' + (BLX[11] + 10) + ' 500 L ' + (BLX[11] + 10) + ' 494', 'wire');
    E.colT = T(sv, (BLX[4] + BLX[11]) / 2, 516, 'one column access: 64 bits from this chip\u2019s row buffer (8 drawn)', {size: 10, anchor: 'middle', fill: 'var(--tx2)'});
    T(sv, 1182, 532, 'global I/O \u2192 64-bit prefetch \u2192 8 beats on DQ0\u20137', {size: 10, anchor: 'end', fill: 'var(--tx3)'});

    /* band 3: command / data bus timing */
    R(sv, 10, 552, 1180, 236, 'box', 9);
    head(sv, 22, 574, 'DDR4-2400, channel ' + A.ch + ': commands and data (tCK = ' + D.tck + ' ns)');
    var X = function(c){ return 150 + c * 10; };
    var lanes = [['CK', 590], ['CMD', 620], ['BG / bank', 652], ['ADDR', 682], ['DQ', 714]];
    lanes.forEach(function(l){ T(sv, 22, l[1] + 15, l[0], {size: 10.5, fill: 'var(--tx2)'}); });
    var ck = 'M ' + X(0) + ' 604'; for (var c = 0; c < 100; c++) ck += ' L ' + X(c) + ' 592 L ' + (X(c) + 5) + ' 592 L ' + (X(c) + 5) + ' 604 L ' + X(c + 1) + ' 604';
    path(sv, ck, 'wire', {style: 'opacity:.55'});
    var cmds = [[0, 'ACT', 'A'], [6, 'ACT', 'D'], [Q.A.r.rd, 'RD', 'A'], [Q.D.r.rd, 'RD', 'D'], [Q.B.r.rd, 'RD', 'B'], [D.RAS, 'PRE', 'C'], [D.RAS + D.RP, 'ACT', 'C'], [Q.C.r.rd, 'RD', 'C']];
    E.cmd = cmds.map(function(cm){
      var f = Q[cm[2]].f, x = X(cm[0]);
      var bx = R(sv, x, 620, 32, 22, 'sunk', 3); T(sv, x + 16, 635, cm[1], {size: 9.5, anchor: 'middle', fill: 'var(--tx)'});
      R(sv, x, 652, 32, 22, 'sunk', 3); T(sv, x + 16, 667, f.bg + '/' + f.bank, {size: 9, anchor: 'middle', fill: 'var(--tx2)', cls: 'm'});
      R(sv, x, 682, cm[1] === 'RD' ? 32 : 46, 22, 'sunk', 3); T(sv, x + 4, 697, cm[1] === 'ACT' ? 'r' + f.row : cm[1] === 'RD' ? 'c' + f.col : 'all', {size: 8.5, fill: 'var(--tx2)', cls: 'm'});
      T(sv, x + 16, 616, cm[2], {size: 9, anchor: 'middle', fill: 'var(--tx3)'});
      return {t: cm[0], k: cm[1] + ' ' + cm[2], r: bx};
    });
    E.dq = ['A', 'D', 'B', 'C'].map(function(id){
      var t0 = Q[id].r.rd + D.CL, x = X(t0);
      var r2 = R(sv, x, 714, D.BL * 10, 22, 'a4b', 3); T(sv, x + D.BL * 5, 729, id, {size: 10, anchor: 'middle', fill: 'var(--tx)'});
      return {id: id, r: r2};
    });
    [0, Q.A.r.rd, Q.A.r.rd + D.CL, D.RAS, D.RAS + D.RP, Q.C.r.rd, Q.C.r.rd + D.CL].forEach(function(t){ line(sv, X(t), 744, X(t), 750, 'wire'); T(sv, X(t), 760, t, {size: 9, anchor: 'middle', fill: 'var(--tx3)'}); });
    var ns = function(c){ return (c * D.tck).toFixed(1) + ' ns'; };
    var brk = function(a, b, y, t){ path(sv, 'M ' + X(a) + ' ' + (y - 6) + ' L ' + X(a) + ' ' + y + ' L ' + X(b) + ' ' + y + ' L ' + X(b) + ' ' + (y - 6), 'wire', {style: 'opacity:.7'}); T(sv, (X(a) + X(b)) / 2, y + 12, t, {size: 9, anchor: 'middle', fill: 'var(--tx2)'}); };
    brk(0, D.RCD, 768, 'tRCD ' + D.RCD + ' = ' + ns(D.RCD)); brk(D.RCD, D.RCD + D.CL, 768, 'CL ' + D.CL + ' = ' + ns(D.CL));
    brk(D.RAS, D.RAS + D.RP, 768, 'tRP ' + D.RP + ' = ' + ns(D.RP)); brk(Q.C.r.rd, Q.C.r.rd + D.CL + D.BL, 768, 'conflict: data at ' + (Q.C.r.rd + D.CL));
    T(sv, 1180, 760, 'cycles', {size: 9, anchor: 'end', fill: 'var(--tx3)'});

    /* step state from the DRAM chapter's frames */
    function set(p){
      p = p || '';
      var req = (p.match(/ ([ABCD])$/) || [])[1] || (p === 'PRE' ? 'C' : ''), f = req ? Q[req].f : null;
      for (var key in E.bank) setCls(E.bank[key], 'sunk');
      if (f) setCls(E.bank[f.bg + '/' + f.bank], 'box on'); else setCls(E.bank[A.bg + '/' + A.bank], 'a1b');
      var actRow = p === 'ACT A' ? A.row : p === 'ACT C' ? A.row + 1 : null, open = /^(ACT A|RD A|RD B)$/.test(p) ? A.row : /^(ACT C|RD C)$/.test(p) ? A.row + 1 : null;
      for (var rw in E.wl) E.wl[rw].setAttribute('class', 'wire' + (+rw === actRow ? ' on' : ''));
      for (rw in E.cells) E.cells[rw].forEach(function(c){ setCls(c.tr, +rw === open ? 'box on' : 'sunk'); });
      E.bl.forEach(function(l){ l.setAttribute('class', 'wire' + (p === 'PRE' ? ' on' : '')); });
      E.eq.style.fill = p === 'PRE' ? 'var(--act)' : 'var(--tx3)';
      E.sa.forEach(function(t){ setCls(t, open !== null ? 'okb' : 'a2b'); });
      E.col.setAttribute('class', 'wire' + (/^RD/.test(p) ? ' on' : ''));
      E.cmd.forEach(function(c){ setCls(c.r, c.k === p || (p === 'PRE' && c.k === 'PRE C') ? 'box on' : 'sunk'); });
      E.dq.forEach(function(d){ setCls(d.r, p === 'RD ' + d.id ? 'box on' : 'a4b'); });
      E.bankRow.style.stroke = open === A.row ? 'var(--act)' : 'var(--a1)';
    }
    set('');
    return {set: set};
  }

  /* ---------- plate 2: the L1d arrays at real proportions ---------- */
  function l1dPlate(container){
    var P = plate(container, {id: 'l1d', w: 1200, h: 712, cls: 'plate-l1d',
      caption: 'The 32 KB L1d as two SRAM arrays drawn to one bit scale: each way of data (512 bits) is 13.5\u00d7 wider than its tag entry (36-bit tag + V + D). Set 57 is the hist[123] lookup; way 3 holds the line.',
      views: [{id: 'overview', label: 'Whole plate', box: [0, 0, 1200, 712]}, {id: 'predict', label: 'Address + predictor', box: [0, 40, 262, 400]},
              {id: 'arrays', label: 'Tag + data arrays', box: [254, 44, 946, 546]}, {id: 'output', label: 'Way mux + aligner', box: [254, 590, 946, 122]}]});
    var sv = P.sv, W = 0.19, tw = 38 * W, dw = 512 * W, rowH = 6, gapR = 1, y0 = 84, tx0 = 270, dx0 = 352;
    head(sv, 20, 28, 'L1d, 32 KB = 64 sets \u00d7 8 ways \u00d7 64 B');
    R(sv, 20, 46, 230, 78, 'box', 8); T(sv, 30, 66, 'Virtual address', {size: 11, weight: 650, fill: 'var(--tx)'}); T(sv, 30, 84, '0x7ffd4a3c2e58', {size: 11.5, cls: 'm', fill: 'var(--tx2)'}); T(sv, 30, 102, 'index 11:6 = 57 \u00b7 offset 5:0 = 24', {size: 10, fill: 'var(--tx3)'}); T(sv, 30, 116, 'VPN 47:12 \u2192 DTLB', {size: 10, fill: 'var(--tx3)'});
    R(sv, 20, 136, 230, 124, 'box on', 8); T(sv, 30, 156, 'Way predictor (Zen+)', {size: 11, weight: 650, fill: 'var(--tx)'});
    ['\u00b5tag = hash of VA bits', 'predicts way 3 of set 57', 'only that way\u2019s data is read', 'full tag still compared', 'hash undocumented; reverse-', 'engineered by Lipp et al., 2020'].forEach(function(t, i){ T(sv, 30, 174 + i * 14, t, {size: 10, fill: i < 4 ? 'var(--tx2)' : 'var(--tx3)'}); });
    R(sv, 20, 272, 230, 72, 'box', 8); T(sv, 30, 292, 'DTLB', {size: 11, weight: 650, fill: 'var(--tx)'}); T(sv, 30, 310, 'VPN 0x7ffd4a3c2 \u2192 PFN 0x1a3f7c', {size: 10, cls: 'm', fill: 'var(--tx2)'}); T(sv, 30, 326, 'physical tag = PA[47:12]', {size: 10, fill: 'var(--tx3)'});
    R(sv, 20, 356, 230, 70, 'box', 8); T(sv, 30, 376, 'Row decoder', {size: 11, weight: 650, fill: 'var(--tx)'}); T(sv, 30, 394, 'raises wordline 57 of 64', {size: 10, fill: 'var(--tx2)'}); T(sv, 30, 410, 'in both arrays at once', {size: 10, fill: 'var(--tx3)'});
    T(sv, tx0, 66, 'tag', {size: 10, fill: 'var(--tx2)'}); T(sv, dx0, 66, 'data: 8 ways \u00d7 64 bytes per set', {size: 10, fill: 'var(--tx2)'});
    for (var w = 0; w < 8; w++){ T(sv, dx0 + w * (dw + 2) + dw / 2, 78, 'way ' + w, {size: 8.5, anchor: 'middle', fill: 'var(--tx3)'}); }
    for (var r = 0; r < 64; r++){
      var y = y0 + r * (rowH + gapR), hot = r === 57;
      for (w = 0; w < 8; w++){
        R(sv, tx0 + w * (tw + 1), y, tw, rowH, hot && w === 3 ? 'box on' : hot ? 'a4b' : 'sunk', 1);
        R(sv, dx0 + w * (dw + 2), y, dw, rowH, hot && w === 3 ? 'box on' : hot ? 'a4b' : 'sunk', 1);
      }
      if (r % 8 === 0 && Math.abs(r - 57) > 3) T(sv, tx0 - 6, y + 6, r, {size: 8, anchor: 'end', fill: 'var(--tx3)'});
    }
    var yh = y0 + 57 * (rowH + gapR);
    T(sv, tx0 - 6, yh + 6, '57', {size: 9, anchor: 'end', fill: 'var(--act)', weight: 700});
    T(sv, dx0 + 8 * (dw + 2) + 2, yh + 6, 'set 57', {size: 9.5, fill: 'var(--act)'});
    var yb = y0 + 64 * (rowH + gapR) + 10;
    T(sv, tx0, yb + 8, 'tag array: 512 \u00d7 38 bits \u2248 2.4 KB', {size: 9.5, fill: 'var(--tx3)'});
    T(sv, dx0 + 120, yb + 8, 'data array: 512 lines \u00d7 64 B = 32 KB', {size: 9.5, fill: 'var(--tx3)'});
    R(sv, 760, yb + 16, 10, 8, 'a4b', 1); T(sv, 774, yb + 24, 'textbook: all 8 ways of set 57 read (8 tags + 512 B)', {size: 9.5, fill: 'var(--tx2)'});
    R(sv, 760, yb + 30, 10, 8, 'box on', 1); T(sv, 774, yb + 38, 'Zen+: the predicted way only (1 tag + 64 B)', {size: 9.5, fill: 'var(--tx2)'});
    var mx = dx0 + 3 * (dw + 2) + dw / 2;
    path(sv, 'M ' + mx + ' ' + (yh + 6) + ' L ' + mx + ' 600', 'wire on', {'marker-end': P.arrow, style: 'stroke-dasharray:5 4'});
    R(sv, 262, 600, 930, 108, 'box', 9); T(sv, 274, 620, 'Way mux \u2192 line buffer (way 3 of set 57) \u2192 aligner', {size: 11, weight: 650, fill: 'var(--tx)'});
    var wd = HW.words(sv, 274, 632, 560, 30, {labels: ['[120]', '[121]', '[122]', '[123]', '[124]', '[125]', '[126]', '[127]'], hot: 3}); wd.set('41', 'box on');
    path(sv, 'M 842 648 L 900 648', 'wire on', {'marker-end': P.arrow});
    T(sv, 908, 644, 'bytes 24\u201331 \u2192 41', {size: 12, cls: 'm', fill: 'var(--tx)'}); T(sv, 908, 662, 'into the load\u2019s destination register', {size: 10, fill: 'var(--tx3)'});
    T(sv, 274, 692, 'The hit is confirmed by the full physical tag compare (0x1a3f7c) on way 3; a \u00b5tag that matches nothing sends the access to the miss path.', {size: 10, fill: 'var(--tx3)'});
    return {set: function(){}};
  }

  /* ---------- plate 3: one hist[123]++ on one time axis ---------- */
  function e2ePlate(container, o0){
    var P = plate(container, {id: 'e2e', w: 1200, h: 600, cls: 'plate-e2e',
      caption: 'Every stage of the critical path on one to-scale time axis, then the first cycles magnified. Uses the same model as the step table and the latency settings, so it redraws when they change.',
      views: [{id: 'overview', label: 'Whole path', box: [0, 0, 1200, 600]}, {id: 'early', label: 'First cycles', box: [0, 470, 1200, 130]}]});
    var sv = P.sv, root = s('g', null, sv), o = o0 || {tlb: 'hit', lvl: 'DRAM', row: 'closed'};
    var COL = {core: 'a3b', xlate: 'a4b', l1d: 'a2b', hier: 'a2b', dram: 'a1b', stores: 'a3b'}, SRC = {published: 'var(--a2)', model: 'var(--tx3)', assumed: 'var(--a3)', derived: 'var(--a1)'};
    function draw(){
      while (root.firstChild) root.removeChild(root.firstChild);
      var S = App.E2E.steps(o), ghz = App.CFG.ghz, tot = 0, pos = 0, x0 = 430, W = 720;
      S.forEach(function(x){ tot += x.neg ? -x.c : x.c; });
      var span = S.reduce(function(m, x){ pos += x.neg ? -x.c : x.c; return Math.max(m, pos); }, 0), sc = W / Math.max(1, span);
      head(root, 20, 30, 'Critical path: ' + tot + ' cycles = ' + (tot / ghz).toFixed(1) + ' ns at ' + ghz + ' GHz');
      T(root, 20, 48, 'one row per stage; bar start = when it begins, width = how long it takes', {size: 10, fill: 'var(--tx3)'});
      var cum = 0;
      S.forEach(function(x, i){
        var y = 64 + i * 32, a = x.neg ? cum - x.c : cum, wdt = Math.max(2, x.c * sc);
        T(root, 20, y + 15, x.n, {size: 11, fill: 'var(--tx2)'});
        var bar = R(root, x0 + a * sc, y + 3, wdt, 18, x.neg ? 'okb' : COL[x.ch] || 'box', 3);
        if (x.neg) bar.setAttribute('style', 'stroke-dasharray:4 3');
        var lx = x0 + (x.neg ? a : a + x.c) * sc + 6, flip = lx + 60 > 1195, inside = flip && wdt > 90;
        T(root, inside ? lx - 14 : flip ? x0 + a * sc - 6 : lx, y + 16, (x.neg ? '\u2212' : '') + x.c + ' cyc', {size: 10, cls: 'm', fill: inside ? 'var(--tx)' : 'var(--tx2)', anchor: flip ? 'end' : 'start'});
        T(root, x0 - 10, y + 16, x.src, {size: 9, anchor: 'end', fill: SRC[x.src] || 'var(--tx3)'});
        cum += x.neg ? -x.c : x.c;
      });
      var yAx = 64 + S.length * 32 + 6;
      line(root, x0, yAx, x0 + W, yAx, 'wire');
      [0, .25, .5, .75, 1].forEach(function(f){ var c = Math.round(span * f); line(root, x0 + c * sc, yAx, x0 + c * sc, yAx + 5, 'wire'); T(root, x0 + c * sc, yAx + 17, c, {size: 9, anchor: 'middle', fill: 'var(--tx3)'}); });
      T(root, x0 + W, yAx + 30, 'cycles at ' + ghz + ' GHz', {size: 9, anchor: 'end', fill: 'var(--tx3)'});
      var zy = 488, Z = 20, zsc = W / Z, zc = 0;
      R(root, 10, zy - 14, 1180, 120, 'box', 9);
      head(root, 20, zy + 6, 'The first ' + Z + ' cycles, magnified');
      T(root, 20, zy + 24, 'pipeline stages are cheap; the wait starts at the load', {size: 10, fill: 'var(--tx3)'});
      S.some(function(x){
        if (x.neg) return false;
        var a = zc, b = Math.min(Z, zc + x.c);
        if (b > a){ R(root, x0 + a * zsc, zy + 34, Math.max(2, (b - a) * zsc - 2), 26, COL[x.ch] || 'box', 3); if ((b - a) * zsc >= 26) T(root, x0 + a * zsc + (b - a) * zsc / 2 - 1, zy + 51, x.sh, {size: 9.5, anchor: 'middle', fill: 'var(--tx)'}); }
        zc += x.c; return zc >= Z;
      });
      line(root, x0, zy + 66, x0 + W, zy + 66, 'wire');
      for (var c = 0; c <= Z; c += 2){ line(root, x0 + c * zsc, zy + 66, x0 + c * zsc, zy + 71, 'wire'); T(root, x0 + c * zsc, zy + 83, c, {size: 9, anchor: 'middle', fill: 'var(--tx3)'}); }
      T(root, 20, zy + 51, 'bar colour = chapter', {size: 9.5, fill: 'var(--tx3)'});
    }
    draw(); App.onCfg(draw);
    return {set: function(no){ if (no) o = no; draw(); }};
  }

  /* ---------- plate 4: the page walk, bit by bit ---------- */
  function xlatePlate(container){
    var Wk = App.WALK, va = Wk.va, L = Wk.levels, hex = function(v){ return '0x' + v.toString(16); };
    var P = plate(container, {id: 'xlate', w: 1200, h: 668, cls: 'plate-xlate',
      caption: 'VA 0x7ffd4a3c2e58 split into its four 9-bit table indices and its page offset, the four table reads with their real entry addresses, and the leaf entry decoded bit by bit.',
      views: [{id: 'overview', label: 'Whole walk', box: [0, 0, 1200, 668]}, {id: 'va', label: 'Address bits', box: [0, 0, 1200, 150]},
              {id: 'walk', label: 'Four table reads', box: [0, 150, 1200, 270]}, {id: 'pte', label: 'Leaf entry', box: [0, 420, 1200, 248]}]});
    var sv = P.sv, bx = function(i){ return 50 + (63 - i) * 17; };
    function bits(y, val, fields){
      for (var i = 63; i >= 0; i--){
        var b = Number((val >> BigInt(i)) & 1n), f = fields.filter(function(fd){ return i <= fd[0] && i >= fd[1]; })[0];
        R(sv, bx(i), y, 15, 22, f ? f[3] : 'sunk', 2); T(sv, bx(i) + 7.5, y + 15.5, b, {size: 10.5, anchor: 'middle', cls: 'm', fill: b ? 'var(--tx)' : 'var(--tx3)'});
      }
      [63, 48, 47, 39, 38, 30, 29, 21, 20, 12, 11, 0].forEach(function(i){ T(sv, bx(i) + 7.5, y - 4, i, {size: 8, anchor: 'middle', fill: 'var(--tx3)'}); });
      fields.forEach(function(fd){
        var x1 = bx(fd[0]), x2 = bx(fd[1]) + 15, yb = y + 28;
        path(sv, 'M ' + x1 + ' ' + yb + ' L ' + x1 + ' ' + (yb + 5) + ' L ' + x2 + ' ' + (yb + 5) + ' L ' + x2 + ' ' + yb, 'wire', {style: 'opacity:.7'});
        if (fd[2]) T(sv, (x1 + x2) / 2, yb + (fd[0] === fd[1] && fd[0] % 2 ? 30 : 18), fd[2], {size: 9.5, anchor: 'middle', fill: 'var(--tx2)'});
      });
    }
    head(sv, 20, 26, 'Virtual address ' + hex(va) + ' (64 bits)');
    var ix = function(sh){ return Number((va >> BigInt(sh)) & 511n); };
    bits(48, va, [[63, 48, 'sign extension of bit 47', 'sunk'], [47, 39, 'PML4 index ' + ix(39), 'a3b'], [38, 30, 'PDPT index ' + ix(30), 'a4b'], [29, 21, 'PD index ' + ix(21), 'a3b'], [20, 12, 'PT index ' + ix(12), 'a4b'], [11, 0, 'page offset ' + hex(va & 4095n), 'a2b']]);
    R(sv, 20, 168, 120, 84, 'a3b', 8); T(sv, 30, 190, 'CR3', {size: 12, weight: 650, fill: 'var(--tx)'}); T(sv, 30, 210, hex(Wk.cr3), {size: 11, cls: 'm', fill: 'var(--tx2)'}); T(sv, 30, 228, 'PML4 base', {size: 9.5, fill: 'var(--tx3)'}); T(sv, 30, 242, '(per process)', {size: 9.5, fill: 'var(--tx3)'});
    L.forEach(function(lv, k){
      var x = 160 + k * 258, ea = lv.base + BigInt(lv.idx * 8), leaf = k === 3, nx = lv.val & 0x000ffffffffff000n;
      R(sv, x, 160, 244, 250, 'box', 9);
      T(sv, x + 10, 180, lv.n + ' table', {size: 12.5, weight: 650, fill: 'var(--tx)'}); T(sv, x + 10, 196, '4 KB = 512 entries \u00d7 8 B', {size: 9.5, fill: 'var(--tx3)'});
      T(sv, x + 10, 212, 'base ' + hex(lv.base), {size: 10, cls: 'm', fill: 'var(--tx2)'});
      R(sv, x + 10, 222, 26, 176, 'sunk', 3);
      var ey = 222 + 176 * (lv.idx / 512); R(sv, x + 10, ey - 2, 26, 5, 'box on', 1);
      path(sv, 'M ' + (x + 36) + ' ' + ey + ' L ' + (x + 44) + ' ' + ey, 'wire on');
      T(sv, x + 50, 240, 'entry ' + lv.idx + ' of 512, at', {size: 9.5, fill: 'var(--act)'}); T(sv, x + 50, 254, hex(ea), {size: 10, cls: 'm', fill: 'var(--tx2)'});
      T(sv, x + 50, 270, '= base + ' + lv.idx + ' \u00d7 8', {size: 9, fill: 'var(--tx3)'});
      T(sv, x + 50, 300, 'value', {size: 9, fill: 'var(--tx3)'}); T(sv, x + 50, 314, hex(lv.val), {size: 10, cls: 'm', fill: 'var(--tx)'});
      T(sv, x + 50, 336, leaf ? 'leaf: PFN ' + hex(nx >> 12n) : 'next table at ' + hex(nx), {size: 9.5, fill: 'var(--tx2)'});
      T(sv, x + 50, 352, leaf ? 'NX, D, A, U/S, R/W, P set' : 'P, R/W, U/S, A set', {size: 9.5, fill: 'var(--tx3)'});
      if (k < 3) path(sv, 'M ' + (x + 244) + ' 286 L ' + (x + 256) + ' 286', 'wire on', {'marker-end': P.arrow});
    });
    path(sv, 'M 140 210 L 158 210', 'wire on', {'marker-end': P.arrow});
    var pte = L[3].val, pfn = (pte & 0x000ffffffffff000n) >> 12n;
    head(sv, 20, 444, 'Leaf PTE ' + hex(pte) + ', decoded');
    bits(466, pte, [[63, 63, 'NX', 'a1b'], [62, 52, 'available', 'sunk'], [51, 12, 'PFN ' + hex(pfn), 'a2b'], [11, 9, 'avail', 'sunk'], [8, 8, 'G', 'sunk'], [7, 7, 'PAT', 'sunk'], [6, 6, 'D', 'a3b'], [5, 5, 'A', 'a3b'], [4, 4, 'PCD', 'sunk'], [3, 3, 'PWT', 'sunk'], [2, 2, 'U/S', 'a4b'], [1, 1, 'R/W', 'a4b'], [0, 0, 'P', 'a4b']]);
    R(sv, 20, 546, 1160, 112, 'box', 9);
    T(sv, 34, 572, 'PA = PFN ' + hex(pfn) + ' \u00d7 4096 + offset ' + hex(va & 4095n) + ' = ' + hex((pfn << 12n) | (va & 4095n)), {size: 13, cls: 'm', fill: 'var(--tx)'});
    T(sv, 34, 596, 'NX = 1: data, not code \u00b7 U/S = 1: user page \u00b7 R/W = 1: writable \u00b7 P = 1: present', {size: 11, fill: 'var(--tx2)'});
    T(sv, 34, 616, 'A = 1 and D = 1: read and written since the OS last cleared them \u00b7 PCD = PWT = PAT = 0 \u2192 write-back memory type', {size: 11, fill: 'var(--tx2)'});
    T(sv, 34, 638, 'Bits 51:12 hold the frame number; 62:52 and 11:9 are ignored by the walker and free for the OS (Linux uses some of them).', {size: 10, fill: 'var(--tx3)'});
    return {set: function(){}};
  }

  /* ---------- plate 5: the Zen+ core at real sizes ---------- */
  function corePlate(container){
    var P = plate(container, {id: 'core', w: 1200, h: 640, cls: 'plate-core',
      caption: 'Every queue drawn with its published Zen+ size, one cell per entry. The amber cells are one iteration of the hist[data[i]]++ loop as this site\u2019s core model counts it: 7 \u00b5ops, 2 loads, 1 store.',
      views: [{id: 'overview', label: 'Whole core', box: [0, 0, 1200, 640]}, {id: 'front', label: 'Front end', box: [0, 30, 330, 610]},
              {id: 'ooo', label: 'Rename + ROB + schedulers', box: [320, 30, 520, 610]}, {id: 'lsu', label: 'Load/store unit', box: [830, 30, 370, 610]}]});
    var sv = P.sv;
    function grid(x, y, cols, n, cw, ch, hot, title, sub){
      head(sv, x, y - 26, title); if (sub) T(sv, x, y - 10, sub, {size: 9.5, fill: 'var(--tx3)'});
      for (var i = 0; i < n; i++) R(sv, x + (i % cols) * (cw + 2), y + Math.floor(i / cols) * (ch + 2), cw, ch, i < hot ? 'box on' : 'sunk', 1.5);
      return y + Math.ceil(n / cols) * (ch + 2);
    }
    head(sv, 20, 26, 'Zen+ core, one cell per entry');
    R(sv, 20, 46, 290, 50, 'a3b', 6); T(sv, 30, 66, 'L1i 64 KB, 4-way \u00b7 iTLB', {size: 11, fill: 'var(--tx)'}); T(sv, 30, 84, 'branch predictor + BTB in front', {size: 9.5, fill: 'var(--tx3)'});
    R(sv, 20, 104, 140, 50, 'a3b', 6); T(sv, 30, 124, 'op cache', {size: 11, fill: 'var(--tx)'}); T(sv, 30, 142, '2K entries', {size: 9.5, fill: 'var(--tx3)'});
    R(sv, 170, 104, 140, 50, 'a3b', 6); T(sv, 180, 124, 'decode \u00d7 4', {size: 11, fill: 'var(--tx)'}); T(sv, 180, 142, '4 x86 instr / cycle', {size: 9.5, fill: 'var(--tx3)'});
    grid(20, 202, 12, 72, 21, 12, 7, '\u00b5op queue: 72', 'feeds rename');
    R(sv, 20, 330, 290, 64, 'a3b', 6); T(sv, 30, 352, 'rename: RAT + free list', {size: 11, fill: 'var(--tx)'}); T(sv, 30, 370, '6 macro-ops / cycle into the back end', {size: 9.5, fill: 'var(--tx3)'}); T(sv, 30, 386, 'retire: 8 / cycle', {size: 9.5, fill: 'var(--tx3)'});
    R(sv, 20, 404, 290, 120, 'sunk', 6); T(sv, 30, 424, 'one loop iteration (this site\u2019s model)', {size: 10.5, fill: 'var(--tx)'});
    ['LD   data[i]', 'ALU  rdi += 1', 'LD   hist[k]', 'ALU  + 1', 'STA + STD  hist[k]', 'ALU  cmp + jne (fused)'].forEach(function(t, i){ T(sv, 30, 442 + i * 13, t, {size: 9.5, cls: 'm', fill: 'var(--tx2)'}); });
    R(sv, 20, 534, 290, 48, 'sunk', 6); T(sv, 30, 552, 'FP / SIMD unit', {size: 10.5, fill: 'var(--tx3)'}); T(sv, 30, 568, 'not used by this loop, not drawn', {size: 9.5, fill: 'var(--tx3)'});
    var yR = grid(340, 72, 24, 192, 18, 10, 7, 'ROB (retire queue): 192', '96 per thread with SMT');
    grid(340, yR + 52, 24, 168, 18, 10, 4, 'integer physical registers: 168', 'this iteration writes rax, rdi, tmp0, tmp1');
    var sy = 444;
    head(sv, 340, sy - 26, 'schedulers: 4 ALU \u00d7 14 + 2 AGU \u00d7 14'); T(sv, 340, sy - 10, 'this iteration: 4 ALU-side + 3 AGU-side \u00b5ops', {size: 9.5, fill: 'var(--tx3)'});
    ['ALU0', 'ALU1', 'ALU2', 'ALU3', 'AGU0', 'AGU1'].forEach(function(nm, q){
      var x = 340 + q * 80; T(sv, x, sy + 8, nm, {size: 9, fill: 'var(--tx3)'});
      var hot = q < 4 ? 1 : q === 4 ? 2 : 1;
      for (var i = 0; i < 14; i++) R(sv, x, sy + 14 + i * 9, 70, 7, i < hot ? 'box on' : 'sunk', 1);
    });
    T(sv, 340, 602, 'execution: 4 ALU ports + 2 AGU ports', {size: 10, fill: 'var(--tx2)'});
    var ly = grid(860, 72, 11, 44, 26, 12, 2, 'load queue: 44', 'two loads per iteration');
    var sy2 = grid(860, ly + 52, 11, 44, 26, 12, 1, 'store queue: 44', 'one store per iteration (STA + STD)');
    R(sv, 860, sy2 + 20, 320, 56, 'a4b', 6); T(sv, 870, sy2 + 40, 'L1d 32 KB 8-way \u00b7 2 loads + 1 store / cycle', {size: 10.5, fill: 'var(--tx)'}); T(sv, 870, sy2 + 58, 'way predictor (\u00b5tag) picks the way to read', {size: 9.5, fill: 'var(--tx3)'});
    R(sv, 860, sy2 + 84, 320, 56, 'a4b', 6); T(sv, 870, sy2 + 104, 'L1 DTLB 64 \u00b7 L2 TLB 1536 \u00b7 2 walkers', {size: 10.5, fill: 'var(--tx)'}); T(sv, 870, sy2 + 122, 'L1 miss buffers (MAB): count not published', {size: 9.5, fill: 'var(--tx3)'});
    R(sv, 860, sy2 + 148, 320, 56, 'a2b', 6); T(sv, 870, sy2 + 168, 'L2 512 KB 8-way, inclusive of L1', {size: 10.5, fill: 'var(--tx)'}); T(sv, 870, sy2 + 186, 'up to 50 outstanding misses to the L3', {size: 9.5, fill: 'var(--tx3)'});
    return {set: function(){}};
  }

  App.Plates = {plate: plate, dram: dramPlate, l1d: l1dPlate, e2e: e2ePlate, xlate: xlatePlate, core: corePlate};
})();
