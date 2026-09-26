/* ======================= foundations: shared layout helpers ======================= */
(function(){
  var h = App.h, s = App.s, uid = 0;
  function sec(root, id, title, copy){ return h('div', {'class': 'p-sec', 'data-sec': id, 'data-title': title, 'data-copy': copy || ''}, root); }
  function para(parts){ return parts.map(function(x){ return /^\s*<(ul|ol|pre|table|div|figure|p)\b/.test(x) ? x : '<p>' + x + '</p>'; }).join(''); }
  function fig(parent, w, ht, cap){
    var f = h('figure', {'class': 'p-fig'}, parent);
    var sv = s('svg', {viewBox: '0 0 ' + w + ' ' + ht, role: 'img', 'aria-label': cap || ''}, f);
    var id = 'pfm' + (++uid);
    s('defs', null, sv).innerHTML =
      '<marker id="' + id + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9z" fill="var(--wire)"/></marker>' +
      '<marker id="' + id + 'h" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9z" fill="var(--act)"/></marker>';
    sv._m = id;
    if (cap) h('figcaption', null, f, cap);
    return sv;
  }
  /* text next to an optional figure; spec = {w, h, cap, draw(svg), live} (live: redraw when latency settings change) */
  function row(parent, parts, spec){
    var r = h('div', {'class': 'p-row' + (spec ? '' : ' p-row-text')}, parent);
    var t = h('div', {'class': 'p-text'}, r, para(parts));
    if (spec){
      var sv = fig(r, spec.w || 460, spec.h, spec.cap); spec.draw(sv);
      if (spec.live) App.onCfg(function(){ while (sv.childNodes.length > 1) sv.removeChild(sv.lastChild); spec.draw(sv); });
    }
    r._text = t; return r;
  }
  function T(sv, x, y, t, cls, anc){ return s('text', {x: x, y: y, 'class': cls || '', 'text-anchor': anc || 'start'}, sv, String(t)); }
  function R(sv, x, y, w, ht, cls, rx){ return s('rect', {x: x, y: y, width: w, height: ht, rx: rx == null ? 5 : rx, 'class': cls || 'box'}, sv); }
  function A(sv, d, hot){ return s('path', {d: d, 'class': 'wire' + (hot ? ' on' : ''), 'marker-end': 'url(#' + sv._m + (hot ? 'h' : '') + ')'}, sv); }
  function Ln(sv, d, cls){ return s('path', {d: d, 'class': cls || 'wire'}, sv); }
  function cells(sv, x, y, cw, ch, vals, o){
    o = o || {};
    vals.forEach(function(v, i){
      var hot = o.hot && o.hot.indexOf(i) >= 0, cls = o.clsAt ? o.clsAt(i) : (o.cls || 'box');
      R(sv, x + i * cw, y, cw, ch, hot ? 'box on' : cls, 3);
      T(sv, x + i * cw + cw / 2, y + ch / 2 + 4.5, v, 'm' + (o.small ? ' s' : ''), 'middle');
      if (o.sub && o.sub[i] != null) T(sv, x + i * cw + cw / 2, y + ch + 15, o.sub[i], 's m', 'middle');
      if (o.top && o.top[i] != null) T(sv, x + i * cw + cw / 2, y - 7, o.top[i], 's m', 'middle');
    });
  }
  function box(sv, x, y, w, ht, cls, title, sub){
    R(sv, x, y, w, ht, cls);
    T(sv, x + w / 2, y + ht / 2 + (sub ? -2 : 5), title, 'h', 'middle');
    if (sub) T(sv, x + w / 2, y + ht / 2 + 14, sub, 's', 'middle');
  }
  function ul(items, cls){ return '<ul class="' + (cls || 'p-list') + '">' + items.map(function(x){ return '<li>' + x + '</li>'; }).join('') + '</ul>'; }
  App.P = {sec: sec, row: row, fig: fig, T: T, R: R, A: A, Ln: Ln, cells: cells, box: box, ul: ul};
})();

