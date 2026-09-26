/* ======================= chapter: the core ======================= */
App.chapter({id: 'core', short: 'Inside the core', title: 'Inside the core, cycle by cycle',
lede: 'The histogram loop running through a cycle-level model of an out-of-order core.',
points: ['Follow each instruction through fetch, decode, rename, scheduling, execution and retirement.', 'Stores wait in the store queue until they commit to the L1d.', 'Step one cycle at a time; every structure updates as you go.'],
build: function(root){
  var h = App.h, s = App.s, g = App.g, EX = App.EX, CFG = App.CFG, hx = App.hx;
  var sim = null, cur = 0, level = 'L1', timer = null, cols = [], prevSnap = null;
  function missLat(){ return level === 'L2' ? CFG.l2 : level === 'L3' ? CFG.l3 : level === 'DRAM' ? App.dramCycles() : 0; }

  /* ---------- intro ---------- */
  var intro = h('div', {'class': 'grid2 core-intro'}, root);
  h('div', {'class': 'card'}, intro,
    '<h3>What is running</h3><p><code>hist[data[i]]++</code> for 3 iterations with <code>data = {123, 123, 7}</code>, <code>hist[123] = 41</code>, <code>hist[7] = 9</code>. ' +
    'Iteration 2 reads <code>hist[123]</code> while iteration 1\'s store to it is still in flight, so it needs ' + g('stlf') + '. The loop branch is predicted taken every time, so the third <code>jne</code> ' + g('mispredict', 'mispredicts') + ' and everything fetched after it is ' + g('squash', 'squashed') + '.</p>' +
    '<p>Each instruction goes through up to 14 stages: <b>BP</b> ' + g('bp', 'predict') + ' · <b>IF</b> fetch from ' + g('l1i') + ' · <b>PD</b> ' + g('predecode') + ' · <b>DE</b> ' + g('decode') + ' · <b>UQ</b> ' + g('uq') + ' · <b>RN</b> ' + g('rename') + ' · <b>DS</b> ' + g('dispatch') +
    ' · <b>IS</b> ' + g('issue') + ' · <b>RR</b> register read · <b>EX/AG</b> execute or ' + g('agu', 'address generation') + ' · <b>D1</b> ' + g('dtlb') + ' + L1d tag · <b>D2</b> L1d data / SQ check · <b>WB</b> writeback + ' + g('wakeup') + ' · <b>RT</b> ' + g('retire') + ' · then <b>CM</b> ' + g('commit') + ' for stores.</p>');
  var sizes = h('div', {'class': 'card'}, intro);
  var R = PipeSim.REAL, C = PipeSim.CAP;
  sizes.innerHTML = '<h3>Model sizes vs. your Zen+ core</h3><p>Structures are scaled down so every entry fits on screen. Widths and ordering rules follow Zen+ closely; exact sizes do not.</p>' +
    '<table class="mt"><tr><th></th><th>model</th><th>Zen+</th></tr>' +
    [['rob', 'ROB', C.rob, R.rob], ['prf', 'physical registers', C.prf, R.prf], ['sched', 'ALU schedulers', C.alu, R.alu], ['sched', 'AGU schedulers', C.agu, R.agu],
     ['lq', 'load queue', C.lq, R.lq], ['sq', 'store queue', C.sq, R.sq], ['uq', 'µop queue', C.uq + ' instr', R.uq], ['mab', 'miss buffers', C.mab, R.mab],
     ['decode', 'fetch / decode width', '4', R.fetch], ['rename', 'rename width', '4', R.rename], ['retire', 'retire width', '4', R.retire]]
    .map(function(r){ return '<tr><td>' + g(r[0], r[1]) + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>'; }).join('') +
    '</table><p class="note">Load-to-use: L1 hit 4 cycles; misses use the values in the latency settings. Front end shortened to 4 stages. A misprediction measured on the Ryzen 7 3750H costs about 20.8 TSC ticks (~9 ns), which reflects the real, longer front end.</p>';

  /* ---------- controls ---------- */
  var ctl = h('div', {'class': 'card pctl core-controls'}, root);
  var row1 = h('div', {'class': 'stp'}, ctl);
  h('span', {'class': 'note'}, row1, 'data[] line is in:');
  App.seg(row1, [['L1', 'L1d (hit)'], ['L2', 'L2'], ['L3', 'L3'], ['DRAM', 'DRAM']], function(v){ level = v; run(); }, 'L1');
  var lvlNote = h('span', {'class': 'note'}, row1);
  var row2 = h('div', {'class': 'stp', style: 'margin-top:10px'}, ctl);
  var bFirst = h('button', null, row2, '\u23ee'), bPrev = h('button', null, row2, '\u2190 cycle'),
      cyc = h('span', {'class': 'cnt', style: 'min-width:92px'}, row2),
      bNext = h('button', {'class': 'pri'}, row2, 'cycle \u2192'), bPlay = h('button', null, row2, '\u25b6 play'),
      bEvt = h('button', null, row2, 'skip quiet cycles \u21e5');
  var slider = h('input', {type: 'range', min: 0, max: 1, value: 0, style: 'flex:1;min-width:140px'}, row2);
  bFirst.onclick = function(){ go(0); }; bPrev.onclick = function(){ go(cur - 1); }; bNext.onclick = function(){ go(cur + 1); };
  slider.oninput = function(){ go(+slider.value); };
  bPlay.onclick = function(){
    if (timer){ clearInterval(timer); timer = null; bPlay.innerHTML = '\u25b6 play'; return; }
    bPlay.innerHTML = '\u275a\u275a pause';
    timer = setInterval(function(){ if (cur >= sim.cycles - 1){ bPlay.onclick(); return; } go(cur + 1); }, 650);
  };
  bEvt.onclick = function(){
    for (var c = cur + 1; c < sim.cycles; c++) if (sim.snaps[c].ev.length){ go(c); return; }
    go(sim.cycles - 1);
  };

  /* ---------- floorplan ---------- */
  var fpw = h('div', {'class': 'scroller core-floorplan'}, root);
  var fp = s('svg', {viewBox: '0 0 1200 445', style: 'min-width:900px'}, fpw);
  s('defs', null, fp).innerHTML = '<marker id="pa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.6"/></marker>';
  var B = {};
  function blk(id, x, y, w, ht, title, sub){
    var gr = s('g', {'class':'core-block','data-core-block':id}, fp);
    s('rect', {x: x, y: y, width: w, height: ht, rx: 8, 'class': 'box'}, gr);
    s('text', {x: x + 8, y: y + 16, 'class': 'h'}, gr, title);
    var t2 = s('text', {x: x + w - 8, y: y + 16, 'class': 's m', 'text-anchor': 'end'}, gr, sub || '');
    B[id] = {g: gr, x: x, y: y, w: w, h: ht, sub: t2};
    return B[id];
  }
  function bar(b, n, y0, hh, x0, w0){
    var x = x0 !== undefined ? x0 : b.x + 8, w = w0 !== undefined ? w0 : b.w - 16, cw = w / n, cells = [];
    for (var i = 0; i < n; i++){
      var r = s('rect', {x: x + i * cw + 1, y: y0, width: cw - 2, height: hh, rx: 2, 'class': 'slot'}, b.g);
      var t = s('text', {x: x + i * cw + cw / 2, y: y0 + hh / 2 + 3.5, 'text-anchor': 'middle', 'class': 'slt m'}, b.g, '');
      cells.push({r: r, t: t});
    }
    return cells;
  }
  function wire(d){ return s('path', {d: d, 'class': 'wire', 'marker-end': 'url(#pa)'}, fp); }
  var yA = 30, yB = 140, yC = 250, yD = 350;
  blk('bp', 10, yA, 180, 72, 'Branch pred. · BTB'); B.bp.l = s('text', {x: 18, y: yA + 40, 'class': 'm', 'font-size': 11}, B.bp.g, ''); B.bp.l2 = s('text', {x: 18, y: yA + 58, 'class': 's'}, B.bp.g, '');
  blk('ic', 205, yA, 160, 72, 'L1i 64K · iTLB'); B.ic.l = s('text', {x: 213, y: yA + 40, 'class': 'm', 'font-size': 11}, B.ic.g, ''); s('text', {x: 213, y: yA + 58, 'class': 's'}, B.ic.g, '32-byte fetch window');
  blk('pd', 380, yA, 130, 72, 'Predecode'); B.pd.l = s('text', {x: 388, y: yA + 40, 'class': 'm', 'font-size': 11}, B.pd.g, ''); s('text', {x: 388, y: yA + 58, 'class': 's'}, B.pd.g, 'finds boundaries');
  blk('de', 525, yA, 240, 72, 'Decode ×4 · op cache'); B.de.c = bar(B.de, 4, yA + 30, 32);
  blk('uq', 780, yA, 410, 72, '\u00b5op queue'); B.uq.c = bar(B.uq, C.uq, yA + 30, 32);
  blk('rn', 880, yB, 310, 72, 'Rename · RAT · free list'); B.rn.l = s('text', {x: 888, y: yB + 40, 'class': 'm', 'font-size': 11}, B.rn.g, ''); B.rn.l2 = s('text', {x: 888, y: yB + 58, 'class': 's'}, B.rn.g, '');
  blk('ds', 680, yB, 185, 72, 'Dispatch / allocate'); B.ds.l = s('text', {x: 688, y: yB + 40, 'class': 'm', 'font-size': 11}, B.ds.g, ''); B.ds.l2 = s('text', {x: 688, y: yB + 58, 'class': 's'}, B.ds.g, '');
  blk('rob', 10, yB, 655, 72, 'ROB / retire queue \u2014 retires from the head, in order'); B.rob.c = bar(B.rob, C.rob, yB + 30, 32);
  blk('alus', 10, yC, 330, 72, 'ALU schedulers'); B.alus.c = bar(B.alus, C.alu, yC + 30, 32);
  blk('alup', 355, yC, 330, 72, 'ALU ports'); B.alup.c = bar(B.alup, 4, yC + 30, 32);
  blk('prf', 700, yC, 490, 72, 'Physical register file'); B.prf.c = [];
  for (var i = 0; i < C.prf; i++){
    var col = i % 24, rw = Math.floor(i / 24), x = 708 + col * 19.6, y = yC + 26 + rw * 22;
    var r = s('rect', {x: x, y: y, width: 18, height: 20, rx: 2, 'class': 'slot'}, B.prf.g);
    var t = s('text', {x: x + 9, y: y + 13.5, 'text-anchor': 'middle', 'class': 'slt m'}, B.prf.g, i);
    B.prf.c.push({r: r, t: t});
  }
  blk('agus', 10, yD, 250, 72, 'AGU schedulers'); B.agus.c = bar(B.agus, C.agu, yD + 30, 32);
  blk('agup', 275, yD, 200, 72, 'AGU ports'); B.agup.c = bar(B.agup, 2, yD + 30, 32);
  blk('lsu', 490, yD, 530, 72, 'Load/store unit');
  s('text', {x: 498, y: yD + 64, 'class': 's'}, B.lsu.g, 'load queue'); s('text', {x: 770, y: yD + 64, 'class': 's'}, B.lsu.g, 'store queue');
  B.lsu.lq = bar(B.lsu, C.lq, yD + 24, 26, 498, 260); B.lsu.sq = bar(B.lsu, C.sq, yD + 24, 26, 770, 240);
  blk('l2', 1035, yD, 155, 72, 'MAB \u2192 L2/L3/DRAM'); B.l2.c = bar(B.l2, C.mab, yD + 30, 32);
  wire('M 190 66 L 203 66'); wire('M 365 66 L 378 66'); wire('M 510 66 L 523 66'); wire('M 765 66 L 778 66');
  wire('M 985 102 L 985 138'); wire('M 880 176 L 867 176'); wire('M 680 176 L 667 176');
  wire('M 772 212 L 772 230 L 175 230 L 175 248'); wire('M 347 230 L 347 336 L 135 336 L 135 348');
  wire('M 340 286 L 353 286'); wire('M 685 286 L 698 286'); wire('M 260 386 L 273 386'); wire('M 475 386 L 488 386'); wire('M 1020 386 L 1033 386');
  s('text', {x: 22, y: 440, 'class': 's'}, fp, 'Orange = active this cycle. Slot colours: blue = waiting, amber = executing, green = done / ready, red = miss, purple = senior store.');

  /* ---------- events ---------- */
  var evc = h('div', {'class': 'card core-events'}, root);
  var evTitle = h('h3', null, evc), evList = h('ul', {'class': 'evl'}, evc);

  /* ---------- detail panels ---------- */
  var pg = h('div', {'class': 'pgrid core-state-grid'}, root);
  function panel(title, term, cap){ var p = h('div', {'class': 'card pp'}, pg); h('h3', null, p, (term ? g(term, title) : title) + (cap ? ' <span class="tag pub">' + cap + '</span>' : '')); return h('div', null, p); }
  var pFE = panel('Front end', null), pRN = panel('RAT', 'rat', 'rename'), pPRF = panel('Physical registers', 'prf', C.prf + ' of ' + R.prf),
      pROB = panel('ROB', 'rob', C.rob + ' of ' + R.rob), pSC = panel('Schedulers', 'sched'), pEX = panel('Execution ports', 'port'),
      pLQ = panel('Load queue', 'lq', C.lq + ' of ' + R.lq), pSQ = panel('Store queue', 'sq', C.sq + ' of ' + R.sq), pMEM = panel('DTLB · L1d · memory', null);

  /* ROB ring */
  var ring = s('svg', {viewBox: '0 0 260 260', 'class': 'ring'}, pROB), ringCells = [];
  var cx = 130, cy = 130, R1 = 118, R0 = 78;
  for (var k = 0; k < C.rob; k++){
    var a0 = (k / C.rob) * 2 * Math.PI - Math.PI / 2, a1 = ((k + 1) / C.rob) * 2 * Math.PI - Math.PI / 2, am = (a0 + a1) / 2;
    var p = function(rr, a){ return (cx + rr * Math.cos(a)).toFixed(1) + ' ' + (cy + rr * Math.sin(a)).toFixed(1); };
    var path = s('path', {d: 'M ' + p(R0, a0) + ' L ' + p(R1, a0) + ' A ' + R1 + ' ' + R1 + ' 0 0 1 ' + p(R1, a1) + ' L ' + p(R0, a1) + ' A ' + R0 + ' ' + R0 + ' 0 0 0 ' + p(R0, a0) + ' Z', 'class': 'slot'}, ring);
    var tt = s('text', {x: cx + (R0 + R1) / 2 * Math.cos(am), y: cy + (R0 + R1) / 2 * Math.sin(am) + 3.5, 'text-anchor': 'middle', 'class': 'slt m'}, ring, '');
    ringCells.push({r: path, t: tt, am: am});
  }
  var headM = s('text', {'class': 'm', 'font-size': 10, 'text-anchor': 'middle', fill: 'var(--ok)'}, ring, 'head');
  var tailM = s('text', {'class': 'm', 'font-size': 10, 'text-anchor': 'middle', fill: 'var(--a3)'}, ring, 'tail');
  var ringC = s('text', {x: cx, y: cy - 4, 'text-anchor': 'middle', 'class': 'h'}, ring, '');
  s('text', {x: cx, y: cy + 14, 'text-anchor': 'middle', 'class': 's'}, ring, 'entries in flight');
  var robList = h('div', {'class': 'note', style: 'margin-top:6px'}, pROB);

  /* ---------- gantt ---------- */
  var gc = h('div', {'class': 'card core-gantt'}, root);
  var gh = h('div', {'class': 'stp'}, gc);
  h('h3', {style: 'margin:0'}, gh, 'Pipeline diagram');
  h('span', {'class': 'grow'}, gh);
  var hideSq = h('label', {'class': 'note'}, gh, '<input type="checkbox"> hide squashed rows');
  hideSq.querySelector('input').onchange = function(){ paintGantt(); };
  h('p', {'class': 'note', style: 'margin:6px 0 8px'}, gc, 'Rows are \u00b5ops in program order, columns are cycles; it fills in as you step. Click a column header to jump. \u00b7 = waiting in a scheduler, fw = waiting for store data, ms = waiting on a miss, DA = data arrives, X = squashed, SB = senior store, CM = committed to L1d.');
  var gw = h('div', {'class': 'gantt-w'}, gc);

  function run(){
    if (timer) bPlay.onclick();
    sim = PipeSim.simulate({ex: EX, level: level, missLat: missLat()});
    lvlNote.textContent = level === 'L1' ? 'everything hits' : 'first touch of data[] costs ' + missLat() + ' cycles (latency settings)';
    slider.max = sim.cycles - 1;
    buildGantt(); prevSnap = null; go(0);
  }
  function buildGantt(){
    cols = []; var c = 0, n = sim.cycles;
    while (c < n){
      var e = c; while (e + 1 < n && !sim.snaps[e + 1].ev.length && !sim.snaps[c].ev.length) e++;
      if (e - c >= 5){ cols.push({a: c, b: e}); c = e + 1; } else { cols.push({a: c, b: c}); c++; }
    }
    var html = '<table class="gantt"><thead><tr><th class="lbl">\u00b5op</th>' + cols.map(function(co, i){ return '<th data-i="' + i + '">' + (co.a === co.b ? co.a : co.a + '\u2013' + co.b) + '</th>'; }).join('') + '</tr></thead><tbody>';
    sim.uops.forEach(function(u, ri){
      html += '<tr data-r="' + ri + '"><td class="lbl" title="' + u.asm + '">' + u.lbl + '</td>' + cols.map(function(co){
        var code = u.g[co.a] || ''; if (co.a !== co.b && !code) code = u.g[co.b] || '';
        return '<td class="k' + codeCls(code) + '">' + code + '</td>';
      }).join('') + '</tr>';
    });
    gw.innerHTML = html + '</tbody></table>';
    gw.querySelector('thead').onclick = function(e){ var i = e.target.dataset && e.target.dataset.i; if (i !== undefined) go(cols[+i].a); };
  }
  function codeCls(c){
    return {BP: ' fe', IF: ' fe', PD: ' fe', DE: ' fe', UQ: ' uq', RN: ' rn', DS: ' rn', '\u00b7': ' wt', IS: ' is', RR: ' ex', EX: ' ex', AG: ' ex', BR: ' ex', SD: ' ex',
            D1: ' mm', D2: ' mm', DA: ' mm', ms: ' ms', fw: ' ms', WB: ' wb', RT: ' rt', SB: ' sb', CM: ' cm', X: ' xx'}[c] || '';
  }
  function colOf(c){ for (var i = 0; i < cols.length; i++) if (c >= cols[i].a && c <= cols[i].b) return i; return 0; }
  function paintGantt(){
    var ci = colOf(cur), hide = hideSq.querySelector('input').checked;
    var trs = gw.querySelectorAll('tr');
    for (var r = 0; r < trs.length; r++){
      var cells = trs[r].children, ri = trs[r].dataset.r;
      if (ri !== undefined){
        var u = sim.uops[+ri], sq = u.squashedAt !== null && cur >= u.squashedAt;
        trs[r].className = (sq ? 'sqd' : '') + (u.g[cur] && u.g[cur] !== '\u00b7' && !sq ? ' act' : '');
        trs[r].style.display = (hide && sq) ? 'none' : '';
        var started = Object.keys(u.g).some(function(k){ return +k <= cur; });
        trs[r].style.opacity = started ? '' : '.25';
      }
      for (var k2 = 1; k2 < cells.length; k2++){
        cells[k2].classList.toggle('fut', cols[k2 - 1].a > cur);
        cells[k2].classList.toggle('cur', k2 - 1 === ci);
      }
    }
    var th = gw.querySelector('th[data-i="' + ci + '"]');
    if (th){ var box = gw.getBoundingClientRect(), tb = th.getBoundingClientRect(); if (tb.left < box.left + 60 || tb.right > box.right) gw.scrollLeft += tb.left - box.left - box.width / 2; }
  }

  /* ---------- render one cycle ---------- */
  function slotCls(st){ return 'slot ' + (st || ''); }
  function fill(cells, items){ cells.forEach(function(c, i){ var it = items[i]; c.r.setAttribute('class', slotCls(it ? it.c : '')); c.t.textContent = it ? it.t : ''; }); }
  function on(id, v){ B[id].g.setAttribute('class', v ? 'on' : ''); }
  function short(l){ return l.replace('.ld', '\u1d38').replace('.add', '+').replace('.sta', '\u02e2\u1d2c').replace('.std', '\u02e2\u1d30'); }
  function go(c){
    cur = Math.max(0, Math.min(sim.cycles - 1, c));
    var sn = sim.snaps[cur], pv = cur > 0 ? sim.snaps[cur - 1] : null;
    slider.value = cur; cyc.textContent = 'cycle ' + cur + ' / ' + (sim.cycles - 1);
    bPrev.disabled = bFirst.disabled = cur === 0; bNext.disabled = cur === sim.cycles - 1;
    var ustate = {}; sim.uops.forEach(function(u, i){ ustate[u.lbl] = sn.ustate[i]; });
    var stC = function(st){ return st === 'done' ? 'done' : st === 'exec' ? 'exec' : 'wait'; };
    /* floorplan */
    on('bp', sn.fe.BP.length); B.bp.l.textContent = sn.fetchPC ? 'fetch ' + sn.fetchPC.replace('0x5555555551', '\u2026') : 'idle';
    B.bp.l2.textContent = sn.fe.BP.length ? 'group: ' + sn.fe.BP.join(' ') : sn.nextPC === null ? 'no more fetch' : '';
    on('ic', sn.fe.IF.length); B.ic.l.textContent = sn.fe.IF.join(' ') || '\u2014';
    on('pd', sn.fe.PD.length); B.pd.l.textContent = sn.fe.PD.join(' ') || '\u2014';
    on('de', sn.fe.DE.length); fill(B.de.c, sn.fe.DE.map(function(l){ return {t: l, c: 'wait'}; }));
    on('uq', sn.uq.length); fill(B.uq.c, sn.uq.map(function(l){ return {t: l, c: 'wait'}; })); B.uq.sub.textContent = sn.uq.length + '/' + C.uq;
    on('rn', sn.rn.length); B.rn.l.textContent = sn.rn.length ? sn.rn.join(' ') : '\u2014'; B.rn.l2.textContent = 'free list: ' + sn.free.length + ' regs';
    on('ds', sn.rn.length || sn.stall); B.ds.l.textContent = sn.stall ? 'STALL' : sn.rn.length ? 'alloc ' + sn.rn.length + ' instr' : '\u2014'; B.ds.l2.textContent = sn.stall || '';
    var robItems = []; sn.rob.forEach(function(e, i){ robItems[i] = {t: e.lbl, c: e.st}; });
    fill(B.rob.c, robItems); B.rob.sub.textContent = sn.rob.length + '/' + C.rob; on('rob', sn.ev.some(function(e){ return / retires/.test(e); }));
    fill(B.alus.c, sn.alu.map(function(u){ return {t: u.lbl.split('.')[0], c: u.src.every(function(x){ return x.r; }) ? 'rdy' : 'wait'}; })); on('alus', sn.alu.length);
    fill(B.alup.c, ['ALU0', 'ALU1', 'ALU2', 'ALU3'].map(function(p){ return sn.issued[p] ? {t: short(sn.issued[p]), c: 'exec'} : null; })); on('alup', ['ALU0', 'ALU1', 'ALU2', 'ALU3'].some(function(p){ return sn.issued[p]; }));
    fill(B.agus.c, sn.agu.map(function(u){ return {t: u.lbl.split('.')[0], c: u.src.every(function(x){ return x.r; }) ? 'rdy' : 'wait'}; })); on('agus', sn.agu.length);
    fill(B.agup.c, ['AGU0', 'AGU1'].map(function(p){ return sn.issued[p] ? {t: short(sn.issued[p]), c: 'exec'} : null; })); on('agup', sn.issued.AGU0 || sn.issued.AGU1);
    B.prf.c.forEach(function(cc, i){ var r = sn.prf[i]; cc.r.setAttribute('class', 'slot ' + (i === 0 ? '' : !r.alloc ? '' : r.ready ? 'done' : 'wait')); });
    fill(B.lsu.lq, sn.lq.map(function(e){ return {t: e.lbl.split('.')[0], c: e.st === 'miss' ? 'miss' : /hit|forwarded|filled/.test(e.st) ? 'done' : e.st === 'waiting' ? 'wait' : 'exec'}; }));
    fill(B.lsu.sq, sn.sq.map(function(e){ return {t: e.lbl, c: e.senior ? 'sen' : e.addr && e.data ? 'done' : 'wait'}; }));
    on('lsu', sn.stages.AG.length || sn.stages.D1.length || sn.stages.D2.length || sn.stages.SD.length || sn.ev.some(function(e){ return /commits/.test(e); }));
    fill(B.l2.c, sn.mab.map(function(m){ return {t: m.lvl, c: 'miss'}; })); on('l2', sn.mab.length);
    /* events */
    evTitle.innerHTML = 'Cycle ' + cur + (sn.stall ? ' <span class="tag bad">rename stalled: ' + sn.stall + '</span>' : '') + ' <span class="tag pub">retired ' + sn.retired + ' \u00b7 IPC so far ' + (sn.retired / (cur + 1)).toFixed(2) + '</span>';
    evList.innerHTML = sn.ev.length ? sn.ev.map(function(e){ return '<li>' + e + '</li>'; }).join('') : '<li class="note">Nothing changes state this cycle' + (sn.mab.length ? ': every remaining \u00b5op is waiting on the outstanding miss.' : '.') + '</li>';
    /* front end panel */
    pFE.innerHTML = '<dl class="kv"><dt>BTB</dt><dd>jne at \u2026519f \u2192 \u20265190, predicted taken</dd><dt>next fetch</dt><dd>' + (sn.nextPC || 'none (ret fetched)') + '</dd></dl>' +
      ['BP', 'IF', 'PD', 'DE'].map(function(st){ return '<div class="lane"><span>' + st + '</span>' + (sn.fe[st].map(function(l){ return '<i>' + l + '</i>'; }).join('') || '<em>empty</em>') + '</div>'; }).join('') +
      '<div class="lane"><span>UQ</span>' + (sn.uq.map(function(l){ return '<i>' + l + '</i>'; }).join('') || '<em>empty</em>') + '</div>';
    /* rename panel */
    var archs = ['rax', 'rdi', 'rsi', 'rdx', 'rsp', 'flags'];
    pRN.innerHTML = '<table class="mt"><tr><th>arch</th><th>speculative</th><th>committed</th></tr>' + archs.map(function(a){
      var ch = pv && pv.rat[a] !== sn.rat[a];
      return '<tr' + (ch ? ' class="chg"' : '') + '><td>' + a + '</td><td>p' + sn.rat[a] + '</td><td>p' + sn.crat[a] + '</td></tr>';
    }).join('') + '</table><div class="note" style="margin-top:8px">' + g('freelist') + ' (' + sn.free.length + '): ' + sn.free.slice(0, 14).map(function(p){ return 'p' + p; }).join(' ') + (sn.free.length > 14 ? ' \u2026' : '') + '</div>';
    /* PRF panel */
    pPRF.innerHTML = '<div class="prfg">' + sn.prf.slice(1).map(function(r){
      var nw = pv && r.ready && !pv.prf[r.p].ready;
      var v = r.val === null ? '' : (r.val.length > 6 ? '\u2026' + BigInt(r.val).toString(16).slice(-4) : r.val);
      return '<div class="pr ' + (!r.alloc ? 'free' : r.ready ? 'rdy' : 'pend') + (nw ? ' nw' : '') + '"><b>p' + r.p + '</b><span>' + (r.alloc ? (r.ready ? v : '\u2026') : '') + '</span></div>';
    }).join('') + '</div><p class="note">Green = value ready (' + g('wakeup') + ' sent), outlined = allocated but not yet written, grey = free. Pointer values shown as \u2026last 4 hex digits.</p>';
    /* ROB ring */
    ringCells.forEach(function(rc){ rc.r.setAttribute('class', 'slot'); rc.t.textContent = ''; });
    sn.rob.forEach(function(e){ var rc = ringCells[e.slot]; rc.r.setAttribute('class', 'slot ' + e.st); rc.t.textContent = e.lbl; });
    function mark(el, slot, off){ var a = (slot / C.rob) * 2 * Math.PI - Math.PI / 2 + Math.PI / C.rob; el.setAttribute('x', (cx + (R1 + off) * Math.cos(a)).toFixed(1)); el.setAttribute('y', (cy + (R1 + off) * Math.sin(a) + 3).toFixed(1)); }
    ringC.textContent = sn.rob.length + ' / ' + C.rob;
    headM.style.display = sn.rob.length ? '' : 'none'; mark(headM, sn.robHead, -52); mark(tailM, sn.robTail, -52);
    headM.textContent = 'head'; tailM.textContent = sn.rob.length ? 'tail' : 'head = tail';
    robList.innerHTML = 'Oldest first: ' + (sn.rob.map(function(e){ return e.lbl + (e.st === 'done' ? '\u2713' : ''); }).join(' ') || 'empty') + '. Entries allocate at the tail and retire from the head; a squash moves the tail back.';
    /* schedulers */
    function sq(list){ return list.length ? list.map(function(u){ return '<div class="su"><b>' + u.lbl + '</b>' + u.src.map(function(x){ return '<span class="' + (x.r ? 'r' : 'n') + '">p' + x.p + '</span>'; }).join('') + '</div>'; }).join('') : '<em class="note">empty</em>'; }
    pSC.innerHTML = '<div class="note">ALU (' + sn.alu.length + '/' + C.alu + ')</div>' + sq(sn.alu) + '<div class="note" style="margin-top:8px">AGU (' + sn.agu.length + '/' + C.agu + ')</div>' + sq(sn.agu) +
      '<p class="note">Green source = physical register ready. A \u00b5op issues when all its sources are green and it is the oldest ready one for a port.</p>';
    /* execution */
    pEX.innerHTML = '<table class="mt"><tr><th>port</th><th>issued now</th></tr>' + ['ALU0', 'ALU1', 'ALU2', 'ALU3', 'AGU0', 'AGU1'].map(function(p){ return '<tr><td>' + p + '</td><td>' + (sn.issued[p] || '<em class="note">idle</em>') + '</td></tr>'; }).join('') + '</table>' +
      ['EX', 'AG', 'D1', 'D2', 'SD', 'WB'].map(function(st){ return '<div class="lane"><span>' + st + '</span>' + (sn.stages[st].map(function(l){ return '<i>' + l + '</i>'; }).join('') || '<em>\u2014</em>') + '</div>'; }).join('') +
      '<p class="note">EX includes branch resolution. D1 = ' + g('dtlb') + ' + L1d tag check, D2 = L1d data read and ' + g('sq', 'store-queue') + ' search.</p>';
    /* LQ / SQ */
    pLQ.innerHTML = sn.lq.length ? '<table class="mt"><tr><th>load</th><th>address</th><th>state</th></tr>' + sn.lq.map(function(e){ return '<tr><td>' + e.lbl + '</td><td class="m">' + (e.addr ? '\u2026' + e.addr.slice(-5) : '?') + '</td><td>' + e.st + (e.val !== null ? ' = ' + e.val : '') + '</td></tr>'; }).join('') + '</table>' : '<em class="note">empty</em>';
    pSQ.innerHTML = (sn.sq.length ? '<table class="mt"><tr><th>store</th><th>address</th><th>data</th><th></th></tr>' + sn.sq.map(function(e){ return '<tr><td>' + e.lbl + '</td><td class="m">' + (e.addr ? '\u2026' + e.addr.slice(-5) : '?') + '</td><td>' + (e.data || '?') + '</td><td>' + (e.senior ? '<span class="tag act">senior</span>' : '') + '</td></tr>'; }).join('') + '</table>' : '<em class="note">empty</em>') +
      '<p class="note">Address comes from the ' + g('sta') + ', data from the ' + g('std') + '. Only ' + g('senior', 'senior') + ' (retired) stores may ' + g('commit') + '.</p>';
    /* memory */
    var dl = sn.l1.data;
    pMEM.innerHTML = '<div class="note">' + g('dtlb', 'DTLB') + ' entries used (all hit)</div><table class="mt"><tr><th>VPN</th><th>PFN</th><th>covers</th></tr><tr><td>55555555a</td><td>1c07a</td><td>data[]</td></tr><tr><td>7ffd4a3c2</td><td>1a3f7c</td><td>hist[0..143], stack</td></tr><tr><td>7ffd4a3c3</td><td>0f9d2</td><td>hist[144..255]</td></tr></table>' +
      '<div class="note" style="margin-top:8px">L1d lines</div><table class="mt"><tr><th>line</th><th>set</th><th></th></tr><tr><td>data[0..63] \u2026a2c0</td><td>11</td><td>' + (dl ? '<span class="tag ok">present</span>' : '<span class="tag bad">absent</span>') + '</td></tr><tr><td>hist[123] \u20262e40</td><td>57</td><td><span class="tag ok">present</span></td></tr><tr><td>hist[7] \u20262a80</td><td>42</td><td><span class="tag ok">present</span></td></tr></table>' +
      (sn.mab.length ? '<div class="note" style="margin-top:8px">' + g('mab') + ': ' + sn.mab.map(function(m){ return m.line + ' from ' + m.lvl + ', arrives cycle ' + m.fillAt + ', ' + m.n + ' load(s) waiting'; }).join('; ') + '</div>' : '') +
      '<div class="note" style="margin-top:8px">Committed memory (what another core could read)</div><table class="mt"><tr><td>hist[123]</td><td><b>' + sn.mem.h123 + '</b></td><td>hist[7]</td><td><b>' + sn.mem.h7 + '</b></td></tr><tr><td>hist[46]</td><td>' + sn.mem.h46 + '</td><td>hist[200]</td><td>' + sn.mem.h200 + '</td></tr></table>';
    paintGantt();
    prevSnap = sn;
  }

  App.onCfg(function(){ if (sim) run(); });
  run();
  return {key: function(k){ if (k === 'ArrowRight'){ go(cur + 1); return true; } if (k === 'ArrowLeft'){ go(cur - 1); return true; } return false; }};
}});
