/* Evidence is scoped to a claim, never inferred from a vendor logo. */
App.Evidence = {
  sources: {
    family: [
      'Historical: AMD Family 17h optimization guide 55723, revision 3.01',
      'https://docs.amd.com/v/u/en-US/55723_3.01'
    ],
    tso: [
      'x86-TSO: A Rigorous and Usable Programmer’s Model',
      'https://www.cl.cam.ac.uk/~pes20/weakmemory/cacm.pdf'
    ],
    intel: [
      'Intel SDM Volume 3A, memory-ordering examples (2024 edition)',
      'https://cdrdv2-public.intel.com/812386/253668-sdm-vol-3a.pdf'
    ],
    arm: [
      'Arm: using the memory-model tool',
      'https://developer.arm.com/community/arm-community-blogs/b/architectures-and-processors-blog/posts/how-to-use-the-memory-model-tool'
    ],
    armbarrier: [
      'Arm: barriers, dependencies and acquire/release litmus tests',
      'https://developer.arm.com/community/arm-community-blogs/b/architectures-and-processors-blog/posts/generate-litmus-tests-automatically-diy7-tool'
    ],
    armmodel: [
      'AArch64 memory-model research and litmus tests',
      'https://www.cl.cam.ac.uk/~sf502/AArch64/'
    ],
    granule: [
      'Arm memory management guide 101811, translation granules',
      'https://developer.arm.com/-/media/Arm%20Developer%20Community/PDF/Learn%20the%20Architecture/LearnTheArchitecture-MemoryManagement-101811_0100_00_en.pdf'
    ],
    cache: [
      'Historical: Intel E5 v4 to Xeon Scalable cache-hierarchy changes',
      'https://www.intel.com/content/www/us/en/support/articles/000027820/processors/intel-xeon-processors.html'
    ],
    c11: [
      'C11 committee draft N1570, sections 5.1.2.4 and 7.17',
      'https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf'
    ]
  },
  claims: [
    {
      kind: 'Vendor documented',
      claim:
        'ISA contracts constrain allowed observations; they do not prescribe private queue capacities or cache latency.',
      scope:
        'The named ISA, instruction and memory attributes. The x86-64 walkthrough and AArch64 contrast retain those boundaries.',
      why: 'Choose a correctness prediction before a cycle model.',
      source: 'intel'
    },
    {
      kind: 'Academic / peer-reviewed',
      claim: 'x86-TSO provides a formal programmer-facing account of ordinary x86 memory ordering.',
      scope:
        'The cited formal model; the browser litmus engine implements a reduced illustration, not the whole model.',
      why: 'An allowed outcome is a contract question, not a cache-speed question.',
      source: 'tso'
    },
    {
      kind: 'Reputable independent measurement',
      claim:
        'Published microbenchmarks identify an instruction, operand dependency and measurement method.',
      scope:
        'Consult the published-evidence section for exact reported microarchitectures, missing SKU attribution and experimental boundaries.',
      why: 'Operand latency, memory latency and reciprocal throughput are different quantities.',
      source: null
    },
    {
      kind: 'Locally measured',
      claim: 'Native result bundles supply observations only when a real run is available.',
      scope:
        'The recorded CPU, topology, code hashes, compiler, raw trials, timing and environment. No measured values are substituted when a bundle is absent.',
      why: 'Reproduce selected experiments on your machine; compatible comparison is descriptive, not architectural truth.',
      source: null
    },
    {
      kind: 'Inference',
      claim:
        'For an access using one 8-byte pointer from an otherwise unused 64-byte line, one eighth of fetched line bytes is immediately useful.',
      scope:
        'This accounting boundary; reuse, write allocation and prefetch traffic can change it.',
      why: 'Separate useful work from transferred bytes.',
      source: null
    },
    {
      kind: 'Teaching model',
      claim:
        'Queue capacities, clock inputs, addresses and selected replacement/controller rules are explicit simulation parameters.',
      scope: 'Mechanism experiments. They are not calibrated AMD, Intel or Arm implementations.',
      why: 'Vary one finite resource to test the chosen model’s explanation.',
      source: null
    },
    {
      kind: 'Unknown / undocumented',
      claim:
        'Exact queue partitioning, address hashes and proprietary arbitration require implementation-specific evidence.',
      scope:
        'Unknown values remain absent; this lab does not infer them from a performance plateau.',
      why: 'Form a hypothesis and design a discriminating experiment rather than inventing a capacity.',
      source: null
    },
    {
      kind: 'Unknown / undocumented',
      claim:
        'A temperature or frequency snapshot does not establish thermal throttling or a causal explanation for a timing change.',
      scope: 'Read-only native telemetry; missing fields and observed changes are retained.',
      why: 'Environment changes are potential confounds, not grounds to erase measurements.',
      source: null
    },
    {
      kind: 'Unknown / undocumented',
      claim:
        'A PMU name alone does not establish which requests, speculative activity or time interval it counted.',
      scope:
        'The exact CPU event definition and collection interval; unsupported evidence is skipped with a reason.',
      why: 'Never divide a process-wide counter by a different kernel timer or compare mismatched populations.',
      source: null
    }
  ]
};