/* ======================= start here ======================= */
App.chapter({id: 'start', short: 'Start here', title: 'Start here',
lede: 'How one memory access travels through a real computer, from a line of C down to the DRAM chips and back.',
points: ['Every chapter follows the same small C function.',
  'Chapters [[num:bits]]\u2013[[num:share]] build the background. Chapters [[num:map]]\u2013[[num:e2e]] follow one access through the hardware.',
  'Terms, diagrams and timings work the same way on every page.'],
build: function(root){
  var P = App.P, g = App.g, T = P.T, R = P.R, A = P.A;
  var a = P.sec(root, 'example', 'The running example', 'One small C function, used on every page.');
  P.row(a, [
    'The site follows one function. It counts how often each byte value appears in an array:',
    '<pre class="p-code"><code>void histogram(const unsigned char *data, long n, long *hist)\n{\n    for (long i = 0; i &lt; n; i++)\n        hist[data[i]]++;\n}</code></pre>',
    'Each iteration reads one byte, <code>data[i]</code>, and adds 1 to the counter <code>hist[data[i]]</code>.',
    'Most chapters zoom in on one of those additions: the one that increments <code>hist[123]</code>.'
  ], {h: 180, cap: 'Each byte of data[] picks one counter in hist[] to increment.', draw: function(sv){
    T(sv, 10, 18, 'data[]: one byte each', 's');
    P.cells(sv, 10, 26, 40, 30, [123, 123, 7, 46, 200, 123, '\u2026'], {hot: [0], sub: ['i=0', '1', '2', '3', '4', '5', '']});
    T(sv, 10, 104, 'hist[]: one 8-byte counter per byte value', 's');
    ['hist[7]', 'hist[46]', 'hist[123]', 'hist[200]'].forEach(function(t, i){ R(sv, 10 + i * 112, 112, 102, 30, i === 2 ? 'box on' : 'box', 3); T(sv, 61 + i * 112, 132, t, 'm', 'middle'); });
    ['9', '3', '41 \u2192 42', '17'].forEach(function(t, i){ T(sv, 61 + i * 112, 160, 'count ' + t, 's', 'middle'); });
    A(sv, 'M30 58 C30 86 285 84 285 108', true);
    A(sv, 'M110 58 C110 84 61 86 61 108');
  }});

  var b = P.sec(root, 'paths', 'Two ways in', 'Start from the basics, or go straight to the hardware.');
  App.h('div', {'class': 'path-cards'}, b,
    '<a class="path-card" href="#bits"><span class="path-k">New to hardware</span><strong>Start with [[ch:bits]]</strong><span>Eight short chapters: bits and hex, addresses, instructions, reading assembly, cycles, caches, virtual memory, and sharing memory.</span></a>' +
    '<a class="path-card" href="#map"><span class="path-k">Know registers, caches and virtual memory</span><strong>Start at [[ch:map]]</strong><span>A map of the whole machine, then one chapter per stage of a memory access.</span></a>');

  var c = P.sec(root, 'reading', 'How to read the pages', 'Terms, diagrams, step panels and timings.');
  var legend = ['basics', 'core', 'xlate', 'cache', 'memory', 'order', 'coh', 'pref', 'io'].map(function(k){ return '<span class="legend-chip term-' + k + '">' + App.TERM_LABEL[k] + '</span>'; }).join('');
  P.row(c, [P.ul([
    'Colored terms, such as ' + g('line', 'cache line') + ', open a short definition with links to read more. The color gives the topic:<div class="legend">' + legend + '</div>',
    'Register names and hex values are linked too: a value like 0x7b opens its decimal form.',
    'Diagrams mark the active part in amber. Click a block to see what it is.',
    'Step panels walk through a process one step at a time. The \u2190 and \u2192 keys also work.',
    'Each chapter is one long page. The section name in the top bar opens a list of its sections.',
    'Timings come from the latency settings: published figures that you can replace with your own measurements.'
  ])]);

  var d = P.sec(root, 'numbers', 'Where the numbers come from', 'One real processor, and published figures.');
  P.row(d, [
    'Sizes and addresses come from one real processor, an AMD Ryzen 7 3750H: four Zen+ cores with two threads each, a 32 KB L1 data cache and a 512 KB L2 per core, a 4 MB L3 shared by all four cores, and two DDR4 memory channels.',
    'Other x86-64 processors are built from the same kinds of structures with different sizes. Where AMD does not publish a detail, the page says so and uses a labeled model instead.'
  ], {h: 120, cap: 'Capacity per level on the Ryzen 7 3750H. Each level is larger and slower than the one before it.', draw: function(sv){
    var L = [['core', '', 50], ['L1d', '32 KB', 70], ['L2', '512 KB', 80], ['L3', '4 MB', 92], ['DRAM', 'GBs', 102]], x = 10;
    L.forEach(function(l, i){
      P.box(sv, x, 30, l[2], 50, i === 0 ? 'a3b' : i === 4 ? 'sunk' : 'a2b', l[0], l[1]);
      T(sv, x + l[2] / 2, 100, ['', 'per core', 'per core', 'shared', 'off chip'][i], 's', 'middle');
      if (i < 4) P.Ln(sv, 'M' + (x + l[2]) + ' 55 H' + (x + l[2] + 12));
      x += l[2] + 12;
    });
  }});
}});

