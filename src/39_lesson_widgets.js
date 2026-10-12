/* ======================= small interactive tools used inside lessons ("Try it") ======================= */
(function () {
  'use strict';
  var h = App.h;

  function parseHex(s) {
    s = String(s || '').trim().toLowerCase().replace(/[_\s]/g, '');
    if (!s) return null;
    if (!/^(0x)?[0-9a-f]+$/.test(s)) return null;
    if (s.indexOf('0x') !== 0) s = '0x' + s;
    try { return BigInt(s); } catch (e) { return null; }
  }
  function hx(v, w) { var t = v.toString(16); if (w) t = t.padStart(w, '0'); return '0x' + t; }
  function bitsHTML(fields, dense) {
    return '<div class="lx-bits' + (dense ? ' dense' : '') + '" style="border:0;padding:0;background:none"><div class="lx-bits-strip no-autolink">' +
      fields.map(function (f) {
        return '<div class="lx-bit tone-' + (f.tone || 'n') + (f.hot ? ' hot' : '') + '" style="flex-grow:' + (f.w || 1) + '"><span class="b-range">' + f.bits + '</span><span class="b-val">' + f.val + '</span><span class="b-name">' + (f.name || '') + '</span></div>';
      }).join('') + '</div></div>';
  }
  function field(parent, label, value, o) {
    o = o || {};
    var l = h('label', { 'class': o.grow ? 'grow' : '' }, parent);
    h('span', null, l, label);
    var i = h('input', { type: 'text', value: value, spellcheck: 'false', autocomplete: 'off', 'aria-label': label }, l);
    if (o.width) l.style.maxWidth = o.width;
    return i;
  }
  function select(parent, label, options, value) {
    var l = h('label', null, parent);
    h('span', null, l, label);
    var s = h('select', { 'aria-label': label }, l);
    options.forEach(function (o) { var op = h('option', { value: o[0] }, s, o[1]); if (o[0] === value) op.selected = true; });
    return s;
  }

  /* ---- 1. split a virtual address (and optionally build the physical address) ---- */
  function splitter(el, opts) {
    opts = opts || {};
    var form = h('div', { 'class': 'lx-form' }, el);
    var iVA = field(form, 'Virtual address', opts.va || '0x00007f3a1b2c3d4e', { grow: true });
    var iSize = opts.sizes === false ? null : select(form, 'Page size', [['12', '4 KiB'], ['21', '2 MiB'], ['30', '1 GiB']], '12');
    var iPFN = opts.pfn === false ? null : field(form, 'Frame number (PFN) of that page', opts.pfnValue || '0x129b49', { width: '220px' });
    var out = h('div', { 'class': 'lx-out', 'aria-live': 'polite' }, el);
    function run() {
      var va = parseHex(iVA.value), shift = iSize ? Number(iSize.value) : 12;
      out.innerHTML = '';
      if (va === null || va >= (1n << 64n)) { h('p', { 'class': 'lx-msg bad' }, out, 'Enter a hex number of up to 16 digits, such as 0x00007f3a1b2c3d4e.'); return; }
      var top = va >> 47n, canon = top === 0n || top === 0x1ffffn;
      var offMask = (1n << BigInt(shift)) - 1n, off = va & offMask;
      var fields = [];
      if (opts.mode === 'levels') {
        fields.push({ bits: '63:48', val: hx(va >> 48n, 4), name: 'copies of bit 47', tone: 'mute', w: 1.2 });
        var lv = [['47:39', 39, 'PML4 index'], ['38:30', 30, 'PDPT index'], ['29:21', 21, 'PD index'], ['20:12', 12, 'PT index']];
        lv.forEach(function (x) {
          if (x[1] < shift) return;
          fields.push({ bits: x[0], val: String((va >> BigInt(x[1])) & 0x1ffn), name: x[2], tone: 'a1' });
        });
        fields.push({ bits: (shift - 1) + ':0', val: hx(off, Math.ceil(shift / 4)), name: 'offset', tone: 'a3', w: shift / 9 });
      } else {
        fields.push({ bits: '63:' + shift, val: hx(va >> BigInt(shift)), name: shift === 12 ? 'VPN (page number)' : 'page number', tone: 'a1', w: 2.2 });
        fields.push({ bits: (shift - 1) + ':0', val: hx(off, Math.ceil(shift / 4)), name: 'page offset', tone: 'a3', w: 1 });
      }
      h('div', null, out, bitsHTML(fields));
      var msg = [];
      if (!canon) msg.push('<b>Not canonical.</b> Bits 63:48 are not all copies of bit 47, so the CPU will not translate this address: using it raises a general-protection exception (#GP), not a page fault.');
      else msg.push('<b>Canonical</b>, in the ' + (top === 0n ? 'user half (0 to 0x00007fffffffffff).' : 'kernel half (0xffff800000000000 and up).'));
      if (iPFN) {
        var pfn = parseHex(iPFN.value);
        if (pfn === null) msg.push('Enter a frame number in hex to build the physical address.');
        else {
          var align = shift > 12 ? (1n << BigInt(shift - 12)) : 1n;
          if (shift > 12 && pfn % align !== 0n) msg.push('A ' + (shift === 21 ? '2 MiB' : '1 GiB') + ' page needs a first frame number that is a multiple of ' + align + ' (0x' + align.toString(16) + '). ' + hx(pfn) + ' is not.');
          else msg.push('Physical address = PFN × ' + (1n << 12n) + ' + offset = ' + hx(pfn << 12n) + ' + ' + hx(off) + ' = <b>' + hx((pfn << 12n) + off) + '</b>');
        }
      }
      msg.forEach(function (m) { h('p', { 'class': 'lx-msg' }, out, m); });
    }
    [iVA, iSize, iPFN].forEach(function (x) { if (x) x.addEventListener('input', run); });
    run();
  }

  /* ---- 2. decode a 64-bit x86-64 page-table entry ---- */
  var PTE_BITS = [
    [63, 'NX', 'no instruction fetch through this entry'],
    [8, 'G', 'global: kept across CR3 loads'],
    [7, 'PS', 'in a PDPT or PD entry: maps a 1 GiB or 2 MiB page'],
    [6, 'D', 'dirty: a write went through this entry'],
    [5, 'A', 'accessed: used for a translation'],
    [4, 'PCD', 'cache disable (memory type)'],
    [3, 'PWT', 'write-through (memory type)'],
    [2, 'U/S', 'user mode may use it'],
    [1, 'R/W', 'writes allowed'],
    [0, 'P', 'present: the entry is valid']
  ];
  function pteDecoder(el, opts) {
    opts = opts || {};
    var form = h('div', { 'class': 'lx-form' }, el);
    var i = field(form, 'Entry (64 bits, hex)', opts.value || '0x8000000129b49067', { grow: true });
    var lvl = select(form, 'Level', [['pt', 'PT (maps a 4 KiB page)'], ['pd', 'PD'], ['pdpt', 'PDPT'], ['pml4', 'PML4']], opts.level || 'pt');
    var out = h('div', { 'class': 'lx-out', 'aria-live': 'polite' }, el);
    function run() {
      var e = parseHex(i.value);
      out.innerHTML = '';
      if (e === null || e >= (1n << 64n)) { h('p', { 'class': 'lx-msg bad' }, out, 'Enter a hex value of up to 16 digits.'); return; }
      var fields = [];
      fields.push({ bits: '63', val: String((e >> 63n) & 1n), name: 'NX', tone: (e >> 63n) & 1n ? 'a1' : 'mute' });
      fields.push({ bits: '62:52', val: hx((e >> 52n) & 0x7ffn), name: 'ignored (OS use)', tone: 'mute' });
      fields.push({ bits: '51:12', val: hx((e >> 12n) & ((1n << 40n) - 1n)), name: 'frame / next table', tone: 'a4', w: 2.4 });
      fields.push({ bits: '11:9', val: String((e >> 9n) & 7n), name: 'ignored', tone: 'mute' });
      [8, 7, 6, 5, 4, 3, 2, 1, 0].forEach(function (b) {
        var d = PTE_BITS.filter(function (x) { return x[0] === b; })[0];
        var on = (e >> BigInt(b)) & 1n;
        fields.push({ bits: String(b), val: String(on), name: d[1], tone: on ? 'a2' : 'mute' });
      });
      h('div', null, out, bitsHTML(fields, true));
      var present = e & 1n;
      var lines = [];
      if (!present) lines.push('<b>P = 0: not present.</b> The CPU ignores every other bit and the walk stops with a page fault. (Linux may keep its own data in those bits, for example where a swapped-out page went.)');
      else {
        var ps = (e >> 7n) & 1n, isLeaf = lvl.value === 'pt' || ((lvl.value === 'pd' || lvl.value === 'pdpt') && ps);
        var addr = e & 0x000ffffffffff000n;
        if (lvl.value === 'pml4' && ps) lines.push('<b>Bit 7 must be 0 in a PML4 entry</b> (there are no 512 GiB pages); the CPU reports a reserved-bit page fault.');
        else if (isLeaf) {
          var size = lvl.value === 'pt' ? '4 KiB' : lvl.value === 'pd' ? '2 MiB' : '1 GiB';
          lines.push('<b>Maps a ' + size + ' page</b> starting at physical address ' + hx(lvl.value === 'pt' ? addr : addr & ~((lvl.value === 'pd' ? 1n << 21n : 1n << 30n) - 1n)) + (lvl.value === 'pt' ? ' (PFN ' + hx(addr >> 12n) + ')' : '') + '.');
          if (lvl.value === 'pt' && ps) lines.push('In a PT entry bit 7 is not PS: it is the PAT bit, part of the memory type.');
        } else lines.push('<b>Points to the next table</b>, at physical address ' + hx(addr) + '.');
        var perm = [];
        perm.push((e >> 1n) & 1n ? 'writable' : 'read-only');
        perm.push((e >> 2n) & 1n ? 'user mode allowed' : 'kernel only');
        perm.push((e >> 63n) & 1n ? 'no instruction fetch' : 'instructions allowed');
        lines.push('Permissions this entry allows: ' + perm.join(', ') + '.' + (isLeaf ? '' : ' (Permissions combine across levels: the strictest entry on the path wins.)'));
        var st = [];
        if ((e >> 5n) & 1n) st.push('A = 1 (used)');
        if ((e >> 6n) & 1n) st.push('D = 1 (written)' + (isLeaf ? '' : ', ignored in a non-leaf entry'));
        if ((e >> 8n) & 1n) st.push('G = 1 (global)');
        if (st.length) lines.push(st.join('; ') + '.');
      }
      lines.forEach(function (m) { h('p', { 'class': 'lx-msg' }, out, m); });
    }
    i.addEventListener('input', run); lvl.addEventListener('change', run);
    run();
  }

  /* ---- 3. page-fault error code: bits to meaning, both ways ---- */
  var ERR = [[0, 'P', 'a translation existed (1) or did not (0)'], [1, 'W/R', 'the access was a write'], [2, 'U/S', 'the CPU was in user mode'], [3, 'RSVD', 'a reserved bit was set in an entry'], [4, 'I/D', 'the access was an instruction fetch'], [5, 'PK', 'a protection key refused it'], [6, 'SS', 'a shadow-stack access']];
  function errDecoder(el, opts) {
    opts = opts || {};
    var form = h('div', { 'class': 'lx-form' }, el);
    var i = field(form, 'Error code (hex)', opts.value || '0x6', { width: '170px' });
    var boxes = h('div', { 'class': 'lx-checks' }, form);
    var cb = ERR.map(function (x) {
      var l = h('label', null, boxes);
      var c = h('input', { type: 'checkbox', 'aria-label': x[1] }, l);
      h('span', null, l, 'bit ' + x[0] + ' ' + x[1]);
      return c;
    });
    var out = h('div', { 'class': 'lx-out', 'aria-live': 'polite' }, el);
    function show(v) {
      out.innerHTML = '';
      cb.forEach(function (c, k) { c.checked = !!((v >> ERR[k][0]) & 1); });
      var parts = ERR.filter(function (x) { return (v >> x[0]) & 1; }).map(function (x) { return x[1] + ': ' + x[2]; });
      var kind = (v & 16) ? 'instruction fetch' : (v & 2) ? 'write' : 'read';
      var who = (v & 4) ? 'user mode' : 'kernel mode';
      var why = (v & 1) ? 'a translation existed but refused the access' : 'no valid translation (P = 0 somewhere on the path)';
      h('p', { 'class': 'lx-msg' }, out, '<b>0x' + v.toString(16) + '</b>: a ' + kind + ' in ' + who + '; ' + why + '.');
      if (parts.length) h('p', { 'class': 'lx-msg' }, out, 'Bits set: ' + parts.join('; ') + '.');
    }
    i.addEventListener('input', function () { var v = parseHex(i.value); if (v === null || v > 0xffffn) { out.innerHTML = '<p class="lx-msg bad">Enter a small hex value such as 0x6.</p>'; return; } show(Number(v)); });
    cb.forEach(function (c) { c.addEventListener('change', function () { var v = 0; cb.forEach(function (d, k) { if (d.checked) v |= 1 << ERR[k][0]; }); i.value = '0x' + v.toString(16); show(v); }); });
    show(Number(parseHex(i.value)));
  }

  /* ---- 4. TLB reach ---- */
  function reach(el, opts) {
    opts = opts || {};
    var form = h('div', { 'class': 'lx-form' }, el);
    var iE = field(form, 'Entries', String(opts.entries || 1536), { width: '120px' });
    var iP = select(form, 'Page size', [['4096', '4 KiB'], ['2097152', '2 MiB'], ['1073741824', '1 GiB']], '4096');
    var iW = field(form, 'Working set (MiB)', String(opts.ws || 8), { width: '160px' });
    var out = h('div', { 'class': 'lx-out', 'aria-live': 'polite' }, el);
    function fmt(b) { return b >= 1073741824 ? (b / 1073741824) + ' GiB' : b >= 1048576 ? (b / 1048576) + ' MiB' : (b / 1024) + ' KiB'; }
    function run() {
      var e = Number(iE.value), p = Number(iP.value), w = Number(iW.value) * 1048576;
      out.innerHTML = '';
      if (!(e > 0 && e <= 1e6 && w > 0 && w <= 1048576 * 1048576)) { h('p', { 'class': 'lx-msg bad' }, out, 'Enter entries (1 to 1,000,000) and a working set in MiB.'); return; }
      var r = e * p, pages = Math.ceil(w / p), miss = Math.max(0, 1 - e / pages);
      h('p', { 'class': 'lx-msg' }, out, 'Reach = ' + e + ' × ' + fmt(p) + ' = <b>' + fmt(r) + '</b>.');
      h('p', { 'class': 'lx-msg' }, out, 'The working set spans ' + pages.toLocaleString() + ' pages. ' + (miss === 0 ? '<b>It fits:</b> after warm-up, no access needs a walk.' : 'With accesses spread at random, roughly <b>' + Math.round(miss * 100) + '%</b> of them miss this TLB (1 − entries ÷ pages, a rough model that ignores associativity).'));
    }
    [iE, iP, iW].forEach(function (x) { x.addEventListener('input', run); x.addEventListener('change', run); });
    run();
  }

  /* ---- 5. step through a sequence: rows stay on screen, one step at a time is lit and explained ----
     rows: [{k, v, d}]; steps: [{t: title, d: html, hot: [row indexes], set: {rowIndex: {v, d}}}] */
  function stepRows(el, rows, steps, o) {
    o = o || {};
    var bar = h('div', { 'class': 'lx-stepbar' }, el);
    var back = h('button', { type: 'button' }, bar, '← back');
    var cnt = h('span', { 'class': 'lx-stepcnt', 'aria-live': 'polite' }, bar);
    var next = h('button', { type: 'button', 'class': 'pri' }, bar, 'next →');
    var list = h('ol', { 'class': 'lx-steprows no-autolink' + (o.compact ? ' compact' : '') }, el);
    var items = rows.map(function (r) {
      var li = h('li', null, list);
      h('span', { 'class': 'c-k' }, li, r.k);
      var v = h('span', { 'class': 'c-v' }, li, r.v || '');
      var d = h('span', { 'class': 'c-d' }, li, r.d || '');
      return { li: li, v: v, d: d, v0: r.v || '', d0: r.d || '' };
    });
    var narr = h('div', { 'class': 'lx-stepnarr' }, el);
    var i = 0;
    function render() {
      var s = steps[i];
      cnt.textContent = 'step ' + (i + 1) + ' of ' + steps.length;
      back.disabled = i === 0; next.disabled = i === steps.length - 1;
      items.forEach(function (it, k) {
        var st = {};
        for (var j = 0; j <= i; j++) if (steps[j].set && steps[j].set[k]) st = steps[j].set[k];
        it.v.textContent = st.v !== undefined ? st.v : it.v0;
        it.d.textContent = st.d !== undefined ? st.d : it.d0;
        it.li.classList.toggle('hot', (s.hot || []).indexOf(k) >= 0);
        it.li.classList.toggle('done', (s.done || []).indexOf(k) >= 0);
      });
      narr.innerHTML = '<b>' + s.t + '</b>' + (s.d ? '<p>' + s.d + '</p>' : '');
    }
    back.onclick = function () { if (i > 0) { i--; render(); } };
    next.onclick = function () { if (i < steps.length - 1) { i++; render(); } };
    render();
  }

  App.LW = { parseHex: parseHex, hx: hx, bitsHTML: bitsHTML, field: field, select: select, splitter: splitter, pteDecoder: pteDecoder, errDecoder: errDecoder, reach: reach, stepRows: stepRows };
})();
