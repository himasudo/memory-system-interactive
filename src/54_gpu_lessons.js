/* ======================= Part VI · GPUs and memory (VI.14–VI.15) ======================= */
(function () {
  'use strict';
  var d = App.gloss, h = App.h, LW = function () { return App.LW; };
  d('dgpu', 'discrete GPU', 'A GPU on its own card or package, joined to the processor by PCIe or a vendor link, with its own memory. The CPU and the GPU each reach the other’s memory only over that link.');
  d('hbm', 'HBM, GDDR', 'The memory on discrete GPUs. HBM stacks DRAM dies next to the GPU in one package for a very wide bus; GDDR chips sit on the card around it. Both trade capacity and cost for bandwidth.');
  d('uma', 'UMA (unified memory architecture)', 'A design in which the GPU has no memory of its own and uses the same DRAM as the cores, as an integrated GPU does.');
  d('rebar', 'Resizable BAR', 'A PCIe capability that lets a device offer several BAR sizes and the system pick one. A GPU uses it to put all of its memory, not only a 256 MB window, in the CPU’s physical address space.');
  d('gpuvm', 'GPU virtual memory', 'The GPU’s own MMU and page tables, written by the GPU driver. Each context has its own address space, which can map the GPU’s memory and, through the IOMMU, system memory.');
  d('sva', 'SVA (shared virtual addressing)', 'A device uses a process’s own virtual addresses: the IOMMU translates its requests through that process’s page tables. PCIe calls it shared virtual memory.');
  d('pasid', 'PASID', 'Process address space ID: a 20-bit tag a device puts on its requests so the IOMMU knows whose page tables to use.');
  d('atspri', 'ATS, PRI', 'Address Translation Services and Page Request Interface: PCIe features that let a device cache translations in its own TLB and ask for a missing page to be faulted in.');
  d('hmm', 'HMM', 'Heterogeneous memory management: Linux helpers that let a driver mirror a process’s page tables into a device’s, and migrate pages into device memory and back.');
  d('devpriv', 'device-private page', 'A struct page that stands for a page of a device’s own memory (MEMORY_DEVICE_PRIVATE). The CPU cannot map it; touching the address faults and the page is migrated back to system memory.');
  App.setCategory('dgpu hbm uma rebar', 'io');
  App.setCategory('gpuvm sva pasid atspri hmm devpriv', 'xlate');

  var ROCM = ['Linux v6.18: Documentation/gpu/amdgpu/amdgpu-glossary.rst', 'https://docs.kernel.org/gpu/amdgpu/amdgpu-glossary.html'];
  var HMMDOC = ['Linux v6.18: Heterogeneous Memory Management (HMM)', 'https://docs.kernel.org/mm/hmm.html'];
  var SVADOC = ['Linux v6.18: Shared Virtual Addressing (SVA) with ENQCMD', 'https://docs.kernel.org/arch/x86/sva.html'];
  var REBAR = ['Microsoft, System and driver support for Resizable BAR', 'https://learn.microsoft.com/en-us/windows-hardware/drivers/display/resizable-bar-support'];
  var PINNED = ['NVIDIA Technical Blog, How to Optimize Data Transfers in CUDA C/C++', 'https://developer.nvidia.com/blog/how-optimize-data-transfers-cuda-cc/'];
  var NVHMM = ['NVIDIA Technical Blog, Simplifying GPU Application Development with Heterogeneous Memory Management (2023)', 'https://developer.nvidia.com/blog/simplifying-gpu-application-development-with-heterogeneous-memory-management/'];
  var GH = ['NVIDIA Technical Blog, Simplifying GPU Programming for HPC with the NVIDIA Grace Hopper Superchip', 'https://developer.nvidia.com/blog/simplifying-gpu-programming-for-hpc-with-the-nvidia-grace-hopper-superchip/'];
  var DRMMM = ['Linux v6.18: DRM Memory Management', 'https://docs.kernel.org/gpu/drm-mm.html'];

  /* How long one copy takes over a PCIe link, next to reading the same bytes in GPU memory. */
  function copyTime(el) {
    var form = h('div', { 'class': 'lx-form' }, el);
    var size = LW().select(form, 'Buffer', [['64', '64 MiB'], ['1024', '1 GiB'], ['16384', '16 GiB']], '1024');
    var link = LW().select(form, 'Link', [['31.5', 'PCIe 4.0 x16, 31.5 GB/s'], ['63', 'PCIe 5.0 x16, 63 GB/s']], '63');
    var mem = LW().select(form, 'GPU memory', [['1000', '1 TB/s'], ['3000', '3 TB/s']], '1000');
    var out = h('div', { 'class': 'lx-out', 'aria-live': 'polite' }, el);
    function fmt(s) { return s >= 1 ? s.toFixed(2) + ' s' : (s * 1000).toFixed(1) + ' ms'; }
    function draw() {
      var bytes = +size.value * 1048576, a = bytes / (+link.value * 1e9), b = bytes / (+mem.value * 1e9);
      out.innerHTML = '<div class="lx-table"><div class="lx-table-wrap"><table class="mono-cells"><tbody>' +
        '<tr><td style="font-family:var(--sans)">over the link, one way</td><td>' + fmt(a) + '</td></tr>' +
        '<tr><td style="font-family:var(--sans)">reading it once in GPU memory</td><td>' + fmt(b) + '</td></tr>' +
        '<tr><td style="font-family:var(--sans)">how many times slower the link is</td><td>' + Math.round(a / b) + ' ×</td></tr></tbody></table></div></div>' +
        '<p class="lx-msg">The link figures are the raw rate after 128b/130b encoding, before packet headers (Lesson ' + App.chNum('io-pcie') + '), so a real copy is slower still.</p>';
    }
    [size, link, mem].forEach(function (s) { s.addEventListener('change', draw); });
    draw();
  }

  /* ---------- VI.14 ---------- */
  App.lesson({
    id: 'gpu-mem', short: 'A GPU and memory', title: 'A GPU and memory',
    lede: 'An integrated GPU shares the cores’ DRAM. A discrete GPU brings its own memory and reaches system RAM over PCIe, by DMA, from pinned pages.',
    know: ['Devices sit on PCIe links and expose BARs ([[ch:io-pcie]], [[ch:io-config]]).', 'Posted writes and non-posted reads on PCIe ([[ch:io-pcie]]).', 'DMA, the DMA API and pinning ([[ch:io-dma]]); the IOMMU ([[ch:io-iommu]]).', 'Demand paging: a page gets a frame on first touch ([[ch:vm-demand]]).'],
    learn: ['Tell an integrated GPU from a discrete one by where its memory is', 'Say how the CPU reaches a discrete GPU’s memory, and how the GPU reaches system memory', 'Explain why GPU copies use pinned memory, and what the PCIe link costs'],
    sections: [
      { id: 'two', title: 'Two places a GPU’s memory can be', body: function (L) {
        L.p('A GPU runs thousands of threads at once, and together they move far more data per second than a core. Where that data lives decides almost everything else.');
        L.table(['', 'Integrated GPU', 'Discrete GPU'], [
          ['Where it sits', 'on the same chip as the cores', 'on its own card or package'],
          ['Its memory', 'the cores’ DRAM', 'its own GDDR or HBM'],
          ['How it reaches system RAM', 'through the chip’s interconnect, like a core', 'by DMA over PCIe, through the IOMMU'],
          ['Usually found in', 'laptops, phones, desktop chips', 'servers and workstations']
        ], { mono: false, terms: ['igpu', 'dgpu', 'hbm'] });
        L.p('The example machine in [[ch:map]] has an optional integrated GPU. A machine-learning server usually has several discrete GPUs, each with its own memory.');
      } },
      { id: 'shared', title: 'An integrated GPU shares the cores’ DRAM', body: function (L) {
        L.p('An integrated GPU has no memory of its own. Firmware sets part of DRAM aside for it at boot, and its driver borrows ordinary pages for everything else.', ['uma']);
        L.quote('UMA devices usually have what is called a "stolen" memory region, which provides space for the initial framebuffer and large, contiguous memory regions required by the device.', { cite: 'Documentation/gpu/drm-mm.rst, Linux v6.18', label: 'Linux source', src: DRMMM });
        L.p('Its requests cross the same interconnect and memory controllers as the cores’. In the example machine that is two DDR4-2400 channels, 38.4 GB/s in all, shared by four cores and the GPU.');
        L.p('So nothing needs copying between “CPU memory” and “GPU memory”: there is only one. The price is contention. A busy GPU takes bandwidth the cores would have had, and the other way round.');
      } },
      { id: 'bar', title: 'The CPU’s window into GPU memory', body: function (L) {
        L.p('A discrete GPU’s memory sits behind its PCIe link. The CPU reaches it as it reaches any device: through a BAR, a range of physical addresses that the device answers ([[ch:io-config]]).', ['bar']);
        L.p('For compatibility with 32-bit systems, GPUs long exposed only a 256 MB window of their memory, and drivers moved that window around. With Resizable BAR the system can make the BAR as large as all of the GPU’s memory.', ['rebar']);
        L.quote('/**\n * amdgpu_device_resize_fb_bar - try to resize FB BAR\n…\n * Try to resize FB BAR to make all VRAM CPU accessible.', { code: true, cite: 'drivers/gpu/drm/amd/amdgpu/amdgpu_device.c, Linux v6.18 (excerpt)', label: 'Linux source', src: REBAR });
        L.p('FB, the frame buffer, and VRAM are the driver’s names for the GPU’s own memory.');
        L.p('A store into that window is a posted PCIe write: the core sends it and moves on. A load is a non-posted read: the core waits for a completion to come back over the link ([[ch:io-pcie]]). So programs write GPU memory from the CPU when they must, and avoid reading it.');
      } },
      { id: 'dma', title: 'The GPU’s side: DMA from pinned pages', body: function (L) {
        L.p('In the other direction, the GPU reads and writes system RAM by DMA, as an SSD does. Its copy engines send PCIe requests; the IOMMU checks them and the I/O hub turns them into memory requests ([[ch:io-dma]]).');
        L.p('A DMA transfer needs pages that stay where they are. A buffer from <code>malloc()</code> is pageable: its pages may not have frames yet, and the kernel may move or swap them at any time ([[ch:vm-demand]]). The device cannot follow those changes.', ['pin']);
        L.p('NVIDIA’s CUDA documents what its driver does with a copy from such a buffer. It allocates a temporary pinned buffer, copies the data into it with the CPU, and only then lets the GPU copy it by DMA:');
        L.chain([
          { k: 'malloc() buffer', v: 'pageable', d: 'the GPU cannot DMA from it' },
          { k: 'the driver’s pinned buffer', v: 'CPU copy', d: 'one extra pass over the data', hot: true },
          { k: 'GPU memory', v: 'DMA over PCIe', d: 'done by the GPU’s copy engine' }
        ], { cap: 'A copy from pageable memory, as NVIDIA describes it for CUDA.' });
        L.p('A program that allocates pinned memory itself, with <code>cudaMallocHost()</code>, skips the extra copy. Inside the kernel, drivers pin user pages with <code>pin_user_pages()</code>:');
        L.quote(' * pin_user_pages() - pin user pages in memory for use by other devices', { code: true, cite: 'mm/gup.c, Linux v6.18', label: 'Linux source' });
        L.p('Pinned pages cost the rest of the system: while pinned they cannot be reclaimed or swapped, so pinning too much leaves less memory for everything else ([[ch:vm-reclaim]]).');
      } },
      { id: 'link', title: 'The link is the narrow part', body: function (L) {
        L.p('The PCIe link is far slower than the GPU’s own memory. The kernel’s HMM documentation gives the scale:');
        L.quote('Another crippling factor is the limited bandwidth (~32GBytes/s with PCIE 4.0 and 16 lanes). This is 33 times less than the fastest GPU memory (1 TBytes/s).', { cite: 'Documentation/mm/hmm.rst, Linux v6.18', label: 'Linux source', src: HMMDOC });
        L.try('Time a copy', 'Pick a buffer, a link and the GPU memory’s bandwidth. The table compares moving the buffer over the link with reading it once on the GPU.', copyTime);
        L.p('So GPU programs copy data once, keep it on the GPU as long as they can, and overlap copies with work. The next lesson asks how a program can avoid managing two copies at all.');
      } }
    ],
    check: [
      { q: 'Where does an integrated GPU keep its data?', options: ['In the same DRAM as the cores', 'In its own HBM', 'In the L3 cache', 'On the SSD'], answer: 0, why: 'An integrated GPU has no memory of its own. Firmware sets part of DRAM aside for it, and its driver uses ordinary pages too.' },
      { q: 'Why can a GPU not DMA straight from a buffer that malloc() returned?', options: ['Its pages are pageable: they may not exist yet, and may move or be swapped', 'malloc() memory is uncached', 'GPUs can only read 4 KiB at a time', 'The IOMMU blocks all user memory'], answer: 0, why: 'A device needs pages that stay put for the whole transfer. CUDA stages such copies through a pinned buffer.' },
      { q: 'What does Resizable BAR change?', options: ['The CPU can map all of the GPU’s memory instead of a 256 MB window', 'The GPU’s memory becomes faster', 'PCIe links get more lanes', 'The GPU can use the CPU’s page tables'], answer: 0, why: 'The BAR is the physical address range the GPU answers. Resizing it lets the whole of the GPU’s memory appear there at once.' },
      { q: 'A program reads a GPU buffer from the CPU through the BAR, one load at a time. Why is that slow?', options: ['Each load is a non-posted PCIe read that waits for a completion', 'The GPU’s memory is slower than DRAM', 'The TLB cannot hold BAR addresses', 'The IOMMU translates every load'], answer: 0, why: 'Writes are posted and the core moves on; every read waits for its answer to cross the link and come back.' }
    ],
    remember: [
      'An integrated GPU shares the cores’ DRAM and bandwidth; a discrete GPU has its own memory behind a PCIe link.',
      'The CPU reaches a discrete GPU’s memory through a BAR. Writes are cheap posted packets; reads wait a round trip.',
      'The GPU reaches system RAM by DMA, which needs pinned pages. CUDA copies pageable data into a pinned buffer first.',
      'The link is tens of GB/s; GPU memory is about a TB/s and more. Copy rarely, and keep data on the GPU.'
    ],
    sources: [DRMMM, REBAR, PINNED, HMMDOC, ROCM]
  });

  /* ---------- VI.15 ---------- */
  App.lesson({
    id: 'gpu-svm', short: 'One address space', title: 'One address space for CPU and GPU',
    lede: 'A GPU has its own page tables, so a CPU pointer means nothing to it by default. SVA shares the CPU’s tables; Linux HMM mirrors them and moves pages into GPU memory.',
    know: ['Page tables, the walk and page faults ([[ch:vm-walk]], [[ch:vm-faults]]).', 'The IOMMU translates what devices send ([[ch:io-iommu]]).', 'A discrete GPU has its own memory and reaches system RAM by DMA ([[ch:gpu-mem]]).'],
    learn: ['Say why a CPU pointer is not a GPU pointer, and what the classic copy-in, copy-out program does', 'Explain shared virtual addressing: PASID, ATS and PRI', 'Explain how Linux HMM mirrors page tables and migrates pages to GPU memory and back'],
    sections: [
      { id: 'gpuvm', title: 'A GPU has its own MMU', body: function (L) {
        L.p('A GPU runs work for many programs, so it translates addresses too. Its MMU walks page tables that the GPU driver writes, one address space per context.', ['gpuvm']);
        L.quote('GPU Virtual Memory.  This is the GPU\'s MMU.  The GPU supports multiple virtual address spaces that can be in flight at any given time.', { cite: 'Documentation/gpu/amdgpu/amdgpu-glossary.rst, GPUVM, Linux v6.18', label: 'Linux source', src: ROCM });
        L.p('Those tables can point at the GPU’s own memory or, through the IOMMU, at system RAM. The GPU driver fills them; the process’s own page tables are not involved.');
      } },
      { id: 'split', title: 'Two address spaces', body: function (L) {
        L.p('So by default a pointer is valid on one side only. The CPU address of <code>hist</code>, 0x7ffd4a3c2a80, means nothing to the GPU unless its driver has mapped that range into the GPU’s tables.');
        L.p('The classic GPU program therefore allocates GPU memory through the driver, copies its data in, runs, and copies the result back:');
        L.code('long *d;                                    /* an address in the GPU’s space */\ncudaMalloc(&d, bytes);\ncudaMemcpy(d, hist, bytes, cudaMemcpyHostToDevice);   /* CPU memory → GPU memory */\nkernel<<<blocks, threads>>>(d);\ncudaMemcpy(hist, d, bytes, cudaMemcpyDeviceToHost);   /* and back */', { title: 'the classic pattern, in CUDA' });
        L.p('For a flat array that works. For a linked list or a tree it does not: every pointer stored inside the data is a CPU address, and each one would have to be rewritten. Linux’s HMM documentation calls this a split address space.');
      } },
      { id: 'sva', title: 'Sharing the CPU’s page tables: SVA', body: function (L) {
        L.p('One fix is to let the device use the process’s own page tables. That is shared virtual addressing: the device sends the same virtual addresses the CPU uses, and the IOMMU translates them.', ['sva']);
        L.p('Three PCIe features make it work:');
        L.list([
          '<b>PASID</b> tags every request from the device with the process it is working for.',
          '<b>ATS</b> lets the device ask the IOMMU for a translation and keep it in a TLB of its own.',
          '<b>PRI</b> lets the device report a missing page, so the kernel can fault it in, as for a CPU access.'
        ], ['pasid', 'atspri']);
        L.quote('ATS allows devices to cache translations for virtual addresses. The IOMMU driver uses the mmu_notifier() support to keep the device TLB cache and the CPU cache in sync.', { cite: 'Documentation/arch/x86/sva.rst, Linux v6.18', label: 'Linux source', src: SVADOC });
        L.p('In Linux a driver turns it on with one call, which gives the device a process’s page tables under a new PASID:');
        L.quote('struct iommu_sva *iommu_sva_bind_device(struct device *dev,\n\t\t\t\t\tstruct mm_struct *mm);\nvoid iommu_sva_unbind_device(struct iommu_sva *handle);\nu32 iommu_sva_get_pasid(struct iommu_sva *handle);', { code: true, cite: 'include/linux/iommu.h, Linux v6.18 (excerpt)', label: 'Linux source' });
        L.p('Nothing needs pinning: if a page is not there, the device asks for it through PRI instead of reading the wrong memory. Accelerators such as Intel’s Data Streaming Accelerator work this way.');
        L.note('careful', 'SVA leaves the data where it is, in system RAM. A discrete GPU using it still reads every byte over the PCIe link, at link speed.');
      } },
      { id: 'hmm', title: 'Mirroring and moving pages: HMM', body: function (L) {
        L.p('A discrete GPU wants more than shared addresses: it wants the data in its own fast memory. Linux’s heterogeneous memory management gives drivers two tools for that.', ['hmm']);
        L.p('The first is mirroring. The driver copies a range of the CPU’s page table into the GPU’s with <code>hmm_range_fault()</code>, and registers a notifier, so every later change to that range updates the GPU’s copy too.');
        L.quote('  int hmm_range_fault(struct hmm_range *range);\n\nIt will trigger a page fault on missing or read-only entries if write access is\nrequested (see below). Page faults use the generic mm page fault code path just\nlike a CPU page fault.', { code: true, cite: 'Documentation/mm/hmm.rst, Linux v6.18 (excerpt)', label: 'Linux source', src: HMMDOC });
        L.p('The second is migration. The driver can move pages into GPU memory. Linux gives each page of GPU memory a <code>struct page</code> of a special type, which the CPU cannot map:', ['devpriv']);
        L.quote(' * MEMORY_DEVICE_PRIVATE:\n * Device memory that is not directly addressable by the CPU: CPU can neither\n * read nor write private memory.', { code: true, cite: 'include/linux/memremap.h, Linux v6.18 (excerpt)', label: 'Linux source' });
        L.p('To the CPU, a migrated page looks swapped out. If a CPU thread touches it, the page fault calls the driver’s <code>migrate_to_ram()</code>, which copies the page back into system memory before the access goes on.');
        L.chain([
          { k: 'page in system RAM', v: 'mapped by the CPU', d: 'and mirrored in the GPU’s tables' },
          { k: 'migrate_vma_*()', v: 'the GPU copies it', d: 'the CPU’s entry becomes a special swap entry', hot: true },
          { k: 'device-private page', v: 'in GPU memory', d: 'a CPU access faults → migrate_to_ram()' }
        ], { cap: 'A page moving to GPU memory and back, with Linux HMM.' });
      } },
      { id: 'today', title: 'What programs see', body: function (L) {
        L.p('NVIDIA’s CUDA builds on HMM. With its open-source kernel driver on a Linux kernel that has HMM, GPU code can use memory from plain <code>malloc()</code> or <code>mmap()</code>: no special allocator and no copy in the program. The driver mirrors and migrates pages behind it.');
        L.p('The work has not disappeared. Pages still cross the PCIe link when they migrate, and a page that bounces between CPU and GPU pays for a fault and a copy each time. Programs that care still decide where data lives.');
        L.note('other', 'Some systems join CPU and GPU with a coherent link instead of PCIe, such as NVIDIA’s Grace Hopper with NVLink-C2C. There the GPU can read CPU memory directly, at cache-line granularity, and migration becomes an optimization rather than a requirement.');
      } }
    ],
    check: [
      { q: 'A CPU thread passes the pointer 0x7ffd4a3c2a80 to GPU code. Without SVA or HMM, what does the GPU find there?', options: ['Whatever its own page tables map at that address, if anything', 'The same bytes the CPU sees', 'A page fault handled by the CPU’s kernel', 'The L3 line that holds it'], answer: 0, why: 'The GPU translates through its own tables, which the GPU driver fills. A CPU address means something to it only if that range was mapped.' },
      { q: 'With SVA, which tables does the IOMMU walk for a device’s request?', options: ['The process’s own page tables, chosen by the PASID', 'The GPU driver’s private tables', 'The kernel’s direct map', 'None: SVA turns translation off'], answer: 0, why: 'iommu_sva_bind_device() gives the device the process’s page tables under a PASID, and every request carries that PASID.' },
      { q: 'A page was migrated to GPU memory with HMM. What happens when a CPU thread reads it?', options: ['A page fault calls the driver’s migrate_to_ram(), which copies it back first', 'The CPU reads GPU memory over the BAR', 'The read returns zeros', 'The kernel kills the process'], answer: 0, why: 'The CPU cannot map device-private pages. Its entry acts like a swap entry, so the access faults and the driver migrates the page back.' },
      { q: 'Why does SVA alone not make a discrete GPU fast on system memory?', options: ['The data stays in system RAM, so every access still crosses the PCIe link', 'SVA disables the GPU’s caches', 'PASIDs slow down DRAM', 'SVA needs every page pinned'], answer: 0, why: 'SVA shares addresses, not location. Moving data into GPU memory is what HMM migration adds.' }
    ],
    remember: [
      'A GPU has its own MMU and page tables; a CPU pointer means nothing to it unless something maps it.',
      'The classic program copies data into GPU memory and back, which breaks pointer-based data.',
      'SVA lets a device use a process’s page tables: PASID picks them, ATS caches translations, PRI asks for missing pages.',
      'HMM mirrors CPU page tables into the GPU’s and migrates pages to device-private memory; a CPU access faults and migrates them back.'
    ],
    sources: [ROCM, SVADOC, HMMDOC, NVHMM, GH]
  });
})();
