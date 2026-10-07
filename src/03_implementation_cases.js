/* Real server designs used as examples in chapter 09. Every number here has a source in
   `sources`; the lab's own simulations never read these values. */
var ImplementationEvidence = (function () {
  'use strict';
  /* How sure a statement is. Shown as small labels across the lab. */
  var categories = [
    'Vendor docs',
    'Peer-reviewed',
    'Published measurement',
    'Your machine',
    'Inference',
    'Simulation',
    'Not published'
  ];
  var sources = {
    amd9005: [
      'AMD, 5th Gen EPYC architecture white paper',
      'https://docs.amd.com/v/u/en-US/5th-gen-amd-epyc-processor-architecture-white-paper'
    ],
    zen5hc: [
      'AMD, Zen 5 at Hot Chips 2024',
      'https://www.hc2024.hotchips.org/assets/program/conference/day2/24_HC2024.AMD.Cohen.Subramony.final.pdf'
    ],
    epyc5suse: [
      'SUSE, tuning guide for AMD EPYC 9005',
      'https://documentation.suse.com/sbp/tuning-performance/single-html/SBP-AMD-EPYC-5-SLES15SP6/'
    ],
    xeon6: [
      'Intel, Xeon 6 with P-cores tuning guide for HPC (858491)',
      'https://www.intel.com/content/www/us/en/content-details/858491/intel-xeon-6-with-p-cores-configuration-and-tuning-guide-for-hpc-applications.html'
    ],
    xeon6np: [
      'The Next Platform, Xeon 6 6900P launch',
      'https://www.nextplatform.com/2024/09/24/intel-shoots-granite-rapids-xeon-6-into-the-datacenter/'
    ],
    redwood: [
      'Chips and Cheese, Intel’s Redwood Cove',
      'https://chipsandcheese.com/p/intels-redwood-cove-baby-steps-are-still-steps'
    ],
    ddio: [
      'Intel, DDIO analysis and monitoring',
      'https://www.intel.com/content/www/us/en/developer/articles/technical/ddio-analysis-performance-monitoring.html'
    ],
    neoversev3: [
      'Arm, Neoverse V3 software optimization guide',
      'https://documentation-service.arm.com/static/6734eb2627eda361ad4da4f4'
    ],
    v3cache: [
      'Jiajie Chen, Neoverse V3 microarchitecture notes',
      'https://jia.je/hardware/2026/06/13/arm-neoverse-v3/index.md'
    ],
    cssv3: [
      'Arm, Neoverse CSS V3',
      'https://arm.com/products/neoverse-compute-subsystems/css-v3'
    ],
    grace: [
      'NVIDIA, Grace performance tuning guide',
      'https://docs.nvidia.com/dccpu/grace-perf-tuning-guide/index.html'
    ],
    v3telemetry: [
      'Arm, Neoverse V3 telemetry specification (L2 metrics)',
      'https://documentation-service.arm.com/static/66f71ac61669c0388dca6d9b'
    ],
    moesi: [
      'AMD64 Architecture Programmer’s Manual, vol. 2 (MOESI)',
      'https://web.archive.org/web/20170619232736/http://developer.amd.com/wordpress/media/2012/10/24593_APM_v21.pdf#page=217'
    ],
    mesif: [
      'Goodman and Hum, MESIF (2009)',
      'https://www.cs.auckland.ac.nz/~goodman/TechnicalReports/MESIF-2009.pdf'
    ],
    chi: ['gem5, AMBA CHI states', 'https://www.gem5.org/documentation/general_docs/ruby/CHI/'],
    uops: [
      'uops.info, MOV R64, M64',
      'https://uops.info/html-instr/MOV_R64_M64.html'
    ],
    uopsmethod: ['uops.info, how it measures', 'https://uops.info/background.html'],
    uopszen5: [
      'uops.info, Zen 5 dependency chain',
      'https://uops.info/html-lat/ZEN5/MOV_R64_M64-Measurements.html'
    ],
    uopsarrow: [
      'uops.info, Arrow Lake-P dependency chain',
      'https://uops.info/html-lat/ARL-P/MOV_R64_M64-Measurements.html'
    ],
    lioncove: [
      'Chester Lam, Chips and Cheese, Lion Cove’s memory subsystem (2025)',
      'https://chipsandcheese.com/p/analyzing-lion-coves-memory-subsystem'
    ],
    takeaway: [
      'Lipp et al., Take A Way (ACM AsiaCCS 2020)',
      'https://misc0110.net/files/takeaway.pdf'
    ]
  };
  /* Side-by-side comparison for chapter 09. Rows: [label, example, AMD, Intel, Arm]. */
  var comparison = {
    columns: [
      'This lab’s example',
      'AMD EPYC 9005 · Zen 5',
      'Intel Xeon 6900P · P-cores',
      'Arm Neoverse V3 · CSS V3'
    ],
    rows: [
      ['L1 data cache', '32 KiB, 8-way', '48 KiB, 12-way', '48 KiB', '64 KiB, 4-way'],
      ['L1 instruction cache', 'not sized', '32 KiB, 8-way', '64 KiB', '64 KiB, 4-way'],
      ['Private L2 per core', '512 KiB, 8-way', '1 MiB, 16-way', '2 MiB', '2 or 3 MiB'],
      [
        'Shared last-level cache',
        '4 MiB L3 for 4 cores; victim cache',
        '32 MiB L3 per 8-core chiplet (CCD); filled from L2 evictions',
        'L3 slices on every compute die; up to 504 MB per socket',
        'Chip vendor’s choice, on the CMN S3 mesh'
      ],
      [
        'Coherence protocol',
        'MOESI',
        'MOESI',
        'MESIF family (adds a Forward state)',
        'AMBA CHI: UC, UD, SC, SD, I'
      ],
      [
        'Cores reach memory through',
        'One shared interconnect',
        'An Infinity Fabric link from each CCD to one central I/O die',
        'A mesh on each compute die, which has its own memory controllers',
        'The CMN S3 coherent mesh'
      ],
      [
        'Memory',
        '2 × DDR4-2400',
        '12 × DDR5, all on the I/O die',
        '12 × DDR5-6400 (or MRDIMM-8800), 4 on each compute die',
        'Up to 12 × DDR5 or LPDDR5'
      ],
      [
        'Cores per socket',
        '4',
        'Up to 128 (192 with the denser Zen 5c)',
        'Up to 128',
        'Up to 64 per CSS V3 die; chiplets for more'
      ]
    ],
    sources: [
      'zen5hc',
      'epyc5suse',
      'xeon6',
      'xeon6np',
      'redwood',
      'v3cache',
      'cssv3',
      'moesi',
      'mesif',
      'chi'
    ]
  };
  /* Each case: a schematic (nodes in a 740-wide viewBox) plus four short texts.
     Node fields: x y w h, lines (first one bold), optional cls, unknown, and
     cells: {cols, rows, x, y, w, h, label, cls} for a grid of small boxes inside. */
  var cases = [
    {
      id: 'amd',
      title: 'AMD EPYC 9005 · Zen 5',
      kind: categories[0],
      generation: 'EPYC 9005 “Turin”, Zen 5 cores (2024)',
      source: 'amd9005',
      sources: ['amd9005', 'zen5hc', 'epyc5suse'],
      choice: 'Eight cores share one L3 on each chiplet, and all memory sits behind one central I/O die.',
      fact: 'Each core complex die (CCD) has eight Zen 5 cores. Every core has its own 1 MiB L2, and the eight share a 32 MiB L3 that is filled with lines the L2s evict. Up to 16 CCDs connect, each over its own Infinity Fabric link, to one I/O die that holds all 12 DDR5 memory controllers and the PCIe and CXL lanes. The denser Zen 5c version puts 16 cores on a CCD.',
      prediction: 'Two cores on the same CCD share an L3; cores on different CCDs don’t, so data they share travels through the I/O die. By default (NPS1) memory is interleaved over all 12 channels as one pool; NPS2 or NPS4 split the socket into NUMA nodes.',
      experiment: 'On Linux, read /sys/devices/system/cpu/cpu0/cache/index3/shared_cpu_list to see which CPUs share an L3. Then run the atomic-sharing benchmark with both threads on one CCD, and again on two.',
      scope: 'Two of up to 16 CCDs are drawn. Not to scale.',
      limits: 'Queue sizes, address hashing and fabric arbitration are not published.',
      nodes: [
        {
          x: 14,
          y: 14,
          w: 340,
          h: 168,
          cls: 'a2b',
          lines: ['CCD · 8 Zen 5 cores'],
          cells: { cols: 4, rows: 2, x: 28, y: 46, w: 312, h: 76, label: 'core + 1 MiB L2', cls: 'a3b' }
        },
        { x: 28, y: 132, w: 312, h: 38, cls: 'box', lines: ['32 MiB L3 · shared by the 8 cores'] },
        {
          x: 386,
          y: 14,
          w: 340,
          h: 168,
          cls: 'a2b',
          lines: ['CCD · 8 Zen 5 cores'],
          cells: { cols: 4, rows: 2, x: 400, y: 46, w: 312, h: 76, label: 'core + 1 MiB L2', cls: 'a3b' }
        },
        { x: 400, y: 132, w: 312, h: 38, cls: 'box', lines: ['32 MiB L3 · shared by the 8 cores'] },
        {
          x: 14,
          y: 234,
          w: 712,
          h: 70,
          cls: 'a4b',
          lines: ['I/O die', 'Infinity Fabric · 12 DDR5 memory controllers · PCIe 5 and CXL']
        },
        { x: 14, y: 336, w: 400, h: 40, cls: 'sunk', lines: ['12 × DDR5 channels'] },
        { x: 446, y: 336, w: 280, h: 40, cls: 'sunk', lines: ['PCIe / CXL devices'] }
      ],
      edges: [
        [184, 182, 184, 234, 'Infinity Fabric link'],
        [556, 182, 556, 234, 'Infinity Fabric link'],
        [214, 304, 214, 336],
        [586, 304, 586, 336]
      ]
    },
    {
      id: 'intel',
      title: 'Intel Xeon 6 · P-cores',
      kind: categories[0],
      generation: 'Xeon 6 6900P “Granite Rapids”, Redwood Cove P-cores (2024)',
      source: 'xeon6',
      sources: ['xeon6', 'xeon6np', 'redwood', 'ddio'],
      choice: 'The memory controllers sit on the compute dies, next to the cores, instead of on a separate I/O die.',
      fact: 'A Xeon 6900P has three compute dies and two I/O dies. Each compute die holds P-cores with 2 MiB of private L2, a share of the L3, and four DDR5 channels, all joined by a mesh. One socket has up to 128 cores, up to 504 MB of L3, and 12 DDR5-6400 channels (or MRDIMMs at 8800 MT/s). The I/O dies carry PCIe 5.0, CXL 2.0 and UPI links to the other socket.',
      prediction: 'Each compute die is closest to its own memory. In sub-NUMA clustering mode (SNC3), Linux shows one NUMA node per compute die, and keeping a thread’s memory on its own die lowers latency. Intel’s DDIO also lets network and storage devices write incoming data straight into the L3.',
      experiment: 'Bind a thread and its memory to the same node with numactl, then to different nodes, and compare the memory benchmark in SNC3 mode and in the default mode.',
      scope: 'The mesh is drawn as a grid of tiles. Not to scale.',
      limits: 'Mesh routing, L3 slice hashing and queue sizes are not published.',
      nodes: [
        {
          x: 14,
          y: 14,
          w: 228,
          h: 176,
          cls: 'a2b',
          lines: ['Compute die'],
          cells: { cols: 3, rows: 3, x: 26, y: 44, w: 204, h: 96, label: 'core · L2 · L3', cls: 'a3b' }
        },
        { x: 26, y: 148, w: 204, h: 32, cls: 'box', lines: ['mesh · 4 DDR5 controllers'] },
        {
          x: 256,
          y: 14,
          w: 228,
          h: 176,
          cls: 'a2b',
          lines: ['Compute die'],
          cells: { cols: 3, rows: 3, x: 268, y: 44, w: 204, h: 96, label: 'core · L2 · L3', cls: 'a3b' }
        },
        { x: 268, y: 148, w: 204, h: 32, cls: 'box', lines: ['mesh · 4 DDR5 controllers'] },
        {
          x: 498,
          y: 14,
          w: 228,
          h: 176,
          cls: 'a2b',
          lines: ['Compute die'],
          cells: { cols: 3, rows: 3, x: 510, y: 44, w: 204, h: 96, label: 'core · L2 · L3', cls: 'a3b' }
        },
        { x: 510, y: 148, w: 204, h: 32, cls: 'box', lines: ['mesh · 4 DDR5 controllers'] },
        { x: 14, y: 222, w: 228, h: 40, cls: 'sunk', lines: ['4 × DDR5'] },
        { x: 256, y: 222, w: 228, h: 40, cls: 'sunk', lines: ['4 × DDR5'] },
        { x: 498, y: 222, w: 228, h: 40, cls: 'sunk', lines: ['4 × DDR5'] },
        { x: 14, y: 300, w: 344, h: 70, cls: 'a4b', lines: ['I/O die', 'PCIe 5.0 · CXL 2.0 · UPI'] },
        { x: 382, y: 300, w: 344, h: 70, cls: 'a4b', lines: ['I/O die', 'PCIe 5.0 · CXL 2.0 · UPI'] }
      ],
      edges: [
        [128, 190, 128, 222],
        [370, 190, 370, 222],
        [612, 190, 612, 222],
        [242, 102, 256, 102],
        [484, 102, 498, 102],
        [186, 262, 186, 300, 'dies linked on the package'],
        [554, 262, 554, 300]
      ]
    },
    {
      id: 'arm',
      title: 'Arm Neoverse V3',
      kind: categories[0],
      generation: 'Neoverse V3 core and the Neoverse CSS V3 reference design (2024)',
      source: 'neoversev3',
      sources: ['neoversev3', 'v3cache', 'cssv3', 'v3telemetry', 'grace'],
      choice: 'Arm designs the core and a reference system; each chip vendor decides the rest.',
      fact: 'A Neoverse V3 core has 64 KiB instruction and data L1 caches and a private 2 or 3 MiB L2. Arm’s CSS V3 reference design joins up to 64 of these cores on a CMN S3 coherent mesh, with up to 12 DDR5 or LPDDR5 channels and 64 lanes of PCIe 5 or CXL, and it supports chiplets. The shared cache, the memory type and the socket links are each chip vendor’s choice.',
      prediction: 'Two Arm servers with the same core can have very different memory systems. For example, NVIDIA’s Grace Superchip joins two 72-core Neoverse V2 chips over NVLink-C2C, so each chip is its own NUMA node. Compare system caches, memory channels and NUMA layout before comparing cores.',
      experiment: 'On the Arm machine you test, read cache sizes and sharing from /sys/devices/system/cpu/cpu0/cache, and the NUMA layout from numactl --hardware.',
      scope: 'The system part is Arm’s reference design; real chips differ.',
      limits: 'Shared-cache size and memory attachment depend on the chip, not the core.',
      nodes: [
        {
          x: 14,
          y: 14,
          w: 712,
          h: 120,
          cls: 'a2b',
          lines: [
            'Up to 64 Neoverse V3 cores on one CSS V3 die',
            'each core: 64 KiB L1i + 64 KiB L1d and a private 2 or 3 MiB L2'
          ],
          cells: {
            cols: 8,
            rows: 1,
            x: 28,
            y: 64,
            w: 684,
            h: 56,
            label: 'V3 core',
            cls: 'a3b'
          }
        },
        {
          x: 14,
          y: 168,
          w: 712,
          h: 66,
          cls: 'a4b',
          lines: ['CMN S3 coherent mesh', 'any shared system cache is the chip vendor’s choice']
        },
        { x: 14, y: 270, w: 300, h: 50, cls: 'sunk', lines: ['Up to 12 × DDR5 / LPDDR5'] },
        { x: 334, y: 270, w: 190, h: 50, cls: 'sunk', lines: ['64 × PCIe 5 / CXL'] },
        {
          x: 544,
          y: 270,
          w: 182,
          h: 50,
          cls: 'sunk',
          unknown: true,
          lines: ['Die-to-die links', '(chiplets)']
        },
        {
          x: 14,
          y: 342,
          w: 712,
          h: 36,
          cls: 'sunk',
          unknown: true,
          lines: ['Real chips choose their own cache, memory and socket design']
        }
      ],
      edges: [
        [370, 134, 370, 168, 'CHI'],
        [164, 234, 164, 270],
        [429, 234, 429, 270],
        [635, 234, 635, 270]
      ]
    }
  ];
  var instruction = {
    kind: categories[2],
    source: 'uops',
    methodSource: 'uopsmethod',
    reported: true,
    instruction: 'MOV R64,M64',
    scope:
      'Load-to-use latency when each load’s address comes from the previous load, in core cycles, for L1 hits. This is not memory latency.',
    method:
      'Measured with nanoBench dependency chains. The linked pages show the exact code and raw counters.',
    limits:
      'uops.info names the microarchitecture, not the exact CPU model, so read these as per-core numbers, not whole-system performance.',
    rows: [
      {
        microarchitecture: 'AMD Zen 5',
        cpu_model: null,
        cpu_model_reason: 'Exact SKU not specified in the linked measurement summary.',
        latency_cycles: 4,
        source: 'uopszen5'
      },
      {
        microarchitecture: 'Intel Arrow Lake-P',
        cpu_model: null,
        cpu_model_reason: 'Exact SKU not specified in the linked measurement summary.',
        latency_cycles: 4,
        source: 'uopsarrow'
      }
    ]
  };
  var counterCase = {
    kind: categories[2],
    source: 'lioncove',
    reported: true,
    scope: 'A workload analysis using each CPU’s own performance counters, not this lab’s benchmarks.',
    models: ['Intel Core Ultra 9 285K · Lion Cove', 'AMD Ryzen 9 9900X · Zen 5'],
    conditions: ['2 × 24 GB DDR5-8000', '2 × 32 GB DDR5-5600'],
    fact: 'On Intel the article counts where retired loads were served; on AMD it counts demand L1D misses, which can include work on mispredicted paths. The two counts cover different populations.',
    limits:
      'So the two sets of counts can’t be divided into a ratio, and with different DIMMs a memory-latency gap can’t be pinned on the cores. The author’s explanations are interpretation, separate from the measurements.'
  };
  return {
    categories: categories,
    sources: sources,
    comparison: comparison,
    cases: cases,
    instruction: instruction,
    counterCase: counterCase,
    reviewed: '2026-10-07'
  };
})();
if (typeof App !== 'undefined') App.Implementations = ImplementationEvidence;
if (typeof module !== 'undefined') module.exports = ImplementationEvidence;
