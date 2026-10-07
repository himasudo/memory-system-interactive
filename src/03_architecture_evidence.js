/* What each evidence label means, and the sources the architecture labs cite. */
App.Evidence = {
  sources: {
    tso: [
      'x86-TSO: A Rigorous and Usable Programmer’s Model',
      'https://www.cl.cam.ac.uk/~pes20/weakmemory/cacm.pdf'
    ],
    intel: [
      'Intel SDM vol. 3A, memory-ordering examples',
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
      'Arm, memory management guide (101811), translation granules',
      'https://developer.arm.com/-/media/Arm%20Developer%20Community/PDF/Learn%20the%20Architecture/LearnTheArchitecture-MemoryManagement-101811_0100_00_en.pdf'
    ],
    cache: [
      'Intel, cache hierarchy changes from Xeon E5 v4 to Xeon Scalable',
      'https://www.intel.com/content/www/us/en/support/articles/000027820/processors/intel-xeon-processors.html'
    ],
    c11: [
      'C11 committee draft N1570, sections 5.1.2.4 and 7.17',
      'https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf'
    ],
    zen5: [
      'AMD, Zen 5 at Hot Chips 2024',
      'https://www.hc2024.hotchips.org/assets/program/conference/day2/24_HC2024.AMD.Cohen.Subramony.final.pdf'
    ],
    goldencove: [
      'Chips and Cheese, Golden Cove’s caches',
      'https://chipsandcheese.com/p/going-armchair-quarterback-on-golden-coves-caches'
    ],
    v3cache: [
      'Jiajie Chen, Neoverse V3 microarchitecture notes',
      'https://jia.je/hardware/2026/06/13/arm-neoverse-v3/index.md'
    ]
  },
  /* The legend on the Start page. One entry per label used in the lab. */
  labels: [
    {
      kind: 'Simulation',
      means: 'A small model with made-up sizes and timings, built to show one mechanism clearly. It copies no particular chip.'
    },
    {
      kind: 'Vendor docs',
      means: 'Stated in AMD, Intel or Arm documentation for a named product.'
    },
    {
      kind: 'Peer-reviewed',
      means: 'From a published paper, for the chips and conditions it tested.'
    },
    {
      kind: 'Published measurement',
      means: 'Measured by an independent tester, such as uops.info or Chips and Cheese, on named hardware.'
    },
    {
      kind: 'Your machine',
      means: 'Measured by the lab’s benchmarks on your own computer. Nothing is filled in until you run them.'
    },
    {
      kind: 'Inference',
      means: 'Reasoned from the facts above it, not measured or documented.'
    },
    {
      kind: 'Not published',
      means: 'The vendor hasn’t said. The lab tells you so instead of guessing a number.'
    }
  ]
};
