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
    'Linux mapping metadata describes an address range, permissions and backing policy. A valid VMA does not imply that every address already has a present page-table entry or private physical memory.'
  );
  App.gloss(
    'cow',
    'copy-on-write (COW)',
    'Share protected contents until a permitted write requires private writable data. A write-protection fault can trigger a copy, but an exclusively owned anonymous page may be reused. A forbidden write is not automatically COW.'
  );
  App.gloss(
    'minor_fault',
    'minor page fault',
    'A kernel-resolved page fault that does not require loading the page from storage. This is not a TLB miss: a hardware walk can resolve a TLB miss without a page fault.'
  );
  App.gloss(
    'thp',
    'transparent huge pages (THP)',
    'Linux can use larger mappings for eligible memory under its current policy. Advice is a request, not evidence of the actual mapping size. Modern multi-size THP and PMD-size THP have different translation properties.'
  );
  function lifecycle(root) {
    var sec = section(
      root,
      'os',
      'A mapping is not a resident page',
      'Follow bytes and permissions through mmap, first touch, fork and reclaim.'
    );
    App.CacheUI.teaching(
      sec,
      'This is a reduced Linux-style lifecycle with four 4 KiB pages and two processes. Each frame displays one representative word; zero/copy/writeback accounting covers the full page. There is one conceptual TLB per process, no fault-time model, and no page-table allocation accounting. Invalidation completion is assumed in this scene; the shootdown lab below makes that wait explicit.'
    );
    U.checkpoint(
      sec,
      'A private anonymous mmap succeeds. Does it already require four private data frames?',
      [
        'No: mapping policy can exist before first touch',
        'Yes: mmap must populate every data page'
      ],
      0,
      'Read a new anonymous page, then write it. This chosen path first uses a shared read-only zero page, then allocates private memory.'
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
        [0, 'Empty in this model'],
        [1, 'Already warm']
      ],
      0,
      function (v) {
        o.warm = !!+v;
        reset();
      }
    );
    U.select(
      ctl,
      'Model swap availability',
      [
        [1, 'Available'],
        [0, 'Disabled']
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
    });
    function reset() {
      state = M.create(o);
      history = [
        { label: 'No mappings yet. Create a VMA with mmap, or run a story.', state: state }
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
        (cursor < history.length - 1 ? ' · History preview: move to the last event to act.' : '');
      buttons.forEach(function (b) {
        b.disabled = cursor < history.length - 1;
      });
      metrics.replaceChildren();
      svg.replaceChildren();
      tables.replaceChildren();
      U.metric(
        metrics,
        'Minor / storage-backed faults',
        q.stats.minor + ' / ' + q.stats.major,
        'Model outcomes, not predicted Linux counter totals'
      );
      U.metric(
        metrics,
        'Allocated / copied / zeroed',
        q.stats.allocations + ' frames / ' + q.stats.copyBytes + ' B / ' + q.stats.zeroBytes + ' B',
        'Initial warm page-cache frames excluded'
      );
      U.metric(
        metrics,
        'Writeback / swap out / swap in',
        q.stats.writebackBytes + ' / ' + q.stats.swapOutBytes + ' / ' + q.stats.swapInBytes + ' B',
        'File and anonymous backing are separate'
      );
      U.metric(
        metrics,
        'Walks / TLB hits',
        q.stats.walks + ' / ' + q.stats.tlbHits,
        'A walk does not necessarily cause a fault'
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
        ['Backing state', 'Representative contents'],
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
            q.stats.protectionFaults +
              ' (SIGSEGV outcome shown; this teaching UI keeps the process available)'
          ]
        ]
      );
    }
    reset();
    U.text('h3', sec, 'Explain the changed ownership');
    U.text(
      'p',
      sec,
      'MAP_PRIVATE writes make private anonymous data; they do not update file backing. MAP_SHARED processes can refer to the same page-cache frame. CPU visibility of those stores and durable storage are different boundaries. This model writes dirty file data back before evicting it; it does not model filesystem journaling, device caches, msync/fsync guarantees or crash persistence. Fork initially shares private data with write protection. A permitted later store either copies the page or reuses an exclusively owned anonymous frame.'
    );
    U.text(
      'p',
      sec,
      'Cold file and nonresident swap faults require modeled storage reads here. Real Linux fault counts depend on readahead, fault-around, swap cache, huge mappings and competing activity. A major fault is not a DRAM cache miss; a minor fault is not a TLB miss. Reclaim cannot simply discard dirty anonymous contents: this scenario needs swap or retains the page. Real memory pressure also involves reclaim policy, writeback, compaction and possible OOM handling.'
    );
    source(
      sec,
      'Linux memory-management concepts',
      'https://docs.kernel.org/admin-guide/mm/concepts.html'
    );
    measurement(sec);
  }
  function pages(root) {
    var sec = section(
      root,
      'pages',
      'Page size: reach, fault work and fallback',
      'Compare the same sparse or dense accesses under explicitly chosen mapping outcomes.'
    );
    App.CacheUI.teaching(
      sec,
      'The LRU TLB below has the same selected entry count for both page sizes to isolate reach. Actual CPU structures, capacities, associativity and page-size support must be checked separately; this is not their replacement model. The 2 MiB case represents a PMD-size huge leaf on the four-level x86-64 example. Linux multi-size THP can also use smaller PTE-mapped large pages; “THP” does not universally mean a 2 MiB leaf.'
    );
    U.checkpoint(
      sec,
      'One word is used in each of 256 widely separated 2 MiB regions. Does mapping each as a huge page necessarily improve this TLB trace?',
      ['No: there are still 256 distinct translations', 'Yes: larger pages always reduce misses'],
      0,
      'Each sparse access falls in a different huge mapping. Compare distinct translations and mapped footprint, not page size alone.'
    );
    var o = { pages: 256, passes: 2, entries: 64, pattern: 'dense' },
      outcome = 'success',
      ctl = h('div', { class: 'perf-controls' }, sec);
    [
      ['pages', '4 KiB regions touched', [64, 256, 512, 1024]],
      ['entries', 'TLB entries in each model', [16, 64, 128]],
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
        ['success', 'THP: eligible 2 MiB mapping succeeds'],
        ['fallback', 'THP: falls back to base pages'],
        ['explicit', 'HugeTLB: pool / reservation available'],
        ['unavailable', 'HugeTLB: allocation unavailable']
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
                'Explicit huge pages unavailable',
                '—',
                '—',
                '—',
                'No mapping, no access trace',
                'Do not silently report base-page success'
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
        'Two complete passes; one word per selected 4 KiB region. “Mapped footprint” is the sum of whole selected mappings, not measured RSS or useful bytes. Sparse huge mappings can increase memory commitment, allocation/zeroing and reclaim work without reducing misses in this trace. The model assumes each huge mapping is fully backed; actual residency and promotion timing require observation.'
      );
    }
    draw();
    U.text(
      'p',
      sec,
      'THP policy and MADV_HUGEPAGE permit an optimization; they do not prove that it happened. Eligibility, fragmentation, compaction and kernel configuration affect promotion and fallback. Explicit HugeTLB uses a separately managed pool/reservation mechanism and can fail when the requested allocation is unavailable. Avoid treating a lower TLB miss count as a guaranteed application speedup: larger faults, memory pressure and copy/zero costs can move the bottleneck.'
    );
    U.text(
      'p',
      sec,
      'Observe /proc/PID/smaps (including AnonHugePages and mapping flags), actual kernel policy and the relevant per-size statistics while the process is alive. A base KernelPageSize field alone is not a complete THP diagnosis. Compare pinned, repeated native runs with the same useful footprint and recorded page state. Do not infer a 2 MiB hardware leaf solely from a successful madvise call.'
    );
    source(
      sec,
      'Linux THP and multi-size THP',
      'https://docs.kernel.org/admin-guide/mm/transhuge.html'
    );
    U.text('span', sec, ' · ');
    source(
      sec,
      'Linux explicit HugeTLB pages',
      'https://docs.kernel.org/admin-guide/mm/hugetlbpage.html'
    );
  }
  function walks(root) {
    var sec = section(
      root,
      'walk-contention',
      'Page walks are memory traffic',
      'A translation chain competes with the data it enables.'
    );
    App.CacheUI.teaching(
      sec,
      'Eight translations have serial dependent page-table reads, followed by final data reads. Selected upper levels are treated as already cached. All remaining requests, including background data, share a finite service pool with one admission per model clock and round-robin class arbitration. Request latency, walker count, cache hits and slots are chosen parameters, not measured hardware values. Each modeled request transfers one 64-byte line; actual PTE cache-line sharing and lower cache hits can reduce traffic.'
    );
    U.checkpoint(
      sec,
      'Can adding independent ordinary data requests slow a page walk even when the number of TLB misses stays fixed?',
      [
        'Yes: both use finite memory resources',
        'No: translation has a separate unlimited memory path'
      ],
      0,
      'Watch the admitted PTE reads, the serial levels and the shared service occupancy.'
    );
    var o = { walks: 8, walkers: 2, levels: 4, cached: 2, slots: 4, latency: 20, demand: 16 },
      ctl = h('div', { class: 'perf-controls' }, sec);
    [
      ['walkers', 'Concurrent model walkers', [1, 2, 4, 8]],
      [
        'levels',
        'Hardware walk levels',
        [
          [3, '3: 2 MiB leaf in the example'],
          [4, '4: 4 KiB leaf in the x86-64 example'],
          [5, '5: x86-64 with LA57; separately scoped']
        ]
      ],
      ['cached', 'Cached upper levels', [0, 1, 2]],
      ['slots', 'Shared memory service slots', [1, 2, 4, 8]],
      ['latency', 'Chosen request latency', [10, 20, 40]],
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
    U.text('summary', log, 'Request dependencies and traffic');
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
        'Green: PTE line · violet: final data line · background requests shown in shared occupancy'
      );
    });
    function run() {
      r = M.walks(o);
      sec._walkResult = r;
      metrics.replaceChildren();
      rows.replaceChildren();
      U.metric(
        metrics,
        'Drain time',
        r.cycles + ' model clocks',
        'Includes PTE, target data and background requests'
      );
      U.metric(
        metrics,
        'PTE reads / line bytes',
        r.pteReads + ' / ' + r.pteReads * 64 + ' B',
        'Eight bytes interpreted per entry, whole modeled lines transferred'
      );
      U.metric(
        metrics,
        'All transferred lines',
        r.lineBytes + ' B',
        'PTE + final data + background'
      );
      U.metric(
        metrics,
        'Admission blocked',
        r.blocked + ' clocks',
        'A ready request finds all service slots occupied'
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
      'Each level can start only after the preceding uncached entry returns. Other walks can overlap; a walker is released when translation finishes, before the target data returns. Page-walk caches, ordinary caches, merging and hardware prioritization alter real traffic. Linux may describe a five-level software hierarchy with folded levels even on four-level hardware: do not count software abstractions as extra hardware reads. Measure walk activity with events supported on the actual CPU, and distinguish walk completions, cycles spent walking and ordinary cache misses.'
    );
    source(
      sec,
      'Linux page-table hierarchy and folded levels',
      'https://docs.kernel.org/mm/page_tables.html'
    );
  }
  function shootdowns(root) {
    var sec = section(
      root,
      'shootdown',
      'Changing a PTE is a distributed operation',
      'Wait for stale translations to stop being usable before relying on the new mapping.'
    );
    App.CacheUI.teaching(
      sec,
      'This scenario sends IPIs to the selected CPUs that may hold translations, includes local invalidation, remote handler delay and acknowledgements, and lets the origin continue only after all required completions. CPU masks, batching, full-context thresholds and all clocks are chosen rules, not a reproduction of a particular Linux release or x86 invalidation instruction. A 64-CPU run is a server scaling extension, not an implied host topology.'
    );
    U.checkpoint(
      sec,
      'One remote CPU handles its IPI late. Can the origin finish after the average acknowledgement time?',
      ['No: it needs the last required completion', 'Yes: average latency bounds the operation'],
      0,
      'The wall time is a critical path; sum of CPU invalidation work is a different quantity.'
    );
    var o = { cpus: 8, touchers: 8, pages: 16, batch: true, late: 0 },
      mask = 'all',
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(ctl, 'Online model CPUs', [1, 4, 8, 16, 64], 8, function (v) {
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
    U.select(ctl, 'Pages whose PTEs change', [1, 16, 256], 16, function (v) {
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
    U.text('summary', details, 'Every CPU and round');
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
        r.cycles + ' model clocks',
        r.rounds + ' sequential invalidation round(s)'
      );
      U.metric(metrics, 'Remote IPIs', String(r.ipis), o.touchers + ' participating CPU(s)');
      U.metric(
        metrics,
        'Sum of invalidation work',
        r.totalWork + ' CPU-clocks',
        'Excludes send, handler wait and acknowledgements'
      );
      U.metric(
        metrics,
        'Chosen invalidation',
        r.full ? 'Full context' : 'Per-page',
        r.full ? 'Collateral refill cost omitted' : 'Two model clocks per page'
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
        'First round: 0 → ' + end + ' model clocks · green invalidate · violet acknowledgement'
      );
      explain.textContent =
        (o.touchers > 8
          ? 'First eight CPU lanes shown; the full table includes the delayed last CPU. '
          : '') +
        'All required acknowledgements, including unshown lanes, determine completion. Batching amortizes messages; a full-context choice also drops unrelated translations. Their later refills are outside this timer, so this comparison does not prove the best real threshold.';
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
      'Measure a controlled mapping/protection workload separately from first-touch faults and scheduler noise. Trace only available kernel TLB/IPI events and perf software counters; tracepoint names and permissions vary. An address-space CPU mask can avoid CPUs that never used the mapping, and ASIDs/PCIDs and deferred invalidation can change the implementation. Correctness still requires the appropriate architecture/kernel completion contract before reusing memory or relying on revoked access.'
    );
    source(
      sec,
      'Linux cache and TLB flushing contract',
      'https://docs.kernel.org/core-api/cachetlb.html'
    );
  }
  function numa(root) {
    var sec = section(
      root,
      'numa',
      'First touch, migration and remote memory',
      'A two-node server extension: moving execution does not automatically move its pages.'
    );
    App.CacheUI.teaching(
      sec,
      'This is an explicit two-node NUMA teaching model, separate from the recorded host topology. Pages are placed by a selected first-touch/interleave policy and stay there when the issuing CPU moves. Two independent memory service pools return 64-byte reads; remote responses serialize on one chosen link. Caches, coherence, outbound-request bandwidth, write traffic, automatic page migration and full controller timing are omitted. Model clocks are not measured socket latency.'
    );
    U.checkpoint(
      sec,
      'Pages were first touched on node 0. Execution moves to node 1 without page migration. Where is the data?',
      ['Still on node 0, so accesses become remote', 'Automatically local to the migrated thread'],
      0,
      'Compare changing the issuing CPU with changing the placement policy. Linux policy and automatic balancing can change real placement over time.'
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
    U.select(ctl, 'NUMA request spacing', [0, 2, 8, 32], 2, function (v) {
      o.spacing = +v;
      run();
    });
    U.select(ctl, 'Remote response link bytes/clock', [4, 8, 16, 32], 8, function (v) {
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
        '128 offered 64-byte reads, caches excluded'
      );
      U.metric(
        metrics,
        'Mean arrival→return',
        r.mean.toFixed(1) + ' model clocks',
        'Includes memory-slot and link waiting'
      );
      U.metric(metrics, 'Remote link traffic', r.linkBytes + ' B', 'Response data only');
      U.metric(
        metrics,
        'Drain time',
        r.cycles + ' model clocks',
        (r.lineBytes / r.cycles).toFixed(2) + ' total line B/clock'
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
        'Remote return link: ' + o.linkBytes + ' B/clock · selected fixed transport + serialization'
      );
      U.table(
        result,
        ['Placement fact / selected rule', 'Value'],
        [
          [
            'Pages resident on node 0 / node 1',
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
          ['Transport', 'Remote outbound +10 clocks; serialized return +20; local return +2'],
          [
            'Offered work',
            'Two passes over 64 pages; one line per page per pass, with cache hits deliberately excluded'
          ]
        ]
      );
    }
    run();
    U.text(
      'p',
      sec,
      'Measure placement before interpreting timing: lscpu and numactl --hardware describe topology; /proc/PID/numa_maps and numastat -p describe placement. Compare CPU binding, memory binding, first touch and interleave with the same useful work. Remote access can add latency and saturate a link; interleave may improve aggregate bandwidth while sacrificing locality. A single-node laptop cannot validate the two-node effect.'
    );
    source(
      sec,
      'Linux NUMA memory policy',
      'https://docs.kernel.org/admin-guide/mm/numa_memory_policy.html'
    );
  }
  function measurement(sec) {
    U.text('h3', sec, 'Observe page faults and actual mapping state');
    U.code(
      sec,
      'python3 benchmarks/run_all.py --serve\n# Individual fallback: python3 benchmarks/vm.py --output vm-results.json'
    );
    U.text(
      'p',
      sec,
      'The native probe records getrusage minor/major fault deltas around first read, first write, repeated write and a child COW write. It also records mapping information while alive. File fixtures are created immediately before mmap and are initially page-cache warm; this does not force a cold-storage fault. Anonymous huge-page advice is recorded separately from observed AnonHugePages. Run the full protocol for repeated samples; --quick only checks execution.'
    );
    var label = h('label', { class: 'perf-field' }, sec);
    U.text('span', label, 'Import VM observation JSON');
    var input = h(
        'input',
        { type: 'file', accept: '.json,application/json', 'aria-label': 'VM observation JSON' },
        label
      ),
      status = U.text('p', sec, 'No native VM observations loaded.', {
        role: 'status',
        class: 'vm-measurement-status'
      }),
      out = h('div', { class: 'vm-results' }, sec);
    function render(data, label) {
      validate(data);
      if (label) U.text('h3', out, label, { class: 'measurement-run-title' });
      status.textContent =
        'Measured data · ' +
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
      U.text('summary', details, 'Mapping evidence and original context');
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
        'These are whole-stage observations on the recorded host, not predicted hardware fault latency or a count of hardware page-table reads. Counter deltas may include unrelated process faults; huge mappings and kernel optimizations can change their relationship to touched base pages.'
      );
    }
    input.onchange = async function () {
      out.replaceChildren();
      try {
        var f = input.files[0];
        if (!f) return;
        if (f.size > 2 * 1024 * 1024) throw new Error('Maximum file size is 2 MiB.');
        render(JSON.parse(await f.text()), 'Manual import · locally read, not uploaded');
      } catch (e) {
        status.textContent = 'Could not import: ' + e.message;
      }
    };
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
