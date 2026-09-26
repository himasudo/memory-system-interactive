/* ======================= 05 cycles and latency ======================= */
App.chapter({id: 'time', group: 'Foundations', short: 'Cycles, latency', title: 'Cycles and latency',
lede: 'How time is measured inside the machine, and why some operations cost hundreds of times more than others.',
points: ['A clock cycle is the core\u2019s unit of time.', 'Latency and throughput measure different things.', 'Dependent operations add up; independent ones overlap.'],
build: function(root){
  var P = App.P, g = App.g, T = P.T, R = P.R, CFG = App.CFG;
  var a = P.sec(root, 'clock', 'The clock', 'Cycles and nanoseconds.');
  P.row(a, [
    'The core does its work in steps timed by a clock. One tick is a ' + g('cycle', 'clock cycle') + '. At 4 GHz there are 4 billion cycles per second, so one cycle lasts 0.25 ns.',
    'Work inside the core is counted in cycles. Memory delays are usually quoted in nanoseconds; multiply by the clock rate in GHz to convert. 90 ns at 4 GHz is 360 cycles.'
  ], {h: 100, cap: 'At 4 GHz each cycle lasts 0.25 ns: 8 cycles take 2 ns.', draw: function(sv){
    for (var i = 0; i < 8; i++){ R(sv, 22 + i * 52, 26, 50, 26, i % 2 ? 'box' : 'a3b', 3); T(sv, 47 + i * 52, 44, 'c' + (i + 1), 'm s', 'middle'); }
    for (var k = 0; k <= 8; k++){ P.Ln(sv, 'M' + (21 + k * 52) + ' 56 V62'); if (k % 2 === 0) T(sv, 21 + k * 52, 78, (k * 0.25).toFixed(k % 4 ? 1 : 0) + ' ns', 's m', 'middle'); }
  }});

  var b = P.sec(root, 'overlap', 'Latency and throughput', 'How long one operation takes, and how many finish per cycle.');
  P.row(b, [
    g('latency', 'Latency') + ' is how long one operation takes from start to result. ' + g('thruput', 'Throughput') + ' is how many operations finish per cycle when many are in flight.',
    'The two differ because hardware is ' + g('pipeline', 'pipelined') + ': an operation passes through several stages, and a new one can enter the first stage every cycle.',
    'An integer multiply on Zen+ has a latency of 3 cycles, yet once the pipeline is full, one multiply finishes every cycle.'
  ], {h: 150, cap: 'Three multiplies of 3 cycles each finish in 5 cycles: one per cycle after the first.', draw: function(sv){
    for (var c = 0; c < 5; c++) T(sv, 125 + c * 66, 24, 'cycle ' + (c + 1), 's', 'middle');
    ['mul A', 'mul B', 'mul C'].forEach(function(n, r){
      var y = 34 + r * 34; T(sv, 10, y + 18, n, 'm');
      for (var st = 0; st < 3; st++){ R(sv, 92 + (r + st) * 66, y, 62, 26, ['a3b', 'a4b', 'a2b'][st], 3); T(sv, 123 + (r + st) * 66, y + 18, 'stage ' + (st + 1), 's', 'middle'); }
    });
    T(sv, 92, 144, 'results at the end of cycles 3, 4 and 5', 's');
  }});

  var c = P.sec(root, 'chains', 'Dependency chains', 'Why some loops run fast and others crawl.');
  P.row(c, [
    'If an operation needs the result of the previous one, it cannot start until that result exists. A ' + g('depchain', 'chain of dependent operations') + ' takes the sum of their latencies.',
    'Independent operations overlap. A modern core looks ahead through the instruction stream and starts every operation whose inputs are ready. [[ch:core]] shows this out-of-order execution cycle by cycle.'
  ], {h: 150, cap: 'The same three 3-cycle operations, dependent and independent.', draw: function(sv){
    var cw = 46, x0 = 20;
    T(sv, x0, 16, 'dependent: 3 + 3 + 3 = 9 cycles', 's');
    ['A', 'B', 'C'].forEach(function(n, i){ R(sv, x0 + i * 3 * cw, 24, 3 * cw - 3, 24, 'a3b', 3); T(sv, x0 + i * 3 * cw + 66, 41, n, 'm', 'middle'); });
    T(sv, x0, 78, 'independent: 5 cycles', 's');
    ['A', 'B', 'C'].forEach(function(n, i){ R(sv, x0 + i * cw, 86 + i * 20, 3 * cw - 3, 16, 'a2b', 3); T(sv, x0 + i * cw + 66, 98 + i * 20, n, 'm s', 'middle'); });
    for (var k = 0; k <= 9; k++) P.Ln(sv, 'M' + (x0 + k * cw) + ' 146 V150');
  }});

  var d = P.sec(root, 'ladder', 'The cost of a memory access', 'From a few cycles to hundreds.');
  var r = P.row(d, [''], {h: 150, live: true, cap: 'Load-to-use latency by level, from the latency settings, on a linear scale.', draw: function(sv){
    var L = [['L1d', CFG.l1], ['L2', CFG.l2], ['L3', CFG.l3], ['DRAM', App.dramCycles()]], max = L[3][1];
    L.forEach(function(l, i){
      var y = 16 + i * 32, w = Math.max(3, 300 * l[1] / max);
      T(sv, 10, y + 16, l[0], 'm');
      R(sv, 60, y, w, 22, i === 3 ? 'box on' : 'a2b', 3);
      T(sv, 60 + w + 8, y + 16, Math.round(l[1]) + ' cycles \u00b7 ' + (l[1] / CFG.ghz).toFixed(1) + ' ns', 's m', w > 240 ? 'end' : 'start').setAttribute('x', w > 240 ? 60 + w - 8 : 60 + w + 8);
    });
  }});
  function ladderText(){
    r._text.innerHTML = '<p>A load is fast only when its data is close to the core. With the current latency settings, a load that finds its data in the L1 cache takes ' + CFG.l1 + ' cycles; one that has to go to DRAM takes about ' + Math.round(App.dramCycles()) + '.</p>' +
      '<p>That gap drives most of the hardware in the later chapters. [[ch:whycache]] explains why caches work, and [[ch:hier]] follows a miss level by level.</p>';
  }
  ladderText(); App.onCfg(ladderText);
}});

