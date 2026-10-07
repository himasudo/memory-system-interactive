/* The performance chapter, its shared UI helpers (App.LabUI), and the labs End to End reuses. */
(function () {
  'use strict';
  var h = App.h,
    s = App.s,
    g = App.g,
    uid = 0;
  var SOURCES = {
    stat: [
      'Linux perf stat',
      'https://kernel.googlesource.com/pub/scm/linux/kernel/git/stable/linux-stable/+/master/tools/perf/Documentation/perf-stat.txt'
    ],
    ibs: [
      'Linux perf on AMD IBS',
      'https://android.googlesource.com/kernel/common/+/0e674132ddfa938cd53ba7c3706f0d83b2a91491/tools/perf/Documentation/perf-amd-ibs.txt'
    ],
    bench: ['Benchmark protocol (benchmarks/README.md)', 'benchmarks/README.md']
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
  /* A short label above a block: "Simulation", "Your machine", "Vendor docs"… */
  /* One of the seven labels explained on the Start page. */
  function badge(parent, label) {
    return text('span', parent, label, {
      class: 'evidence-label evidence-kind',
      'data-evidence-kind': label
    });
  }
  function code(parent, str) {
    return text('pre', parent, str, { class: 'p-code no-autolink' });
  }
  /* What a simulation leaves out, in one or two visible sentences. */
  function model(parent, copy) {
    var p = h('p', { class: 'lab-model' }, parent);
    text('b', p, 'Model');
    p.appendChild(document.createTextNode(' ' + copy));
    return p;
  }
  /* One line of sources: [[title, url], …]. */
  function sources(parent, list) {
    var p = h('p', { class: 'lab-sources' }, parent);
    text('span', p, list.length > 1 ? 'Sources' : 'Source');
    list.forEach(function (q, i) {
      if (i) p.appendChild(document.createTextNode(' · '));
      var external = /^https?:/.test(q[1]);
      text('a', p, q[0], external ? { href: q[1], target: '_blank', rel: 'noopener' } : { href: q[1] });
    });
    return p;
  }
  /* The same "run it on your machine" block in every chapter that has a native benchmark. */
  function native(parent, o) {
    var box = h('div', { class: 'lab-native' }, parent);
    var head = h('div', { class: 'lab-native-head' }, box);
    badge(head, 'Your machine');
    text('h3', head, o.title || 'Run it on your machine');
    if (o.what) text('p', box, o.what);
    code(
      box,
      'python3 benchmarks/run_all.py --serve' + (o.command ? '\n# this suite only: ' + o.command : '')
    );
    text(
      'p',
      box,
      'With --serve, results appear here automatically. You can also load a saved JSON file.',
      { class: 'note' }
    );
    var label = h('label', { class: 'perf-field lab-native-file' }, box);
    text('span', label, o.label);
    var input = h(
      'input',
      { type: 'file', accept: '.json,application/json', 'aria-label': o.aria || o.label },
      label
    );
    var status = text('p', box, o.empty, { role: 'status', class: o.statusClass || '' });
    var out = h('div', { class: o.outClass || '' }, box);
    var more = h('p', { class: 'lab-native-more' }, box);
    text('a', more, 'How the benchmarks run and what to keep fixed →', { href: '#perf/measure' });
    return { box: box, input: input, status: status, out: out };
  }
  /* Loads a JSON result file chosen in the browser; nothing is uploaded. */
  function importInto(input, out, status, render) {
    input.onchange = async function () {
      out.replaceChildren();
      try {
        var file = input.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) throw new Error('Choose a file smaller than 2 MiB.');
        render(JSON.parse(await file.text()), 'Loaded from a file (read in this browser only)');
      } catch (e) {
        status.textContent = 'Could not import: ' + e.message;
      }
    };
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
    text('h3', box, 'Predict first');
    text('p', box, prompt);
    var choicesEl = h('div', { class: 'perf-actions' }, box);
    var result = text('p', box, 'Pick an answer, then check it with the controls below.', {
      class: 'note',
      'aria-live': 'polite'
    });
    choices.forEach(function (c, i) {
      var b = text('button', choicesEl, c, { type: 'button', 'aria-pressed': 'false' });
      b.onclick = function () {
        choicesEl.querySelectorAll('button').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
        box.dataset.answer = i === correct ? 'right' : 'wrong';
        result.textContent = (i === correct ? 'Right. ' : 'Not quite. ') + explanation;
      };
    });
  }
  function vocabulary(parent) {
    text(
      'p',
      parent,
      'Most confusion about memory performance comes from mixing these up. Every number on this page says which one it is and where its timer starts and stops.'
    );
    table(
      parent,
      ['Quantity', 'What it counts', 'Watch out for'],
      [
        [
          'Latency',
          'Time for one operation, from a named start to a named end',
          'Say where the timer starts and stops. Load-to-use is not the same as time to retire.'
        ],
        [
          'Throughput',
          'Operations finished per second',
          'Many slow operations can overlap, so throughput can rise while latency stays the same.'
        ],
        [
          'Bandwidth',
          'Bytes moved per second (1 GB/s = 10⁹ bytes/s)',
          'The bytes you use, the 64-byte lines moved and the bytes on the DRAM bus can all differ.'
        ],
        [
          'IPC / CPI',
          'Instructions retired per core cycle, and its inverse',
          'Count instructions and cycles over the same interval, on the same thread.'
        ],
        [
          'Miss rate / MPKI',
          'Misses per access, or misses per 1000 instructions',
          'Say which cache, and whether prefetches and instruction fetches are counted.'
        ],
        [
          'Occupancy',
          'Average number of entries in use in a queue',
          'A full queue and a busy unit are different problems.'
        ],
        [
          'p50 / p95 / p99',
          'The value that 50 / 95 / 99 % of samples fall below',
          'A p99 of run averages is not the p99 of single loads.'
        ],
        [
          'Queue time vs service time',
          'Time waiting for a resource vs time being served by it',
          'Measured latency also includes travel time and waiting for older work to retire.'
        ]
      ]
    );
  }
  function littleLaw(parent) {
    text(
      'p',
      parent,
      'Little’s law links the three: average requests in flight = completion rate × average time each one takes. To move 20 GB/s in 64-byte lines when each load takes 80 ns, about 25 lines must be in flight at once.'
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
        'Lines in flight needed',
        ((bw * ns) / line).toFixed(1) + ' lines',
        'GB/s × ns ÷ 64 bytes per line'
      );
      metric(
        result,
        'One dependent chain',
        (line / ns).toFixed(2) + ' GB/s',
        'One line at a time; only 8 of its 64 bytes may be used'
      );
      metric(
        result,
        'Useful pointer data',
        (8 / ns).toFixed(2) + ' GB/s',
        'One 8-byte pointer per line'
      );
    }
    draw();
    text(
      'p',
      parent,
      'More miss buffers alone don’t create that overlap. The program has to supply independent addresses, and every queue further down has to accept the traffic.'
    );
    checkpoint(
      parent,
      'If 16 independent loads each take 80 ns, is their combined bandwidth the same as one pointer chain’s?',
      [
        'Yes: latency fixes bandwidth',
        'No: independent loads can overlap',
        'They always run exactly 16× faster'
      ],
      1,
      'Overlap raises bandwidth, until a queue or a shared unit fills up. The next lab shows where that happens.'
    );
  }
  function streamLab(parent) {
    var root = h('div', { class: 'stream-lab' }, parent);
    badge(root, 'Simulation');
    text(
      'p',
      root,
      'Each loop iteration does one 8-byte load from a new 64-byte line, plus three other instructions. Loads in one chain wait for each other; separate chains don’t. Add chains, shrink a queue, and watch which resource fills first.'
    );
    model(
      root,
      'Every load misses the caches. There are no prefetches, writes or DRAM banks, and the controller serves requests in arrival order.'
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
    knob('mshr', 'Miss entries', [2, 4, 8, 12, 24, 48]);
    knob('controller', 'Controller queue entries', [1, 2, 4, 8, 16]);
    knob('lanes', 'Parallel service slots', [1, 2, 4, 8, 16]);
    knob('serviceNs', 'Service per request (ns)', [20, 40, 80, 160]);
    knob('bw', 'Return link limit (GB/s)', [2, 5, 10, 20, 40]);
    knob('rob', 'ROB loop bodies', [4, 8, 16, 32, 64]);
    knob('lq', 'Load queue entries', [4, 8, 16, 24, 48]);
    knob('fill', 'Return queue entries', [1, 2, 4, 8]);
    var presets = h('div', { class: 'perf-actions lab-presets' }, root);
    text('span', presets, 'Presets', { class: 'lab-presets-label' });
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
      'Miss entries in use over the whole run. The dashed marker is the cycle shown in the table above.'
    );
    var details = h('details', { class: 'perf-details' }, root);
    text('summary', details, 'Show every counter');
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
        'Whole run, including start-up and drain'
      );
      metric(
        metrics,
        'Average load-to-use',
        (sim.latency.mean / ghz).toFixed(1) + ' ns',
        'From issue to data back, waiting included'
      );
      metric(
        metrics,
        'Average in flight',
        sim.occupancy.mshr.toFixed(2) + ' lines',
        'Miss entries in use'
      );
      metric(metrics, 'IPC', sim.ipc.toFixed(3), '4 instructions per loop iteration');
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
        'Blocked most often by: ' +
          (most[0] || 'nothing') +
          '. That is where the backup shows, not always where it starts: a full controller holds requests upstream, then the miss entries and the load queue fill behind it.'
      );
      text(
        'p',
        explain,
        'Little’s law check: completion rate × average latency = ' +
          (sim.throughput * sim.latency.mean).toFixed(3) +
          ' lines, and the average miss entries in use = ' +
          sim.occupancy.mshr.toFixed(3) +
          '. They match because both count from issue to return over the whole run.'
      );
      table(
        stats,
        ['Counter', 'Value', 'What it counts'],
        [
          [
            'Completed / retired',
            sim.completed + ' / ' + sim.retired,
            'Every request finishes; nothing is dropped'
          ],
          [
            'CPI / demand miss MPKI',
            sim.cpi.toFixed(3) + ' / ' + sim.mpki,
            'Each loop body is 4 instructions and its load always misses'
          ],
          [
            'Useful / line bytes',
            sim.usefulBytes + ' / ' + sim.bytes,
            '8 bytes used out of each 64-byte line; no stores, so no RFOs or write-backs'
          ],
          [
            'Middle-half line bandwidth',
            (sim.window.throughput * 64 * ghz).toFixed(2) + ' GB/s',
            'Completions in cycles ' +
              sim.window.start +
              '–' +
              sim.window.end +
              '; the middle half skips start-up and drain'
          ],
          [
            'p50 / p95 / p99 / max',
            [sim.latency.p50, sim.latency.p95, sim.latency.p99, sim.latency.max]
              .map(function (x) {
                return (x / ghz).toFixed(1);
              })
              .join(' / ') + ' ns',
            'Each request from issue to return'
          ],
          [
            'Service / transport / queue',
            [sim.timing.service, sim.timing.transport, sim.timing.queue]
              .map(function (x) {
                return (x / ghz).toFixed(1);
              })
              .join(' / ') + ' ns',
            'Together they make up the average issue-to-return time'
          ],
          [
            'Dependency / ready-resource wait',
            [sim.timing.dependency, sim.timing.readyWait]
              .map(function (x) {
                return (x / ghz).toFixed(1);
              })
              .join(' / ') + ' ns',
            'Time before issue, waiting for an address or a free slot'
          ],
          [
            'Return → retirement',
            (sim.timing.retireWait / ghz).toFixed(1) + ' ns',
            'Data is back but older instructions haven’t retired yet'
          ],
          [
            'Return link utilization',
            (100 * sim.busUtil).toFixed(1) + '%',
            'Busy time of the link that returns lines, one 64-byte line at a time'
          ],
          [
            'Front-end blocked',
            ((100 * sim.frontStall) / sim.cycles).toFixed(1) + '%',
            'New work was waiting because the ROB or load queue was full'
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
      table(sweepResult, ['Chains', 'Line GB/s', 'Mean load ns', 'Average in flight'], rows);
      text(
        'p',
        sweepResult,
        'Every run has the same queues and 192 requests. Bandwidth climbs until one resource saturates; after that, more chains only add waiting time.'
      );
    };
    run();
    App.onCfg(run);
    return root;
  }
  function criticalLab(parent) {
    badge(parent, 'Simulation');
    text(
      'p',
      parent,
      'Each bar is one step of hist[123]++, and an edge means “must finish before this can start.” The TLB lookup and the cache index overlap. Unrelated older work can overlap the memory wait, but retirement waits for both.'
    );
    model(
      parent,
      'Timing only: nothing competes for ports, queues or memory here. The next mode adds that.'
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
        'The next instruction can use it'
      );
      metric(output, 'Retirement', r.end.toFixed(0) + ' cycles', 'Also waits for the older work');
      metric(
        output,
        'Store reaches L1',
        r.commitAt.toFixed(0) + ' cycles',
        'After retirement, with the line already owned'
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
              d: 'M' + x + ' ' + y + ' L' + (x + 4) + ' ' + y + ' L' + (x + 4) + ' ' + yy + ' L' + xx + ' ' + yy,
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
        'Amber: the longest chain of dependencies, which sets the finish time. Blue: work that overlaps it. Numbers are start–end cycles. The writeback of an older line is shown but is not on this chain.';
      table(
        detail,
        ['Step', 'Waits for', 'Start → end cycles'],
        r.nodes.map(function (n) {
          return [
            n.label,
            n.deps
              .map(function (k) {
                return r.by[k].label;
              })
              .join(', ') || '—',
            n.start.toFixed(0) + ' → ' + n.end.toFixed(0)
          ];
        })
      );
      text(
        'p',
        detail,
        'Cache latencies come from the latency settings and are total load-to-use times, not per-level delays to add up. A page walk here hits the walk cache for the upper two levels and reads the last two entries from L2.',
        { class: 'note' }
      );
    }
    draw();
    App.onCfg(draw);
  }
  function measurement(parent) {
    text(
      'p',
      parent,
      'The memory benchmark runs the experiment above on your own CPU. It follows randomly ordered pointer chains through a fixed amount of memory with 1, 2, 4, 8 and 16 chains, then streams through memory reading and writing. One chain shows latency. More chains show how much overlap your memory system allows.'
    );
    var n = native(parent, {
      title: 'Memory and overlap results',
      command: 'python3 benchmarks/run.py --output results.json',
      label: 'Benchmark result JSON',
      empty: 'No results loaded yet.',
      outClass: 'measurement-results'
    });
    n.box.querySelector('.lab-native-more').remove();
    function render(result, label) {
      validateMeasurement(result);
      if (label) text('h3', n.out, label, { class: 'measurement-run-title' });
      n.status.textContent =
        'Measured · ' +
        result.samples.length +
        ' repetitions · ' +
        String(result.context.cpu_model || 'CPU not recorded') +
        (result.complete === false ? ' · partial run' : '');
      text(
        'p',
        n.out,
        'Clock: ' +
          String(result.context.clock || 'not recorded') +
          '. Timer covers: ' +
          String(result.context.timing_boundary || 'not recorded') +
          '. Percentiles are over run averages, not single loads.'
      );
      var groups = {};
      result.samples.forEach(function (r) {
        var k = [r.mode, r.bytes, r.chains].join('/');
        (groups[k] || (groups[k] = [])).push(r);
      });
      table(
        n.out,
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
            LabModel.quantile(vals, 0.95).toFixed(3) + ' / ' + LabModel.quantile(vals, 0.99).toFixed(3),
            sd.toFixed(3),
            LabModel.mean(
              a.map(function (r) {
                return r.useful_bytes / r.elapsed_ns;
              })
            ).toFixed(3)
          ];
        })
      );
      var raw = h('details', { class: 'perf-details' }, n.out);
      text('summary', raw, 'Show the recorded context and every repetition');
      code(raw, JSON.stringify(result, null, 2));
    }
    importInto(n.input, n.out, n.status, render);
    App.Measurements.bind('memory', n.status, n.out, render);
    text('h3', parent, 'Keep these fixed between runs');
    text(
      'p',
      parent,
      'The runner records all of this for you. Change one thing at a time, or two runs can differ for reasons that have nothing to do with the memory system.'
    );
    table(
      parent,
      ['What', 'Why it matters'],
      [
        [
          'Which CPU the test runs on',
          'Another thread on the same core, or on a core sharing the cache, competes for the same resources.'
        ],
        [
          'Clock speed and temperature',
          'Boost and thermal limits change speed mid-run. The timer measures nanoseconds; CPU cycles need perf counters.'
        ],
        [
          'Where memory lives',
          'First touch, NUMA node and page size decide which memory and which TLB entries the test uses.'
        ],
        [
          'Compiler and flags',
          'The compiler can remove or vectorize a loop. Check the generated assembly.'
        ],
        [
          'Machine details',
          'CPU model, kernel, BIOS and DIMM speed and population. Anything not recorded stays “unknown”.'
        ],
        [
          'Number of repetitions',
          'Keep every repetition. A few runs show the typical case, not rare slow loads.'
        ]
      ]
    );
    text('h3', parent, 'Look deeper with perf');
    code(
      parent,
      'perf list\nperf stat -r 5 -e cycles,instructions,cache-references,cache-misses -- \\\n  taskset -c 2 benchmarks/memlab --mode chase --bytes 67108864 --chains 1 --steps 2000000 --repeats 1 --cpu 2\n# Sample individual loads (needs CPU and kernel support):\nperf mem record -- taskset -c 2 benchmarks/memlab --mode chase --bytes 67108864 --chains 1 --steps 2000000 --repeats 1 --cpu 2\nperf mem report\n# Find contended cache lines in a multithreaded program:\nperf c2c record -- ./your-sharing-benchmark\nperf c2c report'
    );
    text(
      'p',
      parent,
      'perf counts the whole process, including setup, so its numbers cover more than the benchmark’s own timer. perf mem samples single loads with each vendor’s hardware: AMD uses IBS, Arm uses SPE, and on Intel the latency it reports is load-to-use. Event names differ between CPUs, so check perf list on the machine you test.'
    );
    table(
      parent,
      ['In the simulation', 'On real hardware', 'Careful'],
      [
        ['IPC', 'perf stat: cycles and instructions', 'Count both over the same interval.'],
        [
          'Misses per 1000 instructions',
          'The CPU’s own cache events (see perf list)',
          'The generic cache-misses event is not always an L1, L2 or L3 count.'
        ],
        [
          'Load latency',
          'perf mem (AMD IBS, Arm SPE, Intel load-latency sampling)',
          'Each vendor samples and weights loads differently.'
        ],
        [
          'Cache lines bouncing between cores',
          'perf c2c on a multithreaded program',
          'Support depends on the CPU and kernel.'
        ],
        [
          'Full queues',
          'Throughput and latency sweeps, plus stall events',
          'Real queue occupancy is rarely visible. Test one explanation against another.'
        ],
        [
          'Useful vs total bandwidth',
          'Memory-controller events, where documented',
          'Caches, ownership reads and prefetches change the bytes on the bus.'
        ]
      ]
    );
    sources(parent, [
      ['perf mem', 'https://man7.org/linux/man-pages/man1/perf-mem.1.html'],
      SOURCES.stat,
      SOURCES.ibs,
      SOURCES.bench
    ]);
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
    validateMeasurement: validateMeasurement
  };
  App.LabUI = {
    text: text,
    table: table,
    select: select,
    metric: metric,
    badge: badge,
    code: code,
    checkpoint: checkpoint,
    model: model,
    sources: sources,
    native: native,
    importInto: importInto
  };
  [
    [
      'bandwidth',
      'bandwidth',
      'Bytes moved per second. Say which bytes: the ones the program uses, the 64-byte lines moved, or the bytes on the DRAM bus.'
    ],
    [
      'throughput',
      'throughput',
      'Operations finished per second. Independent operations can overlap, so throughput can rise while each operation stays just as slow.'
    ],
    [
      'cpi',
      'CPI',
      'Core cycles per retired instruction, counted over the same interval on the same thread. The inverse of IPC.'
    ],
    [
      'mpki',
      'MPKI',
      'Misses per thousand retired instructions. Say which cache, and whether prefetches and instruction fetches count.'
    ],
    [
      'occupancy',
      'queue occupancy',
      'How many entries of a queue are in use. The average is taken over time.'
    ],
    [
      'backpressure',
      'backpressure',
      'A full queue stops the stage that feeds it. The stall can spread backwards all the way to dispatch or fetch.'
    ],
    [
      'little',
      'Little’s law',
      'Average requests in flight = completion rate × average time per request. It holds for any stable system measured over one consistent boundary.'
    ],
    [
      'p99',
      'p99 latency',
      'The latency that 99 % of samples are faster than. A p99 of run averages says nothing about single slow loads.'
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
    lede: 'One slow load and many overlapping loads are different questions. Predict how much overlap a memory system needs, run a small machine with finite queues, then measure your own computer.',
    points: [
      'Latency, throughput and bandwidth answer different questions.',
      'Finite queues decide where overlap stops.',
      'The same experiments run natively on Linux, on any x86-64 or Arm machine.'
    ],
    build: function (root) {
      var P = App.P;
      vocabulary(
        P.sec(root, 'vocabulary', 'Name the quantity', 'Latency, throughput and bandwidth are different numbers.')
      );
      littleLaw(
        P.sec(
          root,
          'predict',
          'Predict the concurrency',
          'How many loads must be in flight to reach a given bandwidth?'
        )
      );
      streamLab(
        P.sec(
          root,
          'queues',
          'Run a finite machine',
          'Change one resource and find which queue fills first.'
        )
      );
      measurement(
        P.sec(
          root,
          'measure',
          'How the benchmarks work',
          'What the native harness measures, what to keep fixed, and how to dig deeper with perf.'
        )
      );
      var last = P.sec(
        root,
        'explain',
        'Explain a surprising result',
        'Change one thing at a time before naming a cause.'
      );
      table(
        last,
        ['You see', 'One possible reason'],
        [
          [
            'Many misses but high throughput',
            'Independent misses overlap, so each one costs less than its latency.'
          ],
          [
            'A busy memory link but low useful bandwidth',
            'Each 64-byte line brings back only one 8-byte pointer.'
          ],
          [
            'Latency rises when you add more work',
            'Bandwidth is already saturated; the extra requests just wait in queues.'
          ]
        ]
      );
      text(
        'p',
        last,
        'When a measurement disagrees with the model, check the boring things first: what the timer covers, the generated code, where memory lives and the clock speed. Then change one resource or one property of the workload and see if the result moves the way your explanation predicts.'
      );
      h(
        'p',
        null,
        last,
        'Go back to the <a href="#e2e/critical">dependency graph</a>, the <a href="#hier/parallel">hierarchy walkthrough</a> or the <a href="#core/run">core simulator</a>.'
      );
    }
  });
})();
