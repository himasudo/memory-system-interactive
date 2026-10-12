/* ======================= Part III · Virtual memory, lessons 19–23 ======================= */
(function () {
  'use strict';
  var LW = function () { return App.LW; };
  var d = App.gloss;
  d('zone', 'zone', 'A range of physical memory the kernel manages separately, chosen by address: DMA (below 16 MiB), DMA32 (below 4 GiB) and Normal (the rest) on x86-64. Devices that can only reach low addresses get memory from the low zones.');
  d('buddy', 'buddy allocator', 'The kernel’s page allocator. It keeps free memory in blocks of 2^order frames, each aligned to its size; it splits a larger block to serve a smaller request and merges a freed block with its free twin, its buddy.');
  d('pcplist', 'per-CPU page list', 'A short list of free frames each CPU keeps for each zone, so most allocations and frees take no shared lock. It is refilled from, and drained back to, the zone’s free lists in batches.');
  d('migratetype', 'migrate type', 'Which kind of memory a block holds: unmovable (most kernel memory), movable (user pages, which the kernel can move) or reclaimable. The allocator keeps the kinds in separate 2 MiB pageblocks, so compaction can empty whole blocks.');
  d('structpage', 'struct page', 'The kernel’s 64-byte record for each frame: what uses it, how many mappings it has, which list it is on. They sit in one virtual array, the vmemmap, at 0xffffea0000000000 on x86-64.');
  d('folio', 'folio', 'The kernel’s name for a block of one or more frames that it manages as a unit, such as a 2 MiB huge page. Many functions quoted in this part take a folio.');

  /* ---------- III.19 ---------- */
  App.lesson({
    id: 'vm-buddy', short: 'Where frames come from', title: 'Where frames come from: the page allocator',
    lede: 'Every frame comes from one allocator. It keeps free memory in blocks of 1 to 1024 frames, splits them on demand and merges them back, with a short list per CPU in front.',
    know: ['Faults take frames with flags such as GFP_HIGHUSER_MOVABLE ([[ch:vm-demand]]).', 'A 2 MiB huge page is one block of order 9 ([[ch:vm-huge]]).', 'A frame freed by MADV_DONTNEED came straight back at the next store ([[ch:vm-protect]]).'],
    learn: ['Read /proc/buddyinfo: zones, orders and free blocks', 'Explain splitting and merging, and why blocks are aligned', 'Say what the per-CPU lists do, and see their effect in a trace', 'Say what a struct page is and what it costs'],
    sections: [
      { id: 'zones', title: 'Zones: memory grouped by address', body: function (L) {
        L.p('These runs come from machine B. Linux first divides physical memory into zones by address, because some devices can only reach low addresses:', ['zone']);
        L.out('zones.ranges');
        L.table(['Zone', 'Addresses', 'Kept for'], [
          ['DMA', 'below 16 MiB', 'old devices that can only address 24 bits'],
          ['DMA32', '16 MiB to 4 GiB', 'devices that can only address 32 bits'],
          ['Normal', '4 GiB and up', 'everything else: user pages, most kernel memory']
        ], { mono: false });
        L.quote('ZONE_DMA and ZONE_DMA32 are used when there are peripherals not able\nto DMA to all of the addressable memory (ZONE_NORMAL).', { cite: 'include/linux/mmzone.h, enum zone_type, Linux v6.18', label: 'Linux source', code: true });
        L.p('An allocation names the zones it may use, and falls back to lower zones only when it must. [[ch:io-dma]] returns to the devices that need the low ones.');
      } },
      { id: 'orders', title: 'Free blocks, by order', body: function (L) {
        L.p('Inside each zone, free memory is kept in lists by order: blocks of 1, 2, 4 … 1024 contiguous frames, each block aligned to its own size. <code>/proc/buddyinfo</code> counts them:', ['buddy', 'order']);
        L.out('zones.buddy');
        L.p('Read the Normal line from the left: 3509 free single frames, 5467 free pairs, and so on up to 84 free blocks of 1024 frames, 4 MiB each. Eleven columns, orders 0 to 10:');
        L.quote('#define MAX_PAGE_ORDER 10', { cite: 'include/linux/mmzone.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('A request for order k takes a free block of order k. If there is none, a larger block is split in two, again and again: one half is used, the other goes on the free list one order down. Each half is the other’s buddy.');
        L.p('When a block is freed, the allocator looks at its buddy. If the buddy is free too, the two merge into a block of the next order, and the check repeats one level up. The buddy is found by flipping one bit:');
        L.quote(' * 1) Any buddy B1 will have an order O twin B2 which satisfies\n * the following equation:\n *     B2 = B1 ^ (1 << O)\n …\nstatic inline unsigned long\n__find_buddy_pfn(unsigned long page_pfn, unsigned int order)\n{\n\treturn page_pfn ^ (1 << order);\n}', { cite: 'mm/internal.h, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.code('the huge page from the THP run: pfn 0x158800, order 9\nbuddy  = 0x158800 ^ (1 << 9)  = 0x158a00\nparent = 0x158800 & ~(1 << 9) = 0x158800   (the order-10 block they form)', { lang: 'text', title: 'arithmetic' });
        L.p('That is why a huge page starts at a multiple of 512: an order-9 block is always aligned to 512 frames.');
        L.try('A buddy allocator', 'Sixteen frames that start as one free block of order 4. Allocate blocks of different orders, then click an allocated block to free it, and watch the splits and merges.', function (el) { LW().buddysim(el, {}); });
      } },
      { id: 'pcp', title: 'A list per CPU', body: function (L) {
        L.p('Taking a block from a zone’s free lists needs the zone’s lock, which every CPU shares. So each CPU keeps a short list of free frames of its own, per zone:', ['pcplist']);
        L.out('zones.pcp');
        L.p('CPU 0’s list held 2061 free frames, may hold up to 2251 (<code>high</code>), and moves frames to and from the zone 63 at a time (<code>batch</code>). The watermarks belong to [[ch:vm-reclaim]].');
        L.p('A program touches 256 fresh pages and counts, in the trace, where their frames came from:');
        L.out('buddy.small');
        L.p('All 256 came from CPU 0’s list: not one trip to the zone’s free lists. Their frame numbers are scattered: the list holds whatever frames were freed or refilled into it.');
        L.p('Then it touches 16384 more, enough to empty the list:');
        L.out('buddy.refill', { wide: true });
        L.p('The list was refilled twelve times: 63 pages, then 126, 252, 504, 1008, then 2016 each time. The kernel doubles the refill while a CPU keeps allocating without freeing:');
        L.quote('/*\n * Double the number of pages allocated each time there is\n * subsequent allocation of order-0 pages without any freeing.\n */\nif (batch <= max_nr_alloc &&\n    pcp->alloc_factor < CONFIG_PCP_BATCH_SCALE_MAX)\n\tpcp->alloc_factor++;', { cite: 'mm/page_alloc.c, nr_pcp_alloc(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.out('zones.config');
        L.p('2016 is 63 × 2⁵: the doubling stops at CONFIG_PCP_BATCH_SCALE_MAX = 5. In the same run the list’s high mark grew from 2755 to 16384.');
        L.p('Frees go the other way: a freed frame goes to the front of the CPU’s list, and the next allocation takes the front one:');
        L.out('buddy.lifo');
        L.quote('list_add(&page->pcp_list, &pcp->lists[pindex]);\n…\npage = list_first_entry(list, struct page, pcp_list);', { cite: 'mm/page_alloc.c: free_frozen_page_commit(), then __rmqueue_pcplist(), Linux v6.18 (one line each)', label: 'Linux source', code: true });
        L.p('So the most recently freed frame is the next one handed out on that CPU, still warm in the caches. That is why MADV_DONTNEED in [[ch:vm-protect]] got back 0x129b49.');
      } },
      { id: 'huge', title: 'Huge pages use the same lists', body: function (L) {
        L.p('One more run: a single 2 MiB huge-page fault, with the Normal zone’s free blocks counted before and after:');
        L.out('buddy.huge', { wide: true });
        L.p('The order-9 column dropped by two, not one. Per-CPU lists also hold large blocks, and a refill of order k is scaled down from the batch:');
        L.quote('if (batch > 1)\n\tbatch = max(batch >> order, 2);', { cite: 'mm/page_alloc.c, nr_pcp_alloc(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('63 >> 9 is 0, so the refill took two order-9 blocks: one for the huge page, one kept on CPU 0’s list for the next. After munmap both were back on the zone’s order-9 list.');
      } },
      { id: 'meta', title: 'Flags, migrate types and struct page', body: function (L) {
        L.p('The flags in this part’s traces tell the allocator what each block is for:', ['gfp']);
        L.table(['Flags', 'Seen in', 'Means'], [
          ['GFP_KERNEL_ACCOUNT | __GFP_ZERO', 'page tables ([[ch:vm-demand]])', 'kernel memory, charged to the process, zeroed'],
          ['GFP_HIGHUSER_MOVABLE | __GFP_ZERO', 'fresh anonymous pages', 'a user page the kernel may move later, zeroed'],
          ['GFP_HIGHUSER_MOVABLE', 'copy-on-write copies ([[ch:vm-cow]])', 'the same, filled by copying instead'],
          ['GFP_TRANSHUGE | __GFP_NORETRY | __GFP_THISNODE', 'the huge page ([[ch:vm-huge]])', 'give up quickly, and only on this memory node'],
          ['GFP_NOFS | … | __GFP_NORETRY', 'a file page read from disk ([[ch:vm-files]])', 'no file-system calls while reclaiming; give up quickly']
        ], { mono: false });
        L.p('The <code>migratetype</code> in the traces was 0 for page tables and 1 for user pages: unmovable and movable. The allocator keeps the kinds apart, in pageblocks of 512 frames:', ['migratetype']);
        L.out('zones.types');
        L.p('Keeping movable pages together means compaction can empty a whole 2 MiB block by moving them, and so make a free huge page ([[ch:vm-huge]]).');
        L.p('Finally, the bookkeeping. For every frame the kernel keeps a 64-byte record, <code>struct page</code>, in one virtual array starting at 0xffffea0000000000, the “virtual memory map” in [[ch:vm-space]]:', ['structpage', 'folio']);
        L.code('64 bytes per 4096-byte frame = 1/64 of RAM, about 1.6 %\nfor 16 GiB of RAM: 256 MiB of struct page', { lang: 'text', title: 'arithmetic' });
        L.p('The 64 comes from the kernel’s own documentation, which computes with sizeof(struct page) = 64 (Documentation/mm/vmemmap_dedup.rst). Groups of them that the kernel manages as one block are called folios.');
      } }
    ],
    check: [
      { q: 'buddyinfo shows 22 in the order-9 column of the Normal zone. What is free?', options: ['22 blocks of 512 contiguous frames, 2 MiB each', '22 frames', '9 blocks of 22 frames', '22 huge pages that are mapped'], answer: 0, why: 'Column k counts free blocks of 2^k frames.' },
      { q: 'A block at pfn 0x40 of order 2 is freed. Where is its buddy?', options: ['pfn 0x44', 'pfn 0x42', 'pfn 0x3c', 'pfn 0x48'], answer: 0, why: '0x40 ^ (1 << 2) = 0x40 ^ 0x4 = 0x44.' },
      { q: 'Why did 256 fresh pages cause no refill at all?', options: ['CPU 0’s list already held enough free frames', 'The pages were huge pages', 'The zone had no free blocks', 'The trace was off'], answer: 0, why: 'The list held 2237 frames; 256 allocations took them from there.' },
      { q: 'MADV_DONTNEED freed a frame, and the next store got the same frame. Why?', options: ['Freed frames go to the front of the CPU’s list, and allocations take the front one', 'The kernel never freed it', 'Frames are reused by address order', 'The zone lock forces it'], answer: 0, why: 'list_add() on free, list_first_entry() on allocation: last in, first out.' }
    ],
    remember: [
      'Physical memory is divided into zones by address: DMA, DMA32 and Normal.',
      'Free memory is kept in blocks of 2^order frames (orders 0–10), aligned to their size; a block’s buddy is at pfn ^ (1 << order).',
      'Each CPU keeps a list of free frames per zone, refilled in batches (63, doubling up to 2016 here), so most allocations take no shared lock.',
      'The most recently freed frame is the next one handed out on that CPU.',
      'Every frame costs a 64-byte struct page: about 1.6 % of RAM.'
    ],
    sources: [['Linux v6.18: mm/page_alloc.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/page_alloc.c'], ['Linux v6.18: include/linux/mmzone.h', 'https://github.com/torvalds/linux/blob/v6.18/include/linux/mmzone.h'], ['proc(5): /proc/buddyinfo, /proc/pagetypeinfo, /proc/zoneinfo', 'https://man7.org/linux/man-pages/man5/proc.5.html'], ['Linux: vmemmap deduplication (struct page size)', 'https://docs.kernel.org/mm/vmemmap_dedup.html']]
  });

  d('lru', 'LRU lists', 'The kernel’s lists of pages in use, kept roughly in order of last use; reclaim takes pages from the old end. There are five per memory node and per memory cgroup: inactive and active lists for anonymous pages and for file pages, and one for pages that cannot be evicted.');
  d('reclaim', 'page reclaim', 'Freeing frames that hold data so they can be reused: clean file pages are dropped, dirty ones are written back first, and anonymous pages are moved to swap.');
  d('swap', 'swap', 'Space on a disk, or compressed in RAM with zram, where the kernel puts anonymous pages so their frames can be reused. A later access faults and reads the page back.');
  d('watermark', 'watermarks', 'Three thresholds of free pages per zone, min, low and high, that decide when reclaim starts and when it stops.');
  d('kswapd', 'kswapd', 'A kernel thread, one per memory node, that reclaims pages in the background once free memory falls below the low watermark, and sleeps again once it is above the high one.');
  d('directreclaim', 'direct reclaim', 'Reclaim done by the thread that is allocating, when free memory is below the min watermark. The allocation waits until enough pages are freed.');
  d('memcg', 'memory cgroup', 'A group of processes whose memory the kernel counts together and can limit. Each group has its own LRU lists, so reclaim and the out-of-memory killer can act on one group alone.');
  d('oom', 'OOM killer', 'The kernel code that runs when reclaim cannot free enough memory: it picks a process by score and kills it with SIGKILL.');

  /* ---------- III.20 ---------- */
  App.lesson({
    id: 'vm-reclaim', short: 'When memory runs short', title: 'When memory runs short: reclaim and the OOM killer',
    lede: 'When free memory runs low, the kernel takes frames back from the page cache and, if there is swap, from programs. When it cannot, it kills a process.',
    know: ['Every frame comes from the page allocator, which keeps free blocks per zone ([[ch:vm-buddy]]).', 'File pages live in the page cache and can be read again from the file ([[ch:vm-files]]).', 'The CPU sets the A bit on use, and Linux clears it without a TLB flush ([[ch:vm-shootdown]]).'],
    learn: ['Read /proc/meminfo: the LRU lists and swap', 'Say when kswapd and direct reclaim start, from the watermarks', 'Explain the inactive and active lists and how a page moves between them', 'Contain memory pressure in a cgroup, and read an out-of-memory kill'],
    sections: [
      { id: 'kinds', title: 'Which pages can be taken back', body: function (L) {
        L.p('These runs come from machine B. The kernel keeps the pages that hold program data and file contents on lists, by kind and by recent use:', ['lru']);
        L.out('reclaim.meminfo');
        L.p('Anonymous pages hold what programs wrote: heap, stack, private copies. File pages hold file contents, the page cache of [[ch:vm-files]].');
        L.quote('The pages that can be freed at any time, either because they cache the data available elsewhere, for instance, on a hard disk, or because they can be swapped out, again, to the hard disk, are called <em>reclaimable</em>. The most notable categories of the reclaimable pages are page cache and anonymous memory.', { cite: 'Documentation/admin-guide/mm/concepts.rst, “Reclaim”, Linux v6.18', label: 'Linux source' });
        L.p('A clean file page can be dropped at once: the file still holds the data. A dirty one is written back first.', ['reclaim']);
        L.p('An anonymous page has no copy anywhere, so it can only be moved to swap. Machine B has no swap area:', ['swap']);
        L.out('reclaim.swap');
        L.p('The kernel can swap, to a disk or to zram (compressed RAM), but nothing is set up. So on this machine anonymous memory stays in RAM until its program frees it or exits.', [['zram', 'A block device that keeps its data compressed in RAM. Used as swap, it frees frames at the cost of CPU time for compression.']]);
        L.p('Unevictable pages, such as pages locked with <code>mlock()</code>, are never reclaimed. The next question is when reclaim starts.');
      } },
      { id: 'wmarks', title: 'When reclaim starts: watermarks', body: function (L) {
        L.p('Each zone has three thresholds, counted in free pages. [[ch:vm-buddy]] showed them for the Normal zone:', ['watermark']);
        L.out('reclaim.wmark');
        L.quote('… when it reaches a certain threshold (low watermark), an allocation request will awaken the kswapd daemon. It will asynchronously scan memory pages and either just free them if the data they contain is available elsewhere, or evict to the backing storage device […]. As memory usage increases even more and reaches another threshold - min watermark - an allocation will trigger direct reclaim. In this case allocation is stalled until enough memory pages are reclaimed to satisfy the request.', { cite: 'Documentation/admin-guide/mm/concepts.rst, “Reclaim”, Linux v6.18', label: 'Linux source', terms: ['kswapd', 'directreclaim'] });
        L.table(['Mark', 'Free pages', 'Below the mark'], [
          ['high', '10201 (39.8 MiB)', 'kswapd, once awake, keeps reclaiming; above it, kswapd sleeps'],
          ['low', '8501 (33.2 MiB)', 'the next allocation wakes kswapd, which reclaims in the background'],
          ['min', '6801 (26.6 MiB)', 'the allocating thread reclaims pages itself and waits: direct reclaim']
        ], { mono: false });
        L.p('The gaps come from one formula: each step is a quarter of min, or 0.1 % of the zone’s pages, whichever is larger:');
        L.quote('tmp = max_t(u64, tmp >> 2,\n\t    mult_frac(zone_managed_pages(zone),\n\t\t      watermark_scale_factor, 10000));\n…\nzone->_watermark[WMARK_LOW]  = min_wmark_pages(zone) + tmp;\nzone->_watermark[WMARK_HIGH] = low_wmark_pages(zone) + tmp;', { cite: 'mm/page_alloc.c, __setup_per_zone_wmarks(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('Here the quarter is larger: 6801 / 4 = 1700, so low = 8501 and high = 10201. min itself is the zone’s share of <code>vm.min_free_kbytes</code>, split among the zones by size.');
        L.p('Free memory on machine B stayed far above these marks. To watch reclaim without starving the machine, the runs use a memory cgroup with a limit of 64 MiB:', ['memcg']);
        L.out('reclaim.limit');
        L.quote('Each cgroup maintains a per cgroup LRU which has the same structure as global VM. When a cgroup goes over its limit, we first try to reclaim memory from the cgroup so as to make space for the new pages that the cgroup has touched.', { cite: 'Documentation/admin-guide/cgroup-v1/memory.rst, §2.5 Reclaim, Linux v6.18', label: 'Linux source' });
        L.p('So the same reclaim code runs on the cgroup’s own lists as soon as its usage reaches 64 MiB. The next section looks at those lists.');
      } },
      { id: 'lists', title: 'Two lists: inactive and active', body: function (L) {
        L.p('This kernel is built without the newer multi-generation LRU (<code>CONFIG_LRU_GEN</code> above), so each kind of page has two lists. The kernel’s comment describes them:');
        L.quote(' * Per node, two clock lists are maintained for file pages: the\n * inactive and the active list.  Freshly faulted pages start out at\n * the head of the inactive list and page reclaim scans pages from the\n * tail.  Pages that are accessed multiple times on the inactive list\n * are promoted to the active list, to protect them from reclaim,\n * whereas active pages are demoted to the inactive list when the\n * active list grows too big.\n *\n *   fault ------------------------+\n *                                 |\n *              +--------------+   |            +-------------+\n *   reclaim <- |   inactive   | <-+-- demotion |    active   | <--+\n *              +--------------+                +-------------+    |\n *                     |                                           |\n *                     +-------------- promotion ------------------+', { cite: 'mm/workingset.c, “Double CLOCK lists”, Linux v6.18 (excerpt)', label: 'Linux source', code: true, wide: true });
        L.p('A page read with <code>read()</code> moves one step each time it is read:');
        L.quote(' * * inactive,unreferenced  ->  inactive,referenced\n * * inactive,referenced    ->  active,unreferenced\n * * active,unreferenced    ->  active,referenced', { cite: 'mm/swap.c, folio_mark_accessed(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('Before the runs, the script empties the page cache, so every file is read from disk into fresh pages:');
        L.code('sync; echo 1 > /proc/sys/vm/drop_caches', { lang: 'sh', title: 'labruns/vm/reclaim.sh' });
        L.p('Writing 1 drops clean page-cache pages; <code>sync</code> first writes dirty ones back. The kernel documentation calls it a tool for testing and debugging, not a way to manage memory.');
        L.p('Now a process in the cgroup reads a 16 MiB file, and a second process reads it again. The cgroup’s <code>memory.stat</code> counts its lists in bytes:');
        L.out('reclaim.twice');
        L.p('After the first read the file’s 16 MiB sit on the inactive list, each page marked referenced. The second read moved all of them to the active list.');
        L.p('That second read is what protects them from the next run.');
      } },
      { id: 'stream', title: 'A read four times the limit', body: function (L) {
        L.p('The same cgroup now reads a 256 MiB file once, four times its limit:');
        L.out('reclaim.stream');
        L.p('Usage peaked just under 64 MiB and hit the limit 834 times; each time, the kernel reclaimed pages from the cgroup’s inactive list. The 256 MiB passed through that list, and the active list kept 15.8 of its 16.1 MiB.');
        L.p('New pages enter the inactive list, and active pages are moved back only when the inactive list gets too short:');
        L.quote(' * The inactive_ratio is the target ratio of ACTIVE to INACTIVE folios\n * on this LRU, maintained by the pageout code. An inactive_ratio\n * of 3 means 3:1 or 25% of the folios are kept on the inactive list.\n *\n * total     target    max\n * memory    ratio     inactive\n * -------------------------------------\n *   10MB       1         5MB\n *  100MB       1        50MB\n *    1GB       3       250MB\n…\n\treturn inactive * inactive_ratio < active;', { cite: 'mm/vmscan.c, inactive_is_low(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('The cgroup’s lists hold 64 MiB, so the ratio is 1: the active list may be as large as the inactive one. With 47.8 MiB inactive against 15.8 MiB active it was barely touched, so the file read once did not push out the file read twice.');
        L.p('The machine-wide counters in <code>/proc/vmstat</code> stayed at 0. Reclaim inside a cgroup counts its kswapd and direct numbers only in the cgroup:');
        L.quote('item = PGSCAN_KSWAPD + reclaimer_offset(sc);\nif (!cgroup_reclaim(sc))\n\t__count_vm_events(item, nr_scanned);\ncount_memcg_events(lruvec_memcg(lruvec), item, nr_scanned);', { cite: 'mm/vmscan.c, shrink_inactive_list(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('kswapd’s own reclaim is always counted there, so <code>pgscan_kswapd 0</code> also shows kswapd never ran. Try the two schemes side by side:');
        L.try('One list or two', 'Eight frames of page cache. Read the small file’s pages a, b and c twice, then stream the big file through, with one list or with two. The rules are the ones quoted above.', function (el) { LW().lrusim(el, {}); });
        L.p('Pages read with <code>read()</code> are marked by the kernel itself. Mapped pages need another signal.');
      } },
      { id: 'abit', title: 'Mapped pages: the A bit', body: function (L) {
        L.p('A program reads a mapped page with plain loads, and the kernel sees nothing. What it has is the A bit, which the CPU sets in the page-table entry on use ([[ch:vm-pte]]).');
        L.p('Reclaim reads and clears the A bit in every entry that maps the page:');
        L.quote('} else if (pvmw.pte) {\n\tif (ptep_clear_flush_young_notify(vma, address,\n\t\t\t\tpvmw.pte))\n\t\treferenced++;', { cite: 'mm/rmap.c, folio_referenced_one(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('On x86 this clear does not flush the TLB, as [[ch:vm-shootdown]] measured, so a page in use can look unused for a while. The decision looks twice:');
        L.quote('/*\n * All mapped folios start out with page table\n * references from the instantiating fault, so we need\n * to look twice if a mapped file/anon folio is used more\n * than once.\n *\n * Mark it and spare it for another trip around the\n * inactive list.  Another page table reference will\n * lead to its activation.', { cite: 'mm/vmscan.c, folio_check_references(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('A mapped page whose A bit stayed clear since the last scan is reclaimed: a file page is unmapped and dropped, an anonymous page is written to swap. Mapped program code is activated after its first use.');
        L.quote('/* If we have no swap space, do not bother scanning anon folios. */', { cite: 'mm/vmscan.c, get_scan_count(), Linux v6.18', label: 'Linux source', code: true });
        L.p('With no swap, as on machine B, the anonymous lists are not scanned at all.');
        L.note('arm', 'Arm’s access flag (AF) plays the role of the A bit. When arm64 clears it, it does send a TLB invalidation but does not wait for it to finish: the comment in <code>__ptep_clear_flush_young()</code> (arch/arm64/include/asm/pgtable.h) says the worst case is reclaiming a page that is still in use, until the next context switch completes the invalidation.');
      } },
      { id: 'oom', title: 'When nothing can be freed: the OOM killer', body: function (L) {
        L.p('The last run writes 128 MiB of anonymous memory from inside the cgroup. With no swap, none of it can be reclaimed:', ['oom']);
        L.out('reclaim.oom', { wide: true });
        L.p('At about 64 MiB the cgroup had nothing left to reclaim, and the kernel killed the program. Exit status 137 is the shell’s 128 + 9: killed by signal 9, SIGKILL.');
        L.quote('If the reclaim is unsuccessful, an OOM routine is invoked to select and kill the bulkiest task in the cgroup.', { cite: 'Documentation/admin-guide/cgroup-v1/memory.rst, §2.5 Reclaim, Linux v6.18', label: 'Linux source' });
        L.p('“Bulkiest” is a score: resident pages, swap entries and page-table pages, adjusted by the process’s <code>oom_score_adj</code>:');
        L.quote('/*\n * The baseline for the badness score is the proportion of RAM that each\n * task\'s rss, pagetable and swap space use.\n */\npoints = get_mm_rss(p->mm) + get_mm_counter(p->mm, MM_SWAPENTS) +\n\tmm_pgtables_bytes(p->mm) / PAGE_SIZE;', { cite: 'mm/oom_kill.c, oom_badness(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('The kernel log line prints those inputs for <code>eat</code>: anon-rss 65152 kB and pgtables 168 kB. Machine-wide, <code>oom_kill</code> went up by 1 and nothing was reclaimed.');
        L.quote('It is possible that on a loaded machine memory will be exhausted and the kernel will be unable to reclaim enough memory to continue to operate. In order to save the rest of the system, it invokes the <em>OOM killer</em>.', { cite: 'Documentation/admin-guide/mm/concepts.rst, “OOM killer”, Linux v6.18', label: 'Linux source' });
        L.p('To check A bits, reclaim visits every entry that maps a frame. The next lesson looks at one frame mapped at several addresses.');
      } }
    ],
    check: [
      { q: 'A 16 MiB file is read once with read(). Where are its pages?', options: ['On the inactive list, marked referenced', 'On the active list, marked referenced', 'On the unevictable list', 'Not in memory: read() skips the page cache'], answer: 0, why: 'folio_mark_accessed(): inactive,unreferenced → inactive,referenced. The second read moves them to the active list.' },
      { q: 'Free pages in a zone fall below the low watermark but stay above min. What happens?', options: ['kswapd wakes and reclaims in the background', 'The allocating thread stops and reclaims pages itself', 'The OOM killer picks a process', 'Nothing happens until free pages reach 0'], answer: 0, why: 'Below low, an allocation wakes kswapd. Direct reclaim starts only below min.' },
      { q: 'Why did reading 256 MiB in a 64 MiB cgroup leave the twice-read file in memory?', options: ['Pages enter the inactive list; the active list was the smaller one', 'The cgroup limit applies only to anonymous memory', 'The 256 MiB file bypassed the page cache', 'kswapd moved the small file to swap first'], answer: 0, why: 'With a ratio of 1, active pages are moved back only while the active list is larger than the inactive one: 15.8 MiB against 47.8 MiB.' },
      { q: 'Machine B has no swap. Which pages can reclaim free?', options: ['File pages: clean ones at once, dirty ones after writeback', 'Any page whose A bit is clear', 'Anonymous pages, by zeroing them', 'Only pages on the unevictable list'], answer: 0, why: 'Anonymous pages have no other copy; without swap they stay until their program frees them or is killed, as the last run showed.' }
    ],
    remember: [
      'Reclaim frees frames that hold data: clean file pages are dropped, dirty ones written back first; anonymous pages need swap.',
      'Below the low watermark kswapd reclaims in the background; below min the allocating thread reclaims itself and waits.',
      'Pages enter the inactive list and are promoted on a second use, so a large file read once passes through without pushing out pages used twice.',
      'For mapped pages the signal is the A bit, which reclaim clears (on x86 without a TLB flush) and checks twice.',
      'When nothing more can be reclaimed, the OOM killer kills the process with the highest score (resident, swap and page-table pages), in the cgroup or on the whole machine.'
    ],
    sources: [['Linux v6.18: mm/vmscan.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/vmscan.c'], ['Linux v6.18: mm/workingset.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/workingset.c'], ['Linux v6.18: mm/swap.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/swap.c'], ['Linux v6.18: mm/oom_kill.c', 'https://github.com/torvalds/linux/blob/v6.18/mm/oom_kill.c'], ['Linux: Concepts overview (reclaim, OOM killer)', 'https://docs.kernel.org/admin-guide/mm/concepts.html'], ['Linux: Memory Resource Controller (cgroup v1)', 'https://docs.kernel.org/admin-guide/cgroup-v1/memory.html'], ['Linux: /proc/sys/vm (drop_caches, min_free_kbytes, watermark_scale_factor)', 'https://docs.kernel.org/admin-guide/sysctl/vm.html']]
  });
})();
