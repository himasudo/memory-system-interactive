/* ======================= lab runs: real outputs quoted by the lessons =======================
   Every excerpt names the file under labruns/ it was taken from. tests/runs.test.cjs checks that
   each quoted line (⟦highlight⟧ marks removed, lines starting with "#" or "…" skipped) appears in
   that file, so a lesson can only quote what a program really printed. */
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
