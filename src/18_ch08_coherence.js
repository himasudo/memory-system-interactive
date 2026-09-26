/* ======================= chapter: coherence ======================= */
App.chapter({id: 'coh', short: 'Coherence', title: 'Four cores, one line: MOESI coherence',
lede: 'Each core has private caches, yet all cores must agree on the order of writes to each address.',
points: ['The coherence protocol tracks ownership per 64-byte line.', 'Step through reads and writes and watch each line change state between cores.', 'Two unrelated variables in one line can slow each other down: false sharing.'],
build: function(root){
  var h = App.h, s = App.s, g = App.g;
  var LN = ['A', 'F', 'G1', 'G2'], LD = {A: 'hist[120..127]', F: 'struct { long a, b; }', G1: 'a, padded to its own line', G2: 'b, padded to its own line'};
  var SC = {
    share: {n: 'Read sharing, write, owner', ops: [[0, 'r', 'A'], [1, 'r', 'A'], [2, 'r', 'A'], [3, 'w', 'A'], [0, 'r', 'A'], [1, 'r', 'A'], [3, 'e', 'A']]},
    fs: {n: 'False sharing', ops: [[0, 'w', 'F', 'a'], [1, 'w', 'F', 'b'], [0, 'w', 'F', 'a'], [1, 'w', 'F', 'b'], [0, 'w', 'F', 'a'], [1, 'w', 'F', 'b']]},
    pad: {n: 'Same writes, padded', ops: [[0, 'w', 'G1', 'a'], [1, 'w', 'G2', 'b'], [0, 'w', 'G1', 'a'], [1, 'w', 'G2', 'b'], [0, 'w', 'G1', 'a'], [1, 'w', 'G2', 'b']]},
    free: {n: 'Your own sequence', ops: []}
  };
  var cur = 'share';
  var intro = h('div', {'class': 'grid2'}, root);
  h('div', {'class': 'card'}, intro, '<h3>The five states</h3><table class="mt"><tr><th></th><th>dirty?</th><th>other copies?</th><th>may write without asking?</th></tr>' +
    '<tr><td>' + g('st_m', 'M') + '</td><td>yes</td><td>none</td><td>yes</td></tr><tr><td>' + g('st_o', 'O') + '</td><td>yes</td><td>possible (S)</td><td>no</td></tr><tr><td>' + g('st_e', 'E') + '</td><td>no</td><td>none</td><td>yes (becomes M)</td></tr><tr><td>' + g('st_s', 'S') + '</td><td>no*</td><td>possible</td><td>no</td></tr><tr><td>' + g('st_i', 'I') + '</td><td colspan="3" style="font-family:var(--sans)">no usable copy</td></tr></table><p class="note" style="margin-top:6px">* An S copy can be newer than DRAM when some cache holds the line in O. AMD64 uses ' + g('moesi') + '; the O state lets a dirty line be shared without first writing it to DRAM.</p>');
  h('div', {'class': 'card'}, intro, '<h3>Who is asked</h3><p>On this single-CCX APU every request that misses a core\u2019s L2 reaches the L3. Its ' + g('shadow') + ' record which cores hold each line, so ' + g('probe', 'probes') + ' go only to those cores (a ' + g('pfilter') + '), never to all four. This model shows one private cache per core (L1 + L2 together) and counts every message.</p>');
  var ctl = h('div', {'class': 'stp'}, root);
  App.seg(ctl, Object.keys(SC).map(function(k){ return [k, SC[k].n]; }), function(v){ cur = v; run(false); }, cur);
  var free = h('div', {'class': 'card', style: 'display:none'}, root);
  free.innerHTML = '<div class="cohbtns"></div><p class="note">Each click adds one operation to the end of the sequence and jumps to it.</p>';
  var fb = free.querySelector('.cohbtns');
  [0, 1, 2, 3].forEach(function(c){
    var d = h('div', null, fb, '<b>core ' + c + '</b>');
    [['r', 'A', 'read A'], ['w', 'A', 'write A'], ['e', 'A', 'evict A'], ['w', 'F', 'write F.' + (c % 2 ? 'b' : 'a')]].forEach(function(o){
      var b = h('button', null, d, o[2]); b.onclick = function(){ SC.free.ops.push([c, o[0], o[1], c % 2 ? 'b' : 'a']); run(true); };
    });
  });
  h('button', null, fb, 'clear').onclick = function(){ SC.free.ops = []; run(false); };
  var wrap = h('div', {'class': 'scroller'}, root);
  var sv = s('svg', {viewBox: '0 0 1200 430', style: 'min-width:900px'}, wrap);
  s('defs', null, sv).innerHTML = '<marker id="ca" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9z" fill="context-stroke"/></marker>';
  var CX = [155, 450, 745, 1040], E = {cores: []};
  [0, 1, 2, 3].forEach(function(c){
    var x = 20 + c * 295, gr = s('g', null, sv);
    s('rect', {x: x, y: 10, width: 275, height: 170, rx: 9, 'class': 'box'}, gr);
    s('text', {x: x + 10, y: 30, 'class': 'h'}, gr, 'Core ' + c + ' \u2014 private cache');
    var rows = LN.map(function(L, k){
      var y = 44 + k * 32;
      var r = s('rect', {x: x + 10, y: y, width: 255, height: 26, rx: 4, 'class': 'sunk'}, gr);
      s('text', {x: x + 20, y: y + 18, 'class': 'm', 'font-size': 12}, gr, L);
      var st = s('text', {x: x + 70, y: y + 19, 'class': 'm', 'font-size': 15, 'font-weight': 600}, gr, '');
      var v = s('text', {x: x + 100, y: y + 18, 'font-size': 11.5}, gr, '');
      return {r: r, st: st, v: v};
    });
    E.cores.push({g: gr, rows: rows});
  });
  E.l3 = s('g', null, sv); s('rect', {x: 20, y: 222, width: 1160, height: 76, rx: 9, 'class': 'a3b'}, E.l3);
  s('text', {x: 32, y: 244, 'class': 'h'}, E.l3, 'L3 shadow tags: which cores hold each line');
  E.l3T = s('text', {x: 32, y: 270, 'class': 'm', 'font-size': 12.5}, E.l3, ''); E.l3T2 = s('text', {x: 32, y: 290, 'class': 's'}, E.l3, '');
  E.dr = s('g', null, sv); s('rect', {x: 20, y: 340, width: 1160, height: 76, rx: 9, 'class': 'box'}, E.dr);
  s('text', {x: 32, y: 362, 'class': 'h'}, E.dr, 'DRAM');
  E.drT = s('text', {x: 32, y: 388, 'class': 'm', 'font-size': 12.5}, E.dr, ''); E.drT2 = s('text', {x: 32, y: 406, 'class': 's'}, E.dr, '');
  E.arr = s('g', null, sv);
  var stp = App.stepper(root, {render: draw, pills: false});
  var stats = h('div', {'class': 'card'}, root);

  function replay(ops){
    var S = {}, cv = {}, mv = {}, nv = {}, fr = [], T = {probes: 0, inv: 0, c2c: 0, memR: 0, memW: 0, hits: 0};
    LN.forEach(function(L){ S[L] = ['I', 'I', 'I', 'I']; cv[L] = [0, 0, 0, 0]; mv[L] = 0; nv[L] = 0; });
    ops.forEach(function(o){
      var c = o[0], k = o[1], L = o[2], st = S[L], M = [], A = [], d = '', before = st.slice();
      var holders = [0, 1, 2, 3].filter(function(j){ return j !== c && st[j] !== 'I'; });
      var what = k === 'r' ? 'reads' : k === 'w' ? 'writes' : 'evicts';
      var t = 'Core ' + c + ' ' + what + ' ' + L + (o[3] ? '.' + o[3] : '');
      if (k === 'r'){
        if (st[c] !== 'I'){ T.hits++; d = 'Hit in state ' + st[c] + ': no message leaves core ' + c + '.'; }
        else {
          A.push(['req', c]);
          var own = holders.filter(function(j){ return st[j] === 'M' || st[j] === 'O'; })[0], ex = holders.filter(function(j){ return st[j] === 'E'; })[0];
          if (own !== undefined){
            T.probes++; T.c2c++; A.push(['probe', own]); A.push(['c2c', own, c]);
            d = 'Miss. The shadow tags show core ' + own + ' holding the line dirty (' + st[own] + '). The L3 probes core ' + own + ', which sends its 64 bytes to core ' + c + ' (cache to cache).\nCore ' + own + ' keeps the dirty data as <b>O</b> (owner); core ' + c + ' gets <b>S</b>. DRAM is not read and not written: it stays stale.';
            st[own] = 'O'; st[c] = 'S'; cv[L][c] = cv[L][own];
          } else if (ex !== undefined){
            T.probes++; T.c2c++; A.push(['probe', ex]); A.push(['c2c', ex, c]);
            d = 'Miss. Core ' + ex + ' holds the only copy, clean (E). It is probed, supplies the line and drops to <b>S</b>; core ' + c + ' gets <b>S</b>. From now on neither may write without asking.';
            st[ex] = 'S'; st[c] = 'S'; cv[L][c] = cv[L][ex];
          } else if (holders.length){
            T.memR++; A.push(['mem', c]);
            d = 'Miss. Cores ' + holders.join(', ') + ' hold clean S copies and DRAM is up to date, so no probe is needed; the line is supplied (from DRAM here; which clean copy is used is an implementation choice). Core ' + c + ' gets <b>S</b>.';
            st[c] = 'S'; cv[L][c] = mv[L];
          } else {
            T.memR++; A.push(['mem', c]);
            d = 'Miss. The shadow tags show no other holder: the line comes from DRAM and core ' + c + ' gets it <b>E</b>: only copy, clean. A later write needs no message.';
            st[c] = 'E'; cv[L][c] = mv[L];
          }
        }
      } else if (k === 'w'){
        nv[L]++;
        if (st[c] === 'M'){ T.hits++; d = 'Already <b>M</b>: the write happens in the L1d, no message.'; }
        else if (st[c] === 'E'){ T.hits++; d = '<b>E \u2192 M</b> silently: no other copy exists, so no one needs to be told.'; }
        else {
          A.push(['req', c]);
          if (st[c] === 'S' || st[c] === 'O'){
            d = 'Core ' + c + ' holds ' + st[c] + ', which is read-only. It sends an upgrade request; ';
          } else {
            d = 'Core ' + c + ' does not have the line, so it sends an ' + g('rfo') + ': ';
          }
          var src = holders.filter(function(j){ return st[j] === 'M' || st[j] === 'O' || st[j] === 'E'; })[0];
          if (st[c] === 'I'){
            if (src !== undefined){ T.c2c++; A.push(['c2c', src, c]); d += 'core ' + src + ' supplies the data and ';}
            else { T.memR++; A.push(['mem', c]); d += 'the data comes from DRAM and '; }
          }
          if (holders.length){ holders.forEach(function(j){ T.probes++; T.inv++; A.push(['inv', j]); st[j] = 'I'; }); d += 'the L3 invalidates core' + (holders.length > 1 ? 's ' : ' ') + holders.join(', ') + '. '; }
          else d += 'no other core holds it, so nothing is invalidated. ';
          d += 'Core ' + c + ' ends in <b>M</b>.';
          if (L === 'F' && holders.length) d += '\nCore ' + c + ' only changed ' + L + '.' + o[3] + ', and core ' + holders[0] + ' never touches ' + o[3] + ': coherence is tracked per 64-byte line, so the whole line moved anyway. This is ' + g('fshare') + '.';
        }
        st[c] = 'M'; cv[L][c] = nv[L];
      } else {
        if (st[c] === 'M' || st[c] === 'O'){ T.memW++; A.push(['wb', c]); mv[L] = cv[L][c]; d = 'The line is dirty (' + st[c] + '), so its 64 bytes are written back to DRAM before core ' + c + ' drops it. DRAM is current again.'; }
        else if (st[c] === 'I') d = 'Core ' + c + ' does not hold the line: nothing to do.';
        else d = 'Clean (' + st[c] + '): dropped silently, DRAM already has the same data.';
        st[c] = 'I';
      }
      var snap = {}; LN.forEach(function(L2){ snap[L2] = {st: S[L2].slice(), cv: cv[L2].slice(), mv: mv[L2], nv: nv[L2]}; });
      fr.push({t: t, d: d, snap: snap, A: A, L: L, c: c, T: JSON.parse(JSON.stringify(T)), before: before});
    });
    return fr;
  }
  function run(toEnd){
    free.style.display = cur === 'free' ? '' : 'none';
    var fr = replay(SC[cur].ops);
    if (!fr.length){
      var snap0 = {}; LN.forEach(function(L){ snap0[L] = {st: ['I', 'I', 'I', 'I'], cv: [0, 0, 0, 0], mv: 0, nv: 0}; });
      fr = [{t: 'Empty', d: 'Use the buttons above to add operations.', snap: snap0, A: [], T: {probes: 0, inv: 0, c2c: 0, memR: 0, memW: 0, hits: 0}}];
    }
    stp.set(fr); if (toEnd) stp.go(fr.length - 1);
  }
  var COL = {M: 'var(--a1)', O: 'var(--a3)', E: 'var(--a2)', S: 'var(--a4)', I: 'var(--tx3)'};
  function draw(f){
    var used = cur === 'share' ? ['A'] : cur === 'fs' ? ['F'] : cur === 'pad' ? ['G1', 'G2'] : ['A', 'F'];
    E.cores.forEach(function(cc, c){
      cc.rows.forEach(function(R, k){
        var L = LN[k], sn = f.snap[L], st = sn.st[c], show = used.indexOf(L) >= 0;
        R.r.style.opacity = show ? 1 : .3; R.st.textContent = show ? st : ''; R.st.setAttribute('fill', COL[st]);
        R.v.textContent = show ? (st === 'I' ? LD[L] : 'version ' + sn.cv[c] + (sn.cv[c] < sn.nv ? ' (stale!)' : '')) : '';
        R.r.setAttribute('class', show && f.L === L && f.c === c ? 'on box' : 'sunk');
      });
      cc.g.setAttribute('class', f.c === c ? 'on' : '');
    });
    E.l3T.textContent = used.map(function(L){ var hs = [0, 1, 2, 3].filter(function(j){ return f.snap[L].st[j] !== 'I'; }); return L + ': ' + (hs.length ? 'cores ' + hs.join(', ') : 'nobody'); }).join('     ');
    E.l3T2.textContent = 'probes go only to the cores listed here';
    E.drT.textContent = used.map(function(L){ var sn = f.snap[L]; return L + ': version ' + sn.mv + (sn.mv < sn.nv ? ' (stale: newest is ' + sn.nv + ' in a cache)' : ' (current)'); }).join('     ');
    E.drT2.textContent = 'O and M lines are newer than DRAM until written back';
    E.arr.innerHTML = '';
    var P = function(d, col){ s('path', {d: d, fill: 'none', stroke: col, 'stroke-width': 3, 'marker-end': 'url(#ca)', 'class': 'flow'}, E.arr); };
    (f.A || []).forEach(function(a){
      var x = CX[a[1]];
      if (a[0] === 'req') P('M ' + (x - 30) + ' 182 L ' + (x - 30) + ' 220', 'var(--act)');
      if (a[0] === 'probe') P('M ' + (x + 20) + ' 220 L ' + (x + 20) + ' 182', 'var(--a3)');
      if (a[0] === 'inv') P('M ' + (x + 20) + ' 220 L ' + (x + 20) + ' 182', 'var(--bad)');
      if (a[0] === 'c2c'){ var x2 = CX[a[2]]; P('M ' + (x + 45) + ' 182 L ' + (x + 45) + ' 204 L ' + (x2 + 5) + ' 204 L ' + (x2 + 5) + ' 184', 'var(--a2)'); }
      if (a[0] === 'mem') P('M ' + (x - 60) + ' 338 L ' + (x - 60) + ' 184', 'var(--a2)');
      if (a[0] === 'wb') P('M ' + (x + 70) + ' 184 L ' + (x + 70) + ' 338', 'var(--a1)');
    });
    var T = f.T;
    stats.innerHTML = '<h3>Messages so far</h3><table class="mt"><tr><th>probes sent</th><th>invalidations</th><th>cache-to-cache transfers</th><th>DRAM reads</th><th>DRAM writes</th><th>hits (no message)</th></tr><tr><td>' + T.probes + '</td><td>' + T.inv + '</td><td>' + T.c2c + '</td><td>' + T.memR + '</td><td>' + T.memW + '</td><td>' + T.hits + '</td></tr></table>' +
      (cur === 'fs' || cur === 'pad' ? '<p class="note" style="margin-top:8px">Same six writes in both scenarios:</p><ul class="note note-list"><li><b>Unpadded</b>: every write after the first moves the line between cores.</li><li><b>Padded</b>: two cold misses, then every write is a local hit.</li></ul><p class="note"><code>____cacheline_aligned_in_smp</code> in the Linux kernel exists to force exactly this padded layout for hot per-CPU and lock structures.</p>' : '<p class="note" style="margin-top:8px">Arrows: amber = request to the L3, purple = probe, red = invalidate, green = data, orange-red = write-back.</p>');
  }
  run(false);
  return {key: stp.key};
}});
