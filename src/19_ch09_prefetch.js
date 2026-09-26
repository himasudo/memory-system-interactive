/* ======================= chapter: prefetchers ======================= */
App.chapter({id: 'pref', short: 'Prefetchers', title: 'Prefetchers: fetching the next line before it is asked for',
lede: 'A prefetcher watches which lines a core touches and requests the next ones early.',
points: ['When the guess is right, a DRAM access is hidden.', 'When the access pattern has no structure, nothing can be predicted.', 'Change the pattern and the prefetch distance and compare the results.'],
build: function(root){
  var h = App.h, s = App.s, g = App.g, CFG = App.CFG;
  var pat = 'seq', dist = 4, onPF = true;
  var intro = h('div', {'class': 'grid2'}, root);
  h('div', {'class': 'card'}, intro, '<h3>What is modelled</h3><p>One detector watches the sequence of cache lines a load touches. When the distance between consecutive lines repeats (+1 for a ' + g('stream', 'stream') + ', +k for a ' + g('stride') + '), it becomes confident and requests the next <i>distance</i> lines ahead.</p><ul class="note-list"><li>A prefetch that arrives before the load: the load hits (covered).</li><li>One still in flight when the load arrives: ' + g('late') + '.</li><li>A line prefetched but never used: ' + g('pollute', 'pollution') + '.</li></ul><p>Latency per line = the DRAM value in the latency settings (' + App.dramCycles() + ' cycles now).</p>');
  h('div', {'class': 'card'}, intro, '<h3>What is not published</h3><p>Zen+ has hardware prefetchers at the L1d and at the L2. AMD does not publish their table sizes, confidence thresholds or prefetch distances.</p><p>The detector here uses one tracking entry, confidence after two matching deltas, and the distance you choose. Use it to reason about which access patterns can be predicted at all, not to predict exact numbers.</p>');
  var ctl = h('div', {'class': 'stp'}, root);
  App.seg(ctl, [['seq', 'data[]: sequential'], ['stride', 'stride of 3 lines'], ['hist', 'hist[data[i]]'], ['chase', 'pointer chase']], function(v){ pat = v; draw(); }, pat);
  h('span', {'class': 'note'}, ctl, 'distance:');
  App.seg(ctl, [[1, '1'], [2, '2'], [4, '4'], [8, '8']], function(v){ dist = v; draw(); }, dist);
  var tg = h('label', {'class': 'note'}, ctl, '<input type="checkbox" checked> prefetcher on');
  tg.querySelector('input').onchange = function(e){ onPF = e.target.checked; draw(); };
  var wrap = h('div', {'class': 'scroller'}, root);
  var sv = s('svg', {viewBox: '0 0 1200 520', style: 'min-width:900px'}, wrap);
  var note = h('div', {'class': 'card'}, root);

  function stream(){
    var L = [], i, rnd = 12345, R = function(){ rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd >> 16; };
    if (pat === 'seq') for (i = 0; i < 24; i++) L.push({line: i, gap: 100});
    if (pat === 'stride') for (i = 0; i < 16; i++) L.push({line: i * 3, gap: 60});
    if (pat === 'hist'){ var seen = []; for (i = 0; i < 40; i++){ L.push({line: R() % 16, gap: 30}); } }
    if (pat === 'chase'){ var perm = [], p; for (i = 0; i < 48; i++) perm.push(i); for (i = 47; i > 0; i--){ var j = R() % i; p = perm[i]; perm[i] = perm[j]; perm[j] = p; } for (i = 0; i < 16; i++) L.push({line: perm[i], gap: 5, dep: true}); }
    return L;
  }
  function simulate(){
    var D = App.dramCycles(), acc = stream(), cache = {}, inflight = {}, pfIssued = {}, t = 0, last = null, dlt = null, conf = 0, ev = [];
    var st = {hit: 0, cov: 0, late: 0, miss: 0, pf: 0, stall: 0};
    acc.forEach(function(a, i){
      var L = a.line, r = {i: i, line: L, t: t};
      if (cache[L] !== undefined && cache[L] <= t){ r.kind = pfIssued[L] && !pfIssued[L].used ? 'cov' : 'hit'; r.done = t + CFG.l1; }
      else if (cache[L] !== undefined){ r.kind = pfIssued[L] && !pfIssued[L].used ? 'late' : 'hit'; r.done = cache[L]; }
      else { r.kind = 'miss'; r.done = t + D; cache[L] = r.done; r.req = t; }
      if (pfIssued[L]) pfIssued[L].used = true;
      if (r.kind === 'hit') st.hit++; else if (r.kind === 'cov') st.cov++; else if (r.kind === 'late') st.late++; else st.miss++;
      st.stall += Math.max(0, r.done - t - CFG.l1);
      /* detector */
      if (last !== null){ var dd = L - last; if (dd !== 0 && dd === dlt) conf++; else conf = 0; dlt = dd; }
      last = L; r.conf = conf; r.dlt = dlt;
      if (onPF && conf >= 1){
        for (var k = 1; k <= dist; k++){ var nl = L + dlt * k; if (nl >= 0 && cache[nl] === undefined){ cache[nl] = t + D; pfIssued[nl] = {at: t, done: t + D, used: false}; st.pf++; ev.push({line: nl, at: t, done: t + D}); } }
      }
      ev.push(r);
      t = a.dep ? r.done + a.gap : Math.max(t + a.gap, r.kind === 'miss' || r.kind === 'late' ? r.done - a.gap * 0 : t + a.gap);
      if (!a.dep && (r.kind === 'miss' || r.kind === 'late')) t = Math.max(t, r.done);
    });
    st.useless = Object.keys(pfIssued).filter(function(k){ return !pfIssued[k].used; }).length;
    st.end = t; st.D = D;
    return {acc: ev.filter(function(e){ return e.kind; }), pf: ev.filter(function(e){ return !e.kind; }), st: st, pfIssued: pfIssued};
  }
  function draw(){
    var R = simulate(), st = R.st; sv.innerHTML = '';
    var tmax = Math.max(st.end, 1), X = function(t){ return 150 + (t / tmax) * 1020; };
    s('text', {x: 10, y: 22, 'class': 'h'}, sv, 'Each row is one access, top to bottom in program order; bars run from the access to its data');
    var n = R.acc.length, rh = Math.min(20, 400 / n);
    R.acc.forEach(function(a, i){
      var y = 40 + i * rh;
      s('text', {x: 10, y: y + rh * .7, 'class': 's m'}, sv, 'line ' + a.line);
      var cls = a.kind === 'miss' ? 'badb' : a.kind === 'late' ? 'a1b' : a.kind === 'cov' ? 'okb' : 'a4b';
      s('rect', {x: X(a.t), y: y + 1, width: Math.max(3, X(a.done) - X(a.t)), height: rh - 3, rx: 2, 'class': cls}, sv);
    });
    R.pf.forEach(function(p){
      var i = R.acc.findIndex(function(a){ return a.line === p.line; }), y = i >= 0 ? 40 + i * rh + rh / 2 : 40 + n * rh + 6;
      s('line', {x1: X(p.at), x2: X(p.done), y1: y, y2: y, stroke: 'var(--tx3)', 'stroke-width': 1, 'stroke-dasharray': '3 3'}, sv);
    });
    var ly = 40 + n * rh + 24;
    [['badb', 'miss: waits a full DRAM latency'], ['a1b', 'late prefetch: waits the rest'], ['okb', 'covered by a prefetch'], ['a4b', 'hit (line already cached)']].forEach(function(l, k){
      s('rect', {x: 150 + k * 260, y: ly, width: 16, height: 12, rx: 2, 'class': l[0]}, sv); s('text', {x: 172 + k * 260, y: ly + 11, 'class': 's'}, sv, l[1]);
    });
    s('text', {x: 150, y: ly + 34, 'class': 's'}, sv, 'dashed = prefetch in flight \u00b7 total time ' + st.end + ' cycles (' + (st.end / CFG.ghz).toFixed(0) + ' ns)');
    sv.setAttribute('viewBox', '0 0 1200 ' + (ly + 50));
    var tot = st.hit + st.cov + st.late + st.miss;
    var txt = {
      seq: 'The histogram reads <code>data[]</code> one byte per iteration, so it enters a new line every ~100 cycles (model). After two +1 steps the detector is confident.</p><p>With distance ' + dist + ', prefetches are issued ' + dist + ' lines (' + dist * 100 + ' cycles) ahead against a ' + st.D + '-cycle latency: ' + (dist * 100 >= st.D ? 'far enough, so accesses after warm-up are covered.' : 'not far enough, so prefetches are late and part of each latency remains.') + '</p><p>This is why simple sequential benchmarks rarely see the full DRAM latency.',
      stride: 'Every third line (for example one field of a 192-byte struct). The deltas repeat (+3), so a stride detector locks on exactly as a stream detector does for +1; the prefetches just skip lines.',
      hist: 'The loads of <code>hist[data[i]]</code> jump around 16 lines with no repeating delta, so the detector never becomes confident. It does not matter: after the first touch of each line everything hits, because the whole table fits in the L1d. Temporal locality, not prefetching, carries this access.',
      chase: 'Each address is the data returned by the previous load, and the next line is random. The detector sees no repeating delta.</p><p>Even a perfect predictor could not help: the address does not exist until the previous miss returns.</p><p>Every access pays the full latency, one after another. This is why latency benchmarks use a pointer chase.'
    }[pat];
    note.innerHTML = '<h3>' + {seq: 'Sequential', stride: 'Strided', hist: 'Data-dependent indices, small table', chase: 'Pointer chase'}[pat] + '</h3><p>' + txt + '</p><table class="mt" style="margin-top:8px"><tr><th>accesses</th><th>covered</th><th>late</th><th>misses</th><th>hits</th><th>prefetches issued</th><th>never used</th><th>stall cycles</th></tr><tr><td>' + tot + '</td><td>' + st.cov + '</td><td>' + st.late + '</td><td>' + st.miss + '</td><td>' + st.hit + '</td><td>' + st.pf + '</td><td>' + st.useless + '</td><td>' + st.stall + '</td></tr></table>' +
      '<p class="note" style="margin-top:8px">' + g('swpf', 'Software prefetch') + ' (<code>__builtin_prefetch(p, rw, locality)</code> \u2192 <code>prefetcht0/t1/t2/nta</code>, <code>prefetchw</code>) helps when the program knows an address early but the pattern defeats the hardware, for example the next node of a list whose pointer was loaded earlier.</p>';
  }
  App.onCfg(draw);
  draw();
}});
