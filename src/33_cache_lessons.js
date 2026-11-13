/* ======================= Part IV · caches (IV.01–IV.04, IV.06–IV.07) ======================= */
(function () {
  'use strict';
  var d = App.gloss, h = App.h, s = App.s, LW = function () { return App.LW; };
  d('fullyassoc', 'fully associative', 'A cache in which any line can go in any slot. Every lookup must compare against every slot, so only small structures, such as TLBs, are built this way.');
  d('directmap', 'direct-mapped', 'A cache in which each address has exactly one possible slot. Lookups are cheap, but two busy lines that map to the same slot keep evicting each other.');
  d('setassoc', 'set-associative', 'The usual compromise: the address picks one set, and the line can go in any of that set’s ways. An 8-way cache compares 8 tags per lookup.');
  d('conflict', 'conflict miss', 'A miss on a line that was evicted because too many lines map to its set, although the cache as a whole had room.');
  d('hitvec', 'hit vector', 'One bit per way, set where the stored tag matches and the valid bit is 1. At most one bit can be set; it picks which way’s data goes out.');
  d('lruterm', 'LRU (least recently used)', 'Evict the line that was used longest ago. Exact LRU for 8 ways must track the order of all 8, so caches usually approximate it.');
  d('backinv', 'back-invalidation', 'When an inclusive cache evicts a line, it must also remove the copies in the smaller caches above it, which may still have been using them.');
  d('excl', 'exclusive or non-inclusive cache', 'Exclusive: a line is in this level or the level above, never both. Non-inclusive: no rule either way. Both avoid storing every line twice.');
  d('missq', 'miss queue', 'A table at each cache level of the misses it has sent on and is waiting for. Its size caps how many misses that level can have in flight.');
  d('bpl', 'bytes in flight', 'Bandwidth × latency: how much data must be on its way at every moment to keep a link busy. 19.2 GB/s at 90 ns is 1,728 bytes, 27 lines.');
  App.setCategory('fullyassoc directmap setassoc conflict hitvec lruterm backinv excl missq bpl', 'cache');
  var DREPPER = ['Ulrich Drepper, What Every Programmer Should Know About Memory (2007)', 'https://www.akkadia.org/drepper/cpumemory.pdf'];
  var HP = ['Hill and Smith, Evaluating Associativity in CPU Caches (IEEE Trans. Computers, 1989)', 'https://doi.org/10.1109/12.40842'];
  var INTEL_NI = ['Intel, Xeon Scalable (Skylake-SP) cache hierarchy: non-inclusive L3', 'https://www.intel.com/content/www/us/en/developer/articles/technical/xeon-processor-scalable-family-technical-overview.html'];
  var CFG = App.CFG;

  /* Eight ways of one set, with LRU or tree pseudo-LRU replacement. */
  function setsim(el) {
    var form = h('div', { 'class': 'lx-form' }, el);
    var pol = LW().select(form, 'Replacement', [['plru', 'tree pseudo-LRU (7 bits)'], ['lru', 'exact LRU']], 'plru');
    var bar = h('div', { 'class': 'lx-stepbar lx-wrap' }, el);
    var lines = ['hist'].concat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (k) { return 'buf' + k; }));
    lines.forEach(function (n) { var b = h('button', { type: 'button' }, bar, 'load ' + n); b.onclick = function () { access(n); render(); }; });
    var bar2 = h('div', { 'class': 'lx-stepbar lx-wrap' }, el);
    var play = h('button', { type: 'button', 'class': 'pri' }, bar2, 'hist, then buf0 … buf11, then hist again');
    var reset = h('button', { type: 'button' }, bar2, 'reset');
    var out = h('div', { 'class': 'lx-out', 'aria-live': 'polite' }, el);
    var ways, bits, age, clock, log, hits, misses;
    function init() { ways = [null, null, null, null, null, null, null, null]; bits = [0, 0, 0, 0, 0, 0, 0]; age = [0, 0, 0, 0, 0, 0, 0, 0]; clock = 0; log = []; hits = 0; misses = 0; }
    function touch(w) {
      age[w] = ++clock;
      /* each node on the path points away from the way just used: 0 = the older half is on the left */
      var node = 0, lo = 0, hi = 8;
      while (hi - lo > 1) { var mid = (lo + hi) / 2, left = w < mid; bits[node] = left ? 1 : 0; node = node * 2 + (left ? 1 : 2); if (left) hi = mid; else lo = mid; }
    }
    function victim() {
      var free = ways.indexOf(null); if (free >= 0) return free;
      if (pol.value === 'lru') { var v = 0; for (var i = 1; i < 8; i++) if (age[i] < age[v]) v = i; return v; }
      var node = 0, lo = 0, hi = 8;
      while (hi - lo > 1) { var mid = (lo + hi) / 2, goLeft = bits[node] === 0; node = node * 2 + (goLeft ? 1 : 2); if (goLeft) hi = mid; else lo = mid; }
      return lo;
    }
    function access(n) {
      var w = ways.indexOf(n);
      if (w >= 0) { hits++; touch(w); log.push(n + ': hit in way ' + w); }
      else {
        misses++; w = victim();
        log.push(n + ': miss' + (ways[w] ? ', evicts ' + ways[w] + ' from way ' + w : ', fills empty way ' + w));
        ways[w] = n; touch(w);
      }
      if (log.length > 6) log.shift();
    }
    function render() {
      var cells = ways.map(function (n, i) { return '<td' + (n === 'hist' ? ' style="color:var(--act);font-weight:600"' : '') + '>' + (n || '—') + '</td>'; }).join('');
      out.innerHTML = '<div class="lx-table"><div class="lx-table-wrap"><table class="mono-cells"><thead><tr>' + ways.map(function (_, i) { return '<th>way ' + i + '</th>'; }).join('') + '</tr></thead><tbody><tr>' + cells + '</tr></tbody></table></div></div>' +
        (pol.value === 'plru' ? '<p class="lx-msg">Tree bits (root first): ' + bits.join(' ') + '. A 0 sends the next victim search left, a 1 right.</p>' : '<p class="lx-msg">Exact LRU: the victim is the way used longest ago.</p>') +
        '<p class="lx-msg">' + hits + ' hits, ' + misses + ' misses. ' + log.join(' · ') + '</p>';
    }
    play.onclick = function () { init(); access('hist'); for (var k = 0; k < 12; k++) access('buf' + k); access('hist'); render(); };
    reset.onclick = function () { init(); render(); };
    pol.addEventListener('change', function () { init(); render(); });
    init(); render();
  }

  /* 64 sets × 8 ways, with set 57 marked. */
  function grid(sv) {
    var P = App.P, x0 = 70, y0 = 26, cw = 46, ch = 17;
    P.T(sv, x0 + 4 * cw, 14, '8 ways', 's', 'middle');
    for (var w = 0; w < 8; w++) P.T(sv, x0 + w * cw + cw / 2, y0 - 2, 'way ' + w, 's m', 'middle');
    var rows = [0, 1, 2, null, 56, 57, 58, null, 63];
    rows.forEach(function (r, i) {
      var y = y0 + 4 + i * (ch + 3);
      if (r === null) { P.T(sv, x0 + 4 * cw, y + 12, '⋮', 's', 'middle'); return; }
      P.T(sv, x0 - 8, y + 12, 'set ' + r, 's m', 'end');
      for (var w = 0; w < 8; w++) P.R(sv, x0 + w * cw + 2, y, cw - 4, ch, r === 57 ? (w === 3 ? 'box on' : 'a2b') : 'sunk', 3);
    });
    P.T(sv, x0 + 8 * cw + 10, y0 + 4 + 5 * (ch + 3) + 12, '← hist[123]’s line, way 3', 's');
  }

  /* ---------- IV.01 ---------- */
  App.lesson({
    id: 'cache-org', short: 'Lines, sets and ways', title: 'Lines, sets and ways',
    lede: 'A cache is a table of 64-byte lines. Some address bits pick a set; the line can sit in any way of that set; the rest of the address is stored as its tag.',
    know: ['Caches hold copies of 64-byte lines ([[ch:whycache]], [[ch:map]]).', 'Reading a bit range such as bits 11:6 ([[ch:bits]]).', 'A physical address is a frame number and a 12-bit page offset ([[ch:vm-pages]]).'],
    learn: ['Explain why caches are split into sets and ways', 'Split a physical address into offset, set index and tag', 'Work out the number of sets from size, ways and line size'],
    sections: [
      { id: 'where', title: 'Where can a line go?', body: function (L) {
        L.p('The example L1d holds 32 KiB: 512 lines of 64 bytes. When a load arrives, the cache must find out quickly whether its line is among them.');
        L.p('If any line could sit in any of the 512 slots, every lookup would compare against all 512. That is too slow and costs too much power for a cache read every cycle.', ['fullyassoc']);
        L.p('If each address had exactly one slot, a lookup would check one place. But two busy lines that map to the same slot would keep throwing each other out.', ['directmap']);
        L.p('Caches take the middle: the address picks a small group of slots, a set, and the line may sit in any slot of that group.', ['setassoc']);
      } },
      { id: 'sets', title: 'Sets and ways', body: function (L) {
        L.p('The example L1d arranges its 512 slots as 64 sets of 8 ways: 64 × 8 × 64 bytes = 32 KiB.', ['set', 'way']);
        L.fig(520, 222, grid, { cap: 'The example L1d: 64 sets, 8 ways each. The line holding hist[123] can only live in set 57; it happens to be in way 3.' });
        L.p('A lookup reads one set and checks its 8 ways. A line can only ever be in the set its address picks, in any of its 8 ways.');
      } },
      { id: 'split', title: 'Which bits pick the set', body: function (L) {
        L.p('A line is 64 = 2⁶ bytes, so the low 6 bits of an address say which byte of the line: the offset. There are 64 = 2⁶ sets, so the next 6 bits pick the set: the index.', ['offset', 'index']);
        L.p('The remaining bits are stored with the line as its tag, so a lookup can tell which of all the lines that share set 57 this one is.', ['tag']);
        L.bits([
          { bits: '47:12', val: '0x1a3f7c', name: 'tag', tone: 'a1', w: 2 },
          { bits: '11:6', val: '57', name: 'set index', tone: 'a4' },
          { bits: '5:0', val: '24', name: 'byte in the line', tone: 'a3' }
        ], { title: 'The physical address of hist[123], 0x1a3f7ce58, split for the example L1d' });
        L.code('offset = 0x1a3f7ce58 & 63          = 24\nset    = (0x1a3f7ce58 >> 6) & 63   = 57\ntag    = 0x1a3f7ce58 >> 12         = 0x1a3f7c', { lang: 'text', title: 'arithmetic' });
        L.p('Offset and index together are 12 bits: exactly the page offset. So here the tag is the frame number, and the set is known before translation ends. [[ch:vm-vipt]] showed why that matters.');
      } },
      { id: 'stored', title: 'What one way holds', body: function (L) {
        L.p('Next to its 64 data bytes, each way keeps a little bookkeeping:');
        L.table(['Field', 'Bits', 'Meaning'], [
          ['valid', '1', 'this way holds a real line'],
          ['dirty', '1', 'a store has changed the line since it was filled ([[ch:cache-writes]])'],
          ['tag', '36', 'physical address bits 47:12'],
          ['data', '512', 'the 64 bytes']
        ], { mono: false, terms: ['valid'] });
        L.p('The index is not stored: the row a line sits in is its index. So 38 bits of bookkeeping ride along with every 512 bits of data, about 7%.');
      } },
      { id: 'shapes', title: 'Other shapes, same rule', body: function (L) {
        L.p('Every set-associative cache follows one rule: sets = size ÷ (ways × line size). The index takes log₂(sets) bits above the offset.');
        L.table(['Cache', 'Size', 'Ways', 'Sets', 'Index bits'], [
          ['example L1d', '32 KiB', '8', '64', '11:6'],
          ['example L2', '512 KiB', '8', '1024', '15:6'],
          ['example L3', '4 MiB', '16', '4096', '17:6'],
          ['machine C L1d', '48 KiB', '12', '64', '11:6'],
          ['machine C L2', '2 MiB', '16', '2048', '16:6']
        ], { title: 'sets = size ÷ (ways × 64 bytes)' });
        L.p('Machine C reports the same numbers itself:');
        L.out('c.caches');
        L.try('Size a cache', 'Change the size, the ways, the line size and the page size. The last line says whether the set index still fits in the page offset.', function (el) { LW().l1geom(el, {}); });
      } }
    ],
    check: [
      { q: 'An L1d of 32 KiB with 64-byte lines has 8 ways. How many sets?', options: ['64', '512', '8', '4096'], answer: 0, why: '32768 ÷ (8 × 64) = 64 sets.' },
      { q: 'For that L1d, which bits of the address pick the set?', options: ['Bits 11:6', 'Bits 5:0', 'Bits 47:12', 'Bits 15:6'], answer: 0, why: 'Bits 5:0 pick the byte in the 64-byte line; the next 6 bits pick one of 64 sets.' },
      { q: 'Why is the tag stored but not the index?', options: ['The row a line sits in already is its index', 'The index is too large to store', 'The tag is used for coherence only', 'The index changes on every access'], answer: 0, why: 'Every line in set 57 has index 57. Only the tag tells them apart.' },
      { q: 'Machine C’s L2 is 2 MiB, 16-way, with 64-byte lines. How many sets?', options: ['2048', '1024', '64', '32768'], answer: 0, why: '2 097 152 ÷ (16 × 64) = 2048, as its sysfs files report.' }
    ],
    remember: [
      'A set-associative cache: the address picks a set, the line can sit in any way of it.',
      'Low bits: offset in the line. Next bits: set index. The rest: the tag stored with the line.',
      'sets = size ÷ (ways × line size).',
      'Each way stores a valid bit, a dirty bit, the tag and the 64 data bytes.'
    ],
    sources: [DREPPER]
  });

  /* ---------- IV.02 ---------- */
  App.lesson({
    id: 'cache-lookup', short: 'One lookup', title: 'One lookup, step by step',
    lede: 'The L1d reads all 8 ways of one set at once, compares 8 tags in parallel, and sends the matching way’s bytes to the load.',
    know: ['How an address splits into tag, index and offset ([[ch:cache-org]]).', 'The set can be read before translation ends ([[ch:vm-vipt]]).'],
    learn: ['Follow the four steps of an L1d lookup for hist[123]', 'Say how the cache knows it has a hit, and what happens on a miss', 'Explain why more ways cost time and power'],
    sections: [
      { id: 'read', title: 'Read the whole set', body: function (L) {
        L.p('Bits 11:6 of the address, 57, go to the row decoder as soon as the address exists. The cache reads all of set 57 at once: 8 tags and 8 × 64 bytes of data.');
        L.p('Those bits are the same in the virtual and the physical address, so this starts while the TLB is still translating.');
      } },
      { id: 'compare', title: 'Compare 8 tags at once', body: function (L) {
        L.p('The TLB delivers the frame number, 0x1a3f7c: the physical tag. Eight comparators check it against the 8 stored tags in the same cycle; each result counts only if that way’s valid bit is 1.');
        L.p('The 8 results form the hit vector. At most one bit is set, because a line is never stored twice in one set.', ['hitvec']);
        L.table(['way', '0', '1', '2', '3', '4', '5', '6', '7'], [
          ['tag matches?', 'no', 'no', 'no', 'yes', 'no', 'no', 'no', 'no'],
          ['valid', '1', '1', '0', '1', '1', '0', '1', '1'],
          { cells: ['hit vector', '0', '0', '0', '1', '0', '0', '0', '0'], hot: true }
        ], { title: 'set 57, looking for tag 0x1a3f7c: one possible state of the set' });
      } },
      { id: 'select', title: 'Select the way, pick the bytes', body: function (L) {
        L.p('The hit vector drives a multiplexer that passes way 3’s 64 bytes on. The offset, 24, picks bytes 24 to 31: 8 bytes, <code>hist[123]</code>, the value 41.');
        L.chain([
          { k: 'index', v: 'bits 11:6 = 57', d: 'read 8 tags and 8 lines' },
          { k: 'compare', v: 'tag 0x1a3f7c', d: '8 comparators at once' },
          { k: 'select', v: 'way 3', d: 'the hit vector picks it' },
          { k: 'align', v: 'bytes 24–31', d: 'the offset picks them', hot: true }
        ], { cap: 'An L1d hit: ' + CFG.l1 + ' cycles from the address to the value, with the default latency settings.' });
      } },
      { id: 'miss', title: 'No match: a miss', body: function (L) {
        L.p('If no valid tag matches, the hit vector is all zeros: a miss. The L1d takes a miss buffer for the line, 0x1a3f7ce40, and asks the L2 ([[ch:cpu-miss]]).');
        L.p('The load waits; the rest of the core does not. When the line arrives, it is written into one way of set 57, and the load is woken up.');
        L.p('Which way? If one is invalid, that one. If all 8 hold lines, one must go: the next lesson.');
      } },
      { id: 'price', title: 'The price of more ways', body: function (L) {
        L.p('Every lookup reads and compares every way of the set. 12 ways mean 12 comparators firing and 12 lines read on every load, even though at most one is used.');
        L.p('That is why L1 caches stay at 8 to 12 ways, and why some cores guess the way first and read only that one ([[ch:vm-vipt]]). Larger caches further out can afford more ways, because they are read far less often.', ['waypred']);
      } }
    ],
    check: [
      { q: 'What does the L1d compare to decide a hit?', options: ['The physical tag from the TLB against the 8 stored tags of the set, each with its valid bit', 'The virtual address against every line', 'The data bytes against the load', 'The set index against the tag'], answer: 0, why: 'The index picks the set; the tag compare, gated by the valid bits, decides which way, if any, holds the line.' },
      { q: 'Which bytes of the 64-byte line become the load’s value?', options: ['Bytes 24 to 31, picked by the offset', 'Bytes 0 to 7', 'All 64', 'Bytes 57 to 64'], answer: 0, why: 'The offset of 0x1a3f7ce58 is 24, and the load reads 8 bytes.' },
      { q: 'Why do caches far from the core have more ways than the L1?', options: ['They are read much less often, so comparing more tags per lookup costs less overall', 'They are faster', 'Their lines are smaller', 'They have no tags'], answer: 0, why: 'Every way is read on every lookup. An L1 is looked up almost every cycle; an L3 far less.' }
    ],
    remember: [
      'Lookup: index the set, compare all its tags at once, select the matching way, pick the bytes by offset.',
      'The hit vector has at most one bit set; all zeros is a miss.',
      'A miss takes a miss buffer and asks the next level; the line then fills one way of the set.',
      'More ways mean more tags read and compared on every lookup.'
    ],
    sources: [DREPPER]
  });

  /* ---------- IV.03 ---------- */
  App.lesson({
    id: 'cache-replace', short: 'A full set', title: 'A full set: replacement and the three kinds of miss',
    lede: 'When all ways of a set are full, a new line must evict one. Which one goes, and why misses happen at all, decide how well a cache works.',
    know: ['A line can only live in the set its address picks ([[ch:cache-org]]).', 'A miss fills one way of the set ([[ch:cache-lookup]]).'],
    learn: ['Show how 9 lines that share a set evict each other', 'Explain LRU and the cheaper tree pseudo-LRU', 'Sort misses into compulsory, capacity and conflict misses'],
    sections: [
      { id: 'nine', title: 'Nine lines, eight ways', body: function (L) {
        L.p('After the loop, a program reads another array, <code>buf</code>, at a stride of 4096 bytes: every element sits at the same page offset, 0xe40.');
        L.p('Same page offset means same bits 11:6, so every one of them maps to set 57, the set holding <code>hist[123]</code>’s line. After 8 of them the set is full; the 9th must evict something.');
        L.code('buf[k] at 0x7f3a8c000e40 + k × 0x1000\n(0xe40 >> 6) & 63 = 57         /* the same set, for every k */', { lang: 'text', title: 'why all of them collide' });
      } },
      { id: 'lru', title: 'Evict the line used longest ago', body: function (L) {
        L.p('A good guess is that the line used longest ago will not be needed soon. Exact LRU evicts it, but must track the full order of all 8 ways, and update it on every hit.', ['lruterm']);
        L.p('So caches approximate it with a small tree: 7 bits for 8 ways. Each bit points to the half of its subtree used less recently. A hit flips the bits on its path to point away from it; the victim is found by following the bits from the root.', ['plru']);
        L.try('Fill one set', 'Load hist’s line, then twelve lines of buf that all map to the same set, then hist again. Switch between pseudo-LRU and exact LRU.', setsim);
        L.p('Either way, by the time <code>hist</code> is needed again its line is gone: the set held only 8 lines, and 12 newer ones passed through.');
      } },
      { id: 'kinds', title: 'Three kinds of miss', body: function (L) {
        L.p('Every miss has one of three causes:');
        L.table(['Kind', 'Cause', 'Example'], [
          ['compulsory', 'the line was never in the cache', 'the first load of <code>hist[123]</code>'],
          ['capacity', 'the data in use is larger than the whole cache', 'walking 1 GiB over and over'],
          ['conflict', 'too many lines map to one set, though the cache has room', '<code>hist[123]</code> after the 12 <code>buf</code> lines']
        ], { mono: false, terms: ['compulsory', 'capacity_miss', 'conflict'] });
        L.p('Conflict misses are the strange ones. The L1d still had about 500 free slots, but all of them were in other sets.');
        L.p('A fully associative cache of the same size has no conflict misses at all, so comparing against one sorts them out. The L1 lab’s first experiment does exactly that.');
      } },
      { id: 'measure', title: 'A conflict, measured', body: function (L) {
        L.p('[[ch:vm-vipt]] measured this on machine B. A pointer chase visits one line per page, all at the same page offset, so all in one set:');
        L.out('vipt.b');
        L.p('Up to 12 pages, every hop hits the 12-way L1d. From 13 pages on, the set overflows, every hop misses, and each takes about as long as an L2 hit. The cache is 48 KiB; the chase uses less than 1 KiB of it.');
      } }
    ],
    check: [
      { q: 'Why do buf[0] to buf[11] all land in set 57?', options: ['They share the page offset 0xe40, and bits 11:6 come from the page offset', 'They are in the same page', 'They are 64 bytes apart', 'Because the L1d is direct-mapped'], answer: 0, why: 'A 4096-byte stride leaves bits 11:0 unchanged, so the set index stays 57.' },
      { q: 'hist[123]’s line was evicted by 12 buf lines and is read again. What kind of miss is it?', options: ['Conflict', 'Compulsory', 'Capacity', 'Coherence'], answer: 0, why: 'The cache had plenty of room overall, but only 8 ways in the one set those lines share.' },
      { q: 'What does a tree pseudo-LRU store for an 8-way set?', options: ['7 bits that point toward the less recently used half at each level', 'The full order of the 8 ways', 'One bit per way', 'A timestamp per line'], answer: 0, why: 'A binary tree over 8 ways has 7 nodes, one bit each. It approximates LRU cheaply.' }
    ],
    remember: [
      'A full set must evict a line to take a new one; LRU picks the one used longest ago, tree pseudo-LRU approximates it with 7 bits for 8 ways.',
      'Lines at the same page offset share an L1 set; more of them than ways evict each other.',
      'Misses are compulsory (first use), capacity (too much data) or conflict (too much in one set).'
    ],
    sources: [DREPPER, HP]
  });

  /* ---------- IV.04 ---------- */
  App.lesson({
    id: 'cache-writes', short: 'Writes and dirty lines', title: 'Writes: dirty lines and write-back',
    lede: 'A committed store changes the line in the L1d and marks it dirty. The new bytes reach the next level only when the line is evicted.',
    know: ['A store writes the L1d only when it commits, after retiring ([[ch:cpu-lsq]]).', 'Lookups, sets and eviction ([[ch:cache-replace]]).'],
    learn: ['Say what a store does to a line, and what the dirty bit records', 'Explain write-back and write-through', 'Follow hist[123]’s two increments to the moment they leave the L1d'],
    sections: [
      { id: 'store', title: 'A store writes the cached copy', body: function (L) {
        L.p('When a store commits, the L1d looks up its line like a load does, and on a hit overwrites the 8 bytes in that way.');
        L.p('On a miss, the line is fetched first and then written. Cores do that because a store usually touches only a few bytes of the 64, and the line must be complete in the cache.', ['walloc']);
      } },
      { id: 'dirty', title: 'Dirty: newer than the copy below', body: function (L) {
        L.p('After the write, the L1d holds the only up-to-date copy. The L2’s copy, and DRAM’s, are now stale. The line’s dirty bit records that.', ['dirty']);
        L.p('In the example, C1’s store sets <code>hist[123]</code> to 42 and marks the line dirty. C2’s store sets it to 43; the line was dirty already, and nothing else happens.');
      } },
      { id: 'wb', title: 'Write-back: only on eviction', body: function (L) {
        L.p('The example L1d sends nothing to the L2 for those two stores. The line is written back, all 64 bytes, only when it is evicted.', ['wbk']);
        L.p('When the 12 <code>buf</code> lines push it out of set 57, the L1d sees the dirty bit and writes the line to the L2 before reusing the way. A clean line would simply be dropped.', ['evict']);
        L.p('Where does it go? The line’s address is rebuilt from its tag and its set: 0x1a3f7c, then 57, then six zero bits: 0x1a3f7ce40.');
        L.chain([
          { k: 'C1 commits', v: 'hist[123] = 42', d: 'line dirty, 0 bytes to the L2' },
          { k: 'C2 commits', v: 'hist[123] = 43', d: 'still dirty, still 0 bytes' },
          { k: 'evicted by buf', v: '64 bytes to the L2', d: 'one write-back for two stores', hot: true }
        ]);
      } },
      { id: 'wt', title: 'The other policy: write-through', body: function (L) {
        L.p('A write-through cache sends every store to the next level at once. It never holds the only copy, so an eviction never writes anything back.', ['wthru']);
        L.p('The price is traffic: every store crosses to the next level. Loops that update the same line many times, like a histogram, show the difference most.');
        L.note('other', 'Some memory regions must not be cached in a write-back way at all, such as device registers. Their memory type says so ([[ch:io-mmio]]).', 'Not every store goes through the cache');
      } }
    ],
    check: [
      { q: 'hist[123] is incremented twice while its line stays in the L1d. How many bytes go to the L2?', options: ['None until the line is evicted, then 64', '16, one 8-byte write per store', '128', '8'], answer: 0, why: 'A write-back L1d keeps the newest value and marks the line dirty; the whole line is written back once, on eviction.' },
      { q: 'What does the dirty bit say?', options: ['This cache holds a newer copy than the level below', 'The line has an error', 'The line is shared with another core', 'The line was prefetched'], answer: 0, why: 'A store changed it after it was filled. On eviction it must be written back.' },
      { q: 'How does the cache know where to write a dirty line back?', options: ['It rebuilds the address from the tag and the set index', 'It stores the full address separately', 'It asks the TLB', 'It writes it to the same set of the L2 regardless of address'], answer: 0, why: 'Tag, then index, then zeros for the offset: 0x1a3f7c, 57, 000000 = 0x1a3f7ce40.' }
    ],
    remember: [
      'A store hit overwrites the bytes in the L1d and sets the line’s dirty bit; a store miss fetches the line first.',
      'Write-back: the next level gets the line only when it is evicted, once for any number of stores.',
      'Write-through: every store also goes to the next level.',
      'A dirty line’s address is rebuilt from tag ‖ index ‖ zero offset.'
    ],
    sources: [DREPPER]
  });

  /* ---------- IV.06 ---------- */
  App.lesson({
    id: 'cache-levels', short: 'L2 and L3', title: 'The L2 and the L3',
    lede: 'Each core’s L2 catches what its L1d misses; the shared L3 catches what the L2s evict. Inclusion decides which copies exist where.',
    know: ['Sets, lookups, replacement and write-back in one cache ([[ch:cache-org]]–[[ch:cache-writes]]).', 'The machine’s levels: L1d and L2 per core, a shared L3 ([[ch:map]]).'],
    learn: ['Find a line’s set in each level of the example machine', 'Tell inclusive, exclusive and non-inclusive caches apart', 'Explain why the example L3 is filled only by evictions, and what its shadow tags are for'],
    sections: [
      { id: 'ladder', title: 'Each level bigger and slower', body: function (L) {
        L.p('The levels repeat the same design at larger sizes. Machine C shows the steps directly, with a pointer chase over growing working sets:');
        L.out('c.ladder', { lines: [0, 2, 4, 6, 7, 9, 12] });
        L.p('Up to 48 KiB, the L1d: 1.3 ns. Up to 1 MiB, the L2: about 4.7 ns. Up to 8 MiB, the L3: about 33 ns. Beyond that, DRAM.');
      } },
      { id: 'l2', title: 'The L2: private and inclusive', body: function (L) {
        L.p('The example L2 has 512 KiB, 8 ways and 1024 sets, so bits 15:6 pick its set. For <code>hist[123]</code>’s line, 0x1a3f7ce40, that is set 825.');
        L.code('(0x1a3f7ce40 >> 6) & 63     = 57     /* L1d set */\n(0x1a3f7ce40 >> 6) & 1023   = 825    /* L2 set  */\n(0x1a3f7ce40 >> 6) & 4095   = 3897   /* L3 set, in this simple model */', { lang: 'text', title: 'the same line, three sets' });
        L.p('This L2 is inclusive of its L1d: every line in the L1d is also in the L2. So when the L2 evicts a line, it must also remove it from the L1d, even if the core was still using it there.', ['incl', 'backinv']);
        L.p('In return, the L2 alone can answer whether this core has a line at all. That will matter for coherence in Part V.');
      } },
      { id: 'l3', title: 'The L3: shared, and filled by evictions', body: function (L) {
        L.p('The example L3 is a victim cache. A line fetched from DRAM goes straight to the L2 and the L1d, not the L3. A line enters the L3 only when an L2 evicts it.', ['victimc']);
        L.p('When a core later hits that line in the L3, the line moves back up to its L2, and the L3 usually drops its copy. The L3 and the L2s then hold mostly different lines, and together more data.', ['excl']);
        L.table(['Policy', 'Rule', 'Where it is used'], [
          ['inclusive', 'everything above is also here', 'the example L2 (of its L1d); older Intel Xeon L3s'],
          ['exclusive (victim)', 'a line is here or above, not both', 'the example L3; AMD Zen L3s, filled by L2 evictions'],
          ['non-inclusive', 'no rule either way', 'Intel Xeon L3s since Skylake-SP']
        ], { mono: false, src: INTEL_NI });
      } },
      { id: 'shadow', title: 'Knowing who has what: shadow tags', body: function (L) {
        L.p('Because the L3 does not hold copies of the L2s’ lines, it cannot tell from its own contents whether some core has a line.');
        L.p('So it keeps a copy of every L2’s tags: shadow tags. A miss in the L3 checks them. If another core’s L2 holds the line, the request goes to that core instead of DRAM, and to no other core.', ['shadow', 'pfilter']);
        L.p('Part V uses this when two cores share a line ([[ch:coh-probe]]).');
      } }
    ],
    check: [
      { q: 'Which bits pick the set in the example L2 (512 KiB, 8 ways, 64-byte lines)?', options: ['Bits 15:6', 'Bits 11:6', 'Bits 17:6', 'Bits 5:0'], answer: 0, why: '512 KiB ÷ (8 × 64) = 1024 sets = 2¹⁰, so 10 index bits above the 6 offset bits.' },
      { q: 'A line comes back from DRAM after a miss in every level. Where is it placed in the example machine?', options: ['In the L2 and the L1d, not the L3', 'Only in the L3', 'In all three levels', 'Only in the L1d'], answer: 0, why: 'The example L3 is a victim cache: lines enter it only when an L2 evicts them.' },
      { q: 'What does inclusion cost the example L2?', options: ['When it evicts a line, the L1d must lose its copy too', 'Every store is written through', 'It cannot hold dirty lines', 'It needs shadow tags'], answer: 0, why: 'Inclusive means the L1d’s lines are a subset of the L2’s, so an L2 eviction forces an L1d invalidation.' },
      { q: 'Why does the example L3 keep shadow tags?', options: ['It does not hold the L2s’ lines, yet must know which core has a line', 'To speed up L1 hits', 'To store dirty data', 'To translate addresses'], answer: 0, why: 'Shadow tags tell it exactly which core to ask, without asking all of them.' }
    ],
    remember: [
      'The same design repeats at each level; only the size, the ways and the index bits change.',
      'Inclusive: a superset of the level above, so evictions remove copies above. Exclusive or victim: lines move between levels instead of being copied.',
      'The example L3 is filled only by L2 evictions, and keeps shadow tags of every L2.',
      'On machine C the steps are about 1.3, 4.7 and 33 ns, then DRAM.'
    ],
    sources: [DREPPER, INTEL_NI]
  });

  /* ---------- IV.07 ---------- */
  App.lesson({
    id: 'cache-miss', short: 'A miss travels outward', title: 'A miss travels outward',
    lede: 'A load that misses everywhere passes the L2, the L3 and the interconnect to a memory controller, and the line comes back the same way. Every level has a queue, and every link a bandwidth.',
    know: ['The L2 and the victim L3 ([[ch:cache-levels]]).', 'Miss buffers and overlapping misses ([[ch:cpu-miss]]).'],
    learn: ['Follow one miss from the L1d to DRAM and back', 'Use Little’s law to relate latency, bandwidth and the misses in flight', 'Say why memory on another socket is slower'],
    sections: [
      { id: 'trip', title: 'The whole trip', body: function (L) {
        L.p('Say <code>hist[123]</code>’s line is in no cache at all. This is the path of the load:');
        L.chain([
          { k: 'L1d', v: 'miss, set 57', d: 'a miss buffer records the line' },
          { k: 'L2', v: 'miss, set 825', d: 'its own miss queue takes the request' },
          { k: 'L3 and shadow tags', v: 'miss', d: 'no core has the line either' },
          { k: 'interconnect', v: 'to the controller', d: 'the one that owns this address' },
          { k: 'DRAM', v: 'row, column, burst', d: 'Part IV’s next lessons', hot: true },
          { k: 'back', v: 'to the L2 and the L1d', d: 'the waiting load wakes up' }
        ], { cap: 'With the default latency settings: about ' + App.dramCycles() + ' cycles from the load to its value.' });
        L.p('The line returns to the L2 and the L1d, not the L3 ([[ch:cache-levels]]).');
      } },
      { id: 'queues', title: 'A queue at every level', body: function (L) {
        L.p('Each level keeps its own table of misses it has passed on: 4 miss buffers in the example L1d, and miss queues further out.', ['missq']);
        L.p('Any of them can be the limit. If the L1d allows 4 misses, a core cannot have 5 lines on their way, however many the L2 or the memory controller could take.');
      } },
      { id: 'little', title: 'Latency, bandwidth and lines in flight', body: function (L) {
        L.p('One rule ties these together. To keep a link busy, the data in flight must equal its bandwidth times its latency.', ['little', 'bpl']);
        L.code('19.2 GB/s × 90 ns = 1,728 bytes = 27 lines in flight   /* one DDR4-2400 channel */\n38.4 GB/s × 90 ns = 3,456 bytes = 54 lines in flight   /* both channels */', { lang: 'text', title: 'Little’s law for the example machine' });
        L.p('A core with 4 miss buffers keeps at most 4 lines in flight: 256 bytes ÷ 90 ns ≈ 2.8 GB/s from random misses, a seventh of one channel.');
        L.p('Machine C’s random chains from [[ch:cpu-miss]] fit the same rule: 16 chains, 13 ns per load, about 77 million lines a second, 4.9 GB/s from one core.');
      } },
      { id: 'numa', title: 'Memory on another socket', body: function (L) {
        L.p('Servers often have two sockets, each with its own memory controllers. A miss to memory attached to the other socket crosses an extra link and takes longer.', ['numa']);
        L.p('Linux describes each socket, or each part of one, as a NUMA node. Its default policy puts a page on the node of the CPU that first writes it ([[ch:vm-demand]]).', ['ftouch']);
        L.p('The lab after this lesson has a two-socket experiment: who touches pages first decides how many misses cross the link.');
      } }
    ],
    check: [
      { q: 'A line comes back from DRAM. Where does the example machine put it?', options: ['In the L2 and the L1d', 'In the L3 only', 'In all three caches', 'Nowhere: the load uses it directly'], answer: 0, why: 'The L3 is filled only by L2 evictions.' },
      { q: 'A DDR4-2400 channel moves 19.2 GB/s with about 90 ns latency. How many 64-byte lines must be in flight to keep it busy?', options: ['About 27', '1', '4', 'About 300'], answer: 0, why: '19.2 GB/s × 90 ns = 1,728 bytes, 27 lines.' },
      { q: 'What limits a core with 4 L1d miss buffers to about 2.8 GB/s from random misses?', options: ['At most 4 lines can be in flight, each taking about 90 ns', 'The DRAM channel bandwidth', 'The L3 size', 'The TLB'], answer: 0, why: '4 × 64 bytes per 90 ns. The channel could do seven times more.' }
    ],
    remember: [
      'A full miss passes L1d, L2, L3 with its shadow tags, the interconnect and a memory controller, and returns to L2 and L1d.',
      'Each level has a miss queue; the smallest one on the path limits the misses in flight.',
      'Little’s law: data in flight = bandwidth × latency. Latency hides only behind enough misses in flight.',
      'Memory on another socket is a NUMA node of its own, and slower to reach.'
    ],
    sources: [DREPPER]
  });
})();
