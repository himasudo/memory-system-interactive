(function () {
  'use strict';
  var U = App.LabUI,
    h = App.h,
    s = App.s,
    M = VMLab;
  function section(root, id, title, copy) {
    return App.labSection(root, id, title, copy);
  }
  function source(root, title, url) {
    U.text('a', root, title, { href: url, target: '_blank', rel: 'noopener' });
  }
  function figure(root, label, width, height) {
    var fig = h('figure', { class: 'perf-chart vm-diagram' }, root);
    return s(
      'svg',
      { viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': label },
      fig
    );
  }
  function box(svg, x, y, w, head, detail, active) {
    s('rect', { x: x, y: y, width: w, height: 54, rx: 7, class: active ? 'actb' : 'box' }, svg);
    s('text', { x: x + 10, y: y + 20, class: 's' }, svg, head);
    s('text', { x: x + 10, y: y + 41, class: 's' }, svg, detail);
  }
  App.gloss(
    'vma',
    'virtual memory area (VMA)',
    'Linux’s record of one mapped address range: its permissions and what backs it. A VMA can exist before any page in it has a page-table entry or physical memory.'
  );
  App.gloss(
    'cow',
    'copy-on-write (COW)',
    'Two processes share a page read-only until one of them writes. The write faults, and the kernel gives the writer its own copy (or reuses the page if nobody else still maps it).'
  );
  App.gloss(
    'minor_fault',
    'minor page fault',
    'A page fault the kernel fixes without reading storage. Not the same as a TLB miss: most TLB misses are handled by a hardware page walk with no fault at all.'
  );
  App.gloss(
    'thp',
    'transparent huge pages (THP)',
    'Linux can back memory with huge pages automatically when it can find them. Asking for them (madvise) is a request, not a guarantee.'
  );
  function lifecycle(root) {
    var sec = section(
      root,
      'os',
      'A mapping is not a resident page',
      'Follow one page through mmap, first touch, fork, copy-on-write and reclaim.'
    );
    U.model(
      sec,
      'A simplified Linux-style lifecycle: four 4 KiB pages, two processes, one TLB each. Frames show one word, but zeroing and copying count whole pages. Faults take no time, and TLB invalidations finish at once (the shootdown lab below adds that wait).'
    );
    U.checkpoint(
      sec,
      'A private anonymous mmap of four pages succeeds. Has the kernel allocated four physical frames yet?',
      ['No: frames come later, on first touch', 'Yes: mmap allocates every page up front'],
      0,
      'Read a new page, then write it. The read maps a shared zero page; only the write allocates a private frame.'
    );
    var o = { kind: 'anon', warm: false, swap: true },
      state,
      history = [],
      cursor = 0,
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(
      ctl,
      'VM mapping kind',
      [
        ['anon', 'Private anonymous'],
        ['file-private', 'File: MAP_PRIVATE'],
        ['file-shared', 'File: MAP_SHARED']
      ],
      o.kind,
      function (v) {
        o.kind = v;
        reset();
      }
    );
    U.select(
      ctl,
      'Initial file page cache',
      [
        [0, 'Empty'],
        [1, 'Already cached']
      ],
      0,
      function (v) {
        o.warm = !!+v;
        reset();
      }
    );
    U.select(
      ctl,
      'Swap',
      [
        [1, 'On'],
        [0, 'Off']
      ],
      1,
      function (v) {
        o.swap = !!+v;
        reset();
      }
    );
    var actor = 'parent',
      page = 0,
      value = 42,
      actorCtl = U.select(
        ctl,
        'Acting process',
        [
          ['parent', 'Parent'],
          ['child', 'Child (fork first)']
        ],
        actor,
        function (v) {
          actor = v;
        }
      );
    U.select(ctl, 'Virtual page', [0, 1, 2, 3], 0, function (v) {
      page = +v;
    });
    U.select(ctl, 'Value to store', [7, 42, 99], 42, function (v) {
      value = +v;
    });
    var actions = h('div', { class: 'perf-actions' }, sec),
      buttons = [];
    [
      ['mmap', 'map'],
      ['Read word', 'read'],
      ['Write word', 'write'],
      ['fork', 'fork'],
      ['Protect read-only', 'protect', 'r'],
      ['Allow read/write', 'protect', 'rw'],
      ['Unmap page', 'unmap'],
      ['Reclaim frame', 'reclaim']
    ].forEach(function (a) {
      var b = U.text('button', actions, a[0], { type: 'button' });
      buttons.push(b);
      b.onclick = function () {
        advance({ kind: a[1], pid: actor, page: page, value: value, prot: a[2] });
      };
    });
    U.text('button', actions, 'Reset mapping', { type: 'button' }).onclick = reset;
    var presets = h('div', { class: 'perf-actions' }, sec);
    [
      [
        'Demand-zero story',
        'anon',
        [{ kind: 'map' }, { kind: 'read' }, { kind: 'write', value: 7 }]
      ],
      [
        'COW story',
        'anon',
        [
          { kind: 'map' },
          { kind: 'write', value: 7 },
          { kind: 'fork' },
          { kind: 'write', pid: 'child', value: 42 },
          { kind: 'read' }
        ]
      ],
      [
        'Private file story',
        'file-private',
        [
          { kind: 'map' },
          { kind: 'read' },
          { kind: 'write', value: 42 },
          { kind: 'fork' },
          { kind: 'read', pid: 'child' }
        ]
      ],
      [
        'Shared file story',
        'file-shared',
        [
          { kind: 'map' },
          { kind: 'read' },
          { kind: 'fork' },
          { kind: 'write', pid: 'child', value: 42 },
          { kind: 'read' },
          { kind: 'reclaim' }
        ]
      ]
    ].forEach(function (a) {
      U.text('button', presets, a[0], { type: 'button' }).onclick = function () {
        o.kind = a[1];
        sec.querySelector('[data-field="VM mapping kind"]').value = a[1];
        reset();
        a[2].forEach(advance);
      };
    });
    var status = U.text('p', sec, '', { role: 'status', class: 'vm-status' }),
      metrics = h('div', { class: 'perf-metrics' }, sec),
      view = h('div', { class: 'cache-state' }, sec),
      svg = figure(view, 'Virtual mappings, leaf entries and shared physical frames', 940, 440),
      tables = h('div', null, view);
    var step = App.CacheUI.replayControls(sec, 'VM event', function (i) {
      if (!history.length) return;
      cursor = i;
      draw(history[i]);
    }, view);
    function reset() {
      state = M.create(o);
      history = [
        { label: 'Nothing mapped yet. Press mmap, or run one of the stories.', state: state }
      ];
      actor = 'parent';
      actorCtl.value = actor;
      step.set(1);
      sec._vmResult = state;
    }
    function advance(op) {
      try {
        var r = M.act(state, op);
        state = r.state;
        history = history.concat(r.events);
        sec._vmResult = state;
        step.set(history.length);
        step.go(history.length - 1);
      } catch (e) {
        status.textContent = 'Action unavailable: ' + e.message;
      }
    }
    function draw(e) {
      var q = e.state;
      status.textContent =
        'Event ' +
        (cursor + 1) +
        ' / ' +
        history.length +
        ' · ' +
        e.label +
        (cursor < history.length - 1 ? ' · Viewing history: go to the last event to act again.' : '');
      buttons.forEach(function (b) {
        b.disabled = cursor < history.length - 1;
      });
      metrics.replaceChildren();
      svg.replaceChildren();
      tables.replaceChildren();
      U.metric(
        metrics,
        'Minor / major faults',
        q.stats.minor + ' / ' + q.stats.major,
        'Major means a storage read was needed'
      );
      U.metric(
        metrics,
        'Allocated / copied / zeroed',
        q.stats.allocations + ' frames / ' + q.stats.copyBytes + ' B / ' + q.stats.zeroBytes + ' B',
        'Frames allocated, bytes copied, bytes zeroed'
      );
      U.metric(
        metrics,
        'Writeback / swap out / swap in',
        q.stats.writebackBytes + ' / ' + q.stats.swapOutBytes + ' / ' + q.stats.swapInBytes + ' B',
        'File pages go to the file, anonymous pages to swap'
      );
      U.metric(
        metrics,
        'Walks / TLB hits',
        q.stats.walks + ' / ' + q.stats.tlbHits,
        'A page walk is not a fault'
      );
      var ids = Object.keys(q.frames),
        height = Math.max(390, 65 * ids.length + 60);
      svg.setAttribute('viewBox', '0 0 940 ' + height);
      var fy = {};
      ids.forEach(function (id, j) {
        fy[id] = 55 + j * 65;
      });
      ['parent', 'child'].forEach(function (pid, col) {
        var pr = q.processes[pid],
          x = 10 + col * 285;
        s(
          'text',
          { x: x + 10, y: 25, class: 's' },
          svg,
          pid + (pr ? ' · ' + (pr.runnable ? 'runnable' : 'preparing') : ' · not created')
        );
        for (var pg = 0; pg < 4; pg++) {
          var y = 55 + pg * 78,
            pte = pr && pr.ptes[pg],
            vma = pr && pr.vmas[pg],
            detail = !vma
              ? 'unmapped'
              : !pte
                ? 'VMA ' + vma.prot + ' · no leaf PTE'
                : pte.swap !== undefined
                  ? 'swap slot ' + pte.swap + (pte.cow ? ' · COW' : '')
                  : 'frame ' +
                    pte.frame +
                    ' · ' +
                    (pte.writable ? 'RW' : 'RO') +
                    (pte.cow ? ' · COW' : '');
          if (pte && pte.frame !== undefined) {
            var path = col
              ? 'M ' +
                (x + 265) +
                ' ' +
                (y + 27) +
                ' C 600 ' +
                (y + 27) +
                ',615 ' +
                (fy[pte.frame] + 27) +
                ',655 ' +
                (fy[pte.frame] + 27)
              : 'M ' +
                (x + 265) +
                ' ' +
                (y + 27) +
                ' H 286 V ' +
                (y + 66) +
                ' H 605 Q 630 ' +
                (y + 66) +
                ' 655 ' +
                (fy[pte.frame] + 27);
            s('path', { d: path, class: 'wire' }, svg);
          }
          box(
            svg,
            x,
            y,
            265,
            'page ' +
              pg +
              (pr && pr.tlb[pg] ? ' · TLB ' + (pr.tlb[pg].writable ? 'RW' : 'RO') : ''),
            detail,
            q.last && q.last.pid === pid && q.last.page === pg
          );
        }
      });
      s('text', { x: 665, y: 25, class: 's' }, svg, 'Physical data frames');
      ids.forEach(function (id) {
        var f = q.frames[id];
        box(
          svg,
          655,
          fy[id],
          275,
          'frame ' + id + ' · ' + f.kind + (f.dirty ? ' · dirty' : ''),
          'word = ' + f.value,
          false
        );
      });
      U.table(
        tables,
        ['Backing store', 'Contents (one word per page)'],
        [
          ['File backing', q.file.join(' / ')],
          [
            'Page cache (file page → frame)',
            Object.keys(q.pageCache)
              .map(function (pg) {
                return pg + ' → ' + q.pageCache[pg];
              })
              .join(', ') || 'empty'
          ],
          [
            'Swap (slot → value)',
            Object.keys(q.swap)
              .map(function (id) {
                return id + ' → ' + q.swap[id].value;
              })
              .join(', ') || 'empty'
          ],
          [
            'Last access',
            q.last
              ? q.last.pid +
                ' · page ' +
                q.last.page +
                ' · ' +
                (q.last.error || q.last.kind + ' value ' + q.last.value)
              : 'No completed access at this event'
          ],
          [
            'Forbidden accesses',
            q.stats.protectionFaults + ' (each would be a SIGSEGV; the lab keeps the process running)'
          ]
        ]
      );
    }
    reset();
    U.text('h3', sec, 'What just happened');
    U.text(
      'p',
      sec,
      'A write to a MAP_PRIVATE mapping makes a private copy; the file never changes. With MAP_SHARED, both processes use the same page-cache frame, so each sees the other’s writes. After fork, both processes share private pages read-only; the first write either copies the page or, if only one process still uses it, just makes it writable again.'
    );
    U.text(
      'p',
      sec,
      'A major fault reads from storage; a minor fault doesn’t. Neither one is a cache miss or a TLB miss. Reclaim can drop a clean file page, but a dirty anonymous page needs somewhere to go: swap, or it stays. Real Linux adds readahead, fault-around and the swap cache on top of this.'
    );
    U.sources(sec, [
      ['Linux memory-management concepts', 'https://docs.kernel.org/admin-guide/mm/concepts.html']
    ]);
    measurement(sec);
  }
  function pages(root) {
    var sec = section(
      root,
      'pages',
      'Bigger pages: when they help',
      'One huge-page TLB entry covers 512 small pages, but only if your accesses actually share it.'
    );
    U.model(
      sec,
      'One LRU TLB with the same number of entries for both page sizes, so only the reach changes. The huge page is a 2 MiB x86-64 page. (Linux can also build large pages between 4 KiB and 2 MiB.)'
    );
    U.checkpoint(
      sec,
      'A program touches one word in each of 256 far-apart 2 MiB regions. Do huge pages cut its TLB misses?',
      ['No: there are still 256 distinct translations', 'Yes: larger pages always reduce misses'],
      0,
      'Every access lands in a different huge page, so it still needs 256 translations, and now each one maps 2 MiB.'
    );
    var o = { pages: 256, passes: 2, entries: 64, pattern: 'dense' },
      outcome = 'success',
      ctl = h('div', { class: 'perf-controls' }, sec);
    [
      ['pages', '4 KiB regions touched', [64, 256, 512, 1024]],
      ['entries', 'TLB entries', [16, 64, 128]],
      [
        'pattern',
        'Page access pattern',
        [
          ['dense', 'One word every 4 KiB'],
          ['sparse', 'One word every 2 MiB']
        ]
      ]
    ].forEach(function (a) {
      U.select(ctl, a[1], a[2], o[a[0]], function (v) {
        o[a[0]] = a[0] === 'pattern' ? v : +v;
        draw();
      });
    });
    U.select(
      ctl,
      'Huge mapping outcome',
      [
        ['success', 'THP: got a 2 MiB page'],
        ['fallback', 'THP: fell back to 4 KiB pages'],
        ['explicit', 'HugeTLB: pages reserved'],
        ['unavailable', 'HugeTLB: none available']
      ],
      outcome,
      function (v) {
        outcome = v;
        draw();
      }
    );
    var results = h('div', null, sec),
      sv = figure(sec, 'TLB miss counts for base and selected huge-page outcome', 900, 160);
    function draw() {
      var base = M.tlb(Object.assign({}, o, { pageBytes: 4096 })),
        big =
          outcome === 'unavailable'
            ? null
            : M.tlb(Object.assign({}, o, { pageBytes: outcome === 'fallback' ? 4096 : 2097152 }));
      sec._pageResult = { base: base, selected: big };
      results.replaceChildren();
      sv.replaceChildren();
      U.table(
        results,
        [
          'Mapping outcome',
          'Page bytes',
          'Reach',
          'Distinct translations',
          'Hits / misses',
          'Mapped footprint'
        ],
        [
          [
            'Base pages',
            4096,
            base.reach + ' B',
            base.uniqueMappings,
            base.hits + ' / ' + base.misses,
            base.mappedBytes + ' B'
          ],
          big
            ? [
                outcome,
                big.p.pageBytes,
                big.reach + ' B',
                big.uniqueMappings,
                big.hits + ' / ' + big.misses,
                big.mappedBytes + ' B'
              ]
            : [
                'No huge pages available',
                '—',
                '—',
                '—',
                'mmap fails; nothing runs',
                '—'
              ]
        ]
      );
      [base, big].forEach(function (q, i) {
        s(
          'text',
          { x: 10, y: 35 + i * 65, class: 's' },
          sv,
          i ? 'Selected outcome' : '4 KiB baseline'
        );
        if (q) {
          s(
            'rect',
            {
              x: 195,
              y: 14 + i * 65,
              width: (630 * q.misses) / base.trace.length,
              height: 32,
              rx: 4,
              class: i ? 'a2b' : 'actb'
            },
            sv
          );
          s(
            'text',
            { x: 200, y: 35 + i * 65, class: 's' },
            sv,
            q.misses + ' misses / ' + q.trace.length + ' accesses'
          );
        }
      });
      U.text(
        'p',
        results,
        'Two passes, one word per 4 KiB region. “Mapped footprint” is the memory the mappings cover. With sparse accesses, huge pages can multiply the memory used and zeroed without saving a single miss.'
      );
    }
    draw();
    U.text(
      'p',
      sec,
      'Asking for huge pages (THP or MADV_HUGEPAGE) does not guarantee you get them: fragmentation and kernel settings decide. HugeTLB pages come from a reserved pool and simply fail when it is empty. And fewer TLB misses don’t always mean a faster program, because bigger faults and more zeroing cost time too. To see what you actually got, check AnonHugePages in /proc/PID/smaps while the program runs.'
    );
    U.sources(sec, [
      ['Linux transparent huge pages', 'https://docs.kernel.org/admin-guide/mm/transhuge.html'],
      ['Linux HugeTLB pages', 'https://docs.kernel.org/admin-guide/mm/hugetlbpage.html']
    ]);
  }
  function walks(root) {
    var sec = section(
      root,
      'walk-contention',
      'Page walks are memory traffic',
      'Each page walk is a chain of memory reads, and those reads compete with ordinary data for the same memory slots.'
    );
    U.model(
      sec,
      'Eight translations, each a chain of page-table reads followed by its data read. Everything, background data included, shares a few memory slots, one new request per clock, taken in turn. Latency, walkers and slots are made-up values; every request moves one 64-byte line.'
    );
    U.checkpoint(
      sec,
      'Can extra ordinary data traffic slow down page walks, even with the same number of TLB misses?',
      [
        'Yes: both use finite memory resources',
        'No: translation has a separate unlimited memory path'
      ],
      0,
      'Walk reads wait for memory slots like everything else. Add background requests and watch the walks stretch.'
    );
    var o = { walks: 8, walkers: 2, levels: 4, cached: 2, slots: 4, latency: 20, demand: 16 },
      ctl = h('div', { class: 'perf-controls' }, sec);
    [
      ['walkers', 'Page walkers', [1, 2, 4, 8]],
      [
        'levels',
        'Page-table levels',
        [
          [3, '3 (2 MiB page)'],
          [4, '4 (4 KiB page, x86-64)'],
          [5, '5 (x86-64 five-level paging)']
        ]
      ],
      ['cached', 'Cached upper levels', [0, 1, 2]],
      ['slots', 'Memory slots', [1, 2, 4, 8]],
      ['latency', 'Memory latency (clocks)', [10, 20, 40]],
      ['demand', 'Background data requests', [0, 16, 64]]
    ].forEach(function (a) {
      U.select(ctl, a[1], a[2], o[a[0]], function (v) {
        o[a[0]] = +v;
        run();
      });
    });
    var metrics = h('div', { class: 'perf-metrics' }, sec),
      view = h('div', { class: 'cache-state' }, sec),
      svg = figure(view, 'Serial PTE reads and final data reads for eight translations', 900, 300),
      caption = U.text('p', view, ''),
      log = h('details', null, sec),
      r;
    U.text('summary', log, 'Show each walk');
    var rows = h('div', null, log);
    var step = App.CacheUI.replayControls(sec, 'Walk model clock', function (i) {
      if (!r) return;
      var t = r.trace[i];
      caption.textContent =
        'Clock ' +
        i +
        ' · memory slots ' +
        t.slots +
        '/' +
        r.p.slots +
        ' · active walks ' +
        t.walkers +
        '/' +
        r.p.walkers +
        ' · translated ' +
        t.translated +
        ' · final data complete ' +
        t.finished;
      svg.replaceChildren();
      var scale = 740 / r.cycles;
      for (var w = 0; w < 8; w++) s('text', { x: 8, y: 24 + w * 31, class: 's' }, svg, 'walk ' + w);
      r.requests
        .filter(function (q) {
          return q.walk !== undefined;
        })
        .forEach(function (q) {
          var y = 8 + q.walk * 31,
            rect = s(
              'rect',
              {
                x: 100 + q.issue * scale,
                y: y,
                width: Math.max(1, r.p.latency * scale),
                height: 20,
                rx: 2,
                class: q.kind === 'pte' ? 'a2b' : 'a3b'
              },
              svg
            );
          s(
            'title',
            null,
            rect,
            q.kind +
              (q.kind === 'pte' ? ' level ' + (q.level + 1) : '') +
              ' · ' +
              q.issue +
              ' → ' +
              q.done
          );
        });
      s(
        'path',
        { d: 'M ' + (100 + i * scale) + ' 0 V 263', class: 'wire', stroke: 'var(--act)' },
        svg
      );
      s(
        'text',
        { x: 100, y: 286, class: 's' },
        svg,
        'Green: page-table read · violet: data read · background requests count toward the slots'
      );
    }, view);
    function run() {
      r = M.walks(o);
      sec._walkResult = r;
      metrics.replaceChildren();
      rows.replaceChildren();
      U.metric(
        metrics,
        'Finished after',
        r.cycles + ' clocks',
        'Walks, data and background requests'
      );
      U.metric(
        metrics,
        'PTE reads / line bytes',
        r.pteReads + ' / ' + r.pteReads * 64 + ' B',
        'Each read uses 8 bytes but moves a 64-byte line'
      );
      U.metric(
        metrics,
        'Total bytes moved',
        r.lineBytes + ' B',
        'Walks + data + background'
      );
      U.metric(
        metrics,
        'Blocked',
        r.blocked + ' clocks',
        'A ready request found every slot busy'
      );
      U.table(
        rows,
        ['Walk', 'Walker acquired', 'Translation ready', 'Final data complete'],
        r.tasks.map(function (w) {
          return [w.id, w.start, w.translated, w.done];
        })
      );
      step.set(r.trace.length);
    }
    run();
    U.text(
      'p',
      sec,
      'Each level waits for the one before it, but separate walks overlap. A walker is free as soon as its translation is done, before the data arrives. Real CPUs keep upper levels in page-walk caches, and Linux describes five software levels that fold down to the four the hardware actually walks.'
    );
    U.sources(sec, [['Linux page tables', 'https://docs.kernel.org/mm/page_tables.html']]);
  }
  function shootdowns(root) {
    var sec = section(
      root,
      'shootdown',
      'Changing a page table is a multi-core job',
      'Other cores may still hold the old translation in their TLBs. The change is safe only once every one of them confirms it is gone.'
    );
    U.model(
      sec,
      'The kernel interrupts every CPU that may hold the old translation (an IPI); each one invalidates it, and the origin waits for every reply. Batching rules and timings are made up. The 64-CPU option shows how this scales on a large server.'
    );
    U.checkpoint(
      sec,
      'One remote CPU answers its interrupt late. When can the origin continue?',
      ['After the slowest CPU replies', 'At the average reply time'],
      0,
      'It waits for the slowest reply. The total invalidation work across all CPUs is a different number.'
    );
    var o = { cpus: 8, touchers: 8, pages: 16, batch: true, late: 0 },
      mask = 'all',
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(ctl, 'CPUs', [1, 4, 8, 16, 64], 8, function (v) {
      o.cpus = +v;
      run();
    });
    U.select(
      ctl,
      'Address-space CPU mask',
      [
        ['all', 'All CPUs'],
        ['half', 'Half the CPUs'],
        ['one', 'Only the origin']
      ],
      mask,
      function (v) {
        mask = v;
        run();
      }
    );
    U.select(ctl, 'Pages changed', [1, 16, 256], 16, function (v) {
      o.pages = +v;
      run();
    });
    U.select(
      ctl,
      'Invalidation batching',
      [
        [1, 'One batched operation'],
        [0, 'One operation per page']
      ],
      1,
      function (v) {
        o.batch = !!+v;
        run();
      }
    );
    U.select(ctl, 'Last remote handler delay', [0, 64, 256], 0, function (v) {
      o.late = +v;
      run();
    });
    var metrics = h('div', { class: 'perf-metrics' }, sec),
      svg = figure(sec, 'First shootdown round and its last required acknowledgement', 900, 300),
      explain = U.text('p', sec, ''),
      details = h('details', null, sec);
    U.text('summary', details, 'Show every CPU and round');
    var table = h('div', null, details);
    function run() {
      o.touchers =
        mask === 'one' ? 1 : mask === 'half' ? Math.max(1, Math.ceil(o.cpus / 2)) : o.cpus;
      var r = M.shootdown(o);
      sec._shootdownResult = r;
      metrics.replaceChildren();
      svg.replaceChildren();
      table.replaceChildren();
      U.metric(
        metrics,
        'Origin blocked',
        r.cycles + ' clocks',
        r.rounds + ' sequential invalidation round(s)'
      );
      U.metric(metrics, 'Remote IPIs', String(r.ipis), o.touchers + ' participating CPU(s)');
      U.metric(
        metrics,
        'Sum of invalidation work',
        r.totalWork + ' CPU-clocks',
        'Invalidation work only'
      );
      U.metric(
        metrics,
        'Invalidation',
        r.full ? 'Whole TLB' : 'Per page',
        r.full ? 'Drops every entry; refills not counted' : '2 clocks per page'
      );
      var events = r.events.filter(function (e) {
          return e.round === 0;
        }),
        end = Math.max.apply(
          null,
          events.map(function (e) {
            return e.end;
          })
        ),
        shown = Math.min(o.touchers, 8);
      svg.setAttribute('viewBox', '0 0 900 ' + (shown * 32 + 54));
      for (var cpu = 0; cpu < shown; cpu++)
        s('text', { x: 5, y: 25 + cpu * 32, class: 's' }, svg, 'CPU ' + cpu);
      events
        .filter(function (e) {
          return e.cpu < shown && e.end > e.start;
        })
        .forEach(function (e) {
          var rect = s(
            'rect',
            {
              x: 85 + (e.start / end) * 780,
              y: 10 + e.cpu * 32,
              width: Math.max(1, ((e.end - e.start) / end) * 780),
              height: 20,
              rx: 2,
              class:
                e.kind.indexOf('invalidate') >= 0
                  ? 'a2b'
                  : e.kind === 'acknowledgement'
                    ? 'a3b'
                    : 'sunk'
            },
            svg
          );
          s('title', null, rect, e.kind + ' · ' + e.start + ' → ' + e.end);
        });
      s(
        'text',
        { x: 85, y: shown * 32 + 38, class: 's' },
        svg,
        'First round, 0–' + end + ' clocks · green: invalidate · violet: reply'
      );
      explain.textContent =
        (o.touchers > 8
          ? 'Showing the first 8 CPUs; the table below has all of them. '
          : '') +
        'The slowest reply sets the finish time. Batching saves messages. Flushing the whole TLB is quicker now but costs refills later, which this timer doesn’t count.';
      U.table(
        table,
        ['Round / CPU', 'Operation', 'Start → end'],
        r.events.map(function (e) {
          return [e.round + ' / ' + e.cpu, e.kind, e.start + ' → ' + e.end];
        })
      );
    }
    run();
    U.text(
      'p',
      sec,
      'Linux interrupts only the CPUs that have run this process. Tagged TLB entries (PCID on x86, ASID on Arm) let it postpone some flushes, and Arm can also broadcast invalidations in hardware without interrupts. Either way, memory is reused only after every CPU has confirmed.'
    );
    U.sources(sec, [
      ['Linux cache and TLB flushing', 'https://docs.kernel.org/core-api/cachetlb.html'],
      [
        'arm64 broadcast TLB invalidation (LKML)',
        'https://lkml.iu.edu/hypermail/linux/kernel/1907.1/01679.html'
      ]
    ]);
  }
  function numa(root) {
    var sec = section(
      root,
      'numa',
      'Remote memory: where pages live',
      'On a two-node server, a page stays where it was first touched, even if the thread that uses it moves.'
    );
    U.model(
      sec,
      'Two memory nodes. Pages are placed by first touch or interleaving and never move. Remote replies share one link. No caches, no writes, no automatic page migration.'
    );
    U.checkpoint(
      sec,
      'Pages were first touched on node 0. The thread then moves to node 1. Where is the data?',
      ['Still on node 0, so accesses become remote', 'Automatically local to the migrated thread'],
      0,
      'Moving a thread doesn’t move its memory. (Linux’s automatic NUMA balancing may migrate pages later.)'
    );
    var o = { cpuNode: 0, placement: 'node0', spacing: 2, linkBytes: 8 },
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(ctl, 'Executing CPU node', [0, 1], 0, function (v) {
      o.cpuNode = +v;
      run();
    });
    U.select(
      ctl,
      'Page placement',
      [
        ['node0', 'First touch on node 0'],
        ['node1', 'First touch on node 1'],
        ['interleave', 'Interleave pages over both nodes']
      ],
      o.placement,
      function (v) {
        o.placement = v;
        run();
      }
    );
    U.select(ctl, 'Clocks between requests', [0, 2, 8, 32], 2, function (v) {
      o.spacing = +v;
      run();
    });
    U.select(ctl, 'Remote link (bytes/clock)', [4, 8, 16, 32], 8, function (v) {
      o.linkBytes = +v;
      run();
    });
    var metrics = h('div', { class: 'perf-metrics' }, sec),
      svg = figure(sec, 'Two memory nodes and a contended remote response link', 900, 200),
      result = h('div', null, sec);
    function run() {
      var r = M.numa(o);
      sec._numaResult = r;
      metrics.replaceChildren();
      svg.replaceChildren();
      result.replaceChildren();
      U.metric(
        metrics,
        'Local / remote requests',
        r.local + ' / ' + r.remote,
        '128 reads of 64 bytes'
      );
      U.metric(
        metrics,
        'Average latency',
        r.mean.toFixed(1) + ' clocks',
        'Queueing included'
      );
      U.metric(metrics, 'Remote link traffic', r.linkBytes + ' B', 'Response data only');
      U.metric(
        metrics,
        'Finished after',
        r.cycles + ' clocks',
        (r.lineBytes / r.cycles).toFixed(2) + ' bytes/clock overall'
      );
      box(svg, 10, 22, 270, 'Issuer on node ' + o.cpuNode, 'Pages: ' + o.placement, true);
      box(
        svg,
        590,
        12,
        295,
        'Node 0 memory',
        r.requests.filter(function (q) {
          return q.node === 0;
        }).length + ' requests',
        false
      );
      box(
        svg,
        590,
        100,
        295,
        'Node 1 memory',
        r.requests.filter(function (q) {
          return q.node === 1;
        }).length + ' requests',
        false
      );
      s('path', { d: 'M 280 50 H 550 V 39 H 590 M 550 50 V 127 H 590', class: 'wire' }, svg);
      s(
        'text',
        { x: 290, y: 172, class: 's' },
        svg,
        'Remote link: ' + o.linkBytes + ' bytes/clock'
      );
      U.table(
        result,
        ['Setting', 'Value'],
        [
          [
            'Pages on node 0 / node 1',
            r.requests.filter(function (q) {
              return q.id < 64 && q.node === 0;
            }).length +
              ' / ' +
              r.requests.filter(function (q) {
                return q.id < 64 && q.node === 1;
              }).length
          ],
          [
            'Each memory pool',
            '8 service slots; 40-clock latency; one 64-byte return every 2 clocks'
          ],
          ['Travel time', 'Remote: +10 clocks out, +20 back, one at a time. Local: +2'],
          [
            'Work',
            'Two passes over 64 pages, one line per page, no cache hits'
          ]
        ]
      );
    }
    run();
    U.text(
      'p',
      sec,
      'On Linux, numactl --hardware lists the nodes and /proc/PID/numa_maps shows where a process’s pages are. Interleaving can raise total bandwidth while giving up locality. A laptop with one node can’t show this effect at all.'
    );
    U.sources(sec, [
      ['Linux NUMA memory policy', 'https://docs.kernel.org/admin-guide/mm/numa_memory_policy.html']
    ]);
  }
  function measurement(sec) {
    var n = U.native(sec, {
        title: 'Page faults on your machine',
        what: 'Counts minor and major faults around the first read, the first write, a repeated write and a child’s copy-on-write write, and records the mapping as the kernel reports it. A request for huge pages is recorded separately from the huge pages actually used.',
        command: 'python3 benchmarks/vm.py --output vm-results.json',
        label: 'Import VM observation JSON',
        aria: 'VM observation JSON',
        empty: 'No native VM observations loaded.',
        statusClass: 'vm-measurement-status',
        outClass: 'vm-results'
      }),
      input = n.input,
      status = n.status,
      out = n.out;
    function render(data, label) {
      validate(data);
      if (label) U.text('h3', out, label, { class: 'measurement-run-title' });
      status.textContent =
        'Measured · ' +
        String(data.context.cpu_model || 'unknown CPU') +
        ' · ' +
        (data.complete === true ? 'complete run' : 'partial run');
      U.table(
        out,
        ['Mapping / advice / repeat', 'Stage', 'Elapsed ns', 'Minor / major faults', 'Checksum'],
        data.samples.flatMap(function (r) {
          return r.stages.map(function (t) {
            return [
              r.kind + ' / ' + r.advice + ' / ' + r.repeat,
              t.name,
              t.elapsed_ns,
              t.minor + ' / ' + t.major,
              t.checksum
            ];
          });
        })
      );
      var details = h('details', null, out);
      U.text('summary', details, 'Show the mappings and recorded context');
      U.code(
        details,
        JSON.stringify(
          {
            context: data.context,
            mappings: data.samples.map(function (r) {
              return {
                kind: r.kind,
                advice: r.advice,
                advice_errno: r.advice_errno,
                smaps: r.smaps,
                verification: r.verification
              };
            })
          },
          null,
          2
        )
      );
      U.text(
        'p',
        out,
        'Fault counts cover the whole process, so a few may be unrelated. Huge pages and kernel shortcuts change how many faults a page costs.'
      );
    }
    U.importInto(input, out, status, render);
    App.Measurements.bind('vm', status, out, render);
  }
  function validate(data) {
    if (
      !data ||
      data.schema !== 'memory-lab-vm-v1' ||
      !data.context ||
      typeof data.context !== 'object' ||
      Array.isArray(data.context) ||
      !Array.isArray(data.samples) ||
      !data.samples.length ||
      data.samples.length > 500
    )
      throw new Error('Expected memory-lab-vm-v1 with context and 1–500 samples.');
    data.samples.forEach(function (r) {
      if (
        !r ||
        ['anon', 'file-private', 'file-shared'].indexOf(r.kind) < 0 ||
        ['base', 'huge'].indexOf(r.advice) < 0 ||
        !Number.isSafeInteger(r.bytes) ||
        r.bytes < 4096 ||
        r.bytes > 134217728 ||
        !Number.isSafeInteger(r.cpu) ||
        r.cpu < 0 ||
        !Number.isSafeInteger(r.page_bytes) ||
        r.page_bytes < 4096 ||
        r.bytes % r.page_bytes ||
        !Number.isSafeInteger(r.repeat) ||
        r.repeat < 0 ||
        !Array.isArray(r.stages) ||
        r.stages.length !== 5
      )
        throw new Error('Invalid mapping observation.');
      var names = ['first-read', 'first-write', 'repeat-write', 'child-write', 'parent-check'];
      r.stages.forEach(function (t, i) {
        if (!t || t.name !== names[i]) throw new Error('Invalid observation stage.');
        ['elapsed_ns', 'minor', 'major', 'checksum'].forEach(function (k) {
          if (!Number.isSafeInteger(t[k]) || t[k] < 0 || (k === 'elapsed_ns' && t[k] === 0))
            throw new Error('Invalid stage ' + k);
        });
      });
      var n = r.bytes / r.page_bytes,
        shared = r.kind === 'file-shared',
        expected = [r.kind === 'anon' ? 0 : 10, 7, 7, 42, shared ? 42 : 7];
      r.stages.forEach(function (t, i) {
        if (t.checksum !== n * expected[i] || t.cpu_before !== r.cpu || t.cpu_after !== r.cpu)
          throw new Error('Content or affinity accounting mismatch.');
      });
      if (!r.verification || r.verification.passed !== true)
        throw new Error('Native content verification did not pass.');
    });
    return data;
  }
  App.extendChapter('xlate', function (root) {
    lifecycle(root);
    pages(root);
    walks(root);
    shootdowns(root);
  });
  App.extendChapter('hier', numa);
  App.VMUI = { validate: validate };
})();
