/* ======================= VII.02 · Real chips: how AMD, Intel and Arm build the machine ======================= */
(function () {
  'use strict';
  var g = App.g, d = App.gloss, I = ImplementationEvidence, CS = function () { return App.CaseStudies; };
  d('chiplet', 'chiplet', 'One of several dies in one processor package. Each is a separate piece of silicon; links inside the package join them. AMD’s EPYC 9005 is built from core chiplets around one I/O die.');
  d('ccd', 'CCD', 'Core complex die: one of AMD’s core chiplets. On EPYC 9005 a CCD holds 8 Zen 5 cores and the 32 MiB L3 they share; the denser Zen 5c CCD holds 16 cores.');
  d('iodie', 'I/O die', 'The central die of an AMD EPYC package. It holds the memory controllers, the PCIe and CXL lanes and a link to every CCD, so every memory access from a CCD passes through it.');
  d('computedie', 'compute die', 'A die that holds cores. On Intel’s Xeon 6900P each of the three compute dies also holds L3 slices and four DDR5 memory channels.');
  d('mesh', 'mesh', 'An on-chip interconnect laid out as a grid. Each stop joins a core, an L3 slice or a memory controller to its neighbours, and requests hop from stop to stop. Intel’s Xeons and Arm’s CMN use meshes.');
  d('slice', 'L3 slice', 'One piece of an L3 that is spread over a chip. Each physical address belongs to exactly one slice, picked by a hash the vendor does not publish, so all slices together act as one cache.');
  d('cmn', 'CMN', 'Coherent Mesh Network: Arm’s mesh interconnect, which it licenses to chip makers. CMN S3 is the version in Arm’s Neoverse CSS V3 reference design.');
  d('chi', 'AMBA CHI', 'Coherent Hub Interface: Arm’s protocol for coherent requests on its interconnects. Its main line states are UC (unique clean), UD (unique dirty), SC (shared clean), SD (shared dirty) and I (invalid): the ideas of E, M, S, O and I under other names.');
  d('mesif', 'MESIF', 'The MESI states plus F (Forward). When several caches share a clean line, one copy is marked F, and only that cache answers the next request for the line. Intel described it for its multi-socket systems; current Xeons use variations of it.');
  d('ddr5', 'DDR5', 'The DRAM generation after DDR4. Each module is split into two independent 32-bit subchannels, and a read burst is 16 transfers of 4 bytes: still one 64-byte line.');
  d('mrdimm', 'MRDIMM', 'Multiplexed-rank DIMM: a DDR5 module with a buffer that reads two groups of chips at once and interleaves their data, so the channel runs faster than with ordinary modules: 8800 MT/s on Xeon 6.');
  d('lpddr', 'LPDDR5', 'Low-power DRAM, soldered next to the processor instead of plugged in as modules. Phones and laptops use it, and so do some Arm servers such as NVIDIA’s Grace.');
  d('cxl', 'CXL', 'Compute Express Link: a protocol that runs on the same wires as PCIe 5 and adds coherent memory access, so memory on a CXL card can be used as more system memory.');
  d('upi', 'UPI', 'Ultra Path Interconnect: Intel’s link between the sockets of a multi-socket server. Memory requests and coherence messages for the other socket’s memory cross it.');
  d('numa', 'NUMA node', 'A group of CPUs and the memory closest to them. Memory of another node is reachable but slower: non-uniform memory access. Linux lists the nodes in /sys/devices/system/node.');
  d('nps', 'NPS (nodes per socket)', 'An AMD EPYC firmware setting. NPS1 interleaves memory over all 12 channels as one NUMA node; NPS2 and NPS4 split the socket into 2 or 4 nodes, each with its nearest channels.');
  d('snc', 'SNC (sub-NUMA clustering)', 'An Intel Xeon firmware setting that splits a socket into several NUMA nodes. On a Xeon 6900P, SNC3 makes one node per compute die.');
  d('neoverse', 'Neoverse', 'Arm’s family of CPU cores for servers, which it licenses to chip makers. V-series cores aim at the highest speed per core; N-series cores at more cores per watt.');
  d('css', 'CSS (Neoverse Compute Subsystem)', 'A complete reference design from Arm: cores, mesh, memory and I/O controllers, verified together. A chip maker can build on it instead of assembling the parts itself.');
  App.setCategory('chiplet ccd iodie computedie mesh slice cmn ddr5 mrdimm lpddr numa nps snc', 'memory');
  App.setCategory('chi mesif', 'coh');
  App.setCategory('cxl upi', 'io');
  App.setCategory('neoverse css', 'core');

  /* Mark the vendor terms in the comparison table so each one opens its definition. */
  var MARK = [
    [/Infinity Fabric/g, function () { return g('fabric', 'Infinity Fabric'); }],
    [/I\/O die/g, function () { return g('iodie', 'I/O die'); }],
    [/compute die/g, function () { return g('computedie', 'compute die'); }],
    [/\bCCDs?\b/g, function (m) { return g('ccd', m); }],
    [/CMN S3/g, function () { return g('cmn', 'CMN S3'); }],
    [/AMBA CHI/g, function () { return g('chi', 'AMBA CHI'); }],
    [/MESIF/g, function () { return g('mesif', 'MESIF'); }],
    [/\bMOESI\b/g, function () { return g('moesi', 'MOESI'); }],
    [/MRDIMM/g, function () { return g('mrdimm', 'MRDIMM'); }],
    [/LPDDR5/g, function () { return g('lpddr', 'LPDDR5'); }],
    [/(^|[^P])DDR5/g, function (m, pre) { return pre + g('ddr5', 'DDR5'); }],
    [/victim cache/g, function () { return g('victimc', 'victim cache'); }],
    [/L3 slices/g, function () { return 'L3 ' + g('slice', 'slices'); }],
    [/\bmesh\b/g, function () { return g('mesh', 'mesh'); }],
    [/chiplet/g, function () { return g('chiplet', 'chiplet'); }],
    [/\d+-way/g, function (m) { return g('way', m); }]
  ];
  function mark(text) {
    var held = [];
    MARK.forEach(function (r) {
      text = text.replace(r[0], function () { held.push(r[1].apply(null, arguments)); return '\u0000' + (held.length - 1) + '\u0000'; });
    });
    return text.replace(/\u0000(\d+)\u0000/g, function (m, i) { return held[+i]; });
  }
  function srcList(keys) { return keys.map(function (k) { return I.sources[k]; }); }
  function caseBlock(id) {
    return function (el) {
      var c = I.cases.filter(function (x) { return x.id === id; })[0];
      CS().draw(el, c);
      CS().notes(el, c);
    };
  }

  App.lesson({
    id: 'chips', short: 'Real chips', title: 'Real chips: how AMD, Intel and Arm build the machine',
    lede: 'Three 2024 server designs next to the example machine, block by block, then one of them measured.',
    know: ['The blocks of the example machine and the path of one load ([[ch:map]]).', 'Sets and ways, and why an L1 is indexed with page-offset bits ([[ch:vm-vipt]]).', 'Victim caches and shadow tags ([[ch:hier]]); coherence states ([[ch:coh-mesi]]).', 'Devices, DMA and PCIe (Part VI).'],
    learn: ['Read a vendor’s cache and memory figures and map them onto the example machine', 'Say where each design puts its shared cache and its memory controllers', 'Measure the cache levels of a real machine, and know what a virtual machine hides'],
    sections: [
      { id: 'why', title: 'The same blocks, many more of them', body: function (L) {
        L.p('Every page so far used one small example machine: four cores, one L3, two DDR4 channels. It is small on purpose, so every structure fits on screen.');
        L.p('A server chip has the same blocks: cores with private L1 and L2 caches, a shared cache, coherence, an interconnect, memory controllers. It has many more of each, and it wires them differently.');
        L.p('This lesson puts three server designs from 2024 next to the example: AMD’s EPYC 9005, Intel’s Xeon 6900P and Arm’s Neoverse V3. Then it measures one of them.');
        L.note('careful', 'Every figure about a real chip on this page names its source. Vendors do not publish everything; where a value is not public, the page says so instead of guessing.');
      } },
      { id: 'chips', title: 'Same blocks, different sizes', body: function (L) {
        L.p('Read the table one row at a time. The first column is the example machine; the others are what each vendor documents.');
        var c = I.comparison;
        L.table([''].concat(c.columns), c.rows.map(function (r) { return [r[0]].concat(r.slice(1).map(mark)); }), { mono: false, wide: true, title: 'The example machine next to three 2024 server designs', label: 'Vendor docs', src: srcList(c.sources) });
        L.p('The first three rows are per core. All four designs give each core its own L1 and L2; only the sizes differ. A 12-way cache can keep a given line in any of 12 slots of one set.', [['way', 'One of the slots of a set. A line can be stored in any way of the one set its address picks; [[ch:vm-vipt]] shows how the address picks the set.']]);
        L.p('The shared cache differs most. AMD’s L3 belongs to one chiplet of 8 cores. Intel spreads slices of one L3 over each die. Arm leaves the shared cache to the company that builds the chip.', ['chiplet', 'slice']);
        L.p('All four keep caches coherent; they name the line states differently. The example uses MOESI, as AMD does. Intel’s MESIF adds a Forward state, and Arm’s AMBA CHI uses its own names for the same ideas.', ['mesif', 'chi']);
        L.p('Memory moved from DDR4 to DDR5. Intel also supports faster MRDIMM modules, and Arm-based chips may use soldered LPDDR5 instead.', ['ddr5', 'mrdimm', 'lpddr']);
        L.p('Two patterns stand out. AMD and Intel keep each way of the L1d at 4 KiB: 48 KiB ÷ 12 ways. So the set is still picked by page-offset bits alone, before translation finishes ([[ch:vm-vipt]]). Arm’s 64 KiB, 4-way L1d has 16 KiB per way and deals with the resulting aliases in hardware.');
        L.p('And memory sits in different places: behind one central I/O die on AMD, on every compute die on Intel, and wherever the chip maker puts it on Arm.');
      } },
      { id: 'amd', title: 'AMD EPYC 9005: chiplets around one I/O die', body: function (L) {
        L.p('An EPYC 9005 package holds up to 16 core chiplets, called CCDs, around one central I/O die.', ['ccd', 'iodie']);
        L.p('Each CCD has 8 Zen 5 cores. Every core has its own 1 MiB L2, and the 8 share a 32 MiB L3 that is filled with lines their L2s evict: a victim cache, like the example machine’s. The denser Zen 5c version puts 16 smaller cores on a CCD.');
        L.p('Each CCD has its own Infinity Fabric link to the I/O die. The I/O die holds all 12 DDR5 memory controllers and the PCIe and CXL lanes.', ['cxl']);
        L.p('Since every CCD reaches memory through the I/O die, a firmware setting, NPS, lets the owner present a socket as one NUMA node or split it into 2 or 4.', ['numa', 'nps']);
        L.custom(caseBlock('amd'));
      } },
      { id: 'intel', title: 'Intel Xeon 6900P: memory on every compute die', body: function (L) {
        L.p('A Xeon 6900P package holds three compute dies and two I/O dies.', ['computedie']);
        L.p('Each compute die holds P-cores with 2 MiB of private L2, slices of the shared L3, and four DDR5 channels, all joined by a mesh. One socket has up to 128 cores and up to 504 MB of L3.', ['mesh']);
        L.p('The memory runs at DDR5-6400, or 8800 MT/s with MRDIMMs. The I/O dies carry PCIe 5.0, CXL 2.0, and UPI links to a second socket.', ['upi']);
        L.p('In sub-NUMA clustering mode, SNC3, Linux sees one NUMA node per compute die. Intel’s DDIO also lets devices write incoming data straight into the L3 instead of DRAM.', ['snc', 'ddio']);
        L.custom(caseBlock('intel'));
      } },
      { id: 'arm', title: 'Arm Neoverse V3: a core and a reference design', body: function (L) {
        L.p('Arm sells designs, not chips. Neoverse is its family of server cores, and V3 is the fastest one of 2024.', ['neoverse']);
        L.p('A V3 core has 64 KiB instruction and data L1 caches and a private 2 or 3 MiB L2.');
        L.p('Arm’s reference design, CSS V3, joins up to 64 of these cores on a CMN S3 mesh, with up to 12 DDR5 or LPDDR5 channels and 64 lanes of PCIe 5 or CXL. It supports chiplets.', ['css', 'cmn']);
        L.p('The shared cache, the memory type and the links between chips are each chip maker’s choice. NVIDIA’s Grace Superchip, for example, joins two 72-core chips built on the previous core, V2, over its own link.', [['NVLink-C2C', 'NVIDIA’s chip-to-chip link. In a Grace Superchip it joins two CPU dies; each die and its memory is its own NUMA node.']]);
        L.custom(caseBlock('arm'));
      } },
      { id: 'measured', title: 'One of them, measured: machine C', body: function (L) {
        L.p('Some lab runs in this course come from machine C, a cloud virtual machine. Its CPU reports family 6, model 173:');
        L.out('c.facts');
        L.p('Linux’s list of Intel CPU models names model 0xAD, which is 173: Granite Rapids, the Xeon 6 with P-cores in the table.');
        L.quote('#define INTEL_GRANITERAPIDS_X\t\tIFM(6, 0xAD) /* Redwood Cove */', { code: true, label: 'Linux source', cite: 'arch/x86/include/asm/intel-family.h, Linux v6.18', src: ['Linux v6.18: arch/x86/include/asm/intel-family.h', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/include/asm/intel-family.h'] });
        L.p('The caches it reports match the Xeon 6900P column: a 48 KiB, 12-way L1d, a 2 MiB L2, and an L3 of 516096 KiB, which is 504 MiB.');
        L.out('c.caches');
        L.p('A pointer chase measures what a load really costs. Each 64-byte line holds a pointer to another line, in a random cycle, so every load’s address comes from the previous load and nothing can be fetched early.');
        L.code('for (size_t i = 0; i < hops; i++)\n    p = (void **)*p;             /* the next address is the value just loaded */', { title: 'labruns/hw/ladder.c (excerpt)' });
        L.out('c.ladder');
        L.p('Up to 48 KiB every load hits the L1d: 1.3 ns. Up to 1 MiB it hits the L2: about 4.7 ns. At 4 and 8 MiB it hits the L3: about 33 ns.');
        L.p('From 32 MiB on, a load takes 130 to 190 ns, and the figure changes from run to run. Those loads go to DRAM.');
        L.note('vm', 'The L3 reports 504 MiB, yet this virtual machine behaves as if it had only 8 to 16 MiB of it. Other virtual machines on the same host share that L3, and a hypervisor can also limit how much of it one guest may fill. From inside the guest, neither can be seen. (Inference)');
        L.p('[[ch:vm-vipt]] used the same kind of chase on machines A and B to count the ways of an L1. On any machine, read the reported sizes as a description and measure when a number matters.');
      } },
      { id: 'published', title: 'Numbers others measured', body: function (L) {
        L.p('Independent testers publish measurements too. Two are worth reading closely, for what they show and for what they cannot.');
        L.custom(function (el) { CS().published(el); });
      } },
      { id: 'history', title: 'Two older designs worth knowing', body: function (L) {
        L.p('Two details from earlier chips still explain experiments in this course.');
        L.custom(function (el) { CS().history(el); });
      } }
    ],
    check: [
      { q: 'Where are the memory controllers on an AMD EPYC 9005?', options: ['All on the central I/O die', 'One on each CCD', 'On every core', 'On the DIMMs'], answer: 0, why: 'All 12 DDR5 controllers sit on the I/O die. Every CCD reaches memory over its own Infinity Fabric link to that die.' },
      { q: 'Why do the 48 KiB L1d caches of Zen 5 and Redwood Cove have 12 ways?', options: ['So each way is 4 KiB and page-offset bits alone pick the set', 'Because 12 cores share them', 'Because DDR5 bursts are 12 transfers', 'To match a 12-entry TLB'], answer: 0, why: '48 KiB ÷ 12 = 4 KiB per way: 64 sets of 64-byte lines. The set index stays inside the 4 KiB page offset, so the lookup can start before translation ends.' },
      { q: 'On machine C a chase takes about 33 ns at 8 MiB and about 150 ns at 1 GiB. Where were those loads served?', options: ['The L3, then DRAM', 'The L2, then the L3', 'DRAM both times', 'The L1d, then the L2'], answer: 0, why: 'Its L2 holds 2 MiB, so 8 MiB is beyond the L2; 33 ns is an L3 hit. At 1 GiB nearly every line comes from DRAM.' },
      { q: 'Two Arm servers use the same Neoverse V3 core. Can their memory systems differ?', options: ['Yes: the shared cache, memory type and socket links are the chip maker’s choice', 'No: the core fixes the whole memory system', 'Only in their clock speed', 'Only if one runs a different operating system'], answer: 0, why: 'Arm licenses the core and a reference design. The company that builds the chip decides the system cache, the memory and how chips connect.' }
    ],
    remember: [
      'Real server chips have the example machine’s blocks: private L1 and L2, a shared cache, coherence, an interconnect, memory controllers. They have more of each.',
      'AMD: 8 cores and a 32 MiB victim L3 per CCD, all memory behind one I/O die. Intel: memory controllers and L3 slices on every compute die. Arm: the system design is the chip maker’s choice.',
      'A 48 KiB, 12-way L1d still has 4 KiB per way, so its set comes from the page offset.',
      'A machine’s reported cache sizes are a description. Measure when a number matters, above all in a virtual machine.'
    ],
    sources: [I.sources.amd9005, I.sources.zen5hc, I.sources.xeon6, I.sources.xeon6np, I.sources.cssv3, I.sources.v3cache, ['Linux v6.18: arch/x86/include/asm/intel-family.h', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/include/asm/intel-family.h']]
  });
})();