/* ======================= 06 why caches exist ======================= */
App.chapter({id: 'whycache', group: 'Foundations', short: 'Why caches', title: 'Why caches exist',
lede: 'DRAM is far too slow to feed the core directly. Caches keep the data a program is using close to the core.',
points: ['Programs reuse data, and use data next to data they just used.', 'Caches move memory in 64-byte lines.', 'Several cache levels trade size for speed.'],
build: function(root){
  var P = App.P, g = App.g, T = P.T, R = P.R, A = P.A, CFG = App.CFG;
  var a = P.sec(root, 'gap', 'The gap', 'Why DRAM cannot keep up.');
  P.row(a, [
    'DRAM stores each bit as a tiny charge in a capacitor. That makes it dense and cheap, but slow to read: tens of nanoseconds, hundreds of core cycles.',
    'Caches are built from ' + g('sram', 'SRAM') + ', which is fast but uses about six transistors per bit instead of one, so each byte costs far more chip area. A processor can afford a few megabytes of SRAM, not gigabytes.',
    'The growing gap between core speed and DRAM speed is known as the ' + g('memwall', 'memory wall') + '.'
  ], {h: 140, cap: 'One bit of DRAM next to one bit of SRAM.', draw: function(sv){
    R(sv, 10, 10, 200, 120, 'sunk'); T(sv, 22, 30, 'DRAM cell', 'h');
    R(sv, 40, 56, 44, 30, 'box', 3); T(sv, 62, 76, 'T', 'm', 'middle');
    P.Ln(sv, 'M84 71 H126'); P.Ln(sv, 'M128 54 V88', 'wire on'); P.Ln(sv, 'M140 54 V88', 'wire on'); P.Ln(sv, 'M140 71 H170');
    T(sv, 22, 110, '1 transistor + 1 capacitor', 's'); T(sv, 22, 124, 'dense, slow to read', 's');
    R(sv, 250, 10, 200, 120, 'sunk'); T(sv, 262, 30, 'SRAM cell', 'h');
    for (var i = 0; i < 6; i++){ R(sv, 268 + (i % 3) * 58, 44 + Math.floor(i / 3) * 30, 44, 24, 'a2b', 3); T(sv, 290 + (i % 3) * 58, 60 + Math.floor(i / 3) * 30, 'T', 'm', 'middle'); }
    T(sv, 262, 110, '6 transistors', 's'); T(sv, 262, 124, 'fast, but much larger', 's');
  }});

  var b = P.sec(root, 'locality', 'Locality', 'The patterns that make caching work.');
  P.row(b, [
    'Caching works because programs are predictable in two ways:',
    P.ul(['<b>' + g('tloc', 'Temporal locality') + '.</b> Data used now is likely to be used again soon. <code>hist[123]</code> is incremented every time the byte 123 appears.',
      '<b>' + g('sloc', 'Spatial locality') + '.</b> Data next to recently used data is likely to be used soon. <code>data[]</code> is read one byte after the next.'])
  ], {h: 160, cap: 'data[] is read in order; hist[123] is used again and again.', draw: function(sv){
    A(sv, 'M22 18 H372', true); T(sv, 380, 22, 'in order', 's');
    P.cells(sv, 20, 28, 44, 28, [123, 123, 7, 46, 200, 123, '\u2026', '\u2026'], {hot: [0, 1, 5]});
    ['hist[7]', 'hist[46]', 'hist[123]', 'hist[200]'].forEach(function(t, i){ R(sv, 20 + i * 108, 108, 100, 28, i === 2 ? 'box on' : 'box', 3); T(sv, 70 + i * 108, 127, t, 'm', 'middle'); });
    [42, 86, 262].forEach(function(x){ A(sv, 'M' + x + ' 58 C' + x + ' 84 286 80 286 104', true); });
    T(sv, 286, 154, 'reused: temporal locality', 's', 'middle'); T(sv, 20, 76, 'neighbours: spatial locality', 's');
  }});

  var c = P.sec(root, 'lines', 'Cache lines, hits and misses', 'The unit a cache works in.');
  P.row(c, [
    'A cache never holds single bytes. It holds copies of 64-byte blocks of memory, called ' + g('line', 'cache lines') + ', each starting at an address that is a multiple of 64.',
    'When the core loads an address, the cache checks whether it holds that line. If it does, that is a ' + g('hit') + ' and the data returns in a few cycles. If not, it is a ' + g('miss') + ': the whole line is fetched from the next level while the load waits.',
    'Because the whole line arrives, the next 63 bytes come with it. Reading <code>data[]</code> in order costs one miss per 64 bytes, not one per byte.'
  ], {h: 172, live: true, cap: 'A load checks the L1d; a miss brings in the whole 64-byte line.', draw: function(sv){
    P.box(sv, 10, 56, 70, 44, 'a3b', 'core');
    A(sv, 'M82 78 H124'); T(sv, 103, 70, 'load', 's', 'middle');
    P.box(sv, 128, 46, 130, 64, 'a2b', 'L1d', 'has line \u2026e40?');
    A(sv, 'M260 62 H300', true); T(sv, 306, 58, 'hit: data back', 's'); T(sv, 306, 72, 'in ' + CFG.l1 + ' cycles', 's');
    A(sv, 'M240 112 C240 136 280 142 318 142'); T(sv, 250, 158, 'miss', 's');
    P.box(sv, 322, 120, 128, 44, 'box', 'next level', 'sends 64 bytes');
    A(sv, 'M322 128 C290 108 250 118 224 112'); T(sv, 282, 104, 'fill', 's', 'middle');
  }});

  var d = P.sec(root, 'levels', 'Levels', 'Small and fast near the core, large and slower further out.');
  P.row(d, [
    'One cache cannot be both large and fast: a larger array has longer wires and more entries to search. So processors stack several levels.',
    'Each Zen+ core has a 32 KB L1 data cache and a 512 KB L2. The four cores share a 4 MB L3. A load checks the L1 first, then the L2, then the L3, and only then DRAM.',
    '[[ch:l1d]] opens the L1d; [[ch:hier]] follows a miss through the other levels.'
  ], {h: 120, live: true, cap: 'Size and load-to-use latency of each level, from the latency settings.', draw: function(sv){
    var L = [['L1d', '32 KB', CFG.l1], ['L2', '512 KB', CFG.l2], ['L3', '4 MB', CFG.l3], ['DRAM', 'GBs', App.dramCycles()]], x = 10;
    P.box(sv, x, 30, 50, 50, 'a3b', 'core'); x += 62;
    L.forEach(function(l, i){
      P.Ln(sv, 'M' + (x - 12) + ' 55 H' + x);
      P.box(sv, x, 30, 84, 50, i === 3 ? 'sunk' : 'a2b', l[0], l[1]);
      T(sv, x + 42, 100, Math.round(l[2]) + ' cycles', 's m', 'middle');
      x += 96;
    });
  }});
}});

