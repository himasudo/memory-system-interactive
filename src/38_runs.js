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
    /* ---- lesson 14: demand paging ---- */
    'story.alloc': {
      file: 'vm/out/story.trace.txt',
      what: 'The main run: the kernel trace during the first store. mm_page_alloc lists every block the fault handler took from the page allocator, with the flags it asked for.',
      lines: [
        '# == store to page 0: p[0xd4e] = 1',
        'page_fault_user: address=0x7f3a1b2c3d4e ip=0x55c5ee6c7e97 error_code=0x6',
        'mm_page_alloc: pfn=⟦0x133c05⟧ order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=⟦0x128e8c⟧ order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=⟦0x1330d4⟧ order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=⟦0x129b49⟧ order=0 migratetype=1 gfp_flags=GFP_HIGHUSER_MOVABLE|__GFP_ZERO|__GFP_COMP',
        '# == second store to page 0',
        '# == load from page 1'
      ]
    },
    'story.second': {
      file: 'vm/out/story.txt',
      what: 'The main run: fault counts (getrusage) around the first and the second store to page 0.',
      lines: ['faults during the store: 1', 'page 0 after the store         pagemap=0x8100000000129b49  present=1 exclusive=1 pfn=0x129b49', 'VmPTE after the store: 60 kB', 'faults during a second store: ⟦0⟧']
    },
    'story.zero': {
      file: 'vm/out/story.txt',
      what: 'The main run: a load from page 1, which no store has touched yet, then a store to it.',
      lines: ['== load from page 1: x = p[0x1d4e]', 'read 0, faults 1', 'page 1 after the load          pagemap=0x8000000000003241  present=1 exclusive=⟦0⟧ pfn=⟦0x3241⟧', 'store to page 1: faults 1', 'page 1 after the store         pagemap=0x8100000000125396  present=1 exclusive=1 pfn=⟦0x125396⟧']
    },
    'story.zerotrace': {
      file: 'vm/out/story.trace.txt',
      what: 'The main run: the kernel trace for the load from page 1 and the store that follows.',
      lines: [
        '# == load from page 1', 'page_fault_user: address=0x7f3a1b2c4d4e ip=0x55c5ee6c7f57 error_code=⟦0x4⟧',
        '# == store to page 1', 'page_fault_user: address=0x7f3a1b2c4d4e ip=0x55c5ee6c7fb3 error_code=⟦0x7⟧',
        'mm_page_alloc: pfn=0x125396 order=0 migratetype=1 gfp_flags=GFP_HIGHUSER_MOVABLE|__GFP_ZERO|__GFP_COMP',
        'tlb_flush: ⟦pages:1⟧ reason:local MM shootdown (3)'
      ]
    },
    'zero.b': {
      file: 'vm/out-b/zeropage.txt', machine: 'b',
      what: 'zeropage.c: the frame a load from a fresh page gets, and where the kernel’s own code and data sit in physical memory (/proc/iomem).',
      lines: ['after one load from a fresh page pagemap=0x8000000000003241  present=1 exclusive=0 pfn=⟦0x3241⟧', '/proc/iomem:   01000000-021350e7 : Kernel code', '/proc/iomem:   02200000-02bbafff : Kernel rodata', '/proc/iomem:   02c00000-02e6277f : Kernel data', '/proc/iomem:   ⟦03241000⟧-033fffff : Kernel bss']
    },
    'cost.counts': {
      file: 'vm/out/cost.txt',
      what: 'cost.c: page faults counted with getrusage over passes of one access per 4 KiB page across a 64 MiB region.',
      lines: ['== 2. fault counts, 64 MiB, one access per 4 KiB page', 'first store pass   faults 16384', 'second store pass  faults 0', 'load pass (fresh)  faults ⟦16384⟧', 'then a store pass  faults ⟦16384⟧']
    },
    /* ---- lesson 15: file mappings ---- */
    'major.run': {
      file: 'vm/out/major.txt',
      what: 'major.c: write a 4 KiB file, drop the page cache, map the file MAP_PRIVATE, then load twice and store once. Major and minor faults from getrusage.',
      lines: [
        'file /home/lab/hello.txt, inode 894885, mapped MAP_PRIVATE at 0x7f1ccb8a0000',
        'first load : reads \'H\', ⟦major +1⟧ minor +0',
        'after the first load           pagemap=⟦0xa1⟧0000000010fa24  present=1 exclusive=1 pfn=0x10fa24',
        'second load: major +0 minor +0',
        'store      : major +0 ⟦minor +1⟧',
        'after the store                pagemap=0x810000000011da16  present=1 exclusive=1 pfn=⟦0x11da16⟧',
        'memory now reads "JELLO from the file on disk", the file still reads "HELLO from the file on disk"'
      ]
    },
    'major.trace': {
      file: 'vm/out/major.trace.txt',
      what: 'major.c: the kernel trace. mm_filemap_add_to_page_cache marks a frame being added to the page cache for a file (device, inode, offset).',
      lines: [
        '# == first load', 'page_fault_user: address=0x7f1ccb8a0000 ip=0x55d5552fd59a error_code=0x4',
        'mm_page_alloc: pfn=0x10fa24 order=0 migratetype=1 gfp_flags=GFP_NOFS|__GFP_HIGHMEM|__GFP_MOVABLE|__GFP_NOWARN|__GFP_NORETRY|__GFP_COMP|__GFP_HARDWALL',
        'mm_filemap_add_to_page_cache: dev 254:0 ino da7a5 pfn=⟦0x10fa24⟧ ofs=0 order=0',
        '# == second load', '# == store p[0] = \'J\'', 'page_fault_user: address=0x7f1ccb8a0000 ip=0x55d5552fd663 error_code=0x7',
        'mm_page_alloc: pfn=⟦0x11da16⟧ order=0 migratetype=1 gfp_flags=GFP_HIGHUSER_MOVABLE|__GFP_COMP',
        'tlb_flush: pages:1 reason:local MM shootdown (3)'
      ]
    },
    /* ---- lesson 16: fork and copy-on-write ---- */
    'story.fork': {
      file: 'vm/out/story.txt',
      what: 'The main run: pagemap for page 0 in the parent and in the child around fork, and after each one stores to it.',
      lines: [
        '== fork',
        'parent page 0 before fork      pagemap=0x8100000000129b49  present=1 exclusive=1 pfn=0x129b49',
        'parent page 0 after fork       pagemap=0x8000000000129b49  present=1 exclusive=⟦0⟧ pfn=⟦0x129b49⟧',
        'child page 0 after fork        pagemap=0x8000000000129b49  present=1 exclusive=⟦0⟧ pfn=⟦0x129b49⟧',
        'child: faults during its store 1, reads 9',
        'child page 0 after its store   pagemap=0x8100000000116f45  present=1 exclusive=1 pfn=⟦0x116f45⟧',
        'parent: faults during its store 1, reads 7',
        'parent page 0 after its store  pagemap=0x8100000000129b49  present=1 exclusive=1 pfn=⟦0x129b49⟧'
      ]
    },
    'story.forktrace': {
      file: 'vm/out/story.trace.txt',
      what: 'The main run: the kernel trace inside fork(), up to its TLB flush. Events from the parent and the new child are both recorded.',
      lines: [
        '# == fork',
        'page_fault_user: address=0x7fac8c50e2b0 ip=0x7fac8c50e2b0 error_code=0x14',
        'page_fault_user: address=0x7fac8c4ee280 ip=0x7fac8c4ee280 error_code=0x14',
        'mm_page_alloc: pfn=0x10dca0 order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x113452 order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x1134bc order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x1040af order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x1332e6 order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x115112 order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x128c39 order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x13309e order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x128c73 order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x104243 order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x1137ae order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x1151bd order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x10dcfb order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'mm_page_alloc: pfn=0x14dfd0 order=0 migratetype=0 gfp_flags=GFP_KERNEL_ACCOUNT|__GFP_ZERO|__GFP_COMP',
        'tlb_flush: ⟦pages:-1⟧ reason:local MM shootdown (3)'
      ]
    },
    'story.cowtrace': {
      file: 'vm/out/story.trace.txt',
      what: 'The main run: the kernel trace for the child’s store to page 0, and later the parent’s, after the child has exited.',
      lines: [
        '# == child stores 9 to page 0', 'page_fault_user: address=0x7f3a1b2c3d4e ip=0x55c5ee6c8095 error_code=⟦0x7⟧',
        'mm_page_alloc: pfn=⟦0x116f45⟧ order=0 migratetype=1 gfp_flags=GFP_HIGHUSER_MOVABLE|__GFP_COMP',
        'tlb_flush: pages:1 reason:local MM shootdown (3)', '…',
        '# == parent stores 7 to page 0 (child has exited)', 'page_fault_user: address=0x7f3a1b2c3d4e ip=0x55c5ee6c8137 error_code=⟦0x7⟧',
        '# == parent stores to page 3 again'
      ]
    },
    'fork64': {
      file: 'vm/out/fork64.txt',
      what: 'fork64.c: write 64 MiB, fork, let the child write every page, then, after the child has exited, the parent. Three runs.',
      lines: [
        'run 1  fork returned in the child after ⟦2.20 ms⟧', '       child store pass:  16384 faults, 45.3 ms, ⟦2765 ns per fault⟧', '       parent store pass: 16384 faults, 12.5 ms, ⟦762 ns per fault⟧ (after the child exited)',
        'run 2  fork returned in the child after 1.95 ms', '       child store pass:  16384 faults, 45.5 ms, 2776 ns per fault', '       parent store pass: 16384 faults, 13.1 ms, 802 ns per fault (after the child exited)',
        'run 3  fork returned in the child after 1.81 ms', '       child store pass:  16384 faults, 44.2 ms, 2696 ns per fault', '       parent store pass: 16384 faults, 12.8 ms, 782 ns per fault (after the child exited)'
      ]
    },
    /* ---- lesson 17: faults on purpose ---- */
    'story.mprotect': {
      file: 'vm/out/story.txt',
      what: 'The main run: page 3 made read-only with mprotect, then a store to it, caught by a SIGSEGV handler.',
      lines: ['== mprotect(page 3, PROT_READ), then store to it', '/proc/self/maps now:', '  7f3a1b2c3000-⟦7f3a1b2c6000 rw-p⟧ 00000000 00:00 0', '  ⟦7f3a1b2c6000-7f3a1b2c7000 r--p⟧ 00000000 00:00 0', 'SIGSEGV: trap=14 err=⟦0x7⟧ cr2=0x7f3a1b2c6d4e si_code=⟦SEGV_ACCERR⟧']
    },
    'story.mprotecttrace': {
      file: 'vm/out/story.trace.txt',
      what: 'The main run: the kernel trace around the mprotect and the refused store. The lines left out are the parent’s own first writes after fork (copy-on-write, all reused).',
      lines: ['# == parent stores to page 3 again', 'page_fault_user: address=0x7f3a1b2c6d4e ip=0x55c5ee6c8188 error_code=0x7', '# == mprotect page 3 read-only', 'tlb_flush: ⟦pages:1⟧ reason:local MM shootdown (3)', '…', '# == store to read-only page 3', '…', 'page_fault_user: address=0x7f3a1b2c6d4e ip=0x55c5ee6c8213 error_code=0x7']
    },
    'story.dontneed': {
      file: 'vm/out/story.txt',
      what: 'The main run: madvise(MADV_DONTNEED) on page 0, then a load and a store.',
      lines: ['== madvise(page 0, MADV_DONTNEED)', 'page 0 after madvise           pagemap=0x0000000000000000  present=⟦0⟧ exclusive=0 pfn=0x0', 'load from page 0 reads ⟦0⟧', 'page 0 after the store         pagemap=0x8100000000129b49  present=1 exclusive=1 pfn=⟦0x129b49⟧']
    },
    'story.dontneedtrace': {
      file: 'vm/out/story.trace.txt',
      what: 'The main run: the kernel trace for the madvise, the load and the store.',
      lines: [
        '# == madvise DONTNEED page 0', 'tlb_flush: pages:1 reason:local MM shootdown (3)', 'mm_page_free: ⟦pfn=0x129b49⟧ order=0',
        '# == load from page 0', 'page_fault_user: address=0x7f3a1b2c3d4e ip=0x55c5ee6c8284 error_code=0x4',
        '# == store to page 0', 'page_fault_user: address=0x7f3a1b2c3d4e ip=0x55c5ee6c82b1 error_code=0x7',
        'mm_page_alloc: ⟦pfn=0x129b49⟧ order=0 migratetype=1 gfp_flags=GFP_HIGHUSER_MOVABLE|__GFP_ZERO|__GFP_COMP', 'tlb_flush: pages:1 reason:local MM shootdown (3)'
      ]
    },
    /* ---- lesson 18: what a fault costs ---- */
    'cost.populate': {
      file: 'vm/out/cost.txt',
      what: 'cost.c: a 64 MiB region filled in ahead of time with madvise(MADV_POPULATE_WRITE), then one store per 4 KiB page.',
      lines: ['== 3. prefaulting with madvise(MADV_POPULATE_WRITE), 64 MiB, small pages', 'faults inside madvise ⟦16384⟧ (28.1 ms)', 'faults during the store pass ⟦0⟧ (0.41 ms)']
    },
    /* ---- lesson 19: where frames come from (machine B) ---- */
    'zones.ranges': {
      file: 'vm/out-b/zones.txt', machine: 'b',
      what: "zones.sh: the zones machine B’s kernel set up at boot (physical address ranges).",
      lines: ["$ dmesg | grep -A4 \"Zone ranges\"", "Zone ranges:", "  DMA      [mem 0x0000000000001000-0x0000000000ffffff]", "  DMA32    [mem 0x0000000001000000-0x00000000ffffffff]", "  Normal   [mem 0x0000000100000000-0x000000043fffffff]", "  Device   empty"]
    },
    'zones.buddy': {
      file: 'vm/out-b/zones.txt', machine: 'b',
      what: "/proc/buddyinfo: free blocks in each zone, by order, from order 0 (1 frame) on the left to order 10 (1024 frames) on the right.",
      lines: ["$ cat /proc/buddyinfo", "Node 0, zone      DMA      0      0      0      0      0      0      0      0      1      1      3 ", "Node 0, zone    DMA32      2      2      2      2      2      2      5      2      2      2    754 ", "Node 0, zone   Normal   3509   5467   3830   1755    936    414    355    137     55     22    ⟦ 84 ⟧"]
    },
    'zones.types': {
      file: 'vm/out-b/zones.txt', machine: 'b',
      what: "/proc/pagetypeinfo: the size of a pageblock, and the Normal zone’s free blocks split by migrate type.",
      lines: ["$ grep -E \"Page block|Pages per|zone   Normal, type\" /proc/pagetypeinfo | head -6", "Page block order: 9", "Pages per block:  512", "Node    0, zone   Normal, type    Unmovable      0     91    319    112     82     29     12      3      5      1      0 ", "Node    0, zone   Normal, type      Movable   3488   5295   3459   1595    836    373    339    134     50     21     84 ", "Node    0, zone   Normal, type  Reclaimable     21     81     52     48     18     12      4      0      0      0      0 ", "Node    0, zone   Normal, type   HighAtomic      0      0      0      0      0      0      0      0      0      0      0 "]
    },
    'zones.pcp': {
      file: 'vm/out-b/zones.txt', machine: 'b',
      what: "/proc/zoneinfo, Normal zone: free pages, the three watermarks, and CPU 0’s list of free frames.",
      lines: ["$ awk ... /proc/zoneinfo    # the Normal zone: free pages, watermarks, CPU 0 list (see zones.sh)", "Node 0, zone   Normal", "  pages free     223669", "        min      6801", "        low      8501", "        high     10201", "    cpu: 0", "              count:    2061", "              high:     2251", "              batch:    63"]
    },
    'zones.config': {
      file: 'vm/out-b/zones.txt', machine: 'b',
      what: "Two settings of machine B’s kernel.",
      lines: ["$ zcat /proc/config.gz | grep -E \"CONFIG_PCP_BATCH_SCALE_MAX|CONFIG_NUMA=\"", "CONFIG_NUMA=y", "CONFIG_PCP_BATCH_SCALE_MAX=5"]
    },
    'buddy.huge': {
      file: 'vm/out-b/buddy.txt', machine: 'b',
      what: "buddy.c: the Normal zone’s line of /proc/buddyinfo around one 2 MiB transparent huge-page fault.",
      lines: ["== 1. one 2 MiB transparent huge page (Normal zone; free blocks of order 0 1 2 ... 10)", "before the fault          2197   5969   4168   1798    937    372    355    138     55    ⟦ 22 ⟧    84 ", "after the fault           2197   5969   4168   1798    937    372    355    138     55    ⟦ 20 ⟧    84 ", "huge page: pfn=0x162c00, pfn % 512 = 0: one block of order 9", "after munmap              2197   5969   4168   1798    937    372    355    138     55    ⟦ 22 ⟧    84 "]
    },
    'buddy.small': {
      file: 'vm/out-b/buddy.txt', machine: 'b',
      what: "buddy.c: 256 fresh pages, one store each. The trace counts blocks handed out (mm_page_alloc) and blocks taken from the zone’s free lists to refill CPU 0’s list (mm_page_alloc_zone_locked).",
      lines: ["== 2. 256 fresh 4 KiB pages, one store each", "CPU 0's list before: count 2237 high 2755 batch 63", "mm_page_alloc: 256 blocks for user pages, 1 for page tables", "taken from the zone's free lists to refill CPU 0's list⟦: 0 pages⟧", "frames of the first 8 pages: 0x1504ba 0x13197b 0x14d7d4 0x112aad 0x153c15 0x12fdf2 0x149a2b 0x149a2c"]
    },
    'buddy.refill': {
      file: 'vm/out-b/buddy.txt', machine: 'b',
      what: "buddy.c: 16384 more fresh pages, enough to empty CPU 0’s list.",
      lines: ["== 3. 16384 more fresh pages (64 MiB), one store each", "mm_page_alloc: 16384 blocks for user pages, 32 for page tables", "taken from the zone's free lists to refill CPU 0's list: 16065 pages", "refills, in order: ⟦63 126 252 504 1008 2016⟧ 2016 2016 2016 2016 2016 2016", "CPU 0's list after: count 1675 high 16384 batch 63"]
    },
    'buddy.lifo': {
      file: 'vm/out-b/buddy.txt', machine: 'b',
      what: "buddy.c: one page freed with MADV_DONTNEED, then written again.",
      lines: ["== 4. free one page, then write it again", "page 0: pfn=0x1504ba before MADV_DONTNEED, pfn=0x1504ba after the next store"]
    },
    /* ---- lesson 20: reclaim (machine B) ---- */
    'reclaim.meminfo': {
      file: 'vm/out-b/reclaim.txt', machine: 'b',
      what: "/proc/meminfo on machine B before the runs: the LRU lists for anonymous and file pages, and no swap.",
      lines: ["$ grep -E \"^(MemTotal|MemFree|Active|Inactive|Unevictable|SwapTotal)\" /proc/meminfo", "MemTotal:       16479424 kB", "MemFree:        15927960 kB", "Active:             3952 kB", "Inactive:         454848 kB", "Active(anon):         28 kB", "Inactive(anon):   299292 kB", "Active(file):       3924 kB", "Inactive(file):   155556 kB", "Unevictable:        8588 kB", "SwapTotal:             0 kB"]
    },
    'reclaim.limit': {
      file: 'vm/out-b/reclaim.txt', machine: 'b',
      what: "reclaim.sh: the memory cgroup created for the runs, limited to 64 MiB.",
      lines: ["$ cat /sys/fs/cgroup/memory/lab/memory.limit_in_bytes", "67108864"]
    },
    'reclaim.twice': {
      file: 'vm/out-b/reclaim.txt', machine: 'b',
      what: "reclaim.sh: a 16 MiB file read twice from inside the cgroup, by two cat processes; memory.stat after each read (bytes).",
      lines: ["== 1. read a 16 MiB file twice inside the cgroup", "$ grep -E \"^(cache|rss|active_file|inactive_file) \" memory.stat    # after the first read", "cache 16916480", "rss 0", "⟦inactive_file 16781312⟧", "active_file 135168", "$ grep -E \"^(cache|rss|active_file|inactive_file) \" memory.stat    # after the second read", "cache 16916480", "rss 0", "inactive_file 0", "⟦active_file 16916480⟧"]
    },
    'reclaim.stream': {
      file: 'vm/out-b/reclaim.txt', machine: 'b',
      what: "reclaim.sh: a 256 MiB file read once inside the same cgroup. memory.failcnt counts the times usage hit the limit.",
      lines: ["== 2. read a 256 MiB file once inside the cgroup", "$ cat memory.max_usage_in_bytes memory.failcnt", "⟦67104768⟧", "834", "$ grep -E \"^(cache|rss|active_file|inactive_file) \" memory.stat", "cache 66670592", "rss 0", "inactive_file 50069504", "⟦active_file 16601088⟧", "$ /proc/vmstat: change during the read (reclaim for the whole machine)", "pgsteal_kswapd 0", "pgsteal_direct 0", "pgscan_kswapd 0", "pgscan_direct 0", "oom_kill 0"]
    },
    'reclaim.oom': {
      file: 'vm/out-b/reclaim.txt', machine: 'b',
      what: "reclaim.sh: eat.c writes 128 MiB of anonymous memory inside the cgroup; there is no swap.",
      lines: ["== 3. write 128 MiB of anonymous memory inside the cgroup", "written 0 MiB", "written 16 MiB", "written 32 MiB", "written 48 MiB", "⟦Killed⟧", "exit status: 137", "$ cat memory.oom_control", "oom_kill_disable 0", "under_oom 0", "⟦oom_kill 1⟧", "$ /proc/vmstat: change during the run", "pgsteal_kswapd 0", "pgsteal_direct 0", "pgscan_kswapd 0", "pgscan_direct 0", "⟦oom_kill 1⟧", "$ dmesg | grep \"Memory cgroup out of memory\" | tail -1", "Memory cgroup out of memory: Killed process 11049 (eat) total-vm:133640kB, anon-rss:65152kB, file-rss:1424kB, shmem-rss:0kB, UID:0 pgtables:168kB oom_score_adj:0"]
    },
    'reclaim.swap': {
      file: 'vm/out-b/swap.txt', machine: 'b',
      what: "Machine B: the active swap areas (none), and the kernel’s options for swap, zswap, zram and the multi-generation LRU.",
      lines: ["$ cat /proc/swaps", "Filename    Type    Size    Used    Priority", "$ zcat /proc/config.gz | grep -E \"^(# )?CONFIG_(SWAP|ZSWAP|ZRAM|LRU_GEN)[= ]\"", "CONFIG_SWAP=y", "CONFIG_ZSWAP=y", "⟦# CONFIG_LRU_GEN is not set⟧", "CONFIG_ZRAM=y"]
    },
    'reclaim.wmark': {
      file: 'vm/out-b/zones.txt', machine: 'b',
      what: "/proc/zoneinfo, Normal zone: the three watermarks, in pages of 4 KiB.",
      lines: ["$ awk ... /proc/zoneinfo    # the Normal zone: free pages, watermarks, CPU 0 list (see zones.sh)", "Node 0, zone   Normal", "…", "        min      ⟦6801⟧", "        low      ⟦8501⟧", "        high     ⟦10201⟧"]
    },
    /* ---- lesson 21: aliases ---- */
    'alias.views': {
      file: 'vm/out/alias.txt',
      what: "alias.c: one 4 KiB memfd mapped twice with MAP_SHARED; a string written through view A is read through view B.",
      lines: ["view A 0x7f2f1743b000  view B 0x7f2f1743a000", "read through view B at +0xd4e: \"written through view A\"", "pagemap view A: pfn=⟦0x110b4b⟧   view B: pfn=⟦0x110b4b⟧"]
    },
    'alias.maps': {
      file: 'vm/out/alias.txt',
      what: "alias.c: the two mappings in /proc/self/maps.",
      lines: ["7f2f1743a000-7f2f1743b000 rw-s 00000000 00:01 14                         /memfd:one-frame (deleted)", "7f2f1743b000-7f2f1743c000 rw-s 00000000 00:01 14                         /memfd:one-frame (deleted)"]
    },
    'alias.libc': {
      file: 'vm/out/alias.txt',
      what: "alias.c run twice as separate processes: where getpid’s code is, and which frame holds it.",
      lines: ["process 2272: getpid at 0x7f6bb54f5b90, pagemap pfn=⟦0x10211b⟧", "process 2273: getpid at 0x7f7c4f0f5b90, pagemap pfn=⟦0x10211b⟧"]
    },
    'alias.chase': {
      file: 'vm/out-b/aliaschase.txt', machine: 'b',
      what: "aliaschase.c: the same 128-node pointer chase over one frame, once through view A only and once switching views at every visit to a line.",
      lines: ["view A 0x7faf0b3d2000  view B 0x7faf0b3d1000  pagemap pfn: A 0x12f761  B 0x12f761", "128 nodes in the 64 lines of one frame, ns per hop over 9 runs", "  one view (A only)       median ⟦1.82⟧   min 1.78   max 1.87", "  two views (A and B)     median ⟦1.80⟧   min 1.77   max 1.88"]
    },
    /* ---- lesson 22: virtual machines (machine B) ---- */
    'virt.cpu': {
      file: 'vm/out-b/virt.txt', machine: 'b',
      what: "virt.sh: what machine B’s kernel reports about the hypervisor, and the CPU flags for hardware virtualization (vmx, svm) and for running on a hypervisor.",
      lines: ["$ lscpu | grep -E \"Hypervisor vendor|Virtualization type\"", "Hypervisor vendor:                       KVM", "Virtualization type:                     full", "$ grep -o -w -E \"hypervisor|vmx|svm\" /proc/cpuinfo | sort | uniq -c", "      ⟦4 hypervisor⟧"]
    },
    'virt.ram': {
      file: 'vm/out-b/virt.txt', machine: 'b',
      what: "virt.sh: the guest-physical address ranges that hold machine B’s RAM.",
      lines: ["$ grep \"System RAM\" /proc/iomem", "00001000-0009fbff : System RAM", "00100000-bfffffff : System RAM", "100000000-43fffffff : System RAM"]
    },
    'virt.dmesg': {
      file: 'vm/out-b/virt.txt', machine: 'b',
      what: "virt.sh: boot messages of machine B’s kernel about KVM.",
      lines: ["$ dmesg | grep -E \"Hypervisor detected|Booting paravirtualized|pv remote TLB flush\"", "Hypervisor detected: KVM", "⟦kvm-guest: KVM setup pv remote TLB flush⟧", "Booting paravirtualized kernel on KVM"]
    },
    /* ---- Part VI: devices and I/O (machine B) ---- */
    'io.iomem': {
      file: 'io/out/iomem.txt', machine: 'b',
      what: "iomem.sh: machine B’s physical address space as /proc/iomem shows it to root: RAM, the windows for PCI devices, the ECAM window for configuration space, and one entry per PCI function.",
      lines: ["$ grep -E \"System RAM|Kernel code|PCI Bus|PCI ECAM|IOAPIC|: 0000:00:\" /proc/iomem", "00001000-0009fbff : ⟦System RAM⟧", "00100000-bfffffff : ⟦System RAM⟧", "  01000000-021350e7 : Kernel code", "c0001000-eebfffff : PCI Bus 0000:00", "  eec00000-eecfffff : ⟦PCI ECAM 0000 [bus 00-00]⟧", "    eec00000-eecfffff : PCI Bus 0000:00", "fec00000-fec003ff : IOAPIC 0", "100000000-43fffffff : ⟦System RAM⟧", "4000000000-7fffffffff : PCI Bus 0000:00", "  4000000000-400007ffff : 0000:00:01.0", "  ⟦4000080000-40000fffff : 0000:00:02.0⟧", "  4000100000-400017ffff : 0000:00:03.0", "  4000180000-40001fffff : 0000:00:04.0", "  4000200000-400027ffff : 0000:00:05.0", "  4000280000-40002fffff : 0000:00:06.0", "  4000300000-400037ffff : 0000:00:07.0", "  4000380000-40003fffff : 0000:00:08.0", "  4000400000-400047ffff : 0000:00:09.0", "  4000480000-40004fffff : 0000:00:0a.0"]
    },
    'io.claim': {
      file: 'io/out/iomem.txt', machine: 'b',
      what: "iomem.sh: the address range of the disk’s PCI function, and the driver that claimed it.",
      lines: ["$ grep -A1 \": 0000:00:02.0\" /proc/iomem    # the disk's PCI function, and who claimed its registers", "  4000080000-40000fffff : 0000:00:02.0", "    4000080000-40000fffff : virtio-pci-modern"]
    },
    'io.functions': {
      file: 'io/out/iomem.txt', machine: 'b',
      what: "iomem.sh: every PCI function on machine B: slot (domain:bus:device.function), vendor and device IDs, class code, driver, and number of MSI-X vectors.",
      lines: ["$ for each PCI function: slot, vendor:device, class, driver, MSI-X vectors", "0000:00:00.0  0x8086:0x0d57  class 0x060000  driver -           vectors 0", "0000:00:01.0  0x1af4:0x1045  class 0xffff00  driver virtio-pci  vectors 5", "⟦0000:00:02.0  0x1af4:0x1042⟧  class 0x018000  driver virtio-pci  vectors 2", "0000:00:03.0  0x1af4:0x1042  class 0x018000  driver virtio-pci  vectors 2", "0000:00:04.0  0x1af4:0x1042  class 0x018000  driver virtio-pci  vectors 2", "0000:00:05.0  0x1af4:0x1042  class 0x018000  driver virtio-pci  vectors 2", "0000:00:06.0  0x1af4:0x1042  class 0x018000  driver virtio-pci  vectors 2", "0000:00:07.0  0x1af4:0x1042  class 0x018000  driver virtio-pci  vectors 2", "0000:00:08.0  0x1af4:0x1041  class 0x020000  driver virtio-pci  vectors 3", "0000:00:09.0  0x1af4:0x1053  class 0xffff00  driver virtio-pci  vectors 4", "0000:00:0a.0  0x1af4:0x1044  class 0xffff00  driver virtio-pci  vectors 2"]
    },
    'io.virtio': {
      file: 'io/out/iomem.txt', machine: 'b',
      what: "iomem.sh: each virtio device, the PCI function it sits on, its virtio device type, and feature bit 33 (VIRTIO_F_ACCESS_PLATFORM) as negotiated.",
      lines: ["$ for each virtio device: device type, and feature bit 33 (VIRTIO_F_ACCESS_PLATFORM)", "virtio0  on 0000:00:01.0  type 5  ⟦bit 33 = 0⟧", "virtio1  on 0000:00:02.0  type 2  ⟦bit 33 = 0⟧", "virtio2  on 0000:00:03.0  type 2  ⟦bit 33 = 0⟧", "virtio3  on 0000:00:04.0  type 2  ⟦bit 33 = 0⟧", "virtio4  on 0000:00:05.0  type 2  ⟦bit 33 = 0⟧", "virtio5  on 0000:00:06.0  type 2  ⟦bit 33 = 0⟧", "virtio6  on 0000:00:07.0  type 2  ⟦bit 33 = 0⟧", "virtio7  on 0000:00:08.0  type 1  ⟦bit 33 = 0⟧", "virtio8  on 0000:00:09.0  type 19  ⟦bit 33 = 0⟧", "virtio9  on 0000:00:0a.0  type 4  ⟦bit 33 = 0⟧"]
    },
    'io.iommu': {
      file: 'io/out/iomem.txt', machine: 'b',
      what: "iomem.sh: IOMMU devices the kernel registered (none: ls prints nothing), and its boot messages about DMA translation and bounce buffers.",
      lines: ["$ ls /sys/class/iommu    # IOMMU hardware the kernel found", "$ dmesg | grep -E \"iommu: Default domain|TLB invalidation policy|PCI-DMA|software IO TLB\"", "iommu: Default domain type: Translated", "iommu: DMA domain TLB invalidation policy: lazy mode", "PCI-DMA: Using software bounce buffering for IO (SWIOTLB)", "software IO TLB: ⟦No low mem⟧"]
    },
    'io.noforce': {
      file: 'io/out/iomem.txt', machine: 'b',
      what: "iomem.sh: the bounce-buffer setting on machine B’s kernel command line.",
      lines: ["$ tr \" \" \"\\n\" < /proc/cmdline | grep \"^swiotlb\"", "swiotlb=noforce"]
    },
    'io.cfghex': {
      file: 'io/out/pcicfg.txt', machine: 'b',
      what: "pcicfg.py: the first 256 bytes of configuration space of the disk’s PCI function, read from sysfs.",
      lines: ["config space of 0000:00:02.0: 256 bytes (from /sys/bus/pci/devices/0000:00:02.0/config)", "00: f4 1a 42 10 06 04 10 00 01 00 80 01 00 00 00 00", "10: 04 00 08 00 40 00 00 00 00 00 00 00 00 00 00 00", "20: 00 00 00 00 00 00 00 00 00 00 00 00 f4 1a 42 10", "30: 00 00 00 00 40 00 00 00 00 00 00 00 00 00 00 00", "40: 09 50 10 01 00 00 00 00 00 00 00 00 38 00 00 00", "50: 09 60 10 03 00 00 00 00 00 20 00 00 01 00 00 00", "60: 09 70 10 04 00 00 00 00 00 40 00 00 00 10 00 00", "70: 09 84 14 02 00 00 00 00 00 60 00 00 00 10 00 00", "80: 04 00 00 00 09 98 14 05 00 00 00 00 00 00 00 00", "90: 00 00 00 00 00 00 00 00 11 00 01 80 00 80 00 00", "a0: 00 80 04 00 00 00 00 00 00 00 00 00 00 00 00 00", "(rows b0-f0 are all zero)"]
    },
    'io.cfghdr': {
      file: 'io/out/pcicfg.txt', machine: 'b',
      what: "pcicfg.py: the header fields of that configuration space, decoded.",
      lines: ["0x00 vendor ID        0x1af4", "0x02 device ID        0x1042   virtio: 0x1040 + type 2 (block device)", "0x04 command          0x0406   I/O space off, ⟦memory space on, bus master on⟧, INTx disabled yes", "0x06 status           0x0010   capabilities list yes", "0x08 revision         0x01", "0x09 class code       0x018000 mass storage (0x01), subclass 0x80", "0x0e header type      0x00     type 0: an endpoint", "0x10 BAR0             0x00080004   memory, 64-bit (with BAR1), not prefetchable", "0x14 BAR1             0x00000040   upper half of BAR0", "     BAR0 address     ⟦0x4000080000, size 512 KiB⟧ (sysfs resource: 0x4000080000-0x40000fffff)", "0x2c subsystem        0x1af4:0x1042", "0x34 capabilities at  0x40", "0x3d interrupt pin    0        ⟦no INTx pin⟧: interrupts come only as messages (MSI-X)"]
    },
    'io.caps': {
      file: 'io/out/pcicfg.txt', machine: 'b',
      what: "pcicfg.py: the capability list, a chain of structures starting at offset 0x34’s pointer: five virtio capabilities and MSI-X.",
      lines: ["capability list:", "  0x40  0x09 vendor (virtio)  common config      BAR0 offset 0x0000  length 56", "  0x50  0x09 vendor (virtio)  ISR status         BAR0 offset 0x2000  length 1", "  0x60  0x09 vendor (virtio)  device config      BAR0 offset 0x4000  length 4096", "  0x70  0x09 vendor (virtio)  notifications      BAR0 offset 0x6000  length 4096, ⟦notify_off_multiplier 4⟧", "  0x84  0x09 vendor (virtio)  PCI config access  BAR0 offset 0x0000  length 0", "  0x98  0x11 MSI-X  2 vectors, enabled; ⟦table in BAR0 at 0x8000⟧; pending bits in BAR0 at 0x48000"]
    },
    'io.queue': {
      file: 'io/out/queue.txt', machine: 'b',
      what: "queue.sh: the block layer’s settings for vda: I/O scheduler, request limits, sizes, completion affinity and polling.",
      lines: ["$ cd /sys/block/vda/queue; grep . scheduler nr_requests max_sectors_kb max_segments logical_block_size physical_block_size rq_affinity io_poll", "scheduler:none ⟦[mq-deadline]⟧ kyber bfq ", "nr_requests:256", "max_sectors_kb:4096", "⟦max_segments:254⟧", "logical_block_size:512", "physical_block_size:4096", "rq_affinity:1", "io_poll:0"]
    },
    'io.mq': {
      file: 'io/out/queue.txt', machine: 'b',
      what: "queue.sh: vda’s hardware queues (blk-mq): their number, the CPUs that feed each one, and its number of tags.",
      lines: ["$ ls /sys/block/vda/mq; grep . /sys/block/vda/mq/0/cpu_list /sys/block/vda/mq/0/nr_tags", "0", "/sys/block/vda/mq/0/cpu_list:0, 1, 2, 3", "/sys/block/vda/mq/0/nr_tags:128"]
    },
    'io.path': {
      file: 'io/out/queue.txt', machine: 'b',
      what: "queue.sh: the device behind vda in sysfs: the virtio device, on PCI function 0000:00:02.0.",
      lines: ["$ readlink -f /sys/block/vda/device    # the virtio device and PCI function behind the disk", "/sys/devices/pci0000:00/0000:00:02.0/virtio1"]
    },
    'io.irqs': {
      file: 'io/out/queue.txt', machine: 'b',
      what: "queue.sh: vda’s two MSI-X interrupts, with their counts per CPU, and the CPUs allowed and used for the request-queue interrupt.",
      lines: ["$ grep -E \"CPU|virtio1\" /proc/interrupts", "           CPU0       CPU1       CPU2       CPU3       ", " 36:          0          1          0          0 PCI-MSIX-0000:00:02.0   0-edge      virtio1-config", " 37:          0          0          0      66035 PCI-MSIX-0000:00:02.0   1-edge      ⟦virtio1-req.0⟧", "$ cat /proc/irq/37/smp_affinity_list /proc/irq/37/effective_affinity_list", "0-3", "3"]
    },
    'io.irqcount': {
      file: 'io/out/counts.txt', machine: 'b',
      what: "run_all.sh: the request-queue interrupt’s count before and after oneread (1 warm-up read, 1 traced read and 1000 timed reads).",
      lines: ["$ grep -E \"CPU|virtio1-req\" /proc/interrupts    # before", "           CPU0       CPU1       CPU2       CPU3       ", " 37:          0          0          0      ⟦66036⟧ PCI-MSIX-0000:00:02.0   1-edge      virtio1-req.0", "$ grep -E \"CPU|virtio1-req\" /proc/interrupts    # after", "           CPU0       CPU1       CPU2       CPU3       ", " 37:          0          0          0      ⟦67040⟧ PCI-MSIX-0000:00:02.0   1-edge      virtio1-req.0"]
    },
    'io.dmacount': {
      file: 'io/out/counts.txt', machine: 'b',
      what: "run_all.sh: the number of dma and swiotlb trace events recorded during the traced read.",
      lines: ["$ grep -c -E \"  (dma_|swiotlb_)\" oneread.trace.txt    # DMA-mapping and bounce-buffer events in the trace", "⟦0⟧"]
    },
    'io.features': {
      file: 'io/out/virtio.txt', machine: 'b',
      what: "virtio.sh: the feature bits vda and its driver agreed on, one character per bit.",
      lines: ["$ cat /sys/bus/virtio/devices/virtio1/features    # one character per bit, bit 0 first", "00100010011001000000000000000100100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", "⟦bits set: 2 6 9 10 13 29 32⟧"]
    },
    'io.pat': {
      file: 'io/out/memtype.txt', machine: 'b',
      what: "memtype.sh: the x86 PAT memory types the kernel gave the ECAM window and the five 4 KiB pieces of vda’s BAR0 it mapped.",
      lines: ["$ cat /sys/kernel/debug/x86/pat_memtype_list    # only the lines for the ECAM window and for BAR0 of 0000:00:02.0", "PAT: [mem 0x00000000eec00000-0x00000000eed00000] ⟦uncached-minus⟧", "PAT: [mem 0x0000004000080000-0x0000004000081000] ⟦uncached-minus⟧", "PAT: [mem 0x0000004000082000-0x0000004000083000] ⟦uncached-minus⟧", "PAT: [mem 0x0000004000084000-0x0000004000085000] ⟦uncached-minus⟧", "PAT: [mem 0x0000004000086000-0x0000004000087000] ⟦uncached-minus⟧", "PAT: [mem 0x0000004000088000-0x0000004000089000] ⟦uncached-minus⟧"]
    },
    'io.swiotlb': {
      file: 'io/out/memtype.txt', machine: 'b',
      what: "memtype.sh: the bounce-buffer pool’s debugfs directory.",
      lines: ["$ ls -A /sys/kernel/debug/swiotlb    # the bounce-buffer pool's statistics", "(empty)"]
    },
    'io.iommucfg': {
      file: 'io/out/memtype.txt', machine: 'b',
      what: "memtype.sh: the IOMMU drivers and bounce-buffer support built into machine B’s kernel.",
      lines: ["$ zcat /proc/config.gz | grep -E \"^(# )?CONFIG_(INTEL_IOMMU|AMD_IOMMU|VIRTIO_IOMMU|IRQ_REMAP|SWIOTLB)[= ]\"", "# CONFIG_AMD_IOMMU is not set", "# CONFIG_INTEL_IOMMU is not set", "# CONFIG_IRQ_REMAP is not set", "# CONFIG_VIRTIO_IOMMU is not set", "CONFIG_SWIOTLB=y"]
    },
    'io.ring': {
      file: 'io/out/oneread.txt', machine: 'b',
      what: "oneread.c: io_uring_setup’s answer: ring sizes, the offset of each field inside the shared rings, and where the program mapped them.",
      lines: ["io_uring_setup(4) = fd 4: 4 submission entries, 8 completion entries", "sq_off: head 0  tail 4  ring_mask 16  ring_entries 24  flags 36  dropped 32  array 192", "cq_off: head 8  tail 12  ring_mask 20  ring_entries 28  overflow 44  cqes 64  flags 40", "rings mapped at 0x7fdb41b4a000 (⟦one mapping: yes⟧), SQEs at 0x7fdb41b49000, 64 bytes each"]
    },
    'io.buffer': {
      file: 'io/out/oneread.txt', machine: 'b',
      what: "oneread.c: the page-aligned buffer the reads go into, and its frame (pagemap).",
      lines: ["buffer at 0x7fdb41b48000, ⟦frame 0x124451⟧"]
    },
    'io.stats': {
      file: 'io/out/oneread.txt', machine: 'b',
      what: "oneread.c: the traced read, then 1000 untraced 4 KiB reads at random offsets, each timed from submission to completion.",
      lines: ["traced read: result 4096, 94.0 us from submission to completion", "1000 more reads at random 4 KiB offsets of the 4096-KiB file, us per read: min 34.5  ⟦median 40.9⟧  99th percentile 88.8  max 133.5"]
    },
    'io.trace': {
      file: 'io/out/oneread.trace.txt', machine: 'b',
      what: "run_all.sh and oneread.c: the kernel trace of one 4 KiB read, with time since the first marker and the CPU of each event. Block events are filtered to vda, interrupt events to its request queue.",
      lines: ["       0.0 us  cpu000  # == io_uring_enter: submit one 4 KiB read at offset 1 MiB, wait for it", "       8.0 us  cpu000  io_uring_submit_req: ring 000000002d7d7646, req 00000000a353d5f4, user_data 0x2a, opcode READ, flags 0x400000, sq_thread 0", "      11.0 us  cpu000  block_bio_queue: 254,0 RS 19671040 + 8 [oneread]", "      12.0 us  cpu000  block_getrq: 254,0 RS 19671040 + 8 [oneread]", "      13.0 us  cpu000  block_rq_insert: 254,0 RS 4096 () 19671040 + 8 be,0,4 [oneread]", "      14.0 us  cpu000  block_rq_issue: 254,0 RS 4096 () 19671040 + 8 be,0,4 [oneread]", "      29.0 us  cpu000  sched_switch: prev_comm=oneread prev_pid=18827 prev_prio=120 prev_state=S ==> next_comm=swapper/0 next_pid=0 next_prio=120", "      53.0 us  cpu003  irq_handler_entry: irq=37 name=virtio1-req.0", "      55.0 us  cpu003  irq_handler_exit: irq=37 ret=handled", "      55.0 us  cpu003  block_rq_complete: 254,0 RS () 19671040 + 8 be,0,4 [0]", "      56.0 us  cpu003  ipi_send_cpu: cpu=0 callsite=ttwu_queue_wakelist+0x11c/0x140 callback=generic_smp_call_function_single_interrupt+0x0/0x20", "      98.0 us  cpu000  sched_wakeup: comm=oneread pid=18827 prio=120 target_cpu=000", "      99.0 us  cpu000  sched_switch: prev_comm=swapper/0 prev_pid=0 prev_prio=120 prev_state=R ==> next_comm=oneread next_pid=18827 next_prio=120", "     100.0 us  cpu000  io_uring_complete: ring 000000002d7d7646, req 00000000a353d5f4, user_data 0x2a, result 4096, cflags 0x0 extra1 0 extra2 0", "     101.0 us  cpu000  io_uring_task_work_run: tctx 0000000088b7722e, count 1", "     102.0 us  cpu000  # == io_uring_enter returned 4096"]
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
