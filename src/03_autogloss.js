/* ======================= automatic links: chapter references and glossary terms ======================= */
(function(){
  /* ---- chapter references: [[ch:id]], [[chs:a,b]], [[chr:a,b]], [[num:id]] ---- */
  var REF = /\[\[(ch|chs|chr|num):([a-z0-9_,]+)\]\]/g;
  function nums(ids){ return ids.map(function(i){ return App.chNum(i); }); }
  function plain(k, ids){
    var n = nums(ids);
    if (k === 'num') return n[0];
    if (k === 'ch') return ids[0] === 'gloss' ? 'the glossary' : 'Chapter ' + n[0];
    return 'Chapters ' + n[0] + (k === 'chr' ? '\u2013' : ' and ') + n[1];
  }
  function link(id, label){ var a = document.createElement('a'); a.href = '#' + id; a.className = 'ch-ref'; a.textContent = label; return a; }
  function resolveRefs(t){
    var text = t.nodeValue; if (!text || text.indexOf('[[') < 0) return t;
    var el = t.parentNode; if (!el) return null;
    if (el.closest && el.closest('svg,a,button,option,title')){ t.nodeValue = text.replace(REF, function(_, k, ids){ return plain(k, ids.split(',')); }); return t; }
    var frag = document.createDocumentFragment(), last = 0, m; REF.lastIndex = 0;
    while ((m = REF.exec(text))){
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var k = m[1], ids = m[2].split(','), n = nums(ids);
      if (k === 'num') frag.appendChild(document.createTextNode(n[0]));
      else if (k === 'ch') frag.appendChild(link(ids[0], plain('ch', ids)));
      else { frag.appendChild(document.createTextNode('Chapters ')); frag.appendChild(link(ids[0], n[0])); frag.appendChild(document.createTextNode(k === 'chr' ? '\u2013' : ' and ')); frag.appendChild(link(ids[1], n[1])); }
      last = m.index + m[0].length;
    }
    var tail = last < text.length ? document.createTextNode(text.slice(last)) : null;
    if (tail) frag.appendChild(tail);
    el.replaceChild(frag, t); return tail;
  }

  /* ---- glossary terms: registers, instructions, hex values, acronyms ---- */
  var REG = {}, CODE_ONLY = {}, MN = {};
  function put(map, key, names, codeOnly){ names.split(' ').forEach(function(n){ map[n] = key; if (codeOnly) CODE_ONLY[n] = 1; }); }
  put(REG, 'r_rax', 'rax eax'); put(REG, 'r_rax', 'ax al', 1); put(REG, 'r_rdi', 'rdi edi'); put(REG, 'r_rsi', 'rsi esi');
  put(REG, 'r_rdx', 'rdx edx'); put(REG, 'r_rdx', 'dl', 1); put(REG, 'r_rsp', 'rsp'); put(REG, 'pc', 'rip', 1);
  put(REG, 'gpr', 'rbx rcx rbp ebx ecx ebp r8 r9 r10 r11 r12 r13 r14 r15 r8d r9d r10d r11d r12d r13d r14d r15d');
  put(MN, 'i_mov', 'mov movq movl movb movw'); put(MN, 'i_movzx', 'movzbl movzx movzwl movzbq movzbw'); put(MN, 'i_add', 'add addq addl addb addw');
  put(MN, 'i_inc', 'inc incq incl'); put(MN, 'i_cmp', 'cmp cmpq cmpl cmpb'); put(MN, 'i_test', 'test testq testl testb');
  put(MN, 'i_jcc', 'jne jle je jnz jz jl jg jge jb jbe ja jae'); put(MN, 'i_ret', 'ret retq'); put(MN, 'i_nop', 'nop nopl nopw');
  put(MN, 'fence', 'mfence sfence lfence'); put(MN, 'clflush', 'clflush clflushopt clwb'); put(MN, 'nt', 'movnti movntdq movntps movntpd');
  put(MN, 'swpf', 'prefetchw prefetcht0 prefetcht1 prefetcht2 prefetchnta'); put(MN, 'i_lock', 'lock');
  var ACR = {TLB:'tlb', DTLB:'dtlb', iTLB:'itlb', ROB:'rob', RAT:'rat', PRF:'prf', AGU:'agu', AGUs:'agu', ALU:'alu', ALUs:'alu', LSU:'lsu', VIPT:'vipt', PTE:'pte', PTEs:'pte',
    PML4:'pml4', CR3:'cr3', VPN:'vpn', PFN:'pfn', PCID:'pcid', PCIDs:'pcid', MMU:'mmu', MOESI:'moesi', RFO:'rfo', UMC:'umc', DIMM:'dimm', MMIO:'mmio', DMA:'dma',
    IOMMU:'iommu', IOVA:'iova', 'MSI-X':'msix', NVMe:'nvme', PCIe:'pcie', TLP:'tlp', TLPs:'tlp', MLP:'mlp', SMT:'smt', IPC:'ipc', CCX:'ccx', SRAM:'sram', ISA:'isa',
    BTB:'btb', MAB:'mab', MSHR:'mab', TSO:'tso', '\u00b5op':'uop', '\u00b5ops':'uop'};
  var TOK = /0x[0-9a-fA-F]+|\u00b5ops?|[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*/g;
  var SKIP = 'svg,figcaption,dfn,a,button,input,textarea,select,option,label,script,style,h1,h2,h4,h5,.chh,.scene-lead,.nav,.sec-menu,.src,.ln,.asm,.ins,.seg,.pills,.viz-bar,.focus-strip,.stepper-bar,.inspector-tabs,.gl-bar,.gl-chips,#ch-gloss,.no-autolink';
  var BLOCK = 'p,li,dd,dt,pre,figcaption,blockquote,h3,td,th';
  var usedMap = new WeakMap();
  function usedFor(block){
    var u = usedMap.get(block); if (u) return u;
    u = {}; var ds = block.querySelectorAll('dfn[data-g]'); for (var i = 0; i < ds.length; i++) u[ds[i].getAttribute('data-g')] = 1;
    usedMap.set(block, u); return u;
  }
  function linkText(t){
    var el = t && t.parentNode; if (!el || el.nodeType !== 1 || !el.closest) return;
    if (el.closest(SKIP)) return;
    if (el.closest('table') && !el.closest('.autolink')) return;
    if (el.closest('h3') && !el.closest('code')) return;
    var text = t.nodeValue; if (!text || text.length < 2) return;
    var inCode = !!el.closest('code,pre,kbd,samp'), used = usedFor(el.closest(BLOCK) || el);
    var out = null, last = 0, m; TOK.lastIndex = 0;
    while ((m = TOK.exec(text))){
      var w = m[0], i = m.index, key = null, extra = '';
      if (i > 0 && /[A-Za-z0-9_]/.test(text.charAt(i - 1))) continue;
      if (w.charAt(0) === '0' && w.charAt(1) === 'x'){ key = 'hex'; extra = ' term-hex'; }
      else if (REG[w] && (inCode || !CODE_ONLY[w])) key = REG[w];
      else if (inCode && MN[w]) key = MN[w];
      else if (!inCode && ACR[w]) key = ACR[w];
      if (!key || used[key] || !App.G[key]) continue;
      used[key] = 1;
      if (!out) out = document.createDocumentFragment();
      if (i > last) out.appendChild(document.createTextNode(text.slice(last, i)));
      var d = document.createElement('dfn'); d.setAttribute('data-g', key); d.setAttribute('data-auto', '1');
      d.className = 'term-' + App.termCategory(key) + ' term-auto term-nowrap' + extra + (inCode ? ' term-code' : '');
      d.tabIndex = 0; d.setAttribute('role', 'button'); d.textContent = w;
      out.appendChild(d); last = i + w.length;
    }
    if (!out) return;
    if (last < text.length) out.appendChild(document.createTextNode(text.slice(last)));
    el.replaceChild(out, t);
  }
  /* terms created later (step narrations) get the same color class and keyboard focus as built-time ones */
  function decorate(root){
    var list = root.querySelectorAll ? Array.prototype.slice.call(root.querySelectorAll('dfn[data-g]:not([role])')) : [];
    if (root.matches && root.matches('dfn[data-g]:not([role])')) list.push(root);
    list.forEach(function(d){ d.tabIndex = 0; d.setAttribute('role', 'button'); d.classList.add('term-' + App.termCategory(d.getAttribute('data-g'))); if (d.textContent.length <= 24) d.classList.add('term-nowrap'); });
  }
  function handle(t, terms){ var r = resolveRefs(t); if (terms && r) linkText(r); }
  function processNode(n, terms){
    if (n.nodeType === 3){ handle(n, terms); return; }
    if (n.nodeType !== 1) return;
    var inSvg = n.namespaceURI === 'http://www.w3.org/2000/svg';
    if (inSvg && (n.textContent || '').indexOf('[[') < 0) return;
    var w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, null), list = [], t;
    while ((t = w.nextNode())) list.push(t);
    for (var i = 0; i < list.length; i++) handle(list[i], terms && !inSvg);
    if (!inSvg) decorate(n);
  }
  var main = document.getElementById('main'), pop = document.getElementById('pop');
  var mo = new MutationObserver(function(recs){
    for (var i = 0; i < recs.length; i++){
      var ad = recs[i].addedNodes;
      for (var j = 0; j < ad.length; j++){ var n = ad[j]; if (!n.parentNode) continue; var e = n.nodeType === 1 ? n : n.parentNode; processNode(n, !!(e && e.closest && e.closest('#main'))); }
    }
    mo.takeRecords();
  });
  if (main) mo.observe(main, {childList: true, subtree: true});
  if (pop) mo.observe(pop, {childList: true, subtree: true});

  /* ---- popover extra: a hex value shows its decimal (and, when small, binary) form ---- */
  App.popExtra = function(key, el){
    if (key !== 'hex' || !el) return '';
    var s = (el.textContent || '').trim(); if (!/^0x[0-9a-fA-F]+$/.test(s)) return '';
    var v; try { v = BigInt(s); } catch(e){ return ''; }
    var out = '<p class="term-pop-val"><code>' + s + '</code> = <b>' + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '</b> in decimal';
    if (v < 65536n){ var b = v.toString(2); b = '0'.repeat((4 - b.length % 4) % 4) + b; out += '<br><code>' + b.replace(/(\d{4})(?=\d)/g, '$1 ') + '</code> in binary'; }
    return out + '</p>';
  };
})();
