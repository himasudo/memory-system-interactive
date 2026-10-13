/* ======================= Part III · Virtual memory, lessons 13–16 ======================= */
(function () {
  'use strict';
  var LW = function () { return App.LW; };
  var d = App.gloss;
  d('cr2', 'CR2', 'The control register into which the CPU writes the faulting address when a page fault occurs. The kernel reads it first thing. (On CPUs with FRED, the address arrives with the event instead.)');
  d('errcode', 'page-fault error code', 'A number the CPU pushes with every page fault. Its bits say whether a translation existed (bit 0), whether the access was a write (1), from user mode (2), an instruction fetch (4), and more.');
  d('gfp', 'GFP flags', 'Flags passed to the kernel’s page allocator (“get free pages”) saying what the memory is for and what the allocator may do: GFP_KERNEL for kernel data, GFP_HIGHUSER_MOVABLE for user pages the kernel may move later, __GFP_ZERO to fill the block with zeros.');
  d('zeropage', 'zero page', 'One frame of zeros that Linux maps read-only wherever a program reads anonymous memory it has never written. The kernel keeps it in its own data, as empty_zero_page.');
  d('pagecache', 'page cache', 'Frames in RAM that hold the contents of files, found by file and offset. read() and write() copy to and from them, mmap maps them into processes, and Linux evicts clean ones when memory runs short.');
  d('writeback', 'writeback (of files)', 'The kernel writing dirty page-cache frames back to their file in storage. It happens in the background after a delay, or at once when a program calls fsync() or msync().');
  d('majorfault', 'major page fault', 'A page fault the kernel can fix only by reading from storage, such as a file page that is not in the page cache. The program waits for the disk. getrusage counts them as ru_majflt.');
  d('sigsegv', 'SIGSEGV', 'The signal the kernel sends a program for an access it will not allow. si_code says why: SEGV_MAPERR, no region at that address; SEGV_ACCERR, a region that forbids that access.');

  /* ---------- III.13 ---------- */
  App.lesson({
    id: 'vm-faults', short: 'Page faults', title: 'Page faults: what the CPU reports',
    lede: 'When a walk fails, the CPU stops the instruction, records the address and the reason, and hands both to the kernel.',
    know: ['A walk stops at the first entry with P = 0, or when the permissions refuse the access ([[ch:vm-walk]]).', 'mmap adds a region; the tables and frames come later ([[ch:vm-space]]).', 'A non-canonical address raises #GP, trap 13, before any walk ([[ch:vm-space]]).'],
    learn: ['Say what the CPU saves when a walk fails: the address, an error code and the instruction', 'Decode any x86 page-fault error code', 'Follow the kernel from the exception to a fixed page or a signal', 'Tell SEGV_MAPERR from SEGV_ACCERR'],
    sections: [
      { id: 'first', title: 'The first store fails', body: function (L) {
        L.p('Go back to the main run’s first store, <code>p[0xd4e] = 1</code>. Before the mmap, the program had nothing mapped in the 512 GiB that PML4 entry 254 covers:');
        L.out('story.slot254');
        L.p('So PML4 entry 254 was empty, with P = 0. The walk for 0x7f3a1b2c3d4e stopped at its very first read.');
        L.chain([
          { k: 'CR3', v: 'top table', d: 'the walk starts' },
          { k: 'PML4 entry 254', v: 'P = 0', d: 'nothing below it', hot: true },
          { k: 'exception 14', v: 'page fault', d: 'the store does not happen' }
        ]);
        L.p('The CPU does not finish the instruction. It raises exception 14, a page fault (#PF), and the kernel takes over.', ['pf']);
      } },
      { id: 'reports', title: 'What the CPU reports', body: function (L) {
        L.p('Three things travel with the fault: CR2 receives the address that failed, the CPU pushes an error code that says why, and the saved instruction pointer says which instruction it was.', ['cr2', 'errcode']);
        L.p('The kernel’s first step is to read the address:');
        L.quote('address = cpu_feature_enabled(X86_FEATURE_FRED) ? fred_event_data(regs) : read_cr2();', { cite: 'arch/x86/mm/fault.c, exc_page_fault(), Linux v6.18', label: 'Linux source', code: true });
        L.p('A trace event records all three. For the first store:');
        L.out('story.fault1');
        L.p('Address 0x7f3a1b2c3d4e, error code 0x6, instruction at 0x55c5ee6c7e97. That instruction lies in the program’s code region:');
        L.out('story.text');
        L.p('The region starts at 0x55c5ee6c7000 and maps the file from offset 0x1000. So the instruction sits at 0x55c5ee6c7e97 − 0x55c5ee6c7000 + 0x1000 = 0x1e97 in the file:');
        L.out('story.objdump', { title: 'objdump -d story' });
        L.p('It is the store. When the kernel has fixed the page, it returns to that same instruction, which runs again and succeeds.');
      } },
      { id: 'code', title: 'The error code, bit by bit', body: function (L) {
        L.p('The error code is a set of flags. Linux names them in one header:');
        L.quote(' * Page fault error code bits:\n *\n *   bit 0 ==\t 0: no page found\t1: protection fault\n *   bit 1 ==\t 0: read access\t\t1: write access\n *   bit 2 ==\t 0: kernel-mode access\t1: user-mode access\n *   bit 3 ==\t\t\t\t1: use of reserved bit detected\n *   bit 4 ==\t\t\t\t1: fault was an instruction fetch\n *   bit 5 ==\t\t\t\t1: protection keys block access\n *   bit 6 ==\t\t\t\t1: shadow stack access fault', { cite: 'arch/x86/include/asm/trap_pf.h, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.bits([
          { bits: '6', val: '0', name: 'shadow stack', tone: 'mute' },
          { bits: '5', val: '0', name: 'protection key', tone: 'mute' },
          { bits: '4', val: '0', name: 'instruction fetch', tone: 'mute' },
          { bits: '3', val: '0', name: 'reserved bit', tone: 'mute' },
          { bits: '2', val: '1', name: 'user mode', tone: 'a2' },
          { bits: '1', val: '1', name: 'write', tone: 'a2' },
          { bits: '0', val: '0', name: 'no translation', tone: 'a1' }
        ], { title: 'Error code 0x6 of the first store', dense: true });
        L.p('0x6 is binary 110: a write (bit 1), from user mode (bit 2), to an address with no translation (bit 0 clear). That is the store into a region whose tables did not exist yet.');
        L.p('Bit 0 is the one to read first. 0 means a walk found P = 0 somewhere; 1 means a translation existed but its permissions refused the access.');
        L.try('Decode an error code', 'Type a code or tick bits. Try 0x6, 0x7, 0x4, 0x15 and 0x5, the codes in the next section.', function (el) { LW().errDecoder(el, {}); });
      } },
      { id: 'kinds', title: 'Every kind of refusal', body: function (L) {
        L.p('A second program makes one access of each kind and catches the signal. Its handler prints the exception number and the error code the kernel passes on:');
        L.out('err.codes', { wide: true });
        L.table(['Access', 'Code', 'The CPU found', 'The kernel did'], [
          ['read, nothing mapped', '0x4', 'no translation', 'no region there: SIGSEGV, SEGV_MAPERR'],
          ['write, nothing mapped', '0x6', 'no translation', 'no region there: SEGV_MAPERR'],
          { cells: ['write to a PROT_READ page, untouched', '0x6', 'no translation', 'the region forbids writes: SEGV_ACCERR'], hot: true },
          ['read a PROT_READ page', '(0x4)', 'no translation', 'allowed: mapped the zero page, no signal'],
          ['write that page after the read', '0x7', 'a read-only translation', 'the region forbids writes: SEGV_ACCERR'],
          ['read a PROT_NONE page', '0x4', 'no translation (PROT_NONE clears P)', 'the region forbids reads: SEGV_ACCERR'],
          ['call into a read-write page', '0x15', 'a translation with NX = 1', 'no execute permission: SEGV_ACCERR'],
          ['read the kernel half', '0x5', 'a translation with U/S = 0', 'kernel address: SEGV_MAPERR']
        ], { mono: false });
        L.p('The second and third lines both report 0x6, yet one is a missing region and the other a read-only one. The error code says what the walk found; the kernel decides with its list of regions.', ['sigsegv']);
        L.p('The trace event fires for every fault, including the one the kernel fixed silently:');
        L.out('err.trace');
        L.p('The read of the PROT_READ page faulted with 0x4 and got the shared zero page ([[ch:vm-demand]]). The call faulted on the instruction fetch itself: its instruction pointer equals the faulting address.');
      } },
      { id: 'kernel', title: 'Inside the kernel', body: function (L) {
        L.p('The fault enters the kernel at <code>exc_page_fault()</code>, which reads CR2 and calls <code>handle_page_fault()</code>. Kernel addresses and user addresses go separate ways:');
        L.quote('trace_page_fault_entries(regs, error_code, address);\n…\n/* Was the fault on kernel-controlled part of the address space? */\nif (unlikely(fault_in_kernel_space(address))) {\n        do_kern_addr_fault(regs, error_code, address);\n} else {\n        do_user_addr_fault(regs, error_code, address);', { cite: 'arch/x86/mm/fault.c, handle_page_fault(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('For a user address, the kernel looks up the region that contains it, then checks the access against the region’s permissions:');
        L.quote('vma = lock_mm_and_find_vma(mm, address, regs);\nif (unlikely(!vma)) {\n        bad_area_nosemaphore(regs, error_code, address);\n        return;\n}\n\n/*\n * Ok, we have a good vm_area for this memory access, so\n * we can handle it..\n */\nif (unlikely(access_error(error_code, vma))) {\n        bad_area_access_error(regs, error_code, address, mm, vma);\n        return;\n}\n…\nfault = handle_mm_fault(vma, address, flags, regs);', { cite: 'arch/x86/mm/fault.c, do_user_addr_fault(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.chain([
          { k: 'exc_page_fault', v: 'read CR2', d: 'the CPU entered the kernel' },
          { k: 'find the region', v: 'none?', d: 'SIGSEGV, SEGV_MAPERR' },
          { k: 'check the access', v: 'forbidden?', d: 'SIGSEGV, SEGV_ACCERR' },
          { k: 'handle_mm_fault', v: 'fix the page', d: 'tables, a frame, a copy', hot: true },
          { k: 'return', v: 'restart', d: 'the instruction runs again' }
        ], { vertical: true });
        L.p('<code>handle_mm_fault()</code> is where the rest of this part happens: [[ch:vm-demand]] fills in fresh pages, [[ch:vm-files]] reads files, and [[ch:vm-cow]] copies pages after fork.');
        L.p('One detail protects the kernel half. For a user access to a kernel address, Linux always reports bit 0 set, so a program cannot learn which kernel addresses are mapped:');
        L.quote('/*\n * To avoid leaking information about the kernel page\n * table layout, pretend that user-mode accesses to\n * kernel addresses are always protection faults.\n …\n */\nif (address >= TASK_SIZE_MAX)\n        *error_code |= X86_PF_PROT;', { cite: 'arch/x86/mm/fault.c, sanitize_error_code(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.note('arm', 'On AArch64 a failed walk raises a data abort, or an instruction abort for a fetch. FAR_EL1 receives the address, as CR2 does, and ESR_EL1 a syndrome that includes the level that failed: Linux’s table of fault codes reads “level 0 translation fault” to “level 3 permission fault” (arch/arm64/mm/fault.c). An x86 error code does not say which level stopped the walk.');
      } }
    ],
    check: [
      { q: 'A user-mode store hits a page whose PT entry is present but read-only. Which error code does the CPU push?', options: ['0x7', '0x6', '0x5', '0x4'], answer: 0, why: 'P = 1 (a translation existed), W = 1 (a write), U = 1 (user mode): 0b111.' },
      { q: 'The error code is 0x15. What happened?', options: ['A user-mode instruction fetch from a page that exists but forbids execution', 'A kernel-mode write to a missing page', 'A user-mode read of a missing page', 'A reserved bit was set in an entry'], answer: 0, why: '0x15 = bits 0, 2 and 4: a translation existed, user mode, instruction fetch. NX refused it.' },
      { q: 'Where does the kernel find the address that faulted?', options: ['In CR2 (or in the event data on CPUs with FRED)', 'In CR3', 'In the error code', 'In the saved instruction pointer'], answer: 0, why: 'exc_page_fault() reads it with read_cr2(). The saved instruction pointer says which instruction, not which address.' },
      { q: 'Two faults both report 0x6. One ends with SEGV_MAPERR, the other with SEGV_ACCERR. What decided?', options: ['Whether the address lies in a region, and whether that region allows writes', 'Bit 3 of the error code', 'What the TLB held', 'Which CPU took the fault'], answer: 0, why: 'No region: bad_area_nosemaphore() and SEGV_MAPERR. A region that forbids the write: bad_area_access_error() and SEGV_ACCERR.' }
    ],
    remember: [
      'A failed walk raises #PF, exception 14: CR2 = the address, the error code = why, the saved RIP = which instruction.',
      'Error code bits: 0 a translation existed, 1 write, 2 user mode, 3 reserved bit, 4 instruction fetch, 5 protection key, 6 shadow stack.',
      'The kernel decides with its regions: none → SEGV_MAPERR; forbidden → SEGV_ACCERR; otherwise fix the page and restart the instruction.',
      'Non-canonical addresses raise #GP, trap 13, never #PF.'
    ],
    sources: [['Linux v6.18: arch/x86/mm/fault.c', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/mm/fault.c'], ['Linux v6.18: arch/x86/include/asm/trap_pf.h', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/include/asm/trap_pf.h'], ['Intel SDM Vol. 3A (rev. 093), §5.7 “Page-fault exceptions”', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html'], ['Linux v6.18: arch/arm64/mm/fault.c', 'https://github.com/torvalds/linux/blob/v6.18/arch/arm64/mm/fault.c']]
  });
  /* ---------- III.14 ---------- */
  App.lesson({
    id: 'vm-demand', short: 'Demand paging', title: 'Demand paging and the zero page',
    lede: 'Memory is handed out on first touch. The fault handler builds the missing tables, takes a zeroed frame and runs the instruction again.',
    know: ['mmap only adds a region; no tables, no frames ([[ch:vm-space]]).', 'The first store faulted with 0x6: no translation, a write, user mode ([[ch:vm-faults]]).', 'The walk to our page needs a PDPT, a PD and a PT below PML4 entry 254 ([[ch:vm-walk]]).'],
    learn: ['Read in a kernel trace what one first touch allocates', 'Say why fresh frames are zeroed, and why installing one needs no TLB flush', 'Explain what a first read maps, and what a later write costs', 'Predict the fault counts of read and write passes over a fresh region'],
    sections: [
      { id: 'touch', title: 'What one store allocates', body: function (L) {
        L.p('[[ch:vm-faults]] stopped at the moment the kernel calls <code>handle_mm_fault()</code> for the first store. The trace lists every block it then took from the page allocator:');
        L.out('story.alloc', { lines: [0, 1, 2, 3, 4, 5], wide: true });
        L.p('The flags say what each block is for. GFP_KERNEL_ACCOUNT is kernel memory charged to the process; GFP_HIGHUSER_MOVABLE is memory for a user page that the kernel may later move to another frame.', ['gfp']);
        L.table(['Frame', 'Allocated with', 'Becomes'], [
          ['0x133c05', 'GFP_KERNEL_ACCOUNT | __GFP_ZERO', 'the PDPT that PML4 entry 254 will point to'],
          ['0x128e8c', 'GFP_KERNEL_ACCOUNT | __GFP_ZERO', 'the PD below PDPT entry 232'],
          ['0x1330d4', 'GFP_KERNEL_ACCOUNT | __GFP_ZERO', 'the PT below PD entry 217'],
          { cells: ['0x129b49', 'GFP_HIGHUSER_MOVABLE | __GFP_ZERO', 'the data page, mapped by PT entry 195'], hot: true }
        ], { mono: true });
        L.p('The kernel builds the path top down, so the three tables come in walk order. These are the frames [[ch:vm-walk]] stepped through, and the 12 kB VmPTE grew by in [[ch:vm-tree]].');
      } },
      { id: 'zeros', title: 'Every frame starts as zeros', body: function (L) {
        L.p('All four blocks carry __GFP_ZERO: the allocator fills them with zeros before handing them over.');
        L.p('For a table, zeros mean 512 empty entries, all with P = 0. For the data page, zeros are a promise: anonymous memory reads as zeros until written, whatever the frame held before.', ['anon']);
        L.quote('#define vma_alloc_zeroed_movable_folio(vma, vaddr) \\\n\tvma_alloc_folio(GFP_HIGHUSER_MOVABLE | __GFP_ZERO, 0, vma, vaddr)', { cite: 'arch/x86/include/asm/page.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('The kernel writes those zeros through its direct map ([[ch:vm-tree]]), at the frame’s kernel address:');
        L.code('0xffff888000000000 + 0x129b49000 = 0xffff888129b49000', { lang: 'text', title: 'the data frame in the direct map', label: 'Inference' });
        L.p('Zeroing is part of the price of every first touch; [[ch:vm-cost]] measures it.');
      } },
      { id: 'restart', title: 'No flush, then the store again', body: function (L) {
        L.p('The handler writes the new PT entry and returns. It does not flush the TLB:');
        L.quote('set_ptes(vma->vm_mm, addr, vmf->pte, entry, nr_pages);\n\n/* No need to invalidate - it was non-present before */\nupdate_mmu_cache_range(vmf, vma, addr, vmf->pte, nr_pages);', { cite: 'mm/memory.c, do_anonymous_page(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('A TLB only caches translations that existed. The entry had P = 0, so no TLB on any CPU can hold one for this page.');
        L.p('The CPU then runs the store again. Now the walk succeeds, the TLB is filled, and the byte is written. A second store to the page costs nothing:');
        L.out('story.second');
        L.out('story.alloc', { lines: [6, 7], what: 'The trace from the second store’s marker to the next marker: no event at all.' });
      } },
      { id: 'zeropage', title: 'Reads get the zero page', body: function (L) {
        L.p('A read of a page nobody has written does not need a frame of its own: every byte is zero anyway. The main run loads from page 1:');
        L.out('story.zero', { lines: [0, 1, 2] });
        L.p('One fault, and the value 0. pagemap shows frame 0x3241 with exclusive = 0: a frame mapped in many places. It is the zero page, one frame for the whole system, mapped read-only.', ['zeropage']);
        L.quote('/* Use the zero-page for reads */\nif (!(vmf->flags & FAULT_FLAG_WRITE) &&\n\t\t!mm_forbids_zeropage(vma->vm_mm)) {\n\tentry = pte_mkspecial(pfn_pte(my_zero_pfn(vmf->address),\n\t\t\t\t\tvma->vm_page_prot));', { cite: 'mm/memory.c, do_anonymous_page(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('Machine B shows where that frame lives. A load there maps the same frame number, and 0x3241000 is the first page of the kernel’s bss, its zero-filled data:');
        L.out('zero.b');
        L.quote('\t__PAGE_ALIGNED_BSS\nSYM_DATA_START_PAGE_ALIGNED(empty_zero_page)\n\t.skip PAGE_SIZE\nSYM_DATA_END(empty_zero_page)', { cite: 'arch/x86/kernel/head_64.S, Linux v6.18', label: 'Linux source', code: true });
        L.p('Both machines run the same kernel build, and in the same physical place, so both report 0x3241.');
      } },
      { id: 'write', title: 'Writing after reading', body: function (L) {
        L.p('Page 1 is now mapped read-only, to the zero page. A store has to replace that mapping:');
        L.out('story.zero', { lines: [3, 4] });
        L.out('story.zerotrace', { wide: true });
        L.p('Error code 0x7: a write to a page that has a translation, which forbids writing. The kernel takes a zeroed frame, 0x125396, and points the entry at it.');
        L.p('This time it flushes one page: the read-only translation to the zero page may sit in the TLB. Nothing is copied from the zero page; the new frame is simply zeroed:');
        L.quote('pfn_is_zero = is_zero_pfn(pte_pfn(vmf->orig_pte));\nnew_folio = folio_prealloc(mm, vma, vmf->address, pfn_is_zero);\n…\nif (!pfn_is_zero) {\n\t…\n\terr = __wp_page_copy_user(&new_folio->page, vmf->page, vmf);', { cite: 'mm/memory.c, wp_page_copy(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('So a page read first and written later costs two faults instead of one. Over a 64 MiB region:');
        L.out('cost.counts');
        L.p('A store pass over a fresh region takes 16384 faults, one per page. A load pass first takes 16384 faults that map the zero page, and the stores then take 16384 more.');
        L.note('why', 'Reading a large fresh buffer before writing it (checking it, summing it) doubles its page faults. Writing it first, or filling it in ahead of time with MADV_POPULATE_WRITE ([[ch:vm-cost]]), avoids the second round.');
        L.note('linux', 'On a machine with several memory nodes, the data frame comes from the node of the CPU that first touches the page, not the one that called mmap ([[ch:hier]] has a NUMA lab). Machine B has one node (labruns/machine-b.txt), so there is only one choice.', 'First touch decides the node');
      } }
    ],
    check: [
      { q: 'The first store into a fresh region allocated four frames. Which one holds the program’s byte?', options: ['The GFP_HIGHUSER_MOVABLE one, 0x129b49', 'The first one, 0x133c05', 'All four, a byte in each', 'None: the byte waits in the store buffer'], answer: 0, why: 'The three GFP_KERNEL_ACCOUNT blocks are page tables; the user page is allocated with GFP_HIGHUSER_MOVABLE.' },
      { q: 'Why does installing the new entry need no TLB flush?', options: ['The entry was not present, so no TLB can hold a translation for it', 'The kernel flushes at the next context switch anyway', 'TLBs are coherent', 'The new entry is global'], answer: 0, why: 'TLBs cache only valid translations. P was 0.' },
      { q: 'A program reads a fresh page, then writes it. How many faults, and how many frames are allocated?', options: ['Two faults, one frame', 'One fault, one frame', 'Two faults, two frames', 'One fault, no frame'], answer: 0, why: 'The read maps the shared zero page (no allocation); the write takes one zeroed frame.' },
      { q: 'pagemap shows pfn 0x3241 with exclusive = 0 for a page the program has only read. What is it?', options: ['The shared zero page', 'A page-cache page', 'A copy-on-write copy', 'A page being swapped out'], answer: 0, why: 'Reads of never-written anonymous memory map the zero page, one frame shared by every such mapping.' }
    ],
    remember: [
      'First touch allocates the missing tables (GFP_KERNEL_ACCOUNT) and a data frame (GFP_HIGHUSER_MOVABLE), all zeroed.',
      'Installing an entry that was not present needs no TLB flush; the faulting instruction then runs again.',
      'A first read maps the shared zero page read-only (pfn 0x3241 here). A later write takes a fresh zeroed frame and flushes one page.',
      'Read-then-write costs two faults per page; write-first costs one.'
    ],
    sources: [['Linux v6.18: mm/memory.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/memory.c'], ['mmap(2): MAP_ANONYMOUS', 'https://man7.org/linux/man-pages/man2/mmap.2.html'], ['Linux v6.18: arch/x86/kernel/head_64.S', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/kernel/head_64.S']]
  });

  /* ---------- III.15 ---------- */
  App.lesson({
    id: 'vm-files', short: 'File mappings', title: 'File mappings, the page cache and major faults',
    lede: 'A mapped file is read through the page cache. The first touch may wait for the disk; a write to a private mapping makes a copy and leaves the file alone.',
    know: ['Anonymous memory gets a zeroed frame on first touch ([[ch:vm-demand]]).', 'A region can come from a file: the program’s code does ([[ch:vm-space]]).', 'The kernel’s fault handler chooses its path from the region and the access ([[ch:vm-faults]]).'],
    learn: ['Say what the page cache is, and who shares it', 'Tell a major fault from a minor one, and count both', 'Follow a write into a MAP_PRIVATE file mapping: a copy, a flush, the file unchanged', 'Say what MAP_SHARED, fault-around and readahead change'],
    sections: [
      { id: 'cache', title: 'The page cache', body: function (L) {
        L.p('Linux keeps the contents of files in RAM, in frames called the page cache. <code>read()</code> copies out of those frames; <code>mmap</code> maps them straight into a process.', ['pagecache']);
        L.chain([
          { k: 'storage', v: 'the file', d: 'read once, on the first miss' },
          { k: 'page cache', v: 'one frame per 4 KiB', d: 'shared by everyone using the file', hot: true },
          { k: 'processes', v: 'mmap / read()', d: 'mmap maps the frame; read() copies from it' }
        ]);
        L.p('So two processes that map the same file, and a third that reads it, all use the same frames. The C library’s code, mapped by every process, is in memory once.');
      } },
      { id: 'major', title: 'The first touch waits for the disk', body: function (L) {
        L.p('A program writes a 4 KiB file, drops the clean page cache so that the file must come from the disk again, and maps it with MAP_PRIVATE:');
        L.code('int fd = open(path, O_RDWR | O_CREAT | O_TRUNC, 0644);\nwrite(fd, buf, 4096);                 /* "HELLO from the file on disk" */\nfsync(fd);\n/* write 1 to /proc/sys/vm/drop_caches: forget clean page-cache pages */\nchar *p = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE, fd, 0);\nc = p[0];                             /* first load  */\nc = p[1];                             /* second load */\np[0] = \'J\';                           /* store       */', { title: 'labruns/vm/major.c (shortened)' });
        L.out('major.run', { lines: [0, 1, 2, 3] });
        L.p('The first load was a major fault: the kernel had to read the file from the disk while the program waited. The second load caused no fault at all.', ['majorfault', 'minor_fault']);
        L.out('major.trace', { lines: [0, 1, 2, 3] });
        L.p('The trace shows the kernel taking frame 0x10fa24 and adding it to the page cache for this file: inode 0xda7a5, which is 894885, offset 0.');
        L.bits([
          { bits: '63', val: '1', name: 'present', tone: 'a2' },
          { bits: '62', val: '0', name: 'swapped', tone: 'mute' },
          { bits: '61', val: '1', name: 'file or shared', tone: 'a2', hot: true },
          { bits: '57–60', val: '0', name: '', tone: 'mute' },
          { bits: '56', val: '1', name: 'mapped once', tone: 'a2' },
          { bits: '55', val: '0', name: 'soft-dirty', tone: 'mute' },
          { bits: '54:0', val: '0x10fa24', name: 'PFN', tone: 'a4', w: 2.4 }
        ], { title: 'pagemap entry 0xa10000000010fa24', dense: true });
        L.p('Bit 61 is set: the page maps a frame of a file. The process is using the page cache’s own frame, not a copy.');
      } },
      { id: 'private', title: 'A private write makes a copy', body: function (L) {
        L.p('The region is <code>rw-p</code>, but the frame belongs to the page cache, which other processes may be reading. So the read fault mapped it read-only.');
        L.out('major.run', { lines: [4, 5, 6] });
        L.out('major.trace', { lines: [5, 6, 7, 8], wide: true });
        L.p('The store faulted with 0x7, a write to a read-only translation. The kernel took frame 0x11da16 without __GFP_ZERO, because it fills it by copying the page-cache page, then flushed the old translation.');
        L.p('Memory now reads JELLO and the file still reads HELLO. The copy is anonymous memory: pagemap no longer shows bit 61.');
        L.p('A first touch that is already a write takes a shorter path, chosen when the fault arrives:');
        L.quote('} else if (!(vmf->flags & FAULT_FLAG_WRITE))\n\tret = do_read_fault(vmf);\nelse if (!(vma->vm_flags & VM_SHARED))\n\tret = do_cow_fault(vmf);\nelse\n\tret = do_shared_fault(vmf);', { cite: 'mm/memory.c, do_fault(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('Here the page was already mapped read-only, so the store went through the write-protect path instead, the same one that copies pages after fork ([[ch:vm-cow]]).');
      } },
      { id: 'shared', title: 'MAP_SHARED writes reach the file', body: function (L) {
        L.p('With MAP_SHARED, a store goes into the page-cache frame itself. Every process that maps the file sees it at once, and read() returns it.');
        L.p('The frame is now dirty: newer than the file. The kernel writes it back later, by itself, or at once when the program calls <code>msync()</code> or <code>fsync()</code>.', ['writeback']);
        L.table(['', 'MAP_PRIVATE', 'MAP_SHARED'], [
          ['reads', 'the page-cache frame, mapped read-only', 'the page-cache frame'],
          ['the first write', 'faults, and the page gets a private copy', 'writes the page-cache frame'],
          ['other processes see the write', 'no', 'yes'],
          ['the file changes', 'never', 'at writeback, or at msync / fsync']
        ], { mono: false });
      } },
      { id: 'around', title: 'Fewer faults: fault-around and readahead', body: function (L) {
        L.p('Reading a file one page at a time would cost one fault per page. Two mechanisms cut that down.');
        L.p('Fault-around: on a read fault, Linux also maps the neighbouring pages that are already in the page cache, up to 64 KiB around the address:');
        L.quote('/*\n * do_fault_around() tries to map few pages around the fault address. The hope\n * is that the pages will be needed soon and this will lower the number of\n * faults to handle.\n …\nstatic unsigned long fault_around_pages __read_mostly =\n\t65536 >> PAGE_SHIFT;', { cite: 'mm/memory.c, Linux v6.18 (excerpts)', label: 'Linux source', code: true });
        L.p('Readahead: when a fault has to go to the disk, the kernel reads a window of the file around the page, so that later faults find the pages in the cache:');
        L.quote('/*\n * mmap read-around\n */\nra->start = max_t(long, 0, vmf->pgoff - ra->ra_pages / 2);\nra->size = ra->ra_pages;', { cite: 'mm/filemap.c, do_sync_mmap_readahead(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('Our file was a single page, so neither shows in the run. For a large file, the first major fault brings in a whole window, and fault-around turns the following touches into fewer, minor faults.');
        L.note('linux', 'getrusage() reports minor and major faults separately (ru_minflt, ru_majflt), as do /proc/&lt;pid&gt;/stat and <code>/usr/bin/time -v</code>. A major-fault count that keeps rising means the program waits for storage.');
      } }
    ],
    check: [
      { q: 'A program maps a file that is already in the page cache and reads its first byte. What kind of fault is that?', options: ['A minor fault: the frame is already in RAM', 'A major fault', 'No fault at all', 'A protection fault'], answer: 0, why: 'The kernel only has to point an entry at the existing page-cache frame.' },
      { q: 'After a store into a MAP_PRIVATE file mapping, what does the file contain?', options: ['The old contents: the store went to a private copy', 'The new byte, once written back', 'Zeros', 'It depends on fsync'], answer: 0, why: 'The run: memory reads JELLO, the file still reads HELLO.' },
      { q: 'Why was the copy’s frame allocated without __GFP_ZERO?', options: ['It is filled by copying the page-cache page, so zeroing first would be wasted', 'File pages are never zeroed', 'GFP_HIGHUSER_MOVABLE zeroes by itself', 'The trace drops that flag'], answer: 0, why: 'folio_prealloc() zeroes only when the old page is the zero page; otherwise the contents are copied.' },
      { q: 'pagemap bit 61 was set after the first load and clear after the store. Why?', options: ['The page first mapped the file’s page-cache frame, then a private anonymous copy', 'The store set the dirty bit', 'Bit 61 means present', 'The file was deleted'], answer: 0, why: 'Bit 61 marks file-backed (or shared) pages. The private copy is anonymous.' }
    ],
    remember: [
      'File contents live in the page cache: read() copies from it, mmap maps it directly, and everyone shares one copy.',
      'Major fault: the kernel must read storage. Minor fault: the frame is already in RAM.',
      'MAP_PRIVATE: the first write faults (0x7) and gets a copy; the file never changes. MAP_SHARED: writes go to the page cache and back to the file.',
      'Fault-around maps up to 64 KiB of cached neighbours per read fault; readahead reads a window around a missing page.'
    ],
    sources: [['Linux v6.18: mm/memory.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/memory.c'], ['Linux v6.18: mm/filemap.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/filemap.c'], ['mmap(2)', 'https://man7.org/linux/man-pages/man2/mmap.2.html'], ['getrusage(2)', 'https://man7.org/linux/man-pages/man2/getrusage.2.html']]
  });

})();
