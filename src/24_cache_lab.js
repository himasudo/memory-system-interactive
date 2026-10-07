(function () {
  'use strict';
  var U = App.LabUI,
    h = App.h,
    s = App.s,
    M = CacheLab;
  App.gloss(
    'reuse_distance',
    'reuse / stack distance',
    'Number of distinct other cache lines referenced since the previous access to a line. Under fully associative LRU, a cache of C lines hits when this distance is below C. First touch has no finite reuse distance.'
  );
  App.gloss(
    'compulsory',
    'compulsory miss',
    'First reference to a cache line in the defined demand trace. The 3C experiment starts empty and excludes prefetch/coherence effects.'
  );
  App.gloss(
    'capacity_miss',
    'capacity miss',
    'A repeated-reference miss that also misses in the same-capacity fully associative LRU shadow used by this experiment. This is a classification relative to a stated replacement model, not perfect replacement.'
  );
  App.gloss(
    'hitm',
    'HITM / dirty peer evidence',
    'A modified peer cache can supply the current line while backing memory is stale. Hardware sampling events and report labels differ across CPU families; perf c2c support must be checked on the target machine.'
  );
  App.gloss(
    'transient_coh',
    'transient coherence state',
    'Tracks outstanding data, permission requests or acknowledgements between stable states. IS/IM/SM/OM in the lab are generic teaching labels, not AMD protocol state names.'
  );
  App.gloss(
    'atomic_rmw',
    'atomic read-modify-write',
    'Indivisibly reads and updates one atomic object. Its language-level memory order constrains other accesses separately. Relaxed still guarantees atomicity; it does not publish unrelated payload data.'
  );
  function section(root, id, title, copy) {
    return App.labSection(root, id, title, copy);
  }
  function teaching(root, copy) {
    U.badge(root, 'Teaching model · chosen capacities and policies');
    U.text('p', root, copy);
  }
  function replayControls(root, label, render) {
    var controls = h('div', { class: 'perf-actions' }, root),
      back = U.text('button', controls, '← back', { type: 'button' }),
      next = U.text('button', controls, 'next →', { type: 'button' }),
      reset = U.text('button', controls, 'restart', { type: 'button' }),
      lab = h('label', { class: 'perf-scrub' }, controls);
    U.text('span', lab, label);
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
      'Classify a miss; measure reuse',
      'Change one cache parameter while preserving the access trace.'
    );
    teaching(
      sec,
      'This experiment uses true LRU in a small set-associative cache and a same-capacity fully associative LRU shadow. It complements the chosen cache layout / pLRU walkthrough above. The 3C classification applies to this demand trace; coherence invalidations, prefetching and other replacement policies need additional explanations.'
    );
    U.checkpoint(
      sec,
      'Three lines map to one 2-way set but fit in the whole cache. After the first touches, why do repeated accesses miss?',
      ['Compulsory', 'Capacity', 'Conflict'],
      2,
      'The fully associative shadow still holds the lines; only the set restriction forces eviction.'
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
    var transport = replayControls(sec, 'Cache trace fragment', function (i) {
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
          '. Same-capacity fully associative LRU: ' +
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
    });
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
          'All miss causes partition this trace'
        );
        U.metric(
          metrics,
          'Lower-level traffic',
          c.totalLineBytes + ' B',
          'Demand fills + RFO + dirty writebacks'
        );
        U.table(
          summary,
          ['Accounting boundary', 'Bytes / events'],
          [
            ['Useful read / write bytes', c.usefulReadBytes + ' / ' + c.usefulWriteBytes],
            ['Read fills / RFO bytes', c.readFillBytes + ' / ' + c.rfoBytes],
            ['Dirty evictions / writeback bytes', c.dirtyEvictions + ' / ' + c.writebackBytes],
            [
              'Dirty lines still resident',
              sim.dirtyResident +
                (o.drain
                  ? ' (charged by explicit final drain)'
                  : ' (not yet charged as writebacks)')
            ]
          ]
        );
        U.table(
          summary,
          ['Access fragment', 'Line / set', 'Reuse distance', 'FA shadow', 'Actual outcome'],
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
      'For LRU, reuse distance is the number of distinct other lines since the previous reference. A fully associative cache of C lines hits when that distance is below C. First touch is compulsory; an actual miss that the shadow avoids is conflict; the remaining repeated-reference misses are capacity. This definition does not explain every miss on a real processor.'
    );
    U.text(
      'p',
      sec,
      'Measurement: hold the byte footprint fixed and compare strides that repeatedly map to one modeled set with strides that spread accesses. Real higher-level cache indexing can be hashed or undocumented. A timing change alone does not prove a particular physical index function. Use the native working-set/MLP harness, then add controlled stride traces.'
    );
  }
  function splitAndPorts(root) {
    var sec = section(
      root,
      'split',
      'Split accesses and finite hit throughput',
      'An L1 hit is a latency, not an unlimited supply rate.'
    );
    teaching(
      sec,
      'The byte boundaries are exact for 64-byte lines and 4 KiB pages. The bank function, port width/count and scheduling below are deliberately chosen teaching rules, not a hardware bank map or execution-port specification. The model chooses 64-byte lines; operand geometry does not establish ISA instruction support.'
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
    U.select(controls, 'Shared load/store ports (model)', [1, 2, 4], 2, function (v) {
      o.ports = +v;
      draw();
    });
    U.select(controls, 'Banks (model)', [1, 2, 4, 8], 4, function (v) {
      o.banks = +v;
      draw();
    });
    U.select(controls, 'Bytes per port/cycle (model)', [8, 16, 32], 8, function (v) {
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
        'L1 data-path traffic',
        r.bytesPerCycle.toFixed(2) + ' B/cycle',
        'Hit bytes + optional 64-byte fill writes; not DRAM bandwidth'
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
        'Bank = floor(byte address / port width) modulo bank count. Each bank accepts one fragment per model cycle; all request kinds share the selected ports. A wider or split operation consumes additional fragments. Misalignment inside one line does not itself mean two line fills. This model omits cache misses and uses the configured L1 latency after each fragment issues.'
      );
      if (q.pages > 1)
        U.text(
          'p',
          result,
          'This access crosses a page boundary. Either page can hit or miss in its TLB, map to a different physical frame, or be absent/protected. Crossing a boundary is not itself a page fault. The OS/translation extensions add those independent page states.'
        );
    }
    draw();
    App.onCfg(draw);
    U.checkpoint(
      sec,
      'Can 16 independent L1 hits finish in fewer than 16 × the latency of one hit?',
      ['Yes, if issue resources allow overlap', 'No, every hit must finish before the next starts'],
      0,
      'The schedule separates latency from accepted operations per cycle. A shared bank or port can still serialize issue.'
    );
  }
  function forwarding(root) {
    var sec = section(
      root,
      'forwarding',
      'Forward, wait, or replay?',
      'Inspect the bytes before guessing a forwarding rule.'
    );
    teaching(
      sec,
      'Coverage is a necessary data dependency condition, not a complete forwarding specification. Hardware-specific alignment, merging, size combinations and penalties require applicable documentation or a controlled measurement. The “lower 12 bits” experiment is an illustrative early-address filter.'
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
      'Unresolved-store policy (model)',
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
      ['Case', 'What must be resolved', 'Generic mechanism'],
      [
        ['Exact match, data ready', 'All bytes available', 'Forwarding candidate'],
        [
          'Contained load',
          'All bytes covered; width/alignment support',
          'Forwarding candidate, implementation-specific fast path'
        ],
        [
          'Partial overlap / multiple stores',
          'Other loaded bytes come from elsewhere',
          'Merge if supported, otherwise wait/replay'
        ],
        [
          'Cross-line access',
          'More than one cache-line fragment',
          'Extra handling; no fixed penalty asserted'
        ],
        [
          'Unresolved store address',
          'True overlap vs false alias',
          'Wait, or speculate then validate/replay'
        ],
        [
          'Same offset, different full addresses',
          'Partial match was not a dependency',
          'Any early false dependency can be released'
        ]
      ]
    );
    U.text(
      'p',
      sec,
      'Measure exact-match and offset/width variants with identical native loop structure. Inspect assembly; otherwise the compiler can forward a C value itself or remove the memory operations. Compare distributions and documented PMCs where available. A slowdown does not by itself identify a particular predictor or forwarding restriction.'
    );
  }
  function misses(root) {
    var sec = section(
      root,
      'miss-entries',
      'Mergeable misses versus miss-entry saturation',
      'Several loads can wait on one line; independent lines need independent entries.'
    );
    teaching(
      sec,
      'A finite miss table tracks outstanding lines until their fills return. Matching loads merge into one entry. Distinct lines require new entries; failed admission and ROB pressure delay the next load. Cache residency is unbounded after fill here so this experiment isolates allocation/merging, not replacement.'
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
      U.text('h3', state, 'Cycle ' + t.t + ' · ' + (t.stall || 'admission can advance'));
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
    });
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
        'Same-line merging consumes no new miss entry'
      );
      U.metric(
        metrics,
        'Admission blocked',
        r.blocked + ' cycles',
        'Distinct line + all miss entries occupied'
      );
      U.metric(
        metrics,
        'Completion',
        r.cycles + ' model cycles',
        'Includes fill/drain; fixed 20-cycle fill time'
      );
      control.set(r.trace.length);
    }
    draw();
    h(
      'p',
      null,
      sec,
      'Compare this with <a href="#perf/queues">downstream controller/return backpressure</a>. Hardware queue counts, merging limits and per-thread allocation policies must be measured or sourced for the actual processor.'
    );
  }
  function siblings(root) {
    var sec = section(
      root,
      'smt',
      'One core, two logical threads',
      'SMT can fill bubbles and can also compete for finite resources.'
    );
    teaching(
      sec,
      'Where SMT is supported, architectural thread state is distinct while execution and cache machinery can be shared. The quotas below are hypothetical choices, not a proprietary partitioning claim. This experiment isolates one shared issue slot and a finite load-slot pool. It does not model a calibrated hardware core or cache pollution.'
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
      'Load-slot allocation (model)',
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
        'A resource blocks',
        r.blocked[0] + ' cycles',
        'A is ready, but no allowed load slot is free'
      );
      U.metric(
        metrics,
        'Thread B work',
        o.sibling === 'off' ? 'none' : String(r.threads[1].done),
        '64 compute ops or independent long-latency loads'
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
      s('text', { x: 42, y: 20, class: 's' }, svg, 'A: green · B: violet · shared load occupancy');
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
        'A holds at most one slot for four cycles; memory-heavy B can hold many slots for 80 cycles. A compute sibling consumes issue opportunities without occupying load slots. Equal quotas protect A but can leave capacity idle. Dynamic sharing can use more capacity but lets B delay A. These are mechanism experiments, not measured slowdown factors.'
      );
    }
    draw();
    U.table(
      sec,
      ['Real placement', 'What to compare'],
      [
        ['One logical thread', 'Pinned pointer chase baseline; record SMT sibling activity'],
        [
          'Two siblings on one physical core',
          'Execution/queue/private-cache interference and possible bubble filling'
        ],
        [
          'Different physical cores',
          'Shared LLC/fabric/controller/bandwidth contention instead of same-core issue sharing'
        ]
      ]
    );
    h(
      'p',
      null,
      sec,
      'Inspect Linux <code>thread_siblings_list</code> before choosing CPUs. Use <a href="benchmarks/README.md">native measurement guidance</a>; the <a href="#perf/queues">finite-memory experiment</a> explains shared downstream pressure without claiming an exact topology.'
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
