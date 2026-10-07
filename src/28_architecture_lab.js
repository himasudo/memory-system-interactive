(function () {
  'use strict';
  var U = App.LabUI,
    h = App.h,
    s = App.s,
    M = ArchitectureLab,
    E = App.Evidence;
  function source(root, key) {
    var q = E.sources[key];
    return U.text('a', root, q[0], { href: q[1], target: '_blank', rel: 'noopener' });
  }
  function sources(root, keys) {
    return U.sources(
      root,
      keys.map(function (k) {
        return E.sources[k];
      })
    );
  }
  function section(root, id, title, copy) {
    return App.labSection(root, id, title, copy);
  }
  function ordering(root) {
    var sec = section(
      root,
      'litmus',
      'Memory ordering: x86 versus Arm',
      'Coherence keeps each single address consistent. Ordering is about two addresses: which mix of old and new values another core can see.'
    );
    U.table(
      sec,
      ['Layer', 'What it decides', 'What it doesn’t'],
      [
        [
          'Language (C, C++)',
          'Which accesses are atomic, and what happens before what',
          'A data race in C is a bug whatever the hardware does'
        ],
        [
          'Compiler',
          'Which instructions implement the program',
          'volatile or a compiler barrier alone does not synchronize threads'
        ],
        [
          'ISA memory model',
          'Which results the hardware may show for these instructions',
          'Cache latencies, queue sizes or cycle timing'
        ],
        [
          'Microarchitecture',
          'How speculation, buffers and coherence deliver that promise',
          'A load can run early inside the core and still look in order from outside'
        ],
        [
          'Cache coherence',
          'That all cores agree on each single address',
          'The order between two different addresses x and y'
        ]
      ]
    );
    U.model(
      sec,
      'x86-TSO: each thread runs in order, stores leave through a FIFO store buffer, and a load can read its own thread’s newest buffered store. Sequential consistency makes every store visible at once. The relaxed option lets independent operations swap: enough for these Arm contrasts, not the full AArch64 model. Plain aligned memory only.'
    );
    U.checkpoint(
      sec,
      'Two threads each store 1, then load the other location. Can both loads return 0 on ordinary x86 write-back memory?',
      ['Yes: each store can still be buffered', 'No: coherent caches force sequential consistency'],
      0,
      'On both AMD and Intel x86. Each store still sits in its store buffer when the other thread’s load runs. Step through the 0,0 example below.'
    );
    var o = { name: 'SB', model: 'tso', fenced: false },
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(
      ctl,
      'Litmus case',
      [
        ['SB', 'Store Buffering'],
        ['MP', 'Message Passing'],
        ['LB', 'Load Buffering']
      ],
      o.name,
      function (v) {
        o.name = v;
        run();
      }
    );
    U.select(
      ctl,
      'Ordering rules',
      [
        ['tso', 'x86 (AMD and Intel)'],
        ['relaxed', 'Arm-style relaxed'],
        ['sc', 'Sequential consistency']
      ],
      o.model,
      function (v) {
        o.model = v;
        run();
      }
    );
    U.select(
      ctl,
      'Full ordering points',
      [
        [0, 'None'],
        [1, 'Fence between the two operations, both threads']
      ],
      0,
      function (v) {
        o.fenced = !!+v;
        run();
      }
    );
    var program = h('div', { class: 'ordering-program' }, sec),
      metrics = h('div', { class: 'perf-metrics' }, sec),
      summary = U.text('p', sec, ''),
      choices = h('div', { class: 'perf-controls' }, sec),
      state = h('div', { class: 'cache-state ordering-state' }, sec),
      trace,
      r;
    var step = App.CacheUI.replayControls(sec, 'Ordering event', function (i) {
      if (!trace) return;
      var e = trace[i],
        q = e.state;
      state.replaceChildren();
      U.text('h3', state, 'Event ' + i + ' · ' + e.label);
      U.table(
        state,
        ['Thread', 'Operations issued', 'Store buffer'],
        q.issued.map(function (a, cpu) {
          return [
            'T' + cpu,
            a
              .map(function (v, k) {
                return k + 1 + ': ' + (v ? 'issued' : 'waiting');
              })
              .join(' / '),
            q.buffers[cpu]
              .map(function (w) {
                return w.addr + '=' + w.value;
              })
              .join(' → ') || 'empty'
          ];
        })
      );
      U.table(
        state,
        ['Memory x / y', 'Registers r0 / r1'],
        [
          [
            q.memory.x + ' / ' + q.memory.y,
            [q.registers.r0, q.registers.r1]
              .map(function (x) {
                return x === null ? 'not read' : x;
              })
              .join(' / ')
          ]
        ]
      );
    }, state);
    function opText(op) {
      return op.kind === 'F'
        ? 'full ordering point'
        : op.kind === 'W'
          ? 'store ' + op.addr + ' = 1'
          : 'load ' + op.addr + ' → ' + op.reg;
    }
    function run() {
      r = M.litmus(o);
      sec._orderingResult = r;
      program.replaceChildren();
      metrics.replaceChildren();
      choices.replaceChildren();
      U.table(
        program,
        ['Program position', 'Thread 0', 'Thread 1'],
        r.programs[0].map(function (op, i) {
          return [i + 1, opText(op), opText(r.programs[1][i])];
        })
      );
      U.metric(metrics, 'Target outcome', r.target, 'r0, r1; initially x = y = 0');
      U.metric(
        metrics,
        'Target reachable',
        r.targetAllowed ? 'Yes' : 'No',
        'Under the rules selected above'
      );
      U.metric(
        metrics,
        'Distinct outcomes / states',
        Object.keys(r.outcomes).length + ' / ' + r.states,
        'Counts of possibilities, not probabilities'
      );
      var key = r.targetAllowed ? r.target : Object.keys(r.outcomes)[0];
      U.select(choices, 'Show an example for', Object.keys(r.outcomes).sort(), key, function (v) {
        trace = r.outcomes[v].trace;
        step.set(trace.length);
      });
      trace = r.outcomes[key].trace;
      step.set(trace.length);
      summary.textContent = o.fenced
        ? 'A full fence on both threads rules out the surprising result in all three tests. On x86 that is MFENCE; on Arm, DMB SY. (What the fence costs is not modeled.)'
        : o.name === 'SB'
          ? 'x86 allows 0,0: each store is still in its store buffer when the other thread’s load runs. AMD and Intel behave the same here.'
          : o.name === 'MP'
            ? 'On x86, a reader that sees y=1 must also see x=1. Plain Arm loads and stores allow y=1 with x=0, so the writer needs a release (or a barrier) and the reader an acquire.'
            : 'Each store writes a constant 1 that doesn’t depend on the earlier load, so Arm may perform it first and both loads can see 1. x86 forbids that. Making the store depend on the load changes the answer.';
    }
    run();
    var language = section(
      root,
      'language',
      'The same idea in C',
      'In C, ordering comes from atomics and their memory orders, not from whatever the hardware happens to do.'
    );
    var kind = 'release',
      seen = 1,
      controls = h('div', { class: 'perf-controls' }, language);
    U.select(
      controls,
      'Publication in C11',
      [
        ['release', 'Release store, acquire load'],
        ['relaxed', 'Everything atomic, relaxed'],
        ['plain', 'Plain variables (data race)'],
        ['seqcst', 'Everything atomic, seq_cst']
      ],
      kind,
      function (v) {
        kind = v;
        explain();
      }
    );
    U.select(controls, 'Value read from flag', [0, 1], 1, function (v) {
      seen = +v;
      explain();
    });
    var code = h('div', null, language),
      verdict = U.text('p', language, '', { role: 'status' });
    function explain() {
      code.replaceChildren();
      var order =
          kind === 'seqcst'
            ? 'memory_order_seq_cst'
            : kind === 'release'
              ? 'memory_order_release'
              : 'memory_order_relaxed',
        readOrder = kind === 'release' ? 'memory_order_acquire' : order;
      U.code(
        code,
        kind === 'plain'
          ? '// Intentionally invalid synchronization: do not use.\n// Initially data = 0, flag = 0.\n// Producer                 // Consumer\ndata = 42;                  if (flag == 1)\nflag = 1;                       use(data);'
          : '// Objects initialized before starting threads; one publication only.\n// Producer\n' +
              (kind === 'release'
                ? 'data = 42; // non-atomic payload'
                : 'atomic_store_explicit(&data, 42, ' + order + ');') +
              '\natomic_store_explicit(&flag, 1, ' +
              order +
              ');\n\n// Consumer\nif (atomic_load_explicit(&flag, ' +
              readOrder +
              ') == 1)\n    use(' +
              (kind === 'release' ? 'data' : 'atomic_load_explicit(&data, ' + order + ')') +
              ');'
      );
      verdict.textContent =
        kind === 'plain'
          ? 'Both threads touch the plain flag at the same time. That is a data race, so the whole program has undefined behavior: there is no correct result to compare with the hardware.'
          : seen === 0
            ? 'The flag was still 0, so the consumer skips the data. Reading 0 synchronizes with nothing.'
            : kind === 'relaxed'
              ? 'No data race, because everything is atomic, but relaxed atomics don’t order the two variables. C allows flag=1 with the old data. x86 happens to give you more than that; Arm doesn’t.'
              : 'The reader saw flag=1, so it is guaranteed to see data=42. Release and acquire are exactly the pair that makes the plain data safe to read.';
    }
    explain();
    sources(language, ['c11', 'armbarrier']);
    U.text('h3', sec, 'Check it with real tools');
    h(
      'p',
      null,
      sec,
      'herd7 runs a litmus test against the formal x86 or Arm model and lists every allowed result. litmus7 runs the same test many times on real hardware. Not seeing an allowed result doesn’t make it forbidden, and an emulator can’t show you a real Arm CPU’s behavior. <a href="benchmarks/litmus/README.md">Litmus sources and how to run them</a>.'
    );
    sources(sec, ['tso', 'intel', 'arm', 'armmodel']);
  }
  function inclusion(root) {
    var sec = section(
      root,
      'inclusion',
      'Inclusive, exclusive or neither?',
      'With an inclusive shared cache, a core can lose a line it is still using because another core filled the shared cache.'
    );
    U.model(
      sec,
      'Two private read-only caches and one shared last-level cache, all fully associative LRU. Inclusive: every private line is also in the shared cache, and evicting it there removes the private copies. Exclusive: each line lives in one place. Neither (NINE): both levels fill, and shared-cache evictions don’t reach up. No dirty data, no directory limits.'
    );
    U.checkpoint(
      sec,
      'Thread 0 keeps using A in its private cache. Thread 1’s traffic pushes A out of the shared cache. Does thread 0 lose A?',
      ['Only if the shared cache is inclusive', 'Always: coherence needs every level to hold A'],
      0,
      'Run the same trace under each policy. Only the inclusive one takes A away from thread 0.'
    );
    var o = { policy: 'inclusive', privateLines: 2, llcLines: 4 },
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(
      ctl,
      'LLC inclusion policy',
      [
        ['inclusive', 'Inclusive'],
        ['exclusive', 'Exclusive (victim cache)'],
        ['nine', 'Neither (NINE)']
      ],
      o.policy,
      function (v) {
        o.policy = v;
        run();
      }
    );
    U.select(ctl, 'Private cache lines', [1, 2, 4], 2, function (v) {
      o.privateLines = +v;
      run();
    });
    U.select(ctl, 'Shared LLC lines', [2, 4, 8], 4, function (v) {
      o.llcLines = +v;
      run();
    });
    var lab = h('label', { class: 'perf-field' }, sec);
    U.text('span', lab, 'Read trace (thread:line; A=0, B=1…)');
    var input = h(
      'textarea',
      { rows: 2, class: 'cache-trace-input', 'aria-label': 'Inclusion read trace' },
      lab
    );
    input.value = '0:A 1:B 1:C 1:D 1:E 0:A 1:F 0:A';
    var actions = h('div', { class: 'perf-actions' }, sec);
    U.text('button', actions, 'Apply inclusion trace', { type: 'button' }).onclick = run;
    var status = U.text('p', sec, '', { role: 'status' }),
      metrics = h('div', { class: 'perf-metrics' }, sec),
      state = h('div', { class: 'cache-state' }, sec),
      r,
      step = App.CacheUI.replayControls(sec, 'Inclusion reference', function (i) {
        if (!r) return;
        var e = r.trace[i];
        state.replaceChildren();
        U.text('h3', state, 'T' + e.cpu + ' reads line ' + e.line + ' · ' + e.where);
        U.text(
          'p',
          state,
          e.events.join(' → ') ||
            'A private hit updates only the private LRU order; the shared cache never sees it.'
        );
        U.table(
          state,
          ['Location', 'Data lines (MRU → LRU)'],
          [
            ['T0 private', e.upper[0].join(' → ') || 'empty'],
            ['T1 private', e.upper[1].join(' → ') || 'empty'],
            ['LLC', e.lower.join(' → ') || 'empty']
          ]
        );
        U.text(
          'p',
          state,
          e.unique +
            ' distinct lines held; ' +
            e.duplicates +
            ' duplicate copies.'
        );
      }, state);
    function run() {
      try {
        var access = input.value
          .trim()
          .split(/[\s,]+/)
          .map(function (t) {
            var m = /^([01]):([A-Z]|\d+)$/i.exec(t);
            if (!m) throw new Error('Use thread 0 or 1, a colon, and A–Z or a line number.');
            return {
              cpu: +m[1],
              line: /^[a-z]$/i.test(m[2]) ? m[2].toUpperCase().charCodeAt(0) - 65 : +m[2]
            };
          });
        r = M.inclusion(access, o);
        sec._inclusionResult = r;
        status.textContent = '';
        metrics.replaceChildren();
        U.metric(
          metrics,
          'Private / peer / LLC hits',
          r.stats.privateHits + ' / ' + r.stats.peerHits + ' / ' + r.stats.llcHits,
          'Same trace for every policy'
        );
        U.metric(
          metrics,
          'Memory reads',
          r.stats.memoryReads + ' lines',
          r.bytes + ' B from memory'
        );
        U.metric(
          metrics,
          'Back-invalidations',
          String(r.stats.backInvalidations),
          'Private copies removed by the inclusive rule'
        );
        step.set(r.trace.length);
      } catch (e) {
        r = null;
        sec._inclusionResult = null;
        state.replaceChildren();
        metrics.replaceChildren();
        status.textContent = e.message;
      }
    }
    run();
    U.table(
      sec,
      ['Real chips', 'Policy and what it changes'],
      [
        [
          'AMD Zen family, Zen 5 included',
          'The L3 is a victim cache, filled with lines the L2s evict. That is close to the exclusive option above.'
        ],
        [
          'Intel Xeon, Broadwell (E5 v4) → Skylake-SP',
          'Intel moved its server L3 from inclusive to non-inclusive, so the L3 no longer has to hold a copy of every L2 line.'
        ],
        [
          'Any design',
          'Not holding a line’s data is not the same as not tracking it: a directory or snoop filter can still record which cores have it.'
        ]
      ]
    );
    U.text(
      'p',
      sec,
      'On real hardware: pin a reader that reuses a few lines to one core and a cache-thrashing program to another, then watch the reader’s latency. Timing alone can’t prove which policy a chip uses, because cache size, replacement and prefetching move the result too.'
    );
    sources(sec, ['zen5', 'cache']);
  }
  function granules(root) {
    var sec = section(
      root,
      'granules',
      'Arm page sizes: 4, 16 or 64 KiB',
      'x86-64 always uses 4 KiB base pages. Arm lets the OS choose 4, 16 or 64 KiB, which changes TLB reach and how large an L1 can be while still indexing with page-offset bits.'
    );
    U.badge(sec, 'Vendor docs');
    U.text(
      'p',
      sec,
      'Which sizes a particular Arm CPU supports is up to its designers, and the OS picks one at boot. Huge pages (block mappings) exist on top of each base size.'
    );
    var o = { regions: 256, stride: 4096, entries: 64 },
      cache = 32768,
      ways = 8,
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(
      ctl,
      'Access stride',
      [
        [4096, 'One word every 4 KiB'],
        [65536, 'One word every 64 KiB']
      ],
      4096,
      function (v) {
        o.stride = +v;
        draw();
      }
    );
    U.select(ctl, 'TLB entries', [16, 64, 128], 64, function (v) {
      o.entries = +v;
      draw();
    });
    U.select(
      ctl,
      'L1 data cache size (bytes)',
      [32768, 65536, 131072],
      cache,
      function (v) {
        cache = +v;
        draw();
      }
    );
    U.select(ctl, 'L1 ways', [4, 8, 16], ways, function (v) {
      ways = +v;
      draw();
    });
    var out = h('div', null, sec);
    function draw() {
      out.replaceChildren();
      var rows = [4096, 16384, 65536].map(function (size) {
        var q = M.granule(Object.assign({}, o, { pageBytes: size }));
        return [
          size + ' B',
          q.reach + ' B',
          q.misses + ' / 512',
          q.mappedBytes + ' B',
          cache / ways <= size
            ? 'Yes'
            : 'Needs alias handling'
        ];
      });
      sec._granuleRows = rows;
      U.table(
        out,
        [
          'Page size',
          'TLB reach',
          'Misses / accesses',
          'Memory mapped',
          'L1 indexed by page-offset bits?'
        ],
        rows
      );
      U.text(
        'p',
        out,
        'An L1 can pick its set from page-offset bits alone only if size ÷ ways ≤ page size. Here size ÷ ways = ' +
          cache / ways +
          ' B. Bigger caches are still possible; they need extra hardware to handle aliases.'
      );
    }
    draw();
    U.text(
      'p',
      sec,
      'Real chips show both choices. AMD Zen 5 and Intel’s recent P-cores use a 48 KiB, 12-way L1d: 4 KiB per way, exactly one x86 page. Arm Neoverse V3 uses a 64 KiB, 4-way L1d, 16 KiB per way, and handles the possible aliases in hardware. This lab’s example L1d is 32 KiB and 8-way, also 4 KiB per way.'
    );
    sources(sec, ['granule', 'zen5', 'goldencove', 'v3cache']);
  }
  function compare(root) {
    var sec = section(
      root,
      'compare',
      'Compare two runs',
      'Load two result files from the memory benchmark and compare the matching cases side by side.'
    );
    U.text(
      'p',
      sec,
      'Cases are paired only when the clock, timer, mode, bytes, chains, steps and seed all match. A ratio describes these two runs; on its own it can’t tell you which part of the chip made the difference.'
    );
    var data = [null, null],
      ctl = h('div', { class: 'perf-controls' }, sec),
      status = U.text('p', sec, 'Load two runs to compare.', {
        role: 'status',
        class: 'comparison-status'
      }),
      out = h('div', { class: 'architecture-comparison' }, sec);
    [0, 1].forEach(function (i) {
      var label = h('label', { class: 'perf-field' }, ctl);
      U.text('span', label, 'Native run ' + (i ? 'B' : 'A'));
      var input = h(
        'input',
        {
          type: 'file',
          accept: '.json,application/json',
          'aria-label': 'Architecture run ' + (i ? 'B' : 'A')
        },
        label
      );
      input.onchange = async function () {
        try {
          var file = input.files[0];
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) throw new Error('Maximum file size is 2 MiB.');
          data[i] = App.Performance.validateMeasurement(JSON.parse(await file.text()));
          draw();
        } catch (e) {
          data[i] = null;
          out.replaceChildren();
          status.textContent = 'Could not compare: ' + e.message;
        }
      };
    });
    function draw() {
      out.replaceChildren();
      if (!data[0] || !data[1]) {
        status.textContent = 'One run loaded. Load the other one.';
        return;
      }
      var matched = ['clock', 'timing_boundary', 'useful_byte_boundary'].every(function (k) {
        return typeof data[0].context[k] === 'string' && data[0].context[k] === data[1].context[k];
      });
      if (!matched) {
        sec._comparisonRows = [];
        status.textContent =
          'Can’t compare: the runs used different clocks or timers, or didn’t record them.';
        return;
      }
      var rows = M.compare(data[0], data[1]);
      sec._comparisonRows = rows;
      status.textContent = rows.length
        ? rows.length + ' matching cases.'
        : 'No matching cases. Run both with the same settings.';
      U.table(
        out,
        ['Context', 'Run A', 'Run B'],
        [
          'cpu_model',
          'architecture',
          'kernel',
          'cpu',
          'smt_siblings',
          'clock',
          'timing_boundary',
          'source_sha256',
          'compiler',
          'compile_command',
          'page_size',
          'actual_mapping_page_size',
          'thp',
          'governor',
          'boost',
          'notes',
          'quick'
        ].map(function (k) {
          return [
            k,
            ...data.map(function (d) {
              return d.context[k] === undefined
                ? 'not recorded'
                : typeof d.context[k] === 'object'
                  ? JSON.stringify(d.context[k])
                  : String(d.context[k]);
            })
          ];
        })
      );
      U.table(
        out,
        [
          'Mode / bytes / chains / steps / operations / seed',
          'Trials A / B',
          'Median A ns/op',
          'Median B ns/op',
          'B / A time ratio'
        ],
        rows.map(function (q) {
          return [
            q.key,
            q.trialsA + ' / ' + q.trialsB,
            q.a.toFixed(3),
            q.b.toFixed(3),
            q.ratio.toFixed(3)
          ];
        })
      );
      var same =
        data[0].context.source_sha256 &&
        data[0].context.source_sha256 === data[1].context.source_sha256;
      U.text(
        'p',
        out,
        same
          ? 'Same benchmark source. The compiler, clock speed, pages and memory setup may still differ: check the table above.'
          : 'Different (or unknown) benchmark source, so this compares two programs, not two machines.'
      );
      U.text(
        'p',
        out,
        'Run A: ' +
          (data[0].complete === true ? 'complete' : 'partial or unknown') +
          '. Run B: ' +
          (data[1].complete === true ? 'complete' : 'partial or unknown') +
          '. Quick runs only check that the benchmark works. Report the spread, not just the ratio: clock speed, DIMMs and CPU placement can explain a big difference on their own.'
      );
    }
    U.sources(sec, [['Benchmark protocol (benchmarks/README.md)', 'benchmarks/README.md']]);
  }
  App.extendChapter('stores', ordering);
  App.extendChapter('hier', inclusion);
  App.extendChapter('xlate', granules);
  App.extendChapter('perf', compare);
})();
