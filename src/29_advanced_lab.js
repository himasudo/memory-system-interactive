(function () {
  'use strict';
  var U = App.LabUI,
    h = App.h,
    s = App.s,
    M = AdvancedLab;
  var sources = {
    dma: [
      'Linux 6.8 DMA API guide',
      'https://www.kernel.org/doc/html/v6.8/core-api/dma-api-howto.html'
    ],
    invalidation: [
      'Linux 6.8 IOMMU invalidation policy',
      'https://www.kernel.org/doc/html/v6.8/admin-guide/kernel-parameters.html'
    ],
    uring: [
      'Upstream liburing: io_uring overview',
      'https://kernel.googlesource.com/pub/scm/linux/kernel/git/axboe/liburing/+/refs/heads/master/man/io_uring.7'
    ],
    buffers: [
      'Upstream liburing: registered buffers',
      'https://kernel.googlesource.com/pub/scm/linux/kernel/git/axboe/liburing/+/refs/heads/master/man/io_uring_registered_buffers.7'
    ],
    poll: [
      'Upstream liburing: SQPOLL',
      'https://kernel.googlesource.com/pub/scm/linux/kernel/git/axboe/liburing/+/refs/heads/master/man/io_uring_sqpoll.7'
    ],
    setup: [
      'Upstream liburing: setup flags / IOPOLL',
      'https://kernel.googlesource.com/pub/scm/linux/kernel/git/axboe/liburing/+/refs/heads/master/man/io_uring_setup.2'
    ],
    ddr5: [
      'Micron, DDR5 SDRAM (on-die ECC)',
      'https://www.micron.com/products/memory/dram-components/ddr5-sdram'
    ],
    zen5fe: [
      'AMD, Zen 5 at Hot Chips 2024',
      'https://www.hc2024.hotchips.org/assets/program/conference/day2/24_HC2024.AMD.Cohen.Subramony.final.pdf'
    ],
    redwood: [
      'Chips and Cheese, Intel’s Redwood Cove',
      'https://chipsandcheese.com/p/intels-redwood-cove-baby-steps-are-still-steps'
    ],
    edac: [
      'Linux EDAC capabilities and reporting',
      'https://kernel.org/doc/html/v6.10/driver-api/edac.html'
    ],
    disturbance: [
      'Kim et al., ISCA 2014: DRAM disturbance errors',
      'https://users.ece.cmu.edu/~yoonguk/papers/kim-isca14.pdf'
    ],
    epyc: [
      'AMD: 4th Gen EPYC architecture white paper',
      'https://www.amd.com/content/dam/amd/en/documents/products/epyc/4th-gen-epyc-processor-architecture-white-paper.pdf'
    ],
    xeon: [
      'Intel: Sapphire Rapids / Emerald Rapids DDIO and mesh',
      'https://www.intel.com/content/www/us/en/developer/articles/technical/ddio-analysis-performance-monitoring.html'
    ],
    grace: [
      'NVIDIA: Grace performance tuning guide',
      'https://docs.nvidia.com/dccpu/grace-perf-tuning-guide/index.html'
    ]
  };
  function refs(root, keys) {
    return U.sources(
      root,
      keys.map(function (k) {
        return sources[k] || App.Evidence.sources[k];
      })
    );
  }
  function section(root, id, title, copy) {
    return App.labSection(root, id, title, copy);
  }
  function model(sec, copy) {
    App.CacheUI.teaching(sec, copy);
  }
  function controls(sec, o, fields, run) {
    var ctl = h('div', { class: 'perf-controls' }, sec);
    fields.forEach(function (f) {
      U.select(ctl, f[1], f[2], typeof o[f[0]] === 'boolean' ? +o[f[0]] : o[f[0]], function (v) {
        o[f[0]] = typeof o[f[0]] === 'boolean' ? !!+v : typeof o[f[0]] === 'number' ? +v : v;
        run();
      });
    });
    return ctl;
  }
  function plot(sec, label) {
    var fig = h('figure', { class: 'perf-chart advanced-chart' }, sec),
      svg = s('svg', { viewBox: '0 0 820 220', role: 'img', 'aria-label': label }, fig);
    return svg;
  }
  function points(svg, series, xLabel, yLabel) {
    svg.replaceChildren();
    var maxX = Math.max(
        1,
        ...series.flatMap(function (q) {
          return q.points.map(function (p) {
            return p[0];
          });
        })
      ),
      maxY = Math.max(
        1,
        ...series.flatMap(function (q) {
          return q.points.map(function (p) {
            return p[1];
          });
        })
      );
    var divisions = Math.min(4, Math.max(1, Math.ceil(maxY)));
    for (var i = 0; i <= divisions; i++) {
      var y = 170 - (i * 132) / divisions;
      s('line', { x1: 62, x2: 785, y1: y, y2: y, class: 'perf-grid' }, svg);
      s(
        'text',
        { x: 56, y: y + 4, 'text-anchor': 'end', class: 's' },
        svg,
        ((maxY * i) / divisions).toFixed(maxY < 4 ? 1 : 0)
      );
    }
    for (var i = 0; i <= 4; i++)
      s(
        'text',
        { x: 62 + i * 180, y: 188, 'text-anchor': 'middle', class: 's' },
        svg,
        ((maxX * i) / 4).toFixed(0)
      );
    series.forEach(function (q, k) {
      var coords = q.points.map(function (p) {
        return [62 + (720 * p[0]) / maxX, 170 - (132 * p[1]) / maxY];
      });
      s(
        'polyline',
        {
          points: coords
            .map(function (p) {
              return p.join(',');
            })
            .join(' '),
          fill: 'none',
          stroke: q.color,
          'stroke-width': 2
        },
        svg
      );
      coords.forEach(function (p, i) {
        var c = s('circle', { cx: p[0], cy: p[1], r: 3, fill: q.color }, svg);
        s('title', null, c, q.label + ' · ' + q.points[i][0] + ' → ' + q.points[i][1].toFixed(2));
      });
      s('text', { x: 66 + k * 260, y: 18, fill: q.color, class: 's' }, svg, q.label);
    });
    s('text', { x: 420, y: 212, 'text-anchor': 'middle', class: 's' }, svg, xLabel);
    s('text', { x: 62, y: 33, class: 's' }, svg, yLabel);
  }
  function fetch(root) {
    var sec = section(
      root,
      'fetch',
      'When instructions starve the core',
      'Code lives in memory too. If instructions miss in the instruction TLB or cache, the core waits however hot the data is.'
    );
    model(
      sec,
      'The core fetches a list of code blocks one at a time: translate through the instruction TLB, then read from an optional decoded-op cache or the L1I. An instruction-TLB miss costs four page-table reads; an L1I miss costs one fill delay. No branch prediction or overlap.'
    );
    U.checkpoint(
      sec,
      'All the program’s data stays in cache. Can spreading its code over many pages still make it wait on memory?',
      [
        'Yes: iTLB and instruction-cache misses can starve delivery',
        'No: only data accesses use the memory hierarchy'
      ],
      0,
      'Try the same number of blocks packed together and spread one per page, then turn on the decoded-op cache.'
    );
    var o = {
      blocks: 8,
      spacing: 64,
      bytes: 32,
      passes: 4,
      pattern: 'loop',
      lines: 16,
      itlb: 8,
      opEntries: 0,
      fill: 24,
      walkRead: 8
    };
    controls(
      sec,
      o,
      [
        ['blocks', 'Code blocks', [4, 8, 16, 32, 64]],
        [
          'spacing',
          'Distance between blocks (bytes)',
          [
            [64, '64 B: dense'],
            [4096, '4 KiB: sparse pages'],
            [65536, '64 KiB: sparse pages']
          ]
        ],
        ['bytes', 'Bytes per block', [16, 32, 80]],
        [
          'pattern',
          'Block order',
          [
            ['loop', 'Repeated loop'],
            ['targets', 'Permuted target order']
          ]
        ],
        ['lines', 'L1I lines', [8, 16, 32, 64]],
        ['itlb', 'iTLB entries', [4, 8, 16, 64]],
        ['opEntries', 'Decoded-op cache entries (0 = off)', [0, 4, 16, 64]],
        ['walkRead', 'Clocks per page-table read', [2, 8, 24]]
      ],
      run
    );
    var metrics = h('div', { class: 'perf-metrics' }, sec),
      svg = plot(sec, 'Cumulative instruction delivery time across the supplied block trace'),
      state = h('div', { class: 'cache-state' }, sec),
      r,
      step = App.CacheUI.replayControls(sec, 'Instruction fetch block', function (i) {
        if (!r) return;
        var q = r.trace[i];
        state.replaceChildren();
        U.text(
          'h3',
          state,
          'Block ' +
            i +
            ' · PC 0x' +
            q.addr.toString(16) +
            ' · ' +
            q.start +
            ' → ' +
            q.done +
            ' clocks'
        );
        U.text('p', state, q.events.join(' → '));
        U.table(
          state,
          ['Structure', 'MRU → LRU'],
          [
            ['iTLB pages', q.tlb.join(' / ')],
            ['L1I lines', q.ic.join(' / ') || 'empty'],
            ['Decoded blocks', q.ops.join(' / ') || 'disabled']
          ]
        );
      }, state);
    function run() {
      r = M.fetch(M.instructionTrace(o), o);
      sec._fetchResult = r;
      metrics.replaceChildren();
      U.metric(
        metrics,
        'iTLB misses / walk reads',
        r.stats.itlbMisses + ' / ' + r.stats.walkReads,
        'Page-table reads go through the data caches'
      );
      U.metric(
        metrics,
        'L1I misses / fill traffic',
        r.stats.iMisses + ' / ' + r.stats.fillBytes + ' B',
        'A decoded-op hit skips the L1I'
      );
      U.metric(
        metrics,
        'Decoded-op hits / blocks decoded',
        r.stats.opHits + ' / ' + r.stats.decodeBlocks,
        'Fully associative, LRU'
      );
      U.metric(
        metrics,
        'Waiting for code / total',
        r.stats.starved + ' / ' + r.cycles,
        'Clocks'
      );
      points(
        svg,
        [
          {
            label: 'Blocks delivered over time',
            color: 'var(--a1)',
            points: r.trace.map(function (q) {
              return [q.i + 1, q.done];
            })
          }
        ],
        'Block number',
        'Clocks'
      );
      step.set(r.trace.length);
    }
    run();
    U.text(
      'p',
      sec,
      'Instruction bytes travel PC → iTLB → L1I → L2 → L3 → DRAM. A decoded-op cache can skip fetch and decode for code that ran recently. A correctly predicted branch can still jump to a line that isn’t cached. Inlining and unrolling remove branches but make the code bigger.'
    );
    U.text(
      'p',
      sec,
      'Real front ends differ: AMD Zen 5 has a 32 KiB L1I and an op cache of about 6K instructions; Intel’s Redwood Cove doubled its L1I to 64 KiB. On your machine, compare code size and use perf list to find that CPU’s instruction-cache and iTLB events.'
    );
    refs(sec, ['zen5fe', 'redwood']);
  }
  function prefetch(root) {
    var sec = section(
      root,
      'resources',
      'Prefetching isn’t free',
      'Prefetches share the same miss entries, queues and cache space as real loads. Accuracy, coverage and timeliness measure different things.'
    );
    model(
      sec,
      'Each stream waits for one load at a time. A stride detector that sees the same step twice predicts up to the chosen distance ahead. Prefetches and loads share miss entries, a request queue, the memory link and a small LRU cache. Timings and priorities are made up; no stores or adaptive tuning.'
    );
    U.checkpoint(
      sec,
      'Does a larger prefetch distance always speed up a streaming loop?',
      [
        'No: finite resources and cache eviction can outweigh earlier arrival',
        'Yes: earlier requests have no cost'
      ],
      0,
      'Sweep the distance with the same loads and compare finish time, bytes moved and lines evicted.'
    );
    var o = {
      enabled: true,
      streams: 1,
      count: 40,
      pattern: 'stream',
      distance: 4,
      cacheLines: 12,
      missEntries: 8,
      queue: 8,
      latency: 40,
      busGap: 4,
      returnGap: 2,
      think: 6,
      priority: 'demand'
    };
    controls(
      sec,
      o,
      [
        [
          'enabled',
          'Prefetcher',
          [
            [1, 'On'],
            [0, 'Off']
          ]
        ],
        [
          'pattern',
          'Access pattern',
          [
            ['stream', 'Stream (+1 line)'],
            ['stride', 'Stride (+3 lines)'],
            ['hot', 'Four-line hot cycle'],
            ['chase', 'Pointer chase (unpredictable)']
          ]
        ],
        ['streams', 'Independent streams', [1, 2, 4, 8]],
        ['distance', 'Prefetch distance (lines)', [0, 1, 2, 4, 8, 16, 32]],
        ['cacheLines', 'Cache lines', [4, 8, 12, 32, 64]],
        ['missEntries', 'Miss entries', [2, 4, 8, 16]],
        ['queue', 'Request queue entries', [2, 4, 8, 16]],
        ['busGap', 'Clocks between lines on the link', [2, 4, 8, 16]],
        ['think', 'Work between loads (clocks)', [2, 6, 12, 24]],
        [
          'priority',
          'Request scheduling',
          [
            ['demand', 'Real loads first'],
            ['fifo', 'First come, first served']
          ]
        ]
      ],
      run
    );
    var metrics = h('div', { class: 'perf-metrics' }, sec),
      summary = h('div', null, sec),
      svg = plot(sec, 'Finite miss-entry occupancy over model time'),
      state = h('div', { class: 'cache-state' }, sec),
      comparison = h('div', { class: 'prefetch-sweep' }, sec),
      r,
      pair,
      step = App.CacheUI.replayControls(sec, 'Prefetch resource clock', function (i) {
        if (!r) return;
        var q = r.trace[i];
        state.replaceChildren();
        U.text(
          'h3',
          state,
          'Clock ' + q.t + ' · ' + q.completed + '/' + r.completed + ' demand loads complete'
        );
        U.text(
          'p',
          state,
          'Miss entries ' +
            q.misses.length +
            '/' +
            r.p.missEntries +
            ' · request queue ' +
            q.queued +
            '/' +
            r.p.queue +
            ' · pending predictions ' +
            q.predictions +
            '/' +
            r.p.pfQueue
        );
        U.table(
          state,
          ['Line', 'Request owner', 'Resource state'],
          q.misses.map(function (x) {
            return [x.line, x.kind, x.state];
          })
        );
        U.text(
          'p',
          state,
          'Cache MRU → LRU: ' +
            (q.cache
              .map(function (x) {
                return (
                  x.line +
                  ' ' +
                  (x.kind === 'prefetch' ? (x.used ? 'PF used' : 'PF unused') : 'demand')
                );
              })
              .join(' / ') || 'empty')
        );
      }, state);
    function pct(x) {
      return x === null ? 'n/a' : (x * 100).toFixed(1) + '%';
    }
    function run() {
      pair = M.prefetchCompare(o);
      r = pair.experiment;
      sec._prefetchComparison = pair;
      metrics.replaceChildren();
      summary.replaceChildren();
      comparison.replaceChildren();
      U.metric(
        metrics,
        'Finish: prefetch off / on',
        pair.baseline.cycles + ' / ' + r.cycles,
        'Same loads, in clocks'
      );
      U.metric(
        metrics,
        'Prefetch accuracy',
        pct(r.accuracy),
        r.stats.pfUseful + ' of ' + r.stats.pfIssued + ' prefetches were used'
      );
      U.metric(
        metrics,
        'Coverage',
        pct(pair.coverage),
        pair.eliminated + ' misses turned into hits'
      );
      U.metric(
        metrics,
        'On time / late',
        r.stats.covered + ' / ' + r.stats.late,
        'Late: the load arrived while the prefetch was still in flight'
      );
      U.table(
        summary,
        ['Traffic and resources', 'Value'],
        [
          ['Bytes used / bytes moved', r.usefulBytes + ' / ' + r.stats.busBytes],
          ['Bytes moved for loads / for prefetches', r.stats.demandBytes + ' / ' + r.stats.prefetchBytes],
          ['Prefetches never used / evicted unused', r.unused + ' / ' + r.stats.pfUnusedEvicted],
          ['Useful lines pushed out by prefetches', r.stats.pollutionEvictions],
          ['Hits that became misses', pair.added],
          [
            'Peak miss entries / queue / pending predictions',
            r.stats.peakMiss + ' / ' + r.stats.peakQueue + ' / ' + r.stats.peakPredictions
          ],
          [
            'Clocks with miss entries full / queue full',
            r.stats.missFull + ' / ' + r.stats.requestQueueFull
          ],
          [
            'Load latency p50 / p95 / p99',
            r.latency.p50 + ' / ' + r.latency.p95 + ' / ' + r.latency.p99
          ],
          ['Everything drained after', r.drainCycles + ' clocks']
        ]
      );
      points(
        svg,
        [
          {
            label: 'Miss entries in use',
            color: 'var(--a1)',
            points: r.trace
              .filter(function (_, i) {
                return i % Math.max(1, Math.floor(r.trace.length / 200)) === 0;
              })
              .map(function (q) {
                return [q.t, q.misses.length];
              })
          }
        ],
        'Model clock',
        'Occupancy'
      );
      step.set(r.trace.length);
    }
    run();
    var actions = h('div', { class: 'perf-actions' }, sec);
    U.text('button', actions, 'Sweep prefetch distance', { type: 'button' }).onclick = function () {
      var rows = [0, 1, 2, 4, 8, 16, 32].map(function (distance) {
        var q = M.prefetchCompare(
            Object.assign({}, o, { enabled: true, distance: distance, trace: false })
          ),
          x = q.experiment;
        return [
          distance,
          x.cycles,
          x.stats.busBytes,
          pct(x.accuracy),
          pct(q.coverage),
          x.stats.pollutionEvictions
        ];
      });
      comparison.replaceChildren();
      sec._prefetchSweep = rows;
      U.table(
        comparison,
        ['Distance', 'Demand clocks', 'Line bytes', 'Accuracy', 'Coverage', 'Demand evictions'],
        rows
      );
    };
    U.text(
      'p',
      sec,
      'Accuracy: how many prefetches were used. Coverage: how many misses they removed, compared with a run without prefetching. Timeliness: whether they arrived before the load needed them. A prefetcher can score well on one and still hurt, so the table also counts hits that turned into misses.'
    );
    U.text(
      'p',
      sec,
      'In the pointer chase, the next address is only known when the current load returns, so a stride detector can’t run ahead. Catching that takes a different kind of predictor, or software that knows the structure.'
    );
    prefetchMeasurements(sec);
  }
  function validatePrefetch(data) {
    if (
      !data ||
      data.schema !== 'memory-lab-prefetch-v1' ||
      !data.context ||
      typeof data.context !== 'object' ||
      Array.isArray(data.context) ||
      !Array.isArray(data.samples) ||
      !data.samples.length ||
      data.samples.length > 5000
    )
      throw new Error('Expected memory-lab-prefetch-v1 with context and 1–5000 samples.');
    data.samples.forEach(function (r) {
      [
        'bytes',
        'loads',
        'passes',
        'elapsed_ns',
        'useful_bytes',
        'stride_lines',
        'cpu_before',
        'cpu_after'
      ].forEach(function (k) {
        if (!Number.isSafeInteger(r[k]) || r[k] < (k.startsWith('cpu') ? 0 : 1))
          throw new Error('Invalid ' + k);
      });
      if (
        !Number.isSafeInteger(r.distance) ||
        r.distance < 0 ||
        r.distance > 64 ||
        r.bytes < 4096 ||
        r.bytes > 268435456 ||
        r.bytes & (r.bytes - 1) ||
        r.passes > 64 ||
        r.stride_lines > 63 ||
        !(r.stride_lines % 2) ||
        r.loads !== (r.bytes / 64) * r.passes ||
        String(r.expected_checksum) !==
          String((r.passes * (r.bytes / 64) * (r.bytes / 64 + 1)) / 2) ||
        r.useful_bytes !== r.loads * 8 ||
        r.cpu_before !== r.cpu_after ||
        r.cpu_before !== data.context.cpu ||
        r.verified !== true ||
        String(r.checksum) !== String(r.expected_checksum)
      )
        throw new Error('Invalid prefetch verification or accounting.');
    });
    return data;
  }
  function prefetchMeasurements(sec) {
    var n = U.native(sec, {
        title: 'Software prefetch on your machine',
        what: 'Reads one word from each 64-byte line at a fixed stride while sweeping the software prefetch distance. Your CPU’s hardware prefetchers stay on, so you see both working together.',
        command: 'python3 benchmarks/prefetch.py --output prefetch-results.json',
        label: 'Import native prefetch results',
        aria: 'Native prefetch result JSON',
        empty: 'No native prefetch results loaded.',
        statusClass: 'prefetch-status',
        outClass: 'prefetch-results'
      }),
      input = n.input,
      status = n.status,
      out = n.out;
    function render(data, label) {
      validatePrefetch(data);
      if (label) U.text('h3', out, label, { class: 'measurement-run-title' });
      var groups = {};
      data.samples.forEach(function (r) {
        var key = [r.bytes, r.stride_lines, r.distance, r.loads].join(' / ');
        (groups[key] || (groups[key] = [])).push(r);
      });
      status.textContent =
        'Measured · ' + String(data.context.cpu_model || 'unknown CPU');
      U.table(
        out,
        [
          'Bytes / stride lines / distance / loads',
          'Trials',
          'Median ns/load',
          'p95 of trial averages'
        ],
        Object.keys(groups)
          .sort()
          .map(function (k) {
            var a = groups[k].map(function (r) {
                return r.elapsed_ns / r.loads;
              }),
              q = MeasurementBundle.stats(a);
            return [k, a.length, q.median.toFixed(2), q.p95.toFixed(2)];
          })
      );
      var details = h('details', null, out);
      U.text('summary', details, 'Show the recorded context');
      U.code(details, JSON.stringify(data.context, null, 2));
      U.text(
        'p',
        out,
        'Whole-run averages. They show how distance changes the time per load, not how accurate the hardware prefetcher was.'
      );
    }
    U.importInto(input, out, status, render);
    App.Measurements.bind('prefetch', status, out, render);
  }
  function dma(root) {
    var sec = section(
      root,
      'iotlb',
      'A DMA mapping has a lifetime',
      'A device sees memory through the IOMMU. Mapping, pinning and unmapping have to happen in the right order.'
    );
    model(
      sec,
      'One device, two mapped pages in different physical frames, and a small IOTLB. Here the OS stops DMA, then invalidates synchronously. Real IOMMUs can batch or delay invalidations.'
    );
    U.checkpoint(
      sec,
      'The OS removes an IOMMU page-table entry. Can it reuse that physical page right away, while DMA may still be running or the IOTLB still has the old entry?',
      [
        'No: finish DMA and make invalidation safe first',
        'Yes: editing the table alone stops every access'
      ],
      0,
      'Step through it: stop DMA, remove the entry, wait for the invalidation to finish, then unpin.'
    );
    var trace = M.dmaStory(),
      state = h('div', { class: 'cache-state' }, sec),
      step = App.CacheUI.replayControls(sec, 'DMA mapping event', function (i) {
        var q = trace[i];
        state.replaceChildren();
        U.text('h3', state, 'Event ' + i + ' · ' + q.action);
        U.text('p', state, q.note);
        U.table(
          state,
          ['State', 'Contents'],
          [
            [
              'IOMMU mapping',
              q.mapping
                .map(function (x) {
                  return x.iova + ' → frame ' + x.frame;
                })
                .join(' / ') || 'none'
            ],
            [
              'IOTLB cache',
              q.tlb
                .map(function (x) {
                  return x.iova + ' → frame ' + x.frame;
                })
                .join(' / ') || 'empty'
            ],
            ['Pinned frames', q.pins.join(' / ') || 'none'],
            ['In-flight DMA', q.inflight]
          ]
        );
      }, state);
    sec._dmaStory = trace;
    step.set(trace.length);
    U.table(
      sec,
      ['Term', 'What it means'],
      [
        ['Pinning', 'Keeps a page in place for the whole I/O. It does not by itself let the device touch it.'],
        [
          'DMA mapping',
          'Gives the device an address it can use. A CPU virtual address is not a DMA address.'
        ],
        [
          'Scatter-gather',
          'One I/O spread over several memory pieces. The kernel may merge them when it maps them.'
        ],
        ['IOTLB', 'The IOMMU’s cache of translations, separate from the CPU’s TLBs.'],
        [
          'Coherent DMA',
          'Caches stay consistent, but the driver still has to order its writes to descriptors and data.'
        ]
      ]
    );
    U.text(
      'p',
      sec,
      'The IOMMU itself is vendor-specific: AMD-Vi on AMD, VT-d on Intel, and the SMMU on Arm. The next lab adds IOTLB reuse and completion queues.'
    );
    refs(sec, ['dma', 'invalidation']);
  }
  function io(root) {
    var sec = section(
      root,
      'queues',
      'Queue depth and completions',
      'How quickly the program learns that I/O finished decides how quickly it can reuse its buffers and send more.'
    );
    model(
      sec,
      '4 KiB requests flow through a limited number of in-flight slots and a completion queue. The device serves several at once and returns data over one DMA link. Each request looks up its IOTLB entry once. One CPU submits, handles interrupts or polls. A sketch of the queues, not NVMe or io_uring timing.'
    );
    U.checkpoint(
      sec,
      'If completion interrupts are delayed to cut the interrupt count, can throughput fall even though the device is just as fast?',
      [
        'Yes: completed requests can hold the outstanding window full',
        'No: completion handling is outside the throughput path'
      ],
      0,
      'Lower the queue depth, raise the moderation delay, and compare when the device finished with when the program noticed.'
    );
    var o = {
      count: 48,
      qd: 8,
      deviceSlots: 4,
      cq: 8,
      batch: 4,
      pages: 8,
      iotlb: 4,
      mode: 'irq',
      moderation: 8,
      poll: 4,
      remote: false,
      reuse: true
    };
    controls(
      sec,
      o,
      [
        ['qd', 'Requests in flight (queue depth)', [1, 2, 4, 8, 16, 32]],
        ['deviceSlots', 'Requests the device serves at once', [1, 2, 4, 8]],
        ['cq', 'Completion queue entries', [1, 2, 4, 8, 16]],
        ['batch', 'Batch size (submit and complete)', [1, 2, 4, 8]],
        ['pages', 'Buffer pages reused', [1, 4, 8, 16]],
        ['iotlb', 'IOTLB entries', [1, 4, 8, 16]],
        [
          'reuse',
          'Buffers',
          [
            [1, 'Reuse a mapped pool'],
            [0, 'Map a fresh page per request']
          ]
        ],
        [
          'mode',
          'Completion delivery',
          [
            ['irq', 'Interrupt + moderation'],
            ['poll', 'Periodic polling']
          ]
        ],
        ['moderation', 'Interrupt delay (clocks)', [1, 8, 24, 64]],
        ['poll', 'Polling interval (clocks)', [1, 4, 16]],
        [
          'remote',
          'Buffer memory',
          [
            [0, 'Same node as the device'],
            [1, 'Other node (over a remote link)']
          ]
        ]
      ],
      run
    );
    var metrics = h('div', { class: 'perf-metrics' }, sec),
      summary = h('div', null, sec),
      state = h('div', { class: 'cache-state' }, sec),
      svg = plot(sec, 'Completion queue occupancy over I/O model time'),
      r,
      step = App.CacheUI.replayControls(sec, 'I/O queue clock', function (i) {
        if (!r) return;
        var q = r.trace[i];
        state.replaceChildren();
        U.text('h3', state, 'Clock ' + q.t + ' · submitted ' + q.submitted + ' · reaped ' + q.seen);
        U.table(
          state,
          ['Finite structure', 'Request IDs / translation pages'],
          [
            ['Outstanding ' + q.active.length + '/' + o.qd, q.active.join(' / ') || 'empty'],
            ['CQ ' + q.cq.length + '/' + o.cq, q.cq.join(' / ') || 'empty'],
            ['IOTLB MRU → LRU', q.tlb.join(' / ') || 'empty'],
            ['Pending interrupt deadline', q.irqDue === null ? 'none' : q.irqDue]
          ]
        );
      }, state);
    function run() {
      r = M.io(o);
      sec._ioResult = r;
      metrics.replaceChildren();
      summary.replaceChildren();
      U.metric(
        metrics,
        'Finished after',
        r.cycles + ' clocks',
        r.p.count + ' × 4 KiB; ' + r.bandwidth.toFixed(1) + ' bytes/clock'
      );
      U.metric(
        metrics,
        'IOTLB hits / misses',
        r.stats.iotlbHits + ' / ' + r.stats.iotlbMisses,
        'One lookup per request'
      );
      U.metric(
        metrics,
        'Interrupts / poll checks',
        r.stats.interrupts + ' / ' + r.stats.polls,
        'Even empty polls cost CPU time'
      );
      U.metric(
        metrics,
        'Completion queue full',
        String(r.stats.cqBlocked),
        'Request-clocks a finished request waited for room'
      );
      U.table(
        summary,
        ['Timing and resources', 'Value'],
        [
          ['Device finished, p50 / p95', r.deviceLatency.p50 + ' / ' + r.deviceLatency.p95],
          [
            'Program noticed, p50 / p95 / p99',
            r.latency.p50 + ' / ' + r.latency.p95 + ' / ' + r.latency.p99
          ],
          ['Gap between the two, p95', r.completionDelay.p95],
          ['CPU busy (clocks)', r.stats.cpuBusy],
          [
            'Doorbells / peak outstanding / peak CQ',
            r.stats.doorbells + ' / ' + r.stats.peakActive + ' / ' + r.stats.peakCQ
          ],
          ['DMA bytes / bytes over the remote link', r.stats.dmaBytes + ' / ' + r.stats.remoteBytes]
        ]
      );
      points(
        svg,
        [
          {
            label: 'CQ entries',
            color: 'var(--a3)',
            points: r.trace
              .filter(function (_, i) {
                return i % Math.max(1, Math.floor(r.trace.length / 160)) === 0;
              })
              .map(function (q) {
                return [q.t, q.cq.length];
              })
          }
        ],
        'Model clock',
        'CQ occupancy'
      );
      step.set(r.trace.length);
    }
    run();
    U.text(
      'p',
      sec,
      'A request whose completion can’t enter a full completion queue still holds its in-flight slot. The program’s queue depth is separate from the NVMe queue size and the io_uring ring size. A remote buffer here simply doubles the DMA time.'
    );
    U.text(
      'p',
      sec,
      'On real storage, sweep queue depth and batch size at a fixed request size and record both IOPS and latency, plus where interrupts land. Reads served from the page cache never reach the device at all.'
    );
    refs(sec, ['dma', 'uring']);
  }
  function uring(root) {
    var sec = section(
      root,
      'uring',
      'io_uring and NVMe are different queues',
      'Follow one read from the program’s io_uring queue, through the kernel and the NVMe queue, and back.'
    );
    var o = { path: 'direct', registered: true, sqpoll: false, iopoll: false };
    controls(
      sec,
      o,
      [
        [
          'path',
          'File read path',
          [
            ['direct', 'O_DIRECT (bypasses the page cache)'],
            ['hit', 'Buffered, page-cache hit'],
            ['miss', 'Buffered, page-cache miss']
          ]
        ],
        [
          'registered',
          'Buffer',
          [
            [1, 'Registered (fixed) buffer'],
            [0, 'Ordinary buffer']
          ]
        ],
        [
          'sqpoll',
          'Submission',
          [
            [0, 'io_uring_enter system call'],
            [1, 'SQPOLL kernel thread']
          ]
        ],
        [
          'iopoll',
          'Completion',
          [
            [0, 'Device interrupts'],
            [1, 'IOPOLL (direct I/O only)']
          ]
        ]
      ],
      run
    );
    var status = U.text('p', sec, '', { role: 'status' }),
      state = h('div', { class: 'cache-state' }, sec),
      list = [],
      step = App.CacheUI.replayControls(sec, 'io_uring path event', function (i) {
        if (!list.length) return;
        state.replaceChildren();
        U.text('h3', state, i + 1 + ' / ' + list.length + ' · ' + list[i][0]);
        U.text('p', state, list[i][1]);
      }, state);
    function run() {
      if (o.iopoll && o.path !== 'direct') {
        list = [
          [
            'Unsupported combination',
            'IOPOLL only works with direct I/O. Pick O_DIRECT, or switch completion back to interrupts.'
          ]
        ];
        sec._uringPath = list;
        status.textContent =
          'Unsupported configuration: IOPOLL needs direct I/O.';
        step.set(list.length);
        return;
      }
      list = [
        [
          'Program writes a request',
          'The program fills an io_uring submission entry (SQE) and moves the queue tail. This is a request to the kernel, not an NVMe command.'
        ],
        [
          o.sqpoll ? 'Kernel submission polling' : 'Enter the kernel',
          o.sqpoll
            ? 'A kernel thread watches the queue and picks up new entries without a system call. If it has gone to sleep, one call wakes it.'
            : 'One io_uring_enter system call submits a whole batch.'
        ],
        [
          'Find the file and buffer',
          o.registered
            ? 'A registered buffer stays pinned, so the kernel skips pinning it on every request. The device still needs a DMA mapping.'
            : 'Direct I/O pins the buffer for this request; buffered I/O goes through the page cache.'
        ]
      ];
      if (o.path === 'hit')
        list.push([
          'Copy from the page cache',
          'The data is already in memory, so the kernel copies it into the buffer. No NVMe command, no DMA.'
        ]);
      else {
        if (o.path === 'miss')
          list.push([
            'Fill the page cache',
            'The filesystem reads the missing pages from storage. DMA writes into page-cache pages, and the program’s data is copied from there later.'
          ]);
        list.push(
          [
            'Block layer → NVMe queue',
            'The driver describes the buffer (PRP or SGL lists), maps it for DMA, writes an NVMe command into the device’s submission queue and rings its doorbell.'
          ],
          [
            'Device does DMA',
            'The SSD reads the command and transfers the data to the DMA addresses, through the IOMMU.'
          ],
          [
            o.iopoll ? 'Kernel polls for completion' : 'Device completion + interrupt',
            'The SSD writes an entry to its completion queue. ' +
              (o.iopoll
                ? 'With IOPOLL the kernel polls for it instead of waiting for an interrupt.'
                : 'An MSI-X interrupt tells the driver; batching and which CPU takes it change the latency.')
          ]
        );
        if (o.path === 'miss')
          list.push([
            'Copy to the buffer',
            'The kernel copies the bytes from the page cache into the program’s buffer. A registered buffer doesn’t change this into DMA.'
          ]);
      }
      list.push([
        'Program sees the result',
        'The kernel posts a completion entry (CQE). The program reads it and only then reuses the buffer.'
      ]);
      sec._uringPath = list;
      status.textContent =
        o.iopoll && o.path !== 'direct'
          ? 'IOPOLL only works with direct I/O.'
          : 'One read path. io_uring also runs many operations that never reach a device.';
      step.set(list.length);
    }
    run();
    U.table(
      sec,
      ['Common question', 'Short answer'],
      [
        ['Is io_uring zero-copy?', 'Only for some operations and paths. The shared rings alone don’t make file data zero-copy.'],
        ['Are registered buffers pinned?', 'Yes, for as long as they stay registered. Pinning is still separate from DMA mapping.'],
        [
          'Which queue depth matters?',
          'Several: the program’s in-flight count, the io_uring ring, the block layer and the NVMe queues each have their own limit.'
        ],
        [
          'Which polling?',
          'SQPOLL picks up submissions; IOPOLL picks up device completions; the program can also spin on the completion ring. Each costs CPU differently.'
        ],
        [
          'Does the CPU matter?',
          'The submitting CPU, the interrupt CPU, the device’s NUMA node and the buffer’s node can all differ. Record them before crediting a speedup.'
        ]
      ]
    );
    h(
      'p',
      null,
      sec,
      '<a href="benchmarks/advanced/README.md">How to run a controlled io_uring experiment</a>'
    );
    refs(sec, ['uring', 'buffers', 'poll', 'setup', 'dma']);
  }
  function multisocket(root) {
    var sec = section(
      root,
      'multisocket',
      'Two sockets: who initializes the memory matters',
      'If one thread touches all the memory first, every page lands on its socket, and the other socket’s threads queue on one remote link.'
    );
    model(
      sec,
      'Two sockets, one memory node each, and one link per direction between them. Threads start on alternating sockets, keep a few reads in flight, and can move to the other socket without their pages moving. No caches or coherence; all timings are made up.'
    );
    U.checkpoint(
      sec,
      'One thread initialized every page, all on socket 0. Half the workers run on socket 1. Does doubling the cores double the bandwidth?',
      [
        'No: node-0 service and remote links can saturate',
        'Yes: every core has independent memory bandwidth'
      ],
      0,
      'Compare “each worker touches its own pages” with “one thread touches everything”, then move the threads.'
    );
    var o = {
      threads: 4,
      count: 32,
      placement: 'first',
      first: 0,
      migrate: false,
      mlp: 4,
      linkGap: 8
    };
    controls(
      sec,
      o,
      [
        ['threads', 'Worker threads', [2, 4, 8]],
        [
          'placement',
          'Who touches the pages first',
          [
            ['first', 'One thread, all on one node'],
            ['parallel', 'Each worker, its own pages'],
            ['interleave', 'Interleaved across both nodes']
          ]
        ],
        ['first', 'Node for “one thread”', [0, 1]],
        [
          'migrate',
          'Threads',
          [
            [0, 'Stay where they started'],
            [1, 'Move to the other socket']
          ]
        ],
        ['mlp', 'Reads in flight per worker', [1, 2, 4, 8]],
        ['linkGap', 'Clocks per line on the remote link', [2, 4, 8, 16]]
      ],
      run
    );
    var metrics = h('div', { class: 'perf-metrics' }, sec),
      out = h('div', null, sec),
      r;
    function run() {
      r = M.numa(o);
      sec._multisocketResult = r;
      metrics.replaceChildren();
      out.replaceChildren();
      U.metric(
        metrics,
        'Local / remote requests',
        r.stats.local + ' / ' + r.stats.remote,
        'Pages don’t move when threads do'
      );
      U.metric(
        metrics,
        'Node 0 / node 1 bytes',
        r.stats.nodeBytes.join(' / '),
        'Bytes read from each node'
      );
      U.metric(
        metrics,
        'Remote link bytes',
        String(r.stats.linkBytes),
        'Data only, no protocol overhead'
      );
      U.metric(
        metrics,
        'Finished after / bandwidth',
        r.cycles + ' / ' + r.bandwidth.toFixed(2),
        'Clocks / bytes per clock'
      );
      U.table(
        out,
        ['Worker / socket', 'Local / remote reads', 'Average latency', 'Longest link wait'],
        Array.from({ length: o.threads }, function (_, i) {
          var a = r.requests.filter(function (x) {
            return x.thread === i;
          });
          return [
            i + ' / ' + a[0].cpu,
            a.filter(function (x) {
              return !x.remote;
            }).length +
              ' / ' +
              a.filter(function (x) {
                return x.remote;
              }).length,
            M.quantiles(
              a.map(function (x) {
                return x.done - x.arrival;
              })
            ).mean.toFixed(1),
            Math.max(
              ...a.map(function (x) {
                return x.linkWait;
              })
            )
          ];
        })
      );
    }
    run();
    U.text('h3', sec, 'Try it on a two-socket machine');
    U.code(
      sec,
      'lscpu -e=CPU,CORE,SOCKET,NODE\nnumactl --hardware\n# Run the memory benchmark with its memory on one node, then the other:\nnumactl --physcpubind=CPU_LIST --membind=NODE python3 benchmarks/run.py --cpu CPU --output local.json\n# Check where the pages really went: /proc/PID/numa_maps or numastat -p PID'
    );
    U.text(
      'p',
      sec,
      'A placement request can fail or be overridden, and Linux’s automatic NUMA balancing may move pages, so check where they actually are. Between sockets, AMD uses Infinity Fabric, Intel uses UPI, and Arm servers use whatever link the chip vendor chose.'
    );
    refs(sec, ['epyc', 'grace']);
  }
  function reliability(root) {
    var sec = section(
      root,
      'ecc',
      'ECC: detect two, fix one',
      'A parity bit detects an odd number of flipped bits. An error-correcting code adds enough check bits to find which bit flipped.'
    );
    U.text(
      'p',
      sec,
      'This is Hamming(8,4): four data bits, three parity bits that locate a flipped bit, and one overall parity bit. It corrects any single flip and detects any double flip (SECDED). Real ECC memory uses much wider words and stronger codes, but the idea is the same.'
    );
    U.checkpoint(
      sec,
      'Two bits flip in one word. Should the decoder use the syndrome to “fix” one of them?',
      [
        'No: report a detected uncorrectable error',
        'Yes: the syndrome always identifies a faulty bit'
      ],
      0,
      'The overall parity bit tells one flip from two. With three or more flips, the code can be fooled.'
    );
    var payload = 9,
      flips = [],
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(
      ctl,
      'Data bits',
      Array.from({ length: 16 }, function (_, i) {
        return [i, i.toString(2).padStart(4, '0')];
      }),
      payload,
      function (v) {
        payload = +v;
        run();
      }
    );
    var actions = h('div', { class: 'perf-actions' }, sec);
    [
      ['No flips', []],
      ['One data-bit flip', [3]],
      ['Two flips', [3, 5]],
      ['Three-flip limitation', [1, 2, 3]]
    ].forEach(function (x) {
      U.text('button', actions, x[0], { type: 'button' }).onclick = function () {
        flips = x[1].slice();
        run();
      };
    });
    var bits = h('div', { class: 'ecc-bits' }, sec),
      checks = [];
    for (var i = 1; i <= 8; i++) {
      var label = h('label', null, bits),
        input = h('input', { type: 'checkbox', 'aria-label': 'Flip ECC bit ' + i }, label);
      U.text(
        'span',
        label,
        'Bit ' +
          i +
          (i === 8 ? ' · overall' : i === 1 || i === 2 || i === 4 ? ' · parity' : ' · data')
      );
      checks.push(input);
      input.onchange = (function (n) {
        return function () {
          flips = checks.flatMap(function (c, k) {
            return c.checked ? [k + 1] : [];
          });
          run();
        };
      })(i);
    }
    var out = h('div', { class: 'cache-state' }, sec);
    function run() {
      checks.forEach(function (c, k) {
        c.checked = flips.indexOf(k + 1) >= 0;
      });
      var r = M.ecc(payload, flips);
      sec._eccResult = r;
      out.replaceChildren();
      U.text('h3', out, r.status);
      U.table(
        out,
        ['Stage', 'Bits 1 → 8'],
        [
          ['Encoded', r.encoded.join(' ')],
          ['Received', r.received.join(' ')],
          ['Decoder output', r.correctedBits.join(' ')]
        ]
      );
      U.text(
        'p',
        out,
        'Syndrome ' +
          r.syndrome +
          ' · overall parity ' +
          r.overall +
          ' · correction position ' +
          (r.corrected || 'none') +
          ' · decoded payload ' +
          r.decoded.toString(2).padStart(4, '0')
      );
      U.text(
        'p',
        out,
        r.guaranteed
          ? 'Within the guarantee: zero or one flip is corrected, two are detected. A detected double error is not repaired data.'
          : 'Beyond the guarantee: the decoder may “correct” the wrong bit or see nothing wrong. Only this page knows how many bits you flipped; a real decoder can’t tell.'
      );
    }
    run();
    U.text(
      'p',
      sec,
      'System ECC needs support from the CPU’s memory controller, the board, the firmware and the DIMMs. DDR5’s on-die ECC protects data inside each chip only; it is not the same thing. On Linux, EDAC reports corrected and uncorrected errors when the platform supports it.'
    );
    refs(sec, ['edac', 'ddr5', 'disturbance']);
    var rh = section(
      root,
      'disturbance',
      'Rowhammer: it’s the row openings',
      'Reading an open row again and again is harmless. Opening and closing it again and again can flip bits in the rows next to it.'
    );
    U.badge(rh, 'Peer-reviewed');
    U.text(
      'p',
      rh,
      'Every ACT and PRE toggles the row’s wordline, which can leak charge from cells in physically nearby rows. Reads from a row that is already open don’t toggle it. How many activations it takes, and which rows are neighbors, depends on the DRAM; the lab shows only the command pattern.'
    );
    var pattern = 'hits',
      control = h('div', { class: 'perf-controls' }, rh);
    U.select(
      control,
      'Command pattern',
      [
        ['hits', 'One ACT, repeated row hits'],
        ['reopen', 'Repeated ACT / PRE'],
        ['target', 'ACT / PRE, with neighbors refreshed']
      ],
      pattern,
      function (v) {
        pattern = v;
        draw();
      }
    );
    var state = h('div', { class: 'cache-state' }, rh),
      commands = [],
      step = App.CacheUI.replayControls(rh, 'Disturbance command', function (i) {
        if (!commands.length) return;
        var done = commands.slice(0, i + 1),
          act = done.filter(function (c) {
            return c === 'ACT aggressor';
          }).length;
        state.replaceChildren();
        U.text('h3', state, 'Command ' + i + ' · ' + commands[i]);
        U.text(
          'p',
          state,
          'ACT count in this supplied sequence: ' +
            act +
            '. This is only an activation count, not a prediction of bit flips.'
        );
        U.table(
          state,
          ['Row', 'What happens'],
          [
            ['Hammered row', 'Its wordline toggles on every ACT; reads to the open row don’t toggle it.'],
            ['Nearby rows', 'Can lose charge from the toggling. Which rows are physically nearby is not public.'],
            [
              'Refresh',
              'Restores the charge. Extra refreshes of the neighbors are one defense; each one costs bandwidth.'
            ]
          ]
        );
      }, state);
    function draw() {
      commands =
        pattern === 'hits'
          ? ['ACT aggressor', 'RD', 'RD', 'RD', 'RD', 'RD', 'RD', 'PRE aggressor']
          : Array.from({ length: 4 }, function () {
              return pattern === 'target'
                ? ['ACT aggressor', 'RD', 'PRE aggressor', 'refresh neighbors']
                : ['ACT aggressor', 'RD', 'PRE aggressor'];
            }).flat();
      rh._disturbanceCommands = commands;
      step.set(commands.length);
    }
    draw();
    U.text(
      'p',
      rh,
      'Defenses include refreshing neighbors, counting activations per row, throttling and stronger ECC. Each one costs some bandwidth or adds latency spikes. The lab explains the mechanism only and never hammers real memory.'
    );
    refs(rh, ['disturbance', 'edac']);
  }
  function refresh(root) {
    var sec = section(
      root,
      'refresh-tails',
      'Refresh makes a few requests very slow',
      'The same 128 requests run through the controller above, once with refresh off and once with it on.'
    );
    model(
      sec,
      'The controller from the first lab, with identical requests and timing. Only the refresh interval and refresh time change. Times are controller clocks.'
    );
    U.checkpoint(
      sec,
      'Can refresh raise the p99 latency much more than the median?',
      [
        'Yes: arrival position and queueing can concentrate delay in a subset',
        'No: each access gets the same refresh surcharge'
      ],
      0,
      'Requests that arrive during a refresh, or queue behind it, take most of the delay. Look at the per-request curve.'
    );
    var o = { REFI: 128, RFC: 24, spacing: 8, pattern: 'locality' };
    controls(
      sec,
      o,
      [
        ['REFI', 'Refresh every (clocks)', [64, 128, 256]],
        ['RFC', 'Refresh takes (clocks)', [12, 24, 40]],
        ['spacing', 'Clocks between arrivals', [4, 8, 16, 32]],
        [
          'pattern',
          'Row pattern',
          [
            ['locality', 'Runs in one row'],
            ['stream', 'New rows across banks'],
            ['conflict', 'Alternating rows in one bank']
          ]
        ]
      ],
      run
    );
    var out = h('div', null, sec),
      svg = plot(sec, 'Per-request latency with refresh enabled and disabled');
    function run() {
      var work = ControllerLab.workload({
          count: 128,
          spacing: o.spacing,
          pattern: o.pattern,
          writes: 0
        }),
        a = ControllerLab.simulate(work, { trace: false }),
        b = ControllerLab.simulate(work, { trace: false, REFI: o.REFI, RFC: o.RFC });
      sec._refreshComparison = { baseline: a, experiment: b };
      out.replaceChildren();
      U.table(
        out,
        ['Same trace', 'p50', 'p95', 'p99', 'Max', 'REF commands', 'Finish'],
        [
          ['Refresh off', a.latency.p50, a.latency.p95, a.latency.p99, a.latency.max, 0, a.cycles],
          [
            'Refresh on',
            b.latency.p50,
            b.latency.p95,
            b.latency.p99,
            b.latency.max,
            b.stats.refreshes,
            b.cycles
          ]
        ]
      );
      points(
        svg,
        [
          {
            label: 'Refresh off',
            color: 'var(--a1)',
            points: a.requests.map(function (r) {
              return [r.order, r.latency];
            })
          },
          {
            label: 'Refresh on',
            color: 'var(--bad)',
            points: b.requests.map(function (r) {
              return [r.order, r.latency];
            })
          }
        ],
        'Request, in arrival order',
        'Latency (clocks)'
      );
      U.text(
        'p',
        out,
        'Refresh commands at clocks: ' +
          b.commands
            .filter(function (c) {
              return c.name === 'REF';
            })
            .map(function (c) {
              return c.t;
            })
            .join(' / ')
      );
    }
    run();
    U.text(
      'p',
      sec,
      'These percentiles are over single requests. The loaded-latency benchmark reports whole-run averages, which can’t show a single slow load, and on real hardware page faults and scheduling cause slow outliers too.'
    );
    h(
      'p',
      null,
      sec,
      '<a href="#dram/controller">Back to the controller’s commands and timing rules</a>'
    );
  }

  App.extendChapter('code', fetch);
  App.extendChapter('pref', prefetch);
  App.extendChapter('dev', function (root) {
    dma(root);
    io(root);
    uring(root);
  });
  App.extendChapter('hier', multisocket);
  App.extendChapter('dram', function (root) {
    refresh(root);
    reliability(root);
  });
  App.AdvancedUI = { validatePrefetch: validatePrefetch };
  [
    [
      'itlb',
      'instruction TLB',
      'Caches translations for instruction fetch; data-side page-table accesses can still occur on a miss.'
    ],
    [
      'op_cache',
      'decoded-operation cache',
      'Stores decoded operations for instruction regions under implementation-specific rules; a hit can bypass byte decode.'
    ],
    [
      'iotlb',
      'I/O translation cache',
      'Caches IOMMU translations from device-visible IOVA pages to physical pages in a DMA domain.'
    ],
    [
      'pin_pages',
      'pinned pages',
      'Physical pages retained for an I/O lifetime; pinning alone is not a DMA mapping or synchronization protocol.'
    ],
    [
      'secded',
      'SECDED',
      'Single-error correction and double-error detection within a stated codeword and fault model. Larger errors exceed that guarantee.'
    ]
  ].forEach(function (x) {
    if (!App.G[x[0]]) App.gloss(x[0], x[1], x[2]);
  });
})();
