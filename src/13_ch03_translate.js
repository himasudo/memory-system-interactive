/* ======================= chapter: translation ======================= */
App.chapter({id: 'xlate', num: '03', short: 'VA \u2192 PA', title: 'Virtual to physical: TLBs and the page walk',
sub: 'Before the L1d can confirm a hit it needs the physical address. This is what happens to the virtual address of hist[123] between the AGU and the tag compare, in five situations.',
build: function(root){
  var h = App.h, s = App.s, g = App.g, EX = App.EX, hx = App.hx;
  var VA = 0x7ffd4a3c2e58n;
  var TB = [
    {n: 'PML4', base: 0x10a3b000n, idx: 255, val: 0x11e2d067n},
    {n: 'PDPT', base: 0x11e2d000n, idx: 501, val: 0x13f4a067n},
    {n: 'PD',   base: 0x13f4a000n, idx: 81,  val: 0x1b6e9067n},
    {n: 'PT',   base: 0x1b6e9000n, idx: 450, val: 0x80000001a3f7c067n}
  ];
  var HUGE_PDE = 0x80000001a3e000e7n, FAULT_PTE = 0n;
  var mode = 'walk', st = null;

  var intro = h('div', {'class': 'grid2'}, root);
  h('div', {'class': 'card'}, intro, '<h3>Why every access needs this</h3><p>Each process sees its own 48-bit ' + g('va', 'virtual address') + ' space; physical memory is one shared array. The OS keeps a per-process ' + g('pml4', 'page table') + ' mapping 4 KB ' + g('page', 'pages') + ' to physical frames, and the ' + g('mmu') + ' must apply it to every load, store and instruction fetch. Walking four table levels on every access would multiply memory traffic by five, so recent translations are cached in ' + g('tlb', 'TLBs') + '.</p>');
  h('div', {'class': 'card'}, intro, '<h3>Why it costs nothing on a hit</h3><p>The L1d is ' + g('vipt') + '. Its set index is VA bits 11:6, which lie inside the 12-bit page offset, so they are the same before and after translation. The core starts reading the 8 ways of set 57 with virtual bits while the ' + g('dtlb') + ' translates in parallel; the physical tag is ready in time for the compare. This only works because 64 sets \u00d7 64 B = 4 KB = one page: a bigger L1d at 8 ways would need index bits above bit 11.</p>');

  var ctl = h('div', {'class': 'stp'}, root);
  h('span', {'class': 'note'}, ctl, 'situation:');
  App.seg(ctl, [['hit', 'DTLB hit'], ['l2', 'L2 TLB hit'], ['walk', 'full page walk'], ['fault', 'page fault'], ['huge', '2 MB page']], function(v){ mode = v; frames(); }, mode);

  var wrap = h('div', {'class': 'scroller'}, root);
  var sv = s('svg', {viewBox: '0 0 1200 720', style: 'min-width:900px'}, wrap);
  s('defs', null, sv).innerHTML = '<marker id="xa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9z" fill="var(--act)"/></marker>';
  var stp = App.stepper(root, {render: draw});
  var kern = h('div', {'class': 'card xlate-kernel'}, root);
  var extra = h('div', {'class': 'grid2 xlate-extra'}, root);

  /* ---------- VA register ---------- */
  var E = {};
  function G(id){ var gr = s('g', null, sv); E[id] = gr; return gr; }
  var gva = G('va');
  s('rect', {x: 10, y: 10, width: 770, height: 112, rx: 10, 'class': 'box'}, gva);
  s('text', {x: 22, y: 30, 'class': 'h'}, gva, 'Virtual address from the AGU');
  E.vaHex = s('text', {x: 768, y: 30, 'class': 'm', 'text-anchor': 'end', 'font-size': 13}, gva, '');
  E.fieldR = []; E.fieldT = [];
  for (var f = 0; f < 5; f++){
    var r = s('rect', {y: 44, height: 26, rx: 4, fill: 'none', 'stroke-width': 1.6}, gva); E.fieldR.push(r);
    var t = s('text', {y: 88, 'text-anchor': 'middle', 'font-size': 12}, gva, ''); E.fieldT.push(t);
    E.fieldT.push(s('text', {y: 104, 'text-anchor': 'middle', 'class': 's'}, gva, ''));
  }
  var bitsTx = [], vbin = VA.toString(2).padStart(48, '0');
  var BW = 14.6, BX = 26;
  for (var i = 0; i < 48; i++){
    var gap = (i >= 9 ? 6 : 0) + (i >= 18 ? 6 : 0) + (i >= 27 ? 6 : 0) + (i >= 36 ? 6 : 0);
    bitsTx.push(s('text', {x: BX + i * BW + gap + 6, y: 62, 'text-anchor': 'middle', 'class': 'm', 'font-size': 12}, gva, vbin[i]));
  }
  s('text', {x: 22, y: 118, 'class': 's'}, gva, 'bits 63:48 must copy bit 47 (canonical form); 0x00007ffd\u2026 passes');
  var gvi = G('vipt');
  s('rect', {x: 800, y: 10, width: 390, height: 112, rx: 10, 'class': 'box'}, gvi);
  s('text', {x: 812, y: 30, 'class': 'h'}, gvi, 'L1d, in parallel (VIPT)');
  s('text', {x: 812, y: 52}, gvi, 'set index = VA[11:6] = 57');
  s('text', {x: 812, y: 70}, gvi, 'all 8 ways of set 57 are being read');
  E.viptL = s('text', {x: 812, y: 92, 'class': 'm', 'font-size': 12}, gvi, '');
  s('text', {x: 812, y: 112, 'class': 's'}, gvi, 'bits 11:0 are identical in VA and PA');

  /* ---------- L1 DTLB CAM ---------- */
  var gcam = G('cam');
  s('rect', {x: 10, y: 140, width: 540, height: 196, rx: 10, 'class': 'box'}, gcam);
  s('text', {x: 22, y: 160, 'class': 'h'}, gcam, 'L1 DTLB \u2014 64 entries, fully associative');
  s('text', {x: 22, y: 176, 'class': 's'}, gcam, 'the VPN is compared against every entry in the same cycle (a CAM)');
  var camH = ['V', 'VPN', 'PCID', 'PFN', 'size', 'perm', 'compare'], camX = [24, 48, 180, 236, 322, 372, 440];
  camH.forEach(function(t, k){ s('text', {x: camX[k], y: 196, 'class': 's'}, gcam, t); });
  E.camRows = [];
  for (var k = 0; k < 6; k++){
    var y = 204 + k * 18;
    var rr = s('rect', {x: 18, y: y, width: 524, height: 16, rx: 3, 'class': 'sunk'}, gcam);
    var cells = camX.map(function(x){ return s('text', {x: x, y: y + 12, 'class': 'm', 'font-size': 11}, gcam, ''); });
    E.camRows.push({r: rr, c: cells});
  }
  s('text', {x: 24, y: 330, 'class': 's'}, gcam, '\u2026 58 more entries, all compared at once');
  /* L2 TLB */
  var gl2 = G('l2');
  s('rect', {x: 565, y: 140, width: 300, height: 196, rx: 10, 'class': 'box'}, gl2);
  s('text', {x: 577, y: 160, 'class': 'h'}, gl2, 'L2 TLB \u2014 1536 entries');
  s('text', {x: 577, y: 176, 'class': 's'}, gl2, 'checked after an L1 DTLB miss; no 1 GB pages');
  E.l2Rows = [];
  for (k = 0; k < 6; k++){
    var y2 = 190 + k * 19;
    E.l2Rows.push({r: s('rect', {x: 573, y: y2, width: 284, height: 17, rx: 3, 'class': 'sunk'}, gl2), t: s('text', {x: 581, y: y2 + 13, 'class': 'm', 'font-size': 11}, gl2, '')});
  }
  E.l2St = s('text', {x: 577, y: 322, 'font-size': 12}, gl2, '');
  /* walker */
  var gw = G('walker');
  s('rect', {x: 880, y: 140, width: 310, height: 196, rx: 10, 'class': 'box'}, gw);
  s('text', {x: 892, y: 160, 'class': 'h'}, gw, 'Page walker (\u00d72) + walk cache');
  s('text', {x: 892, y: 176, 'class': 's'}, gw, 'reads page-table entries through the data caches');
  E.wl = []; for (k = 0; k < 7; k++) E.wl.push(s('text', {x: 892, y: 200 + k * 18, 'font-size': 12}, gw, ''));
  /* CR3 + tables */
  var gcr = G('cr3');
  s('rect', {x: 10, y: 360, width: 130, height: 76, rx: 10, 'class': 'box'}, gcr);
  s('text', {x: 22, y: 380, 'class': 'h'}, gcr, 'CR3');
  s('text', {x: 22, y: 400, 'class': 'm', 'font-size': 11.5}, gcr, '0x10a3b000');
  s('text', {x: 22, y: 418, 'class': 's'}, gcr, 'PML4 base (PA)');
  s('text', {x: 22, y: 431, 'class': 's'}, gcr, '+ 12-bit PCID');
  var TX = [158, 418, 678, 938], TW = 250;
  E.tab = [];
  TB.forEach(function(tb, li){
    var gt = G('t' + li), x = TX[li];
    s('rect', {x: x, y: 360, width: TW, height: 170, rx: 10, 'class': 'box'}, gt);
    var ttl = s('text', {x: x + 10, y: 380, 'class': 'h'}, gt, tb.n + ' @ ' + hx(tb.base));
    var rows = [];
    for (var q = 0; q < 3; q++){
      var yy = 392 + q * 24;
      rows.push({r: s('rect', {x: x + 8, y: yy, width: TW - 16, height: 21, rx: 3, 'class': 'sunk'}, gt),
                 t: s('text', {x: x + 14, y: yy + 15, 'class': 'm', 'font-size': 11}, gt, '')});
    }
    var foot = s('text', {x: x + 10, y: 480, 'class': 's'}, gt, '512 entries \u00d7 8 B = one 4 KB page');
    var rd = s('text', {x: x + 10, y: 500, 'font-size': 11.5, 'class': 'm'}, gt, '');
    var rd2 = s('text', {x: x + 10, y: 518, 'class': 's'}, gt, '');
    E.tab.push({g: gt, rows: rows, rd: rd, rd2: rd2, ttl: ttl});
  });
  E.arr = [];
  [[140, 398, 158], [408, 434, 418], [668, 434, 678], [928, 434, 938]].forEach(function(a){
    E.arr.push(s('path', {d: 'M ' + a[0] + ' ' + a[1] + ' L ' + (a[2] - 2) + ' ' + a[1], 'class': 'wire', 'marker-end': 'url(#xa)', style: 'opacity:0'}, sv));
  });
  /* PTE decode */
  var gp = G('pte');
  s('rect', {x: 10, y: 548, width: 770, height: 162, rx: 10, 'class': 'box'}, gp);
  E.pteT = s('text', {x: 22, y: 568, 'class': 'h'}, gp, 'Entry fields');
  var PF = [['63', 'NX', 'no-exec'], ['62:52', 'avail', 'OS use'], ['51:12', 'PFN', 'physical frame'], ['11:9', 'avail', 'OS use'], ['8', 'G', 'global'], ['7', 'PS', 'size'], ['6', 'D', 'dirty'], ['5', 'A', 'accessed'], ['4', 'PCD', 'cache off'], ['3', 'PWT', 'write-thru'], ['2', 'U/S', 'user'], ['1', 'R/W', 'writable'], ['0', 'P', 'present']];
  var PW = [50, 50, 150, 44, 46, 46, 46, 56, 52, 56, 46, 52, 50], px = 22;
  E.pf = [];
  PF.forEach(function(f, q){
    var w = PW[q];
    var rr = s('rect', {x: px, y: 584, width: w - 3, height: 50, rx: 4, 'class': 'sunk'}, gp);
    s('text', {x: px + (w - 3) / 2, y: 598, 'text-anchor': 'middle', 'class': 's m'}, gp, f[0]);
    s('text', {x: px + (w - 3) / 2, y: 614, 'text-anchor': 'middle', 'font-size': 11.5, 'class': 'h'}, gp, f[1]);
    var v = s('text', {x: px + (w - 3) / 2, y: 629, 'text-anchor': 'middle', 'class': 'm', 'font-size': 11.5}, gp, '');
    s('text', {x: px + (w - 3) / 2, y: 650, 'text-anchor': 'middle', 'class': 's'}, gp, f[2]);
    E.pf.push({r: rr, v: v}); px += w;
  });
  E.pteN = s('text', {x: 22, y: 676, 'font-size': 12}, gp, '');
  E.pteN2 = s('text', {x: 22, y: 696, 'font-size': 12, 'class': 's'}, gp, '');
  /* PA */
  var gpa = G('pa');
  s('rect', {x: 800, y: 548, width: 390, height: 162, rx: 10, 'class': 'box'}, gpa);
  s('text', {x: 812, y: 568, 'class': 'h'}, gpa, 'Physical address');
  E.paL = []; for (k = 0; k < 6; k++) E.paL.push(s('text', {x: 812, y: 592 + k * 20, 'font-size': k === 0 ? 15 : 12, 'class': k === 0 ? 'm' : ''}, gpa, ''));

  function setBits(huge){
    var groups = huge ? [[0, 9, 'a3', 'PML4', '255'], [9, 18, 'a4', 'PDPT', '501'], [18, 27, 'a2', 'PD', '81'], [27, 48, 'act', 'offset in 2 MB', '0x1c2e58']] :
                        [[0, 9, 'a3', 'PML4', '255'], [9, 18, 'a4', 'PDPT', '501'], [18, 27, 'a2', 'PD', '81'], [27, 36, 'a1', 'PT', '450'], [36, 48, 'act', 'offset', '0xe58']];
    var gx = function(i){ return BX + i * BW + (i >= 9 ? 6 : 0) + (i >= 18 ? 6 : 0) + (i >= 27 ? 6 : 0) + (i >= 36 ? 6 : 0); };
    for (var q = 0; q < 5; q++){
      var gg = groups[q], R = E.fieldR[q], T = E.fieldT[q * 2], T2 = E.fieldT[q * 2 + 1];
      if (!gg){ R.style.display = 'none'; T.textContent = ''; T2.textContent = ''; continue; }
      R.style.display = '';
      var xa = gx(gg[0]) - 2, xb = gx(gg[1] - 1) + BW - 1;
      R.setAttribute('x', xa); R.setAttribute('width', xb - xa); R.setAttribute('stroke', 'var(--' + gg[2] + ')'); R.setAttribute('fill', 'var(--' + gg[2] + 'bg)');
      T.setAttribute('x', (xa + xb) / 2); T2.setAttribute('x', (xa + xb) / 2);
      T.textContent = gg[3] + ' \u00b7 ' + gg[4]; T2.textContent = 'bits ' + (47 - gg[0]) + ':' + (47 - gg[1] + 1);
    }
    E.vaHex.textContent = '0x00007ffd4a3c2e58  (hist[123], C1.ld)';
  }
  var camBase = [['1', '555555555', '001', '2b4e1', '4K', 'r-x'], ['1', '55555555a', '001', '1c07a', '4K', 'rw-'], ['1', '7ffd4a3c3', '001', '0f9d2', '4K', 'rw-'],
                 ['1', '7f3a91c05', '001', '2e8f0', '4K', 'r-x'], ['1', '7f3a91e2b', '001', '3a0c4', '4K', 'rw-'], ['1', '7ffd4a3c1', '001', '0a47e', '4K', 'rw-'], ['1', '7ffd4a3e9', '001', '11b02', '4K', 'rw-']];
  var HIT = ['1', '7ffd4a3c2', '001', '1a3f7c', '4K', 'rw-'], HIT2M = ['1', '7ffd4a2 (2M)', '001', '1a3e00', '2M', 'rw-'];

  function frames(){
    var fr = [];
    var F = function(p, t, d, o){ o.p = p; o.t = t; o.d = d; fr.push(o); };
    var huge = mode === 'huge';
    F('VA', 'The AGU produces the virtual address', 'C1\'s load computed <code>rdx + rax\u00d78 = 0x7ffd4a3c2a80 + 123\u00d78 = 0x7ffd4a3c2e58</code>. For translation it splits into ' + (huge ? 'three 9-bit table indices and a 21-bit offset, because this scenario assumes the region is backed by a 2 MB ' + g('huge', 'huge page') + '.' : 'four 9-bit table indices and a 12-bit page offset. The top 36 bits (0x7ffd4a3c2) are the ' + g('vpn') + '.'), {va: 1, huge: huge});
    F('lookup', 'L1 DTLB lookup, in parallel with the L1d set read', 'The VPN is broadcast to all 64 L1 DTLB entries; each has its own comparator (VPN and PCID must both match). Meanwhile the L1d reads the 8 ways of set 57 using VA bits 11:6.' + (mode === 'hit' ? ' <b>Entry 3 matches.</b>' : ' <b>No entry matches: L1 DTLB miss.</b> The load cannot complete its tag compare and waits.'), {va: 1, vipt: 1, cam: mode === 'hit' ? 'hit' : 'miss', huge: huge});
    if (mode === 'hit'){
      F('PA', 'Physical address in the same cycle', 'PFN 0x1a3f7c from the matching entry, joined with offset 0xe58, gives <b>PA 0x1a3f7ce58</b>. The L1d compares PA tag 0x1a3f7c against the 8 tags it just read (Chapter 04). Translation added no cycles.', {va: 1, vipt: 1, cam: 'hit', pa: 'ok'});
    } else if (mode === 'l2'){
      F('L2 TLB', 'L2 TLB hit', 'The L2 TLB (1536 entries) holds the translation. It is slower than the L1 DTLB but far cheaper than a walk. The entry is copied into the L1 DTLB, replacing an older one, and the load replays.', {va: 1, cam: 'miss', l2: 'hit'});
      F('fill', 'L1 DTLB refilled, load replays', 'Next attempt: the L1 DTLB hits in the new entry and the PA is <b>0x1a3f7ce58</b>.', {va: 1, cam: 'hitnew', l2: 'hit', pa: 'ok'});
    } else {
      F('L2 miss', 'L2 TLB miss: start a page walk', 'Neither TLB has the translation. One of the two hardware ' + g('walk', 'page walkers') + ' takes the request. It will read one 8-byte entry per level, each read depending on the previous one.', {va: 1, cam: 'miss', l2: 'miss', walker: 1, huge: huge});
      var lv = huge ? 3 : 4;
      for (var q = 0; q < lv; q++){
        var tb = TB[q], ea = tb.base + BigInt(tb.idx) * 8n;
        var v = tb.val; if (huge && q === 2) v = HUGE_PDE; if (mode === 'fault' && q === 3) v = FAULT_PTE;
        var nxt = v & 0x000ffffffffff000n;
        var d = (q === 0 ? 'CR3 holds the PML4 base 0x10a3b000. ' : 'The previous entry gave this table\'s base ' + hx(tb.base) + '. ') +
          'Entry address = base + index \u00d7 8 = ' + hx(tb.base) + ' + ' + tb.idx + ' \u00d7 8 = <b>' + hx(ea) + '</b>. The walker issues an 8-byte load to that physical address; it goes through the data caches like any load' + (q < 2 ? ', and upper levels like this one can also come from the ' + g('pwc') : '') + '. ';
        if (mode === 'fault' && q === 3) d += 'The entry is <b>0</b>: present bit clear. There is no translation.';
        else if (huge && q === 2) d += 'Value ' + hx(v) + ': <b>PS = 1</b>, so this PDE is the leaf. It maps a whole 2 MB frame at ' + hx(v & 0x000fffffffe00000n) + '; no PT level.';
        else if (q === 3) d += 'Value ' + hx(v) + ': present, writable, user, accessed, dirty, no-execute. <b>PFN = 0x1a3f7c.</b>';
        else d += 'Value ' + hx(v) + ': present, points to the next table at <b>' + hx(nxt) + '</b>.';
        F(tb.n, 'Level ' + (q + 1) + ': read the ' + tb.n + ' entry', d, {va: 1, cam: 'miss', l2: 'miss', walker: 1, lvl: q + 1, pte: q, pteVal: v, huge: huge, fault: mode === 'fault' && q === 3});
      }
      if (mode === 'fault'){
        F('#PF', 'Page fault raised', 'The walker reports "not present". The load is marked faulting in the ROB. Nothing happens until it reaches the ROB head: exceptions are taken in program order, so older instructions retire first and all younger ones are ' + g('squash', 'squashed') + '. Then the CPU writes the faulting address into ' + g('pf', 'CR2') + ', pushes an error code (P = 0: not present; U/S = 1: user mode; W/R: the access type) and jumps to the kernel\'s #PF handler (vector 14).', {va: 1, walker: 1, lvl: 4, pte: 3, pteVal: FAULT_PTE, pa: 'fault', kernel: 1, fault: true});
        F('kernel', 'Linux allocates the page', 'The handler finds the VMA covering the address, sees an anonymous page never touched, allocates a zeroed 4 KB frame (on the NUMA node of this CPU: ' + g('ftouch') + '), and writes a present PTE. The kernel function chain is shown below the diagram.', {va: 1, walker: 1, lvl: 4, pte: 3, pteVal: TB[3].val, pa: 'fault', kernel: 2, fault: true});
        F('retry', 'Return and re-execute', 'iretq returns to the faulting instruction, which runs again from the start: TLB miss, walk, now the PTE is present, PFN 0x1a3f7c, <b>PA 0x1a3f7ce58</b>. This was a <b>minor</b> fault (no disk I/O). A <b>major</b> fault would also have to read the page from swap or a file, through the NVMe path of Chapter 10.', {va: 1, lvl: 4, pte: 3, pteVal: TB[3].val, pa: 'ok', cam: 'hitnew', kernel: 3});
      } else {
        F('fill', 'Fill the TLBs and replay', huge ? 'The 2 MB translation goes into the L2 TLB and the L1 DTLB. PA = 2 MB frame base 0x1a3e00000 + VA bits 20:0 (0x1c2e58) = <b>0x1a3fc2e58</b> (a different mapping from the 4 KB case, assumed for this scenario). One entry now covers 512 times more memory.' :
          'The walker writes VPN 0x7ffd4a3c2 \u2192 PFN 0x1a3f7c into the L2 TLB and the L1 DTLB. If the accessed (A) bit had been clear, the walker would have set it in memory; a first write also sets D. The load replays, hits in the L1 DTLB, and gets <b>PA 0x1a3f7ce58</b>.', {va: 1, lvl: huge ? 3 : 4, pte: huge ? 2 : 3, pteVal: huge ? HUGE_PDE : TB[3].val, cam: 'hitnew', pa: 'ok', huge: huge});
      }
    }
    stp.set(fr);
  }

  function draw(f){
    setBits(!!f.huge);
    for (var id in E) if (E[id] && E[id].setAttribute && /^(va|vipt|cam|l2|walker|cr3|t0|t1|t2|t3|pte|pa)$/.test(id)) E[id].setAttribute('class', '');
    var on = function(id){ E[id].setAttribute('class', 'on'); };
    if (f.p === 'VA') on('va');
    if (f.vipt){ on('vipt'); E.viptL.textContent = f.cam === 'hit' ? 'tags ready; waiting for PA tag \u2192 now' : 'tags read; PA tag not yet known'; } else E.viptL.textContent = '';
    /* CAM */
    var rows = camBase.slice();
    if (f.cam === 'hit' || (mode === 'hit')) rows = [camBase[0], camBase[1], HIT].concat(camBase.slice(2, 6));
    if (f.cam === 'hitnew') rows = [camBase[0], camBase[1], f.huge ? HIT2M : HIT].concat(camBase.slice(2, 6));
    E.camRows.forEach(function(r, k){
      var row = rows[k], match = (f.cam === 'hit' || f.cam === 'hitnew') && row === (f.huge ? HIT2M : HIT);
      row.forEach(function(v, c){ r.c[c].textContent = v; });
      var searching = f.cam === 'hit' || f.cam === 'miss' || f.cam === 'hitnew';
      r.c[6].textContent = !searching ? '' : match ? '= match' : '\u2260';
      r.r.setAttribute('class', match ? 'okb' : 'sunk');
      r.c[6].setAttribute('fill', match ? 'var(--ok)' : 'var(--tx3)');
    });
    if (f.cam) on('cam');
    /* L2 TLB */
    var l2rows = ['55555555a \u2192 1c07a', '7ffd4a3c3 \u2192 0f9d2', '7f3a91c05 \u2192 2e8f0', '7ffd4a3c1 \u2192 0a47e', '55555555b \u2192 1c07b', '7f3a91e2b \u2192 3a0c4'];
    if (mode === 'l2') l2rows[3] = '7ffd4a3c2 \u2192 1a3f7c';
    E.l2Rows.forEach(function(r, k){ r.t.textContent = l2rows[k]; r.r.setAttribute('class', f.l2 === 'hit' && k === 3 && mode === 'l2' ? 'okb' : 'sunk'); });
    E.l2St.textContent = f.l2 === 'hit' ? 'hit' : f.l2 === 'miss' ? 'miss \u2192 page walk' : '';
    E.l2St.setAttribute('fill', f.l2 === 'hit' ? 'var(--ok)' : 'var(--bad)');
    if (f.l2) on('l2');
    /* walker text */
    var wl = [];
    if (f.walker || f.lvl){
      wl.push('request: VA 0x7ffd4a3c2e58');
      for (var q = 0; q < (f.lvl || 0); q++){
        var tb = TB[q], ea = tb.base + BigInt(tb.idx) * 8n;
        wl.push((q + 1) + '. read ' + tb.n + 'E @ ' + hx(ea));
      }
      if (f.lvl === (f.huge ? 3 : 4)) wl.push(f.fault ? 'result: NOT PRESENT' : 'result: ' + (f.huge ? '2 MB frame 0x1a3e00000' : 'PFN 0x1a3f7c'));
    }
    E.wl.forEach(function(t, k){ t.textContent = wl[k] || (k === 0 && !wl.length ? 'idle' : ''); t.setAttribute('fill', /NOT/.test(wl[k] || '') ? 'var(--bad)' : ''); });
    if (f.walker) on('walker');
    /* tables */
    E.tab.forEach(function(t, li){
      var tb = TB[li], shown = f.lvl && li < f.lvl, isCur = f.lvl === li + 1 && f.p !== 'fill' && f.p !== '#PF' && f.p !== 'kernel' && f.p !== 'retry';
      var hidden = f.huge && li === 3;
      t.g.style.opacity = hidden ? .25 : shown ? 1 : .45;
      var v = tb.val; if (f.huge && li === 2) v = HUGE_PDE; if (mode === 'fault' && li === 3) v = f.kernel >= 2 ? TB[3].val : FAULT_PTE;
      [-1, 0, 1].forEach(function(dI, k){
        var idx = tb.idx + dI, row = t.rows[k];
        var val = dI === 0 ? v : (li === 0 && dI === 1 ? 0n : dI === -1 ? tb.val + (li === 3 ? -4096n : 0x1000n * BigInt(li + 1)) : 0n);
        row.t.textContent = '[' + idx + '] ' + (shown || dI !== 0 ? hx(val, 16) : '\u2026');
        row.r.setAttribute('class', dI === 0 && shown ? (mode === 'fault' && li === 3 && f.kernel !== 2 && f.kernel !== 3 ? 'badb' : isCur ? 'on box' : 'okb') : 'sunk');
      });
      var ea = tb.base + BigInt(tb.idx) * 8n;
      t.rd.textContent = shown && !hidden ? 'read ' + hx(ea) : '';
      t.rd2.textContent = shown && !hidden ? (li < 2 ? 'can hit in the page-walk cache' : 'an 8-byte load through L1d/L2') : hidden ? 'skipped: the PDE was the leaf' : '';
      if (isCur) t.g.setAttribute('class', 'on');
    });
    if (f.lvl) on('cr3');
    E.arr.forEach(function(a, k){ a.style.opacity = f.lvl && k < f.lvl && !(f.huge && k === 3) ? 1 : 0; });
    /* PTE decode */
    if (f.pte !== undefined){
      var v2 = f.pteVal, lvlN = TB[f.pte].n;
      E.pteT.textContent = lvlN + '[' + TB[f.pte].idx + '] = ' + hx(v2, 16);
      var vals = [(v2 >> 63n) & 1n, (v2 >> 52n) & 0x7ffn, (v2 >> 12n) & 0xffffffffffn, (v2 >> 9n) & 7n, (v2 >> 8n) & 1n, (v2 >> 7n) & 1n, (v2 >> 6n) & 1n, (v2 >> 5n) & 1n, (v2 >> 4n) & 1n, (v2 >> 3n) & 1n, (v2 >> 2n) & 1n, (v2 >> 1n) & 1n, v2 & 1n];
      E.pf.forEach(function(p, k){ p.v.textContent = k === 2 ? hx(vals[k]) : vals[k].toString(); p.r.setAttribute('class', k === 12 && vals[12] === 0n ? 'badb' : (k === 5 && vals[5] === 1n) || k === 2 ? 'a4b' : vals[k] === 1n && k !== 1 && k !== 3 ? 'okb' : 'sunk'); });
      E.pteN.textContent = v2 === 0n ? 'P = 0: not present. The other bits mean nothing; the OS may store swap information in them.' :
        (f.huge && f.pte === 2) ? 'PS = 1 at the PD level: a 2 MB leaf. The frame base is bits 51:21.' :
        f.pte === 3 ? 'Leaf entry. NX = 1 (data, not code). D = 1: this page has been written. PCD = PWT = 0 with PAT \u2192 write-back memory type.' : 'Non-leaf entry: bits 51:12 are the physical address of the next table.';
      E.pteN2.textContent = f.pte === 3 && v2 !== 0n ? 'The walker also checks permissions here: a user-mode load needs P = 1 and U/S = 1 at every level.' : '';
      on('pte');
    } else {
      E.pteT.textContent = 'Entry fields (a page-table entry is 8 bytes)';
      E.pf.forEach(function(p){ p.v.textContent = ''; p.r.setAttribute('class', 'sunk'); }); E.pteN.textContent = ''; E.pteN2.textContent = '';
    }
    /* PA */
    var pl = [];
    if (f.pa === 'ok'){
      pl = f.huge ? ['0x1a3fc2e58', 'frame 0x1a3e00000 (2 MB) + VA[20:0] 0x1c2e58', 'L1d still indexes with VA[11:6] = 57', 'tag compare uses PA bits 47:12 = 0x1a3fc2', 'TLB reach per entry: 2 MB', ''] :
                    ['0x1a3f7ce58', 'PFN 0x1a3f7c \u00d7 4096 + offset 0xe58', 'L1d tag compare with PA tag 0x1a3f7c', 'continue in Chapter 04 (set 57)', 'TLB reach per entry: 4 KB', ''];
      on('pa');
    } else if (f.pa === 'fault') pl = ['#PF (vector 14)', 'CR2 \u2190 0x7ffd4a3c2e58', 'error code: P = 0, U/S = 1', 'no physical address exists yet', '', ''];
    else pl = ['\u2014', 'waiting for translation', '', '', '', ''];
    E.paL.forEach(function(t, k){ t.textContent = pl[k] || ''; t.setAttribute('fill', f.pa === 'fault' && k === 0 ? 'var(--bad)' : ''); });
    /* kernel card */
    kern.style.display = mode === 'fault' ? '' : 'none';
    var K = [['exc_page_fault()', 'arch/x86/mm/fault.c', 'entry point for vector 14; reads CR2'], ['do_user_addr_fault()', 'arch/x86/mm/fault.c', 'finds the VMA containing the address, checks access rights'],
             ['handle_mm_fault()', 'mm/memory.c', 'generic fault handling; walks/creates the page-table levels'], ['handle_pte_fault()', 'mm/memory.c', 'PTE is empty and the VMA is anonymous'],
             ['do_anonymous_page()', 'mm/memory.c', 'allocate a zeroed page, build the PTE, set it'], ['iretq', '', 'back to user mode; the faulting instruction restarts']];
    kern.innerHTML = '<h3>The kernel side of a page fault <span class="tag pub">Linux, recent mainline; names shift between versions</span></h3><div class="kchain">' +
      K.map(function(k, i){ var act = f.kernel && (f.kernel === 1 ? i === 0 : f.kernel === 2 ? i >= 1 && i <= 4 : i === 5); return '<div class="' + (act ? 'on' : '') + '"><code>' + k[0] + '</code><span>' + k[1] + '</span><p>' + k[2] + '</p></div>'; }).join('') + '</div>';
  }

  /* reach + context-switch cards */
  var reach = h('div', {'class': 'card'}, extra);
  reach.innerHTML = '<h3>' + g('reach', 'TLB reach') + ' on your core</h3><table class="mt"><tr><th></th><th>entries</th><th>4 KB pages</th><th>2 MB pages</th></tr>' +
    '<tr><td>L1 DTLB</td><td>64</td><td>256 KB</td><td>128 MB</td></tr><tr><td>L2 TLB</td><td>1536</td><td>6 MB</td><td>3 GB</td></tr></table>' +
    '<p style="margin-top:8px">Compare with the caches you measured: L1d 32 KB, L2 512 KB, L3 4 MB. With 4 KB pages, a working set can fit in a cache level while its translations no longer fit in a TLB level, and the two effects show up at different sizes.</p>';
  var ctx = h('div', {'class': 'card'}, extra);
  ctx.innerHTML = '<h3>Context switches and ' + g('pcid', 'PCID') + '</h3><p>Switching processes writes a new value into ' + g('cr3') + '. Without PCIDs every non-global TLB entry would have to be discarded, and the next process starts with page walks. With PCIDs each entry carries a 12-bit process tag, so entries from different processes coexist and a switch only changes which tag matches.</p>' +
    '<p>The kernel removes stale entries itself with <code>invlpg</code> (one page) or a CR3 reload, for example after <code>munmap</code>. On multi-core systems it must also interrupt other cores that may cache the entry (a TLB shootdown).</p>';
  frames();
  return {key: stp.key};
}});
