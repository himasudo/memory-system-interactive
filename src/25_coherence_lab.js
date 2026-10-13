(function () {
  'use strict';
  var U = App.LabUI,
    h = App.h,
    s = App.s,
    M = CacheLab,
    teaching = App.CacheUI.teaching,
    transport = App.CacheUI.replayControls;
  function pressure(root) {
    var sec = App.labSection(
      root,
      'write-pressure',
      'When writebacks block fills',
      'A returning line needs room. If the line it evicts is dirty and the writeback queue is full, the fill waits, and so does everything behind it.'
    );
    teaching(
      sec,
      '32 stores to 32 new lines, a 4-line cache and an 8-cycle fetch. A fill entry stays busy until its line is installed. Writebacks drain one at a time into a simple sink, not a real DRAM controller.'
    );
    U.checkpoint(
      sec,
      'A fill has arrived, but its dirty victim can’t enter the writeback queue. Is the fill’s miss entry free again?',
      ['Yes, the data has arrived', 'No, it stays busy until the line is installed'],
      1,
      'Arriving, being installed and freeing the entry are three separate events.'
    );
    var o = { fill: 4, writeback: 2, drain: 12 },
      ctl = h('div', { class: 'perf-controls' }, sec);
    [
      ['fill', 'Fill entries', [1, 2, 4, 8]],
      ['writeback', 'Writeback entries', [1, 2, 4, 8]],
      ['drain', 'Cycles per 64-byte writeback', [2, 4, 12, 32]]
    ].forEach(function (a) {
      U.select(ctl, a[1], a[2], o[a[0]], function (v) {
        o[a[0]] = +v;
        draw();
      });
    });
    var metrics = h('div', { class: 'perf-metrics' }, sec),
      state = h('div', null, sec),
      r,
      step = transport(sec, 'Fill / writeback cycle', function (i) {
        if (!r) return;
        var t = r.trace[i];
        state.replaceChildren();
        U.text(
          'h3',
          state,
          'Cycle ' +
            t.t +
            ' · ' +
            (t.blocked ? 'a fill is waiting for its dirty victim to leave' : 'nothing is blocked')
        );
        U.table(
          state,
          ['Resource', 'Occupancy / state'],
          [
            ['Fill entries', t.fill + ' / ' + r.p.fill],
            ['Writeback entries', t.wb + ' / ' + r.p.writeback],
            ['Resident dirty lines', t.resident.join(', ') || 'none'],
            ['Installed / writebacks completed', t.installed + ' / ' + t.written]
          ]
        );
      }, state);
    function draw() {
      r = M.writePressure(o);
      sec._pressureResult = r;
      metrics.replaceChildren();
      U.metric(
        metrics,
        'Fills waiting',
        r.fillBlocked + ' cycles',
        'No room in the writeback queue'
      );
      U.metric(
        metrics,
        'New misses blocked',
        r.frontBlocked + ' cycles',
        'Every fill entry was busy'
      );
      U.metric(
        metrics,
        'Traffic to the next level',
        r.rfoBytes + r.writebackBytes + ' B',
        r.rfoBytes + ' B RFO + ' + r.writebackBytes + ' B writeback'
      );
      U.metric(
        metrics,
        'Finished after',
        r.cycles + ' cycles',
        r.dirtyResident + ' dirty lines still in the cache at the end'
      );
      step.set(r.trace.length);
    }
    draw();
    h(
      'p',
      null,
      sec,
      'Real caches have other buffer sizes and replacement rules, and can combine writes. The <a href="#dram/controller">DRAM controller lab</a> adds reads and writes competing for one bus.'
    );
  }
  function writeTraffic(root) {
    var sec = App.labSection(
      root,
      'write-traffic',
      'How many bytes does a store really move?',
      'Writing 8 bytes can read a whole line first and write a whole line back later.'
    );
    teaching(
      sec,
      'A fully associative LRU cache with 64-byte lines; dirty lines are written back at the end. The non-temporal column is the best case: whole aligned lines, fully combined, never read first.'
    );
    var o = { lines: 16, cache: 8, passes: 2, useful: 64 },
      ctl = h('div', { class: 'perf-controls' }, sec);
    [
      ['lines', 'Working-set lines', [4, 8, 16, 32]],
      ['cache', 'Model cache lines', [4, 8, 16]],
      ['passes', 'Full passes', [1, 2, 4, 8]],
      ['useful', 'Useful store bytes per line', [8, 64]]
    ].forEach(function (a) {
      U.select(ctl, a[1], a[2], o[a[0]], function (v) {
        o[a[0]] = +v;
        draw();
      });
    });
    var out = h('div', null, sec);
    function draw() {
      var ops = [];
      for (var pass = 0; pass < o.passes; pass++)
        for (var line = 0; line < o.lines; line++)
          ops.push({ addr: line * 64, size: o.useful, op: 'write' });
      var r = M.replay(ops, { sets: 1, ways: o.cache, line: 64, drain: true });
      out.replaceChildren();
      sec._trafficResult = r;
      U.table(
        out,
        ['Bytes', 'Normal stores', 'Non-temporal stores, best case'],
        [
          ['Useful bytes', o.lines * o.passes * o.useful, o.lines * o.passes * o.useful],
          [
            'Read-for-ownership bytes',
            r.counts.rfoBytes,
            o.useful === 64 ? 0 : 'not modeled for partial lines'
          ],
          [
            'Written back, after the final drain',
            r.counts.writebackBytes,
            o.useful === 64
              ? o.lines * o.passes * 64
              : 'depends on how the CPU combines partial lines'
          ],
          [
            'Total line traffic',
            r.counts.totalLineBytes,
            o.useful === 64 ? o.lines * o.passes * 64 : 'not modeled'
          ]
        ]
      );
      U.text(
        'p',
        out,
        o.lines <= o.cache
          ? 'The data fits: later passes hit lines that are already dirty, and each line is written back once at the end. Non-temporal stores would throw that reuse away.'
          : 'The data doesn’t fit, so every pass reads each line for ownership and writes it back later. Writing whole lines with non-temporal stores can skip those ownership reads.'
      );
    }
    draw();
    U.checkpoint(
      sec,
      'Do byte counts alone tell you whether non-temporal stores will be faster?',
      ['Yes, fewer bytes is always faster', 'No, reuse and queue limits matter too'],
      1,
      'Byte counts are a bound, not a time. Measure with different data sizes, pass counts and alignments.'
    );
  }
  function ownership(root) {
    var sec = App.labSection(
      root,
      'transactions',
      'Atomics and false sharing',
      'Two threads update different counters. Whether the counters share a cache line decides how much traffic that causes.'
    );
    teaching(
      sec,
      'The MOESI protocol from the walkthrough above, now with its messages: GetS, GetM, data and acknowledgements. IS, IM, SM and OM mean a request is still in flight. Operations run one at a time; ticks show order, not time.'
    );
    U.checkpoint(
      sec,
      'Two cores update different 8-byte counters that sit in the same 64-byte line. Can that still move the line back and forth?',
      ['No, their values are independent', 'Yes, ownership is tracked per line'],
      1,
      'Coherence works on whole lines. Padding each counter onto its own line removes the sharing, even though the program logic didn’t change.'
    );
    var o = { placement: 'two', layout: 'packed', kind: 'add', flush: false },
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(
      ctl,
      'Thread placement',
      [
        ['one', 'One thread'],
        ['smt', 'Two SMT siblings, one physical core'],
        ['two', 'Two physical cores'],
        ['four', 'Four physical cores']
      ],
      'two',
      function (v) {
        o.placement = v;
        draw();
      }
    );
    U.select(
      ctl,
      'Counter layout',
      [
        ['same', 'One shared counter'],
        ['packed', 'Separate counters in one line'],
        ['padded', 'Separate 64-byte lines']
      ],
      'packed',
      function (v) {
        o.layout = v;
        draw();
      }
    );
    U.select(
      ctl,
      'Operation sequence',
      [
        ['add', 'Atomic fetch_add'],
        ['cas', 'CAS with stale expected value and retry'],
        ['store', 'Ordinary stores to separate counters'],
        ['peer', 'One writer, then peer readers']
      ],
      'add',
      function (v) {
        o.kind = v;
        draw();
      }
    );
    U.select(
      ctl,
      'Final dirty eviction',
      [
        [0, 'Keep cache ownership'],
        [1, 'Write back at the end']
      ],
      0,
      function (v) {
        o.flush = !!+v;
        draw();
      }
    );
    var metrics = h('div', { class: 'perf-metrics' }, sec),
      note = h('div', { class: 'perf-explanation' }, sec),
      state = h('div', { class: 'coherence-state' }, sec),
      r,
      ops;
    var step = transport(sec, 'Coherence event', function (i) {
      if (!r) return;
      var e = r.events[i];
      state.replaceChildren();
      U.text('h3', state, 'Event ' + (i + 1) + ' / ' + r.events.length + ' · ' + e.label);
      U.text(
        'p',
        state,
        'Logical tick ' +
          e.t +
          ' · operation ' +
          (e.op + 1) +
          ' · line ' +
          e.key +
          (e.pending.length
            ? ' · waiting for acknowledgements from cores ' + e.pending.join(', ')
            : '')
      );
      var cards = h('div', { class: 'coherence-cards' }, state);
      for (var c = 0; c < r.p.cores; c++) {
        var card = h('div', { class: 'perf-metric' }, cards);
        U.text('strong', card, 'Core ' + c);
        Object.keys(e.lines).forEach(function (k) {
          U.text('p', card, 'Line ' + k + ': ' + e.lines[k].states[c]);
        });
      }
      U.table(
        state,
        ['Line', 'Current values, words 0–7', 'Memory, words 0–7'],
        Object.keys(e.lines).map(function (k) {
          return [k, e.lines[k].values.join(' · '), e.lines[k].memory.join(' · ')];
        })
      );
      U.text(
        'p',
        state,
        'A dirty cache can hold the newest value while memory still has an old one.'
      );
    }, state);
    function draw() {
      var threads = o.placement === 'one' ? 1 : o.placement === 'four' ? 4 : 2,
        cores = o.placement === 'smt' ? 1 : threads,
        values = {},
        script = [];
      function word(t) {
        return o.layout === 'same' ? 0 : o.layout === 'packed' ? t : t * 8;
      }
      if (o.kind === 'peer') {
        script.push({ core: 0, word: 0, kind: 'store', value: 7 });
        for (var t = 1; t < threads; t++)
          script.push({ core: o.placement === 'smt' ? 0 : t, word: 0, kind: 'read' });
      } else
        for (var round = 0; round < 4; round++)
          for (var thread = 0; thread < threads; thread++) {
            var w = word(thread),
              core = o.placement === 'smt' ? 0 : thread,
              v = values[w] || 0;
            if (o.kind === 'cas') {
              script.push({ core: core, word: w, kind: 'cas', expected: 0, value: 1 });
              if (v !== 0)
                script.push({ core: core, word: w, kind: 'cas', expected: v, value: v + 1 });
              values[w] = v + 1;
            } else {
              script.push({ core: core, word: w, kind: o.kind, value: round + 1 });
              values[w] = v + 1;
            }
          }
      ops = script;
      r = M.coherence(ops, { cores: cores, flush: o.flush });
      sec._coherenceResult = r;
      metrics.replaceChildren();
      note.replaceChildren();
      U.metric(
        metrics,
        'Atomic operations / failed CAS',
        r.stats.atomics + ' / ' + r.stats.failedCAS,
        'A retry costs work even if the line stays put'
      );
      U.metric(
        metrics,
        'Ownership handoffs',
        String(r.stats.ownershipMoves),
        'Write permission taken from another core'
      );
      U.metric(
        metrics,
        'Invalidations / acknowledgements',
        r.stats.invalidations + ' / ' + r.stats.acks,
        'One acknowledgement per invalidated copy'
      );
      U.metric(
        metrics,
        'Data from a core / from home',
        r.stats.peerBytes + ' / ' + r.stats.homeBytes + ' B',
        'Home is the shared cache or memory'
      );
      U.text(
        'p',
        note,
        'Here a failed CAS still takes write permission. That is this model’s choice, not a rule of C or of the instruction set. The “ordinary stores” option shows coherence traffic only: in C, two threads writing the same plain variable is a data race.'
      );
      if (o.placement === 'smt')
        U.text(
          'p',
          note,
          'Both threads share one core’s cache, so the line never moves between cores. They still take turns on the same atomic and compete for the core’s resources (see the SMT lab in the core chapter).'
        );
      if (o.kind === 'peer')
        U.text(
          'p',
          note,
          'This mode ignores the layout setting. The writer’s line goes from M to O: the writer keeps the newest copy, readers get S copies from it, and stale memory is never read.'
        );
      step.set(r.events.length);
    }
    draw();
    U.text('h3', sec, 'Why the in-between states exist');
    U.table(
      sec,
      ['Moment', 'Why an extra state is needed', 'In this lab'],
      [
        [
          'Read request sent, data not back yet',
          'The line is not a usable S copy yet, but it is not plain I either',
          'IS marks the request in flight'
        ],
        [
          'Upgrade sent, acknowledgements not back',
          'Writing now could leave an old copy somewhere else',
          'SM and OM wait for every invalidation'
        ],
        [
          'Another write or probe arrives mid-change',
          'Data, permission and messages can all be in flight at once',
          'Real protocols queue, retry or reject it; this lab runs one operation at a time'
        ],
        [
          'Store retires before it owns the line',
          'Retiring and becoming visible to other cores are separate steps',
          'The store waits in the store buffer; nothing is written to DRAM'
        ]
      ]
    );
    measurement(sec);
  }
  function validate(data) {
    if (
      !data ||
      data.schema !== 'memory-lab-sharing-v1' ||
      !data.context ||
      typeof data.context !== 'object' ||
      Array.isArray(data.context) ||
      !Array.isArray(data.samples) ||
      !data.samples.length ||
      data.samples.length > 5000
    )
      throw new Error('Expected memory-lab-sharing-v1 with context and 1–5000 samples.');
    data.samples.forEach(function (r) {
      if (
        !r ||
        ['same', 'packed', 'padded'].indexOf(r.mode) < 0 ||
        ['add', 'cas'].indexOf(r.op) < 0
      )
        throw new Error('Unknown benchmark case.');
      ['threads', 'iterations', 'operations', 'elapsed_ns', 'checksum'].forEach(function (k) {
        if (!Number.isSafeInteger(r[k]) || r[k] <= 0) throw new Error('Invalid ' + k);
      });
      if (
        r.threads > 4 ||
        r.operations !== r.threads * r.iterations ||
        r.checksum !== r.operations ||
        !Number.isSafeInteger(r.cas_failures) ||
        r.cas_failures < 0 ||
        r.stride_bytes !== { same: 0, packed: 8, padded: 64 }[r.mode] ||
        r.line_bytes_assumed !== 64 ||
        !Array.isArray(r.observed_cpus) ||
        r.observed_cpus.length !== r.threads ||
        r.observed_cpus.some(function (v) {
          return !Number.isSafeInteger(v) || v < 0;
        })
      )
        throw new Error('Counter, layout or affinity validation failed.');
    });
    return data;
  }
  function measurement(sec) {
    var n = U.native(sec, {
        what: 'Threads update one shared counter, counters packed into one line, or counters padded onto separate lines, using atomic add and compare-and-swap. The result is nanoseconds per update for each layout and CPU placement. To see which lines bounce between cores, run perf c2c on a CPU that supports it.',
        command: 'python3 benchmarks/sharing.py --cpus 0,2 --output sharing-results.json',
        label: 'Import atomic-counter result JSON',
        aria: 'Atomic counter result JSON',
        empty: 'No hardware results loaded.',
        outClass: 'sharing-results'
      }),
      input = n.input,
      status = n.status,
      out = n.out;
    U.sources(n.box, [
      [
        'perf c2c',
        'https://kernel.googlesource.com/pub/scm/linux/kernel/git/frowand/linux/+/b72b5fecc1b8a2e595bd03d7d257c88ea3f9fd45/tools/perf/Documentation/perf-c2c.txt'
      ]
    ]);
    function render(d, label) {
      validate(d);
      if (label) U.text('h3', out, label, { class: 'measurement-run-title' });
      var groups = {};
      d.samples.forEach(function (v) {
        var key = [v.placement_id || '', v.threads, v.mode, v.op]
          .filter(function (v) {
            return v !== '';
          })
          .join(' / ');
        (groups[key] || (groups[key] = [])).push(v);
      });
      status.textContent =
        'Measured · ' +
        String(d.context.cpu_model || 'unknown CPU') +
        ' · ' +
        (d.complete === true ? 'complete run' : 'partial / completion not recorded');
      U.table(
        out,
        [
          d.context.placement_runs ? 'Placement / threads / layout / op' : 'Threads / layout / op',
          'Trials',
          'Median ns/update',
          'p95 of trial averages',
          'CAS retries / successful updates'
        ],
        Object.keys(groups)
          .sort()
          .map(function (k) {
            var a = groups[k],
              ns = a.map(function (v) {
                return v.elapsed_ns / v.operations;
              }),
              ops = a.reduce(function (n, v) {
                return n + v.operations;
              }, 0);
            return [
              k,
              a.length,
              MeasurementBundle.stats(ns).median.toFixed(2),
              LabModel.quantile(ns, 0.95).toFixed(2),
              (
                a.reduce(function (n, v) {
                  return n + v.cas_failures;
                }, 0) / ops
              ).toFixed(3)
            ];
          })
      );
      U.text(
        'p',
        out,
        'ns per update is total time ÷ total updates, not the latency of one atomic. p95 is over whole-run averages. The benchmark does not count line transfers.'
      );
      var details = h('details', null, out);
      U.text('summary', details, 'Show the recorded context');
      U.code(details, JSON.stringify(d.context, null, 2));
    }
    U.importInto(input, out, status, render);
    App.Measurements.bind('sharing', status, out, render);
  }
  function locks(root) {
    var sec = App.labSection(
      root,
      'locks',
      'From atomics to locks',
      'How a lock waits matters as much as the atomic that takes it.'
    );
    teaching(
      sec,
      'Core 0 holds the lock; two other cores check it three times each, then core 0 releases it. “Retry CAS” asks for write permission on every check; “read first” only reads until the lock looks free. No thread scheduling.'
    );
    var policy = 'cas',
      ctl = h('div', { class: 'perf-controls' }, sec);
    U.select(
      ctl,
      'Waiting policy',
      [
        ['cas', 'Retry CAS on every poll'],
        ['read', 'Read-only polling, then CAS']
      ],
      'cas',
      function (v) {
        policy = v;
        draw();
      }
    );
    var out = h('div', null, sec);
    function draw() {
      var ops = [{ core: 0, word: 0, kind: 'store', value: 1 }];
      for (var i = 0; i < 3; i++)
        for (var core = 1; core < 3; core++)
          ops.push(
            policy === 'cas'
              ? { core: core, word: 0, kind: 'cas', expected: 0, value: 1 }
              : { core: core, word: 0, kind: 'read' }
          );
      ops.push(
        { core: 0, word: 0, kind: 'store', value: 0 },
        { core: 1, word: 0, kind: 'cas', expected: 0, value: 1 }
      );
      var r = M.coherence(ops, { cores: 3 });
      sec._lockResult = r;
      out.replaceChildren();
      U.table(
        out,
        ['In this trace', 'Count'],
        [
          ['Failed CAS operations', r.stats.failedCAS],
          ['Ownership handoffs', r.stats.ownershipMoves],
          ['Invalidations', r.stats.invalidations],
          ['Dirty-peer data bytes', r.stats.peerBytes]
        ]
      );
      U.text(
        'p',
        out,
        'Reading first keeps shared copies while the lock is held, so the line stops bouncing. The release still invalidates every copy, and all the waiters race for the lock at once.'
      );
    }
    draw();
    U.table(
      sec,
      ['Primitive', 'What the memory system sees', 'Also costs'],
      [
        [
          'CAS retry loop',
          'An atomic update, retried when the value changed',
          'Extra instructions per retry, even when the line stays local'
        ],
        [
          'Spinlock (read, then CAS)',
          'Shared reads while waiting, one ownership request to take it',
          'Burns CPU while waiting; needs acquire/release ordering to protect the data'
        ],
        [
          'Ticket lock',
          'One atomic to take a ticket, then reads of a “now serving” counter',
          'First come, first served, but every waiter still reads one hot line'
        ],
        ['Mutex, no contention', 'Usually one atomic in user space', 'Depends on the C library and mutex type'],
        [
          'Mutex, contended',
          'May spin briefly, then sleep in the kernel (futex)',
          'Sleeping and waking cost far more than the cache line'
        ]
      ]
    );
    U.text(
      'p',
      sec,
      'A lock protects other data only through memory ordering: release when unlocking, acquire when locking. Coherent caches alone do not make a racy C program correct.'
    );
    h(
      'p',
      null,
      sec,
      'Next: <a href="#coh/transactions">atomics and false sharing</a> and <a href="#core/smt">two threads on one core</a>.'
    );
  }
  App.extendChapter('hier', pressure);
  App.extendChapter('stores', function (root) {
    writeTraffic(root);
    locks(root);
  });
  App.extendChapter('coh', ownership);
  App.SharingLab = { validate: validate };
})();
