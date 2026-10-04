/* ======================= shared hardware parts ======================= */
/* Drawing helpers for structures that several chapters show: core blocks, set-associative arrays,
   L3 slices, shadow tags, DRAM ranks, cache lines, device pipelines and a latency ladder.
   Each helper draws inside a box the chapter has already laid out, so chapter geometry and the
   view-tab camera boxes do not move.
   Highlight convention: a cell that stands for the running example gets class 'box', so it lights up
   with its parent group when the chapter marks that group 'on' (svg .on .box). Every other cell uses
   'sunk' or a colour class and never lights by itself.
   Text size and colour are set with inline style: the stylesheet overrides SVG presentation
   attributes such as font-size="10" or fill="...". */
(function(){
  var s = App.s;
  /* MOESI state -> [letter, cell class, text colour] */
  var STATE = {M: ['M', 'a1b', 'var(--a1)'], O: ['O', 'a3b', 'var(--a3)'], E: ['E', 'a2b', 'var(--a2)'], S: ['S', 'a4b', 'var(--a4)'], I: ['\u2013', 'sunk', 'var(--tx3)']};

  function txt(g, x, y, t, o){
    o = o || {};
    var st = 'font-size:' + (o.size || 10) + 'px';
    if (o.fill) st += ';fill:' + o.fill;
    if (o.weight) st += ';font-weight:' + o.weight;
    return s('text', {x: x, y: y, 'class': o.cls || '', 'text-anchor': o.anchor || 'start', style: st}, g, t == null ? '' : String(t));
  }
  function rect(g, x, y, w, h, cls, rx){ return s('rect', {x: x, y: y, width: w, height: h, rx: rx == null ? 3 : rx, 'class': cls || 'sunk'}, g); }

  /* Labelled sub-blocks in a grid. items: [{t, sub, cls}] */
  function blocks(g, x, y, w, h, items, o){
    o = o || {};
    var cols = o.cols || 1, gap = o.gap == null ? 5 : o.gap, rows = Math.ceil(items.length / cols);
    var bw = (w - gap * (cols - 1)) / cols, bh = (h - gap * (rows - 1)) / rows, out = [];
    items.forEach(function(it, i){
      var bx = x + (i % cols) * (bw + gap), by = y + Math.floor(i / cols) * (bh + gap), gg = s('g', null, g);
      rect(gg, bx, by, bw, bh, it.cls || 'sunk', 4);
      txt(gg, bx + 6, by + Math.min(14, bh / 2 + 4), it.t, {size: o.size || 10, fill: 'var(--tx)', weight: 600});
      if (it.sub && bh >= 24) txt(gg, bx + 6, by + Math.min(26, bh - 6), it.sub, {size: o.subSize || 8.5, fill: 'var(--tx3)'});
      out.push(gg);
    });
    return out;
  }

  /* A set-associative array: rows = sets (a few drawn), columns = ways. Row `hot` is the running
     example's set; its cells get o.hotCls ('box' by default) so they light with the parent. */
  function assoc(g, x, y, w, h, o){
    o = o || {};
    var ways = o.ways || 8, rows = o.rows || 4, gap = o.gap == null ? 1.5 : o.gap, hot = o.hot == null ? -1 : o.hot;
    var cw = (w - gap * (ways - 1)) / ways, ch = (h - gap * (rows - 1)) / rows, grid = [];
    for (var r = 0; r < rows; r++){
      var row = [];
      for (var k = 0; k < ways; k++) row.push(rect(g, x + k * (cw + gap), y + r * (ch + gap), cw, ch, r === hot ? (o.hotCls || 'box') : (o.cls || 'sunk'), 1.5));
      grid.push(row);
    }
    return {grid: grid, hot: hot >= 0 ? grid[hot] : null, rowY: function(r){ return y + r * (ch + gap); }, ch: ch};
  }

  /* L3 slices, each with its ways drawn as thin stripes. */
  function slices(g, x, y, w, h, o){
    o = o || {};
    var n = o.n || 4, gap = o.gap == null ? 6 : o.gap, sw = (w - gap * (n - 1)) / n, ways = o.ways || 16, out = [];
    for (var k = 0; k < n; k++){
      var sx = x + k * (sw + gap), gg = s('g', null, g);
      rect(gg, sx, y, sw, h, 'sunk', 4);
      txt(gg, sx + 5, y + 11, o.label ? o.label(k) : 'slice ' + k, {size: 9, fill: 'var(--tx2)'});
      var top = y + 15, bh = h - 19, step = (sw - 8) / ways;
      if (bh > 3) for (var w2 = 0; w2 < ways; w2++) s('rect', {x: sx + 4 + w2 * step, y: top, width: Math.max(1, step - 1), height: bh, 'class': 'a2b', style: 'stroke-width:.4'}, gg);
      out.push(gg);
    }
    return out;
  }

  /* Shadow-tag style grid: one row per line, one column per core, cell = that core's state. */
  function presence(g, x, y, o){
    o = o || {};
    var cw = o.cw || 30, ch = o.ch || 18, lw = o.lw || 34, gap = 3, cores = o.cores || 4, root = s('g', null, g);
    function draw(lines){
      while (root.firstChild) root.removeChild(root.firstChild);
      for (var c = 0; c < cores; c++) txt(root, x + lw + c * (cw + gap) + cw / 2, y + 8, o.head ? o.head(c) : 'core ' + c, {size: 8.5, anchor: 'middle', fill: 'var(--tx3)'});
      lines.forEach(function(L, r){
        var ry = y + 12 + r * (ch + gap);
        txt(root, x, ry + ch / 2 + 3.5, L.label, {size: 10, fill: 'var(--tx2)', cls: 'm'});
        for (var c = 0; c < cores; c++){
          var S = STATE[L.st[c]] || STATE.I, cx = x + lw + c * (cw + gap);
          rect(root, cx, ry, cw, ch, S[1], 3);
          txt(root, cx + cw / 2, ry + ch / 2 + 4, S[0], {size: 11, anchor: 'middle', fill: S[2], weight: 700, cls: 'm'});
        }
      });
    }
    return {draw: draw};
  }

  /* DRAM: channels -> one rank of x8 chips -> 4 bank groups x 4 banks per chip.
     o.hot = {ch, bg, bank}: that bank is drawn in every chip of the channel, because one
     64-byte burst takes 8 bits from each chip of the rank. */
  function dram(g, x, y, o){
    o = o || {};
    var chans = o.channels || ['A', 'B'], chips = o.chips || 8, cell = o.cell || 4, cg = 1, chipW = 4 * cell + 3 * cg + 4;
    var chipGap = o.chipGap == null ? 3 : o.chipGap, labW = o.labW == null ? 26 : o.labW, rowGap = o.rowGap == null ? 6 : o.rowGap;
    var hot = o.hot, hotCells = [], chanW = labW + chips * chipW + (chips - 1) * chipGap, colGap = o.colGap || 14;
    chans.forEach(function(nm, ci){
      var ox = o.side ? x + ci * (chanW + colGap) : x, oy = o.side ? y : y + ci * (chipW + rowGap);
      txt(g, ox, oy + chipW / 2 + 3.5, 'ch ' + nm, {size: 9.5, fill: 'var(--tx2)'});
      for (var k = 0; k < chips; k++){
        var cx = ox + labW + k * (chipW + chipGap);
        s('rect', {x: cx, y: oy, width: chipW, height: chipW, rx: 2.5, style: 'fill:none;stroke:var(--bd2);stroke-width:1'}, g);
        for (var bg = 0; bg < 4; bg++) for (var b = 0; b < 4; b++){
          var isHot = !!hot && hot.ch === ci && hot.bg === bg && hot.bank === b;
          var r = rect(g, cx + 2 + b * (cell + cg), oy + 2 + bg * (cell + cg), cell, cell, isHot ? (o.hotCls || 'box') : 'sunk', 1);
          if (isHot) hotCells.push(r);
        }
      }
    });
    return {setHot: function(cls){ hotCells.forEach(function(r){ r.setAttribute('class', cls); }); }};
  }

  /* One 64-byte line as eight 8-byte words. Word `hot` carries a value set per step. */
  function words(g, x, y, w, h, o){
    o = o || {};
    var labels = o.labels || ['0', '1', '2', '3', '4', '5', '6', '7'], n = labels.length, gap = 3, cw = (w - gap * (n - 1)) / n, cells = [];
    for (var k = 0; k < n; k++){
      var cx = x + k * (cw + gap), r = rect(g, cx, y, cw, h, 'sunk', 3);
      txt(g, cx + cw / 2, y + 9, labels[k], {size: 8, anchor: 'middle', fill: 'var(--tx3)'});
      cells.push({r: r, v: txt(g, cx + cw / 2, y + h - 4, k === o.hot ? '' : '\u00b7', {size: 9.5, anchor: 'middle', fill: 'var(--tx2)', cls: 'm'})});
    }
    return {set: function(val, cls){ var c = cells[o.hot]; c.v.textContent = val == null ? '' : String(val); c.r.setAttribute('class', cls || 'sunk'); }};
  }

  /* A left-to-right pipeline of stages. set(active, done[]) lights one stage and marks finished ones. */
  function pipeline(g, x, y, w, h, labels){
    var n = labels.length, gap = 4, sw = (w - gap * (n - 1)) / n, st = [];
    s('path', {d: 'M ' + x + ' ' + (y + h / 2) + ' L ' + (x + w) + ' ' + (y + h / 2), 'class': 'wire'}, g);
    labels.forEach(function(l, k){
      var sx = x + k * (sw + gap);
      st.push({r: rect(g, sx, y, sw, h, 'sunk', 4), t: txt(g, sx + sw / 2, y + h / 2 + 3.5, l, {size: 8.5, anchor: 'middle', fill: 'var(--tx2)'})});
    });
    function set(active, done){
      st.forEach(function(o, k){
        var on = k === active, dn = !!done && done.indexOf(k) >= 0;
        o.r.setAttribute('class', on ? 'box on' : dn ? 'okb' : 'sunk');
        o.t.style.fill = on ? 'var(--tx)' : dn ? 'var(--ok)' : 'var(--tx2)';
      });
    }
    set(-1);
    return {set: set};
  }

  /* Vertical latency ladder, log scale. levels: [{k, c (cycles or null = not published), cls}].
     Levels before `cur` are drawn as passed, `cur` is lit, later ones stay dim. */
  function ladder(g, x, y, w, h){
    var root = s('g', null, g);
    function set(levels, cur){
      while (root.firstChild) root.removeChild(root.firstChild);
      txt(root, x, y + 9, 'load-to-use, log scale', {size: 9, fill: 'var(--tx3)'});
      var known = levels.filter(function(L){ return L.c; }).map(function(L){ return L.c; });
      var mx = Math.log10(Math.max.apply(null, known) * 1.25), top = y + 18, rh = (h - 18) / levels.length, bw = w - 44;
      var ci = -1; levels.forEach(function(L, i){ if (L.k === cur) ci = i; });
      levels.forEach(function(L, i){
        var ry = top + i * rh, isCur = i === ci, passed = ci >= 0 && i < ci, bx = x + 42;
        txt(root, x, ry + 12, L.k, {size: 9.5, fill: isCur ? 'var(--tx)' : 'var(--tx2)', weight: isCur ? 700 : 400});
        if (L.c){
          rect(root, bx, ry + 3, Math.max(4, Math.log10(L.c) / mx * bw), 11, isCur ? 'box on' : passed ? L.cls : 'sunk', 2);
          txt(root, bx, ry + 25, L.c + ' cycles' + (passed ? ' \u00b7 missed' : ''), {size: 8.5, fill: 'var(--tx3)'});
        } else {
          s('rect', {x: bx, y: ry + 3, width: bw * 0.62, height: 11, rx: 2, 'class': isCur ? 'box on' : 'sunk', style: 'stroke-dasharray:3 2'}, root);
          txt(root, bx, ry + 25, 'not published', {size: 8.5, fill: 'var(--tx3)'});
        }
      });
    }
    return {set: set};
  }

  /* Physical address -> DRAM coordinates with the example layout used by the DRAM chapter
     (bit 6 channel, bits 13:7 column, 15:14 bank, 17:16 bank group, 33:18 row). */
  function dramMap(pa){ return {ch: Number((pa >> 6n) & 1n), col: Number((pa >> 7n) & 127n), bank: Number((pa >> 14n) & 3n), bg: Number((pa >> 16n) & 3n), row: Number((pa >> 18n) & 0xffffn)}; }

  App.HW = {STATE: STATE, txt: txt, rect: rect, blocks: blocks, assoc: assoc, slices: slices, presence: presence, dram: dram, words: words, pipeline: pipeline, ladder: ladder, dramMap: dramMap};
})();
