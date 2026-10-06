/* ======================= chapter: the machine ======================= */
App.chapter({id: 'map', short: 'Implementations', title: 'Architecture implementations',
lede: 'Start with a mechanism, identify the implementation choice, inspect its evidence, then design an experiment.',
points: ['The mechanism map below uses explicit teaching-model parameters.', 'Modern AMD, Intel and Arm cases show differences that change a prediction.', 'Published observations, inference and native measurements retain separate scopes.'],
build: function(root){
  var h = App.h, s = App.s, g = App.g, HW = App.HW;
  h('p', {'class':'model-parameter-note'}, root, 'Teaching-model parameters: four example cores, private 32 KiB L1d / 512 KiB L2, shared 4 MiB victim-oriented L3, a perfect holder directory and two DDR4-2400 channels. These choices are not an AMD, Intel or Arm specification. Core queue counts match the finite pipeline model.');
  var work = h('div', {'class': 'map-workbench'}, root);
  var wrap = h('div', {'class': 'scroller map-canvas'}, work);
  var sv = s('svg', {'data-mechanism-scope':'teaching-model', role:'img', 'aria-label':'Teaching memory-system topology; chosen capacities and policies', viewBox: '0 0 1200 760', style: 'min-width:880px'}, wrap);
  var info = h('aside', {'class': 'card map-inspector'}, work);
  var parts = {}, selId = null;
  var D = {
    "core0": [
        "Core 0 (and example cores 1–3)",
        "An out-of-order mechanism diagram. Chosen pipeline capacities: ROB 24 instruction records, PRF 48, decode queue 8, ALU / AGU queues 16 / 12, LQ 10, SQ 8 and miss buffers 4. SMT is an optional implementation choice, not a simulated second thread.",
        "core",
        "[[ch:core]] executes the histogram loop cycle by cycle."
    ],
    "fe": [
        "Front end",
        "Predict a path, fetch instruction bytes, identify boundaries and decode operations. Caches and widths are implementation choices; this teaching schedule fetches/decodes up to four instructions per cycle.",
        "code",
        "[[ch:code]] shows the x86 example; [[ch:core]] shows its chosen schedule."
    ],
    "ooo": [
        "Rename + out-of-order engine",
        "RAT/free list, 48 physical registers, 24 in-order instruction records, a 16-entry ALU queue and 12-entry AGU queue. Four ALU and two address-generation slots per cycle are chosen model widths.",
        "core",
        ""
    ],
    "lsu": [
        "Load/store unit + L1d",
        "Chosen LQ 10, SQ 8, miss buffers 4. The lookup example uses 32 KiB, 8 ways, 64 sets and 64-byte lines. It illustrates parallel tag lookup, forwarding and finite-resource stalls.",
        "l1d",
        "[[ch:xlate]] covers translation; [[ch:stores]] covers store publication."
    ],
    "tlb": [
        "TLBs + page walkers",
        "Cache translations; walk page tables on a miss. This site illustrates x86-64 four-level, 48-bit virtual addressing and 4 KiB pages. Entry counts and walker concurrency are explicit choices in the individual labs.",
        "xlate",
        ""
    ],
    "l2": [
        "Private L2",
        "This example chooses 512 KiB, eight ways and inclusion of L1. A 32-byte transfer width is illustrative. Latency comes from the separate teaching settings, not from a vendor specification.",
        "hier",
        ""
    ],
    "l3": [
        "Shared last-level cache",
        "This path chooses a 4 MiB, 16-way victim-oriented L3 plus perfect shadow knowledge of upper-cache holders. Data inclusion and directory tracking are separate policies; other implementations differ.",
        "hier",
        "Try [[ch:hier]] inclusion experiments and [[ch:coh]] ownership transactions."
    ],
    "df": [
        "Coherent interconnect",
        "Routes requests, responses and coherence probes among clients. No proprietary fabric topology, clock coupling, address hash or hardware queue capacity is inferred.",
        "hier",
        ""
    ],
    "umc": [
        "Memory controllers",
        "Choose a channel/bank/row mapping, queue requests and issue DRAM commands subject to timing and refresh. The controller lab exposes its selected scheduling rules.",
        "dram",
        "[[ch:dram]]."
    ],
    "dram": [
        "DDR4 example, two channels",
        "A chosen DDR4 x8 rank and BL8 burst: eight 8-byte beats supply one 64-byte line over a 64-bit channel. Timing and address mapping are model choices; memory generations and channel widths vary.",
        "dram",
        ""
    ],
    "gpu": [
        "Optional accelerator client",
        "An illustrative client sharing some memory resources with CPUs. Drawn lanes are schematic, not a GPU product specification. Coherence and attachment depend on the actual platform.",
        "hier",
        ""
    ],
    "io": [
        "I/O attachment + IOMMU",
        "PCIe root complex, address translation and permissions for device DMA. The chosen walkthrough is coherent DMA; non-coherent platforms require the OS DMA API and explicit cache maintenance.",
        "dev",
        "[[ch:dev]] walks an NVMe read."
    ],
    "nvme": [
        "NVMe SSD",
        "Submission/completion rings, MMIO doorbells, DMA and interrupts form the chosen device path.",
        "dev",
        ""
    ],
    "nic": [
        "Network device",
        "Descriptor rings, MMIO doorbells, DMA and interrupts are a related device path. Actual ownership/ordering contracts require the device and OS documentation.",
        "dev",
        ""
    ]
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
  lbl(24, 32, 'Mechanism map · chosen topology, capacities and policies', 'h');
  /* example cache-sharing domain */
  s('rect', {x: 24, y: 44, width: 760, height: 380, rx: 12, fill: 'none', stroke: 'var(--bd2)', 'stroke-dasharray': '5 4'}, sv);
  lbl(36, 62, 'Example sharing domain: four cores / shared last-level cache', 's');
  /* core 0 detailed */
  s('rect', {x: 36, y: 72, width: 420, height: 206, rx: 10, fill: 'none', stroke: 'var(--bd2)'}, sv);
  blk('core0', 44, 80, 404, 26, 'Core 0 · optional SMT', []);
  blk('fe', 44, 112, 196, 70, 'Front end', ['predictor · L1i · decode', 'chosen decode width 4'], 'a3b');
  blk('ooo', 250, 112, 198, 70, 'Out-of-order engine', ['ROB 24 · PRF 48', 'ALUQ 16 · AGUQ 12'], 'a3b');
  blk('lsu', 44, 188, 250, 82, 'Load/store unit + L1d', ['LQ 10 · SQ 8 · MAB 4', 'L1d 32 KB 8-way', 'parallel lookup + forwarding'], 'a4b');
  blk('tlb', 302, 188, 146, 82, 'TLBs + walkers', ['translation hits', 'page-table walks', 'walker capacity'], 'a4b');
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
      {t: 'TLBs', sub: '+ walker capacity', cls: 'a4b'}
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
  blk('df', 24, 440, 1152, 36, 'Coherent interconnect · requests / responses / probes', [], 'a3b');
  busL('M 400 416 L 400 440');
  var gpu = blk('gpu', 800, 44, 376, 110, 'Optional accelerator · illustrative client', []);
  for (var cu = 0; cu < 10; cu++){
    var cux = 810 + (cu % 5) * 50, cuy = 70 + Math.floor(cu / 5) * 26;
    HW.rect(gpu, cux, cuy, 46, 22, 'a3b', 3); HW.txt(gpu, cux + 23, cuy + 15, 'lane ' + cu, {size: 9, anchor: 'middle', fill: 'var(--tx)'});
  }
  HW.blocks(gpu, 1066, 70, 100, 48, [{t: 'client cache', sub: 'optional sharing', cls: 'sunk'}]);
  HW.rect(gpu, 806, 124, 92, 24, 'a3b', 4); HW.txt(gpu, 852, 140, 'fabric port', {size: 9.5, anchor: 'middle', fill: 'var(--tx)'});
  HW.txt(gpu, 908, 140, 'same fabric and DRAM as the cores', {size: 9.5, fill: 'var(--tx3)'});
  busL('M 800 130 L 792 130 L 792 440');
  blk('io', 800, 170, 376, 110, 'I/O hub', ['PCIe root complex \u00b7 IOMMU + IOTLB', 'turns MMIO into PCIe packets and', 'device DMA into memory requests']);
  busL('M 1000 280 L 1000 440');
  blk('umc', 24, 490, 560, 64, 'Memory controllers · chosen two-channel example', ['address mapping \u00b7 request queues \u00b7 DRAM command scheduling \u00b7 refresh']);
  busL('M 300 476 L 300 490');
  /* off-package */
  blk('dram', 24, 600, 560, 140, 'DDR4 \u2014 channel A and channel B', ['each: 64-bit data bus + command/address bus', 'DIMM \u2192 rank \u2192 8 chips \u2192 16 banks each \u2192 rows \u00d7 columns', 'one 64-byte line = 8 beats of 8 bytes (burst length 8)', 'DDR4-2400: 2400 MT/s \u00d7 8 B = 19.2 GB/s per channel (peak)']);
  busL('M 160 554 L 160 600'); busL('M 450 554 L 450 600'); lbl(166, 584, 'channel A, 64 bits'); lbl(456, 584, 'channel B, 64 bits');
  blk('nvme', 800, 600, 180, 140, 'NVMe SSD', ['queues in host RAM', 'doorbells via MMIO', 'DMA + MSI-X']);
  var nic = blk('nic', 996, 600, 180, 140, 'Wi-Fi / NIC', []);
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
    if (!id){ info.innerHTML = '<div class="inspector-kicker">mechanism map</div><h3>Select a block</h3><p>Inspect any structure to see what it does, its chosen model parameters, and the chapter that takes it apart. The diagram itself is the table of contents.</p><p class="note">All numeric capacities and transfer widths in this map are teaching-model parameters. Inspect the implementation case studies below for scoped hardware facts.</p>'; return; }
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
    '<p class="note">Colored terms open a definition. The <b>latency model</b> in the sidebar uses chosen teaching parameters; hardware results retain their own measurement boundaries.</p>';
}});
