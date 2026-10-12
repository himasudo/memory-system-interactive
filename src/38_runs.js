/* ======================= lab runs: real outputs quoted by the lessons =======================
   Every excerpt names the file under labruns/ it was taken from, and the machine it ran on
   (machine: 'b'; machine A when absent). tests/runs.test.cjs checks that each quoted line
   (⟦highlight⟧ marks removed; a line starting with "…" marks lines left out) appears in that
   file, so a lesson can only quote what a program really printed. */
var LabRuns = (function () {
  'use strict';
  var R = {
    /* ---- Part III: the main run (labruns/vm/story.c) ---- */
    'story.mmap': {
      file: 'vm/out/story.txt',
      what: 'The main run (story.c): reserve 4 pages at 0x7f3a1b2c3000, then look at page 0.',
      lines: [
        '== mmap(0x7f3a1b2c3000, 16384, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS|MAP_FIXED_NOREPLACE) = 0x7f3a1b2c3000',
        'its line in /proc/self/maps:',
        '  7f3a1b2c3000-7f3a1b2c7000 rw-p 00000000 00:00 0',
        'page 0 after mmap              pagemap=⟦0x0000000000000000⟧  present=0 exclusive=0 pfn=0x0'
      ]
    },
    'story.store': {
      file: 'vm/out/story.txt',
      what: 'The main run: the store, then what pagemap says about page 0.',
      lines: [
        '== store p[0xd4e] = 1  (address 0x7f3a1b2c3d4e)',
        'faults during the store: 1',
        'page 0 after the store         pagemap=0x8100000000129b49  present=1 exclusive=1 pfn=⟦0x129b49⟧'
      ]
    },
    'story.pagemap0': {
      file: 'vm/out/story.txt',
      what: 'The main run: page 0 before and after the store.',
      lines: [
        'page 0 after mmap              pagemap=0x0000000000000000  present=0 exclusive=0 pfn=0x0',
        'page 0 after the store         pagemap=⟦0x8100000000129b49⟧  present=1 exclusive=1 pfn=0x129b49'
      ]
    },
    'story.objdump': {
      file: 'vm/out/story.objdump.txt',
      what: 'objdump -d story: the instruction the compiler made from p[0xd4e] = 1. %r12 holds p.',
      lines: ['    1e97:\tmovb   $0x1,0xd4e(%r12)']
    },
    'story.vmpte': {
      file: 'vm/out/story.txt',
      what: 'The main run: VmPTE from /proc/self/status at three moments.',
      lines: ['VmPTE at start: 48 kB', 'VmPTE after mmap: 48 kB', 'VmPTE after the store: ⟦60 kB⟧']
    },
    'facts.maps1': {
      file: 'vm/out/facts.txt',
      what: 'cat reading its own /proc/self/maps (facts.sh).',
      lines: [
        '$ cat /proc/self/maps',
        '563a1b1cf000-563a1b1d1000 r--p 00000000 fe:00 343944                     /usr/bin/cat',
        '563a1b1d1000-563a1b1d6000 r-xp 00002000 fe:00 343944                     /usr/bin/cat',
        '563a1b1d6000-563a1b1d8000 r--p 00007000 fe:00 343944                     /usr/bin/cat',
        '563a1b1d8000-563a1b1d9000 r--p 00008000 fe:00 343944                     /usr/bin/cat',
        '563a1b1d9000-563a1b1da000 rw-p 00009000 fe:00 343944                     /usr/bin/cat',
        '563a4654a000-563a4656b000 rw-p 00000000 00:00 0                          [heap]',
        '7f128d400000-7f128d428000 r--p 00000000 fe:00 344580                     /usr/lib/x86_64-linux-gnu/libc.so.6',
        '7f128d428000-7f128d5b1000 r-xp 00028000 fe:00 344580                     /usr/lib/x86_64-linux-gnu/libc.so.6',
        '7f128d5b1000-7f128d600000 r--p 001b1000 fe:00 344580                     /usr/lib/x86_64-linux-gnu/libc.so.6',
        '7f128d600000-7f128d604000 r--p 001ff000 fe:00 344580                     /usr/lib/x86_64-linux-gnu/libc.so.6',
        '7f128d604000-7f128d606000 rw-p 00203000 fe:00 344580                     /usr/lib/x86_64-linux-gnu/libc.so.6',
        '7f128d606000-7f128d613000 rw-p 00000000 00:00 0',
        '7f128d7a0000-7f128d7c5000 rw-p 00000000 00:00 0',
        '7f128d7d3000-7f128d7d5000 rw-p 00000000 00:00 0',
        '7f128d7d5000-7f128d7d9000 r--p 00000000 00:00 0                          [vvar]',
        '7f128d7d9000-7f128d7db000 r--p 00000000 00:00 0                          [vvar_vclock]',
        '7f128d7db000-7f128d7dd000 r-xp 00000000 00:00 0                          [vdso]',
        '7f128d7dd000-7f128d7de000 r--p 00000000 fe:00 344560                     /usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
        '7f128d7de000-7f128d809000 r-xp 00001000 fe:00 344560                     /usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
        '7f128d809000-7f128d813000 r--p 0002c000 fe:00 344560                     /usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
        '7f128d813000-7f128d815000 r--p 00036000 fe:00 344560                     /usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
        '7f128d815000-7f128d817000 rw-p 00038000 fe:00 344560                     /usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2',
        '7fff883db000-7fff88401000 rw-p 00000000 00:00 0                          [stack]',
        'ffffffffff600000-ffffffffff601000 --xp 00000000 00:00 0                  [vsyscall]'
      ]
    },
    'facts.aslr': {
      file: 'vm/out/facts.txt',
      what: 'Two runs of cat /proc/self/maps, four lines of each (facts.sh).',
      lines: [
        '$ cat /proc/self/maps    # run 1',
        '⟦563a1b1cf000⟧-563a1b1d1000 r--p 00000000 fe:00 343944                     /usr/bin/cat',
        '⟦563a4654a000⟧-563a4656b000 rw-p 00000000 00:00 0                          [heap]',
        '⟦7f128d400000⟧-7f128d428000 r--p 00000000 fe:00 344580                     /usr/lib/x86_64-linux-gnu/libc.so.6',
        '⟦7fff883db000⟧-7fff88401000 rw-p 00000000 00:00 0                          [stack]',
        '$ cat /proc/self/maps    # run 2',
        '⟦557dd07da000⟧-557dd07dc000 r--p 00000000 fe:00 343944                     /usr/bin/cat',
        '⟦557dd4ea8000⟧-557dd4ec9000 rw-p 00000000 00:00 0                          [heap]',
        '⟦7f63ae600000⟧-7f63ae628000 r--p 00000000 fe:00 344580                     /usr/lib/x86_64-linux-gnu/libc.so.6',
        '⟦7ffc07799000⟧-7ffc077bf000 rw-p 00000000 00:00 0                          [stack]'
      ]
    },
    'facts.aslrmode': {
      file: 'vm/out/facts.txt',
      what: 'The randomization setting (facts.sh).',
      lines: ['$ cat /proc/sys/vm/nr_hugepages /proc/sys/kernel/randomize_va_space', '0', '2']
    },
    'facts.sizes': {
      file: 'vm/out/facts.txt',
      what: 'lscpu on the lab machine (facts.sh).',
      lines: ['$ lscpu | grep -E "Model name|Address sizes|Hypervisor"', 'Address sizes:                           46 bits physical, ⟦48 bits virtual⟧', 'Model name:                              Intel(R) Xeon(R) Processor @ 2.80GHz', 'Hypervisor vendor:                       KVM']
    },
    'facts.text': {
      file: 'vm/out/facts.txt',
      what: 'Where the kernel’s code starts, from the kernel’s symbol table (root only).',
      lines: ['$ grep -w -E "_text|_etext" /proc/kallsyms', '⟦ffffffff81000000⟧ T _text', 'ffffffff821350e8 T _etext']
    },
    'facts.vmpte': {
      file: 'vm/out/facts.txt',
      what: 'VmPTE of grep reading its own status file, 5 runs (facts.sh).',
      lines: ['$ grep VmPTE /proc/self/status    # 5 runs', 'VmPTE:	      44 kB', 'VmPTE:	      48 kB', 'VmPTE:	      52 kB', 'VmPTE:	      48 kB', 'VmPTE:	      52 kB']
    },
    'cost.vmpte': {
      file: 'vm/out/cost.txt',
      what: 'cost.c: map 64 MiB, store one byte into every 4 KiB page, unmap.',
      lines: ['VmPTE before 40 kB, after one store per 4 KiB page ⟦168 kB⟧, after munmap 40 kB']
    },
    'facts.flags': {
      file: 'vm/out/facts.txt',
      what: 'Which paging features the lab machine’s CPU reports: grep -o -w -E "pcid|invpcid|la57|pdpe1gb|nx|smep|smap|pku|pti" /proc/cpuinfo | sort -u',
      lines: ['invpcid nx pcid pdpe1gb smap smep']
    },
    'facts.meltdown': {
      file: 'vm/out/facts.txt',
      what: 'The kernel’s verdict on Meltdown for this CPU (facts.sh).',
      lines: ['$ cat /sys/devices/system/cpu/vulnerabilities/meltdown', 'Not affected']
    },
    'facts.thp': {
      file: 'vm/out/facts.txt',
      what: 'The lab machine’s huge-page settings (facts.sh).',
      lines: ['$ cat /sys/kernel/mm/transparent_hugepage/enabled /sys/kernel/mm/transparent_hugepage/defrag', 'always [madvise] never', 'always defer defer+madvise [madvise] never', '$ cat /proc/sys/vm/nr_hugepages /proc/sys/kernel/randomize_va_space', '0']
    },
    'facts.l1': {
      file: 'vm/out/facts.txt',
      what: 'The L1 data cache, as the lab machine’s CPU reports it (facts.sh).',
      lines: ['level:1', 'type:Data', 'size:32K', 'ways_of_associativity:8', 'number_of_sets:64', 'coherency_line_size:64']
    },
    'tlb.chase': {
      file: 'vm/out/tlb.txt',
      what: 'chase.c tlb: a pointer chase with one 8-byte node in each 4 KiB page, visited in random order. The same chase over 4 KiB pages and over 2 MiB pages. ns per hop: median of 9 runs of 4,000,000 hops.',
      lines: [
        '  working set   pages (4 KiB)   ns/hop, 4 KiB pages   ns/hop, 2 MiB pages',
        '        64 KiB              16                  1.58                  1.55',
        '       128 KiB              32                  1.53                  1.53',
        '       256 KiB              ⟦64⟧                  1.54                  1.53',
        '       512 KiB             ⟦128⟧                  ⟦3.73⟧                  1.55',
        '      1024 KiB             256                  3.68                  1.52',
        '      2048 KiB             512                  3.68                  1.53',
        '      4096 KiB            1024                  6.62                  4.28',
        '      6144 KiB            1536                  6.83                  4.44',
        '      8192 KiB            ⟦2048⟧                  ⟦8.78⟧                  4.57',
        '     16384 KiB            4096                 15.02                  4.93',
        '     32768 KiB            8192                 16.77                  4.68',
        '     65536 KiB           16384                 32.88                  8.72',
        '    131072 KiB           32768                 47.29                 25.59',
        '    262144 KiB           65536                180.45                102.63'
      ]
    },
    /* ---- lesson 9: huge pages ---- */
    'thp.result': {
      file: 'vm/out/thp.txt',
      what: 'thp.c: map 2 MiB at 0x7f3a1b200000, ask for a huge page with madvise, then store one byte at 0x7f3a1b2c3d4e.',
      lines: ['mmap 2 MiB at 0x7f3a1b200000, madvise(MADV_HUGEPAGE) = 0', 'VmPTE before the store: 48 kB', 'faults during the store: ⟦1⟧', 'VmPTE after the store: ⟦60 kB⟧', 'smaps AnonHugePages: ⟦2048 kB⟧, Rss: 2048 kB']
    },
    'thp.trace': {
      file: 'vm/out/thp.trace.txt',
      what: 'thp.c: the kernel trace during the store. Events: page_fault_user (a fault from user mode) and mm_page_alloc (a block from the page allocator; order 0 = 4 KiB, order 9 = 2 MiB).',
      lines: [
        '# == store to 0x7f3a1b2c3d4e',
        'page_fault_user: address=0x7f3a1b2c3d4e ip=0x55f17b1a55a8 error_code=0x6',
        'mm_page_alloc: pfn=0x13310d order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x1151a3 order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=⟦0x158800 order=9⟧ migratetype=1 gfp_flags=GFP_TRANSHUGE|__GFP_NORETRY|__GFP_THISNODE',
        'mm_page_alloc: pfn=0x115111 order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP'
      ]
    },
    'thp.pagemap': {
      file: 'vm/out/thp.txt',
      what: 'thp.c: pagemap for three 4 KiB pieces of the 2 MiB region after the store.',
      lines: [
        'first 4 KiB of the region      pagemap=0x8100000000158800  present=1 exclusive=1 pfn=⟦0x158800⟧',
        '4 KiB piece at +0xc3000        pagemap=0x81000000001588c3  present=1 exclusive=1 pfn=⟦0x1588c3⟧',
        'last 4 KiB piece (+0x1ff000)   pagemap=0x81000000001589ff  present=1 exclusive=1 pfn=⟦0x1589ff⟧',
        'first pfn % 512 = ⟦0⟧'
      ]
    },
    'hugetlb.pool': {
      file: 'vm/out-b/hugetlb.txt', machine: 'b',
      what: 'hugetlb.c: ask for one 2 MiB page with mmap(MAP_HUGETLB), first with the machine’s empty pool, then with a pool of one page. The pool is put back to 0 at the end.',
      lines: [
        '$ cat /proc/sys/vm/nr_hugepages', '0',
        'mmap(2 MiB, MAP_HUGETLB) failed: ⟦Cannot allocate memory⟧',
        '$ echo 1 > /proc/sys/vm/nr_hugepages',
        'mmap(2 MiB, MAP_HUGETLB) = 0x7ff829e00000',
        'faults during one store: 1',
        'first 4 KiB piece            pagemap=0x8100000000162a00  present=1 exclusive=1 pfn=0x162a00',
        'first pfn % 512 = 0',
        '  HugePages_Total:       1', '  HugePages_Free:        0',
        '$ echo 0 > /proc/sys/vm/nr_hugepages    # restored'
      ]
    },
    'cost.time': {
      file: 'vm/out/cost.txt',
      what: 'cost.c: time per page fault. 21 samples, each on a fresh 64 MiB region, one store per 4 KiB page; first small pages (MADV_NOHUGEPAGE), then a region marked MADV_HUGEPAGE.',
      lines: [
        'small pages 16384 faults per sample; ns per fault min 1622, median ⟦1738⟧, max 2164; median per MiB 444811 ns',
        'huge pages     32 faults per sample; ns per fault min 329844, median ⟦351090⟧, max 550476; median per MiB 175545 ns'
      ]
    },
    /* ---- lesson 10: the L1 and translation ---- */
    'vipt.a': {
      file: 'vm/out/vipt.txt',
      what: 'chase.c vipt: one 8-byte node in each of N pages, all at page offset 0x140 (so all in L1 set 5), against the same pages with the nodes at different offsets (different sets). ns per hop, median of 9 runs.',
      lines: ['  pages   same offset (all in L1 set 5)   spread over line positions', '      8       1.54                             1.60', '      9       1.52                             1.54', '     10       1.53                             1.52', '     11       1.52                             1.52', '     ⟦12⟧       ⟦1.52⟧                             1.52', '     ⟦13⟧       ⟦4.18⟧                             1.52', '     14       4.26                             1.52', '     16       4.25                             1.52', '     24       4.25                             1.52']
    },
    'vipt.b': {
      file: 'vm/out-b/vipt.txt', machine: 'b',
      what: 'The same chase (chase.c vipt) on machine B.',
      lines: ['  pages   same offset (all in L1 set 5)   spread over line positions', '      8       1.78                             1.83', '      9       1.83                             1.81', '     10       1.83                             1.82', '     11       1.79                             1.84', '     ⟦12⟧       ⟦1.80⟧                             1.79', '     ⟦13⟧       ⟦5.59⟧                             1.78', '     14       5.75                             1.78', '     16       5.73                             1.79', '     24       5.71                             1.79']
    },
    'facts.l1b': {
      file: 'vm/out-b/facts.txt', machine: 'b',
      what: 'The L1 data cache, as machine B’s CPU reports it (facts.sh).',
      lines: ['level:1', 'type:Data', 'size:⟦48K⟧', 'ways_of_associativity:⟦12⟧', 'number_of_sets:64', 'coherency_line_size:64']
    },
    /* ---- lesson 11: switching address spaces ---- */
    'pcid.runs': {
      file: 'vm/out/pcid.txt',
      what: 'pcid.c: two processes on CPU 0 pass one byte back and forth 1000 times through two pipes. count_switch.py reads the tlb_flush trace event that follows each switch between the two. Four runs.',
      lines: [
        'parent 2229, child 2230: 1000 round trips on CPU 0', 'context switches between the two processes: 2000', '  CR3 loads at those switches that flushed the TLB: ⟦1⟧', '  CR3 loads at those switches that kept the TLB:    ⟦1999⟧',
        'parent 2232, child 2233: 1000 round trips on CPU 0', 'context switches between the two processes: 2000', '  CR3 loads at those switches that flushed the TLB: 1', '  CR3 loads at those switches that kept the TLB:    1999',
        'parent 2235, child 2236: 1000 round trips on CPU 0', 'context switches between the two processes: 2002', '  CR3 loads at those switches that flushed the TLB: 1', '  CR3 loads at those switches that kept the TLB:    2001',
        'parent 2238, child 2239: 1000 round trips on CPU 0', 'context switches between the two processes: 2000', '  CR3 loads at those switches that flushed the TLB: 1', '  CR3 loads at those switches that kept the TLB:    1999'
      ]
    },
    /* ---- lesson 12: TLB shootdowns ---- */
    'shoot.run1': {
      file: 'vm/out/shoot.txt',
      what: 'shoot.c: 1000 times on CPU 0, map one page, store to it, unmap it. First with one thread, then with a second thread of the same process spinning on CPU 1. tlb_flush events are counted by CPU and reason; /proc/interrupts gives the TLB shootdown interrupts each CPU received.',
      lines: [
        '### run 1 (taskset -c 0 ./shoot)',
        'ONE THREAD on CPU0, 1000 x (mmap, store, munmap):', '  CPU0  local MM shootdown     ⟦1000⟧', '  /proc/interrupts TLB shootdowns received: CPU0 +0, CPU1 ⟦+0⟧',
        'TWO THREADS (the second spinning on CPU1), 1000 x (mmap, store, munmap) on CPU0:', '  CPU0  flush on task switch   2', '  CPU0  local MM shootdown     1000', '  CPU0  remote IPI send        ⟦1000⟧',
        '  CPU1  flush on task switch   5', '  CPU1  remote shootdown       999', '  CPU1  local MM shootdown     1', '  CPU1  remote IPI send        1',
        '  /proc/interrupts TLB shootdowns received: CPU0 +0, CPU1 ⟦+999⟧'
      ]
    },
    'shoot.runs23': {
      file: 'vm/out/shoot.txt',
      what: 'shoot.c, runs 2 and 3: the two-thread half only.',
      lines: [
        '### run 2 (taskset -c 0 ./shoot)', '…', '  CPU0  remote IPI send        1000', '  CPU1  flush on task switch   5', '  CPU1  remote shootdown       988', '  /proc/interrupts TLB shootdowns received: CPU0 +0, CPU1 ⟦+989⟧',
        '### run 3 (taskset -c 0 ./shoot)', '…', '  CPU0  remote IPI send        1000', '  CPU1  remote shootdown       1000', '  /proc/interrupts TLB shootdowns received: CPU0 +0, CPU1 ⟦+1000⟧'
      ]
    },
    'abit.v': {
      file: 'vm/out/abit.txt',
      what: 'abit.c: 16 pages (64 kB). After each step, smaps reports Referenced: the kB of the region whose accessed bit is set.',
      lines: [
        'after mmap                                Referenced  0 kB', 'after one store per page                  Referenced 64 kB', 'after writing 1 to clear_refs             Referenced  0 kB',
        'after one load per page                   Referenced  ⟦0 kB⟧', 'after mprotect R, then RW (TLB flushed)   Referenced  0 kB', 'after one load per page                   Referenced ⟦64 kB⟧'
      ]
    },
    'abit.20': {
      file: 'vm/out/abit.txt',
      what: 'abit.c, 20 more runs: Referenced (kB) after the reload, first after clear_refs, then after the flush.',
      lines: ['# 20 runs: Referenced after the reload (kB), first after clear_refs, then after the flush', '# after clear_refs: 4 4 4 4 4 0 8 8 8 0 0 0 0 0 0 0 0 0 0 0', '# after the flush:  64 64 64 64 64 64 64 64 64 64 64 64 64 64 64 64 64 64 64 64']
    },
    'flags.b': {
      file: 'vm/out-b/flags.txt', machine: 'b',
      what: 'Machine B: does the CPU report INVLPGB (broadcast TLB invalidation), PCIDs, INVPCID, and is page-table isolation (pti) on?',
      lines: ['$ grep -o -w -E "invlpgb|pcid|invpcid|pti" /proc/cpuinfo | sort -u | tr "\\n" " "', 'invpcid pcid']
    },
    /* ---- lesson 13: page faults ---- */
    'story.slot254': {
      file: 'vm/out/story.txt',
      what: 'The main run, before the mmap: the program’s own mappings inside the 512 GiB that PML4 entry 254 covers.',
      lines: ['== mappings in PML4 slot 254 (0x7f0000000000-0x7f7fffffffff)', '  ⟦(none)⟧']
    },
    'story.fault1': {
      file: 'vm/out/story.trace.txt',
      what: 'The main run: the kernel trace event for the first store (event page_fault_user).',
      lines: ['# == store to page 0: p[0xd4e] = 1', 'page_fault_user: address=⟦0x7f3a1b2c3d4e⟧ ip=⟦0x55c5ee6c7e97⟧ error_code=⟦0x6⟧']
    },
    'story.text': {
      file: 'vm/out/story.txt',
      what: 'The main run: the line of /proc/self/maps that holds the program’s code.',
      lines: ['  ⟦55c5ee6c7000⟧-55c5ee6c9000 r-xp ⟦00001000⟧ fe:00 894845                     /home/lab/story']
    },
    'err.codes': {
      file: 'vm/out/errcodes.txt',
      what: 'errcodes.c: one access of each kind. A SIGSEGV handler prints the exception number (trap), the error code and si_code; “no signal” means the kernel fixed the fault and the program went on.',
      lines: [
        'read  an unmapped user address           trap=14 err=0x4   si_code=SEGV_MAPERR', 'write an unmapped user address           trap=14 err=0x6   si_code=SEGV_MAPERR',
        'write a PROT_READ page, never touched    trap=14 err=0x6   si_code=SEGV_ACCERR', 'read  a PROT_READ page                   no signal',
        'write that page after the read           trap=14 err=0x7   si_code=SEGV_ACCERR', 'read  a PROT_NONE page (was written)     trap=14 err=0x4   si_code=SEGV_ACCERR',
        'call into a PROT_READ|PROT_WRITE page    trap=14 err=0x15  si_code=SEGV_ACCERR', 'read  0xffff888000000000 (kernel half)   trap=14 err=0x5   si_code=SEGV_MAPERR',
        'write 0xffff888000000000 (kernel half)   trap=14 err=0x7   si_code=SEGV_MAPERR', 'read  0xffffffff81000000 (kernel code)   trap=14 err=0x5   si_code=SEGV_MAPERR',
        'read  0x0000800000000000 (non-canonical) trap=13 err=0x0   si_code=SI_KERNEL'
      ]
    },
    'err.trace': {
      file: 'vm/out/errcodes.trace.txt',
      what: 'errcodes.c: the kernel’s page_fault_user event for each access. It fires before the kernel decides what to do.',
      lines: [
        '# == read  a PROT_READ page', 'page_fault_user: address=0x7f18f5209000 ip=0x559cd58d8702 error_code=⟦0x4⟧',
        '# == write that page after the read', 'page_fault_user: address=0x7f18f5209000 ip=0x559cd58d875b error_code=⟦0x7⟧',
        '# == call into a PROT_READ|PROT_WRITE page', 'page_fault_user: address=0x7f18f5206000 ip=⟦0x7f18f5206000⟧ error_code=0x15'
      ]
    },
    'err.kernel': {
      file: 'vm/out/errcodes.txt',
      what: 'errcodes.c: loads from the kernel half and from the hole between the halves. A SIGSEGV handler prints the exception number (trap), the error code and si_code.',
      lines: [
        'read  0xffff888000000000 (kernel half)   trap=14 err=0x5   si_code=SEGV_MAPERR',
        'read  0xffffffff81000000 (kernel code)   trap=14 err=0x5   si_code=SEGV_MAPERR',
        'read  0x0000800000000000 (non-canonical) trap=⟦13⟧ err=0x0   si_code=SI_KERNEL'
      ]
    }
  };
  function get(id) {
    var r = R[id];
    if (!r) throw new Error('Unknown lab run: ' + id);
    return r;
  }
  function text(id) {
    return get(id).lines.join('\n');
  }
  return { runs: R, get: get, text: text };
})();
if (typeof App !== 'undefined') App.RUNS = LabRuns;
if (typeof module !== 'undefined') module.exports = LabRuns;