/* ======================= 07 virtual memory ======================= */
App.chapter({id: 'vm', group: 'Foundations', short: 'Virtual memory', title: 'Virtual memory',
lede: 'The addresses a program uses are not the addresses the memory chips see.',
points: ['Each process has its own virtual address space.', 'Memory is mapped in 4 KB pages through page tables.', 'The TLB caches recent translations.'],
build: function(root){
  var P = App.P, g = App.g, T = P.T, R = P.R, A = P.A;
  var a = P.sec(root, 'spaces', 'Two kinds of address', 'Virtual addresses for programs, physical addresses for the hardware.');
  P.row(a, [
    'Every running program, a ' + g('proc', 'process') + ', sees its own private address space. The address 0x7ffd4a3c2e58 means one thing in this process and something else, or nothing, in another.',
    'These are ' + g('va', 'virtual addresses') + '. The memory chips are reached with ' + g('pa', 'physical addresses') + '. The hardware translates every virtual address into a physical one, on every access.'
  ], {h: 180, cap: 'Two processes can use the same virtual address for different memory.', draw: function(sv){
    [['process A', 20], ['process B', 150]].forEach(function(p, k){
      T(sv, p[1] + 50, 18, p[0], 's', 'middle'); R(sv, p[1], 26, 100, 118, 'sunk');
      for (var i = 0; i < 3; i++) { R(sv, p[1] + 10, 34 + i * 36, 80, 28, i === 0 ? (k ? 'a1b' : 'box on') : 'box', 3); T(sv, p[1] + 50, 52 + i * 36, 'page ' + (i + 1), 's', 'middle'); }
    });
    T(sv, 380, 18, 'physical memory', 's', 'middle'); R(sv, 320, 26, 120, 138, 'sunk');
    for (var f = 0; f < 4; f++){ R(sv, 330, 34 + f * 32, 100, 26, f === 2 ? 'box on' : f === 0 ? 'a1b' : 'box', 3); T(sv, 380, 51 + f * 32, 'frame ' + f, 's', 'middle'); }
    A(sv, 'M110 48 C200 48 240 110 326 110', true); A(sv, 'M240 48 C280 48 290 47 326 47');
    T(sv, 135, 172, 'page 1 has the same virtual address in both', 's', 'middle');
  }});

  var b = P.sec(root, 'pages', 'Pages', 'Translation works in 4 KB blocks.');
  P.row(b, [
    'Translating each byte separately would need an entry per byte. Instead memory is mapped in ' + g('page', 'pages') + ' of 4 KB. All 4096 bytes of a page move together, so the low 12 bits of an address, the offset within the page, are the same in the virtual and the physical address.',
    'Only the page number changes. For <code>hist[123]</code>, virtual page 0x7ffd4a3c2 maps to physical frame 0x1a3f7c, so the virtual address 0x7ffd4a3c2e58 becomes the physical address 0x1a3f7ce58.'
  ], {h: 150, cap: 'Translation replaces the page number and keeps the 12-bit offset.', draw: function(sv){
    T(sv, 20, 22, 'virtual address', 's');
    R(sv, 20, 30, 250, 36, 'a1b'); T(sv, 145, 53, 'page 0x7ffd4a3c2', 'm', 'middle');
    R(sv, 272, 30, 110, 36, 'a3b'); T(sv, 327, 53, 'offset 0xe58', 'm', 'middle');
    A(sv, 'M145 68 V100', true); T(sv, 154, 88, 'translated', 's');
    A(sv, 'M327 68 V100'); T(sv, 336, 88, 'copied', 's');
    R(sv, 20, 104, 250, 36, 'a1b'); T(sv, 145, 127, 'frame 0x1a3f7c', 'm', 'middle');
    R(sv, 272, 104, 110, 36, 'a3b'); T(sv, 327, 127, 'offset 0xe58', 'm', 'middle');
    T(sv, 392, 127, 'physical', 's');
  }});

  var c = P.sec(root, 'tables', 'Page tables', 'Where the mappings are stored.');
  P.row(c, [
    'The operating system keeps the mappings in page tables: data structures in ordinary memory. On x86-64 they form a ' + g('pml4', '4-level tree') + '. Each level uses 9 bits of the virtual page number to pick one of 512 entries.',
    'A full translation therefore reads four entries from memory. The hardware ' + g('walk', 'page walker') + ' does this automatically; [[ch:xlate]] steps through all four reads.'
  ], {h: 150, cap: 'Four 9-bit indexes pick one entry per level; the last entry names the physical frame.', draw: function(sv){
    var F = [['47:39', 'level 1'], ['38:30', 'level 2'], ['29:21', 'level 3'], ['20:12', 'level 4'], ['11:0', 'offset']];
    F.forEach(function(f, i){
      var x = 16 + i * 86;
      T(sv, x + 40, 18, 'bits ' + f[0], 's m', 'middle');
      R(sv, x, 26, 80, 30, i < 4 ? 'a1b' : 'a3b', 3); T(sv, x + 40, 46, i < 4 ? '9 bits' : '12 bits', 'm', 'middle');
      if (i < 4){ A(sv, 'M' + (x + 40) + ' 58 V88'); R(sv, x + 10, 92, 60, 30, 'box', 3); T(sv, x + 40, 111, f[1], 's', 'middle'); }
      if (i > 0 && i < 4) A(sv, 'M' + (x - 16) + ' 107 H' + (x + 6));
    });
    A(sv, 'M334 107 H364', true); R(sv, 368, 92, 80, 30, 'box on', 3); T(sv, 408, 111, 'frame', 's', 'middle');
    T(sv, 16, 144, 'each table: 512 entries of 8 bytes = one 4 KB page', 's');
  }});

  var d = P.sec(root, 'tlb', 'The TLB', 'A cache for translations.');
  P.row(d, [
    'Four extra memory reads per access would be far too slow, so the core keeps recent translations in a ' + g('tlb', 'translation lookaside buffer') + ' (TLB).',
    'A TLB hit returns the physical page at once. A miss starts a page walk. If the walk finds no valid mapping, the hardware raises a ' + g('pf', 'page fault') + ' and the operating system takes over: it may allocate a page, read it from disk, or stop the program.'
  ], {h: 170, cap: 'Most translations hit in the TLB; a miss walks the page tables.', draw: function(sv){
    P.box(sv, 10, 40, 70, 44, 'a1b', 'virtual');
    A(sv, 'M82 62 H116'); P.box(sv, 120, 34, 110, 56, 'a4b', 'TLB');
    A(sv, 'M232 50 H326', true); T(sv, 250, 44, 'hit', 's');
    P.box(sv, 330, 30, 120, 40, 'okb', 'physical');
    A(sv, 'M175 92 V116'); T(sv, 184, 108, 'miss', 's');
    P.box(sv, 120, 120, 110, 40, 'box', 'page walk');
    A(sv, 'M232 128 C280 128 300 80 326 62'); T(sv, 290, 104, 'found', 's');
    A(sv, 'M232 150 H326'); P.box(sv, 330, 130, 120, 40, 'badb', 'page fault', 'the OS takes over');
  }});
}});

