(function () {
  'use strict';
  var U = App.LabUI,
    h = App.h,
    s = App.s,
    M = ControllerLab;
  function build(root) {
    var sec = App.labSection(
      root,
      'controller',
      'Inside the memory controller',
      'Requests wait in queues and a scheduler picks the next DRAM command. Change the policy and watch speed and fairness trade off.'
    );
    U.model(
      sec,
      'The main DRAM timing rules, with small made-up timings in controller clocks. Each request names its channel, rank, bank and row directly, so there is no address hashing. Channels have their own buses; ranks on one channel share them.'
    );
    U.checkpoint(
      sec,
      'If the controller serves newer row hits first, can total throughput go up while an older request waits longer?',
      ['Yes: speed and fairness can conflict', 'No: if the total is faster, every request is faster'],
      0,
      'Compare the per-request waits and bypass counts, not just the finish time. The age limit trades some speed back for fairness.'
    );
    var o = {
        channels: 1,
        ranks: 1,
        banks: 4,
        groups: 2,
        readQ: 8,
        writeQ: 8,
        high: 6,
        low: 2,
        policy: 'frfcfs',
        arbitration: 'drain',
        age: 80,
        REFI: 0,
        RFC: 24
      },
      work = { pattern: 'locality', spacing: 2, writes: 25, count: 48 },
      custom = false,
      current = [],
      r;
    function group(title) {
      var g = h('div', { class: 'lab-group' }, sec);
      U.text('div', g, title, { class: 'lab-group-title' });
      return h('div', { class: 'perf-controls' }, g);
    }
    var gSched = group('Scheduler'),
      gLayout = group('Channels, banks and queues'),
      gWork = group('Requests'),
      gRefresh = group('Refresh'),
      controls = gWork;
    function knob(key, label, values, into) {
      U.select(into, label, values, o[key], function (v) {
        o[key] = isNaN(Number(v)) ? v : +v;
        if (key === 'banks') o.groups = Math.min(2, o.banks);
        run();
      });
    }
    knob(
      'policy',
      'Controller scheduling',
      [
        ['fcfs', 'FCFS: oldest request first'],
        ['frfcfs', 'FR-FCFS: ready row hits first, then oldest']
      ],
      gSched
    );
    knob(
      'arbitration',
      'Read/write arbitration',
      [
        ['arrival', 'One shared queue, in arrival order'],
        ['drain', 'Separate read and write queues; writes drain in bursts']
      ],
      gSched
    );
    knob('age', 'Age limit (clocks; 0 = off)', [0, 40, 80, 160], gSched);
    knob('channels', 'Independent channels', [1, 2], gLayout);
    knob('ranks', 'Ranks per channel', [1, 2], gLayout);
    knob('banks', 'Banks per rank', [1, 2, 4, 8], gLayout);
    knob('readQ', 'Read queue entries', [2, 4, 8, 16], gLayout);
    knob('writeQ', 'Write queue entries', [8, 16], gLayout);
    knob('high', 'Start draining writes at', [4, 6, 8], gLayout);
    knob('low', 'Stop draining writes at', [0, 2, 4], gLayout);
    [
      [
        'pattern',
        'Generated access pattern',
        [
          ['locality', 'Four accesses per open row'],
          ['stream', 'New rows spread over banks'],
          ['conflict', 'Alternating rows in one bank']
        ]
      ],
      ['spacing', 'Clocks between arrivals', [0, 1, 2, 4, 8, 16, 32]],
      ['writes', 'Write fraction (%)', [0, 25, 50, 75, 100]]
    ].forEach(function (a) {
      U.select(controls, a[1], a[2], work[a[0]], function (v) {
        work[a[0]] = a[0] === 'pattern' ? v : +v;
        custom = false;
        run();
      });
    });
    knob('REFI', 'Refresh interval (0 = off)', [0, 64, 128, 256], gRefresh);
    knob('RFC', 'Refresh busy time', [12, 24, 40], gRefresh);
    var advanced = h('div', { class: 'lab-group' }, sec);
    U.text('div', advanced, 'DRAM timing rules', { class: 'lab-group-title' });
    var timed = h('div', { class: 'perf-controls' }, advanced);
    [
      ['FAW', 'Four-activate window (tFAW)', [8, 12, 24, 48]],
      ['WR', 'Write recovery before close (tWR)', [2, 6, 12]],
      ['RTW', 'Read → write bus gap', [1, 3, 8]],
      ['WTRS', 'Write → read, other bank group', [1, 3, 5]],
      ['WTRL', 'Write → read, same bank group', [5, 8, 12]]
    ].forEach(function (a) {
      o[a[0]] = M.defaults[a[0]];
      U.select(timed, a[1], a[2], o[a[0]], function (v) {
        o[a[0]] = +v;
        run();
      });
    });
    U.table(
      advanced,
      ['Timing rule', 'What it enforces here'],
      [
        [
          'tRCD / tRP / tRAS / tRC',
          'Open → read or write; close → open; open → close; open → next open, per bank'
        ],
        ['tRRD_S/L and tFAW', 'Gap between row opens in a rank, and at most four opens per window'],
        ['tCCD_S/L', 'Gap between reads or writes; longer inside one bank group'],
        ['tRTP / tWR', 'Read → close, and end of write data → close'],
        ['tWTR_S/L', 'End of a write burst → next read on the same rank'],
        ['Read ↔ write, rank switches', 'Extra gaps on the shared data bus (simplified)'],
        [
          'Refresh',
          'A rank due for refresh takes no new work, finishes what it started, closes its rows, then refreshes'
        ]
      ]
    );
    U.text(
      'p',
      advanced,
      'One command per channel per clock. FCFS can leave ready work stuck behind the oldest request; FR-FCFS picks among commands that are ready now and prefers reads and writes to open rows. The age limit favors old requests but is not a hard guarantee. Not modeled: power states, auto-precharge, every command-pair rule, ECC, link training and return queues.',
      { class: 'note' }
    );
    U.sources(advanced, [
      [
        'gem5 DRAM controller model',
        'https://gem5.googlesource.com/public/gem5/+/bf238470726b4cc5c0b34fcb349d767726fe53bc/src/mem/DRAMCtrl.py'
      ]
    ]);
    var editor = h('details', { class: 'perf-details' }, sec);
    U.text('summary', editor, 'Edit the requests by hand');
    U.text(
      'p',
      editor,
      'One request per line: ID, arrival clock, channel, rank, bank, row, R or W. Each request moves its own 64-byte line.'
    );
    var input = h(
        'textarea',
        { rows: 8, class: 'cache-trace-input', 'aria-label': 'Controller request table' },
        editor
      ),
      actions = h('div', { class: 'perf-actions' }, editor);
    U.text('button', actions, 'Apply edited requests', { type: 'button' }).onclick = function () {
      custom = true;
      run();
    };
    U.text('button', actions, 'Regenerate requests', { type: 'button' }).onclick = function () {
      custom = false;
      run();
    };
    U.text('button', actions, 'Five-request example', { type: 'button' }).onclick =
      function () {
        input.value = 'A 0 0 0 0 3 R\nB 1 0 0 1 9 R\nC 2 0 0 0 3 R\nD 3 0 0 0 7 R\nE 4 0 0 1 9 W';
        custom = true;
        run();
      };
    var status = U.text('p', sec, '', { role: 'status' }),
      metrics = h('div', { class: 'perf-metrics' }, sec),
      explain = h('div', { class: 'perf-explanation' }, sec),
      state = h('div', { class: 'queue-state' }, sec),
      fig = h('figure', { class: 'perf-chart controller-timeline' }, sec),
      svg = s(
        'svg',
        {
          viewBox: '0 0 900 260',
          role: 'img',
          'aria-label': 'Controller command markers and non-overlapping read and write data bursts'
        },
        fig
      );
    var step = App.CacheUI.replayControls(sec, 'Controller clock', function (i) {
      if (!r) return;
      var snap = r.trace[i];
      state.replaceChildren();
      U.text(
        'h3',
        state,
        'Clock ' + snap.t + ' · ' + snap.completed + '/' + r.requests.length + ' completed'
      );
      U.table(
        state,
        ['Channel', 'Read queue', 'Write queue', 'Arbitration'],
        snap.channels.map(function (c, k) {
          return [
            k,
            c.read.join(' ') || 'empty',
            c.write.join(' ') || 'empty',
            r.p.arbitration === 'arrival'
              ? 'combined'
              : c.mode === 'R'
                ? 'read mode'
                : 'write drain'
          ];
        })
      );
      var rows = [];
      snap.channels.forEach(function (c, ci) {
        c.ranks.forEach(function (rank, ri) {
          rank.banks.forEach(function (b, bi) {
            rows.push([
              ci + ' / ' + ri + ' / ' + bi,
              rank.refreshUntil > snap.t
                ? 'refresh until ' + rank.refreshUntil
                : rank.pending
                  ? 'quiescing for refresh'
                  : 'available',
              b.row === null ? 'closed' : 'row ' + b.row,
              b.reserved || 'none'
            ]);
          });
        });
      });
      U.table(state, ['Channel / rank / bank', 'Rank state', 'Open row', 'Prepared request'], rows);
      var now = r.commands.filter(function (c) {
        return c.t === snap.t;
      });
      U.text(
        'p',
        state,
        'Commands now: ' +
          (now
            .map(function (c) {
              return (
                c.name +
                ' ' +
                (c.id || 'maintenance') +
                ' on ch' +
                c.channel +
                '/rank' +
                c.rank +
                (c.bank !== null ? '/bank' + c.bank : '')
              );
            })
            .join(' · ') || 'none; timing, policy or idle input prevents issue')
      );
      timeline(snap.t);
    }, state);
    U.text(
      'figcaption',
      fig,
      'An 80-clock window. Ticks are commands (hover for details); bars are 64-byte data bursts, green for reads and violet for writes. Bursts on one channel never overlap; separate channels transfer at the same time.'
    );
    var latency = h('div', null, sec),
      detail = h('details', { class: 'perf-details' }, sec);
    U.text('summary', detail, 'Show every request and command');
    var tables = h('div', null, detail);
    var buttons = h('div', { class: 'perf-actions' }, sec),
      compare = U.text('button', buttons, 'Compare both schedulers on this trace', {
        type: 'button'
      }),
      sweep = U.text('button', buttons, 'Sweep offered load', { type: 'button' }),
      download = U.text('button', buttons, 'Export model result JSON', { type: 'button' }),
      comparison = h('div', { class: 'controller-comparison' }, sec);
    compare.onclick = function () {
      if (!r) return;
      comparison.replaceChildren();
      var rows = ['fcfs', 'frfcfs'].map(function (policy) {
        var x = M.simulate(current, Object.assign({}, o, { policy: policy, trace: false }));
        return [
          policy,
          x.cycles,
          x.latency.p95,
          x.readP95 === null ? 'n/a' : x.readP95,
          Math.max.apply(
            null,
            x.requests.map(function (q) {
              return q.bypassed;
            })
          ),
          x.stats.turnarounds
        ];
      });
      U.table(
        comparison,
        ['Policy', 'Finish interval', 'All p95', 'Read p95', 'Max bypasses', 'Direction switches'],
        rows
      );
      U.text(
        'p',
        comparison,
        'Both runs use the same requests and timing rules. With write draining on, FCFS orders each queue separately.'
      );
    };
    sweep.onclick = function () {
      comparison.replaceChildren();
      var rows = [32, 16, 8, 4, 2, 1, 0].map(function (spacing) {
        var w = Object.assign({}, work, o, { spacing: spacing }),
          x = M.simulate(M.workload(w), Object.assign({}, o, { trace: false }));
        return [
          spacing,
          x.bandwidth.toFixed(2),
          x.latency.mean.toFixed(1),
          x.latency.p95,
          x.stats.readQueueFull,
          x.stats.writeQueueFull
        ];
      });
      U.table(
        comparison,
        [
          'Arrival spacing',
          'Line B/clock',
          'Mean latency',
          'p95 latency',
          'Read full clocks',
          'Write full clocks'
        ],
        rows
      );
      U.text(
        'p',
        comparison,
        'The sweep regenerates 48 requests of the chosen pattern (not your edited table). Bandwidth levels off while waiting keeps growing.'
      );
    };
    download.onclick = function () {
      if (!r) return;
      var blob = new Blob(
          [
            JSON.stringify(
              {
                schema: 'memory-lab-controller-model-v1',
                evidence: 'simulation, not a hardware measurement',
                parameters: r.p,
                requests: r.requests,
                commands: r.commands,
                bursts: r.bursts,
                stats: r.stats
              },
              null,
              2
            )
          ],
          { type: 'application/json' }
        ),
        url = URL.createObjectURL(blob),
        a = U.text('a', buttons, '', { href: url, download: 'controller-model.json' });
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
    };
    function timeline(clock) {
      svg.replaceChildren();
      var start = Math.max(0, clock - 20),
        end = start + 80,
        height = 50 + r.p.channels * 100;
      svg.setAttribute('viewBox', '0 0 900 ' + height);
      function x(t) {
        return 80 + (t - start) * 10;
      }
      for (var n = 0; n <= 8; n++) {
        var tick = start + n * 10;
        s('line', { x1: x(tick), x2: x(tick), y1: 20, y2: height - 25, class: 'perf-grid' }, svg);
        s(
          'text',
          { x: x(tick), y: height - 7, 'text-anchor': 'middle', class: 's' },
          svg,
          String(tick)
        );
      }
      for (var channel = 0; channel < r.p.channels; channel++) {
        var y = 40 + channel * 100;
        s('text', { x: 4, y: y, class: 's' }, svg, 'CH ' + channel);
        s('text', { x: 4, y: y + 20, class: 's' }, svg, 'CMD');
        s('text', { x: 4, y: y + 51, class: 's' }, svg, 'DATA');
      }
      r.commands
        .filter(function (c) {
          return c.t >= start && c.t < end;
        })
        .forEach(function (c) {
          var g = s('g', null, svg);
          s(
            'title',
            null,
            g,
            c.name +
              ' ' +
              (c.id || 'refresh/precharge') +
              ' · clock ' +
              c.t +
              ' · rank ' +
              c.rank +
              ' bank ' +
              c.bank
          );
          s(
            'line',
            {
              x1: x(c.t),
              x2: x(c.t),
              y1: 48 + c.channel * 100,
              y2: 64 + c.channel * 100,
              stroke: c.name === 'REF' ? 'var(--bad)' : 'var(--act)',
              'stroke-width': 2
            },
            g
          );
        });
      r.bursts
        .filter(function (b) {
          return b.end > start && b.start < end;
        })
        .forEach(function (b) {
          var lo = Math.max(start, b.start),
            hi = Math.min(end, b.end),
            g = s('g', null, svg);
          s('title', null, g, b.id + ' ' + b.type + ' ' + b.start + '–' + b.end);
          s(
            'rect',
            {
              x: x(lo),
              y: 72 + b.channel * 100,
              width: (hi - lo) * 10,
              height: 24,
              rx: 3,
              class: b.type === 'R' ? 'a2b' : 'a3b'
            },
            g
          );
          if (hi - lo >= 3)
            s('text', { x: x(lo) + 3, y: 88 + b.channel * 100, class: 's' }, g, b.id);
        });
      s(
        'line',
        { x1: x(clock), x2: x(clock), y1: 18, y2: height - 24, class: 'trace-marker' },
        svg
      );
    }
    function run() {
      try {
        if (custom) {
          current = input.value
            .trim()
            .split(/\n+/)
            .map(function (line) {
              var a = line.trim().split(/[\s,]+/);
              if (a.length !== 7) throw new Error('Each request needs exactly 7 fields.');
              return {
                id: a[0],
                arrival: Number(a[1]),
                channel: Number(a[2]),
                rank: Number(a[3]),
                bank: Number(a[4]),
                row: Number(a[5]),
                type: a[6].toUpperCase()
              };
            });
        } else {
          current = M.workload(Object.assign({}, work, o));
          input.value = current
            .map(function (x) {
              return [x.id, x.arrival, x.channel, x.rank, x.bank, x.row, x.type].join(' ');
            })
            .join('\n');
        }
        r = M.simulate(current, o);
        sec._controllerResult = r;
        compare.disabled = false;
        sweep.disabled = false;
        download.disabled = false;
        status.textContent =
          'Simulation · ' +
          (custom ? 'edited' : 'generated') +
          ' trace · ' +
          r.requests.length +
          ' requests · times in controller clocks';
        metrics.replaceChildren();
        explain.replaceChildren();
        tables.replaceChildren();
        latency.replaceChildren();
        comparison.replaceChildren();
        U.metric(
          metrics,
          'Finished after',
          r.cycles + ' clocks',
          'First arrival to last data beat'
        );
        U.metric(
          metrics,
          'Line bandwidth',
          r.bandwidth.toFixed(2) + ' B/clock',
          'Data bus busy ' + (100 * r.busUtil).toFixed(1) + '% of the time'
        );
        U.metric(
          metrics,
          'Mean / p95 request latency',
          r.latency.mean.toFixed(1) + ' / ' + r.latency.p95,
          'Arrival to last data beat, queueing included'
        );
        U.metric(
          metrics,
          'Reads / writes',
          r.stats.readBytes + ' / ' + r.stats.writeBytes + ' B',
          'Each request moves one 64-byte line'
        );
        U.text(
          'p',
          explain,
          'Row hit / closed / conflict at first command: ' +
            r.stats.rowHit +
            ' / ' +
            r.stats.rowClosed +
            ' / ' +
            r.stats.rowConflict +
            '. Data-bus direction changes: ' +
            r.stats.turnarounds +
            '. Refresh commands: ' +
            r.stats.refreshes +
            '. Read p95: ' +
            (r.readP95 === null ? 'no reads' : r.readP95 + ' clocks') +
            '. Even row hits still wait for queues, the bus and refresh.'
        );
        U.table(
          latency,
          ['Latency distribution', 'Mean', 'p50', 'p95', 'p99', 'Max'],
          [
            [
              'All requests',
              r.latency.mean.toFixed(1),
              r.latency.p50,
              r.latency.p95,
              r.latency.p99,
              r.latency.max
            ]
          ]
        );
        U.text(
          'p',
          latency,
          'Percentiles over single requests, from arrival at the controller to the last data beat. The trip through the caches and the interconnect is not included.'
        );
        U.table(
          tables,
          [
            'Request / type',
            'Arrival → admit → first → column → done',
            'Row state',
            'Admission / queue / command interval',
            'Bypassed'
          ],
          r.requests.map(function (q) {
            return [
              q.id + ' ' + q.type,
              [q.arrival, q.admit, q.first, q.column, q.done].join(' → '),
              q.rowClass,
              [q.admissionWait, q.queueWait, q.commandInterval].join(' / '),
              q.bypassed
            ];
          })
        );
        U.table(
          tables,
          ['Clock', 'Command / request', 'Channel / rank / bank / row'],
          r.commands.map(function (c) {
            return [
              c.t,
              c.name + ' ' + (c.id || 'maintenance'),
              [
                c.channel,
                c.rank,
                c.bank === null ? '—' : c.bank,
                c.row === null ? '—' : c.row
              ].join(' / ')
            ];
          })
        );
        step.set(r.trace.length);
      } catch (e) {
        r = null;
        sec._controllerResult = null;
        compare.disabled = true;
        sweep.disabled = true;
        download.disabled = true;
        [metrics, explain, tables, latency, comparison, state, svg].forEach(function (el) {
          el.replaceChildren();
        });
        status.textContent = 'Could not run: ' + e.message;
      }
    }
    run();
    measurement(sec);
  }
  function validate(data) {
    if (
      !data ||
      data.schema !== 'memory-lab-loaded-v1' ||
      !data.context ||
      typeof data.context !== 'object' ||
      Array.isArray(data.context) ||
      !Array.isArray(data.samples) ||
      !data.samples.length ||
      data.samples.length > 5000
    )
      throw new Error('Expected memory-lab-loaded-v1 with context and 1–5000 samples.');
    data.samples.forEach(function (r) {
      if (!r || ['read', 'write'].indexOf(r.mode) < 0 || !Array.isArray(r.generators))
        throw new Error('Invalid loaded-latency case.');
      ['bytes_per_worker', 'steps', 'elapsed_ns', 'chunk_bytes'].forEach(function (k) {
        if (!Number.isSafeInteger(r[k]) || r[k] <= 0) throw new Error('Invalid ' + k);
      });
      if (
        r.bytes_per_worker % 65536 ||
        r.chunk_bytes !== 65536 ||
        !Number.isSafeInteger(r.chase_cpu) ||
        r.chase_cpu < 0 ||
        !Number.isSafeInteger(r.background_threads) ||
        r.background_threads < 0 ||
        r.background_threads > 7 ||
        r.generators.length !== r.background_threads
      )
        throw new Error('Invalid size or worker accounting.');
      var cpus = new Set([r.chase_cpu]);
      r.generators.forEach(function (g) {
        ['cpu', 'chunks_before', 'chunks_after', 'useful_bytes'].forEach(function (k) {
          if (!Number.isSafeInteger(g[k]) || g[k] < 0) throw new Error('Invalid generator ' + k);
        });
        if (
          cpus.has(g.cpu) ||
          g.chunks_after < g.chunks_before ||
          g.useful_bytes !== (g.chunks_after - g.chunks_before) * 65536
        )
          throw new Error('Invalid generator placement or byte accounting.');
        cpus.add(g.cpu);
      });
    });
    return data;
  }
  function measurement(sec) {
    var n = U.native(sec, {
        title: 'Loaded latency on your machine',
        what: 'One core chases pointers while other cores flood memory with reads or writes. You get the chase latency and the other cores’ bandwidth at each load level. Use more memory than your last-level cache holds, or you are measuring cache contention instead of DRAM.',
        command: 'python3 benchmarks/loaded.py --cpus 0,2,4,6 --output loaded-results.json',
        label: 'Import loaded-latency result JSON',
        aria: 'Loaded latency result JSON',
        empty: 'No loaded-latency hardware results loaded.',
        statusClass: 'loaded-status',
        outClass: 'loaded-results'
      }),
      input = n.input,
      status = n.status,
      out = n.out;
    function render(data, label) {
      validate(data);
      if (label) U.text('h3', out, label, { class: 'measurement-run-title' });
      var groups = {};
      data.samples.forEach(function (r) {
        var key = [r.chase_cpu, r.bytes_per_worker, r.background_threads, r.mode].join(' / ');
        (groups[key] || (groups[key] = [])).push(r);
      });
      status.textContent =
        'Measured · ' +
        String(data.context.cpu_model || 'unknown CPU') +
        ' · ' +
        (data.complete === true ? 'complete run' : 'partial / completion not recorded');
      U.table(
        out,
        [
          'Chase CPU / bytes per worker / generators / mode',
          'Trials',
          'Median chase ns/load',
          'p95 of trial ns/load',
          'Median generator useful GB/s (approx.)'
        ],
        Object.keys(groups)
          .sort()
          .map(function (k) {
            var rows = groups[k],
              ns = rows.map(function (r) {
                return r.elapsed_ns / r.steps;
              }),
              bw = rows.map(function (r) {
                return (
                  r.generators.reduce(function (n, g) {
                    return n + g.useful_bytes;
                  }, 0) / r.elapsed_ns
                );
              });
            return [
              k,
              rows.length,
              MeasurementBundle.stats(ns).median.toFixed(2),
              LabModel.quantile(ns, 0.95).toFixed(2),
              MeasurementBundle.stats(bw).median.toFixed(2)
            ];
          })
      );
      U.text(
        'p',
        out,
        'Whole-run averages from your machine. They show that latency rises under load, not why: row policy, queue sizes and DRAM-bus bytes are not visible from here.'
      );
      var details = h('details', null, out);
      U.text('summary', details, 'Show the recorded context');
      U.code(details, JSON.stringify(data.context, null, 2));
    }
    U.importInto(input, out, status, render);
    App.Measurements.bind('loaded', status, out, render);
  }
  App.extendChapter('dram', build);
  App.ControllerUI = { validate: validate };
})();
