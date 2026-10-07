(function () {
  'use strict';
  var U = App.LabUI,
    h = App.h,
    s = App.s,
    M = CacheLab;
  App.gloss(
    'reuse_distance',
    'reuse / stack distance',
    'How many different lines were touched since this line was last used. A fully associative LRU cache of C lines hits whenever that number is below C. A first touch has no reuse distance.'
  );
  App.gloss(
    'compulsory',
    'compulsory miss',
    'A miss on the first use of a line. No cache size or layout avoids it; only prefetching can.'
  );
  App.gloss(
    'capacity_miss',
    'capacity miss',
    'A repeat miss that a fully associative cache of the same size would also take: the data simply does not fit.'
  );
  App.gloss(
    'hitm',
    'HITM / dirty peer evidence',
    'A load that finds the line modified in another core’s cache, so that core supplies it while memory still holds an old copy. perf c2c reports these on CPUs that support it.'
  );
  App.gloss(
    'transient_coh',
    'transient coherence state',
    'The state a line is in while a request is still in flight, between two stable states such as I and S. IS, IM, SM and OM are the textbook names.'
  );
  App.gloss(
    'atomic_rmw',
    'atomic read-modify-write',
    'Reads and updates one value as a single step no other core can split, such as fetch_add or compare-and-swap. A relaxed atomic is still indivisible; it just does not order other memory accesses.'
  );
  function section(root, id, title, copy) {
    return App.labSection(root, id, title, copy);
  }
  function teaching(root, copy) {
    U.model(root, copy);
  }
  /* Back / next / restart plus a slider. Pass `before` to place it right above the view it drives. */
  function replayControls(root, label, render, before) {
    var controls = h('div', { class: 'perf-actions lab-stepper' }, root),
      back = U.text('button', controls, '← back', { type: 'button' }),
      next = U.text('button', controls, 'next →', { type: 'button' }),
      reset = U.text('button', controls, 'restart', { type: 'button' }),
      lab = h('label', { class: 'perf-scrub' }, controls);
    U.text('span', lab, label);
    if (before && before.parentNode === root) root.insertBefore(controls, before);
    var range = h('input', { type: 'range', min: 0, max: 0, value: 0, 'aria-label': label }, lab),
      i = 0,
      length = 1;
    function draw() {
      range.value = i;
      back.disabled = i === 0;
      next.disabled = i === length - 1;
      render(i);
    }
    range.oninput = function () {
      i = +range.value;
      draw();
    };
    back.onclick = function () {
      i = Math.max(0, i - 1);
      draw();
    };
    next.onclick = function () {
      i = Math.min(length - 1, i + 1);
      draw();
    };
    reset.onclick = function () {
      i = 0;
      draw();
    };
    return {
      set: function (n) {
        length = n;
        range.max = n - 1;
        i = 0;
        draw();
      },
      go: function (n) {
        i = Math.min(length - 1, Math.max(0, n));
        draw();
      }
    };
  }
  function cache(root) {
    var sec = section(
      root,
      'taxonomy',
      'Why did that access miss?',
      'Run the same trace through caches of different shapes and sort every miss into one of three kinds.'
    );
    teaching(
      sec,
      'A small LRU cache, plus a fully associative LRU cache of the same size used only to classify misses. No prefetching, and no other cores invalidating lines.'
    );
    U.checkpoint(
      sec,
      'Three lines map to the same 2-way set, but the whole cache could hold them. After the first touches, why do the repeats still miss?',
      ['Compulsory', 'Capacity', 'Conflict'],
      2,
      'A fully associative cache of the same size keeps all three. Only the 2-way set pushes them out, so these are conflict misses.'
    );
    var o = { sets: 4, ways: 2, line: 64, op: 'read', drain: false },
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(ctl, 'Model cache sets', [1, 2, 4, 8, 16], 4, function (v) {
      o.sets = +v;
      draw();
    });
    U.select(ctl, 'Model cache ways', [1, 2, 4, 8], 2, function (v) {
      o.ways = +v;
      draw();
    });
    U.select(ctl, 'Model line bytes', [16, 32, 64, 128], 64, function (v) {
      o.line = +v;
      draw();
    });
    U.select(
      ctl,
      'Trace operation',
      [
        ['read', '8-byte reads'],
        ['write', '8-byte temporal stores']
      ],
      'read',
      function (v) {
        o.op = v;
        draw();
      }
    );
    U.select(
      ctl,
      'Dirty lines at end',
      [
        [0, 'Keep resident'],
        [1, 'Drain to lower level']
      ],
      0,
      function (v) {
        o.drain = !!+v;
        draw();
      }
    );
    var lab = h('label', { class: 'perf-field' }, sec);
    U.text('span', lab, 'Access trace: byte offsets, or A=0, B=64, C=128…');
    var input = h(
      'textarea',
      { rows: 2, 'aria-label': 'Cache access trace', class: 'cache-trace-input' },
      lab
    );
    input.value = 'A B C A D A B E A B C D E';
    var actions = h('div', { class: 'perf-actions' }, sec);
    [
      ['Apply trace', null],
      [
        'Same-set conflicts',
        function () {
          return Array(4)
            .fill([0, o.sets * o.line, 2 * o.sets * o.line].join(' '))
            .join(' ');
        }
      ],
      [
        'Capacity cycle',
        function () {
          return Array(3)
            .fill(
              Array.from({ length: o.sets * o.ways + 1 }, function (_, i) {
                return i * o.line;
              }).join(' ')
            )
            .join(' ');
        }
      ],
      [
        'Spatial reuse',
        function () {
          return '0 8 16 24 32 40 48 56 64 72 0 8';
        }
      ]
    ].forEach(function (v) {
      var b = U.text('button', actions, v[0], { type: 'button' });
      b.onclick = function () {
        if (v[1]) input.value = v[1]();
        draw();
      };
    });
    var err = U.text('p', sec, '', { role: 'status' }),
      metrics = h('div', { class: 'perf-metrics' }, sec),
      state = h('div', { class: 'cache-state' }, sec),
      summary = h('div', null, sec),
      sim;
    var transport = replayControls(
      sec,
      'Cache trace fragment',
      function (i) {
      if (!sim) return;
      var e = sim.events[i];
      state.replaceChildren();
      U.text(
        'h3',
        state,
        'Fragment ' + (i + 1) + ' / ' + sim.events.length + ' · ' + e.classification.toUpperCase()
      );
      U.text(
        'p',
        state,
        'Byte ' +
          e.addr +
          ' → line ' +
          e.line +
          ', set ' +
          e.set +
          '. Reuse distance: ' +
          (e.distance === null ? 'first touch (∞)' : e.distance + ' distinct lines') +
          '. Fully associative cache of the same size: ' +
          (e.shadowHit ? 'hit' : 'miss') +
          '.' +
          (e.victim
            ? ' Evicts line ' +
              e.victim.line +
              (e.victim.dirty ? ' and writes back ' + o.line + ' dirty bytes.' : '.')
            : '')
      );
      U.table(
        state,
        ['Set', 'MRU → LRU (D = dirty)'],
        e.sets.map(function (ways, k) {
          return [
            k,
            ways.length
              ? ways
                  .map(function (w) {
                    return 'line ' + w.line + (w.dirty ? ' D' : '');
                  })
                  .join(' → ')
              : 'empty'
          ];
        })
      );
      },
      state
    );
    function draw() {
      try {
        var tokens = input.value.trim().split(/[\s,]+/);
        if (tokens.length > 512) throw new Error('Use at most 512 accesses.');
        var trace = tokens.map(function (v) {
          var addr = /^[A-Z]$/i.test(v)
            ? (v.toUpperCase().charCodeAt(0) - 65) * 64
            : /^(0x[0-9a-f]+|\d+)$/i.test(v)
              ? Number(v)
              : NaN;
          if (!Number.isSafeInteger(addr) || addr < 0 || addr > 1048576)
            throw new Error('Use A–Z or byte offsets 0–1048576.');
          return { addr: addr, size: 8, op: o.op };
        });
        sim = M.replay(trace, o);
        sec._cacheResult = sim;
        err.textContent = '';
        metrics.replaceChildren();
        summary.replaceChildren();
        var c = sim.counts;
        U.metric(
          metrics,
          'Cache capacity',
          o.sets * o.ways * o.line + ' B',
          o.sets * o.ways + ' lines'
        );
        U.metric(
          metrics,
          'Hits / line accesses',
          c.hits + ' / ' + c.lineAccesses,
          'Split accesses may touch two lines'
        );
        U.metric(
          metrics,
          'Compulsory / capacity / conflict',
          c.compulsory + ' / ' + c.capacity + ' / ' + c.conflict,
          'Every miss is exactly one of these'
        );
        U.metric(
          metrics,
          'Traffic to the next level',
          c.totalLineBytes + ' B',
          'Fills, ownership reads and writebacks'
        );
        U.table(
          summary,
          ['Traffic', 'Bytes / events'],
          [
            ['Useful read / write bytes', c.usefulReadBytes + ' / ' + c.usefulWriteBytes],
            ['Read fills / ownership reads (RFO)', c.readFillBytes + ' / ' + c.rfoBytes],
            ['Dirty evictions / writeback bytes', c.dirtyEvictions + ' / ' + c.writebackBytes],
            [
              'Dirty lines still resident',
              sim.dirtyResident +
                (o.drain
                  ? ' (written back at the end)'
                  : ' (not written back yet)')
            ]
          ]
        );
        U.table(
          summary,
          ['Access', 'Line / set', 'Reuse distance', 'Fully assoc. cache', 'Result'],
          sim.events.map(function (e) {
            return [
              e.index + 1,
              e.line + ' / ' + e.set,
              e.distance === null ? '∞' : e.distance,
              e.shadowHit ? 'hit' : 'miss',
              e.classification
            ];
          })
        );
        transport.set(sim.events.length);
      } catch (e) {
        err.textContent = e.message;
      }
    }
    draw();
    U.text(
      'p',
      sec,
      'How to read it: a first use is compulsory. A miss the fully associative cache would have avoided is a conflict miss. Every other repeat miss is a capacity miss: the data does not fit.'
    );
    U.text(
      'p',
      sec,
      'On real hardware, keep the amount of data fixed and compare strides that land in one set with strides that spread out. L2 and L3 caches often hash the set index, so their sets may not line up the way they do here.'
    );
  }
  function splitAndPorts(root) {
    var sec = section(
      root,
      'split',
      'Split accesses and hit throughput',
      'What happens when one load crosses a line or page boundary, and how many hits the L1 can serve per cycle.'
    );
    teaching(
      sec,
      'Line and page boundaries are exact for 64-byte lines and 4 KiB pages. The banks, ports and widths are made-up values, not any real CPU’s layout.'
    );
    var o = { addr: 60, size: 8, ports: 2, banks: 4, width: 8, pattern: 'spread' },
      controls = h('div', { class: 'perf-controls' }, sec);
    U.select(
      controls,
      'Starting byte offset',
      [0, 8, 32, 56, 60, 63, 4088, 4092, 4095],
      60,
      function (v) {
        o.addr = +v;
        draw();
      }
    );
    U.select(controls, 'Access bytes', [1, 2, 4, 8, 16, 32, 64], 8, function (v) {
      o.size = +v;
      draw();
    });
    U.select(controls, 'Shared load/store ports', [1, 2, 4], 2, function (v) {
      o.ports = +v;
      draw();
    });
    U.select(controls, 'Banks', [1, 2, 4, 8], 4, function (v) {
      o.banks = +v;
      draw();
    });
    U.select(controls, 'Bytes per port per cycle', [8, 16, 32], 8, function (v) {
      o.width = +v;
      draw();
    });
    U.select(
      controls,
      'Independent hit pattern',
      [
        ['spread', 'Adjacent words'],
        ['same', 'Same modeled bank'],
        ['mixed', 'Reads, stores and fills share ports']
      ],
      'spread',
      function (v) {
        o.pattern = v;
        draw();
      }
    );
    var metrics = h('div', { class: 'perf-metrics' }, sec),
      figure = h('figure', { class: 'perf-chart' }, sec),
      sv = s(
        'svg',
        {
          viewBox: '0 0 840 156',
          role: 'img',
          'aria-label': 'Exact byte coverage across cache-line and page boundaries'
        },
        figure
      ),
      result = h('div', null, sec);
    function draw() {
      var q = M.split(o.addr, o.size, 64),
        base = Math.floor(o.addr / 64) * 64;
      metrics.replaceChildren();
      result.replaceChildren();
      sv.replaceChildren();
      U.metric(metrics, 'Cache lines', String(q.lines), o.size + ' bytes from offset ' + o.addr);
      U.metric(
        metrics,
        '4 KiB pages',
        String(q.pages),
        'Each page can have a different translation or fault state'
      );
      for (var row = 0; row < 3; row++) {
        var lo = base + row * 64;
        if (lo > o.addr + o.size && row > 1) break;
        s('text', { x: 8, y: row * 44 + 16, class: 's' }, sv, 'line ' + Math.floor(lo / 64));
        for (var i = 0; i < 64; i++) {
          var address = lo + i;
          s(
            'rect',
            {
              x: 100 + i * 11,
              y: row * 44 + 2,
              width: 10,
              height: 24,
              class: address >= o.addr && address < o.addr + o.size ? 'actb' : 'box'
            },
            sv
          );
        }
        s(
          'text',
          { x: 100, y: row * 44 + 39, class: 's' },
          sv,
          'bytes ' + lo + '–' + (lo + 63) + ' · page ' + Math.floor(lo / 4096)
        );
      }
      var trace = Array.from({ length: 16 }, function (_, i) {
        var fill = o.pattern === 'mixed' && i % 4 === 0;
        return {
          addr: fill ? i * 64 : o.pattern === 'same' ? i * o.banks * o.width : i * 8,
          size: fill ? 64 : o.size,
          op: o.pattern === 'mixed' ? (fill ? 'fill' : i % 2 ? 'store' : 'load') : 'load'
        };
      });
      var r = M.hitSchedule(trace, {
        ports: o.ports,
        banks: o.banks,
        width: o.width,
        latency: Math.ceil(App.CFG.l1)
      });
      sec._hitResult = r;
      U.metric(
        metrics,
        '16 independent hit operations',
        r.cycles + ' cycles',
        r.throughput.toFixed(3) + ' ops/cycle including pipeline fill/drain'
      );
      U.metric(
        metrics,
        'L1 traffic',
        r.bytesPerCycle.toFixed(2) + ' B/cycle',
        'Bytes read or filled inside the L1 per cycle'
      );
      U.table(
        result,
        ['Operation / kind', 'Byte fragment', 'Bank', 'Issue → done'],
        r.events.map(function (e) {
          return [
            e.op + 1 + ' / ' + e.kind,
            e.addr + ' + ' + e.bytes + ' B',
            e.bank,
            e.issue + ' → ' + e.done
          ];
        })
      );
      U.text(
        'p',
        result,
        'Here bank = (address ÷ port width) mod number of banks, and each bank takes one piece per cycle. Loads, stores and fills share the same ports. A wide or split access needs extra pieces, but being misaligned inside one line never costs a second line fill.'
      );
      if (q.pages > 1)
        U.text(
          'p',
          result,
          'This access crosses a page boundary. Each page has its own translation, so either half can miss in the TLB, sit in a different physical frame, or fault. Crossing the boundary is not a fault by itself.'
        );
    }
    draw();
    App.onCfg(draw);
    U.checkpoint(
      sec,
      'Can 16 independent L1 hits finish in fewer than 16 × the latency of one hit?',
      ['Yes, if issue resources allow overlap', 'No, every hit must finish before the next starts'],
      0,
      'Hits overlap in the pipeline, so throughput is not 1 ÷ latency. A shared bank or port can still force them through one at a time.'
    );
  }
  function forwarding(root) {
    var sec = section(
      root,
      'forwarding',
      'Forward, wait, or replay?',
      'A younger load wants bytes that an older store has not written to the cache yet. Which bytes overlap decides what happens.'
    );
    teaching(
      sec,
      'This only checks which bytes overlap. Real CPUs add their own size and alignment rules for when forwarding is fast. The “same lower 12 bits” check is a simplified early filter.'
    );
    var o = {
        storeAddr: 4096,
        storeSize: 8,
        loadAddr: 4096,
        loadSize: 8,
        addressKnown: true,
        dataKnown: true,
        speculate: false
      },
      ctl = h('div', { class: 'perf-controls' }, sec);
    [
      ['storeAddr', 'Store address', [4096, 4100, 4156]],
      ['storeSize', 'Store size (B)', [1, 2, 4, 8, 16, 32]],
      ['loadAddr', 'Load address', [4096, 4100, 4104, 4156, 8192, 8256]],
      ['loadSize', 'Load size (B)', [1, 2, 4, 8, 16, 32]]
    ].forEach(function (a) {
      U.select(ctl, a[1], a[2], o[a[0]], function (v) {
        o[a[0]] = +v;
        draw();
      });
    });
    U.select(
      ctl,
      'Store address known',
      [
        [1, 'yes'],
        [0, 'no']
      ],
      1,
      function (v) {
        o.addressKnown = !!+v;
        draw();
      }
    );
    U.select(
      ctl,
      'Store data ready',
      [
        [1, 'yes'],
        [0, 'no']
      ],
      1,
      function (v) {
        o.dataKnown = !!+v;
        draw();
      }
    );
    U.select(
      ctl,
      'Unresolved-store policy',
      [
        [0, 'wait'],
        [1, 'speculate and validate']
      ],
      0,
      function (v) {
        o.speculate = !!+v;
        draw();
      }
    );
    var out = h('div', { class: 'perf-explanation' }, sec),
      matrix = h('div', null, sec);
    function draw() {
      var r = M.forwarding(o);
      out.replaceChildren();
      sec._forwardResult = r;
      U.text('h3', out, r.outcome);
      U.text('p', out, r.mechanism);
      U.text('p', out, r.certainty);
      U.table(
        out,
        ['Byte range / comparison', 'Result'],
        [
          ['Older store', o.storeAddr + '…' + (o.storeAddr + o.storeSize - 1)],
          ['Younger load', o.loadAddr + '…' + (o.loadAddr + o.loadSize - 1)],
          ['Overlap', r.overlap + ' / ' + o.loadSize + ' required bytes'],
          ['Same lower 12 bits', r.lowMatch ? 'yes' : 'no'],
          ['Store / load cache lines', r.store.lines + ' / ' + r.load.lines]
        ]
      );
    }
    draw();
    U.table(
      matrix,
      ['Case', 'What has to be known', 'What usually happens'],
      [
        ['Exact match, data ready', 'All bytes are in the store', 'Forward'],
        [
          'Load inside the store',
          'All bytes covered; size and alignment allowed',
          'Forward, if the CPU supports that shape'
        ],
        [
          'Partial overlap, or several stores',
          'Some bytes come from somewhere else',
          'Merge if supported; otherwise wait and replay'
        ],
        ['Access crosses a line', 'Two cache lines are involved', 'Extra handling; the cost varies'],
        [
          'Store address not known yet',
          'Real overlap or false alarm?',
          'Wait, or guess and check later'
        ],
        [
          'Same low bits, different address',
          'Only the low bits matched',
          'The false dependency is released'
        ]
      ]
    );
    U.text(
      'p',
      sec,
      'On real hardware, time exact-match and offset or width variants in the same loop, and check the assembly: the compiler may forward the value itself or remove the memory operations. A slowdown alone does not tell you which rule caused it.'
    );
  }
  function misses(root) {
    var sec = section(
      root,
      'miss-entries',
      'Miss entries: sharing and running out',
      'Loads to the same line share one entry; loads to different lines each need their own.'
    );
    teaching(
      sec,
      'A miss table tracks each missing line until it arrives. Fills take a fixed 20 cycles and the cache never evicts, so only the miss table and the ROB limit progress.'
    );
    var o = { entries: 2, rob: 8, pattern: 'unique' },
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(ctl, 'Miss entries', [1, 2, 4, 8], 2, function (v) {
      o.entries = +v;
      draw();
    });
    U.select(ctl, 'ROB load slots', [4, 8, 16], 8, function (v) {
      o.rob = +v;
      draw();
    });
    U.select(
      ctl,
      'Miss pattern',
      [
        ['unique', '16 different lines'],
        ['pairs', 'Pairs to the same line'],
        ['one', '16 loads of one line']
      ],
      'unique',
      function (v) {
        o.pattern = v;
        draw();
      }
    );
    var metrics = h('div', { class: 'perf-metrics' }, sec),
      state = h('div', null, sec),
      r;
    var control = replayControls(sec, 'Miss-allocation cycle', function (i) {
      if (!r) return;
      var t = r.trace[i];
      state.replaceChildren();
      U.text('h3', state, 'Cycle ' + t.t + ' · ' + (t.stall || 'new loads can enter'));
      U.table(
        state,
        ['Miss line', 'Merged waiters', 'Fill at cycle'],
        t.lines.map(function (m) {
          return [m.line, m.waiters, m.done];
        })
      );
      U.text(
        'p',
        state,
        'Entries ' +
          t.entries +
          '/' +
          r.p.entries +
          ' · ROB ' +
          t.rob +
          '/' +
          r.p.rob +
          ' · retired ' +
          t.retired +
          '/' +
          r.loads.length
      );
    }, state);
    function draw() {
      var lines = Array.from({ length: 16 }, function (_, i) {
        return o.pattern === 'one' ? 0 : o.pattern === 'pairs' ? Math.floor(i / 2) : i;
      });
      r = M.misses(lines, o);
      sec._missResult = r;
      metrics.replaceChildren();
      U.metric(
        metrics,
        'Requests / merged loads',
        r.requests + ' / ' + r.merged,
        'A merged load needs no new entry'
      );
      U.metric(
        metrics,
        'Blocked',
        r.blocked + ' cycles',
        'A new line, but every entry was busy'
      );
      U.metric(
        metrics,
        'Finished after',
        r.cycles + ' cycles',
        'Including start-up and drain'
      );
      control.set(r.trace.length);
    }
    draw();
    h(
      'p',
      null,
      sec,
      'Compare with the <a href="#perf/queues">queues further down the path</a>. Real cores differ in how many misses they track and how they split those entries between threads.'
    );
  }
  function siblings(root) {
    var sec = section(
      root,
      'smt',
      'One core, two threads',
      'A second thread can fill idle slots, or take resources the first thread needs.'
    );
    teaching(
      sec,
      'Two threads share one issue slot and a pool of load slots. The sharing rules are examples: real cores split some structures between threads and share others.'
    );
    var o = { capacity: 8, policy: 'shared', sibling: 'memory' },
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(
      ctl,
      'Sibling workload',
      [
        ['off', 'No sibling'],
        ['compute', 'Compute-ready sibling'],
        ['memory', 'Memory-heavy sibling']
      ],
      'memory',
      function (v) {
        o.sibling = v;
        draw();
      }
    );
    U.select(
      ctl,
      'Load-slot allocation',
      [
        ['shared', 'Dynamic shared pool'],
        ['partitioned', 'Equal fixed quotas']
      ],
      'shared',
      function (v) {
        o.policy = v;
        draw();
      }
    );
    U.select(ctl, 'Total shared load slots', [4, 8, 16], 8, function (v) {
      o.capacity = +v;
      draw();
    });
    var metrics = h('div', { class: 'perf-metrics' }, sec),
      fig = h('figure', { class: 'perf-chart' }, sec),
      svg = s(
        'svg',
        {
          viewBox: '0 0 820 220',
          role: 'img',
          'aria-label': 'Two threads competing for load slots'
        },
        fig
      ),
      out = h('div', null, sec);
    function draw() {
      var r = M.siblings(o),
        alone = M.siblings(Object.assign({}, o, { sibling: 'off' }));
      sec._smtResult = r;
      metrics.replaceChildren();
      out.replaceChildren();
      svg.replaceChildren();
      U.metric(
        metrics,
        'Thread A: 64 dependent loads',
        r.aCycles + ' cycles',
        (r.aCycles / alone.aCycles).toFixed(2) + '× solo time'
      );
      U.metric(
        metrics,
        'A blocked',
        r.blocked[0] + ' cycles',
        'A was ready but had no free load slot'
      );
      U.metric(
        metrics,
        'Thread B work',
        o.sibling === 'off' ? 'none' : String(r.threads[1].done),
        '64 compute operations, or independent slow loads'
      );
      [0, 1].forEach(function (thread) {
        var pts = r.trace.map(function (t) {
          return (
            (42 + (746 * t.t) / (r.cycles - 1)).toFixed(1) +
            ',' +
            (180 - (140 * t[thread ? 'b' : 'a']) / o.capacity).toFixed(1)
          );
        });
        s(
          'polyline',
          {
            points: pts.join(' '),
            fill: 'none',
            stroke: thread ? 'var(--a3)' : 'var(--a2)',
            'stroke-width': 2
          },
          svg
        );
      });
      s('text', { x: 42, y: 20, class: 's' }, svg, 'Load slots in use · A green · B violet');
      s('text', { x: 42, y: 207, class: 's' }, svg, '0');
      s(
        'text',
        { x: 788, y: 207, class: 's', 'text-anchor': 'end' },
        svg,
        r.cycles + ' model cycles'
      );
      U.text(
        'p',
        out,
        'A needs one slot for 4 cycles at a time; a memory-heavy B can hold many slots for 80 cycles each. A compute-only B takes issue slots but no load slots. Equal quotas protect A but can leave slots idle; a shared pool uses every slot but lets B delay A.'
      );
    }
    draw();
    U.table(
      sec,
      ['Run it on', 'What you see'],
      [
        ['One thread', 'The baseline: a pinned pointer chase with its sibling idle'],
        [
          'Two threads on one core',
          'They compete for the core’s queues and private caches, and may fill each other’s idle slots'
        ],
        ['Two separate cores', 'They compete only for the shared L3, interconnect and memory']
      ]
    );
    h(
      'p',
      null,
      sec,
      'On Linux, <code>/sys/devices/system/cpu/cpu0/topology/thread_siblings_list</code> shows which logical CPUs share a core. The <a href="#perf/queues">finite-queue experiment</a> shows the shared pressure further down.'
    );
  }
  App.extendChapter('l1d', function (root) {
    cache(root);
    splitAndPorts(root);
  });
  App.extendChapter('stores', forwarding);
  App.extendChapter('core', function (root) {
    misses(root);
    siblings(root);
  });
  App.CacheUI = { replayControls: replayControls, teaching: teaching };
})();
