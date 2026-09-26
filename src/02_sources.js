/* ======================= glossary sources + chapter links ======================= */
(function(){
  var W = function(t, label){ return [label || t.replace(/_/g, ' '), 'https://en.wikipedia.org/wiki/' + t, 'Wikipedia']; };
  var S = {
    agner: ['The microarchitecture of Intel, AMD and VIA CPUs', 'https://www.agner.org/optimize/microarchitecture.pdf', 'Agner Fog'],
    zen: ['AMD Zen+ microarchitecture', 'https://en.wikipedia.org/wiki/Zen%2B', 'Wikipedia'],
    zen7: ['AMD Zen: cache and TLB measurements', 'https://www.7-cpu.com/cpu/Zen.html', '7-cpu'],
    drepper: ['What Every Programmer Should Know About Memory', 'https://www.akkadia.org/drepper/cpumemory.pdf', 'Ulrich Drepper'],
    sdm: ['Intel 64 and IA-32 Software Developer Manuals', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html', 'Intel'],
    enc: ['X86-64 Instruction Encoding', 'https://wiki.osdev.org/X86-64_Instruction_Encoding', 'OSDev Wiki'],
    kpt: ['Page Tables', 'https://docs.kernel.org/mm/page_tables.html', 'Linux kernel docs'],
    kmb: ['Linux kernel memory barriers', 'https://docs.kernel.org/core-api/wrappers/memory-barriers.html', 'Linux kernel docs'],
    kthp: ['Transparent Hugepage Support', 'https://docs.kernel.org/admin-guide/mm/transhuge.html', 'Linux kernel docs'],
    knuma: ['NUMA Memory Policy', 'https://docs.kernel.org/admin-guide/mm/numa_memory_policy.html', 'Linux kernel docs'],
    kdma: ['Dynamic DMA mapping Guide', 'https://docs.kernel.org/core-api/dma-api-howto.html', 'Linux kernel docs'],
    tso: ['x86-TSO: A Rigorous and Usable Programmer\u2019s Model', 'https://www.cl.cam.ac.uk/~pes20/weakmemory/cacm.pdf', 'Sewell et al., CACM'],
    nvme: ['NVM Express specifications', 'https://nvmexpress.org/specifications/', 'NVM Express'],
    uring: ['io_uring', 'https://en.wikipedia.org/wiki/Io_uring', 'Wikipedia'],
    gccpf: ['__builtin_prefetch and other builtins', 'https://gcc.gnu.org/onlinedocs/gcc/Other-Builtins.html', 'GCC manual'],
    fabric: ['Infinity Fabric (in HyperTransport)', 'https://en.wikipedia.org/wiki/HyperTransport#Infinity_Fabric', 'Wikipedia'],
    wulf: ['Hitting the Memory Wall: Implications of the Obvious', 'https://libraopen.lib.virginia.edu/downloads/4b29b598d', 'Wulf & McKee, UVA CS'],
    boom: ['The Load/Store Unit (load queue, store queue, ordering failures)', 'https://docs.boom-core.org/en/latest/sections/load-store-unit.html', 'RISC-V BOOM core docs'],
    fc: function(i){ return [i.toUpperCase() + ' instruction reference', 'https://www.felixcloutier.com/x86/' + i, 'x86 reference (from the Intel SDM)']; }
  };
  var SRC = {
    isa: [W('Instruction_set_architecture'), S.sdm], uop: [W('Micro-operation'), S.agner], mop: [S.zen, S.agner], pc: [W('Program_counter')],
    bp: [W('Branch_predictor'), S.agner], btb: [W('Branch_target_predictor'), S.agner], ras: [W('Branch_predictor'), S.agner],
    l1i: [W('CPU_cache'), S.zen], itlb: [W('Translation_lookaside_buffer'), S.zen], fetchwin: [S.agner, S.zen, S.zen7], predecode: [S.agner, S.enc],
    decode: [W('Instruction_pipelining'), S.agner], opcache: [S.agner, S.zen], uq: [S.agner, S.zen], fusion: [S.agner],
    zx: [W('Sign_extension'), S.sdm], modrm: [S.enc, S.sdm], rex: [S.enc, S.sdm],
    rename: [W('Register_renaming')], rat: [W('Register_renaming')], crat: [W('Register_renaming')], prf: [W('Register_renaming'), W('Register_file')], freelist: [W('Register_renaming')],
    dispatch: [W('Out-of-order_execution'), S.zen], rob: [W('Re-order_buffer'), S.zen], sched: [W('Reservation_station'), W('Out-of-order_execution')],
    wakeup: [W('Tomasulo\u2019s_algorithm'.replace('\u2019', "%27"), 'Tomasulo\u2019s algorithm'), W('Out-of-order_execution')], issue: [W('Out-of-order_execution'), S.agner],
    port: [W('Execution_unit'), S.agner], alu: [W('Arithmetic_logic_unit')], agu: [W('Address_generation_unit')], bypass: [W('Operand_forwarding')],
    lsu: [W('Load%E2%80%93store_unit', 'Load\u2013store unit'), S.boom], lq: [W('Memory_disambiguation'), S.zen, S.boom], sq: [W('Memory_disambiguation'), S.zen, S.boom],
    sta: [W('Memory_disambiguation'), S.agner, S.boom], std: [W('Memory_disambiguation'), S.agner, S.boom], stlf: [W('Memory_disambiguation'), S.agner, S.boom], disamb: [W('Memory_disambiguation'), S.boom],
    retire: [W('Re-order_buffer')], commit: [W('Memory_disambiguation'), S.tso], senior: [S.tso, W('Memory_disambiguation')],
    squash: [W('Speculative_execution'), W('Branch_predictor')], mispredict: [W('Branch_predictor'), S.agner], spec: [W('Speculative_execution')],
    smt: [W('Simultaneous_multithreading')], ipc: [W('Instructions_per_cycle')], mab: [W('CPU_cache'), S.drepper],
    line: [W('CPU_cache'), S.drepper], set: [W('CPU_cache'), S.drepper], way: [W('CPU_cache'), S.drepper], tag: [W('CPU_cache')], index: [W('CPU_cache')], offset: [W('CPU_cache')],
    hit: [W('CPU_cache'), S.drepper], miss: [W('CPU_cache'), S.drepper], valid: [W('CPU_cache')], dirty: [W('Dirty_bit'), W('Cache_(computing)')],
    wbk: [W('Cache_(computing)'), S.drepper], wthru: [W('Cache_(computing)')], walloc: [W('Cache_(computing)')], rfo: [W('MESI_protocol'), S.drepper],
    evict: [W('Cache_replacement_policies')], plru: [W('Cache_replacement_policies'), W('Pseudo-LRU')], vipt: [W('CPU_cache'), S.drepper],
    incl: [W('Cache_inclusion_policy')], victimc: [W('Victim_cache'), S.zen], shadow: [S.zen], pfilter: [W('Cache_coherence'), S.zen], ccx: [S.zen],
    mlp: [W('Memory-level_parallelism')], ltu: [S.agner, S.zen7], wset: [W('Working_set')], sloc: [W('Locality_of_reference')], tloc: [W('Locality_of_reference')],
    sram: [W('Static_random-access_memory')], dramcell: [W('Dynamic_random-access_memory')],
    va: [W('Virtual_memory'), S.kpt], pa: [W('Physical_address')], page: [W('Page_(computer_memory)')], vpn: [W('Page_table'), S.kpt], pfn: [W('Page_table'), S.kpt],
    mmu: [W('Memory_management_unit')], tlb: [W('Translation_lookaside_buffer')], dtlb: [W('Translation_lookaside_buffer'), S.zen], pte: [W('Page_table'), S.kpt],
    pml4: [S.kpt, W('Page_table')], cr3: [W('Control_register'), S.sdm], walk: [W('Page_table'), S.kpt], pwc: [W('Translation_lookaside_buffer'), S.zen7],
    reach: [W('Translation_lookaside_buffer')], huge: [S.kthp, W('Page_(computer_memory)')], pcid: [W('Translation_lookaside_buffer'), S.sdm],
    pf: [W('Page_fault'), S.kpt], ftouch: [S.knuma, W('Non-uniform_memory_access')],
    fabric: [S.fabric, S.zen], umc: [W('Memory_controller')], channel: [W('Multi-channel_memory_architecture'), W('DDR4_SDRAM')], dimm: [W('DIMM'), W('Memory_rank')],
    bank: [W('Dynamic_random-access_memory'), S.drepper], row: [W('Dynamic_random-access_memory'), S.drepper], rowbuf: [W('Dynamic_random-access_memory'), W('Sense_amplifier')],
    act: [W('Synchronous_dynamic_random-access_memory'), S.drepper], tcl: [W('Memory_timings'), W('CAS_latency')], burst: [W('DDR4_SDRAM'), W('Synchronous_dynamic_random-access_memory')],
    refresh: [W('Memory_refresh')],
    pcie: [W('PCI_Express')], tlp: [W('PCI_Express')], rc: [W('Root_complex')], mmio: [W('Memory-mapped_I/O_and_port-mapped_I/O', 'Memory-mapped I/O')], bar: [W('PCI_configuration_space')],
    doorbell: [S.nvme, S.uring], dma: [W('Direct_memory_access'), S.kdma], iommu: [W('Input%E2%80%93output_memory_management_unit', 'Input\u2013output memory management unit'), S.kdma],
    iova: [S.kdma, W('Input%E2%80%93output_memory_management_unit', 'Input\u2013output memory management unit')], msix: [W('Message_Signaled_Interrupts')], nvme: [W('NVM_Express'), S.nvme], iocoh: [W('Direct_memory_access'), S.kdma],
    memtype: [W('Memory_type_range_register'), S.sdm], pat: [W('Page_attribute_table'), W('Memory_type_range_register')], wc: [W('Write_combining')], nt: [W('Write_combining'), S.drepper],
    clflush: [S.fc('clflush'), S.fc('clwb')], fence: [W('Memory_barrier'), S.kmb, S.fc('mfence')], tso: [S.tso, W('Memory_ordering')],
    coh: [W('Cache_coherence')], moesi: [W('MOESI_protocol')], st_m: [W('MOESI_protocol')], st_o: [W('MOESI_protocol')], st_e: [W('MOESI_protocol')], st_s: [W('MOESI_protocol')], st_i: [W('MOESI_protocol')],
    probe: [W('Bus_snooping'), W('Cache_coherence')], fshare: [W('False_sharing')],
    pref: [W('Cache_prefetching')], stream: [W('Cache_prefetching')], stride: [W('Cache_prefetching')], swpf: [S.gccpf, W('Cache_prefetching')], late: [W('Cache_prefetching')], pollute: [W('Cache_pollution'), W('Cache_prefetching')],
    memwall: [S.wulf, W('Random-access_memory')]
  };
  /* where each term is taught, for the "explore it" link */
  var CH = {map: ['00', 'The machine'], code: ['01', 'C \u2192 \u00b5ops'], core: ['02', 'Inside the core'], xlate: ['03', 'VA \u2192 PA'], l1d: ['04', 'L1d lookup'], hier: ['05', 'Down the hierarchy'],
            dram: ['06', 'DRAM'], stores: ['07', 'Stores'], coh: ['08', 'Coherence'], pref: ['09', 'Prefetchers'], dev: ['10', 'Devices & DMA'], e2e: ['11', 'End to end']};
  var HOME = {};
  'isa uop mop pc fetchwin predecode decode opcache fusion zx modrm rex l1i'.split(' ').forEach(function(k){ HOME[k] = 'code'; });
  'bp btb ras itlb uq rename rat crat prf freelist dispatch rob sched wakeup issue port alu agu bypass lsu lq sq sta std stlf disamb retire squash mispredict spec smt ipc mab'.split(' ').forEach(function(k){ HOME[k] = 'core'; });
  'va pa page vpn pfn mmu tlb dtlb pte pml4 cr3 walk pwc reach huge pcid pf ftouch'.split(' ').forEach(function(k){ HOME[k] = 'xlate'; });
  'line set way tag index offset hit miss valid dirty wbk wthru walloc evict plru vipt'.split(' ').forEach(function(k){ HOME[k] = 'l1d'; });
  'incl victimc shadow pfilter ccx mlp ltu wset sloc tloc sram fabric memwall'.split(' ').forEach(function(k){ HOME[k] = 'hier'; });
  'dramcell umc channel dimm bank row rowbuf act tcl burst refresh'.split(' ').forEach(function(k){ HOME[k] = 'dram'; });
  'commit senior rfo memtype pat wc nt clflush fence tso'.split(' ').forEach(function(k){ HOME[k] = 'stores'; });
  'coh moesi st_m st_o st_e st_s st_i probe fshare'.split(' ').forEach(function(k){ HOME[k] = 'coh'; });
  'pref stream stride swpf late pollute'.split(' ').forEach(function(k){ HOME[k] = 'pref'; });
  'pcie tlp rc mmio bar doorbell dma iommu iova msix nvme iocoh'.split(' ').forEach(function(k){ HOME[k] = 'dev'; });
  App.SRC = SRC; App.TERM_HOME = HOME; App.CH_LABEL = CH;
})();
