/* ======================= Part VI · Devices and I/O, lessons 7–9 ======================= */
(function () {
  'use strict';
  var d = App.gloss;
  d('ddio', 'DDIO', 'Intel Data Direct I/O: on Xeon processors, device writes go into the last-level cache instead of DRAM, so the CPU finds fresh I/O data in the cache.');
  d('bounce', 'bounce buffer', 'A buffer in memory a device can reach. When a device cannot reach the real buffer, the kernel copies the data through a bounce buffer (swiotlb) on the way in or out.');
  d('iotlb', 'IOTLB', 'The IOMMU’s cache of translations from IOVAs to physical addresses, separate from the CPU’s TLBs. Unmapping a page must invalidate it too.');
  d('vfio', 'VFIO', 'The Linux framework that hands a whole device to a user program or a virtual machine, with an IOMMU fencing its DMA to that program’s memory.');
  d('ioapic', 'I/O APIC', 'The interrupt controller that turns interrupt pins into messages for the CPUs’ local APICs. MSI and MSI-X bypass it.');
  d('vector', 'interrupt vector', 'The number, 0 to 255 on x86, that selects which entry of the interrupt descriptor table the CPU runs. An MSI carries it in its data.');
  d('affinity', 'interrupt affinity', 'The set of CPUs an interrupt may be delivered to, in /proc/irq/N/smp_affinity_list; effective_affinity_list shows the one actually used.');
  d('poll', 'polling', 'Checking a completion queue in a loop instead of waiting for an interrupt. It costs CPU time but avoids the interrupt and the wake-up.');

  /* ---------- VI.07 ---------- */
  App.lesson({
    id: 'io-coherence', short: 'DMA and the caches', title: 'DMA and the caches',
    lede: 'A device writes memory behind the CPU caches’ back. On x86 the hardware keeps them consistent; elsewhere the DMA API cleans and invalidates cache lines around every transfer.',
    know: ['The device writes data into RAM by DMA ([[ch:io-dma]]).', 'Caches keep copies of memory lines, and coherence keeps the copies consistent between cores ([[ch:coh]]).', 'A streaming DMA mapping names a direction ([[ch:io-dma]]).'],
    learn: ['Explain why x86 drivers need no cache maintenance for DMA', 'Say what the DMA API does for a device that is not coherent', 'Explain bounce buffers, and read why machine B has none', 'Say where DMA data lands: DRAM or the cache'],
    sections: [
      { id: 'x86', title: 'x86: devices are coherent', body: function (L) {
        L.p('A device writing memory meets two hazards. A cache may still hold the old line, and when the device reads, a cache may hold newer data than DRAM.', ['iocoh']);
        L.p('On x86 the hardware handles both: device reads and writes are checked against the caches, as another core’s would be ([[ch:coh]]). Linux encodes that in one function:');
        L.quote('#if defined(CONFIG_ARCH_HAS_SYNC_DMA_FOR_DEVICE) || \\\n\tdefined(CONFIG_ARCH_HAS_SYNC_DMA_FOR_CPU) || \\\n\tdefined(CONFIG_ARCH_HAS_SYNC_DMA_FOR_CPU_ALL)\nextern bool dma_default_coherent;\nstatic inline bool dev_is_dma_coherent(struct device *dev)\n{\n\treturn dev->dma_coherent;\n}\n#else\n#define dma_default_coherent true\n\nstatic inline bool dev_is_dma_coherent(struct device *dev)\n{\n\treturn true;\n}\n#endif', { cite: 'include/linux/dma-map-ops.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('arch/x86/Kconfig selects none of those three options, so on x86 every device counts as coherent. The DMA API then does nothing to the caches at all.');
        L.p('Coherent still means ordered by the driver. A driver writes a descriptor, then publishes it, with a barrier between, exactly as between two cores ([[ch:io-rings]]).');
      } },
      { id: 'arm', title: 'Arm: the DMA API does the work', body: function (L) {
        L.p('Some Arm systems have devices that do not snoop the caches. For those, the streaming DMA calls maintain the cache by hand:');
        L.quote('\tswiotlb_sync_single_for_device(dev, paddr, size, dir);\n\n\tif (!dev_is_dma_coherent(dev))\n\t\tarch_sync_dma_for_device(paddr, size, dir);', { cite: 'kernel/dma/direct.h, dma_direct_sync_single_for_device(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.quote('void arch_sync_dma_for_device(phys_addr_t paddr, size_t size,\n\t\t\t      enum dma_data_direction dir)\n{\n\tunsigned long start = (unsigned long)phys_to_virt(paddr);\n\n\tdcache_clean_poc(start, start + size);\n}\n\nvoid arch_sync_dma_for_cpu(phys_addr_t paddr, size_t size,\n\t\t\t   enum dma_data_direction dir)\n{\n\tunsigned long start = (unsigned long)phys_to_virt(paddr);\n\n\tif (dir == DMA_TO_DEVICE)\n\t\treturn;\n\n\tdcache_inval_poc(start, start + size);\n}', { cite: 'arch/arm64/mm/dma-mapping.c, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.table(['Moment', 'arm64 does', 'So that'], [
          ['before the device runs (map)', 'clean: write dirty lines back to memory', 'the device reads what the CPU wrote'],
          ['after the device wrote (unmap, FROM_DEVICE)', 'invalidate: drop cached copies', 'the CPU reads what the device wrote, not stale lines']
        ], { mono: false });
        L.p('The direction in a streaming mapping is what lets the kernel skip half of this. It also explains the rule that the CPU must not touch a buffer between map and unmap: a line it pulled in would be thrown away.');
      } },
      { id: 'bounce', title: 'Bounce buffers', body: function (L) {
        L.p('Some devices cannot reach all of memory, for example those that use only 32-bit addresses. The DMA API then copies the data through a buffer they can reach, a swiotlb bounce buffer:', ['bounce']);
        L.quote('\t/* don\'t initialize swiotlb if iommu=off (no_iommu=1) */\n\tif (!no_iommu && max_possible_pfn > MAX_DMA32_PFN)\n\t\tx86_swiotlb_enable = true;', { cite: 'arch/x86/kernel/pci-dma.c, pci_swiotlb_detect(), Linux v6.18', label: 'Linux source', code: true });
        L.p('Machine B has RAM above 4 GiB, so the kernel decided to set up bounce buffering, and said so. Then it allocated nothing:');
        L.out('io.iommu', { lines: [1, 4, 5] });
        L.out('io.noforce');
        L.quote('noforce -- Never use bounce buffers (for debugging)', { cite: 'Documentation/admin-guide/kernel-parameters.txt, swiotlb=, Linux v6.18', label: 'Linux source', code: true });
        L.p('With <code>swiotlb=noforce</code> the pool is never allocated, and “No low mem” is what the kernel prints for a pool of size 0. The statistics directory stays empty for the same reason:');
        L.out('io.swiotlb');
        L.quote('\tmem->debugfs = debugfs_create_dir(dirname, io_tlb_default_mem.debugfs);\n\tif (!mem->nslabs)\n\t\treturn;', { cite: 'kernel/dma/swiotlb.c, swiotlb_create_debugfs_files(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('Nothing is lost: virtio here bypasses the DMA API anyway ([[ch:io-dma]]). Bounce buffers matter on real hardware with limited devices, and in confidential virtual machines, where the host may only read memory the guest shares.');
      } },
      { id: 'where', title: 'Where DMA data lands', body: function (L) {
        L.p('Coherence decides correctness, not location. On many Intel servers, device writes go into the last-level cache rather than DRAM:', ['ddio']);
        L.quote('Intel® DDIO is available in current Intel® Xeon® processors. It enables I/O devices such as network interface controllers (NICs), disk controllers, and other peripherals to access the CPU\'s last-level cache (LLC). The Intel® DDIO feature is transparent to software, meaning that software does not need to be modified to utilize it.', { cite: 'Intel, “Introduction to Intel® Data Direct I/O Technology (Intel® DDIO) Analysis with Performance Monitoring”', label: 'Vendor docs', src: ['intel.com developer article', 'https://www.intel.com/content/www/us/en/developer/articles/technical/ddio-analysis-performance-monitoring.html'] });
        L.p('Without it, a program reading freshly DMA’d data misses in its caches and reads DRAM, as [[ch:dev]] shows step by step. With it, the first read can hit in the last-level cache.');
        L.note('vm', 'On machine B the “device” is host software. Its writes into guest memory are ordinary stores by a host CPU, so they pass through the host’s caches like any other store (Inference: the host is not visible from inside).');
        L.p('All of this assumed the device may write anywhere it is told. An IOMMU changes that.');
      } }
    ],
    check: [
      { q: 'On x86, what must a driver do to the CPU caches before a device reads a buffer?', options: ['Nothing: device reads are checked against the caches', 'Flush the whole cache', 'Invalidate the buffer’s lines', 'Mark the buffer uncached'], answer: 0, why: 'dev_is_dma_coherent() is always true on x86; the DMA API does no cache maintenance.' },
      { q: 'On a non-coherent arm64 device, what happens when a DMA_FROM_DEVICE buffer is handed back to the CPU?', options: ['Its cache lines are invalidated', 'Its cache lines are cleaned', 'Nothing', 'The buffer is copied'], answer: 0, why: 'arch_sync_dma_for_cpu() invalidates unless the direction is DMA_TO_DEVICE.' },
      { q: 'Machine B printed “Using software bounce buffering” but has no bounce buffer. Why?', options: ['swiotlb=noforce stopped the pool from being allocated', 'The message is wrong', 'Its RAM is below 4 GiB', 'An IOMMU replaced it'], answer: 0, why: 'The kernel enabled swiotlb because RAM goes above 4 GiB, then noforce skipped the allocation: “No low mem”, an empty debugfs directory.' }
    ],
    remember: [
      'On x86, device reads and writes are coherent with the CPU caches; the DMA API does no cache maintenance.',
      'On non-coherent Arm devices the DMA API cleans lines before the device reads and invalidates them after it writes.',
      'Never touch a buffer between map and unmap.',
      'swiotlb copies through bounce buffers for devices that cannot reach a buffer; machine B has none.',
      'With Intel DDIO, device writes land in the last-level cache instead of DRAM.'
    ],
    sources: [['Linux v6.18: include/linux/dma-map-ops.h', 'https://github.com/torvalds/linux/blob/v6.18/include/linux/dma-map-ops.h'], ['Linux v6.18: arch/arm64/mm/dma-mapping.c', 'https://github.com/torvalds/linux/blob/v6.18/arch/arm64/mm/dma-mapping.c'], ['Linux v6.18: kernel/dma/swiotlb.c', 'https://github.com/torvalds/linux/blob/v6.18/kernel/dma/swiotlb.c'], ['Intel: Introduction to Intel DDIO', 'https://www.intel.com/content/www/us/en/developer/articles/technical/ddio-analysis-performance-monitoring.html']]
  });

  /* ---------- VI.08 ---------- */
  App.lesson({
    id: 'io-iommu', short: 'The IOMMU', title: 'The IOMMU',
    lede: 'An IOMMU translates the addresses devices use, through page tables the kernel keeps per device. A device can reach only what the kernel mapped for it.',
    know: ['Devices put DMA addresses on the bus ([[ch:io-dma]]).', 'The MMU walks page tables and caches the results in a TLB ([[ch:vm-walk]], [[ch:vm-tlb]]).', 'Removing a translation needs every cached copy invalidated ([[ch:vm-shootdown]]).'],
    learn: ['Say what an IOMMU translates and what it protects against', 'Name the IOMMUs of Intel, AMD and Arm', 'Explain strict and lazy invalidation, and the window lazy mode leaves open', 'Read what machine B says about IOMMUs, and why it has none'],
    sections: [
      { id: 'what', title: 'An MMU for devices', body: function (L) {
        L.p('Without an IOMMU, a device can write any physical address its driver, or its own bug, gives it. An IOMMU puts page tables between the device and memory:', ['iommu', 'iova']);
        L.chain([
          { k: 'device', v: 'DMA to an IOVA', d: 'the address the driver got from the DMA API' },
          { k: 'IOMMU', v: 'walks that device’s tables', d: 'caches the result in its IOTLB' },
          { k: 'memory', v: 'physical address', d: 'or a fault, if nothing is mapped', hot: true }
        ]);
        L.p('Each device, or group of devices, gets its own tables, so one device cannot reach another’s buffers. The IOMMU caches translations in its own TLB:', ['iotlb']);
        L.table(['Vendor', 'Name', 'Linux driver'], [
          ['Intel', 'VT-d (DMA remapping)', 'drivers/iommu/intel/'],
          ['AMD', 'AMD-Vi', 'drivers/iommu/amd/'],
          ['Arm', 'SMMU (System MMU)', 'drivers/iommu/arm/arm-smmu-v3/ and arm-smmu/']
        ], { mono: false });
        L.p('Most also remap interrupts: an MSI-X write is a DMA write too, and the IOMMU checks where it may go ([[ch:io-irq]]).');
      } },
      { id: 'modes', title: 'Translated, lazy and strict', body: function (L) {
        L.p('Every unmap must remove the IOTLB entry too, much as a TLB shootdown does ([[ch:vm-shootdown]]). Waiting for that on every unmap is slow, so Linux offers a lazy mode, the default on x86:');
        L.quote('choice\n\tprompt "IOMMU default domain type"\n\tdepends on IOMMU_API\n\tdefault IOMMU_DEFAULT_DMA_LAZY if X86 || S390\n\tdefault IOMMU_DEFAULT_DMA_STRICT', { cite: 'drivers/iommu/Kconfig, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.quote('Trusted devices use translation to restrict their access to only DMA-mapped pages, but with "lazy" batched TLB invalidation. This mode allows higher performance with some IOMMUs due to reduced TLB flushing, but at the cost of reduced isolation since devices may be able to access memory for some time after it has been unmapped.', { cite: 'drivers/iommu/Kconfig, IOMMU_DEFAULT_DMA_LAZY, Linux v6.18', label: 'Linux source' });
        L.table(['Mode', 'Translation', 'After an unmap'], [
          ['passthrough', 'none: IOVA = physical', 'nothing to invalidate'],
          ['translated, strict', 'yes', 'the IOTLB is invalidated before the unmap returns'],
          ['translated, lazy', 'yes', 'invalidations are batched; the old translation may live a little longer']
        ], { mono: false });
        L.p('Lazy mode is the same bargain as clearing A bits without a flush ([[ch:vm-shootdown]]): faster, with a short window. Here the window is a device still able to reach a freed page.');
      } },
      { id: 'b', title: 'What machine B says', body: function (L) {
        L.p('Machine B’s kernel prints its policy at boot:');
        L.out('io.iommu', { lines: [0, 1, 2, 3] });
        L.p('The policy is there, but no IOMMU: /sys/class/iommu is empty. The messages come from code that runs whether or not one exists:');
        L.quote('\tpr_info("Default domain type: %s%s\\n",\n\t\tiommu_domain_type_str(iommu_def_domain_type),\n…\n\tif (!iommu_default_passthrough())\n\t\tpr_info("DMA domain TLB invalidation policy: %s mode%s\\n",', { cite: 'drivers/iommu/iommu.c, iommu_subsys_init(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.out('io.iommucfg');
        L.p('The kernel is built without the Intel, AMD and virtio IOMMU drivers, and without interrupt remapping. So machine B’s devices see guest-physical addresses directly, as [[ch:io-dma]] found.');
      } },
      { id: 'life', title: 'A mapping has a lifetime', body: function (L) {
        L.p('The order of operations matters: stop the device, unmap, wait for the invalidation, and only then let the page go. The lab below steps through it.');
        L.lab(function (el) { App.AdvancedUI.labs.dma(el); });
      } },
      { id: 'vm', title: 'Devices handed to a virtual machine', body: function (L) {
        L.p('An IOMMU also lets a host give a whole device to a guest:', ['vfio']);
        L.quote('Virtual machines often make use of direct device access ("device assignment") when configured for the highest possible I/O performance.  From a device and host perspective, this simply turns the VM into a userspace driver, with the benefits of significantly reduced latency, higher bandwidth, and direct use of bare-metal device drivers.', { cite: 'Documentation/driver-api/vfio.rst, Linux v6.18', label: 'Linux source' });
        L.p('The guest’s driver programs the device with guest-physical addresses, and the host fills the IOMMU’s tables to translate them to host-physical ones. It is the device-side twin of the second set of page tables in [[ch:vm-virt]].');
        L.p('A device assigned that way still needs to tell the CPU when it is done. That is the next lesson.');
      } }
    ],
    check: [
      { q: 'What does an IOMMU translate?', options: ['Addresses that devices use (IOVAs) into physical addresses', 'Virtual addresses of programs', 'Interrupt numbers into vectors only', 'Physical addresses into virtual ones'], answer: 0, why: 'It is an MMU on the device side: IOVA to physical, through per-device tables.' },
      { q: 'What risk does lazy invalidation accept?', options: ['A device may reach a page for a short time after it was unmapped', 'Translations may be wrong', 'Interrupts may be lost', 'The CPU may read stale data'], answer: 0, why: 'IOMMU_DEFAULT_DMA_LAZY: devices may be able to access memory for some time after it has been unmapped.' },
      { q: 'Machine B prints “Default domain type: Translated”. Do its devices go through an IOMMU?', options: ['No: the messages are a default policy; no IOMMU driver is built and /sys/class/iommu is empty', 'Yes, all of them', 'Only the disks', 'Only after boot'], answer: 0, why: 'iommu_subsys_init() prints the policy unconditionally; CONFIG_INTEL_IOMMU and CONFIG_AMD_IOMMU are not set.' }
    ],
    remember: [
      'An IOMMU translates device addresses (IOVAs) through per-device page tables and caches them in an IOTLB.',
      'It confines each device to what the kernel mapped: VT-d (Intel), AMD-Vi (AMD), SMMU (Arm).',
      'Strict mode invalidates the IOTLB on every unmap; lazy mode, the x86 default, batches it and leaves a short window.',
      'Machine B has no IOMMU: its boot messages only state the policy.',
      'With an IOMMU, a host can hand a whole device to a guest (VFIO).'
    ],
    sources: [['Linux v6.18: drivers/iommu/Kconfig', 'https://github.com/torvalds/linux/blob/v6.18/drivers/iommu/Kconfig'], ['Linux v6.18: drivers/iommu/iommu.c', 'https://github.com/torvalds/linux/blob/v6.18/drivers/iommu/iommu.c'], ['Linux: VFIO', 'https://docs.kernel.org/driver-api/vfio.html']]
  });

  /* ---------- VI.09 ---------- */
  App.lesson({
    id: 'io-irq', short: 'Interrupts and MSI-X', title: 'Interrupts: INTx, MSI and MSI-X',
    lede: 'A device signals the CPU with a memory write to a special address. With MSI-X each queue gets its own interrupt, sent to a CPU of the kernel’s choosing.',
    know: ['The MSI-X table sits in BAR0 at 0x8000 ([[ch:io-config]]).', 'A device’s writes arrive in order ([[ch:io-pcie]]).', 'An exception makes the CPU stop and run a kernel handler ([[ch:vm-faults]]).'],
    learn: ['Compare pin interrupts with message-signalled ones', 'Decode an x86 MSI address and data word', 'Read /proc/interrupts and an interrupt’s CPU affinity', 'Follow the completion interrupt in machine B’s trace, and say what polling changes'],
    sections: [
      { id: 'pins', title: 'From pins to messages', body: function (L) {
        L.p('Older devices raise a pin, shared with other devices and routed by the I/O APIC (at 0xfec00000 in [[ch:io-paths]]). Machine B’s functions have no pin at all: interrupt pin 0 in [[ch:io-config]].', ['ioapic']);
        L.quote('A Message Signaled Interrupt is a write from the device to a special address which causes an interrupt to be received by the CPU.', { cite: 'Documentation/PCI/msi-howto.rst, Linux v6.18', label: 'Linux source' });
        L.quote('Using MSIs avoids this problem as the interrupt-generating write cannot pass the data writes, so by the time the interrupt is raised, the driver knows that all the data has arrived in memory.', { cite: 'Documentation/PCI/msi-howto.rst, “Why use MSIs?”, Linux v6.18 (excerpt)', label: 'Linux source' });
        L.p('So an MSI needs no register read to confirm the data, and is never shared: each vector belongs to one device.');
      } },
      { id: 'format', title: 'An x86 MSI is a write to 0xfee…', body: function (L) {
        L.p('The address says which CPU; the data says which vector:', ['vector']);
        L.quote('typedef struct x86_msi_data {\n\tunion {\n\t\tstruct {\n\t\t\tu32\tvector\t\t\t:  8,\n\t\t\t\tdelivery_mode\t\t:  3,\n\t\t\t\tdest_mode_logical\t:  1,\n…\ntypedef struct x86_msi_addr_lo {\n\tunion {\n\t\tstruct {\n\t\t\tu32\treserved_0\t\t:  2,\n\t\t\t\tdest_mode_logical\t:  1,\n\t\t\t\tredirect_hint\t\t:  1,\n\t\t\t\treserved_1\t\t:  1,\n\t\t\t\tvirt_destid_8_14\t:  7,\n\t\t\t\tdestid_0_7\t\t:  8,\n\t\t\t\tbase_address\t\t: 12;\n…\n#define X86_MSI_BASE_ADDRESS_LOW\t(0xfee00000 >> 20)', { cite: 'arch/x86/include/asm/msi.h, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.bits([
          { bits: '31:20', val: '0xfee', name: 'fixed base', tone: 'mute' },
          { bits: '19:12', val: '0x03', name: 'destination APIC ID', tone: 'a1', hot: true },
          { bits: '11:5', val: '0', name: 'extended ID', tone: 'mute' },
          { bits: '4:2', val: '0', name: 'flags', tone: 'mute' },
          { bits: '1:0', val: '0', name: '', tone: 'mute' }
        ], { title: 'Example: an MSI address for the CPU with APIC ID 3 = 0xfee03000', dense: true });
        L.p('The data’s low 8 bits are the vector, the entry the CPU runs in its interrupt table. The example is illustrative: machine B’s MSI-X table sits in BAR memory that only the kernel maps.');
      } },
      { id: 'msix', title: 'MSI-X: one interrupt per queue', body: function (L) {
        L.p('MSI-X keeps a table of address and data pairs in a BAR, one per vector, 16 bytes each: here 2 entries at BAR0 0x8000. The kernel lists each vector in /proc/interrupts:', ['msix']);
        L.out('io.irqs', { wide: true });
        L.p('vda has two: <code>virtio1-config</code> for configuration changes, and <code>virtio1-req.0</code> for its request queue. Network cards and NVMe drives give each queue its own:');
        L.quote('Other possible designs include giving one interrupt to each packet queue in a network card or each port in a storage controller.', { cite: 'Documentation/PCI/msi-howto.rst, “Why use MSIs?”, Linux v6.18 (excerpt)', label: 'Linux source' });
        L.p('The request queue’s interrupt may go to any of CPUs 0 to 3, and is delivered to CPU 3: all 66035 of its interrupts so far were counted there.', ['affinity']);
      } },
      { id: 'one', title: 'One read, one interrupt', body: function (L) {
        L.p('The program made 1002 reads (1 warm-up, 1 traced, 1000 timed). The interrupt count grew by 1004:');
        L.out('io.irqcount', { wide: true });
        L.p('About one interrupt per read, all on CPU 3; the 2 extra belong to other requests to the root disk (Inference). In the trace of the traced read:');
        L.out('io.trace', { lines: [6, 7, 8, 9, 10, 11], wide: true });
        L.p('The program slept on CPU 0 at 29 µs. The interrupt arrived on CPU 3 at 53 µs and the handler took 2 µs, completing the request.');
        L.p('Then CPU 3 sent an inter-processor interrupt to CPU 0 to wake the program, which ran again at 98 µs. In this run, waking the idle CPU took longer than the device itself.');
      } },
      { id: 'poll', title: 'Fewer interrupts, or none', body: function (L) {
        L.p('Interrupts cost a handler and often a wake-up. Drivers cut them three ways:', ['poll']);
        L.table(['Technique', 'How', 'Seen here'], [
          ['suppression', 'the device interrupts only when the driver asked (virtio event index)', 'bit 29 on vda ([[ch:io-rings]])'],
          ['coalescing', 'the device waits for several completions, or a timeout, before interrupting', 'network cards, NVMe'],
          ['polling', 'the CPU checks the completion queue in a loop: NAPI for networks, io_uring IOPOLL for disks', 'io_poll = 0: vda has no polled queues ([[ch:io-block]])']
        ], { mono: false });
        L.p('Polling trades CPU time for latency; suppression and coalescing trade latency for CPU time. The lab shows the trade-off on a queue.');
        L.lab(function (el) { App.AdvancedUI.labs.io(el); });
      } }
    ],
    check: [
      { q: 'Why can a driver trust the data as soon as an MSI arrives?', options: ['The interrupt write cannot pass the device’s earlier data writes', 'MSIs are slower than data', 'The driver reads a register first', 'The IOMMU checks the data'], answer: 0, why: 'msi-howto.rst: the interrupt-generating write cannot pass the data writes.' },
      { q: 'An x86 MSI address is 0xfee03000. Which CPU receives it?', options: ['The one with APIC ID 3 (bits 19:12)', 'CPU 0', 'Vector 3', 'Any CPU'], answer: 0, why: 'Bits 19:12 of the address hold the destination APIC ID; the vector is in the data.' },
      { q: 'vda’s request-queue interrupt has affinity 0-3 but every count is on CPU 3. Why?', options: ['The kernel delivers it to one CPU of the allowed set: the effective affinity is 3', 'CPUs 0–2 are offline', 'MSI-X can reach only CPU 3', 'The count is wrong'], answer: 0, why: 'effective_affinity_list shows the CPU actually used: 3.' },
      { q: 'What does io_uring with IOPOLL avoid?', options: ['The completion interrupt and the wake-up: the CPU polls the queue', 'The doorbell write', 'The DMA', 'The system call to set up the ring'], answer: 0, why: 'Polling checks completions in a loop instead of waiting for an interrupt.' }
    ],
    remember: [
      'An MSI is a memory write to a special address; it is never shared and cannot overtake the device’s data.',
      'x86 MSI: address 0xfeeXXXXX carries the destination APIC ID; the data carries the vector.',
      'MSI-X gives each queue its own vector, from a table in a BAR.',
      'Affinity sets the allowed CPUs; the effective affinity is the one used: CPU 3 for vda.',
      'Suppression, coalescing and polling cut interrupts; polling removes the wake-up too.'
    ],
    sources: [['Linux: The MSI Driver Guide (msi-howto.rst)', 'https://docs.kernel.org/PCI/msi-howto.html'], ['Linux v6.18: arch/x86/include/asm/msi.h', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/include/asm/msi.h'], ['proc(5): /proc/interrupts', 'https://man7.org/linux/man-pages/man5/proc.5.html'], ['Linux: SMP IRQ affinity', 'https://docs.kernel.org/core-api/irq/irq-affinity.html']]
  });
})();
