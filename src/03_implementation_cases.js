/* Scoped evidence, independent of model inputs and imported measurements. */
var ImplementationEvidence = (function () {
  'use strict';
  var categories = [
    'Vendor documented',
    'Academic / peer-reviewed',
    'Reputable independent measurement',
    'Locally measured',
    'Inference',
    'Teaching model',
    'Unknown / undocumented'
  ];
  var sources = {
    amd9005: [
      'AMD, EPYC 9005 architecture white paper 70353, rev. B (2025), pp. 5–8',
      'https://docs.amd.com/v/u/en-US/5th-gen-amd-epyc-processor-architecture-white-paper'
    ],
    xeon6: [
      'Intel, Xeon 6 HPC tuning guide 858491, v1.3, processor architecture',
      'https://cdrdv2-public.intel.com/858491/858491-Xeon6_HPC_Tuning_Guide_v1.3.pdf'
    ],
    neoversev3: [
      'Arm, Neoverse V3 optimization guide 110079, issue 3.0, §§2–3',
      'https://documentation-service.arm.com/static/6734eb2627eda361ad4da4f4'
    ],
    v3telemetry: [
      'Arm, Neoverse V3 telemetry specification 107905, issue 01, L2 metrics',
      'https://documentation-service.arm.com/static/66f71ac61669c0388dca6d9b'
    ],
    uops: [
      'uops.info, MOV R64,M64 measurements and operand-specific results',
      'https://uops.info/html-instr/MOV_R64_M64.html'
    ],
    uopsmethod: ['uops.info, measurement methodology', 'https://uops.info/background.html'],
    uopszen5: [
      'uops.info, Zen 5 MOV R64,M64 dependency-chain experiment',
      'https://uops.info/html-lat/ZEN5/MOV_R64_M64-Measurements.html'
    ],
    uopsarrow: [
      'uops.info, Arrow Lake-P MOV R64,M64 dependency-chain experiment',
      'https://uops.info/html-lat/ARL-P/MOV_R64_M64-Measurements.html'
    ],
    lioncove: [
      'Chester Lam, Chips and Cheese, Analyzing Lion Cove’s Memory Subsystem (6 Jan 2025)',
      'https://chipsandcheese.com/p/analyzing-lion-coves-memory-subsystem'
    ],
    takeaway: [
      'Lipp et al., Take A Way, ACM ASIA CCS 2020, §§3–4 and test-platform table',
      'https://misc0110.net/files/takeaway.pdf'
    ]
  };
  var cases = [
    {
      id: 'amd',
      title: 'AMD EPYC 9005 · Zen 5 chiplets',
      kind: categories[0],
      generation: 'EPYC 9005, Zen 5 CCD variant (2024)',
      scope:
        'Server package topology; Zen 5c has a different core grouping. Two CCDs are drawn as an example, not a SKU count.',
      source: 'amd9005',
      fact: 'A Zen 5 CCD groups up to eight cores around a shared 32 MiB L3; each core has a private 1 MiB L2. CCDs connect to an I/O die containing the memory controllers.',
      choice: 'An LLC sharing domain and a memory-controller attachment are different boundaries.',
      prediction:
        'Hypothesis: changing core/first-touch placement can change latency and contention. This diagram does not predict a numeric penalty or equate a CCD with an OS NUMA node.',
      experiment:
        'Inspect Linux cache sharing masks and NUMA nodes, then run matched dependent-load and loaded-memory cases. Retain NPS/firmware, placement and DIMM context.',
      limits:
        'No queue capacities, arbitration, address hash or cache-inclusion policy are asserted.',
      nodes: [
        {
          x: 20,
          y: 30,
          w: 300,
          h: 96,
          lines: ['Zen 5 CCD · example A', 'cores + private L2', 'shared L3 domain']
        },
        {
          x: 420,
          y: 30,
          w: 300,
          h: 96,
          lines: ['Zen 5 CCD · example B', 'cores + private L2', 'shared L3 domain']
        },
        { x: 220, y: 182, w: 300, h: 70, lines: ['I/O die', 'memory controllers'] },
        { x: 220, y: 310, w: 300, h: 50, lines: ['DDR5 channels · count is SKU-specific'] }
      ],
      edges: [
        [170, 126, 310, 182],
        [570, 126, 430, 182],
        [370, 252, 370, 310]
      ]
    },
    {
      id: 'intel',
      title: 'Intel Xeon 6 P-cores · Granite Rapids',
      kind: categories[0],
      generation: 'Xeon 6 P-cores / Granite Rapids (2024)',
      scope:
        'Compute-die / I/O-die split in the cited HPC guide. Two compute dies illustrate the 6700-series arrangement; other series differ.',
      source: 'xeon6',
      fact: 'Compute dies contain cores, LLC, mesh interconnect and memory controllers. I/O dies carry interfaces including UPI, PCIe and CXL.',
      choice:
        'Memory controllers attach to compute dies rather than the central memory I/O die shown in the AMD case.',
      prediction:
        'Hypothesis: memory placement and compute-die locality matter. Mesh hops and sub-NUMA configuration require platform-specific evidence before assigning a cost.',
      experiment:
        'Record NUMA configuration and first touch; compare matching single-thread latency and loaded-memory placements. A shared ISA cannot remove a topology difference.',
      limits:
        'This is not a router-level mesh model or a claim about LLC inclusion, replacement or undocumented buffers.',
      nodes: [
        {
          x: 20,
          y: 30,
          w: 330,
          h: 126,
          lines: [
            'Compute die · example A',
            'cores / private caches / LLC',
            'mesh + memory controllers'
          ]
        },
        {
          x: 390,
          y: 30,
          w: 330,
          h: 126,
          lines: [
            'Compute die · example B',
            'cores / private caches / LLC',
            'mesh + memory controllers'
          ]
        },
        { x: 20, y: 216, w: 330, h: 50, lines: ['DDR5 attachment'] },
        { x: 390, y: 216, w: 330, h: 50, lines: ['DDR5 attachment'] },
        { x: 200, y: 316, w: 340, h: 50, lines: ['I/O dies · UPI / PCIe / CXL'] }
      ],
      edges: [
        [185, 156, 185, 216],
        [555, 156, 555, 216],
        [185, 156, 300, 316],
        [555, 156, 440, 316]
      ]
    },
    {
      id: 'arm',
      title: 'Arm Neoverse V3 · core versus SoC',
      kind: categories[0],
      generation: 'Neoverse V3, optimization guide issue 3.0 (2024)',
      scope: 'The documented core IP, not every Arm server or a particular licensed SoC.',
      source: 'neoversev3',
      fact: 'V3 separates instruction and data L1 caches and uses a private unified L2. Its out-of-order pipeline translates instructions into internal operations.',
      choice: 'A core manual and a complete server memory topology describe different scopes.',
      prediction:
        'Hypothesis: instruction, data and table-walk demand can interact at unified levels. The SoC’s LLC, coherence fabric and memory attachments need separate documentation.',
      experiment:
        'Inspect the actual Linux host’s cache domains and pages. V3 telemetry defines L2 metrics over the unified cache; check event semantics before calling one a data-only miss rate.',
      limits:
        'No external LLC size, vendor SoC topology, queue capacity or measured latency is supplied.',
      nodes: [
        { x: 30, y: 30, w: 300, h: 66, lines: ['Instruction L1'] },
        { x: 410, y: 30, w: 300, h: 66, lines: ['Data L1'] },
        { x: 210, y: 158, w: 320, h: 66, lines: ['Private unified L2'] },
        {
          x: 120,
          y: 286,
          w: 500,
          h: 80,
          unknown: true,
          lines: [
            'External SoC integration · outside this core guide',
            'LLC / fabric / memory: consult the actual SoC'
          ]
        }
      ],
      edges: [
        [180, 96, 300, 158],
        [560, 96, 440, 158],
        [370, 224, 370, 286]
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
      'Address-base dependency to destination register; core cycles per instruction. Not DRAM latency or a complete cache-latency sweep.',
    method:
      'nanoBench dependency chains subtract the documented chain cost. See the generated assembly and raw counters for each experiment.',
    limits:
      'The linked summaries identify microarchitectures, not exact CPU SKUs or complete platform conditions. Values are directly reported within one source/method; they do not establish whole-system performance or a portable simulation default.',
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
    scope: 'Workload cache/PMU analysis, not matching native kernels in this lab.',
    models: ['Intel Core Ultra 9 285K · Lion Cove', 'AMD Ryzen 9 9900X · Zen 5'],
    conditions: ['2 × 24 GB DDR5-8000', '2 × 32 GB DDR5-5600'],
    fact: 'The analysis uses Intel retired-load sources and AMD demand L1D misses, which can include wrong-path activity. The populations differ.',
    limits:
      'Do not ratio these event counts or attribute a cross-platform DRAM difference to a core design: the DIMMs and measurement populations differ. The author’s architectural explanation is interpretation, distinct from the reported observations.'
  };
  return {
    categories: categories,
    sources: sources,
    cases: cases,
    instruction: instruction,
    counterCase: counterCase,
    reviewed: '2026-10-06'
  };
})();
if (typeof App !== 'undefined') App.Implementations = ImplementationEvidence;
if (typeof module !== 'undefined') module.exports = ImplementationEvidence;
