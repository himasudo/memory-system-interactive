/* ======================= section overview figures (hardware chapters) =======================
   Small diagrams placed directly under a section heading, before the section's interactive part.
   add(chapter, section, {h, cap, draw(svg), live}) registers one; the core inserts them when the
   chapter's sections are built. live: redraw when the latency settings change. */
(function(){
  var FIGS = {};
  function add(ch, sec, spec){ var k = ch + '--' + sec; (FIGS[k] = FIGS[k] || []).push(spec); }
  App.applySecFigs = function(chId, list){
    list.forEach(function(x){
      var specs = FIGS[chId + '--' + x.id]; if (!specs || x.el.querySelector(':scope > .sec-figs')) return;
      var wrap = document.createElement('div'); wrap.className = 'sec-figs';
      var lead = x.el.querySelector(':scope > .scene-lead');
      x.el.insertBefore(wrap, lead ? lead.nextSibling : x.el.firstChild);
      specs.forEach(function(sp){
        var sv = App.P.fig(wrap, sp.w || 460, sp.h, sp.cap); sp.draw(sv);
        if (sp.live) App.onCfg(function(){ while (sv.childNodes.length > 1) sv.removeChild(sv.lastChild); sp.draw(sv); });
      });
    });
  };
  var P = App.P, T = P.T, R = P.R, A = P.A, Ln = P.Ln, box = P.box;
  function num(id){ return App.chNum(id); }
  function lines(sv, x, y, arr, cls){ arr.forEach(function(t, i){ T(sv, x, y + i * 14, t, cls || 's', 'middle'); }); }

  /* ---- 09 the machine ---- */
  add('map', 'route', {h: 150, cap: 'One access, stage by stage. The number under each stage is the chapter that covers it.', draw: function(sv){
    [['C \u2192 \u00b5ops', 'code'], ['core', 'core'], ['TLB', 'xlate'], ['L1d', 'l1d'], ['L2 \u00b7 L3', 'hier'], ['DRAM', 'dram']].forEach(function(s, i){
      var x = 6 + i * 76; R(sv, x, 12, 68, 40, 'a2b');
      T(sv, x + 34, 37, s[0], '', 'middle'); T(sv, x + 34, 70, 'ch. ' + num(s[1]), 's m', 'middle');
      if (i < 5) A(sv, 'M' + (x + 69) + ' 32 H' + (x + 75));
    });
    T(sv, 6, 100, 'acting on the same path', 's');
    [['stores', 'stores'], ['coherence', 'coh'], ['prefetch', 'pref'], ['devices', 'dev'], ['full path', 'e2e']].forEach(function(s, i){
      var x = 6 + i * 90; R(sv, x, 108, 86, 36, 'box', 10);
      T(sv, x + 43, 123, s[0], 's', 'middle'); T(sv, x + 43, 138, 'ch. ' + num(s[1]), 's m', 'middle');
    });
  }});

  /* ---- 10 C -> assembly -> bytes -> uops ---- */
  add('code', 'example', {h: 124, cap: 'The System V AMD64 calling convention passes the first three integer arguments in rdi, rsi and rdx.', draw: function(sv){
    [['const unsigned char *data', 'rdi', '0x55555555a2c0'], ['long n', 'rsi', 'the count'], ['long *hist', 'rdx', '0x7ffd4a3c2a80']].forEach(function(r, i){
      var y = 10 + i * 38;
      R(sv, 10, y, 206, 28, 'a3b'); T(sv, 20, y + 19, r[0], 'm s');
      A(sv, 'M218 ' + (y + 14) + ' H250');
      R(sv, 254, y, 54, 28, 'a4b'); T(sv, 281, y + 19, r[1], 'm', 'middle');
      T(sv, 318, y + 19, r[2], 's m');
    });
  }});
  add('code', 'decode', {h: 150, cap: 'The five bytes of addq $0x1,(%rdx,%rax,8), field by field.', draw: function(sv){
    [['REX', '48', '0100 1000', 'W=1: 64-bit'], ['opcode', '83', '/0 = ADD', 'r/m64, imm8'], ['ModRM', '04', '00 000 100', 'memory, SIB'], ['SIB', 'c2', '11 000 010', '\u00d78, rax, rdx'], ['imm8', '01', '0000 0001', 'constant 1']].forEach(function(f, i){
      var x = 10 + i * 88;
      T(sv, x + 42, 16, f[0], 's', 'middle');
      R(sv, x, 24, 84, 32, i === 2 || i === 3 ? 'a4b' : 'a3b'); T(sv, x + 42, 45, f[1], 'h m', 'middle');
      T(sv, x + 42, 76, f[2], 's m', 'middle'); T(sv, x + 42, 94, f[3], 's', 'middle');
    });
    T(sv, 230, 130, 'addq $0x1,(%rdx,%rax,8)  =  48 83 04 c2 01', 'm', 'middle');
  }});

  /* ---- 11 inside the core ---- */
  add('core', 'model', {h: 124, cap: 'Instructions enter and leave in program order; in between, \u00b5ops execute as soon as their inputs are ready.', draw: function(sv){
    ['fetch', 'decode', 'rename', 'schedule', 'execute', 'retire'].forEach(function(s, i){
      var x = 7 + i * 76; R(sv, x, 14, 66, 34, i === 3 || i === 4 ? 'a2b' : 'a3b'); T(sv, x + 33, 35, s, 's', 'middle');
      if (i < 5) A(sv, 'M' + (x + 67) + ' 31 H' + (x + 75));
    });
    Ln(sv, 'M9 56 V62 H225 V56'); T(sv, 117, 76, 'in order', 's', 'middle');
    Ln(sv, 'M237 56 V62 H377 V56'); T(sv, 307, 76, 'out of order', 's', 'middle');
    Ln(sv, 'M389 56 V62 H451 V56'); T(sv, 420, 76, 'in order', 's', 'middle');
    R(sv, 159, 90, 294, 22, 'a4b'); T(sv, 306, 105, 'reorder buffer (ROB): rename \u2192 retire', 's', 'middle');
  }});

  /* ---- 12 virtual -> physical ---- */
  add('xlate', 'why', {h: 132, cap: 'The virtual address of hist[123] split for the 4-level page walk: four 9-bit indexes and a 12-bit offset.', draw: function(sv){
    var va = 0x7ffd4a3c2e58n;
    [['47:39', 'PML4', Number((va >> 39n) & 511n)], ['38:30', 'PDPT', Number((va >> 30n) & 511n)], ['29:21', 'PD', Number((va >> 21n) & 511n)], ['20:12', 'PT', Number((va >> 12n) & 511n)], ['11:0', '', '0x' + (va & 4095n).toString(16)]].forEach(function(f, i){
      var x = 5 + i * 91, w = 85;
      T(sv, x + w / 2, 16, 'bits ' + f[0], 's m', 'middle');
      R(sv, x, 24, w, 34, i < 4 ? 'a1b' : 'a3b'); T(sv, x + w / 2, 46, String(f[2]), 'h m', 'middle');
      T(sv, x + w / 2, 76, i < 4 ? f[1] + ' index' : 'page offset', 's', 'middle');
    });
    T(sv, 230, 104, 'each index selects one of 512 entries in its table;', 's', 'middle');
    T(sv, 230, 120, 'the PT entry names physical frame 0x1a3f7c', 's', 'middle');
  }});
  add('xlate', 'fault', {h: 146, cap: 'A fault leaves the hardware, runs the kernel\u2019s handler, then retries the instruction.', draw: function(sv){
    box(sv, 10, 12, 132, 44, 'a1b', 'page walk', 'hardware');
    box(sv, 164, 12, 132, 44, 'badb', 'PTE not present', 'P bit = 0');
    box(sv, 318, 12, 132, 44, 'badb', '#PF', 'vector 14');
    box(sv, 318, 94, 132, 44, 'a4b', 'kernel handler', 'handle_mm_fault()');
    box(sv, 164, 94, 132, 44, 'a4b', 'page mapped', 'PTE written');
    box(sv, 10, 94, 132, 44, 'okb', 'retry', 'the walk now succeeds');
    A(sv, 'M143 34 H160'); A(sv, 'M297 34 H314'); A(sv, 'M384 58 V90', true); A(sv, 'M316 116 H299'); A(sv, 'M162 116 H145');
  }});
  add('xlate', 'depth', {h: 132, cap: 'Reach = entries \u00d7 page size: how much memory each TLB maps without a page walk.', draw: function(sv){
    T(sv, 250, 16, '4 KB pages', 's', 'middle'); T(sv, 380, 16, '2 MB pages', 's', 'middle');
    [['L1 DTLB', '64 entries', '256 KB', '128 MB'], ['L2 TLB', '1536 entries', '6 MB', '3 GB']].forEach(function(r, i){
      var y = 26 + i * 50;
      R(sv, 10, y, 170, 40, 'a4b'); T(sv, 22, y + 17, r[0], 'h'); T(sv, 22, y + 33, r[1], 's');
      R(sv, 190, y, 120, 40, 'box'); T(sv, 250, y + 25, r[2], 'm', 'middle');
      R(sv, 320, y, 120, 40, 'a2b'); T(sv, 380, y + 25, r[3], 'm', 'middle');
    });
  }});

  /* ---- 13 L1d lookup ---- */
  add('l1d', 'layout', {h: 116, cap: 'How the L1d splits the address of hist[123]: the set from bits 11:6, the tag from the physical page.', draw: function(sv){
    var x = 10;
    [['tag', 'bits 47:12', 250, 'a1b', '0x1a3f7c'], ['index', '11:6', 100, 'a2b', 'set 57'], ['offset', '5:0', 90, 'a3b', 'byte 24']].forEach(function(f){
      T(sv, x + f[2] / 2, 16, f[1], 's m', 'middle');
      R(sv, x, 24, f[2], 34, f[3]); T(sv, x + f[2] / 2, 46, f[0], 'h', 'middle');
      T(sv, x + f[2] / 2, 78, f[4], 'm', 'middle'); x += f[2];
    });
    Ln(sv, 'M14 88 V92 H256 V88'); T(sv, 135, 108, 'physical: from the TLB', 's', 'middle');
    Ln(sv, 'M264 88 V92 H446 V88'); T(sv, 355, 108, 'virtual: known before translation', 's', 'middle');
  }});
  add('l1d', 'layout', {h: 100, cap: 'One way of set 57: valid and dirty bits, the 36-bit physical tag, and the 64 data bytes of the line.', draw: function(sv){
    var x = 10;
    [['V', '1', 34, 'a2b'], ['D', '0', 34, 'a3b'], ['tag (36 bits)', '0x1a3f7c', 132, 'a1b'], ['data (64 bytes)', 'hist[120] \u2026 hist[127]', 240, 'box']].forEach(function(f){
      T(sv, x + f[2] / 2, 16, f[0], 's', 'middle'); R(sv, x, 24, f[2], 36, f[3], 3); T(sv, x + f[2] / 2, 47, f[1], 'm', 'middle'); x += f[2];
    });
    T(sv, 10, 86, 'D becomes 1 when a store writes the line. The index is not stored.', 's');
  }});

  /* ---- 14 down the hierarchy ---- */
  add('hier', 'levels', {h: 186, cap: 'Lines from DRAM fill the L2 and L1d directly; the L3 receives only what the L2 evicts.', draw: function(sv){
    box(sv, 20, 10, 120, 36, 'a3b', 'L1d');
    box(sv, 20, 72, 120, 46, 'a2b', 'L2', '512 KB, per core');
    R(sv, 300, 62, 150, 66, 'a2b'); T(sv, 375, 82, 'L3', 'h', 'middle'); T(sv, 375, 98, '4 MB, shared', 's', 'middle');
    R(sv, 312, 106, 126, 16, 'a4b', 3); T(sv, 375, 118, 'shadow tags', 's', 'middle');
    box(sv, 170, 146, 120, 36, 'sunk', 'DRAM');
    A(sv, 'M80 72 V50'); T(sv, 88, 64, 'fill', 's');
    A(sv, 'M168 164 C100 164 80 150 80 122'); T(sv, 96, 178, 'fill', 's');
    A(sv, 'M142 86 H296', true); T(sv, 219, 80, 'L2 victim moves down', 's', 'middle');
    A(sv, 'M298 112 H144'); T(sv, 219, 128, 'L3 hit: the line moves up', 's', 'middle');
  }});
  add('hier', 'parallel', {h: 150, live: true, cap: 'Four misses to DRAM, from the latency settings: independent ones overlap; a pointer chase pays each one in full.', draw: function(sv){
    var D = App.dramCycles(), px = 400 / (4 * D), x0 = 40;
    T(sv, 10, 14, 'independent loads, one per cycle: about ' + (D + 3) + ' cycles', 's');
    for (var i = 0; i < 4; i++) R(sv, x0 + i * 3, 22 + i * 9, D * px, 7, 'a2b', 2);
    T(sv, 10, 84, 'pointer chase: 4 \u00d7 ' + D + ' = ' + 4 * D + ' cycles', 's');
    for (var k = 0; k < 4; k++){ R(sv, x0 + k * D * px, 92, D * px - 2, 20, 'box on', 3); T(sv, x0 + k * D * px + D * px / 2, 106, 'miss ' + (k + 1), 's', 'middle'); }
    Ln(sv, 'M' + x0 + ' 124 H' + (x0 + 400)); T(sv, x0, 140, '0', 's m', 'middle'); T(sv, x0 + 400, 140, 4 * D + ' cycles', 's m', 'end');
  }});

  /* ---- 15 DRAM ---- */
  add('dram', 'banks', {h: 176, cap: 'Bank 3 of bank group 3: ACT copies row 26877 into the row buffer; RD then reads column 28 from it.', draw: function(sv){
    R(sv, 10, 10, 230, 104, 'sunk');
    for (var i = 0; i < 7; i++) Ln(sv, 'M16 ' + (22 + i * 13) + ' H234');
    R(sv, 12, 57, 226, 14, 'box on', 2); T(sv, 125, 68, 'row 26877', 's m', 'middle');
    A(sv, 'M92 73 V124', true); R(sv, 99, 91, 34, 16, 'sunk', 3); T(sv, 116, 103, 'ACT', 's m', 'middle');
    R(sv, 10, 128, 230, 22, 'a4b', 3); T(sv, 110, 143, 'row buffer', 's', 'middle');
    R(sv, 176, 128, 18, 22, 'box on', 2); A(sv, 'M185 152 V172'); T(sv, 192, 170, 'RD: column 28', 's m');
    T(sv, 262, 30, 'ACT: open a row', 'h'); T(sv, 262, 46, 'tRCD = 17 clocks', 's m');
    T(sv, 262, 80, 'RD: read a column', 'h'); T(sv, 262, 96, 'CL = 17 clocks', 's m');
    T(sv, 262, 130, 'PRE: close the row', 'h'); T(sv, 262, 146, 'tRP = 17 clocks', 's m');
  }});
  add('dram', 'meaning', {h: 136, cap: 'DDR4-2400 CL17, tCK = 0.833 ns. The last 4 clocks of each line are the 8-beat data burst.', draw: function(sv){
    var px = 4.8, x0 = 96;
    [['row hit', [['CL', 17, 'a2b'], ['', 4, 'box on']]], ['closed row', [['tRCD', 17, 'a4b'], ['CL', 17, 'a2b'], ['', 4, 'box on']]], ['row conflict', [['tRP', 17, 'badb'], ['tRCD', 17, 'a4b'], ['CL', 17, 'a2b'], ['', 4, 'box on']]]].forEach(function(c, i){
      var y = 14 + i * 44, x = x0, tot = 0;
      T(sv, 10, y + 16, c[0], 's');
      c[1].forEach(function(sg){ R(sv, x, y, sg[1] * px - 1, 24, sg[2], 3); if (sg[0]) T(sv, x + sg[1] * px / 2, y + 16, sg[0], 's m', 'middle'); x += sg[1] * px; tot += sg[1]; });
      T(sv, x + 6, y + 16, tot + ' = ' + (tot * 0.8333).toFixed(1) + ' ns', 's m');
    });
  }});

  /* ---- 16 stores ---- */
  add('stores', 'path', {h: 112, cap: 'A store is committed to the L1d only after it retires and the core owns the line.', draw: function(sv){
    [['execute', ['address + data', 'into store queue'], 'a3b'], ['retire', ['now a senior', 'store'], 'a3b'], ['own the line', ['RFO unless', 'already M or E'], 'a4b'], ['commit', ['written to L1d,', 'line is M'], 'box on']].forEach(function(s, i){
      var x = 6 + i * 114;
      R(sv, x, 12, 106, 60, s[2]); T(sv, x + 53, 30, s[0], 'h', 'middle'); lines(sv, x + 53, 46, s[1]);
      if (i < 3) A(sv, 'M' + (x + 107) + ' 42 H' + (x + 113));
    });
    A(sv, 'M6 94 H452'); T(sv, 10, 88, 'time', 's');
  }});
  add('stores', 'ordering', {h: 188, cap: 'Each store waits in its own core\u2019s store buffer, so both loads can still read 0: the one reordering x86-TSO allows.', draw: function(sv){
    [[10, 'core 0', 'store x = 1', 'x = 1', 'load y', 'reads y = 0'], [240, 'core 1', 'store y = 1', 'y = 1', 'load x', 'reads x = 0']].forEach(function(c){
      var x = c[0];
      T(sv, x, 14, c[1], 's');
      R(sv, x, 22, 120, 28, 'a3b'); T(sv, x + 60, 41, c[2], 'm', 'middle');
      A(sv, 'M' + (x + 122) + ' 36 H' + (x + 134));
      R(sv, x + 136, 22, 74, 28, 'a1b'); T(sv, x + 173, 41, c[3], 'm', 'middle'); T(sv, x + 173, 64, 'store buffer', 's', 'middle');
      R(sv, x, 72, 120, 28, 'a3b'); T(sv, x + 60, 91, c[4], 'm', 'middle');
      A(sv, 'M' + (x + 60) + ' 146 V104', true); T(sv, x + 68, 128, c[5], 's');
    });
    R(sv, 10, 148, 440, 32, 'sunk'); T(sv, 230, 169, 'memory still holds x = 0 and y = 0', '', 'middle');
  }});

  /* ---- 17 coherence ---- */
  add('coh', 'states', {h: 178, cap: 'The five MOESI states, and what each allows the core that holds the line.', draw: function(sv){
    var X = [195, 295, 395];
    [['writes without', 'asking'], ['other copies', 'may exist'], ['writes back', 'on eviction']].forEach(function(c, i){ T(sv, X[i], 14, c[0], 's', 'middle'); T(sv, X[i], 28, c[1], 's', 'middle'); });
    [['M', 'Modified', [1, 0, 1]], ['O', 'Owned', [0, 1, 1]], ['E', 'Exclusive', [1, 0, 0]], ['S', 'Shared', [0, 1, 0]], ['I', 'Invalid', [2, 2, 2]]].forEach(function(s, r){
      var y = 38 + r * 27;
      R(sv, 10, y, 26, 22, 'a4b', 3); T(sv, 23, y + 16, s[0], 'h m', 'middle'); T(sv, 46, y + 16, s[1], '');
      s[2].forEach(function(v, i){ R(sv, X[i] - 42, y, 84, 22, v === 1 ? 'okb' : 'box', 3); T(sv, X[i], y + 16, v === 1 ? 'yes' : v === 0 ? 'no' : '\u2014', 's', 'middle'); });
    });
  }});

  /* ---- 18 prefetchers ---- */
  add('pref', 'known', {h: 126, cap: 'After two matching deltas the detector requests lines ahead. A prefetch is covered if it arrives before the demand load, late if after it, and useless if never used.', draw: function(sv){
    var cw = 54, x0 = 14, y = 64;
    ['n', 'n+1', 'n+2', 'n+3', 'n+4', 'n+5', 'n+6', 'n+7'].forEach(function(t, i){ R(sv, x0 + i * cw, y, cw - 4, 28, i < 3 ? 'a2b' : i < 5 ? 'box on' : 'box', 3); T(sv, x0 + i * cw + (cw - 4) / 2, y + 18, t, 'm s', 'middle'); });
    for (var k = 0; k < 2; k++){ var a = x0 + k * cw + 25, b = a + cw; A(sv, 'M' + a + ' ' + (y - 4) + ' C' + a + ' ' + (y - 24) + ' ' + b + ' ' + (y - 24) + ' ' + b + ' ' + (y - 6)); T(sv, (a + b) / 2, y - 26, '+1', 's m', 'middle'); }
    T(sv, 190, 30, 'two matching +1 deltas: confident', 's');
    T(sv, x0 + 1.5 * cw - 2, y + 46, 'demand loads', 's', 'middle'); T(sv, x0 + 4 * cw - 2, y + 46, 'prefetched, distance 2', 's', 'middle');
  }});

  /* ---- 19 devices ---- */
  add('dev', 'mechanisms', {h: 158, cap: 'The CPU reaches the device through uncached MMIO registers; the device reaches memory by DMA, translated by the IOMMU.', draw: function(sv){
    box(sv, 10, 16, 110, 46, 'a3b', 'CPU', 'core 0');
    box(sv, 340, 16, 110, 46, 'a4b', 'NVMe SSD', 'BAR0 registers');
    A(sv, 'M122 39 H336', true); T(sv, 229, 32, 'MMIO store: SQ1 tail doorbell', 's', 'middle'); T(sv, 229, 56, 'BAR0 + 0x1008, uncached', 's m', 'middle');
    A(sv, 'M395 64 V98'); T(sv, 403, 86, 'DMA', 's m');
    box(sv, 340, 102, 110, 44, 'a2b', 'IOMMU', 'IOVA \u2192 PA');
    box(sv, 150, 104, 120, 40, 'sunk', 'DRAM');
    A(sv, 'M338 124 H274'); T(sv, 306, 118, 'DMA', 's m', 'middle');
  }});

  /* ---- 20 end to end ---- */
  add('e2e', 'after', {h: 148, cap: 'After one hist[123]++: the new count exists only in core 0\u2019s L1d.', draw: function(sv){
    box(sv, 10, 14, 200, 48, 'a1b', 'DTLB', 'page 0x7ffd4a3c2 \u2192 0x1a3f7c');
    box(sv, 250, 14, 200, 48, 'box on', 'L1d, set 57', 'line \u20262e40: Modified, 42');
    box(sv, 250, 100, 200, 40, 'badb', 'DRAM', 'hist[123] = 41: stale');
    A(sv, 'M350 64 V96').setAttribute('stroke-dasharray', '5 4');
    T(sv, 340, 86, 'written back only on eviction', 's', 'end');
  }});
})();
