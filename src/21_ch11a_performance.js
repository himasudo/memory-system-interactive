/* Performance foundations and the shared experiment embedded in End to End. */
(function () {
  'use strict';
  var h = App.h,
    s = App.s,
    g = App.g,
    uid = 0;
  var SOURCES = {
    stat: [
      'Linux perf stat (upstream documentation)',
      'https://kernel.googlesource.com/pub/scm/linux/kernel/git/stable/linux-stable/+/master/tools/perf/Documentation/perf-stat.txt'
    ],
    ibs: [
      'Linux AMD IBS documentation',
      'https://android.googlesource.com/kernel/common/+/0e674132ddfa938cd53ba7c3706f0d83b2a91491/tools/perf/Documentation/perf-amd-ibs.txt'
    ],
    amd: [
      'Historical AMD Family 17h optimization guide, 55723',
      'https://docs.amd.com/v/u/en-US/55723_3.01'
    ],
    bench: ['Runnable Linux benchmarks and protocol', 'benchmarks/README.md']
  };
  function text(tag, parent, str, attrs) {
    var el = h(tag, attrs || null, parent);
    el.textContent = str;
    return el;
  }
  function link(parent, key) {
    var q = SOURCES[key];
    return text('a', parent, q[0], { href: q[1], target: '_blank', rel: 'noopener' });
  }
  function badge(parent, label) {
    return text('span', parent, label, { class: 'evidence-label' });
  }
  function code(parent, str) {
    return text('pre', parent, str, { class: 'p-code no-autolink' });
  }
  function select(parent, label, values, value, change) {
    var id = 'perf-control-' + ++uid,
      lab = h('label', { class: 'perf-field', for: id }, parent);
    text('span', lab, label);
    var el = h('select', { id: id, 'data-field': label }, lab);
    values.forEach(function (v) {
      text('option', el, Array.isArray(v) ? v[1] : String(v), {
        value: Array.isArray(v) ? v[0] : v
      });
    });
    el.value = String(value);
    el.onchange = function () {
      change(el.value);
    };
    return el;
  }
  function metric(parent, label, value, detail) {
    var d = h('div', { class: 'perf-metric' }, parent);
    text('span', d, label);
    text('strong', d, value);
    text('small', d, detail);
  }
  function table(parent, heads, rows) {
    var wrap = h('div', { class: 'perf-table-wrap' }, parent),
      t = h('table', { class: 'p-table' }, wrap);
    var head = h('tr', null, h('thead', null, t));
    heads.forEach(function (x) {
      text('th', head, x, { scope: 'col' });
    });
    var body = h('tbody', null, t);
    rows.forEach(function (row) {
      var tr = h('tr', null, body);
      row.forEach(function (x) {
        text('td', tr, String(x));
      });
    });
    return wrap;
  }
  function checkpoint(parent, prompt, choices, correct, explanation) {
    var box = h('div', { class: 'prediction' }, parent);
    text('h3', box, 'Predict before running');
    text('p', box, prompt);
    var result = text('p', box, 'Choose a prediction, then compare it with the experiment.', {
      class: 'note',
      'aria-live': 'polite'
    });
    var choicesEl = h('div', { class: 'perf-actions' }, box);
    choices.forEach(function (c, i) {
      var b = text('button', choicesEl, c, { type: 'button', 'aria-pressed': 'false' });
      b.onclick = function () {
        choicesEl.querySelectorAll('button').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
        result.textContent =
          (i === correct ? 'That matches this model. ' : 'Test that prediction. ') + explanation;
      };
    });
  }
  function evidence(parent) {
    var e = h('div', { class: 'evidence-contract' }, parent);
    badge(e, 'Mechanisms and scoped evidence');
    text(
      'p',
      e,
      'Synthetic addresses and chosen finite-resource models expose mechanisms. Documentation, external observations and your native measurements retain their own scope; none is a universal processor calibration.'
    );
    table(
      e,
      ['Evidence category', 'What it means here'],
      App.Evidence.claims.slice(0, 7).map(function (q) {
        return [q.kind, q.scope];
      })
    );
    text('a', e, 'Modern implementations and published measurement methods →', {
      href: '#map/reference'
    });
  }
  function vocabulary(parent) {
    table(
      parent,
      ['Quantity', 'Definition / denominator', 'Interpretation'],
      [
        [
          'Latency',
          'Time from a named start event to a named end event',
          'Always name both boundaries. A load-to-use interval is not a retirement interval.'
        ],
        [
          'Throughput',
          'Completed useful operations / elapsed time',
          'Independent operations can overlap while each stays slow.'
        ],
        [
          'Bandwidth',
          'Bytes / elapsed time (GB/s = 10⁹ B/s)',
          'Useful bytes, cache-line bytes and DRAM-bus bytes are different accounting boundaries.'
        ],
        [
          'IPC / CPI',
          'Retired architectural instructions / core cycles; inverse',
          'Do not substitute µops, fused groups, TSC ticks, wall time, or another thread’s counters.'
        ],
        [
          'Miss rate / MPKI',
          'Misses / accesses; 1000 × misses / retired instructions',
          'Specify cache level and instruction/data, demand/prefetch and measurement scope.'
        ],
        [
          'Occupancy / utilization',
          'Average entries in use; fraction of time a service resource is busy',
          'A full queue and a busy execution resource are different observations.'
        ],
        [
          'p50 / p95 / p99',
          'Nearest-rank quantiles of the stated population',
          'A p99 of repeated whole-run averages is not a p99 of individual loads.'
        ],
        [
          'Service / queue time',
          'Time being served / time waiting for a resource',
          'Observed latency also includes transport, dependency readiness and retirement waiting when those lie inside its boundaries.'
        ]
      ]
    );
  }
  function littleLaw(parent) {
    text(
      'p',
      parent,
      'For a stable system and a consistent boundary, average outstanding requests N = completion rate λ × average residence time W. This is Little’s law. It relates averages, not peak queue capacity.'
    );
    var controls = h('div', { class: 'perf-controls' }, parent),
      bw = 20,
      ns = 80,
      line = 64;
    select(controls, 'Target line bandwidth (GB/s)', [5, 10, 20, 40], bw, function (v) {
      bw = +v;
      draw();
    });
    select(controls, 'Average load residence (ns)', [40, 80, 120, 200], ns, function (v) {
      ns = +v;
      draw();
    });
    var result = h('div', { class: 'perf-metrics', 'aria-live': 'polite' }, parent);
    function draw() {
      result.replaceChildren();
      metric(
        result,
        'Required concurrency',
        ((bw * ns) / line).toFixed(1) + ' lines',
        'N = GB/s × ns / bytes per line'
      );
      metric(
        result,
        'One dependent chain',
        (line / ns).toFixed(2) + ' GB/s',
        '64-byte line traffic; only 8 B may be useful'
      );
      metric(
        result,
        'Useful pointer data',
        (8 / ns).toFixed(2) + ' GB/s',
        'One 8-byte pointer per returned line'
      );
    }
    draw();
    text(
      'p',
      parent,
      'At 20 GB/s and 80 ns, about 25 lines must be outstanding on average. More MSHRs alone do not provide that concurrency: the program must expose independent addresses, and downstream resources must accept the traffic. Finite-run fill/drain effects also change measured throughput.'
    );
    checkpoint(
      parent,
      'If 16 independent loads each take 80 ns, must their aggregate bandwidth equal one pointer chain’s bandwidth?',
      [
        'Yes: latency fixes bandwidth',
        'No: independent loads can overlap',
        'They always run exactly 16× faster'
      ],
      1,
      'Overlap can raise bandwidth; queue capacity and shared service limit the gain.'
    );
  }
  function streamLab(parent) {
    var root = h('div', { class: 'stream-lab' }, parent);
    badge(root, 'Teaching approximation · all demand loads miss');
    text(
      'p',
      root,
      'Each loop body has one 8-byte load to a distinct 64-byte line plus three abstract non-memory instructions. Chains are independent; each next load within one chain waits for the previous value. In-order retirement and finite queues constrain execution. No hit-rate, prefetch, write, bank-address or proprietary controller policy is assumed.'
    );
    var ctl = h('div', { class: 'perf-controls' }, root),
      o = {
        chains: 8,
        mshr: 12,
        controller: 8,
        lanes: 4,
        serviceNs: 80,
        bw: 20,
        rob: 32,
        lq: 24,
        fill: 4
      };
    var knobs = {};
    function knob(key, label, vs) {
      knobs[key] = select(ctl, label, vs, o[key], function (v) {
        o[key] = +v;
        run();
      });
    }
    knob('chains', 'Independent chains', [1, 2, 4, 8, 16, 32]);
    knob('mshr', 'Miss entries (model)', [2, 4, 8, 12, 24, 48]);
    knob('controller', 'Controller queue entries', [1, 2, 4, 8, 16]);
    knob('lanes', 'Parallel service slots', [1, 2, 4, 8, 16]);
    knob('serviceNs', 'Service per request (ns)', [20, 40, 80, 160]);
    knob('bw', 'Return link limit (GB/s)', [2, 5, 10, 20, 40]);
    var more = h('details', { class: 'perf-details' }, root);
    text('summary', more, 'Finite front end and return-buffer controls');
    var extra = h('div', { class: 'perf-controls' }, more);
    [
      ['rob', 'ROB loop bodies', [4, 8, 16, 32, 64]],
      ['lq', 'Load queue entries', [4, 8, 16, 24, 48]],
      ['fill', 'Return queue entries', [1, 2, 4, 8]]
    ].forEach(function (a) {
      knobs[a[0]] = select(extra, a[1], a[2], o[a[0]], function (v) {
        o[a[0]] = +v;
        run();
      });
    });
    var presets = h('div', { class: 'perf-actions' }, root);
    [
      ['One chain', { chains: 1 }],
      ['Miss-entry pressure', { chains: 32, mshr: 2, lq: 24, rob: 32 }],
      ['Controller pressure', { chains: 32, mshr: 48, controller: 1, lanes: 1, lq: 48, rob: 64 }],
      [
        'Return-link pressure',
        {
          chains: 32,
          mshr: 48,
          controller: 16,
          lanes: 16,
          fill: 1,
          bw: 2,
          serviceNs: 20,
          lq: 48,
          rob: 64
        }
      ]
    ].forEach(function (p) {
      var b = text('button', presets, p[0], { type: 'button' });
      b.onclick = function () {
        Object.assign(
          o,
          {
            chains: 8,
            mshr: 12,
            controller: 8,
            lanes: 4,
            serviceNs: 80,
            bw: 20,
            rob: 32,
            lq: 24,
            fill: 4
          },
          p[1]
        );
        Object.keys(knobs).forEach(function (k) {
          knobs[k].value = String(o[k]);
        });
        run();
      };
    });
    var metrics = h('div', { class: 'perf-metrics', 'aria-live': 'polite' }, root),
      explain = h('div', { class: 'perf-explanation' }, root);
    var controls = h('div', { class: 'perf-actions' }, root),
      play = text('button', controls, 'Play trace', { type: 'button' }),
      reset = text('button', controls, 'Restart trace', { type: 'button' });
    var scrubLabel = h('label', { class: 'perf-scrub' }, controls);
    text('span', scrubLabel, 'Trace cycle');
    var slider = h(
      'input',
      { type: 'range', min: 0, value: 0, 'aria-label': 'Trace cycle' },
      scrubLabel
    );
    var state = h('div', { class: 'queue-state', 'aria-live': 'off' }, root),
      chart = h('figure', { class: 'perf-chart' }, root);
    var svg = s(
      'svg',
      {
        viewBox: '0 0 820 245',
        role: 'img',
        'aria-label': 'Miss-entry occupancy over simulated cycles'
      },
      chart
    );
    text(
      'figcaption',
      chart,
      'Miss-entry occupancy over time. The vertical marker follows the trace; the table gives the same cycle’s queue state.'
    );
    var details = h('details', { class: 'perf-details' }, root);
    text('summary', details, 'Inspect all counters, timing boundaries and traffic');
    var stats = h('div', null, details);
    var sweepWrap = h('div', { class: 'perf-sweep' }, root);
    var sweep = text('button', sweepWrap, 'Sweep 1 / 2 / 4 / 8 / 16 / 32 chains', {
      type: 'button'
    });
    var sweepResult = h('div', null, sweepWrap);
    var sim,
      cursor = 0,
      timer = null;
    function params(trace) {
      return {
        chains: o.chains,
        mshr: o.mshr,
        controller: o.controller,
        lanes: o.lanes,
        service: Math.max(1, Math.round(o.serviceNs * App.CFG.ghz)),
        burst: Math.max(1, Math.ceil((64 * App.CFG.ghz) / o.bw)),
        rob: o.rob,
        lq: o.lq,
        fill: o.fill,
        trace: trace
      };
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      play.textContent = 'Play trace';
    }
    function snapshot() {
      var v = sim.trace[cursor];
      state.replaceChildren();
      text(
        'h3',
        state,
        'Cycle ' + v.t + ' · ' + v.complete + ' returned · ' + v.retired + ' retired'
      );
      var rows = Object.keys(sim.capacities).map(function (k) {
        return [
          k,
          v[k] + ' / ' + sim.capacities[k],
          v[k] === sim.capacities[k] ? 'FULL' : 'available'
        ];
      });
      table(state, ['Resource', 'Occupancy / capacity', 'State'], rows);
      text(
        'p',
        state,
        v.stalls.length
          ? 'Blocked this cycle: ' + v.stalls.join(', ') + '.'
          : 'No resource or dependency block this cycle.',
        { class: 'note' }
      );
      slider.value = String(cursor);
      var mark = svg.querySelector('.trace-marker');
      if (mark) {
        var x = 48 + (744 * cursor) / (sim.cycles - 1);
        mark.setAttribute('x1', x);
        mark.setAttribute('x2', x);
      }
    }
    function run() {
      stop();
      sim = LabModel.simulate(params(true));
      root._simulation = sim;
      cursor = Math.floor(sim.cycles / 2);
      slider.max = String(sim.trace.length - 1);
      metrics.replaceChildren();
      stats.replaceChildren();
      explain.replaceChildren();
      sweepResult.replaceChildren();
      var ghz = App.CFG.ghz,
        bw = sim.throughput * 64 * ghz;
      metric(
        metrics,
        'Line bandwidth',
        bw.toFixed(2) + ' GB/s',
        'Full run, including fill and drain'
      );
      metric(
        metrics,
        'Average load-to-use',
        (sim.latency.mean / ghz).toFixed(1) + ' ns',
        'Issue → returned value; includes queueing'
      );
      metric(
        metrics,
        'Average outstanding',
        sim.occupancy.mshr.toFixed(2) + ' lines',
        'Allocated miss entries, not all waiting loads'
      );
      metric(
        metrics,
        'Modeled IPC',
        sim.ipc.toFixed(3),
        '4 abstract instructions / retired loop body'
      );
      var most = Object.keys(sim.stalls)
        .filter(function (k) {
          return sim.stalls[k] > 0;
        })
        .sort(function (a, b) {
          return sim.stalls[b] - sim.stalls[a];
        });
      text(
        'p',
        explain,
        'Most frequent observed block: ' +
          (most[0] || 'none') +
          '. A blocked-cycle counter is a symptom, not proof of the root bottleneck. Trace downstream: a full controller holds requests in the fabric; finite miss entries and the load queue then prevent more work entering the machine.'
      );
      text(
        'p',
        explain,
        'Full-run check: λW = ' +
          (sim.throughput * sim.latency.mean).toFixed(3) +
          ' lines; time-average miss occupancy = ' +
          sim.occupancy.mshr.toFixed(3) +
          '. These agree because both use issue → return, and the run starts and ends empty.'
      );
      table(
        stats,
        ['Metric', 'Value', 'Boundary'],
        [
          [
            'Completed / retired',
            sim.completed + ' / ' + sim.retired,
            'No requests dropped; all queues drain'
          ],
          [
            'CPI / demand miss MPKI',
            sim.cpi.toFixed(3) + ' / ' + sim.mpki,
            'Synthetic 4-instruction bodies, every load misses'
          ],
          [
            'Useful / line bytes',
            sim.usefulBytes + ' / ' + sim.bytes,
            '8-byte payload / 64-byte returned line; no RFO or writebacks'
          ],
          [
            'Middle-half line bandwidth',
            (sim.window.throughput * 64 * ghz).toFixed(2) + ' GB/s',
            'Completions in cycles ' +
              sim.window.start +
              '–' +
              sim.window.end +
              '; not guaranteed asymptotic steady state'
          ],
          [
            'p50 / p95 / p99 / max',
            [sim.latency.p50, sim.latency.p95, sim.latency.p99, sim.latency.max]
              .map(function (x) {
                return (x / ghz).toFixed(1);
              })
              .join(' / ') + ' ns',
            'Individual simulated requests, issue → return; nearest rank'
          ],
          [
            'Service / transport / queue',
            [sim.timing.service, sim.timing.transport, sim.timing.queue]
              .map(function (x) {
                return (x / ghz).toFixed(1);
              })
              .join(' / ') + ' ns',
            'These components sum to mean issue → return latency'
          ],
          [
            'Dependency / ready-resource wait',
            [sim.timing.dependency, sim.timing.readyWait]
              .map(function (x) {
                return (x / ghz).toFixed(1);
              })
              .join(' / ') + ' ns',
            'Before issue; excludes one rename/admission cycle'
          ],
          [
            'Return → retirement',
            (sim.timing.retireWait / ghz).toFixed(1) + ' ns',
            'In-order retirement may wait for older work'
          ],
          [
            'Return link utilization',
            (100 * sim.busUtil).toFixed(1) + '%',
            'One serialized 64-byte transfer; service slots are parallel'
          ],
          [
            'Front-end blocked',
            ((100 * sim.frontStall) / sim.cycles).toFixed(1) + '%',
            'A body was waiting to enter but ROB or LQ was full'
          ]
        ]
      );
      table(
        stats,
        ['Resource', 'Average / peak occupancy', 'Cycles full', 'Blocked cycles'],
        Object.keys(sim.capacities).map(function (k) {
          return [
            k,
            sim.occupancy[k].toFixed(2) + ' / ' + sim.peaks[k],
            sim.full[k],
            sim.stalls[k] || 0
          ];
        })
      );
      text(
        'p',
        stats,
        'Blocked counters can overlap and must not be added as disjoint time fractions. A service slot includes time holding a finished request when the return queue is full. Fabric admission is one request per cycle; service slots run FCFS with no address mapping. Time is rounded to whole model core cycles. Return-link rounding can put actual capacity below the requested limit.',
        { class: 'note' }
      );
      svg.replaceChildren();
      s('text', { x: 48, y: 20, class: 's' }, svg, 'Outstanding miss entries');
      [0, sim.p.mshr / 2, sim.p.mshr].forEach(function (v) {
        var y = 200 - (160 * v) / sim.p.mshr;
        s('line', { x1: 48, x2: 792, y1: y, y2: y, class: 'perf-grid' }, svg);
        s('text', { x: 40, y: y + 4, 'text-anchor': 'end', class: 's' }, svg, v.toFixed(0));
      });
      var stride = Math.max(1, Math.floor(sim.cycles / 700)),
        points = [];
      for (var i = 0; i < sim.trace.length; i += stride)
        points.push(
          (48 + (744 * i) / (sim.cycles - 1)).toFixed(2) +
            ',' +
            (200 - (160 * sim.trace[i].mshr) / sim.p.mshr).toFixed(2)
        );
      points.push('792,200');
      s('polyline', { points: points.join(' '), class: 'perf-line' }, svg);
      s('line', { x1: 48, x2: 48, y1: 30, y2: 204, class: 'trace-marker' }, svg);
      s('text', { x: 48, y: 228, class: 's' }, svg, '0');
      s('text', { x: 792, y: 228, class: 's', 'text-anchor': 'end' }, svg, sim.cycles + ' cycles');
      snapshot();
    }
    slider.oninput = function () {
      stop();
      cursor = +slider.value;
      snapshot();
    };
    reset.onclick = function () {
      stop();
      cursor = 0;
      snapshot();
    };
    play.onclick = function () {
      if (timer) {
        stop();
        return;
      }
      if (cursor >= sim.trace.length - 1) cursor = 0;
      play.textContent = 'Pause trace';
      timer = setInterval(function () {
        if (!root.closest('.ch.show') || root.closest('[hidden]')) {
          stop();
          return;
        }
        cursor = Math.min(sim.trace.length - 1, cursor + Math.max(1, Math.ceil(sim.cycles / 180)));
        snapshot();
        if (cursor === sim.trace.length - 1) stop();
      }, 100);
    };
    sweep.onclick = function () {
      sweepResult.replaceChildren();
      var rows = [1, 2, 4, 8, 16, 32].map(function (n) {
        var p = params(false);
        p.chains = n;
        var r = LabModel.simulate(p);
        return [
          n,
          (r.throughput * 64 * App.CFG.ghz).toFixed(2),
          (r.latency.mean / App.CFG.ghz).toFixed(1),
          r.occupancy.mshr.toFixed(2)
        ];
      });
      table(sweepResult, ['Chains', 'Line GB/s', 'Mean load ns', 'Average outstanding'], rows);
      text(
        'p',
        sweepResult,
        'Same resources and 192 total requests in every run. Predict the knee, then change the limiting resource and repeat. Saturation can increase latency without increasing bandwidth.'
      );
    };
    run();
    App.onCfg(run);
    return root;
  }
  function criticalLab(parent) {
    badge(parent, 'Teaching approximation · dependency timing, no resource contention');
    text(
      'p',
      parent,
      'Edges mean “must finish before this can start.” DTLB lookup and VIPT indexing overlap. A walk is serial within one translation. Independent older work can overlap memory waiting, but retirement waits for both. The next mode adds finite resources.'
    );
    var o = { level: 'DRAM', walk: false, work: 32, background: true },
      ctl = h('div', { class: 'perf-controls' }, parent);
    select(ctl, 'Data source', ['L1', 'L2', 'L3', 'DRAM'], 'DRAM', function (v) {
      o.level = v;
      draw();
    });
    select(
      ctl,
      'Translation',
      [
        [0, 'DTLB hit'],
        [1, 'Page walk']
      ],
      0,
      function (v) {
        o.walk = !!+v;
        draw();
      }
    );
    select(ctl, 'Independent older work (cycles)', [4, 32, 128, 512], 32, function (v) {
      o.work = +v;
      draw();
    });
    var output = h('div', { class: 'perf-metrics', 'aria-live': 'polite' }, parent),
      chart = h('figure', { class: 'perf-chart perf-dag' }, parent);
    var svg = s('svg', { role: 'img', 'aria-label': 'Dependency graph on a cycle axis' }, chart);
    var desc = text('figcaption', chart, '');
    var detail = h('div', null, parent);
    function draw() {
      var r = LabModel.criticalPath(App.CFG, o);
      svg.replaceChildren();
      output.replaceChildren();
      detail.replaceChildren();
      metric(
        output,
        'Histogram value ready',
        r.valueAt.toFixed(0) + ' cycles',
        'Dependent consumer can use the result'
      );
      metric(
        output,
        'Retirement',
        r.end.toFixed(0) + ' cycles',
        'Also waits for independent older work'
      );
      metric(
        output,
        'Store reaches L1',
        r.commitAt.toFixed(0) + ' cycles',
        'Assumes exclusive ownership; after retirement'
      );
      var height = 56 + r.nodes.length * 34;
      svg.setAttribute('viewBox', '0 0 960 ' + height);
      var max = Math.max.apply(
          null,
          r.nodes.map(function (n) {
            return n.end;
          })
        ),
        scale = 635 / max,
        rows = {};
      r.nodes.forEach(function (n, i) {
        rows[n.id] = i;
      });
      r.nodes.forEach(function (n, i) {
        n.deps.forEach(function (d) {
          var a = r.by[d],
            x = 260 + a.end * scale,
            y = 38 + rows[d] * 34,
            xx = 260 + n.start * scale,
            yy = 38 + i * 34;
          s(
            'path',
            {
              d:
                'M' +
                x +
                ' ' +
                y +
                ' L' +
                (x + 4) +
                ' ' +
                y +
                ' L' +
                (x + 4) +
                ' ' +
                yy +
                ' L' +
                xx +
                ' ' +
                yy,
              class: 'dag-edge'
            },
            svg
          );
        });
      });
      r.nodes.forEach(function (n, i) {
        var y = 26 + i * 34,
          critical = r.critical.indexOf(n.id) >= 0;
        s('text', { x: 8, y: y + 16, class: 's' }, svg, n.label);
        s(
          'rect',
          {
            x: 260 + n.start * scale,
            y: y,
            width: Math.max(2, n.duration * scale),
            height: 23,
            rx: 3,
            class: critical ? 'actb' : 'a4b'
          },
          svg
        );
        s(
          'text',
          { x: 950, y: y + 16, 'text-anchor': 'end', class: 's' },
          svg,
          n.start.toFixed(0) + '–' + n.end.toFixed(0)
        );
      });
      desc.textContent =
        'Amber: longest dependency path to retirement. Blue: overlapping work. Labels show start–end cycles. The unrelated writeback is not required by this instruction and is not charged to its dependency path; it would compete for resources in a contention model.';
      table(
        detail,
        ['Node', 'Depends on', 'Start → end cycles'],
        r.nodes.map(function (n) {
          return [
            n.label,
            n.deps
              .map(function (k) {
                return r.by[k].label;
              })
              .join(', ') || 'entry',
            n.start.toFixed(0) + ' → ' + n.end.toFixed(0)
          ];
        })
      );
      text(
        'p',
        detail,
        'Cache latencies are the configured teaching load-to-use inputs, not per-hop delays to sum. One lookup cycle is represented by the overlapping DTLB/index nodes; the remaining selected latency follows them. The walk assumes two walk-cache hits plus two L2 reads. The graph omits port contention, branch recovery, memory ordering and a calibrated hardware pipeline.'
      );
    }
    draw();
    App.onCfg(draw);
  }
  function measurement(parent) {
    badge(parent, 'Real experiment · run on Linux, outside the browser');
    text(
      'p',
      parent,
      'Start with a hypothesis: doubling independent chains should raise throughput until a resource saturates. Keep total working-set size fixed, randomize pointer order, and compare 1 / 2 / 4 / 8 / 16 chains. A single chain probes dependency-limited behavior; many chains probe overlap. A sequential read/write sweep measures useful-byte throughput with different prefetch and write-allocation behavior.'
    );
    code(
      parent,
      'python3 benchmarks/run_all.py --serve\n# Measurement only: python3 benchmarks/run_all.py\n# Individual fallback: python3 benchmarks/run.py --output results.json'
    );
    text(
      'p',
      parent,
      'Choose an allowed logical CPU. The runner pins before allocation/first touch, warms each working set, compiles native code with optimization, retains a checksum and records every repetition plus context. Inspect generated assembly before drawing microarchitectural conclusions. The working set is total bytes across all chains, not bytes per chain.'
    );
    link(parent, 'bench');
    table(
      parent,
      ['Control', 'Record / hold constant'],
      [
        [
          'CPU placement',
          'Affinity and SMT sibling activity; other cores can compete for shared resources. Pinning alone does not isolate a CPU.'
        ],
        [
          'Clock and thermal state',
          'Governor, boost policy, temperature/background load. Invariant TSC ticks are a time base, not dynamic core cycles. Use wall ns for this harness; PMU cycles for IPC.'
        ],
        [
          'Memory placement',
          'First touch, NUMA policy, actual page sizes, THP state, alignment, ASLR and random seed. Report warm-up; distinguish first-touch faults from warmed traversal.'
        ],
        [
          'Compiler',
          'Version, flags, exact source/binary hash, assembly, checksums. Avoid dead-code removal and unintended vectorization in dependent chains.'
        ],
        [
          'Platform',
          'CPU family/model/stepping, microcode, kernel, BIOS, DIMM speed/timings/channel population. Unknown metadata stays unknown.'
        ],
        [
          'Statistics',
          'Retain raw repetitions, mean, median, variance, p95/p99 of run averages and sample count. Few repetitions cannot characterize rare per-load tails.'
        ]
      ]
    );
    text('h3', parent, 'Observe the mechanism with Linux tools');
    code(
      parent,
      'perf list\nperf stat -r 5 -e cycles,instructions,cache-references,cache-misses -- \\\n  taskset -c 2 benchmarks/memlab --mode chase --bytes 67108864 --chains 1 --steps 2000000 --repeats 1 --cpu 2\n# Only when this CPU, kernel and perf expose the required sampling support:\nperf mem record -- taskset -c 2 benchmarks/memlab --mode chase --bytes 67108864 --chains 1 --steps 2000000 --repeats 1 --cpu 2\nperf mem report\nperf c2c record -- ./your-sharing-benchmark\nperf c2c report'
    );
    text(
      'p',
      parent,
      'These perf examples cover the whole process, including allocation, construction and warm-up; their counts do not share the C harness’s timed-kernel boundary. Use them to inspect the workload first, or gate counting around the same region for direct comparison. Check event availability, permission errors, multiplexing/running percentage and scope. Generic cache-misses is not automatically a precise L1/L2/L3 miss count. Do not copy raw event encodings between CPU families.'
    );
    table(
      parent,
      ['Simulated observation', 'Hardware route', 'Limit'],
      [
        [
          'Modeled IPC / CPI',
          'perf stat cycles + instructions',
          'Use matching scope and interval; architectural instruction counts differ from model loop bodies.'
        ],
        [
          'Misses / MPKI',
          'Model-specific cache PMCs, checked against AMD PPR and perf list',
          'Generic aliases need validation; prefetch/demand and cache-level definitions vary.'
        ],
        [
          'Load latency / data source',
          'AMD IBS Op via supported perf mem; inspect available fields',
          'Sampling and event weights have specific semantics; an Intel use-latency sample is not interchangeable with AMD miss latency.'
        ],
        [
          'Sharing and ownership traffic',
          'perf c2c on a multithreaded sharing workload, if supported',
          'HITM/peer classifications and availability depend on CPU and kernel; the single-thread chase is not a false-sharing experiment.'
        ],
        [
          'Queue pressure',
          'Throughput/latency sweeps plus applicable stall/resource PMCs',
          'Exact queue occupancy is often not exposed. Infer a bottleneck cautiously and test a competing explanation.'
        ],
        [
          'Line vs useful bandwidth',
          'Memory-controller PMCs where documented; compare useful bytes/time',
          'Do not infer physical DRAM bytes from useful traffic when caches, RFOs or prefetches intervene.'
        ]
      ]
    );
    link(parent, 'stat');
    text('span', parent, ' · ');
    link(parent, 'ibs');
    text('h3', parent, 'Import measurements');
    text(
      'p',
      parent,
      'The unified workflow loads every suite automatically. Open Results to import one visitor bundle or compare with the shipped reference. This per-suite input remains a fallback; files stay local and do not overwrite the teaching model’s latency defaults.'
    );
    var lab = h('label', { class: 'perf-field' }, parent);
    text('span', lab, 'Benchmark result JSON');
    var input = h(
      'input',
      { type: 'file', accept: '.json,application/json', 'aria-label': 'Benchmark result JSON' },
      lab
    );
    var status = text('p', parent, 'No hardware result loaded.', { role: 'status' }),
      out = h('div', { class: 'measurement-results' }, parent);
    function render(result, label) {
      validateMeasurement(result);
      if (label) text('h3', out, label, { class: 'measurement-run-title' });
      status.textContent =
        'Measured data · ' +
        result.samples.length +
        ' repetitions · ' +
        String(result.context.cpu_model || 'CPU not recorded') +
        (result.complete === false ? ' · PARTIAL RUN' : '');
      text(
        'p',
        out,
        'Recorded clock: ' +
          String(result.context.clock || 'not recorded') +
          '. Timing: ' +
          String(result.context.timing_boundary || 'not recorded') +
          '. Percentiles are across run-average ns/operation, not individual-load tails.'
      );
      var groups = {};
      result.samples.forEach(function (r) {
        var k = [r.mode, r.bytes, r.chains].join('/');
        (groups[k] || (groups[k] = [])).push(r);
      });
      table(
        out,
        ['Mode / bytes / chains', 'n', 'Mean ns/op', 'Median', 'p95 / p99', 'SD', 'Useful GB/s'],
        Object.keys(groups).map(function (k) {
          var a = groups[k],
            vals = a.map(function (r) {
              return r.elapsed_ns / r.operations;
            }),
            mean = LabModel.mean(vals),
            sd = Math.sqrt(
              LabModel.mean(
                vals.map(function (v) {
                  return (v - mean) * (v - mean);
                })
              )
            );
          return [
            k,
            a.length,
            mean.toFixed(3),
            MeasurementBundle.stats(vals).median.toFixed(3),
            LabModel.quantile(vals, 0.95).toFixed(3) +
              ' / ' +
              LabModel.quantile(vals, 0.99).toFixed(3),
            sd.toFixed(3),
            LabModel.mean(
              a.map(function (r) {
                return r.useful_bytes / r.elapsed_ns;
              })
            ).toFixed(3)
          ];
        })
      );
      var raw = h('details', { class: 'perf-details' }, out);
      text('summary', raw, 'Inspect recorded context and raw repetitions');
      code(raw, JSON.stringify(result, null, 2));
    }
    input.onchange = async function () {
      out.replaceChildren();
      try {
        var file = input.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024)
          throw new Error('Choose a JSON result smaller than 2 MiB.');
        render(JSON.parse(await file.text()), 'Manual import · locally read, not uploaded');
      } catch (e) {
        status.textContent = 'Could not import: ' + e.message;
      }
    };
    App.Measurements.bind('memory', status, out, render);
  }
  function validateMeasurement(r) {
    if (
      !r ||
      r.schema !== 'memory-lab-v1' ||
      !r.context ||
      typeof r.context !== 'object' ||
      Array.isArray(r.context) ||
      !Array.isArray(r.samples) ||
      !r.samples.length ||
      r.samples.length > 5000
    )
      throw new Error('Expected memory-lab-v1 with context and 1–5000 samples.');
    r.samples.forEach(function (x) {
      if (
        !x ||
        ['chase', 'read', 'write'].indexOf(x.mode) < 0 ||
        ![x.elapsed_ns, x.operations, x.useful_bytes, x.bytes, x.chains].every(function (v) {
          return Number.isSafeInteger(v) && v > 0;
        }) ||
        [1, 2, 4, 8, 16].indexOf(x.chains) < 0 ||
        x.bytes % 64 ||
        x.useful_bytes !== x.operations * 8 ||
        (x.mode !== 'chase' && x.chains !== 1)
      )
        throw new Error('Invalid mode, size, chains, duration, byte or operation count.');
    });
    return r;
  }
  App.Performance = {
    streamLab: streamLab,
    criticalLab: criticalLab,
    validateMeasurement: validateMeasurement,
    evidence: evidence
  };
  App.LabUI = {
    text: text,
    table: table,
    select: select,
    metric: metric,
    badge: badge,
    code: code,
    checkpoint: checkpoint
  };
  [
    [
      'bandwidth',
      'bandwidth',
      'Bytes transferred per unit time. State the boundary: useful payload, cache-line traffic and DRAM-bus traffic need not be equal.'
    ],
    [
      'throughput',
      'throughput',
      'Completed operations per unit time. Independent work can overlap without reducing the latency of each operation.'
    ],
    [
      'cpi',
      'CPI',
      'Core cycles divided by retired architectural instructions, using the same interval and execution scope. The reciprocal of IPC.'
    ],
    [
      'mpki',
      'MPKI',
      'Misses per thousand retired instructions. Specify cache level, demand versus prefetch, and instruction/data scope.'
    ],
    [
      'occupancy',
      'queue occupancy',
      'Number of entries currently in use. Average occupancy is the time integral of entries divided by elapsed time.'
    ],
    [
      'backpressure',
      'backpressure',
      'An occupied downstream resource prevents its upstream producer from advancing. It can propagate back to dispatch or fetch.'
    ],
    [
      'little',
      'Little’s law',
      'For a stable system with consistent boundaries: average outstanding work N = average completion rate λ × average residence time W.'
    ],
    [
      'p99',
      'p99 latency',
      'A 99th percentile of a stated population. This lab uses nearest rank; repeated run averages are not individual-access latency samples.'
    ]
  ].forEach(function (t) {
    App.gloss(t[0], t[1], t[2]);
    App.setCategory(t[0], 'memory');
    App.TERM_HOME[t[0]] = 'perf';
  });
  App.chapter({
    id: 'perf',
    group: 'Performance lab',
    short: 'Measure & explain',
    title: 'Predict, measure, explain',
    lede: 'Turn a mechanism into a testable prediction. Separate the latency of one dependent request from the throughput of many independent requests.',
    points: [
      'Follow finite queues from the front end to the returning cache line.',
      'Compare synthetic observations with native Linux experiments.',
      'Keep evidence, units and timing boundaries visible.'
    ],
    build: function (root) {
      var P = App.P;
      evidence(
        P.sec(
          root,
          'evidence',
          'Read the evidence',
          'Model parameters and hardware observations retain separate scopes.'
        )
      );
      vocabulary(
        P.sec(
          root,
          'vocabulary',
          'Name the quantity',
          'A number is useful only when its units and boundary are clear.'
        )
      );
      littleLaw(
        P.sec(
          root,
          'predict',
          'Predict the concurrency',
          'Latency, throughput and bandwidth describe different aspects of the same execution.'
        )
      );
      streamLab(
        P.sec(
          root,
          'queues',
          'Run a finite machine',
          'Change one resource, observe the bottleneck, and explain the result.'
        )
      );
      measurement(
        P.sec(
          root,
          'measure',
          'Measure real hardware',
          'Use the same hypothesis on a real machine, then investigate differences.'
        )
      );
      var last = P.sec(
        root,
        'explain',
        'Explain a surprising result',
        'Make one controlled change before assigning a cause.'
      );
      text(
        'p',
        last,
        'High miss rate can coexist with high throughput when independent misses overlap. Low useful bandwidth can coexist with a busy return link when each line provides only one pointer. More outstanding work can raise queueing latency after bandwidth saturates. When a measurement disagrees, first check boundaries, generated code, residency, placement and frequency; then test the proposed bottleneck by changing one resource or workload property.'
      );
      h(
        'p',
        null,
        last,
        'Return to the <a href="#e2e/critical">dependency graph</a>, <a href="#hier/parallel">hierarchy walkthrough</a>, or <a href="#core/run">instruction-level core simulator</a>.'
      );
    }
  });
})();
