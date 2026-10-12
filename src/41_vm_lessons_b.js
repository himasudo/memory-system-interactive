/* ======================= Part III · Virtual memory, lessons 5–8 ======================= */
(function () {
  'use strict';
  var g = App.g, LW = function () { return App.LW; };
  var d = App.gloss;
  d('cr3', 'CR3', 'A CPU control register holding the physical address of the current process’s top-level page table (and, with PCIDs on, a tag for its TLB entries). The kernel writes it when it switches a core to another process. Arm’s equivalents are TTBR0_EL1 and TTBR1_EL1.');
  d('pteP', 'P (present), bit 0', '1 = the entry is valid. 0 = there is no translation: the CPU ignores every other bit, and the kernel may keep its own data in them.');
  d('pteRW', 'R/W, bit 1', '1 = writes are allowed through this entry.');
  d('pteUS', 'U/S, bit 2', '1 = user-mode code may use this entry; 0 = kernel mode only.');
  d('pteA', 'A (accessed), bit 5', 'Set by the CPU when it uses the entry for a translation. Only software clears it.');
  d('pteD', 'D (dirty), bit 6', 'Set by the CPU when a write goes through the entry that maps the page. Only software clears it.');
  d('ptePS', 'PS (page size), bit 7', 'In a PDPT or PD entry: 1 = this entry maps a 1 GiB or 2 MiB page itself, and the walk stops here.');
  d('pteG', 'G (global), bit 8', 'The translation stays in the TLB when CR3 is reloaded (needs CR4.PGE). Used for the kernel half.');
  d('pteNX', 'NX (no-execute), bit 63', 'Instruction fetches through this entry are refused. Intel calls it XD.');
  d('walker', 'page walker', 'The hardware in the MMU that reads the page tables, level by level, after a TLB miss. One pass is a page walk.');
  d('cr4', 'CR4', 'A CPU control register whose bits switch processor features on, such as global pages (PGE), PCIDs (PCIDE), SMEP and SMAP.');
  d('smep', 'SMEP', 'Supervisor-mode execution prevention: the CPU refuses to run code from a user page while in kernel mode.');
  d('smap', 'SMAP', 'Supervisor-mode access prevention: the CPU refuses kernel-mode reads and writes of user pages unless the AC bit of RFLAGS is set. The kernel sets it only inside its routines that copy to and from user memory.');
  d('stlb', 'L2 TLB (STLB)', 'The second, larger level of TLB, checked when the L1 TLB misses. Intel calls it the STLB (shared TLB).');
  d('pwc', 'page-walk cache', 'A cache of upper-level page-table entries kept by the page walker, so a walk can skip levels. AMD calls it the page directory cache; Intel, paging-structure caches.');
  d('reach', 'TLB reach', 'Entries × page size: how much memory can be used without a TLB miss.');

  var P = App.P;
  var CR3 = '0x107a24000';

  /* ---------- III.05 ---------- */
  App.lesson({
    id: 'vm-levels', short: 'Four levels and CR3', title: 'Four levels of tables, and CR3',
    lede: 'Four levels of 512-entry tables, each chosen by 9 bits of the address. A register says where the top one is.',
    know: ['Page tables form a tree of 4 KiB tables with 512 entries each ([[ch:vm-tree]]).', 'The low 12 bits of an address are the page offset ([[ch:vm-pages]]).'],
    learn: ['Split an address into four 9-bit indices and a 12-bit offset', 'Name the levels in Intel, AMD, Arm and Linux terms', 'Say what CR3 holds and when it changes', 'Explain why the kernel half costs each process almost nothing'],
    sections: [
      { id: 'nine', title: 'Nine bits per level', body: function (L) {
        L.p('Each table has 512 entries, and 512 = 2⁹. So 9 bits of the address pick one entry in a table.');
        L.p('Four levels of 9 bits, plus the 12-bit page offset, use exactly 48 bits: the width the CPU translates.');
        L.code('9 + 9 + 9 + 9 + 12 = 48', { lang: 'text', title: 'arithmetic' });
      } },
      { id: 'names', title: 'The four levels', body: function (L) {
        L.p('Top to bottom, Intel and AMD call the levels PML4, PDPT, PD and PT. Linux and Arm use other names for the same tree.', ['pml4']);
        L.table(['Level', 'Intel and AMD', 'Linux', 'Arm (4 KiB pages)', 'Address bits', 'One entry covers'], [
          ['1 (top)', 'PML4: page-map level 4', 'PGD', 'level 0', '47:39', '512 GiB'],
          ['2', 'PDPT: page-directory-pointer table', 'PUD', 'level 1', '38:30', '1 GiB'],
          ['3', 'PD: page directory', 'PMD', 'level 2', '29:21', '2 MiB'],
          ['4 (bottom)', 'PT: page table', 'PTE', 'level 3', '20:12', '4 KiB']
        ], { mono: false });
        L.p('Read the last column from the bottom: a PT entry covers one 4 KiB page; a PD entry covers a whole PT, 512 × 4 KiB = 2 MiB; and so on up, ×512 each level.');
        L.note('linux', 'Linux names five levels, PGD, P4D, PUD, PMD and PTE, so the same code handles five-level paging. With four levels, as here, the P4D level is folded away and has no table of its own.');
      } },
      { id: 'split', title: 'Split the address', body: function (L) {
        L.p('To find the index at each level, shift the address right and keep the low 9 bits:');
        L.code('unsigned long va = 0x00007f3a1b2c3d4e;\n\npml4 = (va >> 39) & 0x1ff;   /* 254   */\npdpt = (va >> 30) & 0x1ff;   /* 232   */\npd   = (va >> 21) & 0x1ff;   /* 217   */\npt   = (va >> 12) & 0x1ff;   /* 195   */\noff  =  va        & 0xfff;   /* 0xd4e */', { title: 'C' });
        L.bits([
          { bits: '63:48', val: '0x0000', name: 'copies of bit 47', tone: 'mute', w: 1.2 },
          { bits: '47:39', val: '254', name: 'PML4 index', tone: 'a1' },
          { bits: '38:30', val: '232', name: 'PDPT index', tone: 'a1' },
          { bits: '29:21', val: '217', name: 'PD index', tone: 'a1' },
          { bits: '20:12', val: '195', name: 'PT index', tone: 'a1' },
          { bits: '11:0', val: '0xd4e', name: 'offset', tone: 'a3' }
        ], { title: 'The virtual address 0x00007f3a1b2c3d4e' });
        L.p('Check the first one by hand: 0x7f3a1b2c3d4e shifted right by 39 is 0xfe, which is 254.');
        L.try('Split any address into its four indices', 'Change the address or the page size. With a 2 MiB page the PT index disappears into a 21-bit offset; with 1 GiB, the PD index too.', function (el) { LW().splitter(el, { mode: 'levels', pfn: false }); });
      } },
      { id: 'cr3', title: 'CR3: where the top table is', body: function (L) {
        L.p('The walk has to start somewhere. A control register, CR3, holds the physical address of the current process’s top table.', ['cr3']);
        L.p('Each process has its own top table. When the kernel switches a core to another process, it loads that process’s top-table address into CR3; [[ch:vm-switch]] covers that moment.');
        L.p('No user program can read CR3. So these lessons use an example value for it, ' + CR3 + '. Every other frame number in the main run is measured.');
        L.code('CR3 = ' + CR3 + '        /* example: physical address of the PML4 */\n\nPML4 entry 254 is at  ' + CR3 + ' + 254 × 8\n                    = 0x107a247f0', { lang: 'text', title: 'the first read of a walk' });
        L.p('An entry’s address is the table’s address plus 8 bytes per index. The next lesson opens up what the entry holds.');
        L.note('arm', 'An AArch64 core has two such registers: TTBR0_EL1 points to the user half’s top table and TTBR1_EL1 to the kernel half’s. A switch between processes changes only TTBR0_EL1.');
      } },
      { id: 'shared', title: 'The kernel half costs almost nothing', body: function (L) {
        L.p('Kernel addresses split the same way. The start of the direct map, 0xffff888000000000, has PML4 index 273; kernel code, 0xffffffff81000000, has indices 511, 510, 8 and 0.');
        L.code('(0xffff888000000000 >> 39) & 0x1ff = 273\n(0xffffffff81000000 >> 39) & 0x1ff = 511   >> 30: 510   >> 21: 8   >> 12: 0', { lang: 'text', title: 'arithmetic' });
        L.p('PML4 entries 0 to 255 cover the user half and 256 to 511 the kernel half.');
        L.p('When Linux creates a process’s top table, it copies the kernel’s own entries into it, from pgd_index(PAGE_OFFSET) = 273 up to 511:');
        L.quote('clone_pgd_range(pgd + KERNEL_PGD_BOUNDARY,\n                swapper_pg_dir + KERNEL_PGD_BOUNDARY,\n                KERNEL_PGD_PTRS);\n\n#define KERNEL_PGD_BOUNDARY  pgd_index(PAGE_OFFSET)', { cite: 'arch/x86/mm/pgtable.c, pgd_ctor(); arch/x86/include/asm/pgtable.h — Linux v6.18', label: 'Linux source', code: true });
        L.p('Those copied entries point to the same lower tables in every process. So each process pays for its own top table and nothing more; the kernel’s lower tables exist once.');
        L.p('Entries 256 to 272 are deliberately left out: the kernel’s memory map reserves that range for a hypervisor and for a remapping used with page-table isolation ([[ch:vm-switch]]).');
      } }
    ],
    check: [
      { q: 'What is the PT index of 0x00007f3a1b2c4d4e?', options: ['196', '195', '217', '0x4d4'], answer: 0, why: '(0x7f3a1b2c4d4e >> 12) & 0x1ff = 0x7f3a1b2c4 & 0x1ff = 0x0c4 = 196. One page further than 195.' },
      { q: 'How much memory does one PDPT entry cover?', options: ['1 GiB', '2 MiB', '512 GiB', '4 KiB'], answer: 0, why: 'A PT entry covers 4 KiB; ×512 for a PD entry (2 MiB); ×512 again for a PDPT entry (1 GiB).' },
      { q: 'Which register tells the page walker where to start?', options: ['CR3', 'CR2', 'CR4', 'RIP'], answer: 0, why: 'CR3 holds the physical address of the current top table. CR2 receives the faulting address on a page fault, and CR4 switches features on.' },
      { q: 'Why does the kernel half cost a new process so little?', options: ['Its top table copies the kernel’s entries, which point to shared lower tables', 'The kernel half is not translated', 'The kernel half uses huge pages', 'Each process gets a copy of the kernel tables'], answer: 0, why: 'pgd_ctor() copies entries 273–511; they point to the lower tables every process shares.' }
    ],
    remember: [
      'Four levels × 9 bits + a 12-bit offset = 48 bits. Index = (va >> shift) & 0x1ff, with shifts 39, 30, 21, 12.',
      'PML4 / PDPT / PD / PT (Intel, AMD) = PGD / PUD / PMD / PTE (Linux) = levels 0–3 (Arm). Entries cover 512 GiB / 1 GiB / 2 MiB / 4 KiB.',
      'CR3 holds the physical address of the current top table; the kernel loads it when it switches processes.',
      'Every process’s top table shares the kernel’s entries 273–511, so the kernel half is nearly free.'
    ],
    sources: [['Intel SDM Vol. 3A (rev. 093), §5.5 “4-level paging and 5-level paging”', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html'], ['Linux: page table levels', 'https://docs.kernel.org/mm/page_tables.html'], ['Arm, AArch64 memory management guide', 'https://developer.arm.com/documentation/101811/latest']]
  });

  /* ---------- III.06 ---------- */
  App.lesson({
    id: 'vm-pte', short: 'The entry, bit by bit', title: 'The page-table entry, bit by bit',
    lede: 'Eight bytes: a frame address, plus a dozen bits that say what is allowed and record what happened.',
    know: ['A walk picks one 8-byte entry per level, starting at CR3 ([[ch:vm-levels]]).', 'Translation maps a page to a frame number ([[ch:vm-pages]]).'],
    learn: ['Decode any x86-64 page-table entry', 'Tell the bits the kernel sets from the bits the CPU sets', 'Build our page’s entry from its frame number and its region’s permissions'],
    sections: [
      { id: 'room', title: 'Room for flags', body: function (L) {
        L.p('A frame’s address is a multiple of 4096, so its low 12 bits are always 0. An entry stores the address from bit 12 up and uses the free low bits for flags.');
        L.bits([
          { bits: '63', val: 'NX', name: 'no execute', tone: 'a1' },
          { bits: '62:52', val: '—', name: 'ignored', tone: 'mute' },
          { bits: '51:12', val: 'address', name: 'frame or next table', tone: 'a4', w: 3 },
          { bits: '11:9', val: '—', name: 'ignored', tone: 'mute' },
          { bits: '8', val: 'G', name: 'global', tone: 'a2' },
          { bits: '7', val: 'PS', name: 'page size', tone: 'a2' },
          { bits: '6', val: 'D', name: 'dirty', tone: 'a3' },
          { bits: '5', val: 'A', name: 'accessed', tone: 'a3' },
          { bits: '4', val: 'PCD', name: 'cache', tone: 'mute' },
          { bits: '3', val: 'PWT', name: 'cache', tone: 'mute' },
          { bits: '2', val: 'U/S', name: 'user', tone: 'a2' },
          { bits: '1', val: 'R/W', name: 'write', tone: 'a2' },
          { bits: '0', val: 'P', name: 'present', tone: 'a2' }
        ], { title: 'An x86-64 page-table entry', dense: true });
        L.p('The address field is as wide as the CPU’s physical addresses: 46 bits on the lab machine, so bits 12 to 45. Bits above that, up to 51, must be 0.');
        L.p('Green bits are permissions the kernel sets. Purple bits are status the CPU records. The rest are page size, global, no-execute, two memory-type bits, and bits the CPU ignores.');
      } },
      { id: 'allowed', title: 'P, R/W, U/S: what is allowed', body: function (L) {
        L.p('Bit 0, P, says the entry is valid. When P is 0 the CPU ignores every other bit, and the walk stops.', ['pteP']);
        L.p('Bit 1, R/W, allows writes. Bit 2, U/S, allows user-mode code to use the entry; with U/S = 0 only the kernel may.', ['pteRW', 'pteUS']);
        L.p('The kernel decides all three. That is how the kernel half from [[ch:vm-space]] stays out of reach: its entries have U/S = 0.');
      } },
      { id: 'ad', title: 'A and D: what happened', body: function (L) {
        L.p('Bits 5 and 6 are written by the CPU itself. It sets A when it uses an entry for a translation, and D when a write goes through the entry that maps the page.', ['pteA', 'pteD']);
        L.p('The CPU never clears them. The kernel clears and reads them: A tells it which pages are still in use, and D which pages changed and must be written back to a file or to swap.');
        L.p('Those two bits are the only thing the MMU ever writes into page tables. Linux also presets them itself when it installs an entry, as the next section shows.');
      } },
      { id: 'more', title: 'PS, G and NX', body: function (L) {
        L.p('Bit 7, PS, in a PDPT or PD entry ends the walk early: the entry maps a 1 GiB or 2 MiB page itself. That is a huge page, [[ch:vm-huge]].', ['ptePS']);
        L.p('Bit 8, G, keeps a translation in the TLB when CR3 changes; [[ch:vm-switch]] shows why the kernel wants that. Bit 63, NX, forbids instruction fetches.', ['pteG', 'pteNX']);
        L.p('The CPU ignores bits 9–11 and 52–58, so Linux keeps its own markers there:');
        L.quote('#define _PAGE_BIT_SOFTW1   9   /* available for programmer */\n#define _PAGE_BIT_SPECIAL  _PAGE_BIT_SOFTW1\n#define _PAGE_BIT_UFFD_WP  _PAGE_BIT_SOFTW2 /* userfaultfd wrprotected */\n#define _PAGE_BIT_SOFT_DIRTY _PAGE_BIT_SOFTW3 /* software dirty tracking */', { cite: 'arch/x86/include/asm/pgtable_types.h, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
      } },
      { id: 'ours', title: 'Our page’s entry', body: function (L) {
        L.p('Now build the entry the kernel wrote for our page. The frame number is measured: pagemap said 0x129b49.');
        L.p('The flags come from the region, <code>rw-p</code>. For a private region Linux starts from “present, user, accessed, no-execute”, without write permission:');
        L.quote('#define PAGE_COPY   __pg(__PP|   0|_USR|___A|__NX|   0|   0|   0)', { cite: 'arch/x86/include/asm/pgtable_types.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('Our first touch was a store, so the fault handler also made the entry writable and dirty:');
        L.quote('entry = folio_mk_pte(folio, vma->vm_page_prot);\nentry = pte_sw_mkyoung(entry);\nif (vma->vm_flags & VM_WRITE)\n        entry = pte_mkwrite(pte_mkdirty(entry), vma);', { cite: 'mm/memory.c, do_anonymous_page(), Linux v6.18', label: 'Linux source', code: true });
        L.code('NX                    0x8000000000000000\nframe 0x129b49 << 12  0x0000000129b49000\nflags D A U/S R/W P   0x0000000000000067\n                      ------------------\nentry                 0x8000000129b49067', { lang: 'text', title: 'computed from the measured frame and the flags Linux writes', label: 'Inference' });
        L.p('0x067 is binary 0110 0111: bits 0, 1, 2, 5 and 6, that is P, R/W, U/S, A and D.');
        L.try('Decode an entry', 'Paste any entry. Try 0x8000000129b49067, then 0x0000000133c05067 at level PML4, then 0x80000001588000e7 at level PD.', function (el) { LW().pteDecoder(el, {}); });
      } },
      { id: 'upper', title: 'The entries above it', body: function (L) {
        L.p('The three entries on the path above our PT entry point to tables, not to pages. Linux gives every such entry of user memory the same flags:');
        L.quote('#define _PAGE_TABLE   (__PP|__RW|_USR|___A|   0|___D|   0|   0| _ENC)', { cite: 'arch/x86/include/asm/pgtable_types.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('That is 0x067 again: present, writable, user, accessed and dirty (the CPU ignores D in an entry that points to a table).');
        L.p('Why allow everything up there? Because permissions combine across all four levels, and the strictest entry wins. The upper entries stay open, and each PT entry decides for its own page.');
        L.note('intel', 'Bits 3 and 4 (PWT, PCD), and bit 7 in a PT entry (PAT), select a memory type through the page attribute table: write-back for normal RAM, uncacheable or write-combining for device memory. [[ch:stores]] and [[ch:io-mmio]] use them.', 'On Intel and AMD');
        L.note('arm', 'Arm’s entries are called descriptors and lay out the same information differently: AP bits for read-only and user access, UXN and PXN for no-execute, AF for accessed, nG for not-global, and an index into MAIR_EL1 for the memory type. Without FEAT_HAFDBS (added in Armv8.1), the first access to a page with AF = 0 faults and the kernel sets AF. With it, the hardware sets AF itself, and a write to a read-only page with the DBM bit set makes the page writable instead of faulting: the dirty state, kept by hardware as on x86 (arch/arm64/Kconfig, ARM64_HW_AFDBM).');
      } }
    ],
    check: [
      { q: 'An entry reads 0x0000000125396005. What does it allow?', options: ['User-mode reads only (P, U/S; no R/W)', 'Kernel-mode writes', 'Nothing: it is not present', 'User-mode reads and writes'], answer: 0, why: '0x005 = bits 0 and 2: present and user. R/W (bit 1) is 0, and NX is 0, so reads and fetches are allowed but not writes.' },
      { q: 'Which bits does the CPU set by itself?', options: ['A and D', 'P and R/W', 'U/S and NX', 'G and PS'], answer: 0, why: 'The MMU only records use (A) and writes (D). Every other bit is the kernel’s decision.' },
      { q: 'Linux gives upper-level entries R/W = 1 and U/S = 1. Does that make every page writable?', options: ['No: permissions combine, and the PT entry can still refuse', 'Yes, upper entries override', 'Only for the kernel half', 'Only with huge pages'], answer: 0, why: 'An access must be allowed at every level, so the leaf entry has the final say.' }
    ],
    remember: [
      'An entry = frame address (bits 12 and up) + flags in the low bits and bit 63.',
      'P valid, R/W writable, U/S user may use it, NX no fetch: the kernel sets these.',
      'A (used) and D (written) are set by the CPU, cleared only by software.',
      'Our page: NX | 0x129b49 << 12 | 0x067 = 0x8000000129b49067. Upper entries: next table | 0x067.'
    ],
    sources: [['Intel SDM Vol. 3A (rev. 093), §5.5, tables 5-15 to 5-20', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html'], ['AMD64 APM Vol. 2 (rev. 3.45), §5.4 “Page-translation-table entry fields”', 'https://docs.amd.com/v/u/en-US/24593_3.45_APM_Vol2_PUB'], ['Linux v6.18: pgtable_types.h', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/include/asm/pgtable_types.h'], ['Linux v6.18: mm/memory.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/memory.c']]
  });

  /* ---------- III.07 ---------- */
  var WALK_ROWS = [
    { k: 'CR3', v: CR3, d: 'top table (example value)' },
    { k: 'PML4 entry 254', v: '@ 0x107a247f0', d: '' },
    { k: 'PDPT entry 232', v: '@ 0x133c05740', d: '' },
    { k: 'PD entry 217', v: '@ 0x128e8c6c8', d: '' },
    { k: 'PT entry 195', v: '@ 0x1330d4618', d: '' },
    { k: 'physical address', v: '', d: '' }
  ];
  var WALK_STEPS = [
    { t: 'Start from CR3', d: 'The TLBs missed, so the walker starts from the top table whose address is in CR3.', hot: [0] },
    { t: 'Read PML4 entry 254', d: 'Its address is 0x107a24000 + 254 × 8 = 0x107a247f0. It holds 0x0000000133c05067: present, and the next table is at 0x133c05000.', hot: [1], done: [0], set: { 1: { d: '= 0x0000000133c05067 → PDPT at 0x133c05000' } } },
    { t: 'Read PDPT entry 232', d: '0x133c05000 + 232 × 8 = 0x133c05740. It holds 0x0000000128e8c067: the PD is at 0x128e8c000.', hot: [2], done: [0, 1], set: { 2: { d: '= 0x0000000128e8c067 → PD at 0x128e8c000' } } },
    { t: 'Read PD entry 217', d: '0x128e8c000 + 217 × 8 = 0x128e8c6c8. It holds 0x00000001330d4067: the PT is at 0x1330d4000.', hot: [3], done: [0, 1, 2], set: { 3: { d: '= 0x00000001330d4067 → PT at 0x1330d4000' } } },
    { t: 'Read PT entry 195', d: '0x1330d4000 + 195 × 8 = 0x1330d4618. It holds 0x8000000129b49067: present, writable, user, and the frame is 0x129b49.', hot: [4], done: [0, 1, 2, 3], set: { 4: { d: '= 0x8000000129b49067 → frame 0x129b49' } } },
    { t: 'Add the offset', d: 'Frame address 0x129b49000 + offset 0xd4e = 0x129b49d4e. The store goes to the caches with that address.', hot: [5], done: [0, 1, 2, 3, 4], set: { 5: { v: '0x129b49d4e', d: 'frame 0x129b49000 + offset 0xd4e' } } }
  ];
  App.lesson({
    id: 'vm-walk', short: 'The page walk', title: 'The page walk',
    lede: 'When the TLB has no answer, hardware reads one entry per level, and each read needs the one before it.',
    know: ['CR3 points to the top table; each level is chosen by 9 bits ([[ch:vm-levels]]).', 'An entry holds the next table’s or the frame’s address, plus permission bits ([[ch:vm-pte]]).'],
    learn: ['Compute the address of every entry a walk reads', 'Explain why a walk costs four dependent memory reads', 'Say how permissions combine across levels, and what SMEP and SMAP add', 'Say what happens when a walk fails'],
    sections: [
      { id: 'walk', title: 'Four reads, one per level', body: function (L) {
        L.p('Take the store to 0x7f3a1b2c3d4e once its tables exist ([[ch:vm-demand]] shows how they got there). Suppose the TLB has no translation for the page.');
        L.p('Then the page walker in the MMU reads the tables, starting from CR3. Each entry’s address is the table’s address plus 8 × the index.', ['walker']);
        L.try('Step through the walk', 'The table frames and the data frame are the main run’s measured ones; CR3 is an example value. Entry values are computed from those frames and the flags Linux writes.', function (el) { LW().stepRows(el, WALK_ROWS, WALK_STEPS); });
        L.p('So four reads turn 0x7f3a1b2c3d4e into 0x129b49d4e. The offset 0xd4e is never looked up: it is copied.');
      } },
      { id: 'cost', title: 'Four dependent reads', body: function (L) {
        L.p('The four reads cannot overlap. Each one needs the address that the previous one returned.');
        L.chain([
          { k: 'read 1', v: 'PML4', d: 'needs CR3' },
          { k: 'read 2', v: 'PDPT', d: 'needs read 1' },
          { k: 'read 3', v: 'PD', d: 'needs read 2' },
          { k: 'read 4', v: 'PT', d: 'needs read 3' },
          { k: 'then', v: 'the access', d: 'needs read 4', hot: true }
        ]);
        L.p('The walker’s reads are ordinary cacheable reads. If all four entries are in the L1 cache, a walk costs a few cycles each; if all four come from DRAM, it costs four DRAM round trips before the access itself even starts.');
        L.note('vm', 'On a virtual machine, like the lab machine, each of those reads uses a guest-physical address that the host must translate too. [[ch:vm-virt]] counts the cost: up to 24 reads instead of 4.');
      } },
      { id: 'perm', title: 'Permissions combine', body: function (L) {
        L.p('The walker checks permissions at every level, and the strictest entry wins:');
        L.list(['A user-mode access needs U/S = 1 in all four entries.', 'A write needs R/W = 1 in all four entries.', 'An instruction fetch is refused if NX = 1 in any of them.']);
        L.p('So clearing R/W in a single PDPT entry would make a whole gigabyte read-only at once. Linux leaves the upper entries open (0x067) and decides in the PT entry.');
      } },
      { id: 'smep', title: 'SMEP and SMAP: protecting the kernel from user memory', body: function (L) {
        L.p('U/S keeps user code out of kernel pages. Two CR4 bits add the reverse check, so the kernel cannot be tricked into using user pages by mistake.', ['cr4']);
        L.p('SMEP makes the CPU refuse to execute a user page in kernel mode. SMAP makes it refuse kernel-mode reads and writes of user pages unless the AC bit of RFLAGS is set, and the kernel sets it only inside its routines that copy to and from user memory.', ['smep', 'smap']);
        L.out('facts.flags');
        L.p('The lab machine’s CPU reports both, <code>smep</code> and <code>smap</code>. Linux turns them on whenever the CPU has them.');
      } },
      { id: 'fail', title: 'When the walk fails', body: function (L) {
        L.p('If an entry on the path has P = 0, or the permissions refuse the access, the walk stops. The CPU raises a page fault instead of finishing the instruction; nothing is loaded or stored.', ['pf']);
        L.p('The kernel then decides what to do: fill the tables in, copy a page, or end the program. That is the subject of [[ch:vm-faults]].');
        L.note('arm', 'An AArch64 walk works the same way, starting from TTBR0_EL1 or TTBR1_EL1. A failed walk raises a data or instruction abort, and the syndrome register ESR_EL1 says which level failed and why.');
      } }
    ],
    check: [
      { q: 'The PD of a walk is at 0x128e8c000 and the PD index is 217. Where is the entry the walker reads?', options: ['0x128e8c6c8', '0x128e8c0d9', '0x128e8c217', '0x128e8cd4e'], answer: 0, why: '217 × 8 = 1736 = 0x6c8, so the entry is at 0x128e8c000 + 0x6c8.' },
      { q: 'Why can’t the four reads of a walk run in parallel?', options: ['Each read needs the address the previous read returned', 'The walker has only one port', 'Page tables are uncacheable', 'The TLB is locked during a walk'], answer: 0, why: 'They form a chain: CR3 → PML4 entry → PDPT entry → PD entry → PT entry.' },
      { q: 'User code writes to a page whose PT entry has R/W = 1, but the PD entry above has R/W = 0. What happens?', options: ['A page fault: the write is refused', 'The write succeeds: the PT entry decides', 'The write goes to a copy', 'The CPU sets R/W in the PD entry'], answer: 0, why: 'Permissions must allow the access at every level; one R/W = 0 anywhere on the path refuses the write.' }
    ],
    remember: [
      'Entry address = table address + 8 × index, at every level.',
      'A walk is four dependent reads through the caches, then the access itself.',
      'Permissions combine over all levels: the strictest entry wins.',
      'SMEP and SMAP stop the kernel from executing or touching user pages by accident.',
      'P = 0 or a refused access anywhere on the path → page fault; nothing happens to memory.'
    ],
    sources: [['Intel SDM Vol. 3A (rev. 093), §5.5 and §5.6 “Access rights”', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html'], ['AMD64 APM Vol. 2 (rev. 3.45), §5.6 “Page-protection checks”', 'https://docs.amd.com/v/u/en-US/24593_3.45_APM_Vol2_PUB']]
  });

  /* ---------- III.08 ---------- */
  App.lesson({
    id: 'vm-tlb', short: 'The TLB', title: 'The TLB: a cache of translations',
    lede: 'A small cache of recent translations, checked before any walk. Its size decides how much memory a program can use without walking.',
    know: ['A page walk is four dependent reads ([[ch:vm-walk]]).', 'Caches keep recently used data close to the core ([[ch:whycache]]).'],
    learn: ['Say what a TLB entry holds and what a hit saves', 'Name the two TLB levels and the page-walk caches', 'Compute TLB reach and predict when misses start', 'Read a measurement that shows TLB misses'],
    sections: [
      { id: 'why', title: 'Why cache translations', body: function (L) {
        L.p('If every load and store needed a four-read walk first, each memory access would cost about five. So every core keeps its recent translations in a TLB.', ['tlb']);
        L.p('The TLB is checked on every access, before any walk. A hit returns the frame number at once.');
      } },
      { id: 'entry', title: 'What an entry holds', body: function (L) {
        L.p('A TLB entry is a finished translation: the page number, the frame number, the permission bits and the page size.');
        L.table(['Field', 'Main run’s entry', 'Why it is there'], [
          ['virtual page number', '0x7f3a1b2c3', 'the lookup key'],
          ['frame number', '0x129b49', 'the answer'],
          ['permissions', 'R/W, U/S, NX', 'checked on every hit, without reading the tables'],
          ['page size', '4 KiB', 'one entry can also hold a 2 MiB or 1 GiB page'],
          ['address-space tag', 'PCID', 'which process the entry belongs to ([[ch:vm-switch]])']
        ], { mono: false });
        L.p('The first access to the page after its tables exist misses, walks, and writes the result into the TLB. The next access to the page hits.');
      } },
      { id: 'levels', title: 'Two levels, and caches for the walk', body: function (L) {
        L.p('Like data caches, TLBs come in levels. A small L1 TLB is checked first, then a larger L2 TLB.', ['stlb']);
        L.p('The walker also caches upper-level entries, so a miss often reads only the PT entry instead of all four.', ['pwc']);
        L.p('AMD describes all three for one of its cores:');
        L.quote('The fully-associative L1 data TLB (DTLB) provides 64 entries that hold 4-Kbyte, 2-Mbyte, or 1-Gbyte page entries.\n…\nThe L2 data TLB provides a unified 12-way set-associative L2 data TLB with 1536 entries capable of holding 4-Kbyte pages, 2-Mbyte pages, and page-directory entries (PDEs) used to speed up table walks, and 1-Gbyte are not held in the L2 data TLB; they are only held in the L1 data TLB.\n…\nIn addition to the PDE storage in the L2 data TLB, the table walker includes a 64-entry Page Directory Cache (PDC) which holds page-map-level-4 entries (PML4Es) and page-directory-pointer entries (PDPEs) to speed up table walks.', { cite: 'Software Optimization Guide for AMD Family 17h Processors, pub. 55723 rev. 3.01, §2.7.1–2.7.3 (excerpt)', label: 'Vendor docs', src: ['AMD documentation portal: pub. 55723', 'https://docs.amd.com/v/u/en-US/55723_3.01_PUB'] });
        L.p('Sizes differ between cores and grow with each generation, but the shape is the same everywhere: a small L1 TLB, a larger L2 TLB, and caches of upper-level entries.');
      } },
      { id: 'reach', title: 'Reach', body: function (L) {
        L.p('How much memory can a program use without a TLB miss? Entries × page size. That product is the TLB’s reach.', ['reach']);
        L.code('64 entries   × 4 KiB = 256 KiB     (an L1 TLB)\n1536 entries × 4 KiB = 6 MiB       (an L2 TLB)\n1536 entries × 2 MiB = 3 GiB       (the same L2 TLB, with huge pages)', { lang: 'text', title: 'arithmetic' });
        L.p('Past the reach, accesses spread over many pages start to miss and walk. Huge pages multiply the reach by 512, which is most of why they exist ([[ch:vm-huge]]).');
        L.try('Reach and misses', 'Set the TLB size, the page size and the working set. The miss estimate assumes accesses spread at random.', function (el) { LW().reach(el, {}); });
      } },
      { id: 'measure', title: 'See TLB misses in a measurement', body: function (L) {
        L.p('A pointer chase makes misses visible. Each 8-byte node sits in its own 4 KiB page, and the program follows the pointers in random order, so every hop is a new page.');
        L.p('Run the same chase over 4 KiB pages and over 2 MiB pages. The data touched is identical; only the number of translations differs.');
        L.out('tlb.chase');
        L.p('Up to 64 pages, both columns stay at about 1.5 ns: every translation hits the L1 TLB.');
        L.p('From 128 pages, the 4 KiB column jumps by about 2 ns. The L1 TLB is full, so translations now come from the L2 TLB. The 2 MiB column does not move: 128 nodes in one huge page need one entry.');
        L.p('Past about 1500 to 2000 pages (6 to 8 MiB), the 4 KiB column climbs again: now the L2 TLB misses too, and hops wait for page walks. By 4096 pages, 2 MiB pages are three times faster.');
        L.note('careful', 'The thresholds match a 64-entry L1 TLB and an L2 TLB of 1536 to 2048 entries, but the lab machine is a virtual machine, so the CPU’s real TLB sizes are not reported. Treat the sizes as an inference from the measurement. On a virtual machine each walk is also slower than on bare metal ([[ch:vm-virt]]).', 'Reading this carefully');
        L.p('Try it on any page-heavy workload: when the working set passes the TLB’s reach, time per access rises in steps, and huge pages push the steps far to the right.');
        L.p('Walks are not free for the rest of the machine either: every walk read is a memory request that competes with ordinary loads. The lab below models that.');
        L.lab(function (el) { App.VMUI.labs.walks(el); });
      } },
      { id: 'hardware', title: 'Hardware handles hits and misses', body: function (L) {
        L.p('On x86 and Arm, the whole miss path, lookup, walk and refill, is done by hardware. The kernel hears about a translation only when a walk fails.');
        L.p('The kernel’s job is the other direction: when it changes an entry, a stale copy may still sit in some TLB. [[ch:vm-shootdown]] covers how it removes them.');
        L.note('other', 'Some older designs (MIPS, early SPARC) refilled the TLB in software: every miss trapped to the kernel, which walked its own tables. x86-64, AArch64 and RISC-V walk in hardware.', 'Elsewhere');
        L.p('Now see it all move in the interactive lab: [[ch:xlate]] steps the example machine’s address through the TLBs, a full walk, a page fault and a 2 MiB page.');
      } }
    ],
    check: [
      { q: 'An L1 TLB has 64 entries for 4 KiB pages. What is its reach?', options: ['256 KiB', '64 KiB', '4 MiB', '2 MiB'], answer: 0, why: '64 × 4 KiB = 256 KiB.' },
      { q: 'In the measurement, why does the 2 MiB column stay flat at 512 KiB while the 4 KiB column jumps?', options: ['128 nodes in 4 KiB pages need 128 translations; in a 2 MiB page they need one', 'The data no longer fits in L1', 'Huge pages are cached differently', 'The prefetcher helps huge pages'], answer: 0, why: 'The data touched is the same in both columns; only the number of distinct pages, and so of TLB entries needed, differs.' },
      { q: 'What does a TLB hit save?', options: ['The page walk: up to four dependent reads', 'The L1 data cache lookup', 'The permission check', 'The page fault handler'], answer: 0, why: 'The entry already holds the frame number and permissions; the data access itself still happens.' }
    ],
    remember: [
      'The TLB caches finished translations: page → frame, permissions, size, process tag.',
      'L1 TLB (tens of entries), L2 TLB (one to a few thousand), plus caches of upper-level entries.',
      'Reach = entries × page size. Past it, random accesses start to walk.',
      'Hits and misses are handled entirely in hardware; the kernel only handles failed walks.'
    ],
    sources: [['AMD, Software Optimization Guide for Family 17h, pub. 55723', 'https://docs.amd.com/v/u/en-US/55723_3.01_PUB'], ['Intel SDM Vol. 3A (rev. 093), §5.10 “Caching translation information”', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html']]
  });
})();
