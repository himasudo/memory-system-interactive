/* ======================= chapter: the machine ======================= */
App.chapter({id: 'map', num: '00', short: 'The machine', title: 'The machine, all of it',
sub: 'Every structure a memory access can touch on your laptop, from the load/store unit to the DRAM chips and the SSD. Tap any block for what it is, its size, and the chapter that takes it apart.',
build: function(root){
  var h = App.h, s = App.s, g = App.g;
  var work = h('div', {'class': 'map-workbench'}, root);
  var wrap = h('div', {'class': 'scroller map-canvas'}, work);
  var sv = s('svg', {viewBox: '0 0 1200 760', style: 'min-width:880px'}, wrap);
  var info = h('aside', {'class': 'card map-inspector'}, work);
  var parts = {}, selId = null;
  var D = {
    core0: ['Core 0 (and cores 1\u20133)', 'An out-of-order Zen+ core with 2 SMT threads. Front end: branch predictor, 64 KB L1i, op cache, 4-wide decode. Back end: 192-entry retire queue, 168 physical registers, 4 ALUs + 2 AGUs, 44-entry load and store queues.', 'core', 'Chapter 02 runs the histogram loop through it cycle by cycle.'],
    fe: ['Front end', 'Branch predictor + BTB, L1i (64 KB, 4-way) with iTLB, predecode, 4 decoders, 2K-entry op cache, \u00b5op queue.', 'code', 'Chapter 01 shows what it decodes; Chapter 02 shows it running.'],
    ooo: ['Rename + out-of-order engine', 'RAT and free list, 168-entry PRF, 192-entry ROB, six 14-entry schedulers, 4 ALU and 2 AGU ports.', 'core', ''],
    lsu: ['Load/store unit + L1d', '44-entry load queue, 44-entry store queue, 64-entry L1 DTLB, 1536-entry L2 TLB, 2 page walkers, 32 KB 8-way L1d. 2 loads + 1 store per cycle, 16 bytes each.', 'l1d', 'Chapter 03 covers translation, Chapter 04 the L1d lookup, Chapter 07 the store path.'],
    tlb: ['TLBs + page walkers', 'L1 DTLB: 64 entries, fully associative, all page sizes. L2 TLB: 1536 entries, no 1 GB pages. Two hardware walkers read page tables through the data caches.', 'xlate', ''],
    l2: ['L2 cache (per core)', '512 KB, 8-way, write-back, inclusive of the L1s. 32 bytes/cycle to L1. \u226512 cycles load-to-use (published). Up to 50 outstanding misses to L3 per core.', 'hier', ''],
    l3: ['L3 cache (shared by the CCX)', '4 MB, 16-way on your APU. A victim cache: filled with lines evicted from the L2s, mostly exclusive of them. Holds shadow tags of every L2 so it acts as a probe filter. ~35 cycles average (published Zen/Zen+).', 'hier', 'Chapter 05 follows a miss through it; Chapter 08 uses its shadow tags for coherence.'],
    df: ['Infinity Fabric (data fabric)', 'The on-die interconnect joining the CCX, the memory controllers, the GPU and the I/O hub. Routes requests and coherence probes; up to 96 outstanding misses from L3 to memory (published Zen/Zen+).', 'hier', ''],
    umc: ['Memory controllers (UMC \u00d72)', 'One per channel. Queue requests, map physical addresses to channel/bank/row/column, reorder to hit open rows, issue ACT/RD/WR/PRE/REF, enforce DRAM timings.', 'dram', 'Chapter 06.'],
    dram: ['DDR4 DRAM, 2 channels', 'Each channel is a 64-bit data bus plus a command/address bus. One read burst = 8 beats \u00d7 8 bytes = 64 bytes, one cache line. Cells are capacitors that must be refreshed.', 'dram', ''],
    gpu: ['Integrated GPU (Vega)', 'Another client of the same fabric and the same DRAM. It competes with the cores for memory bandwidth.', 'hier', ''],
    io: ['I/O hub: PCIe root complex + IOMMU', 'Turns device PCIe packets into memory requests and core MMIO accesses into PCIe packets. The IOMMU translates device addresses and blocks DMA outside what the OS mapped. Device DMA is snooped against CPU caches.', 'dev', 'Chapter 10 walks an NVMe read through it.'],
    nvme: ['NVMe SSD', 'Talks to the CPU through submission/completion rings in RAM, doorbell registers (MMIO), DMA, and MSI-X interrupts.', 'dev', ''],
    nic: ['Wi-Fi / Ethernet', 'Same pattern as NVMe: descriptor rings in RAM, doorbells, DMA, interrupts.', 'dev', '']
  };
  function blk(id, x, y, w, ht, title, lines, cls){
    var gr = s('g', {'class': 'click'}, sv);
    s('rect', {x: x, y: y, width: w, height: ht, rx: 8, 'class': 'box' + (cls ? ' ' + cls : '')}, gr);
    s('text', {x: x + 10, y: y + 18, 'class': 'h'}, gr, title);
    (lines || []).forEach(function(l, i){ s('text', {x: x + 10, y: y + 36 + i * 15, 'class': i === lines.length - 1 && lines.length > 1 ? 's' : ''}, gr, l); });
    gr.onclick = function(e){ e.stopPropagation(); pick(id); };
    parts[id] = gr; return gr;
  }
  function lbl(x, y, t, cls, anc){ return s('text', {x: x, y: y, 'class': cls || 's', 'text-anchor': anc || 'start'}, sv, t); }
  function busL(d, width){ var p = s('path', {d: d, 'class': 'bus'}, sv); return p; }
  /* package */
  s('rect', {x: 10, y: 10, width: 1180, height: 560, rx: 14, 'class': 'sunk'}, sv);
  lbl(24, 32, 'Ryzen 7 3750H package \u2014 "Picasso" APU, one die', 'h');
  /* CCX */
  s('rect', {x: 24, y: 44, width: 760, height: 380, rx: 12, fill: 'none', stroke: 'var(--bd2)', 'stroke-dasharray': '5 4'}, sv);
  lbl(36, 62, 'CCX (core complex): 4 cores share the L3', 's');
  /* core 0 detailed */
  s('rect', {x: 36, y: 72, width: 420, height: 206, rx: 10, fill: 'none', stroke: 'var(--bd2)'}, sv);
  blk('core0', 44, 80, 404, 26, 'Core 0 \u00b7 2 SMT threads', []);
  blk('fe', 44, 112, 196, 70, 'Front end', ['BP/BTB \u00b7 L1i 64 KB 4-way', 'op cache \u00b7 decode \u00d74'], 'a3b');
  blk('ooo', 250, 112, 198, 70, 'Out-of-order engine', ['ROB 192 \u00b7 PRF 168', 'sched 6\u00d714 \u00b7 4 ALU + 2 AGU'], 'a3b');
  blk('lsu', 44, 188, 250, 82, 'Load/store unit + L1d', ['LQ 44 \u00b7 SQ 44', 'L1d 32 KB 8-way', '2 loads + 1 store / cycle'], 'a4b');
  blk('tlb', 302, 188, 146, 82, 'TLBs + walkers', ['L1 DTLB 64', 'L2 TLB 1536', '2 walkers'], 'a4b');
  blk('l2', 44, 300, 404, 50, 'L2 \u00b7 512 KB \u00b7 8-way \u00b7 inclusive of L1', ['private to this core'], 'a2b');
  busL('M 170 270 L 170 300'); lbl(176, 290, '32 B/cycle');
  /* cores 1-3 */
  [1, 2, 3].forEach(function(n, k){
    var x = 472 + k * 102;
    s('rect', {x: x, y: 72, width: 94, height: 206, rx: 10, fill: 'none', stroke: 'var(--bd2)'}, sv);
    var gr = blk('c' + n, x + 6, 80, 82, 190, 'Core ' + n, ['same as', 'core 0']);
    gr.onclick = function(e){ e.stopPropagation(); pick('core0'); };
    s('rect', {x: x + 6, y: 300, width: 82, height: 50, rx: 8, 'class': 'box a2b'}, sv);
    lbl(x + 14, 318, 'L2 512 KB', 's');
    busL('M ' + (x + 47) + ' 270 L ' + (x + 47) + ' 300');
  });
  blk('l3', 44, 366, 728, 50, 'L3 \u00b7 4 MB \u00b7 16-way \u00b7 victim cache \u00b7 shadow tags of all four L2s', ['shared by cores 0\u20133; filled by L2 evictions'], 'a2b');
  [170, 519, 621, 723].forEach(function(x){ busL('M ' + x + ' 350 L ' + x + ' 366'); });
  lbl(176, 362, '32 B/cycle');
  /* PCIe links: I/O hub straight down to the devices (drawn first, so they pass under the fabric) */
  busL('M 890 280 L 890 600'); busL('M 1086 280 L 1086 600');
  /* fabric */
  blk('df', 24, 440, 1152, 36, 'Infinity Fabric \u2014 data fabric (coherent interconnect)', [], 'a3b');
  busL('M 400 416 L 400 440');
  blk('gpu', 800, 44, 376, 110, 'Integrated GPU (Vega)', ['shares DRAM and fabric bandwidth', 'with the CPU cores']);
  busL('M 800 130 L 792 130 L 792 440');
  blk('io', 800, 170, 376, 110, 'I/O hub', ['PCIe root complex \u00b7 IOMMU + IOTLB', 'turns MMIO into PCIe packets and', 'device DMA into memory requests']);
  busL('M 1000 280 L 1000 440');
  blk('umc', 24, 490, 560, 64, 'Memory controllers: UMC 0 \u00b7 UMC 1', ['address mapping \u00b7 request queues \u00b7 DRAM command scheduling \u00b7 refresh']);
  busL('M 300 476 L 300 490');
  /* off-package */
  blk('dram', 24, 600, 560, 140, 'DDR4 \u2014 channel A and channel B', ['each: 64-bit data bus + command/address bus', 'DIMM \u2192 rank \u2192 8 chips \u2192 16 banks each \u2192 rows \u00d7 columns', 'one 64-byte line = 8 beats of 8 bytes (burst length 8)', 'DDR4-2400: 2400 MT/s \u00d7 8 B = 19.2 GB/s per channel (peak)']);
  busL('M 160 554 L 160 600'); busL('M 450 554 L 450 600'); lbl(166, 584, 'channel A, 64 bits'); lbl(456, 584, 'channel B, 64 bits');
  blk('nvme', 800, 600, 180, 140, 'NVMe SSD', ['queues in host RAM', 'doorbells via MMIO', 'DMA + MSI-X']);
  blk('nic', 996, 600, 180, 140, 'Wi-Fi / NIC', ['descriptor rings', 'DMA + interrupts']);
  lbl(896, 530, 'PCIe links from the I/O hub');
  lbl(896, 545, '(packets called TLPs); they do');
  lbl(896, 560, 'not pass through the fabric');
  lbl(600, 520, 'off-package from here down \u2193', 's');
  sv.onclick = function(){ pick(null); };

  function pick(id){
    selId = id;
    for (var k in parts) parts[k].setAttribute('class', 'click' + (k === id ? ' on' : ''));
    if (!id){ info.innerHTML = '<div class="inspector-kicker">hardware atlas</div><h3>Select a block</h3><p>Inspect any structure to see what it does, its published size, and the chapter that takes it apart. The diagram itself is the table of contents.</p><p class="note">Wire labels are published peak transfer sizes, not measured throughput.</p>'; return; }
    var d = D[id];
    info.innerHTML = '<h3>' + d[0] + '</h3><p>' + d[1] + '</p>' + (d[3] ? '<p>' + d[3] + '</p>' : '') + '<button class="pri" data-go="' + d[2] + '">open the chapter \u2192</button>';
    info.querySelector('button').onclick = function(){ App.go(d[2]); };
  }
  pick(null);

  var path = h('div', {'class': 'card route-index'}, root);
  path.innerHTML = '<h3>The route this site follows</h3><ol class="route">' +
    '<li><b>01</b> C \u2192 assembly \u2192 bytes \u2192 \u00b5ops for <code>hist[data[i]]++</code>.</li>' +
    '<li><b>02</b> Those \u00b5ops through fetch, decode, ' + g('rename') + ', the ' + g('rob') + ', ' + g('sched', 'schedulers') + ', ports, the ' + g('lq', 'load') + ' and ' + g('sq', 'store') + ' queues, retirement and store commit.</li>' +
    '<li><b>03</b> The virtual address of <code>hist[123]</code> through the ' + g('dtlb') + ', the L2 TLB, a 4-level ' + g('walk') + ', and a ' + g('pf') + '.</li>' +
    '<li><b>04</b> The physical address through the L1d: set, tag compare, way select, ' + g('plru') + ', eviction and ' + g('wbk') + '.</li>' +
    '<li><b>05</b> A miss through L2, the L3 ' + g('victimc') + ', the fabric and back, and how misses overlap.</li>' +
    '<li><b>06</b> DRAM: banks, rows, the ' + g('rowbuf') + ', commands and timings.</li>' +
    '<li><b>07</b> The store path: store buffer, ' + g('rfo') + ', ' + g('wc') + ', ' + g('memtype', 'memory types') + ', fences.</li>' +
    '<li><b>08</b> Four cores sharing lines: ' + g('moesi') + ', probes, ' + g('fshare') + '.</li>' +
    '<li><b>09</b> ' + g('pref', 'Prefetchers') + ' guessing the next line.</li>' +
    '<li><b>10</b> Devices: ' + g('mmio') + ', ' + g('dma') + ', the ' + g('iommu') + ', interrupts \u2014 an NVMe read end to end.</li>' +
    '<li><b>11</b> One <code>hist[123]++</code> with every stage on a single timeline.</li>' +
    '<li><b>12</b> Glossary: every term, searchable.</li></ol>' +
    '<p class="note">Dotted terms open a definition. The <b>latency model</b> in the sidebar starts with published figures and can be replaced with your own measurements.</p>';
}});
