/* ======================= chapter: the machine ======================= */
App.chapter({id: 'map', short: 'The machine', title: 'The machine, all of it',
lede: 'Every structure a memory access can touch, from the core’s load/store unit out to the DRAM chips and the SSD.',
points: ['Click a block to see what it does and which chapter takes it apart.', 'The sizes are the lab’s example machine, a small four-core design the simulations use. It is not any one product.', 'The second half of the chapter shows how AMD, Intel and Arm build the same parts today.'],
build: function(root){
  var h = App.h, s = App.s, g = App.g, HW = App.HW;
  var work = h('div', {'class': 'map-workbench'}, root);
  var wrap = h('div', {'class': 'scroller map-canvas'}, work);
  var sv = s('svg', {role: 'img', 'aria-label': 'The lab’s example machine: four cores, caches, interconnect, memory controllers, DRAM and devices', viewBox: '0 0 1200 760', style: 'min-width:880px'}, wrap);
  var info = h('aside', {'class': 'card map-inspector'}, work);
  var parts = {}, selId = null;
  var D = {
    core0: ['Core 0 (and cores 1–3)', 'An out-of-order core. The model keeps 24 instructions in flight in its ROB, with 48 physical registers, 10 load-queue and 8 store-queue entries and 4 miss buffers: small enough to watch every entry. Real cores are far bigger: AMD Zen 5’s ROB holds 448 instructions. Many x86 cores also run two hardware threads (SMT); Arm’s Neoverse V3 runs one.', 'core', '[[ch:core]] runs the histogram loop through it cycle by cycle.'],
    fe: ['Front end', 'Predicts the path, fetches instruction bytes from the L1i, finds where each instruction starts and decodes it into µops. The model fetches and decodes up to four instructions per cycle. Most x86 cores also keep recently decoded µops in an op cache, so a hot loop skips fetch and decode.', 'code', '[[ch:code]] shows what it decodes; [[ch:core]] shows it running.'],
    ooo: ['Rename + out-of-order engine', 'Renames registers (RAT and free list), keeps instructions in program order in the ROB, and sends each µop to an execution port once its inputs are ready. The model has 48 physical registers, a 24-entry ROB, 16- and 12-entry schedulers, four ALUs and two address units.', 'core', ''],
    lsu: ['Load/store unit + L1d', 'A load queue (10 entries in the model), a store queue (8) and 4 miss buffers in front of a 32 KiB, 8-way L1d with 64-byte lines. A load that matches an older queued store takes the data straight from the store queue (forwarding). Current L1d caches are 48 KiB (AMD Zen 5, Intel Redwood Cove) or 64 KiB (Arm Neoverse V3).', 'l1d', '[[ch:xlate]] covers translation, [[ch:l1d]] the L1d lookup, [[ch:stores]] the store path.'],
    tlb: ['TLBs + page walker', 'Cache recent virtual-to-physical translations. On a miss, a hardware page walker reads the page tables through the data caches. The model has a 64-entry L1 DTLB and a 512-entry L2 TLB and uses x86-64 four-level page tables with 4 KiB pages. Real L2 TLBs hold a few thousand entries.', 'xlate', ''],
    l2: ['L2 cache (one per core)', '512 KiB, 8-way, write-back and inclusive of the L1d in the model, sending 32 bytes per cycle to the L1. Current cores have 1 MiB (AMD Zen 5), 2 MiB (Intel Redwood Cove) or 2–3 MiB (Arm Neoverse V3).', 'hier', ''],
    l3: ['L3 cache (shared by the four cores)', '4 MiB, 16-way in the model. It is a victim cache: a line enters it when an L2 evicts it, so the L3 holds mostly different lines from the L2s. It also keeps a copy of every L2’s tags (shadow tags), so it knows which core to ask for a line. AMD Zen 5’s L3 is also filled from L2 evictions, 32 MiB per 8 cores; Intel’s Xeon L3 is non-inclusive and split into slices across a mesh.', 'hier', '[[ch:hier]] follows a miss through it; [[ch:coh]] uses its shadow tags for coherence.'],
    df: ['Coherent interconnect', 'Carries requests, data and coherence probes between the caches, the memory controllers, the GPU and the I/O hub. AMD calls its version Infinity Fabric; Intel’s Xeons use a mesh; Arm licenses its CMN mesh to chip makers.', 'hier', ''],
    umc: ['Memory controllers', 'One per channel. Each maps physical addresses to channel, bank, row and column, queues requests, reorders them to hit open rows, and issues ACT/RD/WR/PRE/REF commands within the DRAM timing rules. Servers have many: AMD EPYC 9005 and Intel Xeon 6900P each drive 12 DDR5 channels per socket.', 'dram', '[[ch:dram]] takes one apart.'],
    dram: ['DDR4 DRAM, two channels', 'Each channel is a 64-bit data bus plus a command/address bus. One read burst is 8 beats × 8 bytes = 64 bytes, one cache line. The cells are capacitors that must be refreshed. DDR5 splits each DIMM into two 32-bit subchannels with 16-beat bursts, which also deliver 64 bytes.', 'dram', ''],
    gpu: ['Integrated GPU', 'Ten compute units (CUs) sharing a GPU L2. It is another client of the same interconnect and the same DRAM, so it competes with the cores for memory bandwidth. Laptop and phone chips have one; most server CPUs don’t.', 'hier', ''],
    io: ['I/O hub: PCIe root complex + IOMMU', 'Turns core MMIO accesses into PCIe packets and device DMA into memory requests. The IOMMU translates device addresses and blocks DMA to memory the OS didn’t map for that device. On x86, hardware keeps device DMA coherent with the CPU caches; on some Arm systems the OS cleans or invalidates the cache lines around each transfer instead.', 'dev', '[[ch:dev]] walks an NVMe read through it.'],
    nvme: ['NVMe SSD', 'Talks to the CPU through submission and completion rings in host RAM, doorbell registers written over MMIO, DMA, and MSI-X interrupts.', 'dev', ''],
    nic: ['Network card', 'Same pattern as NVMe: TX and RX descriptor rings in host RAM, doorbell registers the driver writes over MMIO, a DMA engine that reads the rings and packet buffers, and MSI-X interrupts.', 'dev', '']
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
  lbl(24, 32, 'The lab\u2019s example machine \u00b7 one package', 'h');
  /* core cluster */
  s('rect', {x: 24, y: 44, width: 760, height: 380, rx: 12, fill: 'none', stroke: 'var(--bd2)', 'stroke-dasharray': '5 4'}, sv);
  lbl(36, 62, 'Core cluster: four cores share the L3', 's');
  /* core 0 detailed */
  s('rect', {x: 36, y: 72, width: 420, height: 206, rx: 10, fill: 'none', stroke: 'var(--bd2)'}, sv);
  blk('core0', 44, 80, 404, 26, 'Core 0 \u00b7 out of order', []);
  blk('fe', 44, 112, 196, 70, 'Front end', ['branch predictor \u00b7 L1i', 'decode 4 per cycle'], 'a3b');
  blk('ooo', 250, 112, 198, 70, 'Out-of-order engine', ['ROB 24 \u00b7 48 registers', '4 ALU + 2 AGU ports'], 'a3b');
  blk('lsu', 44, 188, 250, 82, 'Load/store unit + L1d', ['LQ 10 \u00b7 SQ 8 \u00b7 4 miss buffers', 'L1d 32 KB \u00b7 8-way', 'store-to-load forwarding'], 'a4b');
  blk('tlb', 302, 188, 146, 82, 'TLBs + walker', ['L1 DTLB 64', 'L2 TLB 512', 'page walker'], 'a4b');
  blk('l2', 44, 300, 404, 50, 'L2 \u00b7 512 KB \u00b7 8-way \u00b7 inclusive of L1', ['private to this core'], 'a2b');
  HW.assoc(parts.l2, 356, 307, 84, 36, {ways: 8, rows: 4});
  busL('M 170 270 L 170 300'); lbl(176, 290, '32 B/cycle');
  /* cores 1-3 */
  [1, 2, 3].forEach(function(n, k){
    var x = 472 + k * 102;
    s('rect', {x: x, y: 72, width: 94, height: 206, rx: 10, fill: 'none', stroke: 'var(--bd2)'}, sv);
    var gr = blk('c' + n, x + 6, 80, 82, 190, 'Core ' + n, []);
    HW.blocks(gr, x + 12, 106, 70, 156, [
      {t: 'Front end', sub: 'L1i \u00b7 decode', cls: 'a3b'},
      {t: 'OoO engine', sub: 'ROB \u00b7 PRF', cls: 'a3b'},
      {t: 'LSU + L1d', sub: 'LQ \u00b7 SQ', cls: 'a4b'},
      {t: 'TLBs', sub: '+ walker', cls: 'a4b'}
    ], {gap: 5});
    gr.onclick = function(e){ e.stopPropagation(); pick('core0'); };
    s('rect', {x: x + 6, y: 300, width: 82, height: 50, rx: 8, 'class': 'box a2b'}, sv);
    lbl(x + 14, 318, 'L2 512 KB', 's');
    HW.assoc(sv, x + 14, 324, 66, 19, {ways: 8, rows: 3});
    busL('M ' + (x + 47) + ' 270 L ' + (x + 47) + ' 300');
  });
  blk('l3', 44, 366, 728, 50, 'L3 \u00b7 4 MB \u00b7 16-way \u00b7 victim cache \u00b7 shadow tags of all four L2s', ['shared by cores 0\u20133; filled by L2 evictions'], 'a2b');
  [170, 519, 621, 723].forEach(function(x){ busL('M ' + x + ' 350 L ' + x + ' 366'); });
  lbl(176, 362, '32 B/cycle');
  /* PCIe links: I/O hub straight down to the devices (drawn first, so they pass under the fabric) */
  busL('M 890 280 L 890 600'); busL('M 1086 280 L 1086 600');
  /* fabric */
  blk('df', 24, 440, 1152, 36, 'Coherent interconnect \u00b7 requests, data and probes', [], 'a3b');
  busL('M 400 416 L 400 440');
  var gpu = blk('gpu', 800, 44, 376, 110, 'Integrated GPU (optional)', []);
  for (var cu = 0; cu < 10; cu++){
    var cux = 810 + (cu % 5) * 50, cuy = 70 + Math.floor(cu / 5) * 26;
    HW.rect(gpu, cux, cuy, 46, 22, 'a3b', 3); HW.txt(gpu, cux + 23, cuy + 15, 'CU ' + cu, {size: 9, anchor: 'middle', fill: 'var(--tx)'});
  }
  HW.blocks(gpu, 1066, 70, 100, 48, [{t: 'GPU L2', sub: 'shared by the CUs', cls: 'sunk'}]);
  HW.rect(gpu, 806, 124, 92, 24, 'a3b', 4); HW.txt(gpu, 852, 140, 'fabric port', {size: 9.5, anchor: 'middle', fill: 'var(--tx)'});
  HW.txt(gpu, 908, 140, 'same fabric and DRAM as the cores', {size: 9.5, fill: 'var(--tx3)'});
  busL('M 800 130 L 792 130 L 792 440');
  blk('io', 800, 170, 376, 110, 'I/O hub', ['PCIe root complex \u00b7 IOMMU + IOTLB', 'turns MMIO into PCIe packets and', 'device DMA into memory requests']);
  busL('M 1000 280 L 1000 440');
  blk('umc', 24, 490, 560, 64, 'Memory controllers \u00b7 one per channel', ['address mapping \u00b7 request queues \u00b7 DRAM command scheduling \u00b7 refresh']);
  busL('M 300 476 L 300 490');
  /* off-package */
  blk('dram', 24, 600, 560, 140, 'DDR4 \u2014 channel A and channel B', ['each: 64-bit data bus + command/address bus', 'DIMM \u2192 rank \u2192 8 chips \u2192 16 banks each \u2192 rows \u00d7 columns', 'one 64-byte line = 8 beats of 8 bytes (burst length 8)', 'DDR4-2400: 2400 MT/s \u00d7 8 B = 19.2 GB/s per channel (peak)']);
  busL('M 160 554 L 160 600'); busL('M 450 554 L 450 600'); lbl(166, 584, 'channel A, 64 bits'); lbl(456, 584, 'channel B, 64 bits');
  blk('nvme', 800, 600, 180, 140, 'NVMe SSD', ['queues in host RAM', 'doorbells via MMIO', 'DMA + MSI-X']);
  var nic = blk('nic', 996, 600, 180, 140, 'Network card', []);
  HW.blocks(nic, 1004, 628, 164, 24, [{t: 'doorbells', cls: 'a3b'}, {t: 'DMA', cls: 'a3b'}, {t: 'MSI-X', cls: 'a3b'}], {cols: 3, gap: 4, size: 9});
  ['TX', 'RX'].forEach(function(nm, r){
    var ry = 664 + r * 24;
    HW.txt(nic, 1006, ry + 11, nm + ' ring', {size: 9, fill: 'var(--tx2)'});
    for (var k = 0; k < 8; k++) s('rect', {x: 1052 + k * 14.5, y: ry, width: 12, height: 15, rx: 2, 'class': 'sunk', style: 'stroke-dasharray:2 1.5'}, nic);
  });
  HW.txt(nic, 1006, 726, 'rings live in host RAM', {size: 9, fill: 'var(--tx3)'});
  lbl(896, 530, 'PCIe links from the I/O hub');
  lbl(896, 545, '(packets called TLPs); they do');
  lbl(896, 560, 'not pass through the fabric');
  lbl(600, 520, 'off-package from here down \u2193', 's');
  sv.onclick = function(){ pick(null); };

  function pick(id){
    selId = id;
    for (var k in parts) parts[k].setAttribute('class', 'click' + (k === id ? ' on' : ''));
    if (!id){ info.innerHTML = '<div class="inspector-kicker">The machine</div><h3>Pick a block</h3><p>Click any part to see what it does and which chapter takes it apart. The diagram is the table of contents.</p><p class="note">The sizes are the lab\u2019s example machine. For real AMD, Intel and Arm sizes, see <a href="#map/chips">Same parts, different choices</a> below.</p>'; return; }
    var d = D[id];
    info.innerHTML = '<h3>' + d[0] + '</h3><p>' + d[1] + '</p>' + (d[3] ? '<p>' + d[3] + '</p>' : '') + '<button class="pri" data-go="' + d[2] + '">open the chapter \u2192</button>';
    info.querySelector('button').onclick = function(){ App.go(d[2]); };
  }
  pick(null);

  var path = h('div', {'class': 'card route-index'}, root);
  path.innerHTML = '<h3>The route this site follows</h3><ol class="route">' +
    '<li><b>[[num:bits]]\u2013[[num:share]]</b> Foundations: bits and hex, addresses, instructions, assembly, cycles, caches, virtual memory, cores and devices.</li>' +
    '<li><b>[[num:code]]</b> C \u2192 assembly \u2192 bytes \u2192 \u00b5ops for <code>hist[data[i]]++</code>.</li>' +
    '<li><b>[[num:core]]</b> Those \u00b5ops through fetch, decode, ' + g('rename') + ', the ' + g('rob') + ', ' + g('sched', 'schedulers') + ', ports, the ' + g('lq', 'load') + ' and ' + g('sq', 'store') + ' queues, retirement and store commit.</li>' +
    '<li><b>[[num:xlate]]</b> The virtual address of <code>hist[123]</code> through the ' + g('dtlb') + ', the L2 TLB, a 4-level ' + g('walk') + ', and a ' + g('pf') + '.</li>' +
    '<li><b>[[num:l1d]]</b> The physical address through the L1d: set, tag compare, way select, ' + g('plru') + ', eviction and ' + g('wbk') + '.</li>' +
    '<li><b>[[num:hier]]</b> A miss through L2, the L3 ' + g('victimc') + ', the fabric and back, and how misses overlap.</li>' +
    '<li><b>[[num:dram]]</b> DRAM: banks, rows, the ' + g('rowbuf') + ', commands and timings.</li>' +
    '<li><b>[[num:stores]]</b> The store path: store buffer, ' + g('rfo') + ', ' + g('wc') + ', ' + g('memtype', 'memory types') + ', fences.</li>' +
    '<li><b>[[num:coh]]</b> Four cores sharing lines: ' + g('moesi') + ', probes, ' + g('fshare') + '.</li>' +
    '<li><b>[[num:pref]]</b> ' + g('pref', 'Prefetchers') + ' guessing the next line.</li>' +
    '<li><b>[[num:dev]]</b> Devices: ' + g('mmio') + ', ' + g('dma') + ', the ' + g('iommu') + ', interrupts \u2014 an NVMe read end to end.</li>' +
    '<li><b>[[num:e2e]]</b> One <code>hist[123]++</code> with every stage on a single timeline.</li>' +
    '<li><b>[[num:gloss]]</b> Glossary: every term, searchable.</li></ol>' +
    '<p class="note">Colored terms open a definition. The <b>latencies</b> button sets the cycle counts every simulation uses.</p>';
}});
