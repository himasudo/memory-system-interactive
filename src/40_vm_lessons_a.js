/* ======================= Part III · Virtual memory, lessons 1–4 ======================= */
(function () {
  'use strict';
  var g = App.g, LW = function () { return App.LW; };
  var d = App.gloss;
  d('frame', 'frame (page frame)', 'A 4 KiB block of physical memory that starts at a multiple of 4096. One page is mapped onto one frame.');
  d('pgoff', 'page offset', 'The low 12 bits of an address: where a byte sits inside its 4 KiB page. Translation copies them unchanged.');
  d('pagemap', '/proc/self/pagemap', 'A file Linux generates on each read: 8 bytes per virtual page of the reading process. Bit 63 = the page has a frame, bit 56 = the frame is mapped exactly once, bits 54:0 = the PFN (zero unless you are root).');
  d('kernel', 'kernel', 'The core of the operating system. It runs in kernel mode, decides which memory each process may use, and writes the page tables.');
  d('kmode', 'kernel mode, user mode', 'The CPU’s privileged and unprivileged states. The kernel runs in kernel mode; programs run in user mode and cannot touch kernel memory or control registers.');
  d('memctl', 'memory controller', 'The part of the processor that reads and writes DRAM. It only ever sees physical addresses.');
  d('ifetch', 'instruction fetch', 'The CPU reading the bytes of the next instructions from memory. Their addresses are virtual too, and are translated like any load.');
  d('syscall', 'system call', 'A request from a program to the kernel, such as mmap or read. The CPU switches to kernel mode to run it and back to user mode afterwards.');
  d('mmap', 'mmap', 'The system call that adds a range of virtual addresses to the calling process: anonymous memory, a file, or shared memory.');
  d('anon', 'anonymous memory', 'Memory with no file behind it (MAP_ANONYMOUS, the heap, the stack). It reads as zeros until written.');
  d('vmarea', 'region (VMA)', 'A range of virtual addresses with one set of permissions and one origin (a file or nothing). Linux calls it a VMA, virtual memory area; /proc/self/maps prints one line per region.');
  d('maps', '/proc/self/maps', 'A file Linux generates on each read: one line per region of the reading process, giving start-end, permissions, file offset, device, inode and file name.');
  d('aslr', 'ASLR', 'Address-space layout randomization: at every program start the kernel picks random base addresses for the stack, the heap, the shared libraries and (for position-independent programs) the program itself.');
  d('canon', 'canonical address', 'A 64-bit value whose bits 63:48 all equal bit 47 (with 4-level paging). Only canonical addresses can be translated; using any other raises #GP.');
  d('gpf', '#GP (general protection)', 'Exception 13: the CPU refused an instruction for breaking a rule, such as using a non-canonical address. It is a different exception from a page fault.');
  d('khalf', 'user half, kernel half', 'The two canonical ranges of a 48-bit address space: 0 to 0x00007fffffffffff for the process, 0xffff800000000000 and up for the kernel, which is the same in every process.');
  d('directmap', 'direct map', 'A range of the kernel half that maps all of RAM at one fixed offset (0xffff888000000000 unless boot-time randomization moves it), so the kernel can reach any frame by adding that offset.');
  d('vmpte', 'VmPTE', 'A line in /proc/<pid>/status: kilobytes of page tables the process uses, not counting its top-level table.');

  var P = App.P;

  /* ---------- III.01 ---------- */
  App.lesson({
    id: 'vm-addresses', short: 'Two kinds of address', title: 'Two kinds of address',
    lede: 'Every address a program computes is virtual. Hardware turns it into a physical address on every access.',
    know: ['A byte in memory is found by its number, its address ([[ch:addr]]).', 'Loads and stores move data between registers and memory ([[ch:instr]]).', 'Part I gave the idea in brief: programs use virtual addresses ([[ch:vm]]).'],
    learn: ['Tell a virtual address from a physical one', 'Say what the MMU does on every access, and what it never does', 'Name what translation gives a system: isolation, relocation, laziness and sharing'],
    sections: [
      { id: 'store', title: 'One store', body: function (L) {
        L.p('This part follows one small program from start to end. It asks the kernel for 16 KiB of fresh memory, then stores one byte into it.', ['kernel']);
        L.code('char *p = mmap((void *)0x7f3a1b2c3000, 16384,      /* where, how much  */\n               PROT_READ | PROT_WRITE,             /* may read, write  */\n               MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED_NOREPLACE, -1, 0);\n\np[0xd4e] = 1;                                     /* store one byte   */', { title: 'labruns/vm/story.c (shortened)', cap: 'MAP_FIXED_NOREPLACE asks for exactly that address (or fails), so every run uses the same numbers.' });
        L.p('<code>mmap</code> is a system call. It returned the address we asked for, and the store writes to that address plus 0xd4e.', ['syscall', 'mmap']);
        L.out('story.store', { lines: [0] });
        L.p('The compiler turned the store into one instruction. Register <code>%r12</code> holds <code>p</code>, and the instruction adds 0xd4e to it.');
        L.out('story.objdump', { title: 'objdump -d story' });
        L.p('So the CPU computes the address 0x7f3a1b2c3d4e and stores 1 there. Every address a program can compute is like this one: a pointer, <code>&amp;x</code>, whatever <code>malloc</code> returns.');
        L.p('These are ' + g('va', 'virtual addresses') + '. Each process has its own set of them.', ['va', 'proc']);
      } },
      { id: 'physical', title: 'Where the byte really went', body: function (L) {
        L.p('The memory chips never see 0x7f3a1b2c3d4e. RAM, the caches and the memory controller work with physical addresses: the numbers of real locations.', ['pa', 'memctl']);
        L.p('Linux tells root which physical memory backs each page of a process. This is the answer for our page, read right after the store:');
        L.out('story.store', { lines: [2] });
        L.p('The byte landed at physical address 0x129b49d4e. The next lesson shows how that number is built from <code>pfn=0x129b49</code> and the last three digits of the virtual address.');
        L.note('vm', 'The machine these runs come from is itself a virtual machine, so its “physical” addresses are the virtual machine’s own. The host translates them once more; [[ch:vm-virt]] covers that second step.');
      } },
      { id: 'mmu', title: 'The MMU translates every access', body: function (L) {
        L.p('The translation is done by the ' + g('mmu', 'MMU') + ', a unit inside every CPU core. It runs on every load, every store and every instruction fetch.', ['mmu', 'ifetch']);
        L.chain([
          { k: 'load/store unit', v: '0x7f3a1b2c3d4e', d: 'computes the virtual address' },
          { k: 'MMU', v: 'translate + check', d: 'finds the physical address and checks the access is allowed', hot: true },
          { k: 'caches and RAM', v: '0x129b49d4e', d: 'see only the physical address' }
        ], { cap: 'The path of every access. Nothing after the MMU ever sees the virtual address.' });
        L.p('The MMU reads tables that the kernel writes. It never allocates memory and never decides who may use what: the kernel does both.', ['kmode']);
        L.p('The MMU writes only two status bits in those tables, which [[ch:vm-pte]] covers.');
        L.p('When the tables have no answer, the MMU stops the instruction and hands control to the kernel. That event is a page fault, the subject of [[ch:vm-faults]].', ['pf']);
        L.note('deeper', 'x86-64 still has segment registers, but in 64-bit mode the CPU treats the code and data segment bases as 0, so a virtual address goes straight to the MMU. Only FS and GS keep a base: glibc uses FS to find each thread’s own variables, and the kernel uses GS for its per-CPU data.');
        L.note('arm', 'An AArch64 core has the same job split: its MMU translates every access using tables the kernel writes. There are no segments. Instead the top bits of an address pick one of two table bases, TTBR0_EL1 for user addresses and TTBR1_EL1 for the kernel.');
      } },
      { id: 'why', title: 'What translation buys', body: function (L) {
        L.p('Why not let programs use physical addresses directly? Because one level of translation gives four things at once.');
        L.table(['Property', 'What it means', 'Lesson'], [
          ['Isolation', 'No address in process A reaches memory that belongs to process B, unless the kernel maps the same memory into both on purpose.', '[[ch:vm-space]]'],
          ['Relocation', 'Every program can use the same addresses, wherever its memory physically is.', '[[ch:vm-space]]'],
          ['Laziness', 'A process can reserve far more addresses than it touches; physical memory is handed out page by page, on first use.', '[[ch:vm-demand]]'],
          ['Sharing', 'One piece of physical memory can appear in many address spaces, such as the C library’s code.', '[[ch:vm-alias]]']
        ], { mono: false });
        L.p('Our run already shows laziness. Right after <code>mmap</code>, the page had no physical memory at all:');
        L.out('story.mmap', { lines: [3], what: 'The main run: page 0 right after mmap, before any store.' });
        L.p('<code>present=0</code>: the region existed, but no memory backed it. Physical memory arrived only when the store touched the page.');
      } }
    ],
    check: [
      { q: 'A C program prints a pointer: 0x7ffd4a3c2e58. What kind of address is that?', options: ['A virtual address', 'A physical address', 'A frame number', 'A disk address'], answer: 0, why: 'Every address a program can see or compute is virtual. Only the kernel and the hardware deal in physical addresses.' },
      { q: 'Which of these does the MMU do?', options: ['Translate and check permissions on every access', 'Give a page physical memory when it is first used', 'Decide which process may use which memory', 'Copy a page after fork'], answer: 0, why: 'The MMU only translates and checks, using tables the kernel wrote. Allocating, deciding and copying are the kernel’s work.', hint: 'Think of what must happen on every single access, fast, in hardware.' },
      { q: 'Right after mmap reserves 16 KiB, how much physical memory backs the region?', options: ['None', '16 KiB', '4 KiB', 'It depends on the cache size'], answer: 0, why: 'mmap only reserves addresses. pagemap showed present=0 until the first store.' }
    ],
    remember: [
      'Programs see only virtual addresses; caches and RAM see only physical ones.',
      'The MMU in each core translates every load, store and instruction fetch, using tables the kernel writes.',
      'The MMU never allocates or decides. When it cannot translate, it hands the problem to the kernel (a page fault).',
      'Translation gives isolation, relocation, laziness and sharing.'
    ],
    sources: [['Intel SDM Vol. 3A, ch. 4 “Paging”', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html'], ['AMD64 APM Vol. 2, ch. 5 “Page Translation and Protection”', 'https://docs.amd.com/v/u/en-US/24593_3.43'], ['Arm, AArch64 memory management guide', 'https://developer.arm.com/documentation/101811/latest'], ['Linux: examining process page tables (pagemap)', 'https://docs.kernel.org/admin-guide/mm/pagemap.html']]
  });

  /* ---------- III.02 ---------- */
  App.lesson({
    id: 'vm-pages', short: 'Pages and frames', title: 'Pages, frames and the page offset',
    lede: 'Translation works on 4 KiB blocks. The low 12 bits of every address pass through untouched.',
    know: ['Programs use virtual addresses; the MMU turns each one into a physical address ([[ch:vm-addresses]]).', 'One hex digit is 4 bits ([[ch:bits]]).'],
    learn: ['Split an address into a page number and an offset', 'Turn a frame number into a physical address', 'Read a /proc/self/pagemap entry'],
    sections: [
      { id: 'blocks', title: 'Blocks, not bytes', body: function (L) {
        L.p('A table with one entry per byte would be bigger than the memory it describes. So translation works on blocks.');
        L.p('Virtual memory is cut into ' + g('page', 'pages') + ' of 4096 bytes. Physical memory is cut into ' + g('frame', 'frames') + ' of the same size.', ['page', 'frame']);
        L.chain([
          { k: 'page 0 of our region', v: '0x7f3a1b2c3000', d: 'virtual, 4096 bytes' },
          { k: 'one translation', v: 'page → frame', d: 'all 4096 bytes move together', hot: true },
          { k: 'frame 0x129b49', v: '0x129b49000', d: 'physical, 4096 bytes' }
        ]);
        L.p('One translation maps a whole page onto a whole frame. Our 16 KiB region is 4 pages, and each can land in any free frame.');
      } },
      { id: 'offset', title: 'The page offset', body: function (L) {
        L.p('4096 is 2¹², so the low 12 bits of an address say where a byte sits inside its page. That is the ' + g('pgoff', 'page offset') + '.', ['pgoff']);
        L.bits([
          { bits: '63:12', val: '0x7f3a1b2c3', name: 'virtual page number (VPN)', tone: 'a1', w: 2.2 },
          { bits: '11:0', val: '0xd4e', name: 'page offset', tone: 'a3' }
        ], { title: 'The virtual address 0x00007f3a1b2c3d4e' });
        L.p('Twelve bits are exactly three hex digits. So you can read the offset straight off the address: its last three digits, 0xd4e.');
        L.p('The rest is the ' + g('vpn', 'virtual page number') + ': the address shifted right by 12.', ['vpn']);
        L.code('0x00007f3a1b2c3d4e >> 12    = 0x7f3a1b2c3   /* VPN: which page */\n0x00007f3a1b2c3d4e & 0xfff  = 0xd4e         /* offset: where in the page */', { title: 'C arithmetic' });
      } },
      { id: 'pfn', title: 'Frame numbers', body: function (L) {
        L.p('Frames are numbered the same way. A frame’s ' + g('pfn', 'page frame number') + ' is its physical address shifted right by 12.', ['pfn']);
        L.p('Translation replaces the page number with a frame number, and copies the offset unchanged.');
        L.table(['', 'Page or frame number', 'Offset'], [
          ['Virtual address', '0x7f3a1b2c3', '0xd4e'],
          { cells: ['Physical address', '0x129b49   (translated)', '0xd4e   (copied)'], hot: true }
        ]);
        L.code('physical address = PFN × 4096 + offset\n                 = 0x129b49000 + 0xd4e\n                 = 0x129b49d4e', { title: 'the rule', lang: 'text' });
        L.p('Multiplying by 4096 is the same as shifting left by 12, so the PFN’s hex digits simply move three places left.');
      } },
      { id: 'pagemap', title: 'Read it from the kernel: pagemap', body: function (L) {
        L.p('Linux publishes each process’s page-to-frame map in ' + g('pagemap', '/proc/self/pagemap') + '. The file holds 8 bytes for every virtual page.', ['pagemap']);
        L.code('uint64_t e;\nint fd = open("/proc/self/pagemap", O_RDONLY);\npread(fd, &e, 8, (va / 4096) * 8);    /* entry number = VPN */', { title: 'labruns/common/lab.h (shortened)' });
        L.p('The entry is found by VPN: page number × 8 bytes into the file. This is the entry for our page after the store:');
        L.out('story.pagemap0', { lines: [1] });
        L.bits([
          { bits: '63', val: '1', name: 'present', tone: 'a2' },
          { bits: '62', val: '0', name: 'swapped', tone: 'mute' },
          { bits: '61', val: '0', name: 'file or shared', tone: 'mute' },
          { bits: '57–60', val: '0', name: '', tone: 'mute' },
          { bits: '56', val: '1', name: 'mapped once', tone: 'a2' },
          { bits: '55', val: '0', name: 'soft-dirty', tone: 'mute' },
          { bits: '54:0', val: '0x129b49', name: 'PFN', tone: 'a4', w: 2.4 }
        ], { title: 'pagemap entry 0x8100000000129b49', dense: true });
        L.p('Bit 63 says the page has a frame. Bits 54 to 0 hold the PFN, which only root can read; everyone else reads 0 there.');
        L.p('Bit 56 says the frame is mapped exactly once. That will change after <code>fork</code> in [[ch:vm-cow]].');
        L.quote('Since Linux 4.0 only users with the CAP_SYS_ADMIN capability can get PFNs. … Starting from 4.2 the PFN field is zeroed if the user does not have CAP_SYS_ADMIN. Reason: information about PFNs helps in exploiting Rowhammer vulnerability.', { cite: 'Documentation/admin-guide/mm/pagemap.rst, Linux v6.18', label: 'Linux source', src: ['pagemap.rst', 'https://docs.kernel.org/admin-guide/mm/pagemap.html'] });
      } },
      { id: 'price', title: 'The price of fixed-size blocks', body: function (L) {
        L.p('Fixed-size frames mean any free frame can hold any page, and permissions can be set page by page.');
        L.p('The price is one translation record per 4 KiB. A program using 64 MiB needs 16384 of them, at 8 bytes each.');
        L.code('64 MiB / 4 KiB  = 16384 pages\n16384 × 8 bytes = 128 KiB of entries', { lang: 'text', title: 'arithmetic' });
        L.p('[[ch:vm-tree]] measures exactly that 128 KiB on the lab machine. [[ch:vm-huge]] shows the other way out: bigger pages.');
        L.try('Split an address', 'Change the address, the page size or the frame number. The offset is copied; only the page number is translated.', function (el) { LW().splitter(el, {}); });
        L.note('arm', 'Arm calls the page size the translation granule. AArch64 supports 4 KiB, 16 KiB and 64 KiB granules, and the kernel chooses one at build time. With 16 KiB pages (Apple silicon Macs use them) the offset is 14 bits; with 64 KiB pages it is 16.');
      } }
    ],
    check: [
      { q: 'What is the page offset of 0x7ffd4a3c2e58 with 4 KiB pages?', options: ['0xe58', '0x2e58', '0x58', '0x7ffd4a3c2'], answer: 0, why: '12 bits = the last three hex digits.' },
      { q: 'Virtual page 0x7f3a1b2c4 maps to frame 0x125396. Where is the byte at virtual 0x7f3a1b2c4d4e?', options: ['0x125396d4e', '0x7f3a1b2c4d4e', '0x125396000', '0x125396d4e000'], answer: 0, why: 'PFN × 4096 + offset = 0x125396000 + 0xd4e.' },
      { q: 'pagemap reads 0x8000000000003241 for a page. What does that tell you?', options: ['The page has a frame (0x3241) that is mapped more than once', 'The page has no frame', 'The page is swapped out', 'The page is mapped exactly once'], answer: 0, why: 'Bit 63 is set (present), bit 56 is clear (not exclusively mapped), and the PFN is 0x3241. [[ch:vm-demand]] shows which frame that is.' }
    ],
    remember: [
      'A page is 4 KiB of virtual addresses; a frame is 4 KiB of physical memory.',
      'Low 12 bits = page offset, copied as is. The bits above = page number, translated.',
      'Physical address = PFN × 4096 + offset.',
      'pagemap: bit 63 present, bit 56 mapped exactly once, bits 54:0 the PFN (root only).'
    ],
    sources: [['Linux: examining process page tables (pagemap)', 'https://docs.kernel.org/admin-guide/mm/pagemap.html']]
  });
})();
