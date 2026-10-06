/* ======================= chapter: one access end to end ======================= */
App.chapter({id: 'e2e', short: 'End to end', title: 'One hist[123]++, end to end',
lede: 'One instruction, <code>addq $1,(%rdx,%rax,8)</code> on <code>hist[123]</code>, with every stage from the other chapters on one timeline.',
points: ['Keep the single-access walkthrough, then explore a dependency graph or many concurrent requests.', 'Distinguish value readiness, retirement, service time, queueing and throughput.'],
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
  function steps(){ return App.E2E.steps(o); }
  var COL = {core: 'a3b', xlate: 'a4b', l1d: 'a2b', hier: 'a2b', dram: 'a1b', stores: 'a3b'};
  function draw(){
    if (PLATE) PLATE.set(o);
    var S = steps(), ghz = CFG.ghz, tot = 0;
    S.forEach(function(x){ tot += x.neg ? -x.c : x.c; });
    sv.innerHTML = ''; var x0 = 10, W = 980, acc = 0;
    s('text', {x: 10, y: 16, 'class': 'h'}, sv, 'Serialized teaching path: ' + tot + ' cycles = ' + (tot / ghz).toFixed(1) + ' ns at ' + ghz + ' GHz');
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
    }).join('') + '</table></div><p class="note" style="margin-top:8px"><b>input</b>: chosen teaching latency settings; not calibrated hardware measurements. <b>model</b>: teaching stage counts, not measured. <b>assumed</b> / <b>derived</b>: stated in the step. Row-hit savings are applied within the load stage so the drawn bar and total use the same time boundary. See [[ch:perf]] for evidence and measurement definitions.</p>';
    tbl.querySelectorAll('button.lnk').forEach(function(b){ b.onclick = function(){ App.go(b.dataset.ch); }; });
    sum.innerHTML = '<h3>After this instruction</h3><p>The line holding hist[123] is now Modified in core 0\u2019s L1d; DRAM is stale ([[chs:stores,coh]]).</p><p>A later eviction can write the line back down the hierarchy; another core can instead request ownership or a shared copy ([[chr:l1d,dram]]).</p><p>This later traffic is outside the instruction\u2019s dependency path but can compete for finite resources. Retiring a store is not the same event as making it visible to other cores.</p><p>Loop throughput depends on dependencies, forwarding, instruction mix and resource pressure. It cannot be inferred by inverting this single serialized instruction timeline. Compare the critical-path and steady-state modes.</p>';
  }
  var PLATE = App.Plates.e2e(root, o);
  App.onCfg(draw);
  draw();
  var critical=h('div',{'class':'e2e-critical'},root);App.Performance.criticalLab(critical);
  var steady=h('div',{'class':'e2e-steady'},root);App.Performance.streamLab(steady);
  var modes=h('div',{'class':'perf-actions e2e-modes','role':'group','aria-label':'End-to-end mode'},root), mode='single', buttons={};
  [['single','Single access'],['critical','Critical path'],['steady','Steady state']].forEach(function(v){var b=h('button',{type:'button','data-mode':v[0]},modes,v[1]);buttons[v[0]]=b;b.onclick=function(){location.hash='e2e/'+(v[0]==='single'?'scenario':v[0]);};});
  function choose(sid){
    mode=sid==='critical'||sid==='steady'?sid:'single';
    var sec=root.closest('.ch');if(!sec._sections)return;
    root.insertBefore(modes,root.firstChild);
    sec._sections.forEach(function(x){x.el.hidden=(x.id==='critical'||x.id==='steady'?x.id:'single')!==mode;});
    Object.keys(buttons).forEach(function(k){buttons[k].classList.toggle('on',mode===k);buttons[k].setAttribute('aria-pressed',String(mode===k));});
  }
  return {onShow:function(){choose(location.hash.split('/')[1]);},selectSection:choose};
}});