/* ======================= 08 cores, sharing and devices ======================= */
App.chapter({id: 'share', group: 'Foundations', short: 'Cores, devices', title: 'Cores, sharing and devices',
lede: 'A processor is not one core talking to memory. Several cores and devices use the same memory at the same time.',
points: ['Each core has private caches that hold copies of shared data.', 'Hardware keeps those copies consistent: coherence.', 'Devices read and write memory directly: DMA.'],
build: function(root){
  var P = App.P, g = App.g, T = P.T, R = P.R, A = P.A;
  var a = P.sec(root, 'cores', 'Several cores, one memory', 'Private caches, shared data.');
  P.row(a, [
    'The Ryzen 7 3750H has four cores. Each runs its own instruction stream and has its own L1 and L2 caches, yet all four read and write the same memory.',
    'Each core can also run two threads at once (' + g('smt', 'simultaneous multithreading') + '), so the operating system sees eight logical CPUs.'
  ], {h: 176, cap: 'Four cores with private caches share one L3 and one memory.', draw: function(sv){
    for (var i = 0; i < 4; i++){
      var x = 14 + i * 110; R(sv, x, 12, 100, 70, 'a3b'); T(sv, x + 50, 32, 'core ' + i, 'h', 'middle');
      R(sv, x + 10, 42, 80, 30, 'a2b', 3); T(sv, x + 50, 62, 'L1 + L2', 's', 'middle');
      P.Ln(sv, 'M' + (x + 50) + ' 82 V104');
    }
    P.box(sv, 14, 104, 430, 30, 'a2b', 'L3: 4 MB, shared');
    P.Ln(sv, 'M229 134 V144'); P.box(sv, 14, 144, 430, 28, 'sunk', 'DRAM: one memory for all cores');
  }});

  var b = P.sec(root, 'copies', 'Keeping copies consistent', 'What happens when two cores cache the same line.');
  P.row(b, [
    'If two cores cache the same line and one of them writes it, the other core\u2019s copy is now stale. ' + g('coh', 'Cache coherence') + ' is the hardware that stops anyone from reading stale data.',
    'Before a core writes a line, it must hold the only valid copy: the other copies are invalidated first. A later read by another core then fetches the new data. [[ch:coh]] follows these messages one by one.'
  ], {h: 160, cap: 'A write first invalidates other copies; a later read sees the new value.', draw: function(sv){
    R(sv, 10, 30, 180, 54, 'box on'); T(sv, 22, 50, 'core 0 L1', 's'); T(sv, 22, 72, 'line X: 41 \u2192 42', 'm');
    R(sv, 270, 30, 180, 54, 'badb'); T(sv, 282, 50, 'core 1 L1', 's'); T(sv, 282, 72, 'line X: invalid', 'm');
    A(sv, 'M192 57 H266', true); T(sv, 229, 24, '1. invalidate', 's', 'middle');
    A(sv, 'M360 86 V112'); T(sv, 368, 104, '2. read again', 's');
    R(sv, 270, 114, 180, 38, 'okb'); T(sv, 282, 138, 'gets X = 42', 'm');
  }});

  var c = P.sec(root, 'order', 'When a store becomes visible', 'Why the order of stores matters.');
  P.row(c, [
    'A store does not reach memory the moment it executes. It waits in the core\u2019s ' + g('sq', 'store queue') + ', enters the L1 cache after its instruction retires, and only then can other cores see it.',
    'For a single core this is invisible. Between cores it matters: code that writes data and then sets a flag depends on other cores seeing the two stores in that order. [[ch:stores]] shows the rules x86 guarantees.'
  ], {h: 110, cap: 'A store becomes visible to other cores only once it reaches the L1d.', draw: function(sv){
    P.box(sv, 10, 26, 86, 50, 'a3b', 'execute');
    A(sv, 'M98 51 H116'); P.box(sv, 120, 26, 110, 50, 'a1b', 'store queue', 'private, waits');
    A(sv, 'M232 51 H250'); P.box(sv, 254, 26, 70, 50, 'a2b', 'L1d');
    A(sv, 'M326 51 H344', true); P.box(sv, 348, 26, 102, 50, 'okb', 'other cores', 'can see it');
    A(sv, 'M10 98 H450'); T(sv, 12, 92, 'time', 's');
  }});

  var d = P.sec(root, 'devices', 'Devices and DMA', 'How an SSD moves data without the CPU copying bytes.');
  P.row(d, [
    'The CPU talks to a device by writing to the device\u2019s registers, which appear at special physical addresses: ' + g('mmio', 'memory-mapped I/O') + '.',
    'The device moves the data itself. With ' + g('dma', 'direct memory access') + ', an NVMe SSD writes a 4 KB block straight into memory, then raises an ' + g('interrupt') + ' to report that it is done. [[ch:dev]] traces one such read from start to finish.'
  ], {h: 170, cap: 'The CPU starts the transfer with an MMIO write; the SSD moves the data by DMA and reports with an interrupt.', draw: function(sv){
    P.box(sv, 10, 34, 110, 50, 'a3b', 'CPU');
    P.box(sv, 340, 34, 110, 50, 'a4b', 'NVMe SSD');
    P.box(sv, 175, 116, 110, 44, 'sunk', 'DRAM');
    A(sv, 'M122 48 H336', true); T(sv, 229, 40, '1. MMIO write: doorbell', 's', 'middle');
    A(sv, 'M395 86 C395 130 330 138 289 138'); T(sv, 352, 124, '2. DMA: 4 KB', 's');
    A(sv, 'M338 72 H124'); T(sv, 229, 86, '3. interrupt: done', 's', 'middle');
  }});
}});