/* ======================= 01 bits, bytes and hex ======================= */
App.chapter({id: 'bits', group: 'Foundations', short: 'Bits, bytes, hex', title: 'Bits, bytes and hex',
lede: 'The number formats every later chapter uses: binary, hexadecimal, and bit ranges.',
points: ['A byte is 8 bits; hex writes it as two digits.', 'Sizes such as 64 bytes and 4 KB are powers of two.', 'Hardware splits an address into fields by bit range.'],
build: function(root){
  var P = App.P, g = App.g, T = P.T, R = P.R;
  var a = P.sec(root, 'bytes', 'Bits and bytes', 'Everything is stored as bits, grouped into bytes.');
  P.row(a, [
    'A ' + g('bit') + ' is a 0 or a 1. A ' + g('byte') + ' is 8 bits, so it can hold 2<sup>8</sup> = 256 different values: 0 to 255.',
    'Each bit position has a weight, a power of two, from 1 on the right to 128 on the left. The value of a byte is the sum of the weights of the bits that are 1.'
  ], {h: 130, cap: 'The byte 123, the first value in data[].', draw: function(sv){
    P.cells(sv, 30, 36, 50, 30, [0, 1, 1, 1, 1, 0, 1, 1], {hot: [1, 2, 3, 4, 6, 7], top: ['128', '64', '32', '16', '8', '4', '2', '1'], sub: ['', '64', '32', '16', '8', '', '2', '1']});
    T(sv, 230, 120, '64 + 32 + 16 + 8 + 2 + 1 = 123', 'h m', 'middle');
  }});

  var b = P.sec(root, 'hex', 'Hexadecimal', 'Four bits per digit, which is why addresses are written in hex.');
  P.row(b, [
    g('hex', 'Hexadecimal') + ' is base 16. It uses the digits 0\u20139 and a\u2013f, where a = 10 and f = 15, and is written with a 0x prefix.',
    'One hex digit covers exactly 4 bits, so a byte is always two hex digits: 123 is 0111 1011, which is 0x7b.',
    'That fixed mapping is why addresses and machine code are written in hex: each digit reads straight into 4 bits.'
  ], {h: 150, cap: 'Each hex digit is one group of 4 bits: 0111 1011 = 0x7b = 123.', draw: function(sv){
    P.cells(sv, 40, 26, 40, 30, [0, 1, 1, 1], {cls: 'a3b'}); P.cells(sv, 260, 26, 40, 30, [1, 0, 1, 1], {cls: 'a4b'});
    P.Ln(sv, 'M40 66 V72 H200 V66'); P.Ln(sv, 'M260 66 V72 H420 V66'); P.Ln(sv, 'M120 72 V82'); P.Ln(sv, 'M340 72 V82');
    R(sv, 98, 84, 44, 32, 'a3b'); T(sv, 120, 105, '7', 'h m', 'middle');
    R(sv, 318, 84, 44, 32, 'a4b'); T(sv, 340, 105, 'b', 'h m', 'middle');
    T(sv, 120, 138, '0111 = 4 + 2 + 1 = 7', 's m', 'middle'); T(sv, 340, 138, '1011 = 8 + 2 + 1 = 11 = b', 's m', 'middle');
  }});

  var c = P.sec(root, 'sizes', 'Sizes are powers of two', 'KB, MB, and the three sizes that keep appearing.');
  P.row(c, [
    'Hardware sizes are powers of two, because a field of <i>n</i> bits can number exactly 2<sup><i>n</i></sup> things.',
    'Here 1 KB = 1024 bytes and 1 MB = 1024 KB. Strictly these are KiB and MiB; hardware documentation usually writes KB and MB.',
    'Three sizes appear in almost every chapter: the 64-byte ' + g('line', 'cache line') + ', the 4 KB ' + g('page') + ', and the 2 MB ' + g('huge', 'large page') + '.'
  ], {h: 130, cap: 'An n-bit field numbers 2\u207f positions. These three appear throughout.', draw: function(sv){
    [['6 bits', '2\u2076 = 64 bytes', 'one cache line'], ['12 bits', '2\u00b9\u00b2 = 4 KB', 'one page'], ['21 bits', '2\u00b2\u00b9 = 2 MB', 'one large page']].forEach(function(r, i){
      var y = 14 + i * 38;
      R(sv, 10, y, 76, 28, 'a3b'); T(sv, 48, y + 19, r[0], 'm', 'middle');
      P.A(sv, 'M88 ' + (y + 14) + ' H112');
      R(sv, 116, y, 150, 28, 'box'); T(sv, 191, y + 19, r[1], 'm', 'middle');
      P.A(sv, 'M268 ' + (y + 14) + ' H292');
      T(sv, 298, y + 19, r[2], '');
    });
  }});

  var d = P.sec(root, 'fields', 'Reading bit ranges', 'How \u201cbits 11:6\u201d pulls a field out of an address.');
  P.row(d, [
    'Chapters about caches and translation split an address into fields written as ' + g('bitrange', 'bit ranges') + '. Bits are numbered from 0 at the right, and \u201cbits 11:6\u201d means the six bits from bit 11 down to bit 6.',
    'In C that field is <code>(addr &gt;&gt; 6) &amp; 0x3f</code>: shift the field down to bit 0, then keep six bits with a mask.',
    'Take the address of <code>hist[123]</code>, 0x7ffd4a3c2e58. Its low 12 bits are 0xe58 = 1110 0101 1000.',
    'Bits 5:0 are 011000 = 24: the byte within a cache line. Bits 11:6 are 111001 = 57: the cache set that [[ch:l1d]] looks up.'
  ], {h: 140, cap: 'The low 12 bits of the address of hist[123], split the way the L1d splits them.', draw: function(sv){
    var bits = [1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0], top = [];
    for (var i = 11; i >= 0; i--) top.push(String(i));
    P.cells(sv, 26, 34, 34, 30, bits, {top: top, clsAt: function(i){ return i < 6 ? 'a2b' : 'a3b'; }});
    P.Ln(sv, 'M28 72 V80 H228 V72'); P.Ln(sv, 'M232 72 V80 H432 V72');
    T(sv, 128, 100, 'bits 11:6 = 111001 = 57', 'm', 'middle'); T(sv, 128, 118, 'the cache set', 's', 'middle');
    T(sv, 332, 100, 'bits 5:0 = 011000 = 24', 'm', 'middle'); T(sv, 332, 118, 'the byte in the line', 's', 'middle');
  }});
}});

