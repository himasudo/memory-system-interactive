/* ======================= chapter: DRAM ======================= */
App.chapter({id: 'dram', num: '06', short: 'DRAM', title: 'DRAM: banks, rows and the commands behind one read',
sub: 'The memory controller turns each 64-byte read into DRAM commands. Whether the needed row is already open decides most of the time the DRAM itself spends.',
build: function(root){
  var h = App.h, s = App.s, g = App.g, hx = App.hx;
  var T = {tck: 0.833, CL: 17, RCD: 17, RP: 17, RAS: 39, BL: 4, RRDL: 6, CCDL: 6, RTP: 9};
  function ns(t){ return (t * T.tck).toFixed(1) + ' ns'; }
  function F(pa){ return {byte: Number(pa & 63n), ch: Number((pa >> 6n) & 1n), col: Number((pa >> 7n) & 127n), bank: Number((pa >> 14n) & 3n), bg: Number((pa >> 16n) & 3n), row: Number((pa >> 18n) & 0xffffn)}; }
  var REQ = [
    {id: 'A', what: 'hist[120..127] (C1.ld)', pa: 0x1a3f7ce40n, arr: 0, kind: 'closed', rd: 17},
    {id: 'D', what: 'data[0..63] (A1)', pa: 0x1c07a2c0n, arr: 0, kind: 'closed', rd: 23},
    {id: 'B', what: 'hist[136..143]', pa: 0x1a3f7cec0n, arr: 5, kind: 'hit', rd: 29},
    {id: 'C', what: 'a line 256 KB higher', pa: 0x1a3fbce40n, arr: 10, kind: 'conflict', rd: 73}
  ];
  REQ.forEach(function(r){ r.f = F(r.pa); r.data = r.rd + T.CL; });
  var CMD = [{t: 0, c: 'ACT', r: 'A', b: 3, x: 'row 26877'}, {t: 6, c: 'ACT', r: 'D', b: 2, x: 'row 1793'}, {t: 17, c: 'RD', r: 'A', b: 3, x: 'col 28'},
             {t: 23, c: 'RD', r: 'D', b: 2, x: 'col 69'}, {t: 29, c: 'RD', r: 'B', b: 3, x: 'col 29'}, {t: 39, c: 'PRE', r: 'C', b: 3, x: 'close'},
             {t: 56, c: 'ACT', r: 'C', b: 3, x: 'row 26878'}, {t: 73, c: 'RD', r: 'C', b: 3, x: 'col 28'}];
  function bank(b, t){
    if (b === 2) return t < 6 ? {row: null, st: 'idle'} : t < 23 ? {row: 1793, st: 'activating'} : {row: 1793, st: 'open'};
    if (t < 0) return {row: null, st: 'idle'}; if (t < 17) return {row: 26877, st: 'activating'}; if (t < 39) return {row: 26877, st: 'open'};
    if (t < 56) return {row: null, st: 'precharging'}; if (t < 73) return {row: 26878, st: 'activating'}; return {row: 26878, st: 'open'};
  }
  var intro = h('div', {'class': 'grid2'}, root);
  h('div', {'class': 'card'}, intro, '<h3>What sits behind the memory controller</h3><p>Each ' + g('channel') + ' is a 64-bit data bus plus a command/address bus. On it sits a ' + g('dimm', 'rank') + ' of eight x8 chips; each chip drives 8 of the 64 data bits. Inside every chip are 16 ' + g('bank', 'banks') + ' in 4 bank groups, and every bank is a matrix of ' + g('row', 'rows \u00d7 columns') + ' of ' + g('dramcell', '1-transistor-1-capacitor cells') + '. The controller (' + g('umc') + ') drives all eight chips in lockstep, so "row 26877 of bank 3" means that row in all eight chips at once.</p>');
  h('div', {'class': 'card'}, intro, '<h3>The timings used here</h3><table class="mt"><tr><th>name</th><th>meaning</th><th>tCK</th><th>ns</th></tr>' +
    [['CL', 'RD \u2192 first data', T.CL], ['tRCD', 'ACT \u2192 RD', T.RCD], ['tRP', 'PRE \u2192 next ACT', T.RP], ['tRAS', 'ACT \u2192 PRE (minimum)', T.RAS], ['BL8', '8 data beats', T.BL], ['tRRD_L', 'ACT \u2192 ACT, same bank group', T.RRDL], ['tCCD_L', 'RD \u2192 RD, same bank group', T.CCDL], ['tRTP', 'RD \u2192 PRE', T.RTP]]
    .map(function(r){ return '<tr><td>' + r[0] + '</td><td style="font-family:var(--sans)">' + r[1] + '</td><td>' + r[2] + '</td><td>' + (r[2] * T.tck).toFixed(1) + '</td></tr>'; }).join('') +
    '</table><p class="note" style="margin-top:6px">A common laptop DDR4-2400 CL17 bin (tCK = 0.833 ns), JEDEC-style values. Your modules may differ: <code>sudo decode-dimms</code> or <code>sudo dmidecode -t memory</code> shows what is installed. Example: one rank of x8 chips per channel.</p>');

  var wrap = h('div', {'class': 'scroller'}, root);
  var sv = s('svg', {viewBox: '0 0 1200 730', style: 'min-width:920px'}, wrap);
  var E = {};
  function box(x, y, w, ht, t){ var gr = s('g', null, sv); s('rect', {x: x, y: y, width: w, height: ht, rx: 9, 'class': 'box'}, gr); if (t) s('text', {x: x + 10, y: y + 20, 'class': 'h'}, gr, t); return gr; }
  E.q = box(10, 10, 590, 190, 'UMC request queue \u2014 channel 1');
  var QX = [22, 42, 196, 300, 334, 376, 436, 470];
  ['', 'line', 'PA', 'BG', 'bank', 'row', 'col', 'row state'].forEach(function(t, k){ s('text', {x: QX[k], y: 46, 'class': 's'}, E.q, t); });
  E.qr = REQ.map(function(r, i){
    var y = 56 + i * 34, R = {bg: s('rect', {x: 16, y: y, width: 578, height: 28, rx: 4, 'class': 'sunk'}, E.q)};
    [r.id, r.what, hx(r.pa), r.f.bg, r.f.bank, r.f.row, r.f.col, r.kind].forEach(function(t, k){ var tx = s('text', {x: QX[k], y: y + 19, 'class': k === 1 || k === 7 ? '' : 'm', 'font-size': 11.5}, E.q, String(t)); if (k === 7) R.kind = tx; });
    return R;
  });
  E.a = box(612, 10, 578, 190, 'Physical address \u2192 DRAM coordinates (example layout)');
  var FL = [['row', 33, 18, 'a1'], ['BG', 17, 16, 'a3'], ['bank', 15, 14, 'a3'], ['column', 13, 7, 'a2'], ['ch', 6, 6, 'a4'], ['byte', 5, 0, 'act']], bw = 15.6, bx = 626;
  E.af = FL.map(function(f){
    var n = f[1] - f[2] + 1, x = bx + (33 - f[1]) * bw, w = n * bw;
    s('rect', {x: x + 1, y: 44, width: w - 2, height: 34, rx: 4, 'class': f[3] === 'act' ? 'sunk' : f[3] + 'b'}, E.a);
    s('text', {x: x + w / 2, y: 94, 'text-anchor': 'middle', 'class': 's'}, E.a, f[0]);
    s('text', {x: x + w / 2, y: 108, 'text-anchor': 'middle', 'class': 's m'}, E.a, f[1] + (f[1] !== f[2] ? ':' + f[2] : ''));
    return {t: s('text', {x: x + w / 2, y: 66, 'text-anchor': 'middle', 'class': 'm', 'font-size': 12}, E.a, ''), f: f};
  });
  E.aT = s('text', {x: 626, y: 134, 'font-size': 12.5}, E.a, ''); E.aT2 = s('text', {x: 626, y: 150, 'class': 's'}, E.a, 'Real AMD controllers XOR-hash bank and channel bits with higher address bits;');
  s('text', {x: 626, y: 168, 'class': 's'}, E.a, 'the exact mapping is set by firmware and not published per board.');
  E.bk = box(10, 214, 470, 250, 'One x8 chip: 4 bank groups \u00d7 4 banks');
  E.cells = [];
  for (var bg = 0; bg < 4; bg++) for (var b = 0; b < 4; b++){
    var x = 22 + bg * 113, y = 238 + b * 55;
    E.cells.push({bg: bg, b: b, r: s('rect', {x: x, y: y, width: 105, height: 48, rx: 5, 'class': 'sunk'}, E.bk), t: s('text', {x: x + 8, y: y + 18, 'class': 's m'}, E.bk, 'BG' + bg + ' \u00b7 B' + b), v: s('text', {x: x + 8, y: y + 38, 'class': 'm', 'font-size': 11.5}, E.bk, '')});
  }
  E.z = box(492, 214, 698, 250, 'Inside bank 3 of bank group 3');
  s('rect', {x: 504, y: 244, width: 64, height: 176, rx: 5, 'class': 'a1b'}, E.z); s('text', {x: 536, y: 330, 'text-anchor': 'middle', 'class': 's', transform: 'rotate(-90 536 330)'}, E.z, 'row decoder');
  E.zr = [];
  for (var i = 0; i < 9; i++){ var ry = 250 + i * 18; E.zr.push({l: s('rect', {x: 578, y: ry, width: 430, height: 14, rx: 2, 'class': 'sunk'}, E.z), t: s('text', {x: 586, y: ry + 11, 'class': 'm', 'font-size': 10}, E.z, 'row ' + (26874 + i))}); }
  E.rb = s('rect', {x: 578, y: 418, width: 430, height: 30, rx: 4, 'class': 'box'}, E.z);
  E.rbT = s('text', {x: 588, y: 438, 'font-size': 12}, E.z, '');
  E.cm = s('rect', {x: 1020, y: 244, width: 160, height: 204, rx: 5, 'class': 'box'}, E.z);
  s('text', {x: 1030, y: 266, 'class': 'h'}, E.z, 'column mux + I/O');
  E.cmT = [0, 1, 2, 3, 4].map(function(k){ return s('text', {x: 1030, y: 292 + k * 20, 'font-size': 11.5}, E.z, ''); });
  E.tl = box(10, 478, 1180, 244, 'Commands and data on channel 1 (x axis: clock cycles, 1 tCK = 0.833 ns)');
  var TX = function(t){ return 120 + t * 10.5; }, LY = {CMD: 520, B3: 566, B2: 612, DQ: 658};
  [['CMD', 'command bus'], ['B3', 'BG3 bank 3'], ['B2', 'BG3 bank 2'], ['DQ', 'data bus (64-bit)']].forEach(function(l){ s('text', {x: 20, y: LY[l[0]] + 5, 'class': 's'}, E.tl, l[1]); s('line', {x1: 120, x2: 1170, y1: LY[l[0]], y2: LY[l[0]], stroke: 'var(--bd)'}, E.tl); });
  for (var t = 0; t <= 100; t += 10){ s('line', {x1: TX(t), x2: TX(t), y1: 684, y2: 690, stroke: 'var(--tx3)'}, E.tl); s('text', {x: TX(t), y: 706, 'text-anchor': 'middle', 'class': 's'}, E.tl, t + (t % 20 === 0 ? ' (' + (t * T.tck).toFixed(0) + ' ns)' : '')); }
  E.dyn = s('g', null, E.tl);

  var FR = [
    {p: 'map', t: -1, n: 0, sel: 'A', h: 'Physical address \u2192 DRAM coordinates', d: 'The controller slices each physical address into channel, bank group, bank, row and column. This page uses a simple example layout: bits 5:0 = byte in the 64-byte burst, bit 6 = channel, bits 13:7 = column (64-byte units), 15:14 = bank, 17:16 = bank group, 33:18 = row. Four reads are queued, all on channel 1: A is C1\u2019s <code>hist[123]</code> line from Chapter 05 (PA 0x1a3f7ce40), D is the <code>data[]</code> line, B is another hist line in the <b>same row</b> as A, and C is 256 KB above A: same bank, <b>different row</b>.'},
    {p: 'ACT A', t: 0, n: 1, sel: 'A', h: 't = 0: ACT opens row 26877 in bank 3', d: 'Bank 3 is idle (precharged). ' + g('act', 'ACT') + ' drives one wordline: every cell on row 26877 shares its capacitor charge with its bitline. The sense amplifiers turn each tiny voltage swing into a full 0 or 1 and latch it, so the whole row \u2014 1 KB per chip, 8 KB across the rank \u2014 now sits in the ' + g('rowbuf') + '. Reading drained the capacitors, so the sense amps also drive the values back into the cells. A column can be read only tRCD = 17 cycles (14.2 ns) later.'},
    {p: 'ACT D', t: 6, n: 2, sel: 'D', h: 't = 6: ACT in bank 2, in parallel', d: 'D\u2019s line is in bank 2 of the same bank group. Banks are independent arrays with their own row buffers, so row 1793 opens while bank 3 is still activating. The only spacing rule between the two ACTs is tRRD_L (6 cycles here). This is bank-level parallelism: the controller keeps several banks busy to hide per-bank latency.'},
    {p: 'RD A', t: 17, n: 3, sel: 'A', h: 't = 17: RD column 28 \u2192 64 bytes', d: 'RD selects column 28 of the open row. CL = 17 cycles later the chips drive data: 8 beats (burst length 8) on the 64-bit bus, 8 bytes per beat, <b>64 bytes = one cache line</b>. Each x8 chip supplies 8 bits of every beat. A found the row closed, so ACT \u2192 last data = tRCD + CL + 4 = 38 cycles = <b>31.7 ns</b>. This is the device time only; controller queues and the fabric add the rest of the load-to-use latency.'},
    {p: 'RD D', t: 23, n: 4, sel: 'D', h: 't = 23: RD in bank 2', d: 'D\u2019s RD must wait for its own tRCD (6 + 17 = 23) and for tCCD_L after A\u2019s RD (17 + 6 = 23), since both are in bank group 3. Its burst follows A\u2019s on the shared data bus: the bus, not the banks, is the resource the two reads share.'},
    {p: 'RD B', t: 29, n: 5, sel: 'B', h: 't = 29: B is a row hit', d: 'B needs row 26877 of bank 3 \u2014 already in the row buffer. No ACT: RD \u2192 data is only CL + 4 = 21 cycles = <b>17.5 ns</b>. Controllers prefer requests that hit open rows and may serve them ahead of older ones; AMD does not publish its exact scheduling policy.'},
    {p: 'PRE', t: 39, n: 6, sel: 'C', h: 't = 39: row conflict, PRE closes row 26877', d: 'C needs row 26878 in the same bank, and a bank holds one open row. The controller must close 26877 with ' + g('act', 'PRE') + ' first, which is allowed only tRAS = 39 cycles after that row\u2019s ACT (and tRTP after the last RD, 29 + 9 = 38). The cells were restored during tRAS; PRE returns the bitlines to their idle voltage.'},
    {p: 'ACT C', t: 56, n: 7, sel: 'C', h: 't = 56: ACT row 26878', d: 'tRP = 17 cycles after PRE, the bank can activate again.'},
    {p: 'RD C', t: 73, n: 8, sel: 'C', h: 't = 73: RD, data at 90\u201394', d: 'tRCD later, RD; CL later, data. The minimum cost of a row conflict is tRP + tRCD + CL + 4 = 55 cycles = <b>45.8 ns</b>; C waited 84 cycles (70 ns) from its arrival because PRE also had to respect tRAS. Row hit 17.5 ns, row closed 31.7 ns, row conflict 45.8 ns or more: the same 64-byte read costs up to 2.6\u00d7 more depending on what the bank was doing.'},
    {p: 'REF', t: 100, n: 8, sel: null, ref: true, h: 'Refresh', d: 'Cell capacitors leak. Every 7.8 \u00b5s (tREFI) the controller closes all banks of the rank and issues ' + g('refresh', 'REF') + '; for tRFC (350 ns for 8 Gb chips, JEDEC) the rank serves no reads. 8192 REF commands every 64 ms cover every row. A read that arrives during tRFC waits for it: one source of the spread visible in a measured DRAM-latency plateau.'}
  ];
  var stp = App.stepper(root, {render: draw});
  function draw(ff){
    var fr = ff.fr;
    var sel = REQ.filter(function(r){ return r.id === fr.sel; })[0] || REQ[0], f = sel.f;
    E.af.forEach(function(a){ var v = {row: f.row, BG: f.bg, bank: f.bank, column: f.col, ch: f.ch, byte: f.byte}[a.f[0]]; a.t.textContent = String(v); });
    E.aT.textContent = fr.ref ? 'refresh applies to every row of every bank' : sel.id + ': PA ' + hx(sel.pa) + ' \u2192 ch ' + f.ch + ', BG ' + f.bg + ', bank ' + f.bank + ', row ' + f.row + ', column ' + f.col;
    E.qr.forEach(function(R, i){ R.bg.setAttribute('class', REQ[i] === sel && !fr.ref ? 'on box' : 'sunk'); });
    E.q.setAttribute('class', fr.p === 'map' ? 'on' : ''); E.a.setAttribute('class', fr.p === 'map' ? 'on' : '');
    var tt = Math.max(fr.t, 0);
    E.cells.forEach(function(c){
      var st = c.bg === 3 && (c.b === 3 || c.b === 2) && fr.t >= 0 ? bank(c.b, tt) : {row: null, st: 'idle'};
      if (fr.ref) st = {row: null, st: 'refresh'};
      c.v.textContent = st.st === 'idle' ? '\u2014' : st.st === 'refresh' ? 'REF' : (st.row !== null ? 'row ' + st.row : '') + (st.st === 'precharging' ? 'PRE' : '');
      c.r.setAttribute('class', st.st === 'open' ? 'okb' : st.st === 'activating' ? 'a4b' : st.st === 'precharging' ? 'badb' : st.st === 'refresh' ? 'a3b' : 'sunk');
    });
    var b3 = fr.ref ? {row: null, st: 'refresh'} : fr.t < 0 ? {row: null, st: 'idle'} : bank(3, tt);
    E.zr.forEach(function(z, i){ var rn = 26874 + i; z.l.setAttribute('class', b3.row === rn ? (b3.st === 'open' ? 'okb' : 'a4b') : 'sunk'); });
    E.rb.setAttribute('class', b3.row !== null ? 'okb' : b3.st === 'precharging' ? 'badb' : 'box');
    E.rbT.textContent = fr.ref ? 'refresh: all rows rewritten over 64 ms' : b3.row !== null ? 'row buffer (sense amps): row ' + b3.row + (b3.st === 'activating' ? ' \u2014 sensing, tRCD running' : ' \u2014 open') : b3.st === 'precharging' ? 'precharging: bitlines returning to the idle voltage' : 'row buffer empty (bank precharged)';
    var rd = CMD.slice(0, fr.n).filter(function(c){ return c.c === 'RD' && c.b === 3; }).pop();
    var cmt = rd && !fr.ref && (fr.p === 'RD A' || fr.p === 'RD B' || fr.p === 'RD C') ? ['column ' + rd.x.split(' ')[1] + ' selected', '8 beats \u00d7 8 bits', 'from this chip', '\u00d7 8 chips = 64 bits', 'per beat \u2192 64 B'] : ['idle', '', '', '', ''];
    E.cmT.forEach(function(t, k){ t.textContent = cmt[k]; }); E.cm.setAttribute('class', cmt[0] !== 'idle' ? 'okb' : 'box');
    /* timeline */
    E.dyn.innerHTML = '';
    var upto = fr.ref ? 100 : Math.max(0, fr.t);
    [[3, 'B3'], [2, 'B2']].forEach(function(bb){
      var segs = [], prev = null, start = 0;
      for (var t2 = 0; t2 <= upto; t2++){ var st = bank(bb[0], t2).st; if (st !== prev){ if (prev && prev !== 'idle') segs.push([start, t2, prev]); prev = st; start = t2; } }
      if (prev && prev !== 'idle' && upto > start) segs.push([start, upto, prev]);
      segs.forEach(function(sg){ s('rect', {x: TX(sg[0]), y: LY[bb[1]] - 10, width: Math.max(2, TX(sg[1]) - TX(sg[0])), height: 20, rx: 3, 'class': sg[2] === 'open' ? 'okb' : sg[2] === 'activating' ? 'a4b' : 'badb'}, E.dyn); });
    });
    CMD.slice(0, fr.n).forEach(function(c, k){
      var cur = k === fr.n - 1 && !fr.ref;
      s('rect', {x: TX(c.t) - 1, y: LY.CMD - 11, width: 34, height: 22, rx: 3, 'class': cur ? 'on box' : c.c === 'PRE' ? 'badb' : c.c === 'ACT' ? 'a4b' : 'okb'}, E.dyn);
      s('text', {x: TX(c.t) + 16, y: LY.CMD + 4, 'text-anchor': 'middle', 'class': 'm', 'font-size': 10}, E.dyn, c.c);
      s('text', {x: TX(c.t) + 16, y: LY.CMD - 15, 'text-anchor': 'middle', 'class': 's'}, E.dyn, c.r);
      if (c.c === 'RD'){
        var r = REQ.filter(function(q){ return q.id === c.r; })[0];
        s('rect', {x: TX(r.data), y: LY.DQ - 11, width: TX(r.data + T.BL) - TX(r.data), height: 22, rx: 3, 'class': 'a2b'}, E.dyn);
        s('text', {x: TX(r.data) + 21, y: LY.DQ + 4, 'text-anchor': 'middle', 'class': 'm', 'font-size': 10}, E.dyn, r.id + ' 64B');
      }
    });
    if (fr.t >= 0 && !fr.ref) s('line', {x1: TX(fr.t), x2: TX(fr.t), y1: 500, y2: 684, stroke: 'var(--act)', 'stroke-width': 2, 'stroke-dasharray': '4 3'}, E.dyn);
    E.tl.setAttribute('class', fr.t >= 0 && !fr.ref ? 'on' : '');
    E.qr.forEach(function(R, i){ var r = REQ[i]; R.kind.textContent = r.kind + (fr.ref || (fr.n >= 8 || (r.id === 'A' && fr.n >= 3) || (r.id === 'D' && fr.n >= 4) || (r.id === 'B' && fr.n >= 5)) ? ' \u2192 done ' + (r.data + T.BL) : ''); });
  }
  stp.set(FR.map(function(f){ return {p: f.p, t: f.h, d: f.d, fr: f}; }));
  var cards = h('div', {'class': 'grid3'}, root);
  h('div', {'class': 'card'}, cards, '<h3>Three prices for the same read</h3><table class="mt"><tr><th>row state</th><th>commands</th><th>device time</th></tr><tr><td>hit</td><td>RD</td><td>21 tCK \u00b7 17.5 ns</td></tr><tr><td>closed</td><td>ACT, RD</td><td>38 tCK \u00b7 31.7 ns</td></tr><tr><td>conflict</td><td>PRE, ACT, RD</td><td>55+ tCK \u00b7 45.8+ ns</td></tr></table><p class="note" style="margin-top:6px">Device time from the command to the last data beat. Load-to-use latency also includes the core, caches, fabric and controller queues.</p>');
  h('div', {'class': 'card'}, cards, '<h3>Why a cache line is 64 bytes, from this side</h3><p>DDR4 transfers in ' + g('burst', 'bursts') + ' of 8 beats on a 64-bit bus: 8 \u00d7 8 B = 64 B. One burst is one line, and the fixed costs (ACT, CL, command slots) are paid once per burst. Chapter 04\u2019s line size and this burst size were chosen together.</p>');
  h('div', {'class': 'card'}, cards, '<h3>Why DRAM needs rows at all</h3><p>One cell is a transistor and a capacitor holding a few femtocoulombs. Sensing it requires a sense amplifier, which is large, so each bank has one row of them shared by all its rows. Opening a row moves thousands of bits into those amplifiers at once; after that, column reads are cheap. The same small charge is why cells leak and need ' + g('refresh') + '.</p>');
  return {key: stp.key};
}});
