/* ======================= Part III · Virtual memory, lessons 9–12 ======================= */
(function () {
  'use strict';
  var LW = function () { return App.LW; };
  var d = App.gloss;
  d('madvise', 'madvise', 'A system call that gives the kernel advice about a range of memory. MADV_HUGEPAGE asks for huge pages, MADV_DONTNEED drops pages, MADV_POPULATE_WRITE fills pages in ahead of time.');
  d('order', 'order (of a block)', 'The size of a block from the kernel’s page allocator, as a power of two: order 0 is one 4 KiB frame, order 9 is 512 contiguous frames (2 MiB).');
  d('smaps', '/proc/self/smaps', 'The maps list with memory counters under each region, such as Rss (memory present in RAM) and AnonHugePages (memory backed by transparent huge pages).');
  d('compaction', 'compaction', 'Moving in-use pages to other frames so that free frames end up next to each other and form large blocks. Only movable pages, such as user memory, can be moved.');
  d('hugetlb', 'hugetlb pages', 'Huge pages taken from a pool reserved in advance (vm.nr_hugepages) and used only by programs that ask for them, with MAP_HUGETLB or through the hugetlbfs file system. They are never swapped out.');
  d('khugepaged', 'khugepaged', 'A kernel thread that scans memory and replaces runs of 512 small pages with one huge page when it can.');
  d('cpuid', 'CPUID', 'The x86 instruction that reports the processor’s model, features and cache sizes. In a virtual machine, the hypervisor decides what it returns.');
  d('valias', 'alias', 'Two different virtual addresses that map the same physical frame.');
  d('ctxsw', 'context switch', 'The kernel stopping one thread on a CPU and starting another. If the two belong to different processes, it also loads the next process’s top table into CR3.');
  d('ipi', 'interprocessor interrupt (IPI)', 'An interrupt one CPU sends to another, for example to ask it to flush its TLB. Linux counts those it receives for TLB flushes as “TLB shootdowns” in /proc/interrupts.');
  d('lazytlb', 'lazy TLB mode', 'When a CPU switches to a kernel thread, which has no user half of its own, Linux keeps the previous process’s tables loaded instead of writing CR3. TLB shootdowns skip such a CPU; it flushes when it next switches to a process.');
  d('kpti', 'KPTI (page-table isolation)', 'Linux’s defence against Meltdown: each process gets a second top table that maps almost none of the kernel, used while user code runs. Every entry into the kernel switches CR3 to the full table and back.');

  var P = App.P;
  var SRC_THP = ['Linux: transparent hugepage support', 'https://docs.kernel.org/admin-guide/mm/transhuge.html'];
  var SRC_HTLB = ['Linux: HugeTLB pages', 'https://docs.kernel.org/admin-guide/mm/hugetlbpage.html'];
  var SRC_AMD17 = ['AMD, Software Optimization Guide for Family 17h, pub. 55723', 'https://docs.amd.com/v/u/en-US/55723_3.01_PUB'];

  /* ---------- III.09 ---------- */
  App.lesson({
    id: 'vm-huge', short: 'Huge pages', title: 'Huge pages',
    lede: 'One entry can map 2 MiB instead of 4 KiB. The walk ends a level early, and one TLB entry covers 512 times more memory.',
    know: ['Bit 7 of a PD entry, PS, can end the walk there; a PD entry covers 2 MiB ([[ch:vm-pte]]).', 'TLB reach is entries × page size, and the 4 KiB chase slowed down past it ([[ch:vm-tlb]]).'],
    learn: ['Split an address for a 2 MiB page and build its physical address', 'Read a huge-page fault in a kernel trace', 'Tell transparent huge pages from hugetlb pages', 'Weigh what huge pages cost against the reach they buy'],
    sections: [
      { id: 'ps', title: 'PS = 1 ends the walk early', body: function (L) {
        L.p('[[ch:vm-pte]] showed bit 7 of a PD entry, PS. When it is 1, the entry does not point to a page table. It maps a 2 MiB block of physical memory by itself.', ['ptePS']);
        L.p('The walk then stops after three reads. The 9 bits that would have picked a PT entry join the offset, which grows from 12 bits to 21.');
        L.bits([
          { bits: '63:48', val: '0x0000', name: 'copies of bit 47', tone: 'mute', w: 1.2 },
          { bits: '47:39', val: '254', name: 'PML4 index', tone: 'a1' },
          { bits: '38:30', val: '232', name: 'PDPT index', tone: 'a1' },
          { bits: '29:21', val: '217', name: 'PD index', tone: 'a1' },
          { bits: '20:0', val: '0x0c3d4e', name: 'offset in the 2 MiB page', tone: 'a3', w: 2 }
        ], { title: 'The virtual address 0x00007f3a1b2c3d4e with a 2 MiB page' });
        L.p('The upper three indices are the ones from [[ch:vm-levels]]: 254, 232 and 217. The low 21 bits, 0xc3d4e, are now the offset inside the 2 MiB page.');
        L.code('2^21 bytes = 2 MiB = 512 × 4 KiB\n\n0x7f3a1b2c3d4e &  0x1fffff = 0x0c3d4e        /* offset in the 2 MiB page */\n0x7f3a1b2c3d4e & ~0x1fffff = 0x7f3a1b200000  /* where the 2 MiB page starts */', { lang: 'text', title: 'arithmetic' });
        L.chain([
          { k: 'CR3', v: 'top table', d: 'as before' },
          { k: 'PML4 entry 254', v: '→ PDPT', d: 'read 1' },
          { k: 'PDPT entry 232', v: '→ PD', d: 'read 2' },
          { k: 'PD entry 217', v: 'PS = 1', d: 'read 3: holds the 2 MiB frame’s address', hot: true },
          { k: 'physical address', v: 'frame + 21-bit offset', d: 'no PT, no fourth read' }
        ], { cap: 'A walk to a 2 MiB page: three dependent reads instead of four.' });
        L.p('A PDPT entry with PS = 1 does the same one level higher. It maps a 1 GiB page, and the offset is 30 bits. The next section watches the kernel build a 2 MiB one.');
      } },
      { id: 'fault', title: 'One fault, 512 frames', body: function (L) {
        L.p('A second program maps 2 MiB at 0x7f3a1b200000 and asks for a huge page with <code>madvise</code>. Then it stores one byte at the same address as the main run.', ['madvise']);
        L.code('char *p = mmap((void *)0x7f3a1b200000, 2 << 20, PROT_READ | PROT_WRITE,\n               MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED_NOREPLACE, -1, 0);\nmadvise(p, 2 << 20, MADV_HUGEPAGE);      /* ask for a huge page   */\np[0xc3d4e] = 1;                          /* 0x7f3a1b2c3d4e        */', { title: 'labruns/vm/thp.c (shortened)' });
        L.p('The kernel trace shows the fault and every block the fault handler took from the page allocator:');
        L.out('thp.trace', { wide: true });
        L.p('Error code 0x6 is a write from user mode to an address with no translation, as in the main run.');
        L.p('Then two page tables, each one zeroed 4 KiB frame (order 0): a new PDPT and a new PD. There is no PT for this address, because the PD entry will map the page itself.', ['order']);
        L.p('Then one block of order 9: 2⁹ = 512 contiguous frames starting at PFN 0x158800. That block is the 2 MiB page. The last line is a fourth table; the next section explains it.');
        L.out('thp.result');
        L.p('One fault made all 2 MiB resident: <code>Rss</code> and <code>AnonHugePages</code> are both 2048 kB. VmPTE grew by 12 kB, three tables: the PDPT, the PD and that fourth one.', ['smaps']);
        L.p('pagemap still reports in 4 KiB pieces. Three pieces of the region:');
        L.out('thp.pagemap');
        L.p('0x158800, 0x1588c3 and 0x1589ff: one run of consecutive frames. The piece at +0xc3000 has frame 0x158800 + 0xc3.');
        L.p('The first frame number is a multiple of 512. A 2 MiB page starts on a 2 MiB boundary in physical memory, just as it does in virtual memory.');
        L.code('NX                      0x8000000000000000\nframe 0x158800 << 12    0x0000000158800000\nflags PS D A U/S R/W P  0x00000000000000e7\n                        ------------------\nPD entry 217            0x80000001588000e7\n\nphysical address = 0x158800000 + 0xc3d4e = 0x1588c3d4e', { lang: 'text', title: 'computed from the measured frame and the flags Linux writes', label: 'Inference' });
        L.p('0xe7 is the 0x67 of a 4 KiB entry plus bit 7, PS. Linux builds the entry the same way as the small one: from the region’s permissions, then dirty and writable for a write fault.');
        L.quote('entry = folio_mk_pmd(folio, vma->vm_page_prot);\nentry = maybe_pmd_mkwrite(pmd_mkdirty(entry), vma);', { cite: 'mm/huge_memory.c, map_anon_folio_pmd(), Linux v6.18', label: 'Linux source', code: true });
        L.try('Split for a 2 MiB page', 'The page size is set to 2 MiB and the frame to the measured 0x158800. Try a frame number that is not a multiple of 512.', function (el) { LW().splitter(el, { size: 21, pfnValue: '0x158800' }); });
      } },
      { id: 'deposit', title: 'The spare table', body: function (L) {
        L.p('Why allocate a page table that nothing points to? Because a huge page may later have to become 512 small ones.');
        L.p('That happens when a program changes the permissions of part of it with <code>mprotect</code>, or unmaps part of it. Each 4 KiB piece then needs its own entry, in a PT.');
        L.p('Linux allocates that PT at fault time and parks it beside the PD entry. In the fault handler, the huge page comes first, then the table:');
        L.quote('folio = vma_alloc_anon_folio_pmd(vma, vmf->address);\n…\npgtable = pte_alloc_one(vma->vm_mm);\n…\npgtable_trans_huge_deposit(vma->vm_mm, vmf->pmd, pgtable);\nmap_anon_folio_pmd(folio, vmf->pmd, vma, haddr);', { cite: 'mm/huge_memory.c, __do_huge_pmd_anonymous_page(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('That is the order of the trace: the order-9 block, then the order-0 table. <code>pgtable_trans_huge_deposit</code> sets the table aside; then the PD entry is written.');
        L.p('When a split comes, the kernel takes the table back, fills in 512 entries, one per 4 KiB piece, and points the PD entry at it:');
        L.quote('pgtable = pgtable_trans_huge_withdraw(mm, pmd);\npmd_populate(mm, &_pmd, pgtable);', { cite: 'mm/huge_memory.c, __split_huge_pmd_locked(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('So a split never has to allocate memory and can never fail for lack of it. The spare table is counted in VmPTE from the start.');
      } },
      { id: 'kinds', title: 'Two ways to get huge pages', body: function (L) {
        L.p('Linux offers huge pages in two ways. Transparent huge pages (THP) are automatic: the kernel tries to use a 2 MiB page whenever an aligned 2 MiB range of anonymous memory is first touched.', ['thp']);
        L.p('Where it tries is a setting. The lab machine tries only in regions marked with <code>MADV_HUGEPAGE</code>:');
        L.out('facts.thp', { lines: [0, 1, 2] });
        L.p('The selected word is in brackets. <code>enabled</code> = madvise: only marked regions get huge pages at fault time. <code>defrag</code> = madvise: in marked regions a fault may wait while the kernel makes a free 2 MiB block.');
        L.quote(' * madvise: directly stall for MADV_HUGEPAGE, otherwise fail if not immediately\n *          available', { cite: 'mm/huge_memory.c, comment above vma_thp_gfp_mask(), Linux v6.18', label: 'Linux source', code: true });
        L.p('If no block can be found, the fault quietly maps a 4 KiB page instead. THP is best effort. A kernel thread, <code>khugepaged</code>, later tries to replace runs of small pages with huge ones.', ['khugepaged']);
        L.p('The second way is hugetlb: a pool of huge pages reserved in advance, used only by programs that ask for it. Neither lab machine has a pool, so asking fails:', ['hugetlb']);
        L.out('hugetlb.pool', { lines: [0, 1, 2] });
        L.p('With one page in the pool, the same request works. One store, one fault, and a frame number that is a multiple of 512:');
        L.out('hugetlb.pool', { lines: [3, 4, 5, 6, 7, 8, 9, 10], what: 'The same program, after one page was added to the pool.' });
        L.table(['', 'Transparent huge pages', 'hugetlb pages'], [
          ['who asks', 'nobody, or madvise as a hint', 'the program: MAP_HUGETLB or hugetlbfs'],
          ['where pages come from', 'the normal page allocator, if a free 2 MiB block exists', 'a pool reserved in advance'],
          ['if none is free', 'falls back to 4 KiB pages', 'mmap fails'],
          ['sizes on x86-64', '2 MiB', '2 MiB, or 1 GiB if the CPU has pdpe1gb'],
          ['split or swapped out', 'yes', 'never']
        ], { mono: false });
        L.p('Machine A reports <code>pdpe1gb</code> ([[ch:vm-walk]] listed its flags), so 1 GiB hugetlb pages would be possible there, with a pool of 1 GiB pages.');
        L.note('linux', 'Linux can also give anonymous memory blocks between 4 KiB and 2 MiB, such as 16 KiB or 64 KiB (multi-size THP, one setting per size under /sys/kernel/mm/transparent_hugepage/hugepages-&lt;size&gt;kB/). They are still mapped with 4 KiB entries, so they cut faults, not TLB entries, unless the CPU can merge contiguous entries.', 'Sizes in between');
        L.note('arm', 'With a 4 KiB granule, an AArch64 block descriptor at level 2 maps 2 MiB and at level 1 maps 1 GiB, as PS does on x86. Arm adds a contiguous bit: a run of adjacent entries that map adjacent frames can be held as one TLB entry. Linux uses both, and lists the sizes it gets for each granule:');
        L.table(['Granule', 'Contiguous PT entries', 'PMD block', 'Contiguous PMD entries', 'PUD block'], [
          ['4 KiB', '64 KiB', '2 MiB', '32 MiB', '1 GiB'],
          ['16 KiB', '2 MiB', '32 MiB', '1 GiB', '–'],
          ['64 KiB', '2 MiB', '512 MiB', '16 GiB', '–']
        ], { title: 'Documentation/arch/arm64/hugetlbpage.rst, Linux v6.18', label: 'Linux source', src: ['HugeTLBpage on ARM64', 'https://docs.kernel.org/arch/arm64/hugetlbpage.html'] });
      } },
      { id: 'price', title: 'What huge pages cost', body: function (L) {
        L.p('A huge page needs 512 free frames in a row, starting on a 2 MiB boundary. On a machine that has run for a while, free memory is scattered in small pieces, and such blocks become rare.');
        L.p('Linux can make one by moving pages out of the way. That is compaction, and with <code>defrag</code> = madvise a fault in a marked region may wait for it.', ['compaction']);
        L.p('The fault also does more work: it zeroes 2 MiB instead of 4 KiB. The same program that counted page tables timed both kinds of fault:');
        L.out('cost.time', { wide: true });
        L.p('A huge-page fault took 351 µs, a small one 1.7 µs. Per MiB, though, huge pages were 2.5 times cheaper. For each 2 MiB they need one fault instead of 512, one entry instead of 512, and one allocation instead of 512. [[ch:vm-cost]] takes these numbers apart.');
        L.p('Memory can be wasted too. A program that touches one byte of a 2 MiB range gets all 2 MiB, as the single store above did.');
      } },
      { id: 'reach', title: 'Reach, again', body: function (L) {
        L.p('The chase in [[ch:vm-tlb]] ran over 4 KiB and 2 MiB pages. Subtracting one column from the other leaves the time spent on translation:');
        L.table(['Working set', 'ns/hop, 4 KiB pages', 'ns/hop, 2 MiB pages', 'Difference'], [
          ['256 KiB (64 pages)', '1.54', '1.53', '0.01'],
          ['512 KiB (128 pages)', '3.73', '1.55', '2.18'],
          ['2 MiB (512 pages)', '3.68', '1.53', '2.15'],
          ['4 MiB (1024 pages)', '6.62', '4.28', '2.34'],
          ['8 MiB (2048 pages)', '8.78', '4.57', '4.21'],
          { cells: ['16 MiB (4096 pages)', '15.02', '4.93', '10.09'], hot: true },
          ['64 MiB (16384 pages)', '32.88', '8.72', '24.16'],
          ['256 MiB (65536 pages)', '180.45', '102.63', '77.82']
        ], { label: 'Inference', title: 'computed from tlb.chase (labruns/vm/out/tlb.txt)' });
        L.p('The 2 MiB column rises too, from 4 MiB on. That rise comes from the data caches: 1024 nodes sit in 1024 different lines, 64 KiB, more than the L1 holds. Both columns pay it, so it cancels out of the difference.');
        L.p('The difference grows from 2 ns to almost 80 ns per hop. At 256 MiB the 4 KiB pages need 65536 PT entries, 512 KiB of them, so the walks themselves miss in the caches.');
        L.p('With 2 MiB pages, all 256 MiB need 128 TLB entries, and their PD entries take only 1 KiB.');
        L.try('Reach with 2 MiB pages', 'Set to 2 MiB pages and a 256 MiB working set. Switch to 4 KiB and compare.', function (el) { LW().reach(el, { entries: 1536, page: 2097152, ws: 256 }); });
        L.p('Huge pages pay off when a program uses most of each 2 MiB it touches, and touches more memory than the TLB reaches with 4 KiB pages. The lab below shows the other case, where they do not help.');
        L.lab(function (el) { App.VMUI.labs.pages(el); });
        L.note('amd', 'TLB levels do not all hold every page size. In AMD’s Family 17h cores, the 64-entry L1 data TLB holds 4 KiB, 2 MiB and 1 GiB entries, but the 1536-entry L2 data TLB holds only 4 KiB and 2 MiB pages: “1-Gbyte [pages] are not held in the L2 data TLB; they are only held in the L1 data TLB” (pub. 55723 rev. 3.01, §2.7.2).');
      } }
    ],
    check: [
      { q: 'A PD entry has PS = 1. How many reads does the walk take, and how wide is the page offset?', options: ['Three reads; a 21-bit offset', 'Four reads; a 12-bit offset', 'Two reads; a 30-bit offset', 'Three reads; a 12-bit offset'], answer: 0, why: 'The walk stops at the PD entry, after PML4, PDPT and PD. The 9 PT-index bits join the 12 offset bits: 21 bits.' },
      { q: 'In the trace of the huge-page fault, which allocation is the huge page itself?', options: ['The order-9 block at pfn 0x158800', 'The first order-0 block', 'The last order-0 block', 'None: huge pages are reserved at boot'], answer: 0, why: 'Order 9 = 512 contiguous frames = 2 MiB. The order-0 blocks are page tables.' },
      { q: 'Why does the fault also allocate a page table that nothing points to yet?', options: ['So the huge page can later be split into 512 small pages without allocating', 'To hold the entry of the 2 MiB page', 'Because a walk always needs four tables', 'To map the zero page'], answer: 0, why: 'pgtable_trans_huge_deposit parks it; a split withdraws it and fills its 512 entries.' },
      { q: 'nr_hugepages is 0 and THP is set to madvise. A program calls mmap with MAP_HUGETLB. What happens?', options: ['mmap fails: the hugetlb pool is empty', 'It gets a transparent huge page instead', 'It silently gets 4 KiB pages', 'The kernel grows the pool by itself'], answer: 0, why: 'hugetlb pages come only from the reserved pool. Machine B printed “Cannot allocate memory” until the pool had a page.' }
    ],
    remember: [
      'PS = 1 in a PD entry maps 2 MiB: three reads, a 21-bit offset, a first frame number that is a multiple of 512.',
      'A THP fault takes one order-9 block and zeroes 2 MiB. It also sets aside one page table for a later split.',
      'THP: automatic, best effort, falls back to 4 KiB pages. hugetlb: a reserved pool, asked for explicitly, fails when empty.',
      'Huge pages pay off when most of each 2 MiB is used and the working set is past the 4 KiB TLB reach.'
    ],
    sources: [SRC_THP, SRC_HTLB, ['Linux v6.18: mm/huge_memory.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/huge_memory.c'], ['Linux: HugeTLBpage on ARM64', 'https://docs.kernel.org/arch/arm64/hugetlbpage.html'], SRC_AMD17]
  });

  /* ---------- III.10 ---------- */
  function viptFigure(sv) {
    var T = P.T, R = P.R;
    R(sv, 110, 8, 220, 46, 'box', 6);
    T(sv, 220, 26, 'virtual address', 's', 'middle');
    T(sv, 220, 45, '0x7f3a1b2c3d4e', 'h m', 'middle');
    P.A(sv, 'M160 54 L110 90');
    P.A(sv, 'M280 54 L330 90');
    T(sv, 96, 72, 'bits 47:12', 's m', 'end');
    T(sv, 344, 72, 'bits 11:6 = 53', 's m', 'start');
    R(sv, 10, 92, 200, 66, 'a4b', 6);
    T(sv, 110, 114, 'TLB', 'h', 'middle');
    T(sv, 110, 133, 'page 0x7f3a1b2c3', 's m', 'middle');
    T(sv, 110, 150, '→ frame 0x129b49', 's m', 'middle');
    R(sv, 230, 92, 200, 66, 'a3b', 6);
    T(sv, 330, 114, 'L1 data cache', 'h', 'middle');
    T(sv, 330, 133, 'read set 53:', 's', 'middle');
    T(sv, 330, 150, 'the tags of all 8 ways', 's', 'middle');
    P.A(sv, 'M110 158 L170 194', true);
    P.A(sv, 'M330 158 L270 194', true);
    R(sv, 110, 196, 220, 52, 'box on', 6);
    T(sv, 220, 216, 'compare each tag with 0x129b49', 's', 'middle');
    T(sv, 220, 236, 'match: the byte is at offset 14', 's', 'middle');
  }
  App.lesson({
    id: 'vm-vipt', short: 'The L1 and translation', title: 'Reading the L1 while translating',
    lede: 'The L1 cache picks its set with address bits that translation does not change, so the cache lookup and the translation run side by side.',
    know: ['The low 12 bits of an address pass through translation unchanged ([[ch:vm-pages]]).', 'Every access looks up the TLB before it can use a physical address ([[ch:vm-tlb]]).'],
    learn: ['Split an address into the L1’s tag, set and byte bits', 'Explain why the L1 can start a lookup before the translation is done', 'Say why L1 data caches stay at 32 or 48 KiB, and what bigger pages allow', 'Count an L1’s ways with a measurement, and know when a virtual machine’s report can be trusted'],
    sections: [
      { id: 'lines', title: 'Lines, sets and ways', body: function (L) {
        L.p('Caches hold memory in 64-byte lines. Machine A’s CPU reports a 32 KiB L1 data cache, with 64 sets of 8 ways:', ['line', 'set', 'way']);
        L.out('facts.l1');
        L.p('64 sets × 8 ways × 64 bytes = 32 KiB. A line may be stored in any of the 8 ways of one set, and its address decides which set.');
        L.bits([
          { bits: '63:12', val: '0x7f3a1b2c3', name: 'page number: its frame number becomes the tag', tone: 'a1', w: 2.2 },
          { bits: '11:6', val: '53', name: 'set', tone: 'a4' },
          { bits: '5:0', val: '14', name: 'byte in the line', tone: 'a3' }
        ], { title: 'The address 0x00007f3a1b2c3d4e, split for this L1' });
        L.code('byte = 0x7f3a1b2c3d4e & 63          = 14\nset  = (0x7f3a1b2c3d4e >> 6) & 63   = 53', { lang: 'text', title: 'arithmetic' });
        L.p('Six bits pick the byte inside a line and six more pick the set. With each line the cache also stores a tag, the rest of the line’s address, to know which line of memory occupies the slot. Which address, virtual or physical, is the subject of the next section.', ['tag']);
        L.p('[[ch:l1d]] goes through a lookup in detail. Here only one fact matters: where the set bits sit.');
      } },
      { id: 'parallel', title: 'Index with virtual bits, compare physical tags', body: function (L) {
        L.p('Bits 11 to 0 are the page offset. Translation copies them unchanged, so bits 11:6 are the same in the virtual address and in the physical one.');
        L.p('So the L1 can start reading set 53 with the virtual address while the TLB is still translating. When the frame number arrives, it is compared with the tags just read.');
        L.fig(440, 252, viptFigure, { cap: 'The two halves of an L1 lookup run at the same time. The set comes from untranslated bits; the tag compare waits for the TLB.', maxw: 560 });
        L.p('This design is called virtually indexed, physically tagged, VIPT. The set comes from virtual bits; the identity check uses the physical address.', ['vipt']);
        L.p('Because the tags are physical, two processes using the same virtual address can never hit each other’s lines, and nothing needs flushing when the kernel switches CR3.');
      } },
      { id: 'size', title: 'Why the L1 stays small', body: function (L) {
        L.p('The trick works only while every set bit lies inside the page offset. Sets × line size must not exceed the page size:');
        L.code('sets × line size = 64 × 64 B = 4 KiB  = one page\nL1 size          = 4 KiB × ways\n                   8 ways → 32 KiB\n                  12 ways → 48 KiB', { lang: 'text', title: 'arithmetic' });
        L.p('To grow the cache without leaving the page offset, a designer adds ways, not sets. AMD’s Zen 5 and Intel’s Golden Cove cores have 48 KiB, 12-way L1 data caches: still 4 KiB per way.');
        L.p('Each extra way costs power and time, because every lookup compares one more tag. Bigger pages lift the limit: with 16 KiB pages, a 4-way cache can hold 64 KiB.');
        L.try('Size an L1', 'Change the size, the ways, the line size and the page size. The last line says whether the set can be read before translation.', function (el) { LW().l1geom(el, {}); });
        L.p('Arm lets the operating system choose the page size, and some Arm cores use bigger L1 caches with extra hardware for aliases. The lab below compares the three Arm page sizes.');
        L.lab(function (el) { App.ArchLabs.granules(el); });
      } },
      { id: 'measure', title: 'Count the ways with a measurement', body: function (L) {
        L.p('A pointer chase can count an L1’s ways. Put one node in each of N pages, all at the same page offset, so that every node falls into the same set.');
        L.code('static long off_spread(long i) { return (i * 64) % 4096; }\n…\nstatic long off_same(long i) { (void)i; return 0x140; }', { title: 'labruns/vm/chase.c (excerpt)' });
        L.p('<code>off_same</code> puts every node at offset 0x140, and (0x140 >> 6) & 63 = 5: all in set 5. <code>off_spread</code> moves each page’s node 64 bytes further, into a different set.');
        L.p('While N is at most the number of ways, every node stays in L1. With one more node than ways, the set overflows and every hop misses L1. Machine A:');
        L.out('vipt.a');
        L.p('Up to 12 pages, a hop takes 1.5 ns. From 13 pages it takes about 4.2 ns, an L2 hit. Spread over different sets, the same pages stay at 1.5 ns.');
        L.p('So machine A’s L1 behaves as 12-way. But its CPU reported 8 ways, in the first section of this lesson.');
        L.p('Machine A is a virtual machine. <code>CPUID</code>, the instruction programs use to learn cache sizes, returns whatever the hypervisor configures. Here it describes an older CPU model than the one underneath.', ['cpuid']);
        L.p('Machine B reports its L1 truthfully, 48 KiB and 12 ways, and the same chase breaks at the same place:');
        L.out('facts.l1b');
        L.out('vipt.b');
        L.note('vm', 'On a virtual machine, the CPU model, the cache sizes and even the feature flags are what the hypervisor chooses to show. Read them as a description, and measure when a number matters. [[ch:vm-virt]] covers what else changes inside a virtual machine.');
      } },
      { id: 'alias', title: 'Two virtual addresses, one line', body: function (L) {
        L.p('A frame can be mapped at two virtual addresses at once: an alias. With physical tags, it is still one line in one set, because both addresses share the page offset and so the set bits.', ['valias']);
        L.p('Some L1 caches add a shortcut that does depend on the virtual address. AMD’s cores guess the way from a hash of the virtual address, a microtag, and read only that way:', ['waypred']);
        L.quote('The L1 data cache tags contain a linear-address-based microtag (utag) that tags each cacheline with the linear address that was used to access the cacheline initially.\n…\nA load to an address that is valid in the L1 DC but under a different linear alias will see an L1 DC miss, which requires an L2 cache request to be made. The latency will generally be no larger than that of an L2 cache hit.', { cite: 'Software Optimization Guide for AMD Family 17h Processors, pub. 55723 rev. 3.01, §2.6.2.2', label: 'Vendor docs', src: ['AMD documentation portal: pub. 55723', 'https://docs.amd.com/v/u/en-US/55723_3.01_PUB'] });
        L.p('AMD calls virtual addresses linear addresses. So on those cores an alias costs about an L2 hit when the other address was used last; it is never a wrong answer. [[ch:vm-alias]] maps one frame twice on purpose.');
      } }
    ],
    check: [
      { q: 'An L1 has 64 sets and 64-byte lines. Which address bits pick the set?', options: ['Bits 11:6', 'Bits 5:0', 'Bits 17:12', 'Bits 47:12'], answer: 0, why: 'Bits 5:0 pick the byte in the 64-byte line; the next 6 bits, 11:6, pick one of 64 sets.' },
      { q: 'Why can the L1 start reading a set before the TLB answers?', options: ['The set bits are inside the page offset, which translation does not change', 'The L1 stores virtual tags', 'The TLB is slower than DRAM', 'The L1 only holds kernel addresses'], answer: 0, why: 'Bits 11:6 are identical in the virtual and the physical address, so they can be used before translation finishes.' },
      { q: 'A designer wants a 64 KiB L1 with 64-byte lines that still indexes inside a 4 KiB page. How many ways does it need?', options: ['16', '8', '12', '4'], answer: 0, why: 'Each way can hold at most 4 KiB (64 sets × 64 B), so 64 KiB needs 16 ways.' },
      { q: 'Machine A’s CPUID reports 8 ways, but the chase slows down at 13 pages. What do you conclude?', options: ['The L1 has 12 ways; the virtual machine reports a different CPU', 'The L1 has 8 ways and the chase is wrong', 'The TLB has 12 entries', 'The L2 has 12 ways'], answer: 0, why: 'Up to 12 lines of one set fit; the 13th overflows the set. Machine B, which reports 12 ways, breaks at the same point.' }
    ],
    remember: [
      'For a 32 KiB, 8-way L1 with 64-byte lines: bits 5:0 pick the byte, bits 11:6 the set, and the rest is the tag.',
      'VIPT: the set is read with virtual bits, which translation does not change; the tag is compared with the frame number.',
      'Sets × line = 4 KiB keeps the set inside the page offset, so bigger L1s add ways: 32 KiB × 8, 48 KiB × 12.',
      'A virtual machine reports the CPU the hypervisor describes. Measure when it matters.'
    ],
    sources: [SRC_AMD17, ['AMD, Zen 5 at Hot Chips 2024', 'https://www.hc2024.hotchips.org/assets/program/conference/day2/24_HC2024.AMD.Cohen.Subramony.final.pdf'], ['Chips and Cheese, Golden Cove’s caches', 'https://chipsandcheese.com/p/going-armchair-quarterback-on-golden-coves-caches']]
  });
  /* ---------- III.11 ---------- */
  App.lesson({
    id: 'vm-switch', short: 'Switching address spaces', title: 'Switching address spaces: CR3, PCIDs and KPTI',
    lede: 'A context switch loads a new CR3. Tags on the TLB entries decide whether the next process starts with an empty TLB.',
    know: ['CR3 holds the physical address of the current top table ([[ch:vm-levels]]).', 'A TLB entry is a finished translation, and it can carry a process tag ([[ch:vm-tlb]]).', 'Bit 8 of an entry, G, marks a translation as global ([[ch:vm-pte]]).'],
    learn: ['Say what a CR3 write does to the TLB, with and without PCIDs', 'Follow how Linux picks a PCID at every context switch', 'Count TLB flushes at real context switches in a kernel trace', 'Explain what KPTI changed after Meltdown, and why PCIDs keep it affordable'],
    sections: [
      { id: 'cr3', title: 'A new process, a new CR3', body: function (L) {
        L.p('Two processes can use the same virtual address for different frames. When the kernel switches a CPU from one process to the other, it writes the next process’s top-table address into CR3.', ['ctxsw']);
        L.p('The TLB still holds the previous process’s translations. Unless the CPU can tell them apart from the new process’s, every one of them is now wrong.');
        L.chain([
          { k: 'process A runs', v: 'TLB fills', d: 'with A’s translations' },
          { k: 'context switch', v: 'write CR3', d: 'without tags: every non-global entry is removed', hot: true },
          { k: 'process B runs', v: 'TLB misses', d: 'every page B touches walks again' }
        ], { cap: 'A context switch on a CPU without process tags.' });
        L.p('Entries marked global (G = 1) survive a CR3 write, if CR4.PGE is on. The kernel half is the same in every process, so Linux marks kernel mappings global:', ['pteG', 'cr4']);
        L.quote('/* Enable PGE if available */\n__supported_pte_mask &= ~_PAGE_GLOBAL;\nif (boot_cpu_has(X86_FEATURE_PGE)) {\n        cr4_set_bits_and_update_boot(X86_CR4_PGE);\n        __supported_pte_mask |= _PAGE_GLOBAL;\n}\n…\n/* Except when with PTI where the kernel is mostly non-Global: */', { cite: 'arch/x86/mm/init.c, probe_page_size_mask(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('So a system call after a switch still finds the kernel’s translations. The user half is the expensive part, and the next section tags it.');
      } },
      { id: 'pcid', title: 'Tag the entries: PCIDs', body: function (L) {
        L.p('A PCID is a 12-bit number stored with every TLB entry: the address space that made it. With CR4.PCIDE = 1, the low 12 bits of CR3 hold the current PCID.', ['pcid']);
        L.bits([
          { bits: '63', val: 'keep', name: '1 = do not flush', tone: 'a2' },
          { bits: '62:52', val: '0', name: 'unused here', tone: 'mute' },
          { bits: '51:12', val: 'top table', name: 'frame of the PML4', tone: 'a4', w: 2.4 },
          { bits: '11:0', val: 'PCID', name: 'tag for new TLB entries', tone: 'a1', w: 1.4 }
        ], { title: 'CR3 with PCIDs on' });
        L.quote('If CR4.PCIDE is set (64-bit only), then CR3[11:0] is the address space ID.\n…\nCR3[63] is always read as zero.  If CR4.PCIDE is set, then CR3[63] may be\nwritten as 1 to prevent the write to CR3 from flushing the TLB.', { cite: 'arch/x86/include/asm/processor-flags.h, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('A lookup hits only an entry whose tag equals the current PCID, or a global one. The other processes’ entries stay in the TLB, unused, until their PCID is loaded again.');
        L.p('Both lab machines report <code>pcid</code> and <code>invpcid</code> ([[ch:vm-walk]] listed machine A’s flags). The model below lets you switch the tags off and on.');
        L.try('A TLB across context switches', 'Two processes take turns on one CPU. Each time slice, the running process touches its three pages (A0–A2 or B0–B2) and makes one system call, which uses a kernel page, K. The TLB has 8 entries.', function (el) { LW().tlbsim(el, {}); });
      } },
      { id: 'linux', title: 'How Linux hands out PCIDs', body: function (L) {
        L.p('12 bits allow 4096 tags, but Linux does not give each process its own. It keeps a short list, per CPU, of the processes that ran there recently:');
        L.quote('We don\'t use the traditional ASID implementation, where each process/mm gets\nits own ASID and flush/restart when we run out of ASID space.\n\nInstead we have a small per-cpu array of ASIDs and cache the last few mm\'s\nthat came by on this CPU, allowing cheaper switch_mm between processes on\nthis CPU.', { cite: 'arch/x86/mm/tlb.c, Linux v6.18', label: 'Linux source', code: true });
        L.p('ASID is the general name for such a tag; PCID is x86’s name. The list has six slots, and the PCID written into CR3 is the slot number plus one, because PCID 0 is reserved:');
        L.quote('#define TLB_NR_DYN_ASIDS\t6\n…\n\treturn asid + 1;', { cite: 'arch/x86/include/asm/tlbflush.h; arch/x86/mm/tlb.c, kern_pcid(), Linux v6.18 (excerpts)', label: 'Linux source', code: true });
        L.p('At every switch, <code>choose_new_asid()</code> looks for the next process in the six slots. Found, and nothing changed since: keep its entries. Not found: take the next slot in turn, and flush what that slot held.');
        L.quote('if (ns.need_flush) {\n        …\n        load_new_mm_cr3(next->pgd, ns.asid, new_lam, true);\n\n        trace_tlb_flush(TLB_FLUSH_ON_TASK_SWITCH, TLB_FLUSH_ALL);\n} else {\n        /* The new ASID is already up to date. */\n        load_new_mm_cr3(next->pgd, ns.asid, new_lam, false);\n\n        trace_tlb_flush(TLB_FLUSH_ON_TASK_SWITCH, 0);\n}', { cite: 'arch/x86/mm/tlb.c, switch_mm_irqs_off(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('The last argument of <code>load_new_mm_cr3</code> sets CR3 bit 63 when the entries may stay. The trace event records the choice: TLB_FLUSH_ALL prints as <code>pages:-1</code>, a kept TLB as <code>pages:0</code>.');
      } },
      { id: 'measure', title: 'Count it: 2000 switches, one flush', body: function (L) {
        L.p('Two processes pinned to one CPU pass a byte back and forth through two pipes, 1000 times. Every pass blocks one process and wakes the other: 2000 switches between two address spaces.');
        L.code('pid_t pid = fork();\nif (pid == 0) {                       /* child  */\n    for (int i = 0; i < 1000; i++) { read(a[0], &c, 1); write(b[1], &c, 1); }\n    _exit(0);\n}\nfor (int i = 0; i < 1000; i++) {      /* parent */\n    write(a[1], &c, 1); read(b[0], &c, 1);\n}', { title: 'labruns/vm/pcid.c (shortened)' });
        L.p('A script reads the trace and, for every switch between the two, the flush event that followed it:');
        L.out('pcid.runs');
        L.p('In every run, exactly one switch flushed: the first switch into the new child, whose address space had no slot yet. All the others kept the TLB.');
        L.p('Without PCIDs, each of those 2000 switches would have emptied the TLB, and both processes would have walked their tables again for every page they touched.');
      } },
      { id: 'kpti', title: 'Meltdown and KPTI', body: function (L) {
        L.p('In 2018 the Meltdown attack showed that on affected CPUs, user code could read kernel memory through speculative execution, only because the kernel half was mapped, even though its entries had U/S = 0.', ['spec']);
        L.p('Linux’s answer was page-table isolation. Each process gets a second top table that maps almost none of the kernel, and CR3 switches between the two at every kernel entry and exit:', ['kpti']);
        L.quote('When the kernel is entered via syscalls, interrupts or exceptions, the page tables are switched to the full "kernel" copy.  When the system switches back to user mode, the user copy is used again.\n…\nMoves to CR3 are on the order of a hundred cycles, and are required at every entry and exit.', { cite: 'Documentation/arch/x86/pti.rst, Linux v6.18 (excerpt)', label: 'Linux source', src: ['Page Table Isolation (PTI)', 'https://docs.kernel.org/arch/x86/pti.html'] });
        L.p('Two CR3 writes per system call would be ruinous if each emptied the TLB. PCIDs make them cheap: the two tables of a process get two PCIDs that differ only in bit 11.');
        L.quote('uPCID - [2048 + 1, 2048 + MAX_ASID_AVAILABLE]\n        for KPTI each mm has two address spaces and thus needs two\n        PCID values, but we can still do with a single ASID denomination\n        for each mm. Corresponds to kPCID + 2048.', { cite: 'arch/x86/mm/tlb.c, Linux v6.18', label: 'Linux source', code: true });
        L.p('The lab machines do not need it. Their CPUs are not affected, and <code>pti</code> is not among their flags, so each process has one top table, as in every lesson so far:');
        L.out('facts.meltdown');
        L.out('flags.b');
        L.p('PML4 entry 272 is the one [[ch:vm-levels]] set aside: the kernel’s memory map reserves it as the “LDT remap for PTI”.');
        L.note('arm', 'AArch64 tags TLB entries with an ASID of 8 or 16 bits (the CPU reports which), stored in TTBR0_EL1 or TTBR1_EL1 beside the table address. Descriptors carry an nG (not global) bit: entries with nG = 0 match every ASID, as G = 1 does on x86. Linux on arm64 hands out ASIDs from one machine-wide pool rather than per CPU (arch/arm64/mm/context.c).');
      } }
    ],
    check: [
      { q: 'Without PCIDs, what does writing CR3 do to the TLB?', options: ['Removes every entry except global ones', 'Nothing: the entries are tagged', 'Removes only the kernel’s entries', 'Removes only the entry of the current page'], answer: 0, why: 'With no tag to tell processes apart, every non-global translation might be wrong after the switch.' },
      { q: 'How many PCIDs does Linux use per CPU for ordinary processes?', options: ['Six slots, reused in turn', '4096, one per process', 'One: PCID 0', 'Two per process, always'], answer: 0, why: 'TLB_NR_DYN_ASIDS = 6; the PCID is the slot number plus one. (With KPTI each slot has a second, user PCID.)' },
      { q: 'In the measurement, 2000 switches caused one flush. Which switch was it?', options: ['The first switch into the newly forked child', 'The last switch, at exit', 'A switch caused by a timer interrupt', 'The first switch into the parent'], answer: 0, why: 'The child’s address space had no slot on CPU 0, so choose_new_asid() took a slot and flushed it. After that both processes had slots.' },
      { q: 'With KPTI, why do PCIDs matter so much?', options: ['Every system call writes CR3 twice; with PCIDs those writes keep the TLB', 'KPTI needs more than 4096 processes', 'PCIDs hide the kernel half', 'KPTI stores the PCID in the page tables'], answer: 0, why: 'The user and kernel tables get PCIDs that differ in bit 11, so switching between them need not empty the TLB.' }
    ],
    remember: [
      'A context switch writes CR3. Without PCIDs, that removes every non-global TLB entry.',
      'A PCID is a 12-bit tag in CR3 bits 11:0. Writing CR3 with bit 63 set keeps the TLB.',
      'Linux keeps six PCID slots per CPU (PCID = slot + 1). Measured: 2000 switches, 1 flush.',
      'KPTI gives each process two top tables and switches CR3 at every kernel entry; PCIDs keep that cheap.'
    ],
    sources: [['Linux v6.18: arch/x86/mm/tlb.c', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/mm/tlb.c'], ['Linux: Page Table Isolation', 'https://docs.kernel.org/arch/x86/pti.html'], ['Intel SDM Vol. 3A (rev. 093), §5.10.1 “Process-context identifiers (PCIDs)”', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html'], ['Lipp et al., Meltdown: Reading Kernel Memory from User Space, USENIX Security 2018', 'https://www.usenix.org/conference/usenixsecurity18/presentation/lipp']]
  });

  /* ---------- III.12 ---------- */
  App.lesson({
    id: 'vm-shootdown', short: 'TLB shootdowns', title: 'TLBs are not coherent: shootdowns',
    lede: 'Caches keep each other up to date; TLBs do not. When the kernel changes an entry, it removes the stale copies itself, and that can mean interrupting other CPUs.',
    know: ['Every core keeps its own TLB ([[ch:vm-tlb]]).', 'A CR3 write can keep or drop TLB entries, depending on PCIDs ([[ch:vm-switch]]).', 'The CPU sets the A bit when it uses an entry for a walk ([[ch:vm-pte]]).'],
    learn: ['Say why a page-table change needs an explicit invalidation', 'Name the x86 tools for it: INVLPG, INVPCID and a CR3 write', 'Predict which CPUs Linux interrupts, and read the counts it reports', 'Explain why clearing A bits needs no flush, and what that costs'],
    sections: [
      { id: 'stale', title: 'Nobody tells the TLB', body: function (L) {
        L.p('When a core writes a byte, the cache coherence protocol updates or removes every other cache’s copy of that line ([[ch:share]]). TLBs are outside that protocol.', ['coh']);
        L.p('A page-table entry is 8 bytes of ordinary memory. The kernel can rewrite it, but a TLB that cached the old translation keeps using the old one.');
        L.chain([
          { k: 'kernel', v: 'clears the PTE', d: 'the page is to be reused' },
          { k: 'a TLB', v: 'still holds it', d: 'accesses still reach the old frame', hot: true },
          { k: 'kernel', v: 'invalidates', d: 'the entry is gone from that TLB' },
          { k: 'next access', v: 'walks', d: 'finds P = 0 and faults' }
        ]);
        L.p('So whenever the kernel removes a mapping or takes away a permission, it must also invalidate the translation, in every TLB that might hold it, before the frame is reused.');
      } },
      { id: 'tools', title: 'Invalidating on x86', body: function (L) {
        L.p('x86 has three ways to remove translations. All three act only on the CPU that runs them:');
        L.table(['Instruction', 'Removes', 'Linux uses it for'], [
          ['INVLPG address', 'the entries for one page, current PCID', 'a few pages changed in the running process'],
          ['INVPCID', 'one page or every entry of a given PCID, or everything', 'entries of a PCID that is not loaded right now'],
          ['MOV to CR3', 'all non-global entries of the new PCID (unless bit 63 is set)', 'context switches, and whole-TLB flushes']
        ], { mono: false });
        L.p('Linux flushes page by page up to a limit, then the whole TLB of that process. The limit is 33 pages:');
        L.quote('/*\n * See Documentation/arch/x86/tlb.rst for details.  We choose 33\n * because it is large enough to cover the vast majority (at\n * least 95%) of allocations, and is small enough that we are\n * confident it will not cause too much overhead.  Each single\n * flush is about 100 ns, so this caps the maximum overhead at\n * _about_ 3,000 ns.\n *\n * This is in units of pages.\n */\nunsigned long tlb_single_page_flush_ceiling __read_mostly = 33;', { cite: 'arch/x86/mm/tlb.c, Linux v6.18', label: 'Linux source', code: true });
        L.p('To reach another CPU, the kernel must make that CPU run one of these instructions. It sends it an interrupt; Linux calls the result a TLB shootdown.', ['ipi']);
      } },
      { id: 'who', title: 'Which CPUs get interrupted', body: function (L) {
        L.p('A program maps one page, stores to it and unmaps it, 1000 times, on CPU 0. First as a single thread, then with a second thread of the same process spinning on CPU 1.');
        L.code('for (int i = 0; i < 1000; i++) {\n    volatile char *p = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);\n    p[0] = 1;\n    munmap((void *)p, 4096);\n}', { title: 'labruns/vm/shoot.c, loop()' });
        L.out('shoot.run1');
        L.p('One thread: 1000 local flushes, no interrupts. No other CPU runs this address space, so only CPU 0’s TLB can hold the translation.');
        L.p('Two threads: CPU 0 records a remote flush for every munmap, and CPU 1 received 999 interrupts. Linux interrupts only CPUs that have this address space loaded right now, and are not in lazy mode:', ['lazytlb']);
        L.quote('/* Lazy TLB will get flushed at the next context switch. */\nif (per_cpu(cpu_tlbstate_shared.is_lazy, cpu))\n        return false;\n…\n/* The target mm is loaded, and the CPU is not lazy. */\nif (loaded_mm == info->mm)\n        return true;', { cite: 'arch/x86/mm/tlb.c, should_flush_tlb(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('CPU 1 switched tasks five times during the loop. While it ran something else, an munmap skipped it, and CPU 1 flushed at its next switch instead. The send event is recorded before that decision:');
        L.quote('Note that there are (and have always been)\ncases in which a remote TLB flush will be traced, but eventually\nwould not happen.', { cite: 'arch/x86/mm/tlb.c, native_flush_tlb_multi(), Linux v6.18', label: 'Linux source', code: true });
        L.out('shoot.runs23');
        L.p('Runs 2 and 3 received 989 and 1000 interrupts: the count depends on how often the spinning thread was off its CPU, and on a virtual machine there can be one more reason ([[ch:vm-virt]]). Each interrupt also makes CPU 0 wait until CPU 1 has flushed.');
        L.note('why', 'munmap, mprotect and madvise in a multithreaded program cost an interrupt to every CPU running one of its threads. A benchmark that maps and unmaps memory inside its timed loop measures those interrupts too.');
        L.lab(function (el) { App.VMUI.labs.shootdowns(el); });
      } },
      { id: 'abits', title: 'Accessed bits without a flush', body: function (L) {
        L.p('There is one deliberate exception to the rule. The kernel clears A bits to learn which pages are still in use, and it does not flush the TLB when it does.');
        L.p('Writing 1 to <code>/proc/self/clear_refs</code> clears the A bits of a process. Then <code>Referenced</code> in smaps shows which pages had A set again:', ['smaps']);
        L.out('abit.v');
        L.p('After clear_refs, the program loads all 16 pages, and Referenced stays 0 kB. The translations were still in the TLB, so the CPU never walked the tables and never set A.');
        L.p('After an mprotect, which flushes, the same loads set A on all 16 pages again: 64 kB. Twenty more runs:');
        L.out('abit.20');
        L.p('After clear_refs, at most 8 kB came back (when a few TLB entries had been evicted); after the flush, always 64 kB. The kernel code says why:');
        L.quote('walk_page_range(mm, 0, -1, &clear_refs_walk_ops, &cp);\nif (type == CLEAR_REFS_SOFT_DIRTY) {\n        mmu_notifier_invalidate_range_end(&range);\n        flush_tlb_mm(mm);', { cite: 'fs/proc/task_mmu.c, clear_refs_write(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.quote('On x86 CPUs, clearing the accessed bit without a TLB flush\ndoesn\'t cause data corruption. [ It could cause incorrect\npage aging and the (mistaken) reclaim of hot pages, but the\nchance of that should be relatively low. ]\n\nSo as a performance optimization don\'t flush the TLB when\nclearing the accessed bit, it will eventually be flushed by\na context switch or a VM operation anyway.', { cite: 'arch/x86/mm/pgtable.c, ptep_clear_flush_young(), Linux v6.18', label: 'Linux source', code: true });
        L.p('The price is an occasional wrong answer about which pages are in use, the answer [[ch:vm-reclaim]] relies on. In exchange, aging pages never interrupts another CPU.');
      } },
      { id: 'broadcast', title: 'Hardware that broadcasts', body: function (L) {
        L.p('Interrupts are one way to reach other TLBs. AArch64 has invalidation instructions that reach every CPU, with no interrupt at all:');
        L.quote('dsb(ishst);\nasid = __TLBI_VADDR(0, ASID(mm));\n__tlbi(aside1is, asid);\n__tlbi_user(aside1is, asid);\ndsb(ish);', { cite: 'arch/arm64/include/asm/tlbflush.h, flush_tlb_mm(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('<code>TLBI ASIDE1IS</code> removes every entry with that ASID; IS, Inner Shareable, sends it to all cores. <code>DSB ISH</code> waits until every core has done it.');
        L.p('AMD added a similar pair to x86, INVLPGB and TLBSYNC. Linux 6.18 uses them where the CPU has them, for processes active on several CPUs at once:');
        L.quote('Global ASIDs are allocated for multi-threaded processes that are\nactive on multiple CPUs simultaneously, giving each of those\nprocesses the same PCID on every CPU, for use with hardware-assisted\nTLB shootdown on remote CPUs, like AMD INVLPGB or Intel RAR.', { cite: 'arch/x86/mm/tlb.c, Linux v6.18', label: 'Linux source', code: true });
        L.p('Machine B reports no <code>invlpgb</code> (the flags in [[ch:vm-switch]]), so on the lab machines every remote flush is an interrupt. The comment also names Intel RAR, remote action request, for which this kernel has no code yet.');
      } }
    ],
    check: [
      { q: 'The kernel clears a PTE on CPU 0 while another thread of the process runs on CPU 1. What must happen before the frame can be reused?', options: ['CPU 1 must invalidate its copy, usually after an interrupt from CPU 0', 'Nothing: TLBs are coherent like caches', 'CPU 1 must flush its L1 cache', 'CPU 1 must wait for its next timer interrupt'], answer: 0, why: 'TLBs are not coherent. CPU 1 could still reach the old frame through its cached translation.' },
      { q: 'A single-threaded program unmaps a page. How many shootdown interrupts are sent?', options: ['None: only the local TLB can hold the translation', 'One to every CPU in the machine', 'One to every CPU that ever ran the program', 'Exactly one, to CPU 0'], answer: 0, why: 'In the measurement: 1000 local flushes, 0 interrupts received.' },
      { q: 'Why did CPU 1 receive 989 interrupts for 1000 unmaps in run 2?', options: ['Linux skips CPUs that are not running this address space at that moment', '11 interrupts were lost', 'CPU 1’s TLB was full', 'CPU 0 merged 11 of them'], answer: 0, why: 'should_flush_tlb() returns false for a CPU in lazy mode or with another address space loaded. That CPU flushes at its next switch.' },
      { q: 'After clear_refs, a program loads every page, but Referenced stays at 0 kB. Why?', options: ['The translations were still in the TLB, so no walk set A again', 'clear_refs made the pages read-only', 'The loads hit in L1, which is not counted', 'Referenced counts only writes'], answer: 0, why: 'A is set during a walk. Without a flush, the cached translations meant no walks.' }
    ],
    remember: [
      'TLBs are not coherent. After changing an entry, the kernel invalidates it: INVLPG, INVPCID or a CR3 write, each on one CPU.',
      'Other CPUs are reached by interrupt (a TLB shootdown), and only those that have the address space loaded and are not lazy.',
      'Above 33 pages, Linux flushes the whole TLB of the process instead of page by page.',
      'Clearing A bits does not flush, so a cached translation hides later use until the next flush.',
      'Arm (TLBI …IS) and AMD (INVLPGB) can broadcast invalidations in hardware, with no interrupt.'
    ],
    sources: [['Linux v6.18: arch/x86/mm/tlb.c', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/mm/tlb.c'], ['Linux: The TLB (x86)', 'https://docs.kernel.org/arch/x86/tlb.html'], ['Linux v6.18: arch/x86/mm/pgtable.c', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/mm/pgtable.c'], ['Linux v6.18: arch/arm64/include/asm/tlbflush.h', 'https://github.com/torvalds/linux/blob/v6.18/arch/arm64/include/asm/tlbflush.h'], ['Intel SDM Vol. 3A (rev. 093), §5.10.4 “Invalidation of TLBs and paging-structure caches”', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html']]
  });

})();