/* ======================= 02 memory and addresses ======================= */
App.chapter({id: 'addr', group: 'Foundations', short: 'Addresses', title: 'Memory and addresses',
lede: 'Memory is one long row of bytes, and an address is a byte\u2019s position in that row.',
points: ['A pointer holds an address; an array element is the base address plus an offset.', 'Values wider than a byte span several addresses.', 'Where a value starts decides how many cache lines it touches.'],
build: function(root){
  var P = App.P, g = App.g, T = P.T, R = P.R, A = P.A;
  var a = P.sec(root, 'row', 'A row of numbered bytes', 'What an address is.');
  P.row(a, [
    'To a program, memory is one very long row of bytes. Each byte has a number, its ' + g('addr', 'address') + ', counting up from 0.',
    'A load names an address and gets the byte, or bytes, stored there. A store names an address and replaces them.',
    'The array <code>data[]</code> starts at address 0x55555555a2c0. Its first six bytes are the values the example reads.'
  ], {h: 110, cap: 'data[] in memory: one byte per address.', draw: function(sv){
    P.cells(sv, 27, 36, 58, 30, [123, 123, 7, 46, 200, 123, '\u2026'], {top: ['\u2026a2c0', '\u2026a2c1', '\u2026a2c2', '\u2026a2c3', '\u2026a2c4', '\u2026a2c5', ''], sub: ['data[0]', '[1]', '[2]', '[3]', '[4]', '[5]', '']});
  }});

  var b = P.sec(root, 'pointers', 'Pointers and arrays', 'Indexing is arithmetic on an address.');
  P.row(b, [
    'A ' + g('ptr') + ' is a variable that holds an address. The example function receives <code>data</code> = 0x55555555a2c0 and <code>hist</code> = 0x7ffd4a3c2a80.',
    'Indexing an array is arithmetic on its address: element <i>k</i> is at base + <i>k</i> \u00d7 element size.',
    'A byte is 1 byte wide, so <code>data[i]</code> is at <code>data + i</code>. A <code>long</code> is 8 bytes, so <code>hist[k]</code> is at <code>hist + k \u00d7 8</code>.',
    'For <code>hist[123]</code>: 0x7ffd4a3c2a80 + 123 \u00d7 8 = 0x7ffd4a3c2a80 + 0x3d8 = 0x7ffd4a3c2e58. Every later chapter follows this address.'
  ], {h: 150, cap: 'hist[k] sits k \u00d7 8 bytes after the start of hist.', draw: function(sv){
    R(sv, 26, 6, 200, 26, 'a1b'); T(sv, 36, 24, 'hist = 0x7ffd4a3c2a80', 'm s');
    A(sv, 'M74 32 V52');
    ['hist[0]', 'hist[1]', '\u2026', 'hist[123]'].forEach(function(t, i){ R(sv, 26 + i * 104, 56, 96, 30, i === 3 ? 'box on' : 'box', 3); T(sv, 74 + i * 104, 76, t, 'm', 'middle'); });
    ['\u20262a80', '\u20262a88', '', '\u20262e58'].forEach(function(t, i){ T(sv, 74 + i * 104, 102, t, 's m', 'middle'); });
    T(sv, 230, 136, '0x\u20262a80 + 123 \u00d7 8 = 0x\u20262e58', 'm', 'middle');
  }});

  var c = P.sec(root, 'wide', 'Values wider than a byte', 'Byte order on x86.');
  P.row(c, [
    'A <code>long</code> is 8 bytes, so <code>hist[123]</code> occupies the eight addresses 0x7ffd4a3c2e58 to 0x7ffd4a3c2e5f.',
    'x86 stores the least significant byte first, at the lowest address. This order is called ' + g('endian') + '.',
    'The count 41, which is 0x29, is stored as the bytes 29 00 00 00 00 00 00 00.'
  ], {h: 110, cap: 'hist[123] = 41 in memory, lowest address first.', draw: function(sv){
    P.cells(sv, 30, 34, 50, 30, ['29', '00', '00', '00', '00', '00', '00', '00'], {hot: [0], top: ['\u202658', '\u202659', '\u20265a', '\u20265b', '\u20265c', '\u20265d', '\u20265e', '\u20265f']});
    T(sv, 30, 90, '\u2191 least significant byte', 's'); T(sv, 430, 90, 'most significant byte \u2191', 's', 'end');
  }});

  var d = P.sec(root, 'align', 'Alignment and cache lines', 'Why the start address of a value matters.');
  P.row(d, [
    'An N-byte value is ' + g('align', 'aligned') + ' when its address is a multiple of N. <code>hist[123]</code> is at 0x\u20262e58, a multiple of 8, so it is aligned.',
    'The hardware moves memory in 64-byte blocks called ' + g('line', 'cache lines') + ', which start at multiples of 64. An aligned 8-byte value always sits inside one line.',
    '<code>hist[123]</code> is in the line that starts at 0x\u20262e40, together with <code>hist[120]</code> to <code>hist[127]</code>. A value that is not aligned can straddle two lines and need two accesses; compilers align values to avoid that.'
  ], {h: 116, cap: 'One 64-byte cache line holds eight 8-byte counters.', draw: function(sv){
    T(sv, 22, 22, 'cache line 0x\u20262e40 to 0x\u20262e7f: 64 bytes', 's');
    P.cells(sv, 22, 34, 52, 30, ['[120]', '[121]', '[122]', '[123]', '[124]', '[125]', '[126]', '[127]'], {hot: [3], sub: ['+0', '+8', '+16', '+24', '+32', '+40', '+48', '+56']});
    T(sv, 22, 106, 'hist[k] for k = 120 \u2026 127; offsets in bytes from the line start', 's');
  }});
}});

