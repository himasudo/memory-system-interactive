/* ======================= Part III · Virtual memory, lessons 21–23 ======================= */
(function () {
  'use strict';
  var d = App.gloss, P = App.P;
  d('memfd', 'memfd', 'A file created with memfd_create(): it has no name in any directory and lives in RAM, but can be resized, read, written and mapped like any other file.');
  d('pss', 'PSS', 'Proportional set size: a process’s resident pages, with each shared page divided by the number of processes that map it. /proc/&lt;pid&gt;/smaps reports it next to Rss.');

  /* ---------- III.21 ---------- */
  App.lesson({
    id: 'vm-alias', short: 'Two views of one frame', title: 'Two views of one frame',
    lede: 'Two page-table entries can hold the same frame number. Then two virtual addresses reach the same bytes, which is how processes share files and code.',
    know: ['A page-table entry holds a frame number ([[ch:vm-pte]]).', 'File pages live once, in the page cache ([[ch:vm-files]]).', 'The L1 picks the set with page-offset bits and compares physical tags ([[ch:vm-vipt]]).'],
    learn: ['Map one frame at two addresses and check it with pagemap', 'Explain how shared libraries share frames between processes', 'Name the kernel’s own alias of every frame', 'Explain why shared data structures store offsets, not pointers'],
    sections: [
      { id: 'two', title: 'One frame, two addresses', body: function (L) {
        L.p('A program can map the same file twice. Here the file is a memfd, a file that lives only in RAM:', ['memfd']);
        L.code('int fd = memfd_create("one-frame", 0);\nftruncate(fd, 4096);\nchar *a = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);\nchar *b = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);\nstrcpy(a + 0xd4e, "written through view A");', { title: 'labruns/vm/alias.c (shortened)' });
        L.p('Both mappings use <code>MAP_SHARED</code>, so both use the file’s own page in the page cache ([[ch:vm-files]]):');
        L.out('alias.views');
        L.p('Two virtual pages, one frame: 0x110b4b. The store through view A went into that frame, and the load through view B read it back.');
        L.p('<code>/proc/self/maps</code> lists two areas of one page each, both at offset 0 of the same file (inode 14):');
        L.out('alias.maps', { wide: true });
        L.p('The <code>s</code> in <code>rw-s</code> marks a shared mapping. “(deleted)” appears because a memfd has no name in any directory.');
        L.quote('memfd_create() creates an anonymous file and returns a file descriptor that refers to it. The file behaves like a regular file, and so can be modified, truncated, memory-mapped, and so on. However, unlike a regular file, it lives in RAM and has a volatile backing storage.', { cite: 'memfd_create(2), Linux man-pages', label: 'Linux source', src: ['memfd_create(2)', 'https://man7.org/linux/man-pages/man2/memfd_create.2.html'] });
        L.p('A program rarely maps one file twice. Different processes mapping the same file is the common case.');
      } },
      { id: 'libs', title: 'The same code in every process', body: function (L) {
        L.p('The program asks, in two separate processes, where the C library’s <code>getpid</code> is and which frame holds it:');
        L.out('alias.libc');
        L.p('The two processes put the library at different addresses (ASLR, [[ch:vm-space]]), yet the code sits in the same frame, 0x10211b. Each process maps the same page-cache page of the library file.');
        L.p('The last three hex digits agree too, 0xb90. A file is mapped in whole pages, so a byte of the file has the same page offset in every mapping.');
        L.p('So a library used by a thousand processes is in RAM once. That is why <code>/proc/&lt;pid&gt;/smaps</code> reports a second size next to Rss:', ['pss']);
        L.quote('The "proportional set size" (PSS) of a process is the count of pages it has in memory, where each page is divided by the number of processes sharing it. So if a process has 1000 pages all to itself, and 1000 shared with one other process, its PSS will be 1500.', { cite: 'Documentation/filesystems/proc.rst, Linux v6.18', label: 'Linux source' });
        L.p('Adding Rss over all processes counts each shared page once per process; adding PSS counts it once. Every user page has one more mapping, though, which no process sees.');
      } },
      { id: 'kernel', title: 'The kernel’s alias of every frame', body: function (L) {
        L.p('The kernel maps all of RAM at one fixed offset, the direct map ([[ch:vm-tree]]). So the memfd’s frame has a third address:');
        L.code('0xffff888000000000 + 0x110b4b000 = 0xffff888110b4b000', { lang: 'text', title: 'the memfd frame in the direct map', label: 'Inference' });
        L.p('This is the address the kernel uses to fill or copy a page: zeroing in [[ch:vm-demand]], and <code>read()</code> or <code>write()</code> on a file. On x86-64, mapping a page into the kernel is just that address:');
        L.quote('#else /* CONFIG_HIGHMEM */\n…\nstatic inline void *kmap_local_page(const struct page *page)\n{\n\treturn page_address(page);\n}', { cite: 'include/linux/highmem-internal.h, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('CONFIG_HIGHMEM exists only for 32-bit x86, which cannot map all of RAM at once. On x86-64 there is no temporary mapping: <code>page_address()</code> is the direct-map address.');
        L.p('Because every user page has a kernel address, knowing a page’s frame number tells you where the kernel sees it. Two defences follow:');
        L.quote('Since Linux 4.0 only users with the CAP_SYS_ADMIN capability can get PFNs. In 4.0 and 4.1 opens by unprivileged fail with -EPERM.  Starting from 4.2 the PFN field is zeroed if the user does not have CAP_SYS_ADMIN. Reason: information about PFNs helps in exploiting Rowhammer vulnerability.', { cite: 'Documentation/admin-guide/mm/pagemap.rst, Linux v6.18', label: 'Linux source' });
        L.quote('Randomizes the base virtual address of kernel memory sections (physical memory mapping, vmalloc & vmemmap). This security feature makes exploits relying on predictable memory locations less reliable.', { cite: 'arch/x86/Kconfig, RANDOMIZE_MEMORY, Linux v6.18', label: 'Linux source' });
        L.p('That is why the lab programs run as root to read frame numbers. On machine A the randomization is not active, so the direct map starts at its default ([[ch:vm-tree]]).');
      } },
      { id: 'caches', title: 'Why aliases are safe', body: function (L) {
        L.p('A store through one alias and a load through another use different virtual addresses but the same physical one. The L1 picks the set with page-offset bits, which aliases share, and compares physical tags ([[ch:vm-vipt]]).');
        L.p('So both addresses find the same line: there is only one copy to read. If the set came from bits above the page offset, two aliases could land in different sets and hold different data.');
        L.p('On machine B a pointer chase over one frame takes the same time whether each visit to a line uses the same view or switches between views A and B:');
        L.out('alias.chase');
        L.p('1.82 against 1.80 ns per load: on this Intel CPU an alias costs nothing measurable. [[ch:vm-vipt]] quoted AMD’s guide for Zen cores, where a load through a different alias than the line’s last one costs about an L2 hit.');
        L.note('amd', 'AMD’s Family 17h guide (pub. 55723, §2.6.2.2) explains the cost: the L1 data cache keeps a small tag made from the virtual (linear) address, to predict the way. A load through the other alias misses that tag and is served as an L2 request. The answer is still correct; only the latency changes.');
        L.p('Aliases are correct and, here, free. The one thing that does not carry over between them is a pointer.');
      } },
      { id: 'offsets', title: 'Pointers in shared memory', body: function (L) {
        L.p('A pointer stored in a shared page holds one virtual address. Read through another mapping, or in another process, it still points where the writer’s mapping was:');
        L.code('stored through view A:   p = 0x7f2f1743b100   view A + 0x100\nloaded through view B:   p = 0x7f2f1743b100   still inside view A\nother process:           p = 0x7f2f1743b100   not where its mapping is\n\nstored as an offset:     0x100                each reader adds its base', { lang: 'text', title: 'example with the views above', label: 'Inference' });
        L.p('So data shared between address spaces stores offsets from the start of the shared region. io_uring is an example: a program and the kernel share its rings, each at its own address.');
        L.quote('struct io_sqring_offsets {\n\t__u32 head;\n\t__u32 tail;\n\t__u32 ring_mask;\n\t__u32 ring_entries;\n\t__u32 flags;\n\t__u32 dropped;\n\t__u32 array;\n\t__u32 resv1;\n\t__u64 user_addr;\n};', { cite: 'include/uapi/linux/io_uring.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('The kernel fills this structure when the ring is created; the program adds each field to the address where it mapped the ring. [[ch:io-uring]] uses it.');
        L.p('All of this happens inside one machine. The next lesson adds a second layer of translation: a virtual machine.');
      } }
    ],
    check: [
      { q: 'A memfd page is mapped twice with MAP_SHARED. A store goes through view A, then a load through view B. What does the load return?', options: ['The stored value: both views reach the same frame', 'The old value, until the TLB is flushed', 'Zero: view B has its own copy', 'A fault: a frame cannot be mapped twice'], answer: 0, why: 'Both entries hold frame 0x110b4b; the store and the load reach the same bytes.' },
      { q: 'Two processes map libc at different addresses. Why does getpid’s code sit in the same frame?', options: ['Both map the same page-cache page of the library file', 'The kernel copies the code into each process', 'Code is not translated by the MMU', 'ASLR was turned off for the run'], answer: 0, why: 'A file page is in the page cache once; every mapping of it holds the same frame number.' },
      { q: 'Why does an alias never read stale data from the L1 on x86?', options: ['The set comes from page-offset bits, and tags are physical', 'The kernel flushes the L1 after every mmap', 'Lines reached through aliases are not cached', 'The TLB merges the two entries into one'], answer: 0, why: 'Both addresses select the same set and match the same physical tag: one line, one copy.' },
      { q: 'A ring shared with another process holds a pointer written by the first process. Why is it wrong in the second?', options: ['The second process maps the ring at another address', 'Shared memory cannot hold 64-bit values', 'The second process sees a different frame', 'The second process’s TLB holds old entries'], answer: 0, why: 'The frame is the same; the virtual address of the mapping differs. Offsets from the start of the ring work in both.' }
    ],
    remember: [
      'Two entries with the same frame number give two virtual addresses for the same bytes: an alias.',
      'MAP_SHARED mappings of a file, and every mapping of library code, use the page cache’s single copy.',
      'Every frame also has a kernel address in the direct map; frame numbers are root-only partly for that reason.',
      'Physically tagged caches keep aliases correct; on machine B an alias costs nothing extra, on AMD Zen about an L2 hit.',
      'Data shared between address spaces stores offsets, not pointers, as io_uring’s rings do.'
    ],
    sources: [['memfd_create(2)', 'https://man7.org/linux/man-pages/man2/memfd_create.2.html'], ['mmap(2)', 'https://man7.org/linux/man-pages/man2/mmap.2.html'], ['Linux: The /proc filesystem (smaps, PSS)', 'https://docs.kernel.org/filesystems/proc.html'], ['Linux: Examining process page tables (pagemap)', 'https://docs.kernel.org/admin-guide/mm/pagemap.html'], ['Linux v6.18: include/uapi/linux/io_uring.h', 'https://github.com/torvalds/linux/blob/v6.18/include/uapi/linux/io_uring.h'], ['AMD documentation portal: pub. 55723', 'https://docs.amd.com/v/u/en-US/55723_3.01_PUB']]
  });

  d('guest', 'guest', 'An operating system running inside a virtual machine. The host is the system that runs the virtual machine, through its hypervisor.');
  d('hypervisor', 'hypervisor', 'The software that creates virtual machines and gives each one virtual CPUs, memory and devices. On both lab machines it is KVM, part of the host’s Linux kernel.');
  d('gpa', 'guest-physical address', 'An address the guest treats as physical. The host maps it to a host-physical address with page tables of its own, which the guest cannot see.');
  d('ept', 'EPT, NPT, stage 2', 'The second set of page tables, owned by the hypervisor, that maps guest-physical to host-physical addresses: extended page tables on Intel, nested page tables on AMD, stage 2 tables on Arm.');
  d('vmtag', 'VPID, ASID, VMID', 'A tag the CPU attaches to TLB entries made inside a virtual machine, so entries of different machines and of the host can share the TLB: VPID on Intel, ASID on AMD, VMID on Arm.');

  function walkFigure(sv) {
    var T = P.T, R = P.R, x0 = 104, pitch = 62, cw = 56, ch = 30;
    var rows = ['guest PML4', 'guest PDPT', 'guest PD', 'guest PT', 'data page'];
    T(sv, (x0 + 3 * pitch + cw + x0) / 2, 14, 'host tables', 's', 'middle');
    P.Ln(sv, 'M' + x0 + ' 20 L' + (x0 + 3 * pitch + cw) + ' 20');
    T(sv, x0 + 4 * pitch + cw / 2, 14, 'guest table', 's', 'middle');
    P.Ln(sv, 'M' + (x0 + 4 * pitch) + ' 20 L' + (x0 + 4 * pitch + cw) + ' 20');
    ['PML4', 'PDPT', 'PD', 'PT', 'entry'].forEach(function (t, i) { T(sv, x0 + i * pitch + cw / 2, 36, t, 's m', 'middle'); });
    T(sv, 96, 36, 'to find', 's', 'end');
    var n = 0;
    rows.forEach(function (lab, r) {
      var y = 46 + r * 42;
      T(sv, 96, y + 20, lab, 's', 'end');
      for (var c = 0; c < 5; c++) {
        var x = x0 + c * pitch;
        if (r === 4 && c === 4) { R(sv, x, y, cw, ch, 'box dash', 4); T(sv, x + cw / 2, y + 20, 'data', 's', 'middle'); continue; }
        R(sv, x, y, cw, ch, c < 4 ? 'a4b' : 'a1b', 4);
        T(sv, x + cw / 2, y + 20, ++n, 'm', 'middle');
      }
    });
  }

  /* ---------- III.22 ---------- */
  App.lesson({
    id: 'vm-virt', short: 'Translation in a virtual machine', title: 'Translation inside a virtual machine',
    lede: 'Inside a virtual machine every address is translated twice: by the guest’s page tables, then by the hypervisor’s. The hardware does both in one walk, which can take 24 memory references.',
    know: ['A TLB miss walks four levels of tables: four memory reads ([[ch:vm-walk]]).', 'TLB entries can carry a tag so a switch need not flush them ([[ch:vm-switch]]).', 'A huge page shortens the walk and covers more memory per TLB entry ([[ch:vm-huge]]).'],
    learn: ['Tell what a guest can and cannot see of its virtual machine', 'Name the second set of tables on Intel, AMD and Arm', 'Count the memory references of a two-dimensional walk', 'Explain why huge pages matter on both sides'],
    sections: [
      { id: 'guest', title: 'What a guest sees', body: function (L) {
        L.p('Both lab machines are virtual machines. Machine B’s kernel knows it, from a CPUID flag the hypervisor sets:', ['guest', 'hypervisor']);
        L.out('virt.cpu');
        L.quote('#define X86_FEATURE_HYPERVISOR\t\t( 4*32+31) /* "hypervisor" Running on a hypervisor */', { cite: 'arch/x86/include/asm/cpufeatures.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('Word 4 is CPUID leaf 1, register ECX, so the flag is ECX bit 31; each of the 4 virtual CPUs reports it. There is no <code>vmx</code> or <code>svm</code> flag: this guest cannot run virtual machines of its own with hardware help.');
        L.p('The guest’s physical addresses are its own. These ranges hold its 16 GiB of RAM:', ['gpa']);
        L.out('virt.ram');
        L.p('So every frame number in this part is a guest frame number. The host maps each guest-physical page to a frame of its own, which the guest never sees.');
        L.p('The CPU description is the hypervisor’s too. Machine A’s CPUID reported an 8-way L1, yet the L1 behaved as 12-way in [[ch:vm-vipt]].');
      } },
      { id: 'two', title: 'Two sets of tables', body: function (L) {
        L.p('A load in the guest goes through two translations:');
        L.chain([
          { k: 'guest-virtual', v: '0x7f3a1b2c3d4e', d: 'what the program uses' },
          { k: 'guest page tables', v: 'guest CR3', d: 'set up by the guest kernel' },
          { k: 'guest-physical', v: '0x129b49d4e', d: 'what the guest calls physical' },
          { k: 'EPT, NPT or stage 2', v: 'set up by the hypervisor', d: 'the guest cannot see them' },
          { k: 'host-physical', v: '?', d: 'what reaches the memory', hot: true }
        ], { cap: 'The running example’s store, as seen from both sides. The host-physical address is not visible inside the guest.' });
        L.p('The guest kernel manages its own tables and CR3 as on a real machine. The hypervisor manages the second set, which the guest cannot see:', ['ept']);
        L.table(['', 'Intel', 'AMD', 'Arm'], [
          ['guest’s tables', 'from CR3', 'from CR3', 'stage 1: TTBR0/1_EL1'],
          ['hypervisor’s tables', 'EPT', 'NPT', 'stage 2: VTTBR_EL2'],
          ['VM tag in the TLB', 'VPID (16 bits)', 'ASID', 'VMID (8 or 16 bits)']
        ], { mono: false, cap: 'VPID width: VMX_NR_VPIDS in arch/x86/include/asm/vmx.h; VMID width: get_vmid_bits() in arch/arm64/include/asm/cpufeature.h (Linux v6.18).' });
        L.quote('gpa   guest physical address\ngva   guest virtual address\n…\ntdp   two dimensional paging (vendor neutral term for NPT and EPT)', { cite: 'Documentation/virt/kvm/x86/mmu.rst, “Acronyms”, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('KVM, the hypervisor on both machines, calls the scheme two-dimensional paging. The second dimension shows up in the walk.');
      } },
      { id: 'walk', title: 'The two-dimensional walk', body: function (L) {
        L.p('Each guest table is found by a guest-physical address: guest CR3 for the first, an entry’s frame number for the rest. Before the CPU can read a guest entry, it must translate that address through the host tables:');
        L.fig(420, 258, walkFigure, { cap: 'One TLB miss in a guest with 4-level tables on both sides, in order. Each row walks the host tables (blue) to find a guest table, then reads the guest entry (orange). The last row translates the data’s guest-physical address.', maxw: 520 });
        L.code('each guest level:   4 host + 1 guest =  5\nfour guest levels:  4 × 5            = 20\nthe data’s address: 4 host           =  4\n                                       --\n                                       24\n(4 + 1) × (4 + 1) − 1 = 24; native: 4', { lang: 'text', title: 'arithmetic' });
        L.quote('Figure 2 depicts how x86-64 page-table memory references can grow from a native 4 to a virtualized 24 references: 5 references to translate the root and each of 4 levels of the guest page table plus 4 references to obtain the final hPA: 5*4+4 references.', { cite: 'J. Gandhi, A. Basu, M. D. Hill, M. M. Swift, “Efficient Memory Virtualization: Reducing Dimensionality of Nested Page Walks”, MICRO 2014', label: 'Peer-reviewed', src: ['Paper (PDF)', 'https://scail.cs.wisc.edu/papers/micro14-virtualization.pdf'] });
        L.p('24 is the worst case: entries found in the caches or the walker’s caches cost less, as on real hardware ([[ch:vm-tlb]]). The chases in that lesson ran inside machine A, so their walks were two-dimensional, provided the host uses EPT:');
        L.quote('bool __read_mostly enable_ept = 1;\n…\nif (!cpu_has_vmx_ept() ||\n    !cpu_has_vmx_ept_4levels() ||\n    !cpu_has_vmx_ept_mt_wb() ||\n    !cpu_has_vmx_invept_global())\n\tenable_ept = 0;', { cite: 'arch/x86/kvm/vmx/vmx.c, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('KVM turns EPT on whenever the CPU supports it, and falls back to shadow page tables kept by the hypervisor otherwise. From inside the guest the choice is not visible.');
      } },
      { id: 'tags', title: 'Tags and shootdowns', body: function (L) {
        L.p('A TLB entry made inside a guest maps a guest-virtual address straight to a host-physical one. The CPU tags it with the virtual machine, so entries of several machines and of the host can share the TLB:', ['vmtag']);
        L.quote(' * … VM-Enter and VM-Exit are\n * required to flush GVA->{G,H}PA mappings from the TLB if vpid is\n * disabled …', { cite: 'arch/x86/kvm/vmx/vmx.c, vmx_flush_tlb_guest(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('Without a VPID, every switch between guest and host would empty the guest’s entries. KVM gives each virtual CPU its own VPID and keeps VPID 0 for the host, as PCIDs separate processes in [[ch:vm-switch]].');
        L.p('Shootdowns change too. A guest’s interrupt to a virtual CPU that the host has paused waits until the host runs that CPU again. Machine B’s kernel avoids the wait:');
        L.out('virt.dmesg');
        L.quote('/*\n * We have to call flush only on online vCPUs. And\n * queue flush_on_enter for pre-empted vCPUs\n */\nfor_each_cpu(cpu, flushmask) {\n…\n\tsrc = &per_cpu(steal_time, cpu);\n\tstate = READ_ONCE(src->preempted);\n\tif ((state & KVM_VCPU_PREEMPTED)) {\n\t\tif (try_cmpxchg(&src->preempted, &state,\n\t\t\t\tstate | KVM_VCPU_FLUSH_TLB))\n\t\t\t__cpumask_clear_cpu(cpu, flushmask);\n\t}\n}\n\nnative_flush_tlb_multi(flushmask, info);', { cite: 'arch/x86/kernel/kvm.c, kvm_flush_tlb_multi(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('For a paused virtual CPU the guest sets a flag in memory it shares with the host, and sends no interrupt; the host flushes that CPU’s TLB before running it again. So on such a guest, a count of shootdown interrupts can also fall short for this reason ([[ch:vm-shootdown]]).');
      } },
      { id: 'huge', title: 'Huge pages on both sides', body: function (L) {
        L.p('An entry made in a guest covers the guest page and the host page at once, so it can be no larger than the smaller of the two. AMD’s guide describes it:');
        L.quote('For example, when the Family 17h processor encounters a larger page size in the guest page tables which is backed by a smaller page in the host page tables, it will smash translations of the larger page size into the smaller page size found in the host.', { cite: 'Software Optimization Guide for AMD Family 17h Processors, pub. 55723 rev. 3.00, §1.2 “Smashing”', label: 'Vendor docs', src: ['AMD documentation portal: pub. 55723', 'https://docs.amd.com/v/u/en-US/55723_3.01_PUB'] });
        L.p('So a guest’s 2 MiB page backed by 4 KiB host pages saves guest walk steps but gives 4 KiB TLB entries. Huge pages pay off fully only when both sides use them.');
        L.try('Count the references', 'Pick the page size and the number of table levels on each side. Each row finds one guest table; the last row finds the data.', function (el) { App.LW.walk2d(el, {}); });
        L.p('With 2 MiB pages on both sides a miss takes 15 references; with 1 GiB pages, 8. Inside a guest only its own side can be chosen; the host’s page sizes are not visible.');
        L.note('arm', 'On Arm the hypervisor runs at EL2 and points VTTBR_EL2 at the stage 2 tables; KVM puts the VMID in bits 48 and up of that register (VTTBR_VMID_SHIFT in arch/arm64/include/asm/kvm_arm.h). The guest’s addresses after stage 1 are called intermediate physical addresses (IPA).');
        L.p('This was the last piece. The next lesson follows one store through all of Part III.');
      } }
    ],
    check: [
      { q: 'A guest with 4-level tables runs on a host with 4-level tables. How many memory references can one TLB miss take?', options: ['24', '8', '16', '4'], answer: 0, why: '4 guest levels × (4 host entries + 1 guest entry) + 4 host entries for the data: (4 + 1) × (4 + 1) − 1 = 24.' },
      { q: 'Why does each guest table read need a walk of the host tables?', options: ['Guest tables are found by guest-physical addresses', 'The host copies each guest table on every fault', 'Guest CR3 holds a host-virtual address', 'The TLB is turned off inside a guest'], answer: 0, why: 'Guest CR3 and every guest entry hold guest-physical addresses, which only the host tables can translate.' },
      { q: 'A 2 MiB guest page is backed by 4 KiB host pages. What do its TLB entries cover?', options: ['4 KiB each', '2 MiB each', '1 GiB each', '2 MiB for loads, 4 KiB for stores'], answer: 0, why: 'One entry maps guest-virtual to host-physical, so it can cover only the smaller of the two pages.' },
      { q: 'What does a VPID (ASID on AMD, VMID on Arm) save?', options: ['Flushing guest entries on every switch between guest and host', 'One level of every host walk', 'The memory for the guest’s page tables', 'Every shootdown interrupt inside the guest'], answer: 0, why: 'Tagged entries of several machines and of the host can stay in the TLB side by side.' }
    ],
    remember: [
      'A guest’s physical addresses are its own; the hypervisor maps them to host frames with a second set of tables: EPT, NPT or stage 2.',
      'Every guest table read needs a host walk: up to (4 + 1) × (4 + 1) − 1 = 24 references per TLB miss with 4-level tables on both sides.',
      'TLB entries carry a VM tag (VPID, ASID, VMID), so switches between guests and the host need not flush.',
      'A guest’s TLB entry covers the smaller of the guest page and the host page, so huge pages matter on both sides.',
      'A guest sees what the hypervisor tells it: a CPUID flag, paravirtual features such as KVM’s TLB flush, and a CPU description that may differ from the hardware.'
    ],
    sources: [['Linux: The x86 kvm shadow mmu (mmu.rst)', 'https://docs.kernel.org/virt/kvm/x86/mmu.html'], ['Linux v6.18: arch/x86/kvm/vmx/vmx.c', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/kvm/vmx/vmx.c'], ['Linux v6.18: arch/x86/kernel/kvm.c', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/kernel/kvm.c'], ['Gandhi et al., MICRO 2014 (PDF)', 'https://scail.cs.wisc.edu/papers/micro14-virtualization.pdf'], ['Intel SDM Vol. 3C, “VMX Support for Address Translation”', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html'], ['AMD64 APM Vol. 2, §15.25 “Nested Paging”', 'https://docs.amd.com/v/u/en-US/24593_3.43'], ['AMD, Software Optimization Guide for Family 17h, pub. 55723', 'https://docs.amd.com/v/u/en-US/55723_3.01_PUB']]
  });


  /* ---------- III.23 ---------- */
  var STORE_ROWS = [
    { k: 'instruction', v: 'movb $0x1,0xd4e(%r12)', d: 'story + 0x1e97' },
    { k: 'address', v: '0x7f3a1b2c3d4e', d: '' },
    { k: 'TLB', v: '', d: '' },
    { k: 'L1 data cache', v: '', d: '' },
    { k: 'page walk', v: '', d: '' },
    { k: 'kernel', v: '', d: '' },
    { k: 'new frames', v: '', d: '' },
    { k: 'result', v: '', d: '' }
  ];
  var STORE_STEPS = [
    { t: 'The store issues', d: 'The CPU executes movb $0x1,0xd4e(%r12). r12 holds 0x7f3a1b2c3000, the address mmap returned, so the store goes to 0x7f3a1b2c3d4e.', hot: [0, 1], set: { 1: { d: 'indices 254 · 232 · 217 · 195, offset 0xd4e' } } },
    { t: 'Two lookups start together', d: 'Bits 11:6 of the address give L1 set 53, so the L1 starts reading that set. At the same time the TLB looks up page 0x7f3a1b2c3.', hot: [2, 3], done: [1], set: { 2: { v: 'page 0x7f3a1b2c3', d: 'looking up' }, 3: { v: 'set 53', d: 'reading the set; the tag compare needs the frame' } } },
    { t: 'TLB miss', d: 'The page has never been touched, so no TLB holds it. The walker starts from CR3.', hot: [2, 4], set: { 2: { v: 'miss', d: 'no entry for page 0x7f3a1b2c3' }, 4: { v: 'CR3 → PML4 at 0x107a24000', d: 'example value' } } },
    { t: 'The walk stops at the first level', d: 'PML4 entry 254, at 0x107a247f0, is 0: nothing in the process lives between 0x7f0000000000 and 0x7f7fffffffff yet.', hot: [4], set: { 4: { v: 'PML4[254] = 0', d: 'not present: the walk fails' } } },
    { t: 'Page fault', d: 'The CPU writes the address to CR2, pushes error code 0x6 (a write, from user mode, to a page that is not present) and enters the kernel.', hot: [5], done: [4], set: { 5: { v: '#PF, error code 0x6', d: 'CR2 = 0x7f3a1b2c3d4e' } } },
    { t: 'The kernel finds the area', d: 'The fault handler finds the area mmap created, 0x7f3a1b2c3000 to 0x7f3a1b2c7000, readable and writable. The store is allowed, so it calls handle_mm_fault().', hot: [5], set: { 5: { v: 'area 7f3a1b2c3000-7f3a1b2c7000 rw-p', d: 'allowed: handle_mm_fault()' } } },
    { t: 'Three tables', d: 'Each missing level gets a zeroed frame from the page allocator: PDPT 0x133c05, PD 0x128e8c and PT 0x1330d4. VmPTE grows from 48 to 60 kB.', hot: [6], done: [5], set: { 6: { v: 'tables 0x133c05 · 0x128e8c · 0x1330d4', d: 'zeroed and linked in, PML4[254] down' } } },
    { t: 'A data frame', d: 'do_anonymous_page() takes frame 0x129b49, zeroed through the direct map at 0xffff888129b49000, and writes 0x8000000129b49067 into PT entry 195. No TLB flush: the entry was not present before.', hot: [6, 7], set: { 6: { v: '+ data frame 0x129b49', d: 'zeroed at 0xffff888129b49000' }, 7: { v: 'PTE 0x8000000129b49067', d: 'at 0x1330d4618; A and D already set' } } },
    { t: 'Return and execute again', d: 'The kernel returns to the same instruction, and the CPU executes the store a second time. Nothing was cached for the page, so the TLB misses again.', hot: [0, 2], done: [6], set: { 5: { v: 'returned', d: 'one fault in total' }, 2: { v: 'miss', d: 'nothing cached for the page' } } },
    { t: 'The walk succeeds', d: 'Four reads: 0x107a247f0, 0x133c05740, 0x128e8c6c8, 0x1330d4618. The last entry gives frame 0x129b49, and the TLB keeps the translation.', hot: [2, 4], set: { 4: { v: '4 reads', d: '→ frame 0x129b49' }, 2: { v: 'filled', d: 'page 0x7f3a1b2c3 → frame 0x129b49' } } },
    { t: 'The store completes', d: 'The tag compare in set 53 now has its frame. The line holding 0x129b49d4e is found or fetched, and byte 14 of it becomes 1.', hot: [3, 7], set: { 3: { v: 'set 53, frame 0x129b49', d: 'byte 14 of the line = 1' }, 7: { v: '0x129b49d4e = 1', d: 'the store is done' } } },
    { t: 'The next store', d: 'A second store to the page hits in the TLB and in the L1. No walk, no kernel: the run counted 0 faults.', hot: [2, 3], set: { 2: { v: 'hit', d: '' }, 3: { v: 'hit', d: '' }, 4: { v: '—', d: 'not needed' }, 5: { v: '—', d: '0 faults' } } }
  ];
  App.lesson({
    id: 'vm-review', short: 'One store, end to end', title: 'One store, end to end',
    lede: 'The first store to a fresh page uses every part of virtual memory at once: the TLB, the walk, a fault, the allocator and the cache. The second store uses two of them.',
    know: ['The store’s address splits into four indices and an offset ([[ch:vm-levels]]).', 'The first store to an anonymous page faults and gets a zeroed frame ([[ch:vm-demand]]).', 'The L1 lookup starts while the TLB translates ([[ch:vm-vipt]]).'],
    learn: ['Follow one store from the instruction to the cache, through a fault', 'Say which hardware and which kernel code take part, in order', 'Compare the cost of each path, from measurements', 'Name the lesson behind each variation'],
    sections: [
      { id: 'path', title: 'The first store, step by step', body: function (L) {
        L.p('This is the running example of the part: one store into a page that mmap has just created.');
        L.out('story.objdump');
        L.try('Follow the store', 'Every value is from the main run on machine A, except CR3, which is an example. Step through with next.', function (el) { App.LW.stepRows(el, STORE_ROWS, STORE_STEPS); });
        L.p('One instruction ran twice, and the kernel ran in between. The run recorded the fault and the four allocations:');
        L.out('story.alloc');
        L.p('The kernel had just written zeros to frame 0x129b49 through its direct-map address. With physical tags, the store can find those lines still in the cache ([[ch:vm-alias]]).');
      } },
      { id: 'cost', title: 'What each path costs', body: function (L) {
        L.p('The same store can take very different paths. These are the times measured on machine A in this part:');
        L.table(['Path', 'Time', 'Measured in'], [
          ['TLB hit and L1 hit', 'about 1.5 ns per load', '[[ch:vm-tlb]], chase over 16 to 64 pages'],
          ['L1 TLB miss, L2 TLB hit', 'about 3.7 ns per load', '[[ch:vm-tlb]], 128 to 512 pages'],
          ['TLB miss, page walk, cache misses', '15 ns at 4096 pages, 180 ns at 65536', '[[ch:vm-tlb]]'],
          ['first store to a 4 KiB page', '1738 ns (median)', '[[ch:vm-cost]]'],
          ['first store to a 2 MiB page', '351 µs (median)', '[[ch:vm-cost]]'],
          ['first store after fork: copy-on-write', '2.7 to 2.8 µs per page', '[[ch:vm-cow]]']
        ], { mono: false });
        L.p('From the fastest path to a 4 KiB fault is a factor of about 1000. That is why a measurement must say whether pages were touched before ([[ch:vm-cost]]).');
      } },
      { id: 'variations', title: 'What changes the path', body: function (L) {
        L.p('Each lesson of the part changed one step of this path:');
        L.table(['If', 'then'], [
          ['the first access is a load', 'the zero page is mapped read-only; the first store then allocates ([[ch:vm-demand]])'],
          ['the page belongs to a file', 'the frame comes from the page cache; a page never read is a major fault ([[ch:vm-files]])'],
          ['the process has forked', 'both share the frame read-only; the first store copies it ([[ch:vm-cow]])'],
          ['the page is 2 MiB', 'one fault maps 512 frames; the walk ends at the PD ([[ch:vm-huge]])'],
          ['another CPU runs the process', 'changing the entry needs a shootdown ([[ch:vm-shootdown]])'],
          ['memory is short', 'frames come back from reclaim, or a process is killed ([[ch:vm-reclaim]])'],
          ['the machine is a virtual machine', 'every walk is two-dimensional ([[ch:vm-virt]])']
        ], { mono: false });
        L.p('The interactive lab replays the main path on the example machine, with a full walk, a fault and a 2 MiB page: [[ch:xlate]].');
      } },
      { id: 'run', title: 'Run it on your machine', body: function (L) {
        L.p('Every lab run in this part comes from the programs in <code>labruns/</code>. They build with gcc and need root, for frame numbers and trace events:');
        L.code('sudo sh labruns/vm/run_all.sh /tmp/lab   # machine A’s runs: labruns/vm/out/\nsudo sh labruns/vm/run_b.sh /tmp/lab     # machine B’s runs: labruns/vm/out-b/', { lang: 'sh', title: 'from the repository root' });
        L.p('Frame numbers change on every run, and times depend on the machine. In the browser, [[ch:vm-cost]] can import a page-fault measurement from your own machine.');
        L.p('Part IV follows the same store further down, into the caches and DRAM, starting with [[ch:l1d]].');
      } }
    ],
    check: [
      { q: 'mmap had succeeded. Why did the first store fault?', options: ['mmap only recorded the area; no table entry existed yet', 'The area was mapped read-only', 'The TLB was full', 'The address was not canonical'], answer: 0, why: 'PML4 entry 254 was 0. The kernel builds tables and entries on the first access, inside the fault.' },
      { q: 'Why did the kernel not flush the TLB after writing the new entry?', options: ['The entry was not present before, so no TLB could hold it', 'The kernel flushes only on context switches', 'x86 TLBs watch page-table writes', 'The store had already completed'], answer: 0, why: 'TLBs keep only translations that existed. The comment in do_anonymous_page() says so: “No need to invalidate - it was non-present before”.' },
      { q: 'The second store to the page caused no fault. What did it use?', options: ['The TLB entry from the restarted store, and the L1', 'A new page walk', 'The kernel’s direct map', 'The zero page'], answer: 0, why: 'The retry filled the TLB; later stores hit it.' },
      { q: 'The L1 set of the store is 53. What decides it?', options: ['Bits 11:6 of the address, the same before and after translation', 'The frame number 0x129b49', 'The PML4 index 254', 'The process’s PCID'], answer: 0, why: '(0x7f3a1b2c3d4e >> 6) & 63 = 53, and those bits are part of the page offset.' }
    ],
    remember: [
      'mmap only records an area; the first store finds no entry, faults with error code 0x6, and the kernel builds the tables and maps a zeroed frame.',
      'The new entry needs no TLB flush; the store runs again, walks four levels and fills the TLB.',
      'The L1 lookup and the TLB lookup start together, because the set comes from the page offset.',
      'After the first touch, the same store is a TLB hit and an L1 hit: about 1.5 ns against about 1.7 µs for the fault, on machine A.',
      'File pages, fork, huge pages, other CPUs, memory pressure and virtual machines each change one step of this path.'
    ],
    sources: [['labruns/README.md: the programs and how to run them', 'https://github.com/himasudo/memory-system-interactive/tree/lessons/labruns'], ['Linux v6.18: mm/memory.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/memory.c'], ['Linux v6.18: arch/x86/mm/fault.c', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/mm/fault.c']]
  });

})();
