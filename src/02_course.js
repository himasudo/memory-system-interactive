/* ======================= the course: parts, lessons, navigation, progress =======================
   The lab reads as a course. Pages are grouped into parts; each part has an overview page.
   A lesson is written as short steps: one or two sentences, then one artifact (code, a real
   output, a table, a diagram), then what it means. New terms are defined in the margin where
   they first appear. Each lesson ends with questions, a short summary and a link to the next. */
(function(){
  'use strict';
  var h = App.h;

  /* ---------- the course map ---------- */
  var PARTS = [
    {id: 'start', n: '', title: 'Start here', pages: ['start']},
    {id: 'found', n: 'I', title: 'Foundations',
      lede: 'The background every later part uses: binary and hex, addresses, instructions, cycles, caches, virtual memory in brief, and how cores and devices share memory.',
      outcomes: ['Read hex values and bit ranges', 'Read a few lines of x86 assembly', 'Tell latency from throughput', 'Explain why caches and virtual memory exist'],
      pages: ['bits', 'addr', 'instr', 'asm', 'time', 'whycache', 'vm', 'share']},
    {id: 'machine', n: 'II', title: 'The machine and the core',
      lede: 'A map of the whole machine, then the path from a line of C to the µops a core executes.',
      outcomes: ['Name every block between a core and DRAM', 'Follow C to instructions to µops', 'Read an out-of-order pipeline cycle by cycle'],
      pages: ['map', 'code', 'core']},
    {id: 'vmem', n: 'III', title: 'Virtual memory',
      lede: 'How every address a program uses is translated: pages, page tables, the TLB, page faults, copy-on-write and huge pages, and what the kernel does behind each one. The outputs shown are from real runs on a Linux machine.',
      outcomes: ['Translate a virtual address by hand through all four levels', 'Read /proc/self/maps, pagemap and smaps', 'Decode any page-fault error code', 'Predict when the TLB is flushed and when other CPUs are interrupted', 'Measure page-fault costs and keep them out of benchmarks'],
      runs: ['a', 'b'],
      pages: ['vm-addresses', 'vm-pages', 'vm-space', 'vm-tree', 'vm-levels', 'vm-pte', 'vm-walk', 'vm-tlb', 'xlate', 'vm-huge', 'vm-vipt', 'vm-switch', 'vm-shootdown',
        'vm-faults', 'vm-demand', 'vm-files', 'vm-cow', 'vm-protect', 'vm-cost', 'vm-buddy', 'vm-reclaim', 'vm-alias', 'vm-virt', 'vm-review']},
    {id: 'cache', n: 'IV', title: 'Caches and DRAM',
      lede: 'Inside an L1 lookup, down through L2, L3 and the fabric, into the DRAM chips, and the prefetchers that fetch lines before they are asked for.',
      outcomes: ['Split an address into tag, index and offset', 'Follow a miss to DRAM and back', 'Explain row hits, misses and conflicts', 'Tell a useful prefetch from a late or useless one'],
      pages: ['l1d', 'hier', 'dram', 'pref']},
    {id: 'order', n: 'V', title: 'Stores, ordering and coherence',
      lede: 'What happens after a store retires, which orders other cores may observe, and how caches keep many copies of one line consistent.',
      outcomes: ['Follow a store from the store queue to L1', 'Read a litmus test', 'Step through MOESI state changes'],
      pages: ['stores', 'coh']},
    {id: 'io', n: 'VI', title: 'Devices and I/O',
      lede: 'How the CPU and devices share one machine: PCI Express, device registers (MMIO), DMA, the IOMMU, interrupts, and the queues behind every disk and network request. The outputs shown are from real runs on a Linux machine.',
      outcomes: ['Read a device’s configuration space and BARs', 'Explain posted writes, doorbells and descriptor rings', 'Pick the right DMA API call and say what it does to the caches', 'Trace one read through io_uring, the block layer, the device and the interrupt'],
      runs: ['b'],
      pages: ['io-paths', 'io-pcie', 'io-config', 'io-mmio', 'io-rings', 'io-dma', 'io-coherence', 'io-iommu', 'io-irq', 'io-block', 'io-uring', 'dev', 'io-review']},
    {id: 'system', n: 'VII', title: 'The whole system',
      lede: 'Everything together: one access end to end, then predicting, measuring and explaining performance on your own machine.',
      outcomes: ['Add up one access from instruction to DRAM', 'Predict throughput from queue sizes', 'Measure your own machine and compare'],
      pages: ['e2e', 'perf']},
    {id: 'ref', n: '', title: 'Reference', pages: ['atlas', 'gloss']}
  ];
  /* Pages that are interactive labs rather than lessons; marked "Lab" in lists. */
  var LAB_PAGES = {xlate: 'Lab', dev: 'Lab'};
  /* The machines the "Lab run" outputs were captured on. Each output names its machine. */
  var MACHINES = {
    a: {name: 'machine A', text: 'a cloud virtual machine (KVM) running Linux 6.18.44 on 2 vCPUs. The CPU reports itself as an Intel Xeon at 2.80 GHz (family 6, model 85, stepping 7), with 46-bit physical and 48-bit virtual addresses.'},
    b: {name: 'machine B', text: 'another cloud virtual machine (KVM) running the same Linux 6.18.44 build on 4 vCPUs. The CPU reports itself as an Intel Xeon at 2.10 GHz (family 6, model 207, stepping 2), with 52-bit physical and 57-bit virtual addresses; the kernel uses 4-level paging, as on machine A. Its devices are virtio devices on PCI Express.'}
  };
  var RUN_MACHINE = MACHINES.a.text;
  function machineName(id){ return (MACHINES[id || 'a'] || MACHINES.a).name; }

  var pageInfo = {};   /* id -> {part, index, count} */
  var lessons = {};

  /* ---------- progress (per reader, in this browser only) ---------- */
  var DONE_KEY = 'memLab.done', done = {};
  try { (JSON.parse(localStorage.getItem(DONE_KEY) || '[]') || []).forEach(function(id){ if (typeof id === 'string') done[id] = 1; }); } catch(e){}
  function saveDone(){ try { localStorage.setItem(DONE_KEY, JSON.stringify(Object.keys(done))); } catch(e){} }
  function isDone(id){ return !!done[id]; }
  function setDone(id, on){ if (on) done[id] = 1; else delete done[id]; saveDone(); refreshMarks(); }

  /* ---------- registration ---------- */
  App.lesson = function(def){
    if (lessons[def.id]) throw new Error('Duplicate lesson: ' + def.id);
    lessons[def.id] = def;
    App.chapter({id: def.id, short: def.short, title: def.title, lede: def.lede, lesson: def,
      build: function(root){ return renderLesson(root, def); }});
  };
  PARTS.forEach(function(p){
    if (!p.n) return;
    App.chapter({id: 'part-' + p.id, short: p.title, title: p.title, lede: p.lede, partPage: p,
      build: function(root){ return renderPart(root, p); }});
  });

  function partOf(id){ return pageInfo[id] ? pageInfo[id].part : null; }
  function registered(id){ return App.chapters.some(function(c){ return c.id === id; }); }
  function chap(id){ for (var i = 0; i < App.chapters.length; i++) if (App.chapters[i].id === id) return App.chapters[i]; return null; }
  function livePages(p){ return p.pages.filter(registered); }

  /* ---------- order the chapters and number them ---------- */
  function order(chapters){
    var rank = {}, k = 0;
    PARTS.forEach(function(p){
      if (p.n) rank['part-' + p.id] = k++;
      var list = livePages(p);
      list.forEach(function(id, i){ rank[id] = k++; pageInfo[id] = {part: p, index: i + 1, count: list.length}; });
      if (p.n) pageInfo['part-' + p.id] = {part: p, index: 0, count: list.length};
    });
    chapters.forEach(function(c, i){ if (rank[c.id] === undefined) rank[c.id] = 10000 + i; });
    chapters.sort(function(a, b){ return rank[a.id] - rank[b.id]; });
    chapters.forEach(function(c){
      var info = pageInfo[c.id];
      if (!info) return;
      if (c.id === 'start') c.num = '00';
      else if (info.part.id === 'ref') c.num = c.id === 'gloss' ? 'A–Z' : 'REF';
      else if (info.index === 0) c.num = info.part.n;
      else c.num = info.part.n + '.' + String(info.index).padStart(2, '0');
      c.group = info.part.title;
    });
  }

  /* ---------- sidebar: parts, with the current part open ---------- */
  var navEl = null;
  function navLink(parent, c, cls){
    var a = h('a', {href: '#' + c.id, 'class': cls || ''}, parent,
      '<span class="nav-num">' + navNum(c) + '</span><span class="nav-label">' + c.short + (LAB_PAGES[c.id] ? ' <em class="nav-lab">lab</em>' : '') + '</span><span class="nav-arrow">›</span>');
    a.dataset.id = c.id;
    a.addEventListener('mouseup', function(){ a.blur(); });
    return a;
  }
  function navNum(c){ var i = pageInfo[c.id]; if (!i) return c.num || ''; if (c.id === 'start') return '00'; if (i.part.id === 'ref') return c.id === 'gloss' ? 'A–Z' : 'REF'; return String(i.index).padStart(2, '0'); }
  function buildNav(nav){
    navEl = nav; nav.innerHTML = '';
    PARTS.forEach(function(p){
      var list = livePages(p); if (!list.length) return;
      if (p.id === 'start'){ navLink(nav, chap('start'), 'nav-home'); return; }
      if (p.id === 'ref'){ h('div', {'class': 'nav-group'}, nav, p.title); list.forEach(function(id){ navLink(nav, chap(id)); }); return; }
      var box = h('div', {'class': 'nav-part', 'data-part': p.id}, nav);
      var head = h('a', {href: '#part-' + p.id, 'class': 'nav-part-head'}, box,
        '<span class="nav-num">' + p.n + '</span><span class="nav-label">' + p.title + '</span><span class="nav-prog"></span>');
      head.dataset.id = 'part-' + p.id;
      var items = h('div', {'class': 'nav-items'}, box);
      list.forEach(function(id){ navLink(items, chap(id)); });
    });
    refreshMarks();
  }
  function refreshMarks(){
    if (!navEl) return;
    PARTS.forEach(function(p){
      var box = navEl.querySelector('.nav-part[data-part="' + p.id + '"]'); if (!box) return;
      var list = livePages(p), n = list.filter(isDone).length;
      var pr = box.querySelector('.nav-prog'); if (pr) pr.textContent = n ? n + '/' + list.length : String(list.length);
    });
    var links = navEl.querySelectorAll('a[data-id]');
    for (var i = 0; i < links.length; i++) links[i].classList.toggle('done', isDone(links[i].dataset.id));
    var marks = document.querySelectorAll('[data-done-for]');
    for (var j = 0; j < marks.length; j++) marks[j].classList.toggle('is-done', isDone(marks[j].getAttribute('data-done-for')));
  }
  function onShow(ch){
    if (!navEl) return;
    var info = pageInfo[ch.id], cur = info ? info.part.id : null;
    var boxes = navEl.querySelectorAll('.nav-part');
    for (var i = 0; i < boxes.length; i++) boxes[i].classList.toggle('open', boxes[i].getAttribute('data-part') === cur);
    var heads = navEl.querySelectorAll('.nav-part-head');
    for (var j = 0; j < heads.length; j++) heads[j].classList.toggle('in-part', heads[j].parentNode.getAttribute('data-part') === cur);
    var cn = document.getElementById('crumbNum'); if (cn) cn.textContent = ch.num;
  }

  /* ---------- headers and footers ---------- */
  function kicker(ch){
    var i = pageInfo[ch.id]; if (!i) return null;
    if (ch.id === 'start') return 'Course home';
    if (i.part.id === 'ref') return 'Reference';
    if (i.index === 0) return 'Part ' + i.part.n;
    return 'Part ' + i.part.n + ' · ' + i.part.title + ' · ' + (LAB_PAGES[ch.id] ? 'Lab' : 'Lesson ' + i.index + ' of ' + i.count);
  }
  function header(sec, ch){
    var k = kicker(ch); if (!k) return false;
    var hd = h('header', {'class': 'chh course-head' + (ch.lesson ? ' lesson-head' : '') + (ch.partPage ? ' part-head' : '')}, sec);
    var copy = h('div', {'class': 'ch-copy'}, hd);
    h('div', {'class': 'num'}, copy, k);
    h('h1', null, copy, ch.title);
    if (ch.lede) h('p', {'class': 'ch-lede'}, copy, ch.lede);
    if (!ch.lesson && !ch.partPage && ch.points && ch.points.length) h('ul', {'class': 'ch-points'}, copy, ch.points.map(function(p){ return '<li>' + p + '</li>'; }).join(''));
    return true;
  }
  function neighbours(id){
    var cs = App.chapters, i = -1;
    for (var k = 0; k < cs.length; k++) if (cs[k].id === id) i = k;
    return {prev: i > 0 ? cs[i - 1] : null, next: i >= 0 && i < cs.length - 1 ? cs[i + 1] : null};
  }
  function label(c){ var i = pageInfo[c.id]; if (!i || !i.index) return c.num + ' · ' + c.short; return (LAB_PAGES[c.id] ? 'Lab · ' : 'Lesson ' + c.num + ' · ') + c.short; }
  function footer(sec, ch){
    if (!pageInfo[ch.id]) return false;
    var nb = neighbours(ch.id), foot = h('footer', {'class': 'course-foot', 'aria-label': 'Continue the course'}, sec);
    if (ch.id !== 'start' && ch.id !== 'gloss' && ch.id !== 'atlas' && !ch.partPage){
      var mark = h('button', {type: 'button', 'class': 'done-toggle', 'data-done-for': ch.id, 'aria-pressed': isDone(ch.id) ? 'true' : 'false'}, foot,
        '<span class="done-box" aria-hidden="true"></span><span class="done-text"></span>');
      var txt = mark.querySelector('.done-text');
      var sync = function(){ var on = isDone(ch.id); mark.setAttribute('aria-pressed', on ? 'true' : 'false'); txt.textContent = on ? 'Marked as done' : 'Mark this ' + (LAB_PAGES[ch.id] ? 'lab' : 'lesson') + ' as done'; };
      mark.onclick = function(){ setDone(ch.id, !isDone(ch.id)); sync(); };
      sync();
    }
    var row = h('div', {'class': 'course-jumps'}, foot);
    if (nb.prev){ var bp = h('a', {'class': 'course-jump prev', href: '#' + nb.prev.id}, row, '<span>← Previous</span><strong>' + label(nb.prev) + '</strong>'); }
    else h('span', {'class': 'course-jump-spacer'}, row);
    if (nb.next){
      var nd = nb.next.lesson ? nb.next.lesson.lede : nb.next.lede || '';
      h('a', {'class': 'course-jump next', href: '#' + nb.next.id}, row, '<span>Next →</span><strong>' + label(nb.next) + '</strong>' + (nd ? '<small>' + nd + '</small>' : ''));
    }
    return true;
  }

  /* ---------- part overview pages ---------- */
  function renderPart(root, p){
    var wrap = h('div', {'class': 'part-page'}, root);
    if (p.outcomes){
      var o = h('section', {'class': 'part-outcomes'}, wrap);
      h('h2', null, o, 'By the end of this part you can');
      h('ul', null, o, p.outcomes.map(function(x){ return '<li>' + x + '</li>'; }).join(''));
    }
    var list = livePages(p);
    var ls = h('section', {'class': 'part-lessons'}, wrap);
    h('h2', null, ls, list.length + (list.length === 1 ? ' page' : ' pages') + ', in order');
    var ol = h('ol', {'class': 'lesson-cards'}, ls);
    list.forEach(function(id){
      var c = chap(id), i = pageInfo[id], d = c.lesson ? c.lesson.lede : (c.lede || '');
      var li = h('li', {'data-done-for': id}, ol);
      h('a', {href: '#' + id}, li, '<span class="lc-num">' + (LAB_PAGES[id] ? 'Lab' : String(i.index).padStart(2, '0')) + '</span><span class="lc-body"><strong>' + c.short + '</strong>' + (d ? '<small>' + d + '</small>' : '') + '</span><span class="lc-done" aria-label="done"></span>');
    });
    if (p.runs){
      var r = h('section', {'class': 'part-runs'}, wrap), ms = p.runs;
      h('h2', null, r, 'Where the outputs come from');
      h('p', null, r, 'Outputs marked <span class="evidence-label evidence-kind" data-evidence-kind="Lab run">Lab run</span> were captured by running small programs on ' + (ms.length === 1 ? MACHINES[ms[0]].text : (['', 'one', 'two', 'three'][ms.length] || ms.length) + ' machines. Each output names the one it came from:'));
      if (ms.length > 1) h('ul', {'class': 'part-machines'}, r, ms.map(function(m){ return '<li><b>' + MACHINES[m].name.charAt(0).toUpperCase() + MACHINES[m].name.slice(1) + '</b>: ' + MACHINES[m].text + '</li>'; }).join(''));
      h('p', null, r, 'Physical addresses on a virtual machine are the virtual machine’s own: the host translates them once more. Timings are these machines’ and will differ on yours.');
      h('p', null, r, 'The programs and the raw outputs are in the repository’s <code>labruns/</code> folder, so you can run them on your own Linux machine. Reading physical frame numbers and kernel trace events needs root.');
    }
    refreshMarks();
    return {};
  }

  /* =================== lessons =================== */
  function esc(t){ return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  /* code text: escape, then ⟦marked⟧ text becomes a highlight */
  function codeHTML(text){
    return esc(text).replace(/⟦([^⟧]*)⟧/g, '<mark>$1</mark>');
  }
  function shellHTML(text){
    return text.split('\n').map(function(line){
      var cls = /^\$ /.test(line) ? 'ln-cmd' : /^\s*#/.test(line) ? 'ln-com' : '';
      var body = codeHTML(line);
      if (cls === 'ln-cmd') body = '<span class="ln-prompt">$ </span>' + body.slice(2);
      return '<span class="ln' + (cls ? ' ' + cls : '') + '">' + (body || ' ') + '</span>';
    }).join('');
  }
  function cHTML(text){
    /* light C/asm colouring: comments and strings; everything else plain */
    return text.split('\n').map(function(line){
      var m = line.match(/^(.*?)(\/\/.*|\/\*.*|#.*)$/), body;
      if (m && !/["']/.test(m[1].slice(-1)) && !/#include|#define|#if|#endif/.test(line)) body = codeHTML(m[1]) + '<span class="c-com">' + codeHTML(m[2]) + '</span>';
      else body = codeHTML(line);
      return '<span class="ln">' + (body || ' ') + '</span>';
    }).join('');
  }
  function chip(kind, extra){
    if (!kind) return '';
    return '<span class="evidence-label evidence-kind" data-evidence-kind="' + esc(kind) + '">' + esc(kind) + '</span>' + (extra ? '<span class="lx-chip-x">' + extra + '</span>' : '');
  }
  function termNote(t){
    var title, def, key = null;
    if (typeof t === 'string'){ key = t; var e = App.G[t]; title = e ? e.t : t; def = e ? e.d : ''; }
    else { title = t[0]; def = t[1]; }
    return '<div class="lx-term"' + (key ? ' data-term="' + key + '"' : '') + '><dt>' + title + '</dt><dd>' + def + '</dd></div>';
  }

  /* In lesson prose, hex values such as 0x7f3a1b2c3d4e are set in code type (outside tags and
     outside existing <code> elements). */
  function prose(html){
    var out = '', inCode = 0, parts = String(html).split(/(<[^>]+>)/);
    parts.forEach(function(t){
      if (t.charAt(0) === '<'){ if (/^<code\b/i.test(t)) inCode++; else if (/^<\/code>/i.test(t)) inCode = Math.max(0, inCode - 1); out += t; return; }
      out += inCode ? t : t.replace(/(^|[^\w&#])(0x[0-9a-fA-F]+)\b/g, '$1<code class="lx-hex">$2</code>');
    });
    return out;
  }
  function Builder(lesson, secEl, sectionNo){
    this.lesson = lesson; this.el = secEl; this.no = sectionNo; this.k = 0;
  }
  var B = Builder.prototype;
  B.row = function(cls, mainHTML, side){
    var r = h('div', {'class': 'lx-row ' + (cls || '')}, this.el);
    var m = h('div', {'class': 'lx-main'}, r, mainHTML || '');
    if (side && side.length) h('dl', {'class': 'lx-side'}, r, side.map(termNote).join(''));
    return m;
  };
  /* a short paragraph; terms: glossary keys or [title, definition] pairs shown in the margin */
  B.p = function(html, terms){ this.row('lx-text', '<p>' + prose(html) + '</p>', terms); return this; };
  B.h = function(title){ this.row('lx-sub', '<h3>' + title + '</h3>'); return this; };
  B.list = function(items, terms){ this.row('lx-text', '<ul class="lx-list">' + items.map(function(x){ return '<li>' + prose(x) + '</li>'; }).join('') + '</ul>', terms); return this; };
  B.steps = function(items, terms){ this.row('lx-text', '<ol class="lx-olist">' + items.map(function(x){ return '<li>' + prose(x) + '</li>'; }).join('') + '</ol>', terms); return this; };
  /* a block of code, a shell session, or a real output */
  B.code = function(text, o){
    o = o || {};
    var lang = o.lang || 'c', body = lang === 'sh' || lang === 'out' ? shellHTML(text) : lang === 'text' ? codeHTML(text).split('\n').map(function(l){ return '<span class="ln">' + (l || ' ') + '</span>'; }).join('') : cHTML(text);
    var langName = {c: 'C', sh: 'shell', out: 'output', asm: 'assembly', text: o.title ? '' : 'text'}[lang] || lang;
    var m = this.row('lx-art' + (o.wide ? ' lx-wide' : ''), '', o.terms);
    var fig = h('figure', {'class': 'lx-code no-autolink lang-' + lang}, m);
    h('div', {'class': 'lx-code-bar'}, fig, '<span class="lx-code-t">' + (o.title || langName) + '</span>' + chip(o.label, o.labelNote));
    if (o.what) h('p', {'class': 'lx-what'}, fig, o.what);
    h('pre', null, fig, '<code>' + body + '</code>');
    if (o.src) h('figcaption', {'class': 'lx-src'}, fig, srcLinks(o.src));
    if (o.cap) h('figcaption', {'class': 'lx-cap'}, fig, o.cap);
    return this;
  };
  /* a measured output from a lab run */
  B.run = function(text, o){ o = o || {}; o.lang = o.lang || 'out'; o.label = o.label || 'Lab run'; o.title = o.title || 'output'; return this.code(text, o); };
  /* a registered lab-run excerpt (src/38_runs.js), quoted with the file it came from */
  B.out = function(id, o){
    var r = App.RUNS.get(id); o = o || {};
    var lines = o.lines ? o.lines.map(function(i){ return r.lines[i]; }) : r.lines;
    if (o.what === undefined) o.what = r.what;
    o.title = o.title || 'output';
    o.labelNote = o.labelNote || 'labruns/' + r.file + ' · ' + machineName(r.machine);
    return this.run(lines.join('\n'), o);
  };
  /* a quotation from a source document */
  B.quote = function(text, o){
    o = o || {};
    var m = this.row('lx-art' + (o.wide ? ' lx-wide' : ''), '', o.terms);
    var fig = h('figure', {'class': 'lx-quote'}, m);
    h('div', {'class': 'lx-code-bar'}, fig, '<span class="lx-code-t">' + (o.cite || '') + '</span>' + chip(o.label || 'Vendor docs'));
    var isCode = o.code;
    if (isCode) h('pre', {'class': 'no-autolink'}, fig, '<code>' + cHTML(text) + '</code>');
    else h('blockquote', null, fig, text.split('\n').map(function(t){ return '<p>' + t + '</p>'; }).join(''));
    if (o.src) h('figcaption', {'class': 'lx-src'}, fig, srcLinks(o.src));
    return this;
  };
  function srcLinks(src){
    var list = Array.isArray(src[0]) ? src : [src];
    return list.map(function(s){ return '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener noreferrer">' + s[0] + ' ↗</a>'; }).join(' · ');
  }
  /* a strip of bit fields: [{bits:'47:39', name:'PML4 index', val:'254', tone:'a1'}] */
  B.bits = function(fields, o){
    o = o || {};
    var m = this.row('lx-art' + (o.wide ? ' lx-wide' : ''), '', o.terms);
    var fig = h('figure', {'class': 'lx-bits' + (o.dense ? ' dense' : '')}, m);
    if (o.title) h('div', {'class': 'lx-bits-t'}, fig, o.title + (o.label ? chip(o.label) : ''));
    var strip = h('div', {'class': 'lx-bits-strip no-autolink'}, fig);
    fields.forEach(function(f){
      var w = f.w || 1;
      var c = h('div', {'class': 'lx-bit tone-' + (f.tone || 'n') + (f.hot ? ' hot' : ''), style: {flexGrow: w}}, strip);
      h('span', {'class': 'b-range'}, c, f.bits);
      h('span', {'class': 'b-val'}, c, f.val == null ? '' : String(f.val));
      h('span', {'class': 'b-name'}, c, f.name || '');
    });
    if (o.cap) h('figcaption', {'class': 'lx-cap'}, fig, o.cap);
    return this;
  };
  B.table = function(head, rows, o){
    o = o || {};
    var m = this.row('lx-art' + (o.wide ? ' lx-wide' : ''), '', o.terms);
    var fig = h('figure', {'class': 'lx-table'}, m);
    if (o.title || o.label) h('div', {'class': 'lx-code-bar'}, fig, '<span class="lx-code-t">' + (o.title || '') + '</span>' + chip(o.label));
    var wrap = h('div', {'class': 'lx-table-wrap'}, fig);
    var t = h('table', {'class': o.mono === false ? '' : 'mono-cells'}, wrap);
    h('thead', null, t, '<tr>' + head.map(function(x){ return '<th>' + x + '</th>'; }).join('') + '</tr>');
    h('tbody', null, t, rows.map(function(r){ return '<tr' + (r.hot ? ' class="hot"' : '') + '>' + (r.cells || r).map(function(x){ return '<td>' + x + '</td>'; }).join('') + '</tr>'; }).join(''));
    if (o.cap) h('figcaption', {'class': 'lx-cap'}, fig, o.cap);
    if (o.src) h('figcaption', {'class': 'lx-src'}, fig, srcLinks(o.src));
    return this;
  };
  /* boxes joined by arrows, one per step of a chain: [{k:'CR3', v:'0x107a24000', d:'…', hot:true}] */
  B.chain = function(items, o){
    o = o || {};
    var m = this.row('lx-art' + (o.wide ? ' lx-wide' : ''), '', o.terms);
    var fig = h('figure', {'class': 'lx-chain' + (o.vertical ? ' vertical' : '')}, m);
    if (o.title) h('div', {'class': 'lx-bits-t'}, fig, o.title + (o.label ? chip(o.label) : ''));
    var ol = h('ol', {'class': 'no-autolink'}, fig);
    items.forEach(function(it){
      var li = h('li', {'class': (it.hot ? 'hot ' : '') + (it.tone ? 'tone-' + it.tone : '')}, ol);
      if (it.k) h('span', {'class': 'c-k'}, li, it.k);
      if (it.v) h('span', {'class': 'c-v'}, li, it.v);
      if (it.d) h('span', {'class': 'c-d'}, li, it.d);
      if (it.arrow) h('span', {'class': 'c-arrow'}, li, it.arrow);
    });
    if (o.cap) h('figcaption', {'class': 'lx-cap'}, fig, o.cap);
    return this;
  };
  /* an SVG figure drawn with App.P helpers */
  B.fig = function(w, ht, draw, o){
    o = o || {};
    var m = this.row('lx-art lx-figrow' + (o.wide ? ' lx-wide' : ''), '', o.terms);
    var sv = App.P.fig(m, w, ht, o.cap); sv.parentNode.classList.add('lx-svg');
    if (o.maxw) sv.parentNode.style.maxWidth = o.maxw + 'px';
    draw(sv);
    return this;
  };
  /* a callout: kind = arm | amd | intel | vm | careful | deeper | linux */
  var NOTE = {arm: 'On Arm', amd: 'On AMD', intel: 'On Intel', vm: 'On a virtual machine', careful: 'Careful', deeper: 'Going deeper', linux: 'In Linux', why: 'Why it matters', other: 'Elsewhere'};
  B.note = function(kind, html, title){
    var m = this.row('lx-art', '');
    h('aside', {'class': 'lx-note note-' + kind}, m, '<div class="lx-note-k">' + (title || NOTE[kind] || kind) + '</div><div class="lx-note-b">' + html.split('\n').map(function(t){ return /^\s*<(ul|ol|pre|table|div)/.test(t) ? t : '<p>' + prose(t) + '</p>'; }).join('') + '</div>');
    return this;
  };
  /* an interactive panel; build(el) fills it */
  B.try = function(title, intro, build){
    var m = this.row('lx-art lx-tryrow', '');
    var box = h('section', {'class': 'lx-try'}, m);
    h('div', {'class': 'lx-try-k'}, box, 'Try it');
    h('h3', null, box, title);
    if (intro) h('p', {'class': 'lx-try-intro'}, box, intro);
    var body = h('div', {'class': 'lx-try-body'}, box);
    build(body);
    return this;
  };
  /* an existing lab section (App.labSection inside fn) placed right here */
  B.lab = function(fn){
    var m = this.row('lx-art lx-labrow lx-wide', '');
    fn(m);
    return this;
  };
  /* a question to answer before reading on */
  B.ask = function(q){ var m = this.row('lx-art', ''); quiz(m, [q], {inline: true}); return this; };
  /* free HTML (used sparingly) */
  B.html = function(html, cls){ this.row('lx-art ' + (cls || ''), html); return this; };
  B.custom = function(fn, cls){ var m = this.row('lx-art ' + (cls || ''), ''); fn(m); return this; };

  /* ---------- multiple-choice questions ---------- */
  function quiz(parent, qs, o){
    o = o || {};
    qs.forEach(function(q, qi){
      var box = h('div', {'class': 'lx-q' + (o.inline ? ' inline' : '')}, parent);
      h('div', {'class': 'lx-q-k'}, box, o.inline ? 'Predict' : 'Question ' + (qi + 1));
      h('p', {'class': 'lx-q-p'}, box, q.q);
      var opts = h('div', {'class': 'lx-q-opts', role: 'group', 'aria-label': 'Answers'}, box);
      var fb = h('div', {'class': 'lx-q-fb', 'aria-live': 'polite'}, box);
      /* lessons list the right answer first; show the options in an order fixed per question */
      var seed = 0; for (var c = 0; c < q.q.length; c++) seed = (seed * 31 + q.q.charCodeAt(c)) >>> 0;
      var order = q.options.map(function(_, i){ return i; }).sort(function(a, b){ return ((a + 1) * 2654435761 ^ seed) % 1009 - ((b + 1) * 2654435761 ^ seed) % 1009; });
      order.forEach(function(i, pos){
        var text = q.options[i];
        var b = h('button', {type: 'button', 'class': 'lx-q-opt'}, opts, '<span class="lx-q-letter">' + 'ABCDEF'.charAt(pos) + '</span><span>' + text + '</span>');
        b.onclick = function(){
          var right = i === q.answer;
          Array.prototype.forEach.call(opts.children, function(x){ x.classList.remove('picked', 'right', 'wrong'); });
          b.classList.add('picked', right ? 'right' : 'wrong');
          fb.className = 'lx-q-fb ' + (right ? 'ok' : 'no');
          fb.innerHTML = '<b>' + (right ? 'Right.' : 'Not quite.') + '</b> ' + (right ? q.why : (q.hint || 'Try another answer.'));
          if (!right && q.hint) fb.innerHTML += '';
        };
      });
    });
  }

  function renderLesson(root, L){
    var info = pageInfo[L.id] || {index: 0};
    var sec = root.closest('.ch'), wrap = h('div', {'class': 'lx no-autolink'}, root);
    /* where this lesson sits */
    if (L.know || L.learn){
      var where = h('div', {'class': 'lx-where'}, wrap);
      if (L.know){ var kn = h('div', {'class': 'lx-know'}, where); h('div', {'class': 'lx-where-k'}, kn, 'You already know'); h('ul', null, kn, L.know.map(function(x){ return '<li>' + x + '</li>'; }).join('')); }
      if (L.learn){ var le = h('div', {'class': 'lx-learn'}, where); h('div', {'class': 'lx-where-k'}, le, 'In this lesson'); h('ul', null, le, L.learn.map(function(x){ return '<li>' + x + '</li>'; }).join('')); }
    }
    var list = [];
    (L.sections || []).forEach(function(S, i){
      var el = h('section', {'class': 'lx-sec', id: L.id + '--' + S.id, 'data-sec': S.id}, wrap);
      var head = h('div', {'class': 'lx-sec-head'}, el);
      h('span', {'class': 'lx-sec-k'}, head, (info.index ? info.index + '.' : '') + (i + 1));
      h('h2', null, head, S.title);
      S.body(new Builder(L, el, i + 1));
      list.push({id: S.id, title: S.title, el: el});
    });
    if (L.check && L.check.length){
      var ck = h('section', {'class': 'lx-sec lx-check', id: L.id + '--check', 'data-sec': 'check'}, wrap);
      h('div', {'class': 'lx-sec-head'}, ck, '<span class="lx-sec-k">✓</span><h2>Check yourself</h2>');
      quiz(h('div', {'class': 'lx-check-body'}, ck), L.check);
      list.push({id: 'check', title: 'Check yourself', el: ck});
    }
    if (L.remember && L.remember.length){
      var rm = h('section', {'class': 'lx-sec lx-remember', id: L.id + '--remember', 'data-sec': 'remember'}, wrap);
      h('div', {'class': 'lx-sec-head'}, rm, '<span class="lx-sec-k">★</span><h2>What to remember</h2>');
      h('ul', {'class': 'lx-remember-list'}, rm, L.remember.map(function(x){ return '<li>' + x + '</li>'; }).join(''));
      if (L.sources && L.sources.length) h('p', {'class': 'lx-sources'}, rm, '<b>Sources</b> ' + srcLinks(L.sources));
      list.push({id: 'remember', title: 'What to remember', el: rm});
    }
    /* lab sections placed inside the lesson join the section menu in page order */
    var labs = sec._sections || [];
    labs.forEach(function(x){ x.el.classList.add('lx-lab'); });
    var all = list.concat(labs.filter(function(x){ return list.indexOf(x) < 0; }));
    all.sort(function(a, b){ return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
    sec._sections = all;
    watchNotes(wrap);
    return {onShow: function(){ layoutNotes(wrap); }};
  }

  /* ---------- margin notes ----------
     On wide screens each definition sits in the margin next to the paragraph that introduces the
     term. Notes are positioned here rather than by the grid, so a long note never pushes the next
     paragraph down: a note that would overlap the one above it moves down, and a section grows at
     its end if its notes need the room. On narrower screens the notes stay in the text flow. */
  function layoutNotes(lx){
    if (!lx.isConnected || !lx.offsetParent) return;
    var sides = Array.prototype.slice.call(lx.querySelectorAll('.lx-side'));
    var secs = Array.prototype.slice.call(lx.querySelectorAll('.lx-sec'));
    if (!sides.length) return;
    if (getComputedStyle(sides[0]).position !== 'absolute'){ sides.forEach(function(sd){ sd.style.top = ''; }); secs.forEach(function(s){ s.style.paddingBottom = ''; }); return; }
    var last = -Infinity;
    secs.forEach(function(sec){
      var mine = sides.filter(function(sd){ return sd.closest('.lx-sec') === sec; });
      var pad = parseFloat(sec.style.paddingBottom) || 0;
      if (!mine.length){ if (pad) sec.style.paddingBottom = ''; return; }
      var base = lx.getBoundingClientRect().top;
      var obstacles = Array.prototype.map.call(sec.querySelectorAll('.lx-wide, .lx-sec-head'), function(el){ var r = el.getBoundingClientRect(); return [r.top - base - 10, r.bottom - base + 10]; });
      mine.forEach(function(sd){
        var row = sd.parentNode, y = Math.max(row.getBoundingClientRect().top - base + 3, last + 16), ht = sd.offsetHeight, moved = true, guard = 0;
        while (moved && guard++ < 20){ moved = false; obstacles.forEach(function(o){ if (y < o[1] && y + ht > o[0]){ y = o[1]; moved = true; } }); }
        sd.style.top = y + 'px';
        last = y + ht;
      });
      /* the section's own bottom, without any room added earlier for its notes */
      var bottom = sec.getBoundingClientRect().bottom - base - pad;
      var need = last > bottom ? Math.ceil(last - bottom + 8) : 0;
      if (need !== pad) sec.style.paddingBottom = need ? need + 'px' : '';
    });
  }
  function watchNotes(lx){
    var pending = false;
    function soon(){ if (pending) return; pending = true; requestAnimationFrame(function(){ pending = false; layoutNotes(lx); }); }
    soon(); setTimeout(soon, 120);
    window.addEventListener('resize', soon, {passive: true});
    if (window.ResizeObserver){
      var lastW = 0;
      new ResizeObserver(function(entries){ var w = entries[0].contentRect.width; if (Math.abs(w - lastW) > 1){ lastW = w; soon(); } }).observe(lx);
      Array.prototype.forEach.call(lx.querySelectorAll('.lx-main'), function(m){ new ResizeObserver(soon).observe(m); });
    }
  }

  /* Before any page is shown, map every term a lesson defines in its margin to the first lesson
     (in course order) that defines it, so "Taught in" links in definitions work from any page.
     The lesson bodies are run once against a builder that only records term keys. */
  function DryBuilder(){ this.keys = []; }
  ['p', 'list', 'steps', 'h', 'code', 'run', 'out', 'quote', 'bits', 'table', 'chain', 'fig', 'note', 'try', 'lab', 'ask', 'html', 'custom'].forEach(function(m){
    DryBuilder.prototype[m] = function(a, b){
      var t = (m === 'p' || m === 'list' || m === 'steps') ? b : (b && typeof b === 'object' && !Array.isArray(b) ? b.terms : null);
      if (m === 'table' || m === 'fig') t = arguments[2] && arguments[2].terms;
      if (t) for (var i = 0; i < t.length; i++) if (typeof t[i] === 'string') this.keys.push(t[i]);
      return this;
    };
  });
  function indexTerms(){
    if (!App.TERM_HOME) return;
    var seen = {};
    App.chapters.forEach(function(c){
      var L = c.lesson; if (!L) return;
      var d = new DryBuilder();
      (L.sections || []).forEach(function(S){ try { S.body(d); } catch(e){} });
      d.keys.forEach(function(k){ if (!seen[k]){ seen[k] = 1; App.TERM_HOME[k] = L.id; } });
    });
  }

  App.Course = {
    parts: PARTS, info: pageInfo, lessons: lessons, order: order, nav: buildNav, onShow: onShow,
    header: header, footer: footer, isDone: isDone, setDone: setDone, indexTerms: indexTerms,
    livePages: livePages, labPages: LAB_PAGES, runMachine: RUN_MACHINE, machines: MACHINES, quiz: quiz, chip: chip, esc: esc
  };
})();