/* ======================= 03 instructions and registers ======================= */
App.chapter({id: 'instr', group: 'Foundations', short: 'Instructions', title: 'Instructions and registers',
lede: 'What the CPU actually runs: a list of simple instructions that work on a few registers.',
points: ['Registers are a small set of named slots inside the core.', 'Loads and stores are the only way data moves between registers and memory.', 'Instructions are stored in memory as bytes, like data.'],
build: function(root){
  var P = App.P, g = App.g, T = P.T, R = P.R, A = P.A;
  var a = P.sec(root, 'isa', 'Instructions', 'The operations the hardware promises to perform.');
  P.row(a, [
    'The CPU does not run C. A compiler translates each line into ' + g('instr', 'instructions') + ': small operations such as add two numbers, copy a value, or jump to another instruction.',
    'The ' + g('isa', 'instruction set architecture') + ' defines exactly what each instruction does. This site uses x86-64, the ISA of AMD and Intel desktop and server processors.',
    'The line <code>hist[data[i]]++;</code> becomes two instructions in the loop: one reads the byte, the other adds 1 to the counter.'
  ], {h: 130, cap: 'The loop body line compiles to a load and a read-modify-write.', draw: function(sv){
    R(sv, 10, 44, 150, 40, 'a3b'); T(sv, 85, 69, 'hist[data[i]]++;', 'm', 'middle');
    R(sv, 206, 14, 244, 44, 'box'); T(sv, 218, 32, 'movzbl (%rdi),%eax', 'm'); T(sv, 218, 50, 'read the byte data[i]', 's');
    R(sv, 206, 72, 244, 44, 'box'); T(sv, 218, 90, 'addq $0x1,(%rdx,%rax,8)', 'm'); T(sv, 218, 108, 'add 1 to hist[that byte]', 's');
    A(sv, 'M162 58 C182 58 182 36 202 36'); A(sv, 'M162 70 C182 70 182 94 202 94');
  }});

  var b = P.sec(root, 'regs', 'Registers', 'A few fast, named slots inside the core.');
  P.row(b, [
    g('reg', 'Registers') + ' are storage slots inside the core itself. x86-64 has 16 ' + g('gpr', 'general-purpose registers') + ' of 64 bits each, named rax, rbx, rcx, rdx, rsi, rdi, rbp, rsp, and r8 to r15.',
    'Instructions compute on registers. Reading a register adds no delay; reading memory can take hundreds of cycles. That is why compilers keep the values a loop works on in registers.',
    'In the example, rdi holds the data pointer, rsi the end pointer, rdx the address of <code>hist</code>, and rax the byte just read.'
  ], {h: 150, cap: 'The 16 general-purpose registers. Amber: the four the example loop uses.', draw: function(sv){
    R(sv, 10, 8, 206, 134, 'sunk'); T(sv, 20, 26, 'core: registers', 's');
    var names = ['rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi', 'rbp', 'rsp', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15'], used = ['rax', 'rdx', 'rsi', 'rdi'];
    names.forEach(function(n, i){ var x = 20 + (i % 4) * 48, y = 34 + Math.floor(i / 4) * 26; R(sv, x, y, 44, 22, used.indexOf(n) >= 0 ? 'box on' : 'box', 3); T(sv, x + 22, y + 15, n, 'm s', 'middle'); });
    R(sv, 290, 34, 160, 84, 'box'); T(sv, 370, 72, 'memory', 'h', 'middle'); T(sv, 370, 90, 'large, far from the core', 's', 'middle');
    A(sv, 'M220 58 H286'); T(sv, 253, 52, 'store', 's', 'middle');
    A(sv, 'M288 98 H222'); T(sv, 253, 114, 'load', 's', 'middle');
  }});

  var c = P.sec(root, 'loadstore', 'Loads and stores', 'The only way data moves between memory and registers.');
  P.row(c, [
    'A ' + g('load') + ' copies bytes from memory into a register. A ' + g('store') + ' copies a register into memory. They are the only way data moves between the two.',
    'In the loop, <code>movzbl (%rdi),%eax</code> is a load: it reads the byte at the address in rdi into eax.',
    '<code>addq $0x1,(%rdx,%rax,8)</code> does both: it loads <code>hist[k]</code>, adds 1 inside the core, and stores the result back to the same address.'
  ], {h: 140, cap: 'movzbl loads one byte; addq loads, adds and stores.', draw: function(sv){
    T(sv, 10, 14, 'memory', 's'); T(sv, 300, 14, 'core', 's');
    R(sv, 10, 22, 150, 34, 'box'); T(sv, 85, 44, 'data[i] = 123', 'm', 'middle');
    R(sv, 10, 88, 150, 34, 'box'); T(sv, 85, 110, 'hist[123]: 41 \u2192 42', 'm', 'middle');
    R(sv, 300, 22, 150, 34, 'a4b'); T(sv, 375, 44, 'eax = 123', 'm', 'middle');
    R(sv, 300, 88, 150, 34, 'a4b'); T(sv, 375, 110, '41 + 1 = 42', 'm', 'middle');
    A(sv, 'M162 39 H296', true); T(sv, 229, 32, 'load (movzbl)', 's', 'middle');
    A(sv, 'M162 96 H296'); T(sv, 229, 90, 'load', 's', 'middle');
    A(sv, 'M298 114 H164', true); T(sv, 229, 134, 'store', 's', 'middle');
  }});

  var d = P.sec(root, 'code', 'Instructions are bytes too', 'Machine code lives in memory next to data.');
  P.row(d, [
    'Each instruction is stored as 1 to 15 bytes of ' + g('mcode', 'machine code') + '. The loop body\u2019s five instructions take 17 bytes, starting at address 0x555555555190.',
    'The core fetches those bytes from memory, decodes them into operations, and executes them. A special register, rip, holds the address of the next instruction to fetch.',
    '[[ch:code]] decodes these bytes field by field.'
  ], {h: 104, cap: 'The 17 bytes of the loop body, grouped by instruction.', draw: function(sv){
    var B = [['0f', 'b6', '07'], ['48', '83', 'c7', '01'], ['48', '83', '04', 'c2', '01'], ['48', '39', 'f7'], ['75', 'ef']], N = ['movzbl', 'add', 'addq', 'cmp', 'jne'], x = 26;
    T(sv, 26, 22, '0x555555555190', 's m');
    B.forEach(function(grp, k){
      var x0 = x;
      grp.forEach(function(b){ R(sv, x, 30, 24, 28, k % 2 ? 'a4b' : 'a3b', 2); T(sv, x + 12, 49, b, 'm s', 'middle'); x += 24; });
      T(sv, (x0 + x) / 2, 78, N[k], 'm', 'middle'); x += 0;
    });
  }});
}});

/* ======================= 04 reading x86 assembly ======================= */
App.chapter({id: 'asm', group: 'Foundations', short: 'Reading assembly', title: 'Reading x86 assembly',
lede: 'Enough x86-64 assembly to read the example function line by line.',
points: ['AT&amp;T syntax: source first, destination last.', 'Memory operands are written disp(base,index,scale).', 'Flags and conditional jumps build loops.'],
build: function(root){
  var P = App.P, g = App.g, T = P.T, R = P.R, A = P.A;
  var a = P.sec(root, 'syntax', 'The shape of an instruction', 'Mnemonic, size suffix, operands.');
  P.row(a, [
    'Each line of ' + g('asmlang', 'assembly') + ' is one instruction: a mnemonic, then its operands. This site shows ' + g('att', 'AT&amp;T syntax') + ', the default output of gcc and objdump. Four rules cover most of it:',
    P.ul(['<b>Order.</b> Source first, destination last: <code>add $0x1,%rdi</code> means rdi = rdi + 1.',
      '<b>%</b> marks a register: <code>%rdi</code>, <code>%eax</code>.',
      '<b>$</b> marks a constant: <code>$0x1</code> is the number 1.',
      '<b>Size suffix.</b> The last letter of the mnemonic gives the operand size: q = 8 bytes, l = 4, w = 2, b = 1. <code>addq</code> adds 8-byte values.'])
  ], {h: 120, cap: 'addq $0x1,(%rdx,%rax,8): add the constant 1 to an 8-byte value in memory.', draw: function(sv){
    R(sv, 20, 34, 54, 32, 'a3b'); T(sv, 47, 55, 'add', 'h m', 'middle');
    R(sv, 76, 34, 24, 32, 'a3b'); T(sv, 88, 55, 'q', 'h m', 'middle');
    R(sv, 114, 34, 70, 32, 'a4b'); T(sv, 149, 55, '$0x1', 'h m', 'middle');
    T(sv, 191, 55, ',', 'h m', 'middle');
    R(sv, 200, 34, 210, 32, 'a1b'); T(sv, 305, 55, '(%rdx,%rax,8)', 'h m', 'middle');
    T(sv, 47, 88, 'mnemonic', 's', 'middle'); T(sv, 88, 104, 'size: 8 bytes', 's', 'middle');
    T(sv, 149, 88, 'source', 's', 'middle'); T(sv, 305, 88, 'destination: a memory operand', 's', 'middle');
  }});

  var b = P.sec(root, 'memory', 'Memory operands', 'How an instruction names an address.');
  P.row(b, [
    'An operand in parentheses is a memory address. The general form is <code>disp(base,index,scale)</code>, meaning base + index \u00d7 scale + disp.',
    '<code>(%rdi)</code> is simply the address in rdi.',
    '<code>(%rdx,%rax,8)</code> is rdx + rax \u00d7 8: base <code>hist</code>, index <i>k</i>, 8 bytes per element. That is exactly <code>hist[k]</code>: the array arithmetic from [[ch:addr]], done by the address hardware.'
  ], {h: 120, cap: 'The memory operand computes the address of hist[123].', draw: function(sv){
    R(sv, 10, 20, 124, 42, 'a1b'); T(sv, 72, 37, 'rdx: hist', 'h m', 'middle'); T(sv, 72, 54, '0x7ffd4a3c2a80', 's m', 'middle');
    T(sv, 144, 46, '+', 'h', 'middle');
    R(sv, 154, 20, 84, 42, 'a2b'); T(sv, 196, 37, 'rax: k', 'h m', 'middle'); T(sv, 196, 54, '123', 's m', 'middle');
    T(sv, 248, 46, '\u00d7', 'h', 'middle');
    R(sv, 258, 20, 40, 42, 'box'); T(sv, 278, 46, '8', 'h m', 'middle');
    T(sv, 309, 46, '=', 'h', 'middle');
    R(sv, 320, 20, 130, 42, 'box on'); T(sv, 385, 37, 'address', 's', 'middle'); T(sv, 385, 54, '0x7ffd4a3c2e58', 's m', 'middle');
    T(sv, 230, 100, '(%rdx,%rax,8) = hist + 123 \u00d7 8 = &hist[123]', 'm', 'middle');
  }});

  var c = P.sec(root, 'flags', 'Flags and jumps', 'How a loop decides to repeat.');
  P.row(c, [
    'Arithmetic and compare instructions set ' + g('flags') + ': status bits such as zero and sign. A conditional jump reads them and either jumps to a label or continues with the next line.',
    '<code>cmp %rsi,%rdi</code> computes rdi \u2212 rsi and keeps only the flags.',
    '<code>jne .L3</code> then jumps back to <code>.L3</code> unless the result was zero: the loop repeats until the data pointer reaches the end pointer.'
  ], {h: 212, cap: 'The loop repeats until cmp finds the two pointers equal.', draw: function(sv){
    T(sv, 14, 47, '.L3:', 'h m');
    ['movzbl (%rdi),%eax', 'add $0x1,%rdi', 'addq $0x1,(%rdx,%rax,8)', 'cmp %rsi,%rdi', 'jne .L3'].forEach(function(t, i){
      R(sv, 60, 30 + i * 32, 240, 24, i === 4 ? 'box on' : 'box', 4); T(sv, 72, 47 + i * 32, t, 'm');
    });
    A(sv, 'M300 170 H352 V42 H304', true); T(sv, 360, 100, 'not equal:', 's'); T(sv, 360, 116, 'repeat', 's');
    A(sv, 'M180 182 V204'); T(sv, 190, 204, 'equal: continue to ret', 's');
  }});

  var d = P.sec(root, 'walk', 'The example, line by line', 'The whole function, with each line explained.');
  var rows = [['00', 'test %rsi,%rsi', 'Set flags from n: is n zero or negative?'], ['03', 'jle .L1', 'If so, skip straight to ret.'],
    ['05', 'add %rdi,%rsi', 'rsi = data + n: an end pointer, one past the last byte.'], ['08', 'nopl 0x0(%rax,%rax,1)', 'Padding: moves the loop start to a 16-byte boundary.'],
    ['10', 'movzbl (%rdi),%eax', '<code>.L3</code>: load the byte <code>data[i]</code> into eax.'], ['13', 'add $0x1,%rdi', 'Advance the data pointer: the <code>i++</code> of the C loop.'],
    ['17', 'addq $0x1,(%rdx,%rax,8)', '<code>hist[data[i]] += 1</code>, in memory.'], ['1c', 'cmp %rsi,%rdi', 'Has the data pointer reached the end pointer?'],
    ['1f', 'jne .L3', 'If not, repeat the loop.'], ['21', 'ret', '<code>.L1</code>: return to the caller.']];
  P.row(d, [
    'This is the whole function as gcc 13.3 compiled it at -O2. The calling convention delivered <code>data</code> in rdi, <code>n</code> in rsi and <code>hist</code> in rdx before the first instruction ran.',
    '<div class="p-table-wrap"><table class="p-table autolink"><tr><th>offset</th><th>instruction</th><th>what it does</th></tr>' +
      rows.map(function(r){ return '<tr><td>' + r[0] + '</td><td><code>' + r[1] + '</code></td><td>' + r[2] + '</td></tr>'; }).join('') + '</table></div>',
    'The loop is the five instructions from <code>.L3</code> to <code>jne</code>: 17 bytes that run once per byte of <code>data[]</code>. [[ch:code]] decodes them byte by byte.'
  ]);
}});
