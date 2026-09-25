/* ======================= chapter: down the hierarchy ======================= */
App.chapter({id: 'hier', num: '05', short: 'Down the hierarchy', title: 'Down the hierarchy: L2, L3, fabric, DRAM',
sub: 'When the L1d misses, the request moves outward until some level has the line, and the line comes back the same way. Where it is found decides the load-to-use latency shown below.',
build: function(root){
  var h = App.h, s = App.s, g = App.g, CFG = App.CFG, hx = App.hx;
  var PA = 0x1a3f7ce58n, LINE = PA & ~63n;
  var l2set = Number((PA >> 6n) & 1023n), l3set = Number((PA >> 6n) & 4095n);
  var mode = 'DRAM';
  var intro = h('div', {'class': 'grid2'}, root);
  h('div', {'class': 'card'}, intro, '<h3>Same address, bigger caches</h3><p>The line is PA <code>' + hx(LINE) + '</code>. The L2 (512 KB, 8-way) has 1024 sets; a straightforward PA[15:6] indexing model gives <b>set ' + l2set + '</b>. The L3 (4 MB, 16-way) has 4096 logical set slots across four slices; this diagram labels the line by PA[17:6] as logical set <b>' + l3set + '</b>. The exact address-to-slice and set mapping on this laptop is not established here. Beyond the L1, physical bits above bit 11 can affect selection, so translation must complete before an L2 lookup.</p>');
  h('div', {'class': 'card'}, intro, '<h3>Who keeps copies of what</h3><p>The L2 is ' + g('incl', 'inclusive') + ' of its L1s: evicting a line from L2 also removes it from L1. The L3 is a ' + g('victimc') + ': lines enter it only when an L2 evicts them, and it is mostly exclusive of the L2s (it keeps a copy when the line looks shared by several cores). It also holds ' + g('shadow') + ' of all four L2s, so it knows which core may have a line without asking them.</p>');

  var ctl = h('div', {'class': 'stp'}, root);
  h('span', {'class': 'note'}, ctl, 'the line for hist[123] is in:');
  App.seg(ctl, [['L2', 'core 0\u2019s L2'], ['L3', 'the L3'], ['peer', 'core 2\u2019s L2 (modified)'], ['DRAM', 'only DRAM']], function(v){ mode = v; frames(); }, mode);

  var wrap = h('div', {'class': 'scroller'}, root);
  var sv = s('svg', {viewBox: '0 0 1200 560', style: 'min-width:900px'}, wrap);
  var P = {};
  function box(id, x, y, w, ht, t, sub, cls){ var gr = s('g', null, sv); s('rect', {x: x, y: y, width: w, height: ht, rx: 9, 'class': cls || 'box'}, gr); if (t) s('text', {x: x + 10, y: y + 18, 'class': 'h'}, gr, t); if (sub) s('text', {x: x + 10, y: y + 35, 'class': 's'}, gr, sub); P[id] = gr; return gr; }
  function wire(id, d, ret){ P[id] = s('path', {d: d, 'class': 'wire', 'stroke-width': 2}, sv); P[id].ret = ret; return P[id]; }
  box('core0', 20, 18, 320, 140, 'Core 0');
  box('l1', 30, 50, 140, 96, 'LSU + L1d', 'misses here', 'a4b');
  box('mab', 185, 50, 145, 96, 'MAB', 'one entry per missing line', 'a4b');
  box('l2', 20, 190, 320, 60, 'L2 \u00b7 core 0', '512 KB \u00b7 8-way \u00b7 set ' + l2set, 'a2b');
  [1, 2, 3].forEach(function(n, k){
    var x = 370 + k * 200;
    box('c' + n, x, 18, 180, 140, 'Core ' + n, 'same structure as core 0');
    box('c' + n + 'l2', x, 190, 180, 60, 'L2 \u00b7 core ' + n, '512 KB', 'a2b');
  });
  box('l3', 20, 282, 930, 96, 'L3 \u00b7 4 MB \u00b7 16-way \u00b7 set ' + l3set + ' \u00b7 victim cache', '', 'a2b');
  for (var k = 0; k < 4; k++){ s('rect', {x: 30 + k * 228, y: 310, width: 218, height: 30, rx: 5, 'class': 'box'}, P.l3); s('text', {x: 40 + k * 228, y: 330, 'class': 's'}, P.l3, 'slice ' + k + ' \u00b7 1 MB'); }
  P.sh = s('g', null, sv); s('rect', {x: 30, y: 346, width: 910, height: 24, rx: 5, 'class': 'a3b'}, P.sh); s('text', {x: 40, y: 363, 'font-size': 12}, P.sh, 'shadow tags: a copy of every L2 tag array in the CCX (probe filter)');
  box('df', 20, 410, 1160, 40, 'Infinity Fabric (data fabric)', '', 'a3b');
  box('umc', 20, 480, 520, 66, 'Memory controllers: UMC 0 \u00b7 UMC 1', 'queues, address mapping, DRAM commands');
  box('dram', 640, 480, 540, 66, 'DDR4 channel A \u00b7 channel B', 'rows, banks, ACT / RD / PRE (Chapter 06)');
  box('meter', 980, 18, 200, 360, 'Elapsed');
  P.mT = []; for (k = 0; k < 12; k++) P.mT.push(s('text', {x: 992, y: 70 + k * 24, 'font-size': k === 0 ? 22 : 12, 'class': k === 0 ? 'm' : ''}, P.meter, ''));
  wire('a1', 'M 90 146 L 90 188');
  wire('a2', 'M 150 250 L 150 280');
  wire('a3', 'M 660 282 L 660 252');
  wire('a4', 'M 480 378 L 480 408');
  wire('a5', 'M 280 450 L 280 478');
  wire('a6', 'M 540 513 L 638 513');
  wire('r1', 'M 120 188 L 120 148', 1);
  wire('r2', 'M 190 280 L 190 252', 1);
  wire('r3', 'M 690 252 L 690 280 L 700 280', 1);
  wire('r4', 'M 250 408 L 8 408 L 8 254 L 120 254 L 120 250', 1);
  s('text', {x: 258, y: 398, 'class': 's'}, sv, '');
  P.r4t = s('text', {x: 20, y: 396, 'class': 's'}, sv, '');
  var stp = App.stepper(root, {render: draw});

  function frames(){
    var L2 = CFG.l2, L3 = CFG.l3, D = App.dramCycles(), ns = function(c){ return (c / CFG.ghz).toFixed(1) + ' ns'; };
    var fr = [], F = function(p, t, d, on, m){ fr.push({p: p, t: t, d: d, on: on, m: m}); };
    F('L1 miss', 'The L1d misses', 'The tag compare of Chapter 04 finds no match. A ' + g('mab') + ' entry records the missing line PA <code>' + hx(LINE) + '</code> and which loads wait for it; later loads to the same line merge into this entry. The request goes to the L2.', ['l1', 'mab', 'a1'], ['request sent', 'L1 load-to-use would', 'have been ' + CFG.l1 + ' cycles']);
    if (mode === 'L2'){
      F('L2 hit', 'L2 lookup: hit', 'The L2 indexes set ' + l2set + ' with PA bits 15:6 and compares 8 tags. Hit.', ['l2', 'a1'], ['L2 tag compare']);
      F('fill', 'The line comes back', 'The L1\u2013L2 path is 32 bytes wide, so the 64-byte line takes 2 transfers. It is filled into the L1d (the L1 victim, if dirty, is written into the L2 copy it already has) and the waiting load wakes up. <b>Total \u2248 ' + L2 + ' cycles = ' + ns(L2) + '</b>.', ['l2', 'r1', 'l1'], [L2 + ' cycles', ns(L2), '', 'L2 hit, published', 'minimum: 12 cycles']);
    } else {
      F('L2 miss', 'L2 lookup: miss', 'Set ' + l2set + ', 8 tags, no match. The L2 has its own miss tracking: up to 50 outstanding L2\u2192L3 misses per core on Zen/Zen+. The request goes to the L3.', ['l2', 'a2'], ['L2 missed', 'request to L3']);
      if (mode === 'L3'){
        F('L3 hit', 'L3 lookup: hit', 'The addressed slice checks the line (logical set ' + l3set + ' in this diagram): hit. In parallel the ' + g('shadow') + ' confirm no other L2 holds the line, so no probe is needed. Slice selection is a model here, not a published mapping for this laptop.', ['l3', 'sh', 'a2'], ['L3 tag compare']);
        F('move up', 'The line moves up, a victim moves down', 'The line goes to core 0\u2019s L2 and L1d. Because the L3 is mostly exclusive, it normally drops its own copy. The L2 had to evict something from set ' + l2set + ' to make room: that victim goes <b>into</b> the L3. This is the only way the L3 gets filled. <b>Total \u2248 ' + L3 + ' cycles = ' + ns(L3) + '</b>.', ['l3', 'r2', 'r1', 'l2', 'l1'], [L3 + ' cycles', ns(L3), '', 'published Zen/Zen+', 'L3 average: ~35']);
      } else if (mode === 'peer'){
        F('shadow tags', 'L3 miss, but the shadow tags know', 'The L3 does not have the line, but its copy of core 2\u2019s L2 tags does: core 2 holds it <b>modified</b> (its value is newer than DRAM). Reading DRAM would return stale data.', ['l3', 'sh', 'a2'], ['L3 missed', 'shadow tag hit:', 'core 2']);
        F('probe', 'Probe core 2', 'The L3 sends a ' + g('probe') + ' only to core 2 (the other L2s are not disturbed). Core 2\u2019s L2 returns the 64 bytes. Under ' + g('moesi') + ' it keeps its dirty copy as <b>Owned</b> and core 0 gets it <b>Shared</b>; DRAM is not written (Chapter 08). AMD does not publish this latency; a core-to-core ping-pong benchmark measures it.', ['a3', 'c2l2', 'r3', 'r2', 'r1', 'l2', 'l1'], ['cache-to-cache', 'latency: measure it', '(not published)']);
      } else {
        F('L3 miss', 'L3 miss, shadow tags miss', 'Neither the L3 nor any CPU L2 in this CCX has the line. The request leaves the CCX through the fabric for system memory. The L3-hit load-to-use figure is a comparison baseline, not a measured timestamp for this step.', ['l3', 'sh', 'a4'], ['L3 missed', 'L3-hit baseline:', CFG.l3 + ' cycles load-to-use']);
        F('fabric', 'Fabric to the memory controller', 'The fabric routes by physical address to the memory controller for the channel that owns this line. On Zen/Zen+ the fabric clock is reported to equal the memory clock, so faster DIMMs also speed up this hop. Up to 96 L3\u2192memory misses can be outstanding.', ['df', 'a5', 'umc'], ['in the fabric']);
        F('DRAM', 'DRAM access', 'The controller turns the request into DRAM commands: open the row if needed (ACT), read the column (RD), close rows that conflict (PRE). Chapter 06 steps through exactly this address.', ['umc', 'a6', 'dram'], ['DRAM access', 'see Chapter 06']);
        F('return', 'The line returns to L2 and L1, not L3', 'Data comes back through the fabric straight to core 0\u2019s L2 and then the L1d. The L3 does <b>not</b> keep a copy: as a victim cache it only receives lines the L2 later evicts. <b>Total \u2248 ' + D + ' cycles = ' + ns(D) + '</b> with the current latency settings (L3 ' + CFG.l3 + ' cycles + ' + CFG.dramNs + ' ns).', ['df', 'r4', 'r1', 'l2', 'l1'], [D + ' cycles', ns(D), '', 'L3 + DRAM extra,', 'from latency settings']);
      }
    }
    stp.set(fr);
  }
  function draw(f){
    for (var id in P){ if (!P[id] || !P[id].setAttribute || id === 'mT' || id === 'r4t') continue;
      var act = f.on.indexOf(id) >= 0;
      if (P[id].tagName === 'path') P[id].setAttribute('class', 'wire' + (act ? ' on flow' : ''));
      else P[id].setAttribute('class', act ? 'on' : '');
      if (P[id].tagName === 'path' && act) P[id].style.stroke = P[id].ret ? 'var(--a2)' : 'var(--act)';
      else if (P[id].tagName === 'path') P[id].style.stroke = '';
    }
    P.r4t.textContent = f.on.indexOf('r4') >= 0 ? 'data returns to the L2; the L3 is bypassed' : '';
    P.mT.forEach(function(t, i){ t.textContent = f.m[i] || ''; });
  }
  frames();

  /* ---------- ladder ---------- */
  var lad = h('div', {'class': 'card'}, root);
  var lsv = s('svg', {viewBox: '0 0 1000 250', style: 'width:100%;height:auto;display:block'}, lad);
  var cap = h('p', {'class': 'note'}, lad);
  function ladder(){
    lsv.innerHTML = '';
    var L = [['L1d', CFG.l1], ['L2', CFG.l2], ['L3', CFG.l3], ['DRAM', App.dramCycles()]], mx = Math.log10(App.dramCycles() * 1.3);
    s('text', {x: 10, y: 20, 'class': 'h'}, lsv, 'Load-to-use latency, log scale');
    L.forEach(function(r, i){
      var y = 40 + i * 50, w = Math.max(6, (Math.log10(r[1]) / mx) * 680);
      s('text', {x: 10, y: y + 22, 'class': 'h'}, lsv, r[0]);
      s('rect', {x: 80, y: y, width: w, height: 32, rx: 4, 'class': ['a4b', 'a2b', 'a3b', 'a1b'][i]}, lsv);
      s('text', {x: 88 + w, y: y + 21, 'class': 'm', 'font-size': 12}, lsv, r[1] + ' cycles \u00b7 ' + (r[1] / CFG.ghz).toFixed(1) + ' ns \u00b7 ' + (r[1] / CFG.l1).toFixed(0) + '\u00d7 L1');
    });
    cap.innerHTML = 'Values come from the latency settings: published Zen/Zen+ figures unless you entered your own. A pointer-chase, working-set-size sweep measures these four plateaus directly on real hardware.';
  }
  ladder();

  /* ---------- MLP ---------- */
  var mlp = h('div', {'class': 'card'}, root);
  h('h3', null, mlp, 'Four misses: overlapped or serialized');
  var msv = s('svg', {viewBox: '0 0 1000 300', style: 'width:100%;height:auto;display:block'}, mlp);
  var mcap = h('p', null, mlp);
  function mlpDraw(){
    msv.innerHTML = ''; var D = App.dramCycles(), tot = 4 * D + 20, X = function(c){ return 150 + (c / tot) * 820; };
    s('text', {x: 10, y: 22, 'class': 'h'}, msv, 'independent: a[0], a[64], a[128], a[192]');
    for (var i = 0; i < 4; i++){ s('rect', {x: X(i), y: 32 + i * 22, width: X(i + D) - X(i), height: 16, rx: 3, 'class': 'a4b'}, msv); s('text', {x: 10, y: 45 + i * 22, 'class': 's'}, msv, 'miss ' + (i + 1)); }
    s('text', {x: X(D + 3) + 6, y: 110, 'class': 'm', 'font-size': 12}, msv, 'all done at \u2248 ' + (D + 3) + ' cycles');
    s('text', {x: 10, y: 152, 'class': 'h'}, msv, 'dependent: p = p->next, four times');
    for (i = 0; i < 4; i++){ s('rect', {x: X(i * D), y: 162 + i * 22, width: X((i + 1) * D) - X(i * D), height: 16, rx: 3, 'class': 'a1b'}, msv); s('text', {x: 10, y: 175 + i * 22, 'class': 's'}, msv, 'miss ' + (i + 1)); }
    s('text', {x: Math.min(X(4 * D) - 180, 800), y: 270, 'class': 'm', 'font-size': 12}, msv, 'done at \u2248 ' + 4 * D + ' cycles');
    s('line', {x1: 150, x2: 970, y1: 285, y2: 285, 'class': 'wire'}, msv);
    s('text', {x: 150, y: 298, 'class': 's'}, msv, '0'); s('text', {x: 970, y: 298, 'class': 's', 'text-anchor': 'end'}, msv, tot + ' cycles');
    mcap.innerHTML = 'Independent addresses are all known up front, so the core issues the four loads within a few cycles and the misses overlap (' + g('mlp') + '). A pointer chase cannot: each address is the previous load\u2019s data, so each miss starts only when the last one finishes. Zen/Zen+ track 50 outstanding L2\u2192L3 misses per core and 96 L3\u2192memory, so the independent case scales far past four. This gap is why Block C uses pointer chasing to measure true latency.';
  }
  mlpDraw();

  var bus = h('div', {'class': 'card'}, root);
  bus.innerHTML = '<h3>The wires between the levels</h3><table class="mt"><tr><th>link</th><th>width</th><th>one 64-byte line</th><th>source</th></tr>' +
    '<tr><td>L1d \u2194 L2</td><td>32 B / cycle</td><td>2 transfers</td><td>WikiChip</td></tr>' +
    '<tr><td>L2 \u2194 L3</td><td>32 B / cycle</td><td>2 transfers</td><td>WikiChip</td></tr>' +
    '<tr><td>DDR4-2400 channel</td><td>8 B \u00d7 2400 MT/s = 19.2 GB/s peak</td><td>8 transfers = 3.3 ns</td><td>DDR4 arithmetic</td></tr>' +
    '<tr><td>both channels</td><td>38.4 GB/s peak</td><td></td><td>DDR4 arithmetic</td></tr></table>' +
    '<p class="note" style="margin-top:8px">Peak numbers only. Sustained bandwidth is lower: DRAM spends time on row switches and refresh (Chapter 06).</p>';
  App.onCfg(function(){ frames(); ladder(); mlpDraw(); });
  return {key: stp.key};
}});
