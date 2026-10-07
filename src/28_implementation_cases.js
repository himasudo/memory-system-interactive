/* Chapter 09, second part: how AMD, Intel and Arm build the same machine. */
(function () {
  'use strict';
  var I = ImplementationEvidence,
    U = App.LabUI,
    h = App.h,
    s = App.s;
  function badge(root, kind) {
    return U.text('span', root, kind, {
      class: 'evidence-label evidence-kind',
      'data-evidence-kind': kind
    });
  }
  function refs(root, keys) {
    return U.sources(
      root,
      keys.map(function (k) {
        return I.sources[k];
      })
    );
  }
  /* Schematic for one case: boxes, optional grids of small boxes (cores), labeled links. */
  function draw(root, c) {
    var figure = h(
        'figure',
        {
          class: 'implementation-figure',
          'data-implementation': c.id,
          'data-implementation-scope': c.generation
        },
        root
      ),
      sc = h('div', { class: 'scroller' }, figure);
    var height = Math.max.apply(
      null,
      c.nodes.map(function (n) {
        return n.y + n.h;
      })
    );
    var svg = s(
      'svg',
      {
        viewBox: '0 0 740 ' + (height + 14),
        role: 'img',
        'aria-label': c.title + '. ' + c.scope,
        style: 'min-width:640px'
      },
      sc
    );
    c.edges.forEach(function (e) {
      s('path', { d: 'M ' + e[0] + ' ' + e[1] + ' L ' + e[2] + ' ' + e[3], class: 'wire' }, svg);
      if (e[4])
        s(
          'text',
          { x: e[0] + 8, y: (e[1] + e[3]) / 2 + 4, class: 's impl-edge-label' },
          svg,
          e[4]
        );
    });
    c.nodes.forEach(function (n) {
      var group = s('g', { class: n.unknown ? 'implementation-unknown' : '' }, svg);
      s(
        'rect',
        {
          x: n.x,
          y: n.y,
          width: n.w,
          height: n.h,
          rx: 8,
          class: n.unknown ? 'sunk' : n.cls || 'box'
        },
        group
      );
      var top = !!n.cells;
      n.lines.forEach(function (t, j) {
        s(
          'text',
          {
            x: top ? n.x + 14 : n.x + n.w / 2,
            y: top ? n.y + 22 + j * 16 : n.y + n.h / 2 + (j - (n.lines.length - 1) / 2) * 18 + 4,
            'text-anchor': top ? 'start' : 'middle',
            class: j ? 's' : 'h'
          },
          group,
          t
        );
      });
      if (n.cells) {
        var g = n.cells,
          gap = 6,
          cw = (g.w - gap * (g.cols - 1)) / g.cols,
          ch = (g.h - gap * (g.rows - 1)) / g.rows;
        for (var r = 0; r < g.rows; r++)
          for (var k = 0; k < g.cols; k++) {
            var x = g.x + k * (cw + gap),
              y = g.y + r * (ch + gap);
            s('rect', { x: x, y: y, width: cw, height: ch, rx: 4, class: g.cls || 'box' }, group);
            if (cw >= 60)
              s(
                'text',
                { x: x + cw / 2, y: y + ch / 2 + 4, 'text-anchor': 'middle', class: 's impl-cell' },
                group,
                g.label
              );
          }
      }
    });
    var caption = h('figcaption', null, figure);
    badge(caption, c.kind);
    U.text('span', caption, ' ' + c.generation + '. ' + c.scope);
    return figure;
  }
  /* The side-by-side table that opens the "Real chips" part. */
  function chips(root) {
    var sec = App.labSection(
      root,
      'chips',
      'Same parts, different choices',
      'Every design has private caches, a shared cache, coherence and memory controllers. The sizes and the wiring differ.'
    );
    U.text(
      'p',
      sec,
      'The example machine in this lab is deliberately small, so every structure fits on screen. Here is how it compares with three current server designs.'
    );
    var c = I.comparison;
    U.table(sec, [''].concat(c.columns), c.rows).classList.add('chip-compare');
    U.text(
      'p',
      sec,
      'Two patterns stand out. AMD and Intel both keep the L1 data cache at 4 KiB per way (48 KiB ÷ 12 ways), so the set can be picked from page-offset bits alone; Arm’s 64 KiB, 4-way L1 handles the aliasing in hardware instead. And memory sits in different places: behind one central I/O die (AMD), on each compute die (Intel), or wherever the chip vendor puts it (Arm).'
    );
    refs(sec, c.sources);
  }
  function caseSection(root, c) {
    var sec = App.labSection(root, c.id, c.title, c.choice);
    sec.classList.add('implementation-case');
    U.text('p', sec, c.fact);
    draw(sec, c);
    var grid = h('div', { class: 'impl-notes' }, sec);
    var a = h('div', { class: 'impl-note' }, grid);
    U.text('h3', a, 'What it changes');
    U.text('p', a, c.prediction);
    var b = h('div', { class: 'impl-note' }, grid);
    U.text('h3', b, 'Try it');
    U.text('p', b, c.experiment);
    U.text('p', sec, c.limits, { class: 'note' });
    refs(sec, c.sources);
  }
  function published(root) {
    var sec = App.labSection(
        root,
        'published',
        'Published measurements',
        'What independent testers measured on Zen 5 and on Intel’s newest P-core, and what those numbers can and can’t tell you.'
      ),
      q = I.instruction;
    badge(sec, q.kind);
    U.text('h3', sec, 'L1 load-to-use latency: 4 cycles on both');
    U.text('p', sec, q.instruction + ': ' + q.scope + ' ' + q.method);
    var figure = h(
      'figure',
      { class: 'published-evidence-figure', 'data-source': 'uops', 'data-reported': 'true' },
      sec
    );
    q.rows.forEach(function (r) {
      var row = h('div', { class: 'evidence-bar-row' }, figure);
      U.text('span', row, r.microarchitecture);
      var track = h('div', { class: 'evidence-bar-track' }, row);
      h(
        'div',
        { class: 'evidence-bar', style: 'width:' + (r.latency_cycles / 6) * 100 + '%' },
        track
      );
      U.text('strong', row, r.latency_cycles + ' core cycles');
    });
    U.text(
      'figcaption',
      figure,
      'Both report 4 cycles from the address to the loaded value. Equal L1 latency says nothing about which memory system is faster overall.'
    );
    U.table(
      sec,
      ['Microarchitecture', 'Exact CPU', 'Measurement'],
      q.rows.map(function (r) {
        return [
          r.microarchitecture,
          r.cpu_model || 'Not specified · ' + r.cpu_model_reason,
          'Dependency chain; ' + r.latency_cycles + ' core cycles'
        ];
      })
    );
    U.text('p', sec, q.limits, { class: 'evidence-limits' });
    refs(
      sec,
      [q.source, q.methodSource].concat(
        q.rows.map(function (r) {
          return r.source;
        })
      )
    );
    var c = I.counterCase;
    U.text('h3', sec, 'Counting misses: AMD and Intel count different things');
    badge(sec, c.kind);
    U.table(
      sec,
      ['CPU', 'Memory in the test'],
      c.models.map(function (v, i) {
        return [v, c.conditions[i]];
      })
    );
    U.text('p', sec, c.scope + ' ' + c.fact);
    var boundary = h('div', { class: 'counter-boundaries', 'data-source': 'lioncove' }, sec);
    [
      ['Intel: retired loads', 'Only loads that finished on the correct path'],
      ['AMD: demand L1D misses', 'Can include loads on mispredicted paths']
    ].forEach(function (pair) {
      var box = h('div', { class: 'counter-boundary' }, boundary);
      U.text('strong', box, pair[0]);
      U.text('span', box, '↓');
      U.text('span', box, pair[1]);
    });
    U.text('p', sec, c.limits, { class: 'evidence-limits' });
    refs(sec, [c.source]);
    U.text('h3', sec, 'Turn it into your own experiment');
    h(
      'p',
      null,
      sec,
      'A single dependency chain measures latency; many chains measure overlap. The <a href="#perf/queues">finite-queue lab</a> shows the mechanism, and <a href="#perf/datasets">the benchmarks</a> measure it on your machine. Their timer counts nanoseconds over a whole run, not cycles per instruction, so compare like with like.'
    );
  }
  function history(root) {
    var sec = App.labSection(
      root,
      'history',
      'Older designs worth knowing',
      'Two details from earlier chips that still explain experiments in this lab.'
    );
    badge(sec, 'Peer-reviewed');
    U.text('h3', sec, 'AMD, 2011 to 2019: an L1 way predictor');
    U.text(
      'p',
      sec,
      'Instead of reading every way of a set, these cores hash the virtual address into a small “µtag” to guess which way holds the line, and read only that one; the full tag check still decides hit or miss. Lipp et al. reverse-engineered it in 2020 on AMD chips from 2011 to 2019, including the first Zen cores. The L1 chapter here reads every way in parallel, the textbook design.'
    );
    refs(sec, ['takeaway']);
    badge(sec, 'Vendor docs');
    U.text('h3', sec, 'Intel Xeon: from inclusive to non-inclusive L3');
    U.text(
      'p',
      sec,
      'Intel’s Broadwell-era Xeons (E5 v4) kept a copy of every L2 line in the L3. With Skylake-SP, Intel made the L3 non-inclusive, so it no longer has to duplicate the L2s. The inclusion lab runs the same trace under both policies.'
    );
    U.sources(sec, [App.Evidence.sources.cache]);
    h('p', null, sec, '<a href="#hier/inclusion">Open the inclusion lab →</a>');
  }
  App.CaseStudies = { draw: draw, badge: badge };
  App.extendChapter('map', function (root) {
    chips(root);
    I.cases.forEach(function (c) {
      caseSection(root, c);
    });
    published(root);
    history(root);
  });
})();
