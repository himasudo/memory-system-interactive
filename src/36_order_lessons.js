/* ======================= Part V · stores, ordering and coherence (V.01–V.04, V.06–V.09) ======================= */
(function () {
  'use strict';
  var d = App.gloss;
  d('visible', 'globally visible', 'A store is globally visible once every other core that reads the address would get the new value. On x86 that happens when the store commits from the store buffer into the L1d.');
  d('owner', 'owning a line', 'Holding the only valid copy of a line, with permission to write it (M or E). A store can commit only to a line its core owns.');
  d('wcbuf', 'write-combining buffer', 'A small buffer that gathers the bytes of non-temporal or WC stores to one line and sends the whole line to memory at once.');
  d('progorder', 'program order', 'The order of loads and stores in the instruction stream of one thread. Memory models say which of these orders other cores are guaranteed to see.');
  d('litmus', 'litmus test', 'A tiny multi-threaded program whose possible results show what a memory model allows, such as both threads reading 0 in the store-buffering test.');
  d('acqrel', 'acquire and release', 'A release store makes everything written before it visible before itself; an acquire load makes everything after it wait until it has read. Together they hand data from one thread to another.');
  d('swmr', 'single writer or many readers', 'The coherence rule: at any moment a line has either one core allowed to write it, or any number allowed only to read it, never both.');
  d('snoop', 'snooping', 'Coherence by broadcast: every request is shown to every cache, which checks its own tags. Simple, but the traffic grows with the number of cores.');
  d('directory', 'directory', 'Coherence by bookkeeping: a structure records which caches may hold each line, so requests go only to them. Shadow tags and snoop filters are directories.');
  d('hitm', 'HITM', 'Hit Modified: a load whose line was Modified in another core’s cache, so the data had to come from that cache. perf c2c counts HITMs per line to find lines that move between cores.');
  d('padding', 'padding to a line', 'Placing data that different threads write in different 64-byte lines, for example with alignas(64), so their writes do not move the same line between cores.');
  App.setCategory('visible owner progorder litmus acqrel', 'order');
  App.setCategory('wcbuf', 'order');
  App.setCategory('swmr snoop directory padding hitm', 'coh');
  var TSO = ['Sewell et al., x86-TSO: A Rigorous and Usable Programmer’s Model for x86 Multiprocessors (CACM 2010)', 'https://www.cl.cam.ac.uk/~pes20/weakmemory/cacm.pdf'];
  var SDM = ['Intel SDM Vol. 3A, ch. 10 “Memory ordering”', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html'];
  var PRIMER = ['Nagarajan, Sorin, Hill and Wood, A Primer on Memory Consistency and Cache Coherence, 2nd ed. (2020)', 'https://doi.org/10.1007/978-3-031-01764-3'];
  var KMB = ['Linux kernel memory barriers (memory-barriers.txt)', 'https://docs.kernel.org/core-api/wrappers/memory-barriers.html'];
  var DREPPER = ['Ulrich Drepper, What Every Programmer Should Know About Memory (2007)', 'https://www.akkadia.org/drepper/cpumemory.pdf'];
  var ARMMM = ['Arm, Learn the architecture: Memory Systems, Ordering, and Barriers (102336)', 'https://developer.arm.com/documentation/102336/latest'];

  /* ---------- V.01 ---------- */
  App.lesson({
    id: 'st-visible', short: 'When a store becomes visible', title: 'When a store becomes visible',
    lede: 'A store is finished for its core long before other cores can see it. It becomes visible only when it leaves the store buffer and writes a line the core owns.',
    know: ['A store waits in the store queue until it retires, then commits ([[ch:cpu-lsq]]).', 'The L1d is write-back: a store changes the cached line and marks it dirty ([[ch:cache-writes]]).'],
    learn: ['List the steps between a store executing and another core seeing it', 'Explain why a core needs to own a line before a store can commit to it', 'Say why the store buffer exists, and what it costs'],
    sections: [
      { id: 'steps', title: 'Four moments of one store', body: function (L) {
        L.p('Follow iteration 1’s store to <code>hist[123]</code> through the pipeline model of [[ch:core]]. It passes four moments:');
        L.table(['Moment', 'Cycle in the model', 'Who can see the new value'], [
          ['executes: STA and STD fill the store-queue entry', 'cycles 13 and 18', 'only younger loads of the same core, by forwarding'],
          ['retires: now certain to happen', 'cycle 20', 'still only this core'],
          ['commits: written into the L1d line', 'cycle 21', 'every core that reads the address from now on'],
          ['written back to the L2 and DRAM', 'when the line is evicted', 'nobody new: they already could']
        ], { mono: false, terms: ['visible'] });
        L.p('So the moment that matters to other cores is the commit, not the execution and not the write-back to memory.');
      } },
      { id: 'own', title: 'Committing needs the line, owned', body: function (L) {
        L.p('A commit writes 8 bytes into a cached line. That needs two things: the line must be in the L1d, and this core must hold the only writable copy.', ['owner']);
        L.p('If another core still has a copy, the commit must wait until that copy has been removed. Otherwise two cores would hold different values for one address ([[ch:coh-why]]).');
        L.p('In the model, iteration 1’s store commits in cycle 21, one cycle after it retires, because the line is already in the L1d and no other core has it. With another core holding the line, the commit would wait for a round trip of messages ([[ch:coh-probe]]).');
      } },
      { id: 'buffer', title: 'Why the store buffer exists', body: function (L) {
        L.p('Getting a line and its ownership can take hundreds of cycles. If a core stopped at every such store, it would spend most of its time waiting.');
        L.p('Instead, retired stores wait in the store buffer, the same store queue, as senior stores. The core keeps running loads and new stores behind them.', ['senior']);
        L.p('The price is a gap. Between retiring and committing, this core already behaves as if the store happened, while other cores still see the old value. The next lessons show what that gap allows.');
      } },
      { id: 'drain', title: 'One at a time, in order', body: function (L) {
        L.p('On x86, senior stores commit strictly in program order, one after another. A store whose line is missing holds up every store behind it.');
        L.p('When the store buffer is full, the next store cannot be given an entry, and the front end stops until one frees. Code that writes a lot of memory its core does not own, such as filling a fresh buffer, can hit this limit. The next lesson shows the extra traffic those stores cause.');
      } }
    ],
    check: [
      { q: 'When can another core first see iteration 1’s new value of hist[123]?', options: ['When the store commits into the L1d', 'When STD executes', 'When the line is written back to DRAM', 'When the instruction is decoded'], answer: 0, why: 'Before commit, the value lives only in this core’s store buffer; after it, any core reading the line gets it.' },
      { q: 'What must hold before a store can commit?', options: ['The line is in the L1d and this core owns it', 'The line has been written back', 'The store has been forwarded to a load', 'Every other core has retired its stores'], answer: 0, why: 'Commit writes the cached line, so the core needs the line and the only writable copy.' },
      { q: 'Why do cores have a store buffer at all?', options: ['So the core keeps running while stores wait for their lines and ownership', 'To make stores visible sooner', 'To store data that does not fit in the L1d', 'To translate store addresses'], answer: 0, why: 'Waiting for ownership can take hundreds of cycles; the buffer hides that, at the price of the visibility gap.' }
    ],
    remember: [
      'A store executes, retires, then commits; only the commit makes it visible to other cores.',
      'Commit needs the line in the L1d, owned by this core.',
      'The store buffer lets the core run on while stores wait; between retire and commit only this core sees the new value.',
      'x86 commits stores in program order; a full store buffer stops the core.'
    ],
    sources: [SDM, TSO]
  });

  /* ---------- V.02 ---------- */
  App.lesson({
    id: 'st-rfo', short: 'RFO and non-temporal stores', title: 'Owning a line before writing it: RFO and non-temporal stores',
    lede: 'Writing 8 bytes to a line the core does not have first reads all 64 bytes, with ownership. Non-temporal stores skip that read, at the cost of ordering.',
    know: ['A store commits only to a line its core owns ([[ch:st-visible]]).', 'Write-allocate and write-back ([[ch:cache-writes]]).'],
    learn: ['Explain a read for ownership and why stores read memory', 'Count the traffic of filling a buffer with normal and with non-temporal stores', 'Say when non-temporal stores help and what they require'],
    sections: [
      { id: 'rfo', title: 'A store miss reads the line', body: function (L) {
        L.p('A store to a line that is not in the L1d cannot commit. The core sends a read for ownership: get the line, and make every other copy invalid.', ['rfo']);
        L.p('The whole 64 bytes come back, although the store will overwrite only 8 of them. The rest must be correct, because the line will later be written back whole.');
      } },
      { id: 'traffic', title: 'Filling a buffer costs twice', body: function (L) {
        L.p('Take a program that fills a 4 MiB buffer it has not used before, with ordinary stores. Each of its 65,536 lines is read from DRAM by an RFO, written, and later evicted and written back.');
        L.table(['Stores', 'Read from DRAM', 'Written to DRAM', 'Caches afterwards'], [
          ['normal stores', '4 MiB (the RFOs)', '4 MiB (write-backs)', 'hold much of the buffer; other data evicted'],
          ['non-temporal stores', 'nothing', '4 MiB', 'untouched']
        ], { mono: false, title: 'Filling 4 MiB that is not in any cache' });
        L.p('Twice the traffic for the same work, and every line of the buffer passes through the caches, pushing out data that might have been used again.');
      } },
      { id: 'nt', title: 'Non-temporal stores', body: function (L) {
        L.p('x86 has stores that skip the cache: <code>movnti</code>, <code>movntdq</code> and others. Their bytes collect in a write-combining buffer; a full 64-byte line goes to memory in one write, with no read before it.', ['nt', 'wcbuf']);
        L.p('They are worth it for a buffer much larger than the caches that will not be read again soon. If the data is read again right away, normal stores win, because the data is then already in the cache.');
      } },
      { id: 'order', title: 'The catch: weaker ordering', body: function (L) {
        L.p('Non-temporal stores do not keep program order with other stores. A thread that writes a buffer with them and then sets a flag must make sure the buffer is visible first.');
        L.code('for (i = 0; i < n; i++) _mm_stream_si64(&buf[i], v);         /* movnti */\n_mm_sfence();                                               /* the buffer’s stores become visible first */\natomic_store_explicit(&ready, 1, memory_order_release);     /* then the flag */', { title: 'publishing a buffer written with non-temporal stores' });
        L.p('<code>sfence</code> makes every earlier store, these included, visible before any later one. Normal stores on x86 never need it ([[ch:ord-tso]]).', ['fence']);
        L.note('other', 'A page’s memory type decides how all of its stores behave: write-back for ordinary memory, write-combining or uncached for device memory. [[ch:io-mmio]] covers memory types.', 'Memory types');
      } }
    ],
    check: [
      { q: 'A store writes 8 bytes to a line no cache holds. What does the core read from DRAM first?', options: ['The whole 64-byte line, with ownership', 'Nothing', 'Only the 8 bytes', 'The page table'], answer: 0, why: 'The line must be complete and owned before the store commits, because it will be written back whole.' },
      { q: 'Why can filling a fresh buffer with normal stores move twice its size through DRAM?', options: ['Each line is read by an RFO and later written back', 'Each store is written twice', 'The cache line is 128 bytes', 'Because of refresh'], answer: 0, why: 'Read for ownership, then write-back on eviction: once in, once out.' },
      { q: 'A thread writes a buffer with movnti and then sets ready = 1. What must come between?', options: ['sfence', 'Nothing on x86', 'lfence', 'A cache flush of the flag'], answer: 0, why: 'Non-temporal stores are weakly ordered; sfence makes them visible before the flag.' }
    ],
    remember: [
      'A store miss sends a read for ownership: the whole line comes in, other copies are invalidated.',
      'Filling memory with normal stores reads and writes every line: twice the traffic, and the caches fill up.',
      'Non-temporal stores gather full lines and write them without reading; use them for data not read again soon.',
      'They are weakly ordered: sfence before publishing them.'
    ],
    sources: [SDM, DREPPER]
  });

  /* ---------- V.03 ---------- */
  App.lesson({
    id: 'ord-tso', short: 'What order others see', title: 'What order other cores see',
    lede: 'Each core sees its own memory accesses in program order. Other cores may not: on x86, a load can appear to run before an older store. Machine C shows it 50,650 times in 2 million runs.',
    know: ['Stores wait in the store buffer between retiring and committing ([[ch:st-visible]]).', 'A load checks older stores of its own core first ([[ch:cpu-lsq]]).'],
    learn: ['Tell coherence (one address) from ordering (two addresses)', 'Name the one reordering x86 allows, and read the store-buffering litmus test', 'Say why message passing works on x86 without fences, and why Arm needs more'],
    sections: [
      { id: 'two', title: 'Two addresses', body: function (L) {
        L.p('Coherence, Part V’s second half, keeps each single address consistent: all cores agree on the order of writes to it.');
        L.p('Ordering is about two addresses. A thread writes <code>x</code>, then reads <code>y</code>. Can another core see the read happen before the write? The memory model of the processor answers.', ['progorder']);
        L.p('There are four pairs: load then load, load then store, store then store, store then load. A model says which pairs keep their program order as seen by other cores.');
      } },
      { id: 'tso', title: 'x86 keeps all but one', body: function (L) {
        L.p('x86 keeps three of the four: loads stay in order with loads, stores with stores, and a load with a later store.', ['tso']);
        L.p('The fourth is the store buffer’s gap. A store sits in the buffer while a later load, to another address, reads the cache. To other cores the load happened first.');
        L.table(['Earlier → later', 'Kept on x86?'], [
          ['load → load', 'yes'],
          ['load → store', 'yes'],
          ['store → store', 'yes'],
          { cells: ['store → load (different addresses)', 'no: the store can still be in the store buffer'], hot: true }
        ], { mono: false });
      } },
      { id: 'sb', title: 'The store-buffering test', body: function (L) {
        L.p('A litmus test makes this visible. Two threads, two variables, both 0 at the start:', ['litmus']);
        L.code('thread 0:  x = 1;  r0 = y;\nthread 1:  y = 1;  r1 = x;', { lang: 'text', title: 'the store-buffering litmus test' });
        L.p('If each store were visible before the next load ran, at least one thread would read 1. Machine C runs it 2 million times on two CPUs:');
        L.out('c.sb', { lines: [0, 1, 2, 3, 4] });
        L.p('50,650 times both threads read 0. Each store was still in its core’s store buffer when the other core’s load read the cache.');
        L.out('c.sb', { lines: [5, 6], what: 'The same test with mfence between each store and the load after it.' });
        L.p('With <code>mfence</code> between the store and the load, the outcome never appears: the load waits until the store buffer has drained. The next lesson is about fences.');
      } },
      { id: 'mp', title: 'Message passing needs nothing on x86', body: function (L) {
        L.p('The common pattern is different: one thread writes data, then a flag; another reads the flag, then the data.');
        L.code('thread 0:  data = 42;  ready = 1;\nthread 1:  if (ready) use(data);     /* must see 42 */', { lang: 'text', title: 'message passing' });
        L.p('That needs store → store order on one side and load → load order on the other. x86 keeps both, so it works without any fence instruction. In C the variables must still be atomics, or the compiler may reorder them itself ([[ch:ord-fence]]).');
        L.note('arm', 'Arm’s memory model keeps none of the four orders between plain accesses to different addresses, unless one depends on the other (for example, the second address is computed from the first load’s value). Message passing there needs a release store for the flag and an acquire load to read it, or barriers.');
      } }
    ],
    check: [
      { q: 'Which reordering does x86 allow?', options: ['A load appearing before an older store to another address', 'A store appearing before an older store', 'A load appearing before an older load', 'None at all'], answer: 0, why: 'Stores wait in the store buffer; a later load to a different address can read the cache first.' },
      { q: 'In the store-buffering test both threads read 0. How?', options: ['Each store was still in its own core’s store buffer when the other core’s load ran', 'The caches lost the stores', 'The compiler removed the stores', 'The threads ran one after the other'], answer: 0, why: 'Neither store had committed yet, so each load read the old value from the cache.' },
      { q: 'Does message passing (data, then flag) need a fence instruction on x86?', options: ['No: stores stay in order with stores, and loads with loads', 'Yes: an mfence on both sides', 'Yes: an sfence before reading', 'Only on Intel, not AMD'], answer: 0, why: 'Only store → load order is relaxed on x86, and message passing does not depend on it.' }
    ],
    remember: [
      'Coherence is about one address; ordering is about the order of accesses to different addresses.',
      'x86 keeps load→load, load→store and store→store order; a later load can pass an older store.',
      'Machine C shows the store-buffering result 50,650 times in 2 million runs, and never with a fence.',
      'Message passing works on x86 without fences; Arm needs release and acquire.'
    ],
    sources: [TSO, SDM, ARMMM]
  });

  /* ---------- V.04 ---------- */
  App.lesson({
    id: 'ord-fence', short: 'Fences and atomics', title: 'Fences and atomic instructions',
    lede: 'A fence makes a core wait until its earlier stores are visible. A locked instruction reads, changes and writes a line as one step, and fences too. Both cost time.',
    know: ['The store-buffering reordering and the litmus test ([[ch:ord-tso]]).', 'Owning a line, and RFO ([[ch:st-rfo]]).'],
    learn: ['Say what mfence, sfence, lfence and a lock prefix do', 'Explain why gcc and Linux use a locked add instead of mfence', 'Map C11 atomics onto x86 and Arm instructions, and read what an atomic costs on machine C'],
    sections: [
      { id: 'fences', title: 'Three fences', body: function (L) {
        L.table(['Instruction', 'Effect'], [
          ['<code>mfence</code>', 'later loads wait until every earlier store is visible: the store buffer drains'],
          ['<code>sfence</code>', 'earlier stores, non-temporal ones included, become visible before later stores'],
          ['<code>lfence</code>', 'later instructions wait until earlier ones are done locally; used against speculation']
        ], { mono: false, terms: ['fence'] });
        L.p('For ordinary memory on x86 only <code>mfence</code> matters: it closes the one gap the model leaves. In the store-buffering test it brought both-read-0 down from 50,650 to none.');
      } },
      { id: 'lock', title: 'Locked instructions', body: function (L) {
        L.p('A <code>lock</code> prefix makes a read-modify-write atomic: the core takes the line in owned state, reads, changes and writes it, and no other core can touch the line in between.', ['i_lock']);
        L.p('A locked instruction is also a full fence: the store buffer drains before it. So it can replace <code>mfence</code>. Linux does exactly that for its full barrier on x86:');
        L.quote('#define __smp_mb()\tasm volatile("lock addl $0,-4(%%" _ASM_SP ")" ::: "memory", "cc")', { code: true, label: 'Linux source', cite: 'arch/x86/include/asm/barrier.h, Linux v6.18' });
        L.p('Adding 0 to a word just below the stack pointer changes nothing; the lock does the work. gcc 13 on machine C compiles a C11 <code>atomic_thread_fence(memory_order_seq_cst)</code> the same way, to <code>lock orq $0,(%rsp)</code>. The store-buffering test with that instruction between store and load:');
        L.out('c.sb', { lines: [7, 8] });
      } },
      { id: 'c11', title: 'C atomics on x86 and on Arm', body: function (L) {
        L.p('Programs should not write fences by hand. C11 atomics name the order they need, and the compiler picks instructions:', ['acqrel']);
        L.table(['C11 operation', 'x86-64', 'AArch64'], [
          ['load, memory_order_acquire', 'plain <code>mov</code>', '<code>ldar</code>'],
          ['store, memory_order_release', 'plain <code>mov</code>', '<code>stlr</code>'],
          ['store, memory_order_seq_cst', '<code>xchg</code> (or <code>mov</code> + <code>mfence</code>)', '<code>stlr</code>'],
          ['fetch_add', '<code>lock xadd</code> (<code>lock add</code> if the result is unused)', '<code>ldadd</code>, or a load-exclusive/store-exclusive loop'],
          ['fence, seq_cst', '<code>mfence</code> or a locked instruction', '<code>dmb ish</code>']
        ], { mono: false });
        L.p('On x86 acquire and release cost nothing extra, because TSO already gives those orders. Linux’s x86 release store is a plain store with only a compiler barrier:');
        L.quote('#define __smp_store_release(p, v)\t\t\t\t\t\\\ndo {\t\t\t\t\t\t\t\t\t\\\n\tcompiletime_assert_atomic_type(*p);\t\t\t\t\\\n\tbarrier();\t\t\t\t\t\t\t\\\n\tWRITE_ONCE(*p, v);\t\t\t\t\t\t\\\n} while (0)', { code: true, label: 'Linux source', cite: 'arch/x86/include/asm/barrier.h, Linux v6.18' });
        L.note('careful', 'The compiler may reorder, merge or remove plain memory accesses. Even on x86, data shared between threads must be accessed through atomics (or, in the kernel, helpers such as READ_ONCE and WRITE_ONCE), not through plain variables.');
      } },
      { id: 'cost', title: 'What an atomic costs', body: function (L) {
        L.p('One thread on machine C adds 1 to a counter 20 million times, once with a plain increment and once with <code>lock add</code>:');
        L.out('c.falseshare', { lines: [0, 1, 4], what: 'falseshare.c, one thread: a plain and an atomic increment of a counter no one else touches.' });
        L.p('The plain increments run back to back. Each locked one must drain the store buffer and finish its read-modify-write before later memory accesses go on: about 17 times longer, with no other core involved at all.');
        L.p('With another core writing the same line, it gets far worse: [[ch:coh-false]] measures it.');
      } }
    ],
    check: [
      { q: 'Which x86 fence closes the store → load gap?', options: ['mfence', 'sfence', 'lfence', 'None is needed'], answer: 0, why: 'mfence makes later loads wait until earlier stores are visible.' },
      { q: 'Why does Linux implement its full barrier on x86 as lock addl $0,-4(%rsp)?', options: ['A locked instruction is a full fence and is usually cheaper than mfence', 'mfence does not exist on x86-64', 'It also clears the stack', 'It flushes the caches'], answer: 0, why: 'Adding 0 changes nothing; the lock prefix drains the store buffer and orders everything around it.' },
      { q: 'What does a C11 release store compile to on x86-64?', options: ['A plain mov', 'xchg', 'mov + mfence', 'lock add'], answer: 0, why: 'TSO already keeps earlier loads and stores before a later store, so no extra instruction is needed.' }
    ],
    remember: [
      'mfence drains the store buffer before later loads; sfence orders non-temporal stores; lfence is for speculation.',
      'A lock prefix makes a read-modify-write atomic on an owned line, and acts as a full fence.',
      'On x86, acquire and release are plain moves; seq_cst stores and fences need xchg, mfence or a locked instruction.',
      'On machine C an uncontended atomic increment takes 4.7 ns against 0.27 ns for a plain one.'
    ],
    sources: [SDM, KMB, ARMMM]
  });

  /* ---------- V.06 ---------- */
  App.lesson({
    id: 'coh-why', short: 'Coherence: one value per address', title: 'Coherence: one value per address',
    lede: 'Each core caches its own copies. Coherence is the rule that keeps them from disagreeing: at any moment, one core may write a line, or many may read it.',
    know: ['Each core has a private L1d and L2 ([[ch:cache-levels]]).', 'A store commits only to a line its core owns ([[ch:st-visible]]).'],
    learn: ['Show how private caches could return stale data without coherence', 'State the single-writer-or-many-readers rule', 'Say what a core must do before writing a line others hold'],
    sections: [
      { id: 'stale', title: 'Two copies, one write', body: function (L) {
        L.p('Cores 0 and 1 have both read <code>hist[123]</code>: each has the line in its L1d, with the value 41.');
        L.p('Core 1 adds 1 and writes 42 into its copy. If nothing else happened, core 0 would keep reading 41 from its own copy until the line happened to be evicted.', ['coh']);
        L.p('No program could work that way. Every core must see one value per address, and see every address’s writes in one order.');
      } },
      { id: 'rule', title: 'One writer or many readers', body: function (L) {
        L.p('Hardware keeps one rule, per line, at every moment: either exactly one core may write the line, or any number of cores may read it, but never both at once.', ['swmr']);
        L.p('So before core 1 may write, core 0’s copy must go: core 1 sends a request, and every other copy is invalidated. Then core 1 holds the only copy and writes it.');
        L.p('When core 0 next reads <code>hist[123]</code>, it misses, and gets the line with 42 from core 1.');
      } },
      { id: 'line', title: 'It works on whole lines', body: function (L) {
        L.p('The rule is kept per 64-byte line, not per variable. Two variables in one line are one unit for coherence, even when no thread uses both. [[ch:coh-false]] shows what that costs.');
        L.p('It also says nothing about the order of different lines. That was ordering, [[ch:ord-tso]]; coherence only promises that each line on its own behaves like one copy.');
      } },
      { id: 'cost', title: 'What it costs', body: function (L) {
        L.p('Reads of data that no one writes cost nothing extra: many readers may share a line forever.');
        L.p('A write to a shared line costs messages: a request, invalidations, answers. A line written by several cores in turn moves from core to core, a cache-to-cache transfer each time.');
        L.p('The next lesson names the states a cache keeps for each line to track all this.');
      } }
    ],
    check: [
      { q: 'Cores 0 and 1 both hold hist[123]’s line. Core 1 wants to write it. What must happen first?', options: ['Core 0’s copy is invalidated', 'Core 0 writes it back to DRAM', 'Both copies are updated at once', 'Nothing'], answer: 0, why: 'One writer or many readers: to become the writer, core 1 must hold the only copy.' },
      { q: 'At what size does coherence work?', options: ['Whole 64-byte lines', 'Single bytes', 'Variables', '4 KiB pages'], answer: 0, why: 'Caches track lines, so every line is one unit for the rule, whatever variables it holds.' },
      { q: 'Does coherence say in which order other cores see writes to two different lines?', options: ['No: that is the memory model, ordering', 'Yes, always program order', 'Yes, the order of the addresses', 'Only for atomics'], answer: 0, why: 'Coherence keeps each line consistent on its own; ordering between lines is a separate set of rules.' }
    ],
    remember: [
      'Without coherence, private caches would keep stale copies.',
      'Per line, at any moment: one writer, or many readers, never both.',
      'Writing a shared line first invalidates every other copy.',
      'Coherence works on whole lines and says nothing about ordering between lines.'
    ],
    sources: [PRIMER]
  });

  /* ---------- V.07 ---------- */
  App.lesson({
    id: 'coh-mesi', short: 'MESI and MOESI', title: 'MESI and MOESI, state by state',
    lede: 'Each cache keeps a state for each line it holds. Five states are enough to keep the rule and to avoid most messages.',
    know: ['One writer or many readers, per line ([[ch:coh-why]]).', 'Dirty lines and write-back ([[ch:cache-writes]]).'],
    learn: ['Name the MESI states and what each allows', 'Explain what MOESI’s Owned state saves', 'Follow one line through seven operations on four cores'],
    sections: [
      { id: 'mesi', title: 'Four states', body: function (L) {
        L.p('A cache stores a few bits per line that say what it may do with the line:');
        L.table(['State', 'Other copies?', 'Newer than memory?', 'May write without asking?'], [
          ['M, Modified', 'none', 'yes', 'yes'],
          ['E, Exclusive', 'none', 'no', 'yes: it becomes M'],
          ['S, Shared', 'maybe', 'no', 'no: must invalidate the others first'],
          ['I, Invalid', '—', '—', 'no usable copy']
        ], { mono: false, terms: ['st_m', 'st_e', 'st_s', 'st_i'] });
        L.p('E matters most. A core that read a line no one else has gets it E, and may later write it without any message: data only one core uses needs no coherence messages after its first read.');
      } },
      { id: 'moesi', title: 'The fifth state: Owned', body: function (L) {
        L.p('In plain MESI, when another core reads a Modified line, the dirty data must be written back to memory before both copies become S.');
        L.p('MOESI adds O, Owned: the core keeps its dirty copy, hands the data to the reader, and stays responsible for writing it back later. Memory is not written at all for now.', ['moesi', 'st_o']);
        L.p('The example machine uses MOESI, as AMD does. Intel uses MESIF, which adds a Forward state instead: of several S copies, the one marked F answers the next request.');
      } },
      { id: 'run', title: 'One line, seven operations', body: function (L) {
        L.p('Follow line A, which holds <code>hist[120..127]</code>, through the first scenario of the coherence lab ([[ch:coh]]):');
        L.table(['Operation', 'Core 0', 'Core 1', 'Core 2', 'Core 3', 'What happens'], [
          ['core 0 reads A', 'E', 'I', 'I', 'I', 'no other copy: from DRAM, E'],
          ['core 1 reads A', 'S', 'S', 'I', 'I', 'core 0 is probed, sends the line, drops to S'],
          ['core 2 reads A', 'S', 'S', 'S', 'I', 'clean copies only: from DRAM, no probe'],
          { cells: ['core 3 writes A', 'I', 'I', 'I', 'M', 'RFO: cores 0, 1 and 2 invalidated'], hot: true },
          ['core 0 reads A', 'S', 'I', 'I', 'O', 'core 3 sends the dirty line and keeps it as O'],
          ['core 1 reads A', 'S', 'S', 'I', 'O', 'core 3 sends it again'],
          ['core 3 evicts A', 'S', 'S', 'I', 'I', 'O is dirty: written back to DRAM']
        ], { mono: false, title: 'line A under MOESI', label: 'Simulation' });
        L.p('With MESI, core 3 would have written A to DRAM at core 0’s read, so that both copies could be S. MOESI moves that write to the eviction. Here that is still one write; had core 3 written A again before evicting it, the early write would have been wasted.');
        L.p('The lab steps through exactly these operations, draws every message and counts them.');
      } }
    ],
    check: [
      { q: 'A core holds a line in E and writes it. What messages are needed?', options: ['None: E becomes M silently', 'An invalidation to every core', 'A write-back to memory', 'A read for ownership'], answer: 0, why: 'E means no other copy exists, so the core may write at once.' },
      { q: 'Core 3 holds A in M; core 0 reads A. What does MOESI do?', options: ['Core 3 sends the data and moves to O; core 0 gets S; memory is not written', 'Core 3 writes A to memory, then both are S', 'Core 0 waits until core 3 evicts A', 'Core 3’s copy is invalidated'], answer: 0, why: 'O keeps the dirty data in a cache that answers for it, saving the write to memory.' },
      { q: 'Which state means “only copy, same as memory”?', options: ['E', 'M', 'S', 'O'], answer: 0, why: 'Exclusive: clean and not shared.' }
    ],
    remember: [
      'M: only copy, dirty. E: only copy, clean. S: maybe shared, read only. I: no copy.',
      'E lets private data be written with no messages.',
      'O lets a dirty line be shared without writing memory; the owner writes it back later.',
      'The example uses MOESI like AMD; Intel uses MESIF; Arm’s CHI names the same ideas differently.'
    ],
    sources: [PRIMER]
  });

  /* ---------- V.08 ---------- */
  App.lesson({
    id: 'coh-probe', short: 'Who gets asked', title: 'Who gets asked: snooping, directories and shadow tags',
    lede: 'When a core misses or wants to write, someone must find the other copies. Broadcasting to every cache does not scale; a directory records where copies are.',
    know: ['The MOESI states ([[ch:coh-mesi]]).', 'The example L3 keeps shadow tags of every L2 ([[ch:cache-levels]]).'],
    learn: ['Tell snooping from directory-based coherence', 'Follow a write to a shared line through the example’s shadow tags', 'Say why cache-to-cache transfers cost more than local hits'],
    sections: [
      { id: 'snoop', title: 'Ask everyone', body: function (L) {
        L.p('The simplest way: every request goes to every cache, and each checks its own tags. That is snooping.', ['snoop', 'probe']);
        L.p('With 4 cores that is cheap. With 128 cores, every miss would disturb 127 caches, nearly always for nothing.');
      } },
      { id: 'dir', title: 'Keep a record', body: function (L) {
        L.p('Instead, keep a record of which caches may hold each line, a directory, and send requests only there.', ['directory']);
        L.p('The example L3’s shadow tags are that record: a copy of every L2’s tags. A request that misses its own core’s caches reaches the L3, which looks up the shadow tags and probes only the cores listed.', ['shadow', 'pfilter']);
      } },
      { id: 'write', title: 'A write to a shared line', body: function (L) {
        L.p('Core 3 writes line A while cores 0, 1 and 2 hold it in S:');
        L.chain([
          { k: 'core 3', v: 'request: write A', d: 'it holds no writable copy' },
          { k: 'L3, shadow tags', v: 'A is in cores 0, 1, 2', d: 'core 3 is not listed' },
          { k: 'probes', v: 'invalidate', d: 'to cores 0, 1 and 2 only', hot: true },
          { k: 'acknowledgements', v: 'all three answer', d: 'then core 3 has A in M' }
        ], { cap: 'A write needs every acknowledgement before the store can commit.' });
        L.p('The store waits in core 3’s store buffer the whole time ([[ch:st-visible]]). A line that several cores keep writing pays this round trip on every change of writer.');
      } },
      { id: 'c2c', title: 'Data from another core', body: function (L) {
        L.p('When the newest copy is in another core’s cache, the data travels from that cache to the requester: a cache-to-cache transfer. It takes longer than an L3 hit, because it needs the probe, the other core’s lookup and the return.');
        L.p('A ping-pong measures it: two threads pass a counter back and forth through one line, so every handoff moves the line from one core’s cache to the other’s. Machine C:');
        L.out('c.pingpong');
        L.p('61 to 72 ns per handoff: about 50 times an L1d hit on the same machine (1.3 ns) and about half a load from DRAM (136 ns for 2 GiB in [[ch:cache-levels]]).');
        L.p('On a virtual machine the hypervisor picks the host cores that run the two vCPUs, so the number can change between runs. On real hardware it depends on how far apart the two cores are on the chip.');
        L.note('other', 'On large chips the directory is split into slices spread across the chip, so lookups do not all go to one place. The idea is the same: probe only the caches that may hold the line.', 'On real chips');
      } }
    ],
    check: [
      { q: 'Why do large chips not broadcast every coherence request?', options: ['With many cores, nearly every probe would hit caches that do not have the line', 'Broadcast is not allowed by MOESI', 'Probes are slower than DRAM', 'Directories are free'], answer: 0, why: 'Broadcast traffic grows with the number of caches; a directory sends probes only where copies may be.' },
      { q: 'In the example, how does the L3 know which cores to invalidate?', options: ['Its shadow tags list which L2s hold the line', 'It asks all four cores', 'It reads the page table', 'It cannot know; it invalidates all'], answer: 0, why: 'Shadow tags are a directory of every L2’s contents.' },
      { q: 'When may core 3’s store to the shared line commit?', options: ['After every other copy has acknowledged its invalidation', 'As soon as the request is sent', 'After DRAM is written', 'After core 3 retires the next instruction'], answer: 0, why: 'Until then other copies might still be read; the rule allows a writer only when no reader remains.' }
    ],
    remember: [
      'Snooping asks every cache; a directory records where copies are and asks only those.',
      'The example L3’s shadow tags are a directory of every L2.',
      'A write to a shared line waits for every invalidation to be acknowledged.',
      'On machine C one handoff of a line between two cores takes 61 to 72 ns, against 1.3 ns for an L1d hit.'
    ],
    sources: [PRIMER, DREPPER]
  });

  /* ---------- V.09 ---------- */
  App.lesson({
    id: 'coh-false', short: 'False sharing', title: 'False sharing',
    lede: 'Two threads that never touch each other’s data can still fight over one cache line. On machine C, atomic counters in the same line run 12 times slower.',
    know: ['Coherence works on whole lines ([[ch:coh-why]]).', 'Atomic increments need the line owned, and drain the store buffer ([[ch:ord-fence]]).'],
    learn: ['Explain how unrelated variables in one line slow each other down', 'Read machine C’s measurement with plain and atomic counters', 'Fix false sharing with padding or per-thread data'],
    sections: [
      { id: 'how', title: 'Two counters, one line', body: function (L) {
        L.p('Each of two threads counts events in its own counter. The counters are two <code>long</code>s next to each other, so they share a 64-byte line.');
        L.p('Neither thread reads the other’s counter. But coherence works on lines: every write by thread 0 needs the line owned by core 0, every write by thread 1 needs it owned by core 1. The line moves back and forth.', ['fshare']);
      } },
      { id: 'measure', title: 'Measured on machine C', body: function (L) {
        L.p('Each thread adds 1 to its own counter 20 million times. The counters are 8 or 128 bytes apart:');
        L.out('c.falseshare');
        L.p('Atomic counters in one line: 56 ns per increment, 12 times slower than 128 bytes apart, where each core keeps its own line. Every <code>lock add</code> must own the line, and the other core keeps taking it away.');
        L.p('Plain increments barely notice here. Each core keeps reading its own counter from its own store buffer, so it rarely waits for the line, and its stores reach the line in bursts while it holds it. How often the line actually moved, this program cannot see. (Inference)');
        L.note('careful', 'Plain increments of a variable another thread also writes would be a data race in C. Here each thread has its own counter; only the line is shared.');
      } },
      { id: 'fix', title: 'The fix: one line each', body: function (L) {
        L.p('Put data that different threads write in different lines.', ['padding']);
        L.code('struct counter { _Alignas(64) long n; };   /* each counter starts its own line */\nstruct counter per_thread[2];', { title: 'padding with C11 alignment' });
        L.p('Linux marks such data with <code>____cacheline_aligned_in_smp</code>. On a kernel built for one CPU it adds nothing, because without a second core no line can bounce:');
        L.quote('#ifndef ____cacheline_aligned_in_smp\n#ifdef CONFIG_SMP\n#define ____cacheline_aligned_in_smp ____cacheline_aligned\n#else\n#define ____cacheline_aligned_in_smp\n#endif /* CONFIG_SMP */\n#endif', { code: true, label: 'Linux source', cite: 'include/linux/cache.h, Linux v6.18' });
        L.p('<code>____cacheline_aligned</code> itself aligns to <code>SMP_CACHE_BYTES</code>, the cache-line size the kernel was built for. Per-thread or per-CPU counters that are summed only when read avoid the problem altogether.');
        L.p('False sharing is easy to miss: the code looks fine, and only the memory layout is wrong. On a machine that supports it, <code>perf c2c</code> lists the lines that move between cores. The coherence lab ([[ch:coh]]) shows the traffic message by message.', ['hitm']);
      } }
    ],
    check: [
      { q: 'Two threads write different variables. When do they slow each other down?', options: ['When the variables share a cache line', 'Never: they share nothing', 'Only when both are atomics on different lines', 'Only on Arm'], answer: 0, why: 'Coherence moves whole lines; two writers to one line take it from each other.' },
      { q: 'On machine C, atomic increments take 4.74 ns with counters 128 bytes apart and 56 ns 8 bytes apart. Why?', options: ['8 bytes apart, both counters are in one line that bounces between the cores', '128 bytes is a page boundary', 'The atomic instruction is slower for small addresses', 'The L1d cannot hold two counters'], answer: 0, why: 'Each lock add needs the line owned; with both counters in one line, every increment waits for the line to come back.' },
      { q: 'What fixes false sharing?', options: ['Placing each thread’s data in its own line, or keeping per-thread copies', 'Using smaller variables', 'Adding mfence after every write', 'Disabling the caches'], answer: 0, why: 'Separate lines mean separate owners; nothing needs to move.' }
    ],
    remember: [
      'False sharing: unrelated data that different threads write sits in one line, which bounces between cores.',
      'On machine C, atomic counters in one line are 12 times slower than in separate lines.',
      'Pad or align such data to 64 bytes, or keep it per thread.'
    ],
    sources: [DREPPER, PRIMER]
  });
})();
