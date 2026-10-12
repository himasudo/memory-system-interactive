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

  /* ---------- III.03 ---------- */
  App.lesson({
    id: 'vm-space', short: 'A process’s address space', title: 'A process’s address space',
    lede: 'A process could use 128 TiB of addresses but uses a few dozen ranges of them. The kernel keeps the list.',
    know: ['Translation works on 4 KiB pages, and pagemap shows which frame each page has ([[ch:vm-pages]]).', 'mmap reserved 16 KiB, and the page had no frame until the first store ([[ch:vm-addresses]]).'],
    learn: ['Read /proc/self/maps line by line', 'Say what mmap adds, and what it does not', 'Explain why addresses change from run to run (ASLR)', 'Tell canonical from non-canonical addresses, and the user half from the kernel half'],
    sections: [
      { id: 'regions', title: 'The list of regions', body: function (L) {
        L.p('For each process the kernel keeps a list of regions: ranges of addresses with one set of permissions and one origin, either a file or nothing.', ['vmarea']);
        L.p('<code>/proc/self/maps</code> prints that list for whichever process reads it. Here is <code>cat</code> reading its own:', ['maps']);
        L.out('facts.maps1');
        L.p('Each line is one region. Take the first line apart:');
        L.table(['Field', 'Value', 'Meaning'], [
          ['start–end', '563a1b1cf000-563a1b1d1000', 'the virtual address range (end not included)'],
          ['permissions', 'r--p', 'read, no write, no execute; <b>p</b>rivate (writes stay in this process) or <b>s</b>hared'],
          ['offset', '00000000', 'where in the file the region starts'],
          ['device, inode', 'fe:00 343944', 'which file (0 for anonymous memory)'],
          ['path', '/usr/bin/cat', 'the file, or a label such as [heap] or [stack]']
        ], { mono: true });
        L.p('Now read the list top to bottom. The program file comes first, in five pieces: headers, code (<code>r-xp</code>), constants, a part made read-only after loading, and writable data.');
        L.p('Then the heap, the C library in five pieces, a few anonymous regions, three regions the kernel itself provides ([vvar] and [vdso]), the dynamic loader, and the stack near the top.');
      } },
      { id: 'mmap', title: 'mmap adds a line, and nothing else', body: function (L) {
        L.p('Our program’s <code>mmap</code> added exactly one line:');
        L.out('story.mmap', { lines: [1, 2] });
        L.p('0x7f3a1b2c7000 − 0x7f3a1b2c3000 = 0x4000 bytes = 16 KiB = 4 pages. <code>rw-p</code>: readable, writable, not executable, private. Device and inode are 0: no file behind it.', ['anon']);
        L.p('That is all <code>mmap</code> did. The page tables did not grow:');
        L.out('story.vmpte', { lines: [0, 1] });
        L.p('And, as [[ch:vm-addresses]] showed, the pages had no frames. The region is a promise: these addresses may be used, with these permissions.');
        L.p('The tables and the frames are filled in later, one page at a time, when the program first touches each page. [[ch:vm-demand]] shows how.');
      } },
      { id: 'aslr', title: 'Addresses move: ASLR', body: function (L) {
        L.p('Run <code>cat /proc/self/maps</code> twice and compare four of the lines:');
        L.out('facts.aslr');
        L.p('The program, the heap, the C library and the stack all moved. That is ASLR: the kernel picks new random starting points at every program start.', ['aslr']);
        L.p('The order stays the same: program low, then the heap, the libraries near the top, the stack at the very top. Only the starting points move.');
        L.out('facts.aslrmode', { lines: [0, 2], what: 'randomize_va_space: 2 = randomize the stack, the libraries, the vDSO and the heap.' });
        L.p('Randomized addresses make memory-corruption attacks harder, because an attacker cannot know where code or data is. It is also why our program asks for a fixed address: otherwise every run would print different numbers.');
      } },
      { id: 'halves', title: '48 bits, in two halves', body: function (L) {
        L.p('Pointers are 64 bits wide, but x86-64 CPUs normally translate only the low 48 bits. The lab machine says so:');
        L.out('facts.sizes', { lines: [0, 1] });
        L.p('A 64-bit value is a usable address only if bits 63 to 48 are all copies of bit 47. Such an address is called canonical.', ['canon']);
        L.table(['Range', 'Size', 'What it is'], [
          ['0x0000000000000000 – 0x00007fffffffffff', '128 TiB', 'user half: the process’s own addresses, different in every process'],
          ['0x0000800000000000 – 0xffff7fffffffffff', 'almost 2⁶⁴', 'non-canonical: never translated'],
          ['0xffff800000000000 – 0xffffffffffffffff', '128 TiB', 'kernel half: the same in every process']
        ], { mono: true });
        L.p('Using a non-canonical address is not a page fault. The CPU refuses the instruction before any translation, with a general-protection exception:', ['gpf']);
        L.out('err.kernel', { lines: [2] });
        L.p('Trap 13 is #GP. A page fault is trap 14, and [[ch:vm-faults]] decodes its error code.');
        L.try('Is it canonical?', 'Type any 64-bit value. Try 0x0000800000000000, 0x00007fffffffffff and 0xffff888000000000.', function (el) { LW().splitter(el, { va: '0x0000800000000000', pfn: false, sizes: false }); });
        L.note('other', 'Newer CPUs can translate 57-bit addresses with a fifth level of tables (CPU flag <code>la57</code>; Intel Xeon since Ice Lake, AMD since Zen 4). Then bits 63 to 57 must copy bit 56. The lab machine does not report <code>la57</code>, so every address here is 48 bits.', 'Five-level paging');
      } },
      { id: 'khalf', title: 'The kernel half', body: function (L) {
        L.p('The kernel’s code and data live in the kernel half, and that half is mapped in every process. So a system call or an interrupt can run kernel code without switching tables.', ['khalf']);
        L.quote('ffff888000000000 | -119.5  TB | ffffc87fffffffff |   64 TB | direct mapping of all physical memory (page_offset_base)\nffffc90000000000 |  -55    TB | ffffe8ffffffffff |   32 TB | vmalloc/ioremap space (vmalloc_base)\nffffea0000000000 |  -22    TB | ffffeaffffffffff |    1 TB | virtual memory map (vmemmap_base)\nffffffff80000000 |   -2    GB | ffffffff9fffffff |  512 MB | kernel text mapping, mapped to physical address 0', { cite: 'Documentation/arch/x86/x86_64/mm.rst, Linux v6.18 (4 of its lines)', label: 'Linux source', code: true, src: ['x86-64 memory map', 'https://docs.kernel.org/arch/x86/x86_64/mm.html'] });
        L.p('The kernel’s code starts at the bottom of that last range on this machine:');
        L.out('facts.text', { lines: [0, 1] });
        L.p('User code still cannot touch the kernel half: its entries say “kernel mode only”. Our program tried:');
        L.out('err.kernel', { lines: [0, 1] });
        L.p('Trap 14 is a page fault, and its error code 0x5 says a translation existed but refused user mode. [[ch:vm-pte]] shows the bit that does the refusing.');
        L.note('arm', 'AArch64 splits the address space the same way. Addresses whose top bits are all 0 are translated through TTBR0_EL1 (user); all 1, through TTBR1_EL1 (kernel). The size of each half is set in TCR_EL1, commonly 48 bits.');
      } }
    ],
    check: [
      { q: 'Which maps line holds a program’s machine code?', options: ['The r-xp line of the program file', 'The rw-p line of the program file', 'The [heap] line', 'The [stack] line'], answer: 0, why: 'Code must be readable and executable, and comes from the program file: r-xp.' },
      { q: 'Right after mmap(16 KiB), which of these has changed?', options: ['/proc/self/maps has one more line', 'VmPTE grew by 4 kB', 'pagemap shows the pages present', 'The process uses 16 KiB more RAM'], answer: 0, why: 'mmap only adds a region. Tables and frames come later, on first touch.' },
      { q: 'A program loads from 0x0000800000000000. What happens?', options: ['A general-protection exception (#GP, trap 13)', 'A page fault (trap 14)', 'It reads zeros', 'It reads kernel memory'], answer: 0, why: 'Bits 63:48 are not copies of bit 47, so the address is non-canonical and never reaches translation.' },
      { q: 'Why did libc start at a different address in the second run of cat?', options: ['ASLR picked a new random base', 'The first run’s libc was still in memory', 'The kernel ran out of addresses', 'Page tables were rebuilt'], answer: 0, why: 'With randomize_va_space = 2, the stack, libraries, vDSO and heap get new random bases at every start.' }
    ],
    remember: [
      '/proc/self/maps is the kernel’s list of regions: range, permissions, offset, file.',
      'mmap adds a region and nothing else: no page-table entries, no frames.',
      'ASLR moves the starting points at every run; the order of regions stays.',
      'Only canonical addresses are translated. The user half differs per process; the kernel half is shared but kernel-only.'
    ],
    sources: [['proc_pid_maps(5)', 'https://man7.org/linux/man-pages/man5/proc_pid_maps.5.html'], ['Linux x86-64 memory map', 'https://docs.kernel.org/arch/x86/x86_64/mm.html'], ['Intel SDM Vol. 1, §3.3.7.1 “Canonical addressing”', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html']]
  });

  /* ---------- III.04 ---------- */
  function treeFigure(sv) {
    var T = P.T, R = P.R;
    function table(x, y, w, used, label, cls) {
      R(sv, x, y, w, 34, cls || 'box', 4);
      var n = 16, cw = (w - 12) / n;
      for (var i = 0; i < n; i++) R(sv, x + 6 + i * cw, y + 6, cw - 2, 10, used.indexOf(i) >= 0 ? 'a4b' : 'sunk', 1);
      T(sv, x + w / 2, y + 29, label, 's', 'middle');
    }
    table(170, 8, 140, [3, 12], 'top table');
    P.Ln(sv, 'M210 42 L95 72'); P.Ln(sv, 'M285 42 L335 72');
    table(30, 72, 130, [5], 'middle table');
    table(270, 72, 130, [2, 9], 'middle table');
    R(sv, 420, 72, 100, 34, 'sunk dash', 4); T(sv, 470, 93, 'empty slots:', 's', 'middle'); T(sv, 470, 104, 'no table at all', 's', 'middle');
    P.Ln(sv, 'M95 106 L95 136'); P.Ln(sv, 'M300 106 L250 136'); P.Ln(sv, 'M370 106 L400 136');
    table(30, 136, 130, [1, 2, 3], 'table');
    table(185, 136, 130, [7], 'table');
    table(340, 136, 130, [0, 15], 'table');
    P.Ln(sv, 'M70 170 L50 200'); P.Ln(sv, 'M120 170 L140 200'); P.Ln(sv, 'M250 170 L250 200'); P.Ln(sv, 'M380 170 L370 200'); P.Ln(sv, 'M440 170 L460 200');
    [10, 100, 205, 320, 410].forEach(function (x) { table(x, 200, 90, [0, 1, 2, 5, 8, 9], 'bottom: PTEs', 'a2b'); });
    T(sv, 260, 254, 'each table: one 4 KiB frame, 512 entries of 8 bytes (16 slots drawn)', 's', 'middle');
  }
  App.lesson({
    id: 'vm-tree', short: 'A tree of tables', title: 'A tree of tables',
    lede: 'One flat table for every possible page would take 512 GiB per process. A tree of small tables takes kilobytes.',
    know: ['Each 4 KiB page needs one translation record, 8 bytes, called a page-table entry ([[ch:vm-pages]]).', 'A process uses a few dozen regions out of 128 TiB of addresses ([[ch:vm-space]]).'],
    learn: ['Explain why page tables form a tree', 'Estimate how much table memory a program needs', 'Say where page tables live, and who can read and write them'],
    sections: [
      { id: 'records', title: 'One record per page', body: function (L) {
        L.p('For every page in use the MMU needs a record: which frame the page maps to, and what is allowed. That record is a page-table entry (PTE), 8 bytes.', ['pte']);
        L.p('The kernel writes the entries into page tables in RAM, and the MMU reads them. How should the entries be arranged?', [['page table', 'A table in RAM, written by the kernel, holding page-table entries. The MMU reads it to translate addresses.']]);
      } },
      { id: 'flat', title: 'A flat table would not fit', body: function (L) {
        L.p('The simplest layout is one flat array with an entry for every possible page, indexed by page number. Count its size:');
        L.code('2^48 bytes of addresses / 2^12 bytes per page = 2^36 pages\n2^36 pages × 8 bytes per entry            = 2^39 bytes = 512 GiB', { lang: 'text', title: 'arithmetic' });
        L.p('That is 512 GiB for every process, and almost all of it would describe addresses nobody uses. <code>cat</code> used 24 regions.');
      } },
      { id: 'tree', title: 'A tree grows with what is mapped', body: function (L) {
        L.p('So the entries are kept in a tree. The bottom tables hold the PTEs. Each table above holds pointers to tables below it.');
        L.fig(520, 262, treeFigure, { cap: 'A page-table tree. Blue slots point to a table or a frame; grey slots are empty. Branches with nothing mapped have no table at all.', maxw: 640 });
        L.p('Where nothing is mapped, the slot is empty and no table exists below it. The tree has tables only along the paths to pages in use.');
        L.p('Every table is the same size: one 4 KiB frame holding 512 entries of 8 bytes. So one bottom table describes 512 pages, which is 2 MiB of addresses.');
        L.code('512 entries × 4 KiB per page = 2 MiB per bottom table', { lang: 'text', title: 'arithmetic' });
      } },
      { id: 'measure', title: 'Measure it: VmPTE', body: function (L) {
        L.p('Linux counts each process’s page tables, in kilobytes, as <code>VmPTE</code> in <code>/proc/&lt;pid&gt;/status</code>. The top table is not included.', ['vmpte']);
        L.out('facts.vmpte');
        L.p('A small program like <code>grep</code> needs 44 to 52 kB: a dozen tables.');
        L.p('Now give a program 64 MiB and store one byte into every 4 KiB page:');
        L.out('cost.vmpte');
        L.p('168 − 40 = 128 kB of new tables = 32 bottom tables of 4 KiB. And 32 × 2 MiB = 64 MiB: one bottom table per 2 MiB touched, as the arithmetic predicted.');
        L.p('In the main run, the first store into the fresh region added 12 kB:');
        L.out('story.vmpte', { lines: [1, 2] });
        L.p('12 kB is three tables. Nothing else lived in that part of the address space, so the store needed a whole new path through the tree: [[ch:vm-demand]] shows the kernel allocating each table.');
      } },
      { id: 'where', title: 'Tables are ordinary memory', body: function (L) {
        L.p('A page table is an ordinary 4 KiB frame of RAM that the kernel allocated, like any other frame.');
        L.p('No user-half address maps to those frames, so a program cannot read or change its own tables. The MMU reads them by physical address.');
        L.p('The kernel reaches them, and every other frame, through the direct map: a range of the kernel half that maps all of RAM at one fixed offset.', ['directmap']);
        L.code('kernel address = 0xffff888000000000 + physical address\n\nthe main run’s bottom table, frame 0x1330d4:\n0xffff888000000000 + 0x1330d4000 = 0xffff8881330d4000', { lang: 'text', title: 'the direct map' });
        L.p('[[ch:vm-space]] showed this range in the kernel’s memory map, and our program faulted when it tried to read from 0xffff888000000000.');
        L.note('linux', 'With boot-time randomization of the kernel’s layout (KASLR), the direct map may start at a random place above 0xffff888000000000. On the lab machine the kernel’s code sits at the unrandomized default 0xffffffff81000000, so randomization is not active and the direct map starts at the default.', 'On this machine');
      } }
    ],
    check: [
      { q: 'How big would one flat page table be for a 48-bit address space with 4 KiB pages?', options: ['512 GiB', '512 MiB', '4 KiB', '2 MiB'], answer: 0, why: '2³⁶ pages × 8 bytes = 2³⁹ bytes = 512 GiB.' },
      { q: 'How much memory does one bottom-level table describe?', options: ['2 MiB', '4 KiB', '1 GiB', '512 bytes'], answer: 0, why: '512 entries × 4 KiB pages = 2 MiB.' },
      { q: 'A program touches 8 MiB of fresh memory, one page at a time. Roughly how much does VmPTE grow?', options: ['16 kB (4 bottom tables)', '8 MiB', '4 kB', '512 GiB'], answer: 0, why: 'One 4 KiB bottom table per 2 MiB: 8 MiB / 2 MiB = 4 tables = 16 kB, plus upper tables if the path is new.' },
      { q: 'Can a program read its own page tables through a normal pointer?', options: ['No: no user-half address maps their frames', 'Yes, at /proc/self/pagemap', 'Yes, they are in the heap', 'Only after mprotect'], answer: 0, why: 'Tables are reached by physical address (the MMU) or through the kernel’s direct map. pagemap is a kernel-generated report, not the tables themselves.' }
    ],
    remember: [
      'A flat table would cost 512 GiB per process; a tree only has tables where something is mapped.',
      'Every table is one 4 KiB frame of 512 eight-byte entries; a bottom table covers 2 MiB.',
      'VmPTE in /proc/<pid>/status shows a process’s table memory: about 4 kB per 2 MiB touched.',
      'Tables are ordinary frames. Programs cannot reach them; the kernel uses the direct map.'
    ],
    sources: [['proc_pid_status(5): VmPTE', 'https://man7.org/linux/man-pages/man5/proc_pid_status.5.html'], ['Linux x86-64 memory map', 'https://docs.kernel.org/arch/x86/x86_64/mm.html']]
  });
})();
