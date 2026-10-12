/* ======================= Part III · Virtual memory, lessons 13–16 ======================= */
(function () {
  'use strict';
  var LW = function () { return App.LW; };
  var d = App.gloss;
  d('cr2', 'CR2', 'The control register into which the CPU writes the faulting address when a page fault occurs. The kernel reads it first thing. (On CPUs with FRED, the address arrives with the event instead.)');
  d('errcode', 'page-fault error code', 'A number the CPU pushes with every page fault. Its bits say whether a translation existed (bit 0), whether the access was a write (1), from user mode (2), an instruction fetch (4), and more.');
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
    sources: [['Linux v6.18: arch/x86/mm/fault.c', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/mm/fault.c'], ['Linux v6.18: arch/x86/include/asm/trap_pf.h', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/include/asm/trap_pf.h'], ['Intel SDM Vol. 3A, §4.7 “Page-fault exceptions”', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html'], ['Linux v6.18: arch/arm64/mm/fault.c', 'https://github.com/torvalds/linux/blob/v6.18/arch/arm64/mm/fault.c']]
  });
})();
