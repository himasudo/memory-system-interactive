/* ======================= chapter: stores and memory types ======================= */
App.chapter({id: 'stores', short: 'Stores', title: 'The store path, memory types and fences',
lede: 'A store stays private to its core until it leaves the store queue.',
points: ['It can leave only once the L1d owns the line.', 'The cost depends on which other cores hold that line.', 'The page\u2019s memory type and any fences around the store also change the cost.'],
build: function(root){
  var h = App.h, s = App.s, g = App.g, hx = App.hx;
  var mode = 'E';
  var ctl = h('div', {'class': 'stp'}, root);
  h('span', {'class': 'note'}, ctl, 'before C1\u2019s store commits, the hist[123] line is:');
  App.seg(ctl, [['E', 'in core 0\u2019s L1d, Exclusive'], ['S', 'Shared with core 1'], ['I', 'not in core 0\u2019s caches']], function(v){ mode = v; frames(); }, mode);
  var wrap = h('div', {'class': 'scroller'}, root);
  var sv = s('svg', {viewBox: '0 0 1200 400', style: 'min-width:900px'}, wrap);
  s('defs', null, sv).innerHTML = '<marker id="sa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9z" fill="context-stroke"/></marker>';
  var E = {};
  function box(x, y, w, ht, t, cls){ var gr = s('g', null, sv); s('rect', {x: x, y: y, width: w, height: ht, rx: 9, 'class': cls || 'box'}, gr); if (t) s('text', {x: x + 10, y: y + 20, 'class': 'h'}, gr, t); return gr; }
  box(10, 10, 600, 250, 'Core 0', 'sunk');
  E.sq = box(22, 40, 270, 208, 'Store queue');
  E.sqR = [0, 1].map(function(k){ var y = 64 + k * 64; return {r: s('rect', {x: 32, y: y, width: 250, height: 54, rx: 5, 'class': 'sunk'}, E.sq), t: s('text', {x: 42, y: y + 22, 'class': 'm', 'font-size': 12}, E.sq, ''), t2: s('text', {x: 42, y: y + 42, 'font-size': 11.5}, E.sq, '')}; });
  E.sqN = s('text', {x: 32, y: 222, 'class': 's'}, E.sq, 'commits in program order, one per cycle');
  E.l1 = box(310, 40, 290, 208, 'L1d \u2014 line hist[120..127]');
  E.l1T = [0, 1, 2, 3, 4].map(function(k){ return s('text', {x: 322, y: 92 + k * 30, 'font-size': k === 0 ? 22 : 12.5, 'class': k === 0 ? 'm' : ''}, E.l1, ''); });
  E.c1 = box(630, 10, 250, 250, 'Core 1 \u2014 its caches');
  E.c1T = [0, 1, 2].map(function(k){ return s('text', {x: 642, y: 80 + k * 30, 'font-size': k === 0 ? 22 : 12.5, 'class': k === 0 ? 'm' : ''}, E.c1, ''); });
  E.l3 = box(900, 10, 290, 250, 'L3 + shadow tags');
  E.l3T = [0, 1, 2, 3].map(function(k){ return s('text', {x: 912, y: 60 + k * 26, 'font-size': 12.5}, E.l3, ''); });
  E.dr = box(10, 320, 1180, 70, 'DRAM');
  E.drT = s('text', {x: 22, y: 366, 'font-size': 13}, E.dr, '');
  var A = {};
  function arrow(id, d){ A[id] = s('path', {d: d, 'class': 'wire', 'stroke-width': 2, 'marker-end': 'url(#sa)', style: 'opacity:.18'}, sv); }
  arrow('commit', 'M 282 118 L 308 118');
  arrow('req', 'M 455 248 L 455 290 L 1040 290 L 1040 262');
  arrow('probe', 'M 900 120 L 882 120');
  arrow('ack', 'M 882 160 L 900 160');
  arrow('data', 'M 1080 262 L 1080 300 L 500 300 L 500 250');
  var stp = App.stepper(root, {render: draw});
  function frames(){
    var fr = [];
    var F = function(p, t, d, st){ st.p = p; st.t = t; st.d = d; fr.push(st); };
    var l0 = mode === 'E' ? 'E' : mode === 'S' ? 'S' : 'I', c1 = mode === 'S' ? 'S' : 'I';
    F('execute', 'C1\u2019s store executes', 'The ' + g('sta') + ' writes address <code>0x7ffd4a3c2e58</code> and the ' + g('std') + ' writes 42 into C1\u2019s store-queue entry. No other core can see it. Younger loads on this core can, through ' + g('stlf') + ' ([[ch:core]]).', {sq: ['exec', 'none'], l0: l0, v0: 41, c1: c1, arr: []});
    F('retire', 'C1 retires: a senior store', 'C1 reaches the ROB head and retires. Its entry becomes a ' + g('senior', 'senior store') + ': it will happen, but it is still invisible outside the core. To leave the store queue it must write into the L1d, and the L1d accepts a write only for a line it holds with write permission: ' + g('st_m', 'M') + ' or ' + g('st_e', 'E') + '.', {sq: ['senior', 'exec'], l0: l0, v0: 41, c1: c1, arr: []});
    if (mode === 'E'){
      F('commit', 'Commit: the line is Exclusive', 'Only this core has the line and it is clean. The store writes bytes 24\u201331 in one cycle, E becomes M silently, D = 1. No message leaves the core.', {sq: ['done', 'senior'], l0: 'M', v0: 42, c1: 'I', arr: ['commit']});
    } else if (mode === 'S'){
      F('upgrade', 'The line is Shared: ask for ownership', 'Core 1 read hist[123] earlier and still holds a copy. Writing now would leave core 1 reading a stale 41, so the L1d sends an upgrade request (ownership, no data) to the L3. The ' + g('shadow') + ' show core 1 as the only other holder.', {sq: ['senior', 'senior'], l0: 'S', v0: 41, c1: 'S', arr: ['req'], l3: ['upgrade request from core 0', 'shadow tags: core 1 holds S']});
      F('invalidate', 'Probe core 1: invalidate', 'The L3 sends a ' + g('probe') + ' to core 1 only. Core 1 drops its copy (S \u2192 I) and acknowledges. All this time the store sits at the head of the store queue, and every younger store waits behind it: stores commit in order.', {sq: ['senior', 'senior'], l0: 'S', v0: 41, c1: 'I', arr: ['probe', 'ack'], l3: ['probe: invalidate core 1', 'ack received']});
      F('commit', 'Ownership granted: S \u2192 M, store commits', 'The L3 grants ownership; the line becomes M and the store writes 42. The extra time was one request, one probe and one acknowledgement; AMD does not publish that latency.', {sq: ['done', 'senior'], l0: 'M', v0: 42, c1: 'I', arr: ['data', 'commit'], l3: ['ownership granted to core 0', 'shadow tags: core 0 only']});
    } else {
      F('RFO', 'Not cached: read for ownership', 'The line is not in core 0\u2019s caches. With ' + g('walloc') + ' the L1d issues an ' + g('rfo') + ': fetch the whole 64-byte line and invalidate every other copy, even though the core only wants to write 8 bytes of it.', {sq: ['senior', 'senior'], l0: '\u2014', v0: null, c1: 'I', arr: ['req'], l3: ['RFO from core 0', 'L3 / other L2s / DRAM (Ch 05)']});
      F('fill', 'Line arrives in M; store commits', 'The line arrives in M state, bytes 24\u201331 are overwritten with 42. To write 8 bytes the core read 64, and it will write 64 back when the line is evicted.', {sq: ['done', 'senior'], l0: 'M', v0: 42, c1: 'I', arr: ['data', 'commit'], l3: ['64 B delivered with ownership']});
    }
    F('coalesce', 'C2\u2019s store: no traffic at all', 'C2 writes 43 to the same 8 bytes. The line is already M, so it commits in one cycle and nothing leaves the core. Every further store to this line is free until someone else asks for it.', {sq: ['done', 'done'], l0: 'M', v0: 43, c1: 'I', arr: ['commit']});
    F('stale', 'DRAM is now stale', 'DRAM still holds 41. It is updated only when the line is evicted and written back ([[ch:l1d]]), or when another core\u2019s request makes this core supply the data ([[ch:coh]]). Until then the only current copy of hist[123] is in core 0\u2019s L1d.', {sq: ['done', 'done'], l0: 'M', v0: 43, c1: 'I', arr: [], stale: true});
    F('order', 'What the store queue does to ordering', '<p>Stores commit in program order, so other cores see this core\u2019s stores in the order they were written. What the store queue does break is store \u2192 load order: a later load to a different address can read the cache while an older store is still queued (' + g('tso') + ').</p><p>A classic litmus test makes this visible: two cores each store to their own flag then load the other\u2019s flag; both loads reading 0 is possible under x86-TSO and happens on a real run a noticeable fraction of the time. Placing an ' + g('fence', 'mfence') + ' between each store and load eliminates it entirely, at a real cost per fence \u2014 tens of cycles.</p>', {sq: ['done', 'done'], l0: 'M', v0: 43, c1: 'I', arr: [], stale: true});
    stp.set(fr);
  }
  var SQS = {exec: ['executed: address + data known', 'a4b'], senior: ['senior: retired, waiting to commit', 'a3b'], done: ['committed to the L1d', 'okb'], none: ['', 'sunk']};
  function draw(f){
    [['C1', '0x\u2026c2e58 \u2190 42'], ['C2', '0x\u2026c2e58 \u2190 43']].forEach(function(e, k){
      var st = f.sq[k], R = E.sqR[k];
      R.t.textContent = st === 'none' ? '' : e[0] + '   ' + e[1]; R.t2.textContent = SQS[st][0]; R.r.setAttribute('class', SQS[st][1]);
    });
    E.l1T[0].textContent = f.l0; E.l1T[0].setAttribute('fill', f.l0 === 'M' ? 'var(--a1)' : f.l0 === 'E' ? 'var(--a2)' : f.l0 === 'S' ? 'var(--a4)' : 'var(--tx3)');
    E.l1T[1].textContent = f.l0 === '\u2014' ? 'not present' : {M: 'Modified: dirty, only copy', E: 'Exclusive: clean, only copy', S: 'Shared: read-only here'}[f.l0];
    E.l1T[2].textContent = f.v0 === null ? '' : 'hist[123] = ' + f.v0;
    E.l1T[3].textContent = f.l0 === 'M' ? 'D = 1' : f.l0 === '\u2014' ? '' : 'D = 0';
    E.l1T[4].textContent = f.l0 === 'S' ? 'a write here needs ownership first' : '';
    E.c1T[0].textContent = f.c1; E.c1T[1].textContent = f.c1 === 'S' ? 'Shared copy, hist[123] = 41' : 'no copy (Invalid)'; E.c1T[2].textContent = f.c1 === 'S' ? 'reads hit locally' : '';
    E.l3T.forEach(function(t, k){ t.textContent = (f.l3 || [])[k] || (k === 0 ? 'no request' : ''); });
    E.drT.textContent = 'hist[123] in memory = 41' + (f.v0 !== null && f.v0 !== 41 ? '  \u2014 stale: the only current value (' + f.v0 + ') is in core 0\u2019s L1d' : '  \u2014 matches the caches');
    for (var id in A){ var on = f.arr.indexOf(id) >= 0; A[id].setAttribute('class', 'wire' + (on ? ' on flow' : '')); A[id].style.opacity = on ? 1 : .18; A[id].style.stroke = on ? (id === 'data' || id === 'ack' ? 'var(--a2)' : id === 'probe' ? 'var(--bad)' : 'var(--act)') : ''; }
    E.sq.setAttribute('class', f.p === 'execute' || f.p === 'retire' ? 'on' : ''); E.l1.setAttribute('class', f.arr.indexOf('commit') >= 0 ? 'on' : '');
    E.c1.setAttribute('class', f.arr.indexOf('probe') >= 0 ? 'on' : ''); E.l3.setAttribute('class', f.l3 ? 'on' : ''); E.dr.setAttribute('class', f.stale ? 'on' : '');
  }
  frames();

  /* RFO vs non-temporal */
  var nt = h('div', {'class': 'card'}, root);
  nt.innerHTML = '<h3>Filling a buffer: normal stores vs ' + g('nt', 'non-temporal stores') + '</h3><p>Normal stores to write-back memory must own each line first (RFO), so writing a buffer reads it from memory and later writes it back.</p><p>Non-temporal stores (<code>movnti</code>, <code>movntdq</code>) gather bytes in ' + g('wc', 'write-combining') + ' buffers and send each completed 64-byte line straight to memory: no read, and the caches are not filled with data nobody will read soon.</p><p>They are weakly ordered, so an <code>sfence</code> must come before any flag that publishes the buffer.</p>';
  var ntc = h('div', {'class': 'stp'}, nt); h('span', {'class': 'note'}, ntc, 'buffer size:');
  var ntsv = s('svg', {viewBox: '0 0 1000 150', style: 'width:100%;height:auto;display:block;margin-top:8px'}, nt);
  function ntDraw(kb){
    ntsv.innerHTML = ''; var lines = kb * 16, B = lines * 64, mx = 2 * B, W = function(v){ return 5 + (v / mx) * 700; };
    var fmt = function(b){ return b >= 1048576 ? (b / 1048576) + ' MB' : (b / 1024) + ' KB'; };
    s('text', {x: 10, y: 34, 'class': 'h'}, ntsv, 'normal stores');
    s('rect', {x: 180, y: 18, width: W(B), height: 24, rx: 3, 'class': 'a4b'}, ntsv); s('rect', {x: 180 + W(B), y: 18, width: W(B), height: 24, rx: 3, 'class': 'a1b'}, ntsv);
    s('text', {x: 190 + 2 * W(B), y: 35, 'class': 'm', 'font-size': 12}, ntsv, fmt(B) + ' read (RFO) + ' + fmt(B) + ' written back');
    s('text', {x: 10, y: 88, 'class': 'h'}, ntsv, 'non-temporal');
    s('rect', {x: 180, y: 72, width: W(B), height: 24, rx: 3, 'class': 'a1b'}, ntsv);
    s('text', {x: 190 + W(B), y: 89, 'class': 'm', 'font-size': 12}, ntsv, fmt(B) + ' written, 0 read');
    s('text', {x: 10, y: 136, 'class': 's'}, ntsv, lines + ' lines. Normal stores also pull all ' + fmt(B) + ' through the caches, evicting whatever was there; NT stores leave the caches alone. If the data is read again soon, normal stores win.');
  }
  App.seg(ntc, [[4, '4 KB'], [256, '256 KB'], [4096, '4 MB'], [65536, '64 MB']], ntDraw, 4096); ntDraw(4096);

  var mt = h('div', {'class': 'card'}, root);
  mt.innerHTML = '<h3>' + g('memtype', 'Memory types') + '</h3><table class="mt"><tr><th>type</th><th>reads</th><th>writes</th><th>ordering / speculation</th><th>typical use</th></tr>' +
    '<tr><td>WB</td><td style="font-family:var(--sans)">cached, allocate on miss</td><td style="font-family:var(--sans)">cached, write-back, write-allocate</td><td style="font-family:var(--sans)">x86-TSO; speculative reads allowed</td><td style="font-family:var(--sans)">normal RAM: everything in chapters 01\u201306</td></tr>' +
    '<tr><td>WT</td><td style="font-family:var(--sans)">cached</td><td style="font-family:var(--sans)">update cache on hit, always sent to memory</td><td style="font-family:var(--sans)">speculative reads allowed</td><td style="font-family:var(--sans)">rare today</td></tr>' +
    '<tr><td>WC</td><td style="font-family:var(--sans)">not cached</td><td style="font-family:var(--sans)">gathered in WC buffers, sent as bursts</td><td style="font-family:var(--sans)">weakly ordered; needs sfence</td><td style="font-family:var(--sans)">framebuffers, GPU apertures</td></tr>' +
    '<tr><td>UC</td><td style="font-family:var(--sans)">not cached, each access sent</td><td style="font-family:var(--sans)">not cached, each access sent</td><td style="font-family:var(--sans)">strict program order; no speculative reads</td><td style="font-family:var(--sans)">device registers: the NVMe doorbell of [[ch:dev]]</td></tr>' +
    '<tr><td>UC-</td><td style="font-family:var(--sans)">as UC</td><td style="font-family:var(--sans)">as UC</td><td style="font-family:var(--sans)">an MTRR set to WC can override it</td><td style="font-family:var(--sans)">PAT-only variant of UC</td></tr>' +
    '<tr><td>WP</td><td style="font-family:var(--sans)">cached</td><td style="font-family:var(--sans)">not allocated; sent to memory, cached copies invalidated</td><td style="font-family:var(--sans)"></td><td style="font-family:var(--sans)">write-protected ranges</td></tr></table>' +
    '<p class="note" style="margin-top:6px">The type of an access comes from the ' + g('pat', 'PAT') + ' bits in the page-table entry (PAT, PCD, PWT: [[ch:xlate]] showed PCD = PWT = 0 for hist, which selects WB) combined with the MTRRs that cover the physical range.</p>';
  var ins = h('div', {'class': 'grid2'}, root);
  h('div', {'class': 'card'}, ins, '<h3>Cache-control and ordering instructions</h3><table class="mt"><tr><th>instruction</th><th>effect</th></tr>' +
    [['clflush', 'write the line back if dirty, invalidate it in every cache'], ['clflushopt', 'same, with weaker ordering so many can overlap'], ['clwb', 'write back but may keep the line cached'], ['prefetchw', 'fetch a line with intent to write (ownership)'], ['sfence', 'earlier stores (incl. NT/WC) become visible before later ones'], ['lfence', 'later instructions wait for earlier ones to complete locally; also a speculation barrier'], ['mfence', 'drain the store buffer before later loads; ~46.5 ticks measured'], ['lock add/xchg/cmpxchg', 'atomic read-modify-write; also a full barrier']]
    .map(function(r){ return '<tr><td>' + r[0] + '</td><td style="font-family:var(--sans)">' + r[1] + '</td></tr>'; }).join('') + '</table><p class="note" style="margin-top:6px">Which of these a CPU implements: look for <code>clflushopt</code> and <code>clwb</code> in the flags line of <code>/proc/cpuinfo</code>.</p>');
  h('div', {'class': 'card'}, ins, '<h3>What Linux emits on x86-64</h3><table class="mt"><tr><th>macro</th><th>instruction</th></tr>' +
    [['mb()', 'mfence'], ['rmb()', 'lfence'], ['wmb()', 'sfence'], ['smp_mb()', 'lock; addl $0,-4(%rsp)'], ['smp_rmb() / smp_wmb()', 'compiler barrier only'], ['smp_store_release()', 'plain store + compiler barrier'], ['smp_load_acquire()', 'plain load + compiler barrier']]
    .map(function(r){ return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') + '</table><p class="note" style="margin-top:6px">From <code>arch/x86/include/asm/barrier.h</code>. TSO already keeps load\u2192load, store\u2192store and load\u2192store order, so only store\u2192load needs a real instruction; a locked add to the stack is cheaper than mfence. The acquire/release pairs are the ones io_uring uses on its rings.</p>');
  return {key: stp.key};
}});
