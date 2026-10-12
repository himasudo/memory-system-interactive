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
    var iSize = opts.sizes === false ? null : select(form, 'Page size', [['12', '4 KiB'], ['21', '2 MiB'], ['30', '1 GiB']], String(opts.size || 12));
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
    var iP = select(form, 'Page size', [['4096', '4 KiB'], ['2097152', '2 MiB'], ['1073741824', '1 GiB']], String(opts.page || 4096));
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

  /* ---- 6. L1 geometry: size, ways and line size give the sets and the address split;
     does the set index fit inside the page offset? ---- */
  function l1geom(el, opts) {
    opts = opts || {};
    var form = h('div', { 'class': 'lx-form' }, el);
    var iS = field(form, 'Size (KiB)', String(opts.size || 32), { width: '110px' });
    var iW = field(form, 'Ways', String(opts.ways || 8), { width: '90px' });
    var iL = field(form, 'Line (bytes)', String(opts.line || 64), { width: '120px' });
    var iP = select(form, 'Page size', [['4096', '4 KiB'], ['16384', '16 KiB'], ['65536', '64 KiB']], String(opts.page || 4096));
    var iA = field(form, 'Address', opts.va || '0x00007f3a1b2c3d4e', { grow: true });
    var out = h('div', { 'class': 'lx-out', 'aria-live': 'polite' }, el);
    function pow2(n) { return n > 0 && Number.isInteger(n) && (n & (n - 1)) === 0; }
    function lg(n) { return Math.round(Math.log2(n)); }
    function kb(b) { return b >= 1024 ? (b / 1024) + ' KiB' : b + ' B'; }
    function run() {
      var kib = Number(iS.value), ways = Number(iW.value), line = Number(iL.value), page = Number(iP.value), va = parseHex(iA.value);
      out.innerHTML = '';
      if (!(kib > 0 && kib <= 4096 && Number.isInteger(ways) && ways >= 1 && ways <= 64 && pow2(line) && line >= 16 && line <= 256)) {
        h('p', { 'class': 'lx-msg bad' }, out, 'Enter a size in KiB, a whole number of ways (1 to 64) and a line size that is a power of two (16 to 256).');
        return;
      }
      var sets = kib * 1024 / (ways * line);
      if (!pow2(sets)) { h('p', { 'class': 'lx-msg bad' }, out, 'Size ÷ (ways × line) = ' + (Math.round(sets * 100) / 100) + ' sets. Caches use a power of two; try other values.'); return; }
      if (va === null || va >= (1n << 64n)) { h('p', { 'class': 'lx-msg bad' }, out, 'Enter the address as hex, such as 0x00007f3a1b2c3d4e.'); return; }
      var ob = lg(line), ib = lg(sets), top = ob + ib - 1, pb = lg(page);
      var fields = [{ bits: '63:' + (top + 1), val: hx(va >> BigInt(top + 1)), name: 'tag bits (compared after translation)', tone: 'a1', w: 2.2 }];
      if (ib > 0) fields.push({ bits: top + ':' + ob, val: String((va >> BigInt(ob)) & BigInt(sets - 1)), name: 'set', tone: 'a4' });
      fields.push({ bits: (ob - 1) + ':0', val: String(va & BigInt(line - 1)), name: 'byte in the line', tone: 'a3' });
      h('div', null, out, bitsHTML(fields));
      h('p', { 'class': 'lx-msg' }, out, 'Sets = ' + kib + ' KiB ÷ (' + ways + ' ways × ' + line + ' B) = <b>' + sets + '</b>' + (ib > 0 ? ', chosen by bits ' + top + ':' + ob : '') + '. One way holds sets × line = ' + kb(sets * line) + '.');
      if (sets * line <= page) h('p', { 'class': 'lx-msg' }, out, '<b>The set bits are inside the page offset</b> (bits ' + (pb - 1) + ':0), which translation copies unchanged. The cache can read the set with virtual-address bits while the TLB translates.');
      else h('p', { 'class': 'lx-msg' }, out, '<b>Bits ' + top + ':' + pb + ' of the set number lie above the page offset.</b> They can differ between the virtual and the physical address, so one frame could sit in two sets. The cache needs extra hardware to find such aliases, or must wait for the translation.');
    }
    [iS, iW, iL, iA].forEach(function (x) { x.addEventListener('input', run); });
    iP.addEventListener('change', run);
    run();
  }

  /* ---- 7. a small TLB across context switches, with and without PCIDs ----
     Two processes take turns on one CPU. In each time slice the running process touches its 3
     pages and one kernel page (a system call). Without PCIDs, every CR3 load drops all non-global
     entries; with PCIDs, entries are tagged with their process and survive. */
  function tlbsim(el, opts) {
    opts = opts || {};
    var N = 8;
    var form = h('div', { 'class': 'lx-form' }, el);
    var chk = h('div', { 'class': 'lx-checks' }, form);
    function box(label, on) { var l = h('label', null, chk); var c = h('input', { type: 'checkbox', 'aria-label': label }, l); c.checked = on; h('span', null, l, label); return c; }
    var cP = box('PCIDs on', opts.pcid !== false), cG = box('kernel page global (G = 1)', opts.global !== false);
    var bar = h('div', { 'class': 'lx-stepbar' }, el);
    var bNext = h('button', { type: 'button', 'class': 'pri' }, bar, 'next time slice →');
    var bRun = h('button', { type: 'button' }, bar, 'run 10 slices');
    var bReset = h('button', { type: 'button' }, bar, 'reset');
    var out = h('div', { 'class': 'lx-out', 'aria-live': 'polite' }, el);
    var tlb, slices, clock;
    function reset() { tlb = []; slices = []; clock = 0; render(); }
    function slice() {
      var k = slices.length, proc = k % 2 ? 'B' : 'A', pcid = k % 2 ? 2 : 1, misses = 0, dropped = 0;
      if (k > 0 && !cP.checked) { var before = tlb.length; tlb = tlb.filter(function (e) { return e.g; }); dropped = before - tlb.length; }
      [proc + '0', proc + '1', proc + '2', 'K'].forEach(function (pg) {
        clock++;
        var g = pg === 'K' && cG.checked;
        var hit = tlb.filter(function (e) { return e.page === pg && (e.g || !cP.checked || e.pcid === pcid); })[0];
        if (hit) { hit.used = clock; return; }
        misses++;
        if (tlb.length >= N) { tlb.sort(function (a, b) { return a.used - b.used; }); tlb.shift(); }
        tlb.push({ page: pg, pcid: g ? 0 : (cP.checked ? pcid : 0), g: g, used: clock });
      });
      slices.push({ proc: proc, misses: misses, dropped: dropped, first: k === 0 });
    }
    function render() {
      out.innerHTML = '';
      var slots = tlb.slice().sort(function (a, b) { return a.page < b.page ? -1 : a.page > b.page ? 1 : a.pcid - b.pcid; });
      var fields = [];
      for (var i = 0; i < N; i++) {
        var e = slots[i];
        if (!e) { fields.push({ bits: 'slot ' + i, val: '—', name: 'empty', tone: 'mute' }); continue; }
        fields.push({ bits: 'slot ' + i, val: e.page, name: e.g ? 'global' : cP.checked ? 'PCID ' + e.pcid : 'no tag', tone: e.page === 'K' ? 'a2' : e.page.charAt(0) === 'A' ? 'a1' : 'a4' });
      }
      h('div', null, out, bitsHTML(fields, true));
      if (!slices.length) { h('p', { 'class': 'lx-msg' }, out, 'The TLB is empty. Press <b>next time slice</b>: process A runs first.'); return; }
      var rows = slices.slice(-6).map(function (x, j) {
        var n = slices.length - Math.min(6, slices.length) + j + 1;
        var cr3 = x.first ? 'first load' : cP.checked ? 'kept (new PCID)' : x.dropped ? 'dropped ' + x.dropped + ' entries' : 'nothing to drop';
        return '<tr><td>' + n + '</td><td>' + x.proc + '</td><td>' + cr3 + '</td><td>' + x.misses + ' of 4</td></tr>';
      }).join('');
      h('div', { 'class': 'lx-table' }, out, '<div class="lx-table-wrap"><table class="mono-cells"><thead><tr><th>slice</th><th>process</th><th>CR3 load</th><th>TLB misses</th></tr></thead><tbody>' + rows + '</tbody></table></div>');
      var total = slices.reduce(function (a, x) { return a + x.misses; }, 0), later = slices.slice(2), avg = later.length ? later.reduce(function (a, x) { return a + x.misses; }, 0) / later.length : null;
      h('p', { 'class': 'lx-msg' }, out, slices.length + ' slices, ' + total + ' misses' + (avg === null ? '.' : '. After both processes have run once: <b>' + (Math.round(avg * 10) / 10) + ' misses per slice</b>.'));
    }
    bNext.onclick = function () { slice(); render(); };
    bRun.onclick = function () { for (var i = 0; i < 10; i++) slice(); render(); };
    bReset.onclick = reset;
    cP.addEventListener('change', reset); cG.addEventListener('change', reset);
    reset();
  }

  /* ---- 8. a buddy allocator over 16 frames: allocate by order, click a block to free it ---- */
  function buddysim(el, opts) {
    opts = opts || {};
    var N = 16, MAXO = 4;
    var form = h('div', { 'class': 'lx-form' }, el);
    var sel = select(form, 'Request', [['0', 'order 0: 1 frame'], ['1', 'order 1: 2 frames'], ['2', 'order 2: 4 frames'], ['3', 'order 3: 8 frames']], '0');
    var bar = h('div', { 'class': 'lx-stepbar' }, form);
    var bAlloc = h('button', { type: 'button', 'class': 'pri' }, bar, 'allocate');
    var bReset = h('button', { type: 'button' }, bar, 'reset');
    var mem = h('div', { 'class': 'lx-buddy' }, el);
    var out = h('div', { 'class': 'lx-out', 'aria-live': 'polite' }, el);
    var blocks, log, nextId;
    function reset() { blocks = [{ pfn: 0, order: MAXO, used: false }]; log = ['Memory starts as one free block of order 4: frames 0–15.']; nextId = 1; render(); }
    function sorted() { blocks.sort(function (a, b) { return a.pfn - b.pfn; }); }
    function alloc(k) {
      var free = blocks.filter(function (b) { return !b.used && b.order >= k; }).sort(function (a, b) { return a.order - b.order || a.pfn - b.pfn; });
      if (!free.length) { log = ['No free block of order ' + k + ' or larger. Free something first.']; return; }
      var b = free[0], steps = [];
      while (b.order > k) {
        var half = 1 << (b.order - 1);
        steps.push('split order ' + b.order + ' at frame ' + b.pfn + ' into two buddies of order ' + (b.order - 1) + ': ' + b.pfn + ' and ' + (b.pfn + half));
        blocks.push({ pfn: b.pfn + half, order: b.order - 1, used: false });
        b.order--;
      }
      b.used = true; b.id = nextId++;
      steps.push('allocated order ' + k + ' at frame ' + b.pfn + (k ? '–' + (b.pfn + (1 << k) - 1) : '') + ' (block ' + b.id + ')');
      log = steps; sorted();
    }
    function free(b) {
      var steps = ['freed block ' + b.id + ': order ' + b.order + ' at frame ' + b.pfn];
      b.used = false; delete b.id;
      for (;;) {
        if (b.order >= MAXO) break;
        var bp = b.pfn ^ (1 << b.order);
        var buddy = blocks.filter(function (x) { return x.pfn === bp && x.order === b.order && !x.used; })[0];
        if (!buddy) { steps.push('its buddy at frame ' + bp + ' (= ' + b.pfn + ' ^ ' + (1 << b.order) + ') is not free: stop'); break; }
        blocks.splice(blocks.indexOf(buddy), 1);
        b.pfn = b.pfn & ~(1 << b.order); b.order++;
        steps.push('merged with its free buddy at ' + bp + ' into order ' + b.order + ' at frame ' + b.pfn);
      }
      log = steps; sorted();
    }
    function render() {
      mem.innerHTML = '';
      blocks.forEach(function (b) {
        var size = 1 << b.order;
        var cell = h('button', { type: 'button', 'class': 'lx-buddy-b' + (b.used ? ' used' : ''), style: { flexGrow: size }, 'aria-label': (b.used ? 'free ' : '') + 'block at frame ' + b.pfn + ', order ' + b.order }, mem,
          '<span class="b-range">' + b.pfn + (size > 1 ? '–' + (b.pfn + size - 1) : '') + '</span><span class="b-val">' + (b.used ? '#' + b.id : 'free') + '</span><span class="b-name">order ' + b.order + '</span>');
        cell.disabled = !b.used;
        cell.onclick = function () { if (b.used) { free(b); render(); } };
      });
      out.innerHTML = '';
      log.forEach(function (m) { h('p', { 'class': 'lx-msg' }, out, m); });
      var lists = [];
      for (var o = 0; o <= MAXO; o++) {
        var f = blocks.filter(function (b) { return !b.used && b.order === o; }).map(function (b) { return b.pfn; });
        lists.push('order ' + o + ': ' + (f.length ? f.join(', ') : '—'));
      }
      h('p', { 'class': 'lx-msg' }, out, '<b>Free lists</b> (first frame of each block) · ' + lists.join(' · '));
    }
    bAlloc.onclick = function () { alloc(Number(sel.value)); render(); };
    bReset.onclick = reset;
    reset();
  }

  /* ---- 9. page-cache reclaim in 8 frames: one LRU list, or an inactive and an active list ---- */
  function lrusim(el, opts) {
    opts = opts || {};
    var N = 8;
    var form = h('div', { 'class': 'lx-form' }, el);
    var chk = h('div', { 'class': 'lx-checks' }, form);
    var l2 = h('label', null, chk), c2 = h('input', { type: 'checkbox', 'aria-label': 'two lists: inactive and active' }, l2);
    c2.checked = opts.two !== false; h('span', null, l2, 'two lists: inactive and active');
    var bar = h('div', { 'class': 'lx-stepbar lx-wrap' }, el);
    var bPages = ['a', 'b', 'c'].map(function (p) { var b = h('button', { type: 'button' }, bar, 'read ' + p); b.onclick = function () { read(p); render(); }; return b; });
    var bX = h('button', { type: 'button' }, bar, 'read the next page of the big file');
    var bar2 = h('div', { 'class': 'lx-stepbar lx-wrap' }, el);
    var bPlay = h('button', { type: 'button', 'class': 'pri' }, bar2, 'a b c twice, then 12 big-file pages');
    var bReset = h('button', { type: 'button' }, bar2, 'reset');
    var out = h('div', { 'class': 'lx-out', 'aria-live': 'polite' }, el);
    var inact, act, lru, nx, reads, disk, log;
    function reset() { inact = []; act = []; lru = []; nx = 1; reads = 0; disk = 0; log = ['Eight free frames. The small file has pages a, b and c; the big file has pages x1, x2 … (ref = marked referenced)']; render(); }
    function find(list, p) { for (var i = 0; i < list.length; i++) if (list[i].p === p) return i; return -1; }
    function say(m) { log.push(m); if (log.length > 5) log.shift(); }
    function read(p) {
      reads++;
      if (!c2.checked) {
        var j = find(lru, p);
        if (j >= 0) { lru.unshift(lru.splice(j, 1)[0]); say(p + ': in memory, moved to the head of the list'); return; }
        disk++;
        var gone = '';
        if (lru.length >= N) gone = ' · memory full: ' + lru.pop().p + ' evicted from the tail';
        lru.unshift({ p: p }); say(p + ': read from disk into the head of the list' + gone);
        return;
      }
      var i = find(act, p);
      if (i >= 0) { act[i].ref = true; say(p + ': on the active list, marked referenced'); return; }
      i = find(inact, p);
      if (i >= 0) {
        if (inact[i].ref) { var e = inact.splice(i, 1)[0]; e.ref = false; act.unshift(e); say(p + ': read again while referenced: moved to the active list'); }
        else { inact[i].ref = true; say(p + ': on the inactive list, marked referenced'); }
        return;
      }
      disk++;
      var msg = [];
      if (inact.length + act.length >= N) {
        while (inact.length < act.length) { var d = act.pop(); inact.unshift(d); msg.push(d.p + ' moved back to the inactive list (it was longer than the active one)'); }
        msg.push('memory full: ' + inact.pop().p + ' evicted from the inactive tail');
      }
      inact.unshift({ p: p, ref: true });
      say(p + ': read from disk into the inactive head, marked referenced' + (msg.length ? ' · ' + msg.join(' · ') : ''));
    }
    function strip(list, label) {
      var f = list.map(function (e, k) {
        return { bits: k === 0 ? 'head' : k === list.length - 1 ? 'tail' : '&nbsp;', val: e.p, name: e.ref ? 'ref' : '&nbsp;', tone: e.p.charAt(0) === 'x' ? 'a4' : 'a1' };
      });
      if (!f.length) f = [{ bits: '&nbsp;', val: '—', name: '&nbsp;', tone: 'mute' }];
      h('p', { 'class': 'lx-msg' }, out, '<b>' + label + '</b> · ' + list.length + (list.length === 1 ? ' page' : ' pages') + (c2.checked ? '' : ', most recent first'));
      h('div', { 'class': 'lx-lru' }, out, bitsHTML(f, true));
    }
    function render() {
      out.innerHTML = '';
      if (c2.checked) { strip(inact, 'inactive list'); strip(act, 'active list'); } else strip(lru, 'one LRU list');
      var all = c2.checked ? inact.concat(act) : lru;
      var small = ['a', 'b', 'c'].filter(function (p) { return find(all, p) >= 0; });
      log.forEach(function (m) { h('p', { 'class': 'lx-msg' }, out, m); });
      h('p', { 'class': 'lx-msg' }, out, reads + ' reads, ' + disk + ' from disk · free frames: ' + (N - all.length) + ' · small-file pages in memory: <b>' + (small.length ? small.join(', ') : 'none') + '</b>');
    }
    bX.onclick = function () { read('x' + nx++); render(); };
    bPlay.onclick = function () {
      reset();
      ['a', 'b', 'c', 'a', 'b', 'c'].forEach(read);
      for (var k = 0; k < 12; k++) read('x' + nx++);
      render();
    };
    bReset.onclick = reset;
    c2.addEventListener('change', reset);
    reset();
  }

  /* ---- 10. the two-dimensional walk: memory references per TLB miss in a guest ---- */
  function walk2d(el, opts) {
    opts = opts || {};
    var form = h('div', { 'class': 'lx-form' }, el);
    var sizes = [['0', '4 KiB'], ['1', '2 MiB'], ['2', '1 GiB']];
    var gp = select(form, 'Guest page', sizes, '0'), hp = select(form, 'Host page', sizes, '0');
    var gl = select(form, 'Guest tables', [['4', '4 levels'], ['5', '5 levels']], '4'), hl = select(form, 'Host tables', [['4', '4 levels'], ['5', '5 levels']], '4');
    var out = h('div', { 'class': 'lx-out', 'aria-live': 'polite' }, el);
    var NAMES = ['PML5', 'PML4', 'PDPT', 'PD', 'PT'];
    function render() {
      var g = Number(gl.value) - Number(gp.value), hh = Number(hl.value) - Number(hp.value);
      var gnames = NAMES.slice(5 - Number(gl.value)).slice(0, g);
      var html = '<div class="lx-w2d">', n = 0;
      for (var r = 0; r <= g; r++) {
        html += '<div class="w-row"><span class="w-k">' + (r < g ? 'find guest ' + gnames[r] : 'find the data') + '</span><span class="w-cells">';
        for (var c = 0; c < hh; c++) html += '<span class="w-c host">' + (++n) + '</span>';
        html += r < g ? '<span class="w-c guest">' + (++n) + '</span>' : '<span class="w-c data">data</span>';
        html += '</span></div>';
      }
      html += '</div>';
      out.innerHTML = html;
      var total = g * (hh + 1) + hh, small = Math.min(Number(gp.value), Number(hp.value));
      h('p', { 'class': 'lx-msg' }, out, '<span class="w-key host"></span> host table entry <span class="w-key guest"></span> guest table entry');
      h('p', { 'class': 'lx-msg' }, out, 'Native walk: <b>' + g + '</b> references. In the guest: ' + g + ' × (' + hh + ' + 1) + ' + hh + ' = <b>' + total + '</b> references. The TLB entry covers <b>' + sizes[small][1] + '</b>, the smaller of the two pages.');
    }
    [gp, hp, gl, hl].forEach(function (s) { s.addEventListener('change', render); });
    render();
  }

  App.LW = { parseHex: parseHex, hx: hx, bitsHTML: bitsHTML, field: field, select: select, splitter: splitter, pteDecoder: pteDecoder, errDecoder: errDecoder, reach: reach, stepRows: stepRows, l1geom: l1geom, tlbsim: tlbsim, buddysim: buddysim, lrusim: lrusim, walk2d: walk2d };
})();
