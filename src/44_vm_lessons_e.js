/* ======================= Part III · Virtual memory, lessons 16–18 ======================= */
(function () {
  'use strict';
  var d = App.gloss;
  d('fork', 'fork', 'The system call that creates a new process as a copy of the caller. Linux copies the page tables, not the memory: both processes share the frames, read-only, until one of them writes.');
  d('guardgap', 'stack guard gap', 'A range below a growing stack where Linux places no other mapping (256 pages, 1 MiB, by default), so that a stack overflow faults instead of running into other memory.');
  d('uffd', 'userfaultfd', 'A Linux interface that lets a program handle page faults in a region itself: the faulting thread waits while another thread supplies the page.');

  /* ---------- III.16 ---------- */
  App.lesson({
    id: 'vm-cow', short: 'fork and copy-on-write', title: 'fork and copy-on-write',
    lede: 'fork copies a process’s page tables, not its memory. Parent and child share every page, read-only, until one of them writes.',
    know: ['A write to a read-only translation faults with error code 0x7 ([[ch:vm-faults]]).', 'pagemap shows each page’s frame and whether it is mapped once ([[ch:vm-pages]]).', 'Taking away a permission means flushing the entry from the TLB ([[ch:vm-shootdown]]).'],
    learn: ['Say what fork copies and what it shares', 'Read a fork in a kernel trace: new tables, write protection, one flush', 'Follow a copy-on-write fault, and the case where no copy is needed', 'Estimate what fork and the writes after it cost'],
    sections: [
      { id: 'fork', title: 'fork copies tables, not memory', body: function (L) {
        L.p('<code>fork()</code> creates a child process with the same address space as its parent: the same regions, the same contents. Copying every page would make fork as slow as the process is large.', ['fork']);
        L.p('Instead, Linux copies the page tables and points both copies at the same frames. Every private writable page is write-protected, in both processes:', ['cow']);
        L.quote('/* If it\'s a COW mapping, write protect it both processes. */\nif (is_cow_mapping(src_vma->vm_flags) && pte_write(pte)) {\n\twrprotect_ptes(src_mm, addr, src_pte, nr);\n\tpte = pte_wrprotect(pte);\n}', { cite: 'mm/memory.c, __copy_present_ptes(), Linux v6.18', label: 'Linux source', code: true });
        L.p('The entries lose R/W; the regions stay <code>rw-p</code>. So the kernel will know, at the first write fault, that the write is allowed and only the sharing stands in its way. pagemap around the main run’s fork:');
        L.out('story.fork', { lines: [0, 1, 2, 3] });
        L.p('After fork, parent and child map page 0 to the same frame, 0x129b49, and exclusive is 0 in both: the frame is shared.');
      } },
      { id: 'trace', title: 'Inside fork()', body: function (L) {
        L.p('The trace inside fork() shows the kernel’s work for the whole process:');
        L.out('story.forktrace', { wide: true });
        L.p('Fourteen zeroed kernel frames, allocated with the flags page tables use ([[ch:vm-demand]]): the child’s tables for the parts of the parent that hold written pages. No GFP_HIGHUSER_MOVABLE block: not one user page was copied.');
        L.p('Then a single flush of the parent’s whole TLB (<code>pages:-1</code>): its entries for every write-protected page have just lost R/W.');
        L.quote('mmap_write_unlock(mm);\nflush_tlb_mm(oldmm);\nmmap_write_unlock(oldmm);', { cite: 'mm/mmap.c, dup_mmap(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('The two faults before the allocations, error code 0x14, are instruction fetches by the parent from parts of the C library it had not run before: calling fork() runs library code too.');
        L.p('Code from files is not copied at all. The child’s tables have no entries for it, and the child faults each page in from the page cache when it first runs it:');
        L.quote('/*\n * Don\'t copy ptes where a page fault will fill them correctly.  Fork\n * becomes much lighter when there are big shared or private readonly\n * mappings. The tradeoff is that copy_page_range is more efficient\n * than faulting.\n */\nreturn false;', { cite: 'mm/memory.c, vma_needs_copy(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
      } },
      { id: 'copy', title: 'The first write copies', body: function (L) {
        L.p('The child stores 9 into page 0. Its entry is read-only, so the store faults:');
        L.out('story.cowtrace', { lines: [0, 1, 2, 3], wide: true });
        L.p('Error code 0x7: a write to a read-only translation. The kernel takes frame 0x116f45, copies the 4 KiB into it (no __GFP_ZERO), points the child’s entry at it with R/W, and flushes the old entry.');
        L.out('story.fork', { lines: [4, 5] });
        L.p('The child now has its own frame, mapped once. The parent still maps 0x129b49.');
        L.quote('/*\n * Clear the pte entry and flush it first, before updating the\n * pte with the new entry, to keep TLBs on different CPUs in\n * sync. This code used to set the new PTE then flush TLBs, but\n * that left a window where the new PTE could be loaded into\n * some TLBs while the old PTE remains in others.\n */\nptep_clear_flush(vma, vmf->address, vmf->pte);', { cite: 'mm/memory.c, wp_page_copy(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('The order matters with threads: another CPU must never see the new frame through one TLB while it still writes the old one through another.');
      } },
      { id: 'reuse', title: 'The last one keeps the page', body: function (L) {
        L.p('The child exits. Then the parent stores 7 into page 0. Its entry is still read-only, so this store faults too:');
        L.out('story.cowtrace', { lines: [5, 6, 7], wide: true });
        L.p('No allocation and no flush follow. The parent is now the only one mapping 0x129b49, so a copy would be wasted: the kernel makes the entry writable and dirty, and the store goes through.');
        L.out('story.fork', { lines: [6, 7] });
        L.quote('entry = pte_mkyoung(vmf->orig_pte);\nentry = maybe_mkwrite(pte_mkdirty(entry), vma);\nif (ptep_set_access_flags(vma, vmf->address, vmf->pte, entry, 1))', { cite: 'mm/memory.c, wp_page_reuse(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('Adding a permission needs no flush. A CPU still caching the read-only entry would fault once more, find the entry already writable, and go on; on x86 the kernel’s fix-up for such a fault is empty:');
        L.quote('#define flush_tlb_fix_spurious_fault(vma, address, ptep) do { } while (0)', { cite: 'arch/x86/include/asm/pgtable.h, Linux v6.18', label: 'Linux source', code: true });
      } },
      { id: 'cost', title: 'What fork and the copies cost', body: function (L) {
        L.p('A second program writes 64 MiB, forks, and lets the child write every page. After the child exits, the parent writes every page:');
        L.out('fork64');
        L.p('fork itself took about 2 ms: building the child’s tables for 64 MiB, at least 32 bottom tables, and write-protecting 16384 entries.');
        L.p('Each of the child’s 16384 writes was a copy-on-write fault with a 4 KiB copy: about 2.7 µs each. The parent’s writes afterwards faulted too, but reused the pages: about 0.8 µs each.');
        L.note('why', 'A large process that forks only to start another program pays for copying page tables the child never uses. vfork() shares the parent’s memory until the child calls execve() or exits, and glibc’s posix_spawn() starts its child with clone(CLONE_VM | CLONE_VFORK), so neither copies any tables.');
        L.p('The lab below follows one page through mmap, first touch, fork, copy-on-write and reclaim, in a model you can step through.');
        L.lab(function (el) { App.VMUI.labs.lifecycle(el); });
      } }
    ],
    check: [
      { q: 'Right after fork, how many frames do parent and child use for page 0?', options: ['One, shared and read-only in both', 'Two, one each', 'None until the next store', 'One, writable in both'], answer: 0, why: 'pagemap: both map 0x129b49, exclusive = 0.' },
      { q: 'The child writes page 0 first. What happens?', options: ['A 0x7 fault; the kernel copies the page into a new frame for the child', 'The write goes to the shared frame', 'The parent gets the copy', 'The child is killed'], answer: 0, why: 'The trace: fault 0x7, mm_page_alloc without __GFP_ZERO (a copy), then a one-page flush.' },
      { q: 'After the child exits, the parent writes page 0. What does the kernel do?', options: ['Makes the entry writable: no copy, no flush', 'Copies the page', 'Nothing: no fault happens', 'Flushes the whole TLB'], answer: 0, why: 'The parent is the last user of the frame, so wp_page_reuse() just restores write access.' },
      { q: 'Why were the child’s write faults about 3.5 times slower than the parent’s?', options: ['Each copied 4 KiB into a new frame; the parent’s only changed the entry', 'The child ran on a slower CPU', 'The child’s TLB was empty', 'The parent used huge pages'], answer: 0, why: '2.7 µs per copying fault against 0.8 µs per reusing fault, for the same 16384 pages.' }
    ],
    remember: [
      'fork copies the page tables and write-protects private writable pages in both processes. The frames are shared.',
      'The first write by either side faults (0x7) and gets a private copy; the old entry is flushed first.',
      'The last process mapping a frame reuses it: the entry becomes writable, with no copy and no flush.',
      'Measured: fork of 64 MiB ≈ 2 ms; a copying fault ≈ 2.7 µs; a reusing fault ≈ 0.8 µs.'
    ],
    sources: [['Linux v6.18: mm/memory.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/memory.c'], ['Linux v6.18: mm/mmap.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/mmap.c'], ['vfork(2)', 'https://man7.org/linux/man-pages/man2/vfork.2.html'], ['posix_spawn(3)', 'https://man7.org/linux/man-pages/man3/posix_spawn.3.html']]
  });

  /* ---------- III.17 ---------- */
  App.lesson({
    id: 'vm-protect', short: 'Faults on purpose', title: 'Faults on purpose: mprotect, PROT_NONE and MADV_DONTNEED',
    lede: 'Page protection is a tool. Programs and the kernel change permissions, drop pages and leave gaps, and let the faults do the work.',
    know: ['A region that forbids an access gets SIGSEGV with SEGV_ACCERR ([[ch:vm-faults]]).', 'Taking away a permission needs a TLB flush ([[ch:vm-shootdown]]).', 'A read of a never-written page maps the zero page ([[ch:vm-demand]]).'],
    learn: ['Follow mprotect: a region split, an entry changed, a flush', 'Say what PROT_NONE does to an entry', 'Predict what MADV_DONTNEED gives back, and what the next access sees', 'Name tools built on faults: guard gaps, MAP_FIXED_NOREPLACE, userfaultfd'],
    sections: [
      { id: 'mprotect', title: 'mprotect splits a region', body: function (L) {
        L.p('The main run makes page 3 of its region read-only, then stores to it:');
        L.code('mprotect((void *)(p + 0x3000), 4096, PROT_READ);\np[0x3d4e] = 1;', { title: 'labruns/vm/story.c (shortened)' });
        L.out('story.mprotect');
        L.p('One region became two: pages 0 to 2 still <code>rw-p</code>, page 3 <code>r--p</code>. A region has one set of permissions, so changing part of one splits it.', ['vmarea']);
        L.p('The store then faulted with 0x7, a write to a read-only translation. The region forbids writes, so the kernel sent SIGSEGV with SEGV_ACCERR.');
        L.out('story.mprotecttrace', { wide: true });
        L.p('mprotect flushed one page: page 3’s entry lost R/W, and a writable copy of it left in a TLB would have let the store through.');
      } },
      { id: 'nochange', title: 'A change that changes nothing', body: function (L) {
        L.p('The program writes page 3 once more just before the mprotect. That line is there because of something found while measuring:');
        L.code('/* fork left page 3\'s entry read-only too; write it once so mprotect has something to change */\np[0x3d4e] = 2;', { title: 'labruns/vm/story.c' });
        L.p('After the fork in [[ch:vm-cow]], page 3’s entry was read-only already. An mprotect to read-only would change no entry, and Linux flushes only for entries that change:');
        L.quote('modify_prot_commit_ptes(vma, addr, ptep, oldpte, ptent, nr_ptes);\nif (pte_needs_flush(oldpte, ptent))\n\ttlb_flush_pte_range(tlb, addr, nr_ptes * PAGE_SIZE);', { cite: 'mm/mprotect.c, prot_commit_flush_ptes(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('The write before the mprotect faulted (0x7, the first line of the trace above), was reused, and made the entry writable again. Then the mprotect had an entry to change, and a flush to do.');
        L.note('why', 'When you measure TLB flushes, check what the entries held before the call. The same mprotect can flush or not, depending on history.');
      } },
      { id: 'protnone', title: 'PROT_NONE: no access at all', body: function (L) {
        L.p('PROT_NONE forbids every access. Linux makes the entry non-present, so that any access faults, and marks it so the kernel knows the frame is still there:');
        L.quote('/* If _PAGE_BIT_PRESENT is clear, we use these: */\n/* - if the user mapped it with PROT_NONE; pte_present gives true */\n#define _PAGE_BIT_PROTNONE\t_PAGE_BIT_GLOBAL\n…\n#define PAGE_NONE\t     __pg(   0|   0|   0|___A|   0|   0|   0|___G)', { cite: 'arch/x86/include/asm/pgtable_types.h, Linux v6.18 (excerpts)', label: 'Linux source', code: true });
        L.p('Bit 8 means G while P = 1, and “PROT_NONE” while P = 0. The CPU ignores every other bit of a non-present entry, so the kernel may give them its own meanings.');
        L.p('So a read of a PROT_NONE page faults with 0x4 (no translation), and the kernel answers SEGV_ACCERR (the region forbids it), as in [[ch:vm-faults]].');
      } },
      { id: 'dontneed', title: 'Giving pages back: MADV_DONTNEED', body: function (L) {
        L.p('<code>madvise(MADV_DONTNEED)</code> tells the kernel a program no longer needs the contents of a range. For private anonymous memory, the frames go back at once:', ['madvise']);
        L.out('story.dontneed');
        L.out('story.dontneedtrace', { wide: true });
        L.p('The entry was cleared and flushed, and frame 0x129b49 was freed. A load then read 0 through the zero page, and a store got a fresh zeroed frame.');
        L.p('It got the same frame, 0x129b49: the one most recently freed on this CPU. [[ch:vm-buddy]] shows why the allocator hands it out first.');
        L.quote('subsequent accesses of pages in the range will succeed, but will result in either repopulating the memory contents from the up-to-date contents of the underlying mapped file (for shared file mappings, shared anonymous mappings, and shmem-based techniques such as System V shared memory segments) or zero-fill-on-demand pages for anonymous private mappings.', { cite: 'madvise(2), MADV_DONTNEED', label: 'Linux source', src: ['madvise(2)', 'https://man7.org/linux/man-pages/man2/madvise.2.html'] });
        L.p('Memory allocators use it to return freed memory to the kernel without unmapping the range: the addresses stay valid, and the next use starts from zeros.');
      } },
      { id: 'tools', title: 'Tools built on faults', body: function (L) {
        L.p('Several common mechanisms are faults used on purpose:');
        L.list([
          '<b>Stack guard gap.</b> Linux keeps 256 pages (1 MiB) below a growing stack free of other mappings, so that an overflowing stack faults instead of running into other memory: <code>unsigned long stack_guard_gap = 256UL&lt;&lt;PAGE_SHIFT;</code> (mm/mmap.c).',
          '<b>MAP_FIXED_NOREPLACE.</b> Map at exactly this address, or fail with EEXIST if anything is already there. The main run used it to get 0x7f3a1b2c3000 every time.',
          '<b>userfaultfd.</b> A program asks to handle the faults of a region itself: the faulting thread waits while a handler supplies the page. Live migration of virtual machines uses it. The lab machines’ kernel has it (CONFIG_USERFAULTFD=y).',
          '<b>Write tracking.</b> mprotect a range read-only, catch the SEGV_ACCERR faults, note which pages were written, then make them writable again. Some garbage collectors find the pages a program changed this way.'
        ], ['guardgap', 'uffd']);
        L.p('Each turns the MMU’s permission check into an event the kernel or the program can act on. [[ch:vm-cost]] shows what each such event costs.');
      } }
    ],
    check: [
      { q: 'mprotect makes the middle page of a 3-page rw-p region read-only. How many maps lines does the region show afterwards?', options: ['Three: rw-p, r--p, rw-p', 'One, r--p', 'Two', 'One, rw-p'], answer: 0, why: 'A region has one set of permissions, so the middle page becomes a region of its own.' },
      { q: 'Why did mprotect flush only one page?', options: ['Only page 3’s entry lost R/W', 'mprotect never flushes more than one page', 'The other pages were not present', 'The flush ceiling is one page'], answer: 0, why: 'prot_commit_flush_ptes() flushes only entries whose change needs it.' },
      { q: 'A PROT_NONE page is read. Which error code, and which si_code?', options: ['0x4 and SEGV_ACCERR', '0x5 and SEGV_ACCERR', '0x4 and SEGV_MAPERR', '0x6 and SEGV_ACCERR'], answer: 0, why: 'The entry is not present (bit 0 = 0), but the region exists and forbids the read.' },
      { q: 'After MADV_DONTNEED on a private anonymous page, what does a load read?', options: ['Zeros, through the zero page', 'The old contents', 'Nothing: it gets SIGSEGV', 'The contents of a file'], answer: 0, why: 'madvise(2): zero-fill-on-demand pages for anonymous private mappings. The run read 0.' }
    ],
    remember: [
      'mprotect splits regions so that part of one can have new permissions, changes the entries, and flushes those that lost permissions.',
      'An mprotect that changes no entry flushes nothing.',
      'PROT_NONE clears P and marks the entry with bit 8: every access faults, and the region forbids it.',
      'MADV_DONTNEED frees private anonymous pages at once; they come back as zeros.',
      'Guard gaps, MAP_FIXED_NOREPLACE, userfaultfd and write tracking all use faults on purpose.'
    ],
    sources: [['Linux v6.18: mm/mprotect.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/mprotect.c'], ['madvise(2)', 'https://man7.org/linux/man-pages/man2/madvise.2.html'], ['mmap(2)', 'https://man7.org/linux/man-pages/man2/mmap.2.html'], ['Linux: userfaultfd', 'https://docs.kernel.org/admin-guide/mm/userfaultfd.html']]
  });

  /* ---------- III.18 ---------- */
  App.lesson({
    id: 'vm-cost', short: 'What a fault costs', title: 'What a page fault costs',
    lede: 'A page fault costs microseconds, not nanoseconds. Measure it, then keep it out of the numbers you care about.',
    know: ['A first touch allocates, zeroes and maps a frame ([[ch:vm-demand]]).', 'A huge-page fault zeroes 2 MiB at once ([[ch:vm-huge]]).', 'A copy-on-write fault copies 4 KiB ([[ch:vm-cow]]).'],
    learn: ['Read a fault-cost measurement, and say what it includes', 'Compare small-page and huge-page faults, per fault and per MiB', 'Move faults out of the way with MADV_POPULATE_WRITE or MAP_POPULATE', 'Write a benchmark that does not time page faults by accident'],
    sections: [
      { id: 'measure', title: 'Timing a fault', body: function (L) {
        L.p('One store per 4 KiB page into a fresh 64 MiB region makes 16384 faults. Time the pass, divide by the number of faults, and you have the cost of one fault.');
        L.code('for (int s = 0; s < 21; s++) {\n    p = map64(huge);                  /* fresh region: not timed */\n    f = faults(); t = now_ns();\n    store_pass(p, 1);                 /* one store per 4 KiB page */\n    uint64_t dt = now_ns() - t;\n    nf = faults() - f;\n    perf[s] = (double)dt / nf;        /* ns per fault */\n    munmap(p, SZ);                    /* not timed */\n}', { title: 'labruns/vm/cost.c (shortened)' });
        L.p('Each sample maps a fresh region, and mmap and munmap stay outside the timed part. 21 samples of each kind:');
        L.out('cost.time', { wide: true });
        L.p('A small-page fault took 1.74 µs (median), with little spread: 1.62 to 2.16 µs. At the 2.8 GHz the CPU reports, that is about 4900 cycles.');
        L.p('Each one includes the entry into the kernel, the region lookup, a frame from the allocator, zeroing 4 KiB, writing the entry, the return, and the store running again.');
      } },
      { id: 'huge', title: 'Per fault and per megabyte', body: function (L) {
        L.p('A huge-page fault took 351 µs, 200 times longer than a small one. But each one covers 512 small pages:');
        L.table(['Pages', 'Faults per 64 MiB', 'Per fault (median)', 'Per MiB (median)'], [
          ['4 KiB', '16384', '1.74 µs', '445 µs'],
          { cells: ['2 MiB', '32', '351 µs', '176 µs'], hot: true }
        ], { title: 'from cost.time above' });
        L.p('Per MiB, huge pages cost 2.5 times less: for every 2 MiB, one fault, one allocation and one entry instead of 512 of each. The zeroing per byte is the same for both.');
        L.note('careful', 'The slowest huge-page sample took 550 µs. A huge-page fault may also wait while the kernel makes a free 2 MiB block ([[ch:vm-huge]]). Medians hide such tails: report the spread too.');
      } },
      { id: 'prefault', title: 'Fault ahead of time', body: function (L) {
        L.p('If the faults cannot be avoided, they can at least happen when the program chooses. <code>madvise(MADV_POPULATE_WRITE)</code> faults in a whole range at once, as if every page had been written:', ['madvise']);
        L.quote('Populate (prefault) page tables writable, faulting in all pages in the range just as if manually writing to each each page; however, avoid the actual memory access that would have been performed after handling the fault.', { cite: 'madvise(2), MADV_POPULATE_WRITE (since Linux 5.14)', label: 'Linux source', src: ['madvise(2)', 'https://man7.org/linux/man-pages/man2/madvise.2.html'] });
        L.out('cost.populate');
        L.p('16384 faults inside madvise, 28.1 ms: the same 1.7 µs each. Then the store pass took 0.41 ms and no faults, about 25 ns per page.');
        L.p('<code>mmap</code> with MAP_POPULATE does the same when the region is created. Neither makes the faults cheaper; both move them out of the part you care about.');
      } },
      { id: 'hygiene', title: 'Keep faults out of a benchmark', body: function (L) {
        L.p('A timed loop that faults measures the kernel, not the code. The usual causes, and what to do:');
        L.list([
          '<b>Untouched buffers.</b> Write every buffer before the timed part, or prefault it. A buffer that is only read first faults twice ([[ch:vm-demand]]).',
          '<b>Very large malloc and free inside the loop.</b> glibc serves large blocks with mmap and returns them with munmap; blocks above 32 MiB (on 64-bit) always, smaller ones until its threshold adapts. Every round then faults in fresh pages again.',
          '<b>munmap, mprotect or madvise inside the loop.</b> They flush TLBs and, with threads, interrupt other CPUs ([[ch:vm-shootdown]]).',
          '<b>Count the faults.</b> Call getrusage before and after, or run <code>perf stat -e page-faults</code>. A count that grows with iterations means faults are in the loop.',
          '<b>Warm up</b>, and report the median and the spread.'
        ]);
        L.p('cost.c follows its own advice. Its first line calls every function it will use, because their first use faults too:');
        L.code('/* first calls of the clock, madvise and getrusage fault on their own; do them now */\n(void)now_ns(); (void)faults(); madvise(NULL, 0, MADV_NORMAL); (void)status_kb("VmPTE");', { title: 'labruns/vm/cost.c' });
        L.p('The lab below imports the same kind of measurement from your own machine.');
        L.lab(function (el) { App.VMUI.labs.native(el); });
      } }
    ],
    check: [
      { q: 'Small-page faults cost 1.74 µs and huge-page faults 351 µs. Which is cheaper per MiB?', options: ['Huge pages: 176 µs per MiB against 445 µs', 'Small pages: 1.74 µs against 351 µs', 'They cost the same per MiB', 'It cannot be told from these numbers'], answer: 0, why: '256 small faults per MiB × 1.74 µs ≈ 445 µs; half a huge fault per MiB ≈ 176 µs.' },
      { q: 'After madvise(MADV_POPULATE_WRITE) on 64 MiB, how many faults does a store pass over it take?', options: ['0', '16384', '32', '8192'], answer: 0, why: 'All 16384 faults happened inside madvise.' },
      { q: 'What does MAP_POPULATE change about the total cost of the faults?', options: ['Nothing: the same faults happen at mmap time', 'It halves it', 'It removes the zeroing', 'It turns them into huge-page faults'], answer: 0, why: 'Prefaulting moves the work; it does not remove it.' },
      { q: 'A benchmark’s page-fault count grows with the number of iterations. What does that tell you?', options: ['Something in the timed loop faults: new memory each round, or unmapping and remapping', 'The TLB is too small', 'The CPU is throttling', 'Nothing: faults are part of every loop'], answer: 0, why: 'A well-prepared loop faults only during warm-up.' }
    ],
    remember: [
      'Measured here: a small-page fault ≈ 1.7 µs (thousands of cycles); a huge-page fault ≈ 350 µs, but 2.5 times cheaper per MiB.',
      'MADV_POPULATE_WRITE and MAP_POPULATE take the faults up front; the work does not disappear.',
      'In benchmarks: touch buffers first, and keep mmap, munmap and very large malloc/free out of timed loops.',
      'Count faults with getrusage or perf stat: a count that grows with the iterations means faults inside the loop.'
    ],
    sources: [['madvise(2)', 'https://man7.org/linux/man-pages/man2/madvise.2.html'], ['mmap(2): MAP_POPULATE', 'https://man7.org/linux/man-pages/man2/mmap.2.html'], ['mallopt(3): M_MMAP_THRESHOLD', 'https://man7.org/linux/man-pages/man3/mallopt.3.html']]
  });
})();
