/* ======================= chapter: from C to µops ======================= */
App.chapter({id: 'code', short: 'C \u2192 \u00b5ops', title: 'From C to instructions to \u00b5ops',
lede: 'One line of C, followed down to the operations the core actually executes.',
points: ['<code>hist[data[i]]++</code> compiles to a 5-instruction loop body.', 'Those 5 instructions are 17 bytes of machine code.', 'The core turns them into 7 internal operations (\u00b5ops) per iteration.', 'Everything shown is real output of gcc 13.3 at <code>-O2</code>.'],
build: function(root){
  var h = App.h, s = App.s, g = App.g, EX = App.EX;
  var I = [
    {off: 0x00, b: '48 85 f6', asm: 'test   %rsi,%rsi', c: 1, f: [['rex', '48'], ['op', '85'], ['modrm', 'f6']],
     what: 'Sets flags from rsi AND rsi. Checks n \u2264 0.', uops: [['ALU', 'ALU', 'rsi', 'flags', 'Fuses with the jle that follows into one macro-op.']]},
    {off: 0x03, b: '7e 1c', asm: 'jle    .L1', c: 1, f: [['op', '7e'], ['rel', '1c']],
     what: 'If n \u2264 0, jump to ret. rel8 = +0x1c: target = 0x05 + 0x1c = 0x21.', uops: [['BR', 'ALU', 'flags', 'rip', 'Fused with test.']]},
    {off: 0x05, b: '48 01 fe', asm: 'add    %rdi,%rsi', c: 1, f: [['rex', '48'], ['op', '01'], ['modrm', 'fe']],
     what: 'rsi = data + n: a pointer one past the last byte. gcc replaced the counter i with a moving pointer and this end pointer.', uops: [['ALU', 'ALU', 'rsi, rdi', 'rsi', '']]},
    {off: 0x08, b: '0f 1f 84 00 00 00 00 00', asm: 'nopl   0x0(%rax,%rax,1)', c: -1, f: [['op', '0f 1f'], ['modrm', '84'], ['sib', '00'], ['disp', '00 00 00 00']],
     what: 'An 8-byte no-op. It exists only to push the loop start to offset 0x10, a 16-byte boundary. Executed once on entry.', uops: [['NOP', '\u2014', '', '', 'Decoded and retired, does no work.']]},
    {off: 0x10, b: '0f b6 07', asm: 'movzbl (%rdi),%eax', c: 2, lbl: '.L3', f: [['op', '0f b6'], ['modrm', '07']],
     what: 'Load 1 byte from [rdi] (data[i]), ' + g('zx', 'zero-extend') + ' it into eax. Writing eax also clears bits 63:32 of rax, so rax holds a clean index 0..255.', uops: [['LD', 'AGU + load pipe', 'rdi', 'rax', 'Zero-extension happens in the load path; no extra ALU \u00b5op.']]},
    {off: 0x13, b: '48 83 c7 01', asm: 'add    $0x1,%rdi', c: 1, f: [['rex', '48'], ['op', '83'], ['modrm', 'c7'], ['imm', '01']],
     what: 'rdi += 1: advance the data pointer. This is i++ after strength reduction.', uops: [['ALU', 'ALU', 'rdi', 'rdi', '']]},
    {off: 0x17, b: '48 83 04 c2 01', asm: 'addq   $0x1,(%rdx,%rax,8)', c: 2, f: [['rex', '48'], ['op', '83'], ['modrm', '04'], ['sib', 'c2'], ['imm', '01']],
     what: 'hist[rax] += 1, directly in memory. Address = rdx + rax\u00d78 (rdx = hist, 8 = sizeof(long)). One instruction, four pieces of work.',
     uops: [['LD', 'AGU + load pipe', 'rdx, rax', 'tmp0', 'Reads hist[k].'], ['ALU', 'ALU', 'tmp0', 'tmp1', 'tmp0 + 1.'], ['STA', 'AGU', 'rdx, rax', 'SQ entry: address', g('sta')], ['STD', 'ALU \u2192 SQ', 'tmp1', 'SQ entry: data', g('std') + '. Memory changes only when this store commits after retirement.']]},
    {off: 0x1c, b: '48 39 f7', asm: 'cmp    %rsi,%rdi', c: 1, f: [['rex', '48'], ['op', '39'], ['modrm', 'f7']],
     what: 'Flags from rdi \u2212 rsi: has the data pointer reached the end pointer?', uops: [['ALU', 'ALU', 'rdi, rsi', 'flags', g('fusion', 'Macro-fused') + ' with jne on Zen (at dispatch).']]},
    {off: 0x1f, b: '75 ef', asm: 'jne    .L3', c: 1, f: [['op', '75'], ['rel', 'ef']],
     what: 'Loop back if not equal. rel8 = 0xef = \u221217: target = 0x21 \u2212 17 = 0x10.', uops: [['BR', 'ALU (branch)', 'flags', 'rip', 'Predicted by the ' + g('btb') + ' long before it executes.']]},
    {off: 0x21, b: 'c3', asm: 'ret', c: 3, lbl: '.L1', f: [['op', 'c3']],
     what: 'Pop the return address from [rsp] and jump to it.', uops: [['LD+BR', 'AGU + branch', 'rsp', 'rsp, rip', 'Target predicted by the ' + g('ras') + '.']]}
  ];
  var CL = [
    {t: 'void histogram(const unsigned char *data, long n, long *hist)', a: []},
    {t: '{', a: []},
    {t: '    for (long i = 0; i < n; i++)', a: [0, 1, 2, 5, 7, 8]},
    {t: '        hist[data[i]]++;', a: [4, 6]},
    {t: '}', a: [9]}
  ];
  var FC = {rex: ['REX prefix', 'a1'], op: ['opcode', 'a3'], modrm: ['ModRM', 'a2'], sib: ['SIB', 'a4'], imm: ['immediate', 'act'], rel: ['rel8 offset', 'act'], disp: ['displacement', 'act']};
  var REG = ['rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi'];
  var sel = 6;

  var top = h('div', {'class': 'card'}, root);
  top.innerHTML = '<h3>Where the arguments are</h3><p>The System V x86-64 calling convention passes the first three integer arguments in the registers <code>rdi</code>, <code>rsi</code> and <code>rdx</code>. On entry:</p><ul class="kv-list"><li><code>rdi</code> = <code>data</code> = <code>' + App.hx(EX.data) + '</code></li><li><code>rsi</code> = <code>n</code> = <code>3</code></li><li><code>rdx</code> = <code>hist</code> = <code>' + App.hx(EX.hist) + '</code></li></ul><p>The function starts at <code>' + App.hx(EX.fn) + '</code>, so the loop label <code>.L3</code> is at <code>' + App.hx(EX.loop) + '</code>. Every chapter uses these same addresses.</p>';

  var three = h('div', {'class': 'c2u'}, root);
  var cC = h('div', {'class': 'card'}, three, '<h3>C source</h3>');
  var cS = h('div', {'class': 'card'}, three, '<h3>Assembly and machine code <span class="tag pub">objdump -d</span></h3>');
  var cpre = h('div', {'class': 'src'}, cC), apre = h('div', {'class': 'src'}, cS);
  CL.forEach(function(l, i){
    var d = h('div', {'class': 'ln'}, cpre, '<span class="no">' + (i + 1) + '</span>' + l.t.replace(/ /g, '&nbsp;'));
    d.onmouseenter = function(){ mark(l.a); }; d.onmouseleave = function(){ mark(null); };
    d.onclick = function(){ if (l.a.length) pick(l.a[l.a.length - 1]); };
    l.el = d;
  });
  I.forEach(function(ins, i){
    var d = h('div', {'class': 'ln asm'}, apre, (ins.lbl ? '<div class="lab">' + ins.lbl + ':</div>' : '') +
      '<span class="no">' + ins.off.toString(16).padStart(2, '0') + '</span><span class="bytes">' + ins.b + '</span><span class="ins">' + ins.asm + '</span>');
    d.onclick = function(){ pick(i); }; ins.el = d;
  });
  h('p', {'class': 'note', style: 'margin-top:8px'}, cS, 'Click an instruction to decode it. Offsets are from the function start ' + App.hx(EX.fn) + '.');
  h('p', {'class': 'note asm-key'}, cS, '<b>Registers</b> ' + g('r_rdi', 'rdi') + ' data pointer, ' + g('r_rsi', 'rsi') + ' end pointer, ' + g('r_rdx', 'rdx') + ' base of hist, ' + g('r_rax', 'rax') + ' the byte data[i].');
  h('p', {'class': 'note asm-key'}, cS, '<b>Instructions</b> ' + [['i_test', 'test'], ['i_jcc', 'jle'], ['i_add', 'add'], ['i_nop', 'nopl'], ['i_movzx', 'movzbl'], ['i_add', 'addq'], ['i_cmp', 'cmp'], ['i_jcc', 'jne'], ['i_ret', 'ret']].map(function(x){ return g(x[0], x[1]); }).join(' '));
  h('p', {'class': 'note', style: 'margin-top:8px'}, cC, 'Hover a line to see which instructions came from it. The <code>for</code> line produced the setup and the loop control; the body line produced the load and the read-modify-write.');

  var det = h('div', {'class': 'grid2'}, root);
  var enc = h('div', {'class': 'card'}, det), uo = h('div', {'class': 'card'}, det);

  /* memory layout of the code */
  var lay = h('div', {'class': 'card'}, root);
  lay.innerHTML = '<h3>The same bytes in memory</h3><p>The whole function fits in one 64-byte ' + g('line', 'cache line') + ' (' + App.hx(EX.fn) + '\u2013' + App.hx(EX.fn + 63n) + '). Zen+ fetches a 32-byte ' + g('fetchwin', 'window') + ' that may start on any 16-byte boundary.</p><p>Because gcc aligned <code>.L3</code> to 0x\u2026190, one window starting there holds the entire 17-byte loop, so every iteration needs one fetch.</p><p>After the first pass the loop\'s decoded \u00b5ops also sit in the ' + g('opcache') + ', and fetch + decode are skipped.</p>';
  var lsv = s('svg', {viewBox: '0 0 1000 250', 'class': 'lay'}, h('div', {'class': 'scroller', style: 'border:0'}, lay));
  var cellW = 27, x0 = 112, y0 = 34;
  var byteOwner = []; I.forEach(function(ins, i){ ins.b.split(' ').forEach(function(_, k){ byteOwner[ins.off + k] = i; }); });
  var bytes = []; I.forEach(function(ins){ ins.b.split(' ').forEach(function(x){ bytes.push(x); }); });
  var cells = [];
  for (var r = 0; r < 2; r++){
    s('text', {x: 8, y: y0 + r * 92 + 22, 'class': 'm', 'font-size': 11.5}, lsv, App.hx(EX.fn + BigInt(r * 32)).replace('0x55555555', '0x\u2026'));
    for (var cI = 0; cI < 32; cI++){
      var o = r * 32 + cI, x = x0 + (cI % 32) * cellW - (cI >= 16 ? 0 : 0), y = y0 + r * 92;
      var own = byteOwner[o];
      var rc = s('rect', {x: x, y: y, width: cellW - 2, height: 34, rx: 3, 'class': own === undefined ? 'sunk' : 'bc'}, lsv);
      var tx = s('text', {x: x + (cellW - 2) / 2, y: y + 21, 'text-anchor': 'middle', 'class': 'm', 'font-size': 10.5}, lsv, o < bytes.length ? bytes[o] : '');
      if (own !== undefined){ (function(ii){ rc.style.cursor = 'pointer'; rc.onclick = function(){ pick(ii); }; })(own); }
      cells.push({r: rc, o: own});
      if (cI % 4 === 0) s('text', {x: x + 2, y: y - 5, 'class': 's m'}, lsv, (o).toString(16));
    }
  }
  /* fetch window bracket from 0x10 to 0x2f */
  var wx0 = x0 + 16 * cellW, wx1 = x0 + 32 * cellW - 2, wy = y0 + 40;
  s('path', {d: 'M ' + wx0 + ' ' + wy + ' L ' + wx0 + ' ' + (wy + 8) + ' L ' + wx1 + ' ' + (wy + 8) + ' L ' + wx1 + ' ' + wy, 'class': 'wire', style: 'stroke:var(--act);stroke-width:2'}, lsv);
  var wx2 = x0 + 16 * cellW - 2, wy2 = y0 + 92 + 40;
  s('path', {d: 'M ' + x0 + ' ' + wy2 + ' L ' + x0 + ' ' + (wy2 + 8) + ' L ' + wx2 + ' ' + (wy2 + 8) + ' L ' + wx2 + ' ' + wy2, 'class': 'wire', style: 'stroke:var(--act);stroke-width:2'}, lsv);
  s('text', {x: wx0, y: wy + 24, 'class': 's'}, lsv, 'one 32-byte fetch window starting at \u2026190 (loop starts here) \u2026');
  s('text', {x: x0, y: wy2 + 24, 'class': 's'}, lsv, '\u2026 continues into the next 16 bytes: the loop ends at \u20261a0, ret at \u20261a1');
  s('text', {x: x0, y: 240, 'class': 's'}, lsv, 'Grey = bytes after ret (padding / next function). Coloured = this function; click any byte to decode its instruction.');

  /* predecode demo */
  var pdc = h('div', {'class': 'card'}, root);
  pdc.innerHTML = '<h3>Why ' + g('predecode') + ' exists</h3><p>x86 instructions are 1 to 15 bytes long, and nothing in a byte says "an instruction starts here". The fetch unit receives a flat stream:</p>' +
    '<div class="bstream">' + I.slice(4, 9).map(function(ins){ return ins.b.split(' ').map(function(b){ return '<span>' + b + '</span>'; }).join(''); }).join('') + '</div>' +
    '<p>Predecode marks the boundaries by examining prefixes, opcode and ModRM of each candidate start so that four decoders can work in parallel:</p>' +
    '<div class="bstream">' + I.slice(4, 9).map(function(ins, k){ return '<em class="g' + (k % 2) + '">' + ins.b.split(' ').map(function(b){ return '<span>' + b + '</span>'; }).join('') + '</em>'; }).join('') + '</div>' +
    '<p class="note">Sizes: <code>movzbl</code> 3 bytes, <code>add</code> 4, <code>addq</code> to memory 5, <code>cmp</code> 3, <code>jne</code> 2. Total: 17 bytes for 5 instructions.</p>';

  function bits(v, groups){
    var b = v.toString(2).padStart(8, '0'), k = 0, out = '<div class="bitrow">';
    groups.forEach(function(gr){ out += '<div class="bg"><div class="bb">' + b.substr(k, gr[0]).split('').map(function(x){ return '<i>' + x + '</i>'; }).join('') + '</div><div class="bl">' + gr[1] + '</div><div class="bv">' + gr[2] + '</div></div>'; k += gr[0]; });
    return out + '</div>';
  }
  function decodeFields(ins){
    var out = '';
    ins.f.forEach(function(f){
      var v = parseInt(f[1].split(' ')[0], 16);
      if (f[0] === 'rex') out += '<p><b>REX = 0x' + f[1] + '</b></p>' + bits(v, [[4, 'fixed 0100', ''], [1, 'W', (v >> 3) & 1 ? '64-bit' : '32-bit'], [1, 'R', (v >> 2) & 1], [1, 'X', (v >> 1) & 1], [1, 'B', v & 1]]);
      if (f[0] === 'modrm'){
        var mod = v >> 6, reg = (v >> 3) & 7, rm = v & 7;
        var ext = /^(83|0f 1f)$/.test(ins.f.filter(function(x){ return x[0] === 'op'; })[0][1]);
        out += '<p><b>ModRM = 0x' + f[1] + '</b></p>' + bits(v, [[2, 'mod', ['[reg]', '[reg]+d8', '[reg]+d32', 'register'][mod]], [3, 'reg', ext ? '/' + reg + (reg === 0 && ins.f[1][1] === '83' ? ' = ADD' : '') : REG[reg] + (ins.b.indexOf('0f b6') === 0 ? ' (eax)' : '')], [3, 'r/m', rm === 4 && mod !== 3 ? 'SIB follows' : REG[rm]]]);
      }
      if (f[0] === 'sib') out += '<p><b>SIB = 0x' + f[1] + '</b></p>' + bits(v, [[2, 'scale', '\u00d7' + (1 << (v >> 6))], [3, 'index', REG[(v >> 3) & 7]], [3, 'base', REG[v & 7]]]);
    });
    return out;
  }
  function mark(list){
    I.forEach(function(ins, i){ ins.el.classList.toggle('hl', !!list && list.indexOf(i) >= 0); });
  }
  function pick(i){
    sel = i; var ins = I[i];
    I.forEach(function(x, k){ x.el.classList.toggle('sel', k === i); });
    CL.forEach(function(l){ l.el.classList.toggle('sel', l.a.indexOf(i) >= 0); });
    cells.forEach(function(c){ if (c.o !== undefined) c.r.setAttribute('class', 'bc' + (c.o === i ? ' bsel' : '')); });
    enc.innerHTML = '<h3>Encoding of <code>' + ins.asm.replace(/\s+/, ' ') + '</code></h3><div class="fields">' + ins.f.map(function(f){ return '<div class="fld ' + FC[f[0]][1] + '"><code>' + f[1] + '</code><span>' + FC[f[0]][0] + '</span></div>'; }).join('') + '</div>' +
      '<p>' + ins.what + '</p>' + decodeFields(ins) +
      (ins.f.some(function(f){ return f[0] === 'rex'; }) ? '<p class="note">' + g('rex') + ' \u00b7 ' + g('modrm') + '</p>' : '');
    uo.innerHTML = '<h3>What the core turns it into</h3>' +
      '<table class="mt"><tr><th>\u00b5op</th><th>unit</th><th>reads</th><th>writes</th></tr>' + ins.uops.map(function(u){ return '<tr><td><b>' + u[0] + '</b></td><td style="font-family:var(--sans)">' + u[1] + '</td><td>' + u[2] + '</td><td>' + u[3] + '</td></tr>' + (u[4] ? '<tr><td colspan="4" class="unote">' + u[4] + '</td></tr>' : ''); }).join('') + '</table>' +
      '<p class="note" style="margin-top:10px">' + (i === 6 ? 'Shown in the generic 4-\u00b5op form Intel documents for a memory-destination add. AMD tracks memory read-modify-write forms as one ' + g('mop') + ' in the retire queue while executing the same four pieces of work. [[ch:core]] runs exactly these four.' : 'Per iteration the loop needs 7 µops: 2 loads, 1 store (address + data), 2 adds and 1 fused compare-and-branch. Those are exactly the 7 rows per iteration in [[ch:core]].') + '</p>';
  }
  pick(sel);
}});
