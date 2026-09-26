/* ======================= chapter: one access end to end ======================= */
App.chapter({id: 'e2e', short: 'End to end', title: 'One hist[123]++, end to end',
lede: 'One instruction, <code>addq $1,(%rdx,%rax,8)</code> on <code>hist[123]</code>, with every stage from the other chapters on one timeline.',
points: ['Choose where the translation is found, where the line is found, and whether the DRAM row is open.', 'Read off the critical path and its total latency.'],
build: function(root){
  var h = App.h, s = App.s, g = App.g, CFG = App.CFG;
  var o = {tlb: 'hit', lvl: 'DRAM', row: 'closed'};
  var ctl = h('div', {'class': 'card'}, root);
  var r1 = h('div', {'class': 'stp'}, ctl); h('span', {'class': 'note', style: 'min-width:120px'}, r1, 'translation:');
  App.seg(r1, [['hit', 'DTLB hit'], ['walk', 'page walk']], function(v){ o.tlb = v; draw(); }, o.tlb);
  var r2 = h('div', {'class': 'stp', style: 'margin-top:8px'}, ctl); h('span', {'class': 'note', style: 'min-width:120px'}, r2, 'hist[123] line in:');
  App.seg(r2, [['L1', 'L1d'], ['L2', 'L2'], ['L3', 'L3'], ['DRAM', 'DRAM']], function(v){ o.lvl = v; draw(); }, o.lvl);
  var r3 = h('div', {'class': 'stp', style: 'margin-top:8px'}, ctl); h('span', {'class': 'note', style: 'min-width:120px'}, r3, 'DRAM row:');
  App.seg(r3, [['hit', 'open (row hit)'], ['closed', 'closed'], ['conflict', 'conflict']], function(v){ o.row = v; draw(); }, o.row);
  var bar = h('div', {'class': 'scroller', style: 'padding:10px'}, root);
  var sv = s('svg', {viewBox: '0 0 1000 120', style: 'width:100%;min-width:640px;height:auto;display:block'}, bar);
  var tbl = h('div', {'class': 'card'}, root);
  var sum = h('div', {'class': 'card'}, root);
  function steps(){
    var ghz = CFG.ghz, S = [];
    var add = function(n, c, src, ch, what){ S.push({n: n, c: Math.max(0, Math.round(c)), src: src, ch: ch, what: what}); };
    add('front end: fetch, predecode, decode, \u00b5op queue', 5, 'model', 'core', 'L1i hit, op cache or decoders');
    add('rename + dispatch', 2, 'model', 'core', 'RAT, free list, ROB, scheduler, LQ/SQ entries');
    add('wait for rax from A1 (data[] load, L1d hit)', CFG.l1, 'published', 'core', 'the address depends on this load');
    add('AGU: rdx + rax\u00d78', 1, 'model', 'core', 'VA 0x7ffd4a3c2e58');
    if (o.tlb === 'walk') add('DTLB + L2 TLB miss, page walk', 2 * CFG.l2 + 2, 'assumed', 'xlate', 'PML4E/PDPTE from the walk cache, PDE and PTE from L2');
    var lat = o.lvl === 'L1' ? CFG.l1 : o.lvl === 'L2' ? CFG.l2 : o.lvl === 'L3' ? CFG.l3 : App.dramCycles();
    add('load hist[123]: ' + {L1: 'L1d hit', L2: 'L1 miss, L2 hit', L3: 'L2 miss, L3 hit', DRAM: 'miss to DRAM'}[o.lvl], lat, 'published', o.lvl === 'L1' ? 'l1d' : o.lvl === 'DRAM' ? 'dram' : 'hier', o.lvl === 'DRAM' ? 'L3 ' + CFG.l3 + ' cycles + ' + CFG.dramNs + ' ns (latency settings)' : 'load-to-use');
    if (o.lvl === 'DRAM' && o.row !== 'closed') add(o.row === 'hit' ? 'row already open: saves ACT' : 'row conflict: extra PRE', (o.row === 'hit' ? -14.2 : 14.2) * ghz, 'derived', 'dram', 'device-time difference from [[ch:dram]] (\u00b1 14.2 ns)');
    add('add: tmp + 1', 1, 'published', 'core', '1-cycle ALU op');
    add('store address + data into the SQ', 2, 'model', 'core', 'STA / STD');
    add('retire (older instructions already done)', 1, 'model', 'core', 'ROB head');
    add('commit to L1d: line is E after the load, becomes M', 1, 'model', 'stores', 'no RFO needed');
    S.forEach(function(x){ if (x.n.indexOf('row already open') === 0) x.neg = true; });
    return S;
  }
  var COL = {core: 'a3b', xlate: 'a4b', l1d: 'a2b', hier: 'a2b', dram: 'a1b', stores: 'a3b'};
  function draw(){
    var S = steps(), ghz = CFG.ghz, tot = 0;
    S.forEach(function(x){ tot += x.neg ? -x.c : x.c; });
    sv.innerHTML = ''; var x0 = 10, W = 980, acc = 0;
    s('text', {x: 10, y: 16, 'class': 'h'}, sv, 'Critical path: ' + tot + ' cycles = ' + (tot / ghz).toFixed(1) + ' ns at ' + ghz + ' GHz');
    S.forEach(function(x){
      if (x.neg) return;
      var w = (x.c / (tot + (S.filter(function(y){ return y.neg; }).reduce(function(a, y){ return a + y.c; }, 0)))) * W;
      s('rect', {x: x0 + acc, y: 28, width: Math.max(1.5, w), height: 40, 'class': COL[x.ch] || 'box'}, sv); acc += w;
    });
    var mem = S.filter(function(x){ return /load hist|page walk|row/.test(x.n); }).reduce(function(a, x){ return a + (x.neg ? -x.c : x.c); }, 0);
    s('text', {x: 10, y: 92, 'font-size': 13}, sv, 'Time spent waiting for translation and data: ' + Math.round(100 * mem / tot) + '%. Everything else together: ' + (tot - mem) + ' cycles.');
    s('text', {x: 10, y: 112, 'class': 's'}, sv, 'Bar widths are proportional to time; tiny segments are the pipeline stages.');
    var cum = 0;
    tbl.innerHTML = '<h3>Step by step</h3><div style="overflow-x:auto"><table class="mt" style="min-width:560px"><tr><th>step</th><th>cycles</th><th>ns</th><th>total</th><th>source</th><th></th></tr>' + S.map(function(x){
      cum += x.neg ? -x.c : x.c;
      return '<tr><td style="font-family:var(--sans)">' + x.n + '<div class="note">' + x.what + '</div></td><td>' + (x.neg ? '\u2212' : '') + x.c + '</td><td>' + (x.c / ghz).toFixed(1) + '</td><td>' + cum + '</td><td><span class="tag ' + (x.src === 'published' ? 'pub' : x.src === 'model' ? '' : 'act') + '">' + x.src + '</span></td><td><button class="lnk" data-ch="' + x.ch + '">chapter \u2192</button></td></tr>';
    }).join('') + '</table></div><p class="note" style="margin-top:8px"><b>published</b>: Zen/Zen+ figures from the latency settings (replace them with your own measured plateaus). <b>model</b>: the stage counts of the [[ch:core]] model, not measured. <b>assumed</b> / <b>derived</b>: stated in the step.</p>';
    tbl.querySelectorAll('button.lnk').forEach(function(b){ b.onclick = function(){ App.go(b.dataset.ch); }; });
    sum.innerHTML = '<h3>After this instruction</h3><p>The line holding hist[123] is now Modified in core 0\u2019s L1d; DRAM is stale ([[chs:stores,coh]]).</p><p>Nothing else happens to it until it is evicted, when its 64 bytes are written back to the L2, later enter the L3 as a victim, and eventually reach DRAM through the controller as a write ([[chr:l1d,dram]]).</p><p>That write-back is off the critical path of this instruction; the core keeps running.</p><p>For comparison: at ' + ghz + ' GHz the loop body runs about one iteration per cycle when everything hits ([[ch:core]]). A single miss to DRAM costs the time of hundreds of iterations, which is why the hierarchy, the prefetchers and memory-level parallelism exist.</p>';
  }
  App.onCfg(draw);
  draw();
}});
