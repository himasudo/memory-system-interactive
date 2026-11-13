/* ======================= II.01 · The machine: one load, block by block ======================= */
(function () {
  'use strict';
  var g = App.g, d = App.gloss, h = App.h, s = App.s;
  d('core', 'core', 'One processor inside the chip. It fetches, decodes and runs one stream of instructions, with its own registers and its own L1 and L2 caches. The example machine has four.');
  d('igpu', 'integrated GPU', 'A graphics processor on the same chip as the cores. It reads and writes the same DRAM through the same interconnect, so it competes with the cores for memory bandwidth. Laptop chips usually have one; server chips usually do not.');
  d('mts', 'MT/s', 'Million transfers per second: how many times per second a memory bus moves one word. A DDR4-2400 channel moves 8 bytes 2,400 million times a second, 19.2 GB/s.');
  App.setCategory('core', 'core');
  App.setCategory('igpu', 'io');
  App.setCategory('mts', 'memory');

  var CFG = App.CFG;
  function cyc() { return { l1: CFG.l1, l2: CFG.l2, l3: CFG.l3, dram: App.dramCycles() }; }

  /* The path of one load, as a strip of boxes; `at` marks the block a section is about. */
  var STOPS = [['core', 'core', 'computes the address'], ['tlb', 'TLB', 'virtual → physical'], ['l1', 'L1d', '32 KiB, this core'], ['l2', 'L2', '512 KiB, this core'],
    ['l3', 'L3', '4 MiB, all cores'], ['fabric', 'interconnect', 'joins everything'], ['mc', 'memory controller', 'one per channel'], ['dram', 'DRAM', 'outside the chip']];
  function path(L, at, cap) {
    var c = cyc(), lat = { l1: c.l1 + ' cycles', l2: c.l2 + ' cycles', l3: c.l3 + ' cycles', dram: '≈ ' + c.dram + ' cycles' };
    L.chain(STOPS.map(function (x) { return { k: x[1], v: lat[x[0]] || '', d: x[2], hot: x[0] === at }; }), { cap: cap || 'The blocks a load can meet, in order. Cycle counts are the total load-to-use time when the data is found there.' });
  }

  /* "Lesson IV.02 · Down the hierarchy", or null for a page that does not exist */
  function where(id) {
    var c = App.chapters.filter(function (x) { return x.id === id; })[0];
    if (!c || !c.num) return null;
    return (App.Course && App.Course.labPages[id] ? 'Lab ' : 'Lesson ') + c.num + ' · ' + c.short;
  }

  /* ---------- the whole-machine diagram, with an inspector ---------- */
  var BLOCKS = {
    core0: ['Core 0', 'One of four cores. It runs one stream of instructions and has its own L1 and L2 caches.', 'cpu-pipe'],
    cores: ['Cores 1 to 3', 'Built like core 0: each has its own front end, execution engine, load/store unit, TLBs, L1d and L2.', 'cpu-pipe'],
    fe: ['Front end', 'Fetches instruction bytes from the L1 instruction cache (L1i), finds where each instruction starts, and decodes it into the small operations the core executes.', 'cpu-uops'],
    ex: ['Execution engine', 'Runs the decoded operations as soon as their inputs are ready, often out of program order, then retires them in order.', 'cpu-ooo'],
    lsu: ['Load/store unit', 'Computes each memory address, sends loads and stores to the L1d, and keeps track of the ones still in flight.', 'cpu-lsq'],
    tlb: ['TLBs and page walker', 'Translate virtual addresses into physical ones. The TLBs keep recent translations; on a miss the page walker reads the page tables through the caches.', 'vm-tlb'],
    l1d: ['L1 data cache (L1d)', '32 KiB, private to the core, 4 cycles. Holds copies of 64-byte lines.', 'l1d'],
    l2: ['L2 cache', '512 KiB per core, 12 cycles. In this machine it keeps a copy of every line in its core’s L1d.', 'hier'],
    l3: ['L3 cache', '4 MiB shared by the four cores, 35 cycles. Filled with lines the L2s evict. It also knows which lines each L2 holds.', 'hier'],
    fabric: ['Interconnect', 'Carries requests, data and coherence messages between the caches, the memory controllers, the I/O hub and the GPU.', 'hier'],
    mc: ['Memory controllers', 'One per memory channel. Each turns requests into DRAM commands and receives lines back. Consecutive lines alternate between the two channels.', 'dram'],
    dram: ['DRAM', 'Two DDR4-2400 channels, each a 64-bit bus to memory modules outside the chip. About 90 ns to the first byte.', 'dram'],
    io: ['I/O hub and IOMMU', 'Connects devices over PCI Express. Turns the cores’ accesses to device registers into PCIe packets, and device DMA into memory requests after the IOMMU has checked them.', 'io-paths'],
    gpu: ['Integrated GPU (some chips)', 'A graphics processor on the same chip. One more client of the same interconnect and DRAM. Server chips usually have none; a server GPU is a separate PCIe device.', 'gpu-mem'],
    ssd: ['NVMe SSD', 'A storage device on a PCIe link. It moves data to and from DRAM by DMA.', 'io-paths'],
    nic: ['Network card', 'A PCIe device that moves packets to and from DRAM by DMA.', 'io-paths']
  };
  var PATHS = {
    hit: { label: 'L1d hit', blocks: ['core0', 'lsu', 'tlb', 'l1d'], note: 'Translated by the TLB, found in the L1d: about ' },
    l3: { label: 'L3 hit', blocks: ['core0', 'lsu', 'tlb', 'l1d', 'l2', 'l3'], note: 'Missed in the L1d and the L2, found in the shared L3: about ' },
    dram: { label: 'miss everywhere', blocks: ['core0', 'lsu', 'tlb', 'l1d', 'l2', 'l3', 'fabric', 'mc', 'dram'], note: 'Missed in every cache. The request crosses the interconnect to a memory controller, and the line comes back the same way: about ' },
    dma: { label: 'SSD writes by DMA', blocks: ['ssd', 'io', 'fabric', 'mc', 'dram'], note: 'No core is involved: the device’s write travels over PCIe to the I/O hub, then across the interconnect to DRAM.' }
  };
  function machine(el) {
    var wrap = h('div', { 'class': 'machine-lesson' }, el);
    var bar = h('div', { 'class': 'machine-paths', role: 'group', 'aria-label': 'Highlight a path' }, wrap);
    var sc = h('div', { 'class': 'scroller' }, wrap);
    var sv = s('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'The example machine: four cores with their caches, a shared L3, the interconnect, memory controllers, DRAM, the I/O hub, an optional GPU and two devices', style: 'min-width:760px' }, sc);
    var info = h('div', { 'class': 'card machine-info', 'aria-live': 'polite' }, wrap);
    var parts = {}, picked = null, lit = null;
    function T(x, y, t, cls, anc) { return s('text', { x: x, y: y, 'class': cls || 's', 'text-anchor': anc || 'start' }, sv, t); }
    function wire(dd) { return s('path', { d: dd, 'class': 'bus' }, sv); }
    function blk(id, x, y, w, ht, title, sub, cls, parent) {
      var gr = s('g', { 'class': 'click', 'data-block': id, tabindex: '0', role: 'button', 'aria-label': BLOCKS[id] ? BLOCKS[id][0] : title }, parent || sv);
      s('rect', { x: x, y: y, width: w, height: ht, rx: 8, 'class': 'box' + (cls ? ' ' + cls : '') }, gr);
      s('text', { x: x + 10, y: y + 19, 'class': 'h' }, gr, title);
      if (sub) s('text', { x: x + 10, y: y + 36, 'class': 's' }, gr, sub);
      gr.onclick = function (e) { e.stopPropagation(); pick(id); };
      gr.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(id); } };
      (parts[id] = parts[id] || []).push(gr);
      return gr;
    }
    /* the chip */
    s('rect', { x: 10, y: 10, width: 980, height: 432, rx: 14, 'class': 'sunk' }, sv);
    T(24, 30, 'One chip', 'h');
    /* devices hang off the I/O hub; drawn first so the links pass under the interconnect */
    wire('M 742 252 L 742 470'); wire('M 902 252 L 902 470');
    /* core 0, opened up */
    s('rect', { x: 24, y: 40, width: 330, height: 212, rx: 10, fill: 'none', stroke: 'var(--bd2)' }, sv);
    blk('core0', 32, 46, 314, 26, 'Core 0', '', '');
    blk('fe', 32, 80, 152, 50, 'Front end', 'fetch · decode · L1i', 'a3b');
    blk('ex', 194, 80, 152, 50, 'Execution engine', 'runs the operations', 'a3b');
    blk('lsu', 32, 138, 152, 50, 'Load/store unit', 'addresses · loads · stores', 'a4b');
    blk('tlb', 194, 138, 152, 50, 'TLBs + walker', 'virtual → physical', 'a4b');
    blk('l1d', 32, 196, 314, 48, 'L1d · 32 KiB', 'private to core 0', 'a2b');
    blk('l2', 24, 262, 330, 40, 'L2 · 512 KiB · private to core 0', '', 'a2b');
    wire('M 189 252 L 189 262');
    /* cores 1–3 */
    [1, 2, 3].forEach(function (n, k) {
      var x = 366 + k * 98;
      s('rect', { x: x, y: 40, width: 88, height: 212, rx: 10, fill: 'none', stroke: 'var(--bd2)' }, sv);
      var gr = blk('cores', x + 6, 46, 76, 198, 'Core ' + n, '', '');
      ['front end', 'execution', 'load/store', 'TLBs', 'L1d'].forEach(function (t, i) {
        s('rect', { x: x + 12, y: 76 + i * 33, width: 64, height: 27, rx: 4, 'class': i === 4 ? 'a2b' : i > 1 ? 'a4b' : 'a3b' }, gr);
        s('text', { x: x + 44, y: 94 + i * 33, 'class': 's', 'text-anchor': 'middle' }, gr, t);
      });
      blk('l2', x, 262, 88, 40, 'L2', '', 'a2b');
      wire('M ' + (x + 44) + ' 252 L ' + (x + 44) + ' 262');
    });
    blk('l3', 24, 316, 636, 44, 'L3 · 4 MiB · shared by the four cores', 'filled with lines the L2s evict', 'a2b');
    [189, 410, 508, 606].forEach(function (x) { wire('M ' + x + ' 302 L ' + x + ' 316'); });
    blk('fabric', 24, 374, 952, 26, 'Interconnect', '', 'a3b');
    wire('M 342 360 L 342 374');
    /* right column: GPU and I/O hub */
    blk('gpu', 672, 40, 304, 92, 'Integrated GPU (some chips)', 'one more client of the interconnect and DRAM', '');
    blk('io', 672, 142, 304, 110, 'I/O hub', 'PCIe links to devices', '');
    s('text', { x: 682, y: 214, 'class': 's' }, parts.io[0], 'IOMMU: checks every device access');
    s('text', { x: 682, y: 232, 'class': 's' }, parts.io[0], 'turns DMA into memory requests');
    wire('M 666 86 L 662 86 L 662 374'); wire('M 824 252 L 824 374');
    blk('mc', 24, 406, 400, 28, 'Memory controllers · one per channel', '', '');
    wire('M 224 400 L 224 406');
    /* off the chip */
    T(440, 462, 'outside the chip ↓', 's');
    blk('dram', 24, 470, 192, 78, 'DRAM channel A', 'DDR4-2400 · 64-bit bus', 'sunk');
    blk('dram', 232, 470, 192, 78, 'DRAM channel B', 'DDR4-2400 · 64-bit bus', 'sunk');
    wire('M 120 434 L 120 470'); wire('M 328 434 L 328 470');
    blk('ssd', 672, 470, 150, 78, 'NVMe SSD', 'PCIe device', 'sunk');
    blk('nic', 832, 470, 144, 78, 'Network card', 'PCIe device', 'sunk');
    T(752, 458, 'PCIe links from the I/O hub, not through the interconnect', 's');
    sv.onclick = function () { pick(null); };

    function paint() {
      var on = lit ? PATHS[lit].blocks : [];
      Object.keys(parts).forEach(function (id) {
        parts[id].forEach(function (gr) { gr.setAttribute('class', 'click' + (id === picked || on.indexOf(id) >= 0 ? ' on' : '')); });
      });
    }
    function pick(id) {
      picked = id; paint();
      if (!id) { info.innerHTML = '<p class="note">Click any block to see what it does. The buttons above light up the blocks one access passes through.</p>'; return; }
      var b = BLOCKS[id];
      info.innerHTML = '<h3>' + b[0] + '</h3><p>' + b[1] + '</p>';
      var to = where(b[2]);
      if (to) h('a', { href: '#' + b[2], 'class': 'machine-go' }, info, 'Where the course opens it: ' + to + ' →');
    }
    Object.keys(PATHS).forEach(function (k) {
      var bt = h('button', { type: 'button', 'aria-pressed': 'false' }, bar, PATHS[k].label);
      bt.onclick = function () {
        lit = lit === k ? null : k;
        Array.prototype.forEach.call(bar.children, function (x) { x.setAttribute('aria-pressed', 'false'); x.classList.remove('on'); });
        if (lit) { bt.setAttribute('aria-pressed', 'true'); bt.classList.add('on'); }
        paint();
        var c = cyc(), t = { hit: c.l1, l3: c.l3, dram: c.dram }[k];
        info.innerHTML = lit ? '<h3>' + PATHS[k].label + '</h3><p>' + PATHS[k].note + (t ? t + ' cycles.' : '') + '</p>' : '';
        if (!lit) pick(null);
      };
    });
    pick(null);
  }

  App.lesson({
    id: 'map', short: 'The machine', title: 'The machine: one load, block by block',
    lede: 'Where can the bytes of one load be? Each block of the machine, in the order a load meets it.',
    know: ['A load copies data from memory into a register ([[ch:instr]]).', 'Caches keep recently used data close to the core, in levels ([[ch:whycache]]).', 'Programs use virtual addresses, which the hardware translates ([[ch:vm]]).', 'Cores share one memory, and devices reach it by DMA ([[ch:share]]).'],
    learn: ['Name every block between a core and the DRAM chips, in the order a load meets them', 'Say what each block does, in one sentence', 'Read the whole-machine diagram that later lessons open up'],
    sections: [
      { id: 'question', title: 'One load, one question', body: function (L) {
        L.p('Every page of this course follows one loop, <code>hist[data[i]]++</code>. Its slowest step is usually one load: reading <code>hist[123]</code>, 8 bytes, into the core.');
        L.code('void histogram(const unsigned char *data, long n, long *hist)\n{\n    for (long i = 0; i < n; i++)\n        ⟦hist[data[i]]++⟧;\n}', { title: 'the running example' });
        L.p('<code>hist</code> starts at 0x7ffd4a3c2a80. Element 123 is 123 × 8 = 984 bytes further, at 0x7ffd4a3c2e58. The core asks for the 8 bytes stored there.');
        L.p('Those bytes can be in one of several places. Each is further from the core than the last, and slower to reach:');
        var c = cyc();
        L.table(['Where the bytes are', 'Cycles until the load has them'], [
          ['the L1 data cache, inside the core', String(c.l1)],
          ['the L2 cache, next to the core', String(c.l2)],
          ['the L3 cache, shared by all cores', String(c.l3)],
          ['DRAM, outside the chip', '≈ ' + c.dram]
        ], { mono: false, cap: 'From the latency settings (the ≋ button): a 4 GHz core and 90 ns DRAM by default. Change them and later pages follow.' });
        L.p('This lesson walks outward from the core, one block per section. The last section shows all of them on one diagram.');
      } },
      { id: 'core', title: 'The core', body: function (L) {
        L.p('The example chip holds four cores. Each core runs its own stream of instructions, with its own registers and its own two levels of cache.', ['core']);
        L.p('Inside a core, three parts handle our load:');
        L.list([
          'The <b>front end</b> reads instruction bytes and decodes them into the small operations the core executes.',
          'The <b>execution engine</b> runs those operations as soon as their inputs are ready, often out of program order, and then retires them in order.',
          'The <b>load/store unit</b> computes each memory address and sends the access to the cache.'
        ], [['front end', 'The part of a core that fetches instruction bytes and decodes them. [[ch:cpu-code]] and [[ch:cpu-uops]] open it.'], ['execution engine', 'The part of a core that runs decoded operations and puts their results back in program order. [[ch:cpu-ooo]] opens it.']]);
        L.p('The instruction <code>addq $0x1,(%rdx,%rax,8)</code> reads <code>hist[k]</code>, adds 1 and writes it back. The load/store unit computes its address from two registers: <code>rdx</code> + <code>rax</code> × 8 = 0x7ffd4a3c2a80 + 123 × 8.', [['load/store unit', 'The part of a core that computes addresses, sends loads and stores to the L1d, and tracks the ones still in flight.']]);
        path(L, 'core');
      } },
      { id: 'translate', title: 'First, translation: the TLB', body: function (L) {
        L.p('0x7ffd4a3c2e58 is a virtual address. The caches and DRAM work with physical addresses, so the address is translated first ([[ch:vm]]).');
        L.p('A TLB keeps recent translations. This machine has a 64-entry TLB next to the L1d and a 512-entry second-level TLB behind it. When the translation is there, it costs nothing extra.', [['TLB', 'Translation lookaside buffer: a small cache of recent virtual-to-physical translations, inside each core.']]);
        L.p('When it is not, the page walker reads the page tables. They are ordinary memory, so the walker’s reads go through the same caches as any load.', [['page walker', 'Hardware in each core that reads the page tables when the TLB has no translation. Part III follows it step by step.']]);
        L.p('For our load the answer is the physical address 0x1a3f7ce58. Every block after the TLB sees only that number.');
        path(L, 'tlb');
        L.note('deeper', 'Part III spends 24 lessons on translation: page tables, the walk, page faults and what the kernel does. [[ch:vm-tlb]] opens the TLB.');
      } },
      { id: 'l1', title: 'The L1 data cache', body: function (L) {
        L.p('The first cache is the L1 data cache, L1d, inside the core. It holds 32 KiB of recently used data in blocks of 64 bytes, called cache lines.', [['cache line', 'The 64-byte block every cache level stores and moves. A cache holds copies of whole lines, never single bytes.']]);
        L.p('A cache always stores copies of whole lines. The line that holds <code>hist[123]</code> covers physical 0x1a3f7ce40 to 0x1a3f7ce7f: <code>hist[120]</code> to <code>hist[127]</code>.');
        L.p('If that line is in the L1d, a hit, the load has its value 4 cycles after it asked. If not, a miss, the L1d asks the next level and the load waits.', [['hit, miss', 'A hit: the line is in that cache. A miss: it is not, and the request goes to the next level.']]);
        L.p('While one miss is pending, the core keeps working. It can wait for up to 4 different missing lines at once; a small table of miss buffers tracks them.', [['miss buffer', 'One entry per missing line a cache is waiting for. A second load to the same line joins the first entry instead of asking again.']]);
        path(L, 'l1');
        L.note('other', 'Instruction bytes have their own first-level cache, the L1i, read by the front end. Everything after the L1 holds instructions and data alike.', 'Two L1s');
      } },
      { id: 'l2', title: 'The L2: bigger, and still private', body: function (L) {
        L.p('Behind the L1d each core has an L2 of 512 KiB, 16 times larger. It answers in 12 cycles.');
        L.p('In this machine the L2 keeps a copy of every line that is in its core’s L1d. A cache that keeps everything held by the cache above it is called inclusive.', [['inclusive', 'A cache that holds a copy of every line held by the smaller cache above it. The example L2 is inclusive of its L1d.']]);
        L.p('Lines move between the L2 and the L1d at 32 bytes per cycle, so a 64-byte line needs 2 cycles to cross.');
        path(L, 'l2');
      } },
      { id: 'l3', title: 'The L3: shared by all four cores', body: function (L) {
        L.p('One L3 of 4 MiB serves all four cores, in 35 cycles. A line that one core brought in can later serve any other.');
        L.p('This L3 is filled only with lines that an L2 throws out to make room. Removing a line is an eviction; a cache filled only that way is a victim cache.', [['eviction', 'Removing a line from a cache to make room for another.'], ['victim cache', 'A cache filled only with lines evicted from the level above it.']]);
        L.p('So the L3 mostly holds lines the L2s do not. The four L2s and the L3 together keep more different data than if every line were stored twice.');
        L.p('The L3 also keeps a copy of each L2’s record of which lines it holds, called shadow tags. When a core misses on a line that another core holds, the L3 knows which core to ask.', [['shadow tags', 'Copies, kept next to the L3, of the record each L2 has of which lines it holds.']]);
        path(L, 'l3');
      } },
      { id: 'fabric', title: 'The interconnect', body: function (L) {
        L.p('Below the L3, every part of the chip joins one interconnect, also called the fabric. It carries requests and data between the caches, the memory controllers and the I/O hub.', [['interconnect (fabric)', 'The on-chip network that carries requests, data and coherence messages between caches, memory controllers and the I/O hub.']]);
        L.p('It also carries the messages that keep copies consistent. When two cores hold the same line and one writes it, the other copy must be removed first. That is cache coherence, the subject of Part V.', ['coh']);
        path(L, 'fabric');
      } },
      { id: 'dram', title: 'Memory controllers and DRAM', body: function (L) {
        L.p('A load that misses in every cache ends at a memory controller. This machine has two, one for each memory channel. Consecutive lines alternate between the two channels, so both stay busy.', ['memctl', ['memory channel', 'A data bus plus a command bus from one memory controller to the memory modules on it. DDR4 channels are 64 bits wide.']]);
        L.p('The controller turns the request into DRAM commands. The line comes back as one burst: 8 transfers of 8 bytes, 64 bytes in all.', [['burst', 'One DDR4 read: 8 transfers of 8 bytes on the 64-bit bus, exactly one cache line.']]);
        L.p('DRAM is slow to start and fast once started. The first byte takes about 90 ns, about ' + App.dramCycles() + ' core cycles. After that, a DDR4-2400 channel moves 8 bytes 2,400 million times a second: 19.2 GB/s.', ['mts']);
        path(L, 'dram');
        L.note('deeper', 'Part IV opens a DRAM chip: banks, rows, commands and timings ([[ch:dram]]).');
      } },
      { id: 'devices', title: 'Devices, and a GPU', body: function (L) {
        L.p('The cores are not the only users of memory. An SSD or a network card writes incoming data straight into DRAM by DMA, without a core copying it ([[ch:share]]).', ['dma']);
        L.p('Devices connect to the chip’s I/O hub over PCI Express links. The hub turns each device’s DMA into memory requests on the interconnect, after the IOMMU has checked that the device may use that memory.', [['PCI Express (PCIe)', 'The links between the chip and devices such as SSDs and network cards. Part VI covers them.'], ['IOMMU', 'A translation and permission check for device accesses, like the MMU for cores. [[ch:io-iommu]] covers it.']]);
        L.p('Some chips also hold a GPU on the same die. It is one more client of the same interconnect and the same DRAM, so it competes with the cores for bandwidth.', ['igpu']);
        L.p('Server chips usually have no GPU of their own. A server GPU is a separate PCIe device with its own memory. Part VI covers devices, and its last two lessons cover GPUs ([[ch:gpu-mem]]).');
      } },
      { id: 'whole', title: 'The whole machine', body: function (L) {
        L.p('Here are all the blocks on one diagram. Click a block to see what it does and where the course opens it. The buttons light up the blocks one access passes through.');
        L.custom(machine, 'lx-wide');
        L.p('A load that hits in the L1d uses only the core, the TLB and the L1d. A load that misses everywhere crosses every block twice: out with the request, back with the line.');
        L.note('other', 'Real chips have the same blocks, larger and wired differently. [[ch:chips]] compares AMD, Intel and Arm designs, after Parts III to VI have explained each block.', 'Real chips');
      } }
    ],
    check: [
      { q: 'A load misses in the L1d and the L2, and hits in the L3. Which blocks did it pass through?', options: ['The TLB, the L1d, the L2 and the L3', 'The L1d and the L3', 'The TLB, every cache and a memory controller', 'Only the L3'], answer: 0, why: 'Every load is translated first, then checks each cache level in turn until one has the line. A memory controller is reached only when the L3 misses too.' },
      { q: 'Which cache does core 2 share with core 0?', options: ['Only the L3', 'The L2 and the L3', 'All of them', 'None'], answer: 0, why: 'Each core has its own L1d and L2. The single L3 serves all four cores.' },
      { q: 'How does a line get into this machine’s L3?', options: ['An L2 evicts it', 'A core loads it for the first time', 'DRAM sends it there on every miss', 'A device writes it'], answer: 0, why: 'The L3 is a victim cache: it is filled only with lines the L2s evict. A line fetched from DRAM goes to the L2 and the L1d.' },
      { q: 'An SSD writes a 4 KiB block into memory. Which blocks does the data cross?', options: ['PCIe link, I/O hub and IOMMU, interconnect, memory controller, DRAM', 'A core’s L1d, then the L2', 'The L3 first, then DRAM', 'The SSD writes the memory modules directly'], answer: 0, why: 'DMA does not involve a core. The device’s writes go over PCIe to the I/O hub, which checks them with the IOMMU and sends them across the interconnect to the memory controller.' }
    ],
    remember: [
      'A load is translated by the TLB, then checks the L1d, the L2 and the L3 in turn. It goes to DRAM only when every cache misses.',
      'The L1d and the L2 belong to one core; the L3 is shared by all four.',
      'Caches hold copies of whole 64-byte lines.',
      'Each level is larger and slower: by default 4, 12 and 35 cycles, and about ' + App.dramCycles() + ' for DRAM.',
      'An interconnect joins the caches, the memory controllers and the I/O hub. Devices and a GPU use the same DRAM.'
    ],
    sources: [['Ulrich Drepper, What Every Programmer Should Know About Memory (2007)', 'https://www.akkadia.org/drepper/cpumemory.pdf'], ['Micron, DDR4 SDRAM', 'https://www.micron.com/products/memory/dram-components/ddr4-sdram']]
  });
})();
