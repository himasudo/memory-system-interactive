/* Phase 6 mechanisms. Capacities, policies and clocks are explicit teaching
   choices; none of these engines identifies a proprietary CPU/device design. */
var AdvancedLab = (function () {
  'use strict';
  function integer(v, lo, hi, name) {
    if (!Number.isSafeInteger(v) || v < lo || v > hi) throw new Error('Invalid ' + name);
  }
  function choice(v, values, name) {
    if (values.indexOf(v) < 0) throw new Error('Invalid ' + name);
  }
  function touch(a, key, cap) {
    var i = a.indexOf(key),
      hit = i >= 0;
    if (hit) a.splice(i, 1);
    a.unshift(key);
    var victim = a.length > cap ? a.pop() : null;
    return { hit: hit, victim: victim };
  }
  function quantiles(a) {
    var b = a.slice().sort(function (x, y) {
      return x - y;
    });
    function q(f) {
      return b[Math.max(0, Math.ceil(f * b.length) - 1)] || 0;
    }
    return {
      mean:
        a.reduce(function (n, x) {
          return n + x;
        }, 0) / (a.length || 1),
      p50: q(0.5),
      p95: q(0.95),
      p99: q(0.99),
      max: b[b.length - 1] || 0
    };
  }

  /* Serial basic-block delivery, not a full branch predictor or OoO front end.
     An op-cache hit bypasses byte fetch/decode here, but not translation. */
  function instructionTrace(options) {
    var p = Object.assign(
      { blocks: 8, spacing: 64, bytes: 32, passes: 4, pattern: 'loop' },
      options
    );
    integer(p.blocks, 1, 128, 'blocks');
    integer(p.spacing, 16, 65536, 'block spacing');
    integer(p.bytes, 1, 128, 'block bytes');
    integer(p.passes, 1, 8, 'passes');
    choice(p.pattern, ['loop', 'targets'], 'fetch pattern');
    return Array.from({ length: p.blocks * p.passes }, function (_, i) {
      var k = i % p.blocks;
      if (p.pattern === 'targets') k = (k * 5 + Math.floor(i / p.blocks)) % p.blocks;
      return { addr: k * p.spacing, size: p.bytes, id: i };
    });
  }
  function fetch(input, options) {
    var p = Object.assign(
      {
        lines: 16,
        itlb: 8,
        opEntries: 0,
        fill: 24,
        walkRead: 8,
        decode: 4,
        delivery: 1,
        pageBytes: 4096
      },
      options
    );
    ['lines', 'itlb'].forEach(function (k) {
      integer(p[k], 1, 128, k);
    });
    integer(p.opEntries, 0, 128, 'op entries');
    ['fill', 'walkRead', 'decode', 'delivery'].forEach(function (k) {
      integer(p[k], 1, 500, k);
    });
    integer(p.pageBytes, 4096, 65536, 'page bytes');
    if (!Array.isArray(input) || !input.length || input.length > 1024)
      throw new Error('Use 1–1024 fetch blocks');
    var ic = [],
      tlb = [],
      ops = [],
      cycles = 0,
      stats = {
        blocks: input.length,
        iMisses: 0,
        itlbMisses: 0,
        walkReads: 0,
        opHits: 0,
        decodeBlocks: 0,
        fillBytes: 0,
        starved: 0,
        delivery: 0
      },
      trace = [];
    input.forEach(function (b, i) {
      integer(b.addr, 0, 16777216, 'PC');
      integer(b.size, 1, 128, 'block size');
      var start = cycles,
        events = [],
        wait = 0;
      for (
        var page = Math.floor(b.addr / p.pageBytes);
        page <= Math.floor((b.addr + b.size - 1) / p.pageBytes);
        page++
      ) {
        if (!touch(tlb, page, p.itlb).hit) {
          stats.itlbMisses++;
          stats.walkReads += 4;
          wait += 4 * p.walkRead;
          events.push('iTLB miss: four hierarchy-serviced walk reads for page ' + page);
        } else events.push('iTLB hit: page ' + page);
      }
      var key = b.addr + ':' + b.size,
        opHit = p.opEntries > 0 && touch(ops, key, p.opEntries).hit;
      if (opHit) {
        stats.opHits++;
        events.push('op-cache hit: bypass byte fetch and decode');
      } else {
        for (
          var line = Math.floor(b.addr / 64);
          line <= Math.floor((b.addr + b.size - 1) / 64);
          line++
        ) {
          if (!touch(ic, line, p.lines).hit) {
            stats.iMisses++;
            stats.fillBytes += 64;
            wait += p.fill;
            events.push('L1I miss: line ' + line + ' via L2 / LLC / memory aggregate');
          } else events.push('L1I hit: line ' + line);
        }
        wait += p.decode;
        stats.decodeBlocks++;
        events.push('decode block');
      }
      cycles += wait + p.delivery;
      stats.starved += wait;
      stats.delivery += p.delivery;
      trace.push({
        i: i,
        addr: b.addr,
        size: b.size,
        start: start,
        done: cycles,
        wait: wait,
        opHit: opHit,
        events: events,
        ic: ic.slice(),
        tlb: tlb.slice(),
        ops: ops.slice()
      });
    });
    return { p: p, stats: stats, cycles: cycles, trace: trace };
  }

  function prefetch(options) {
    var p = Object.assign(
      {
        enabled: true,
        streams: 1,
        count: 40,
        pattern: 'stream',
        distance: 4,
        cacheLines: 12,
        missEntries: 8,
        queue: 8,
        pfQueue: 16,
        latency: 40,
        busGap: 4,
        returnGap: 2,
        think: 6,
        priority: 'demand',
        trace: true
      },
      options
    );
    ['streams', 'missEntries', 'queue'].forEach(function (k) {
      integer(p[k], 1, 16, k);
    });
    integer(p.count, 4, 128, 'count per stream');
    integer(p.distance, 0, 32, 'prefetch distance');
    integer(p.cacheLines, 1, 128, 'cache lines');
    integer(p.pfQueue, 1, 128, 'prediction queue');
    ['latency', 'busGap', 'returnGap', 'think'].forEach(function (k) {
      integer(p[k], 1, 200, k);
    });
    choice(p.pattern, ['stream', 'stride', 'hot', 'chase'], 'prefetch pattern');
    choice(p.priority, ['demand', 'fifo'], 'request priority');
    var streams = Array.from({ length: p.streams }, function (_, id) {
      return {
        id: id,
        index: 0,
        next: 0,
        waiting: false,
        last: null,
        delta: null,
        confidence: 0,
        lines: Array.from({ length: p.count }, function (_, i) {
          return (
            id * 1000000 +
            (p.pattern === 'hot'
              ? i % 4
              : p.pattern === 'chase'
                ? (i * 37 + i * i * 17) % 65521
                : i * (p.pattern === 'stride' ? 3 : 1))
          );
        })
      };
    });
    var cache = [],
      active = [],
      predictions = [],
      outcomes = [],
      trace = [],
      requests = [],
      t = 0,
      nextBus = 0,
      nextReturn = 0,
      completed = 0,
      finish = 0,
      issued = 0;
    var stats = {
      demandHits: 0,
      demandMisses: 0,
      covered: 0,
      late: 0,
      pfIssued: 0,
      pfUseful: 0,
      pfUnusedEvicted: 0,
      pollutionEvictions: 0,
      predictionDrops: 0,
      missFull: 0,
      requestQueueFull: 0,
      peakMiss: 0,
      peakQueue: 0,
      peakPredictions: 0,
      occupancy: 0,
      busBytes: 0,
      demandBytes: 0,
      prefetchBytes: 0
    };
    function resident(line) {
      return cache.find(function (x) {
        return x.line === line;
      });
    }
    function flight(line) {
      return active.find(function (x) {
        return x.line === line;
      });
    }
    function use(req) {
      if (req && req.kind === 'prefetch' && !req.used) {
        req.used = true;
        stats.pfUseful++;
      }
    }
    function finishDemand(d) {
      var st = streams[d.stream];
      st.waiting = false;
      st.index++;
      st.next = t + p.think;
      completed++;
      finish = Math.max(finish, t);
      d.done = t;
      outcomes.push(d);
    }
    function predict(st, line) {
      var delta = st.last === null ? null : line - st.last;
      if (delta !== null && delta !== 0 && delta === st.delta) st.confidence++;
      else st.confidence = 0;
      st.delta = delta;
      st.last = line;
      if (!p.enabled || st.confidence < 1 || !delta) return;
      for (var n = 1; n <= p.distance; n++) {
        var target = line + n * delta;
        if (target < 0 || resident(target) || flight(target) || predictions.indexOf(target) >= 0)
          continue;
        if (predictions.length >= p.pfQueue) {
          stats.predictionDrops++;
          break;
        }
        predictions.push(target);
      }
    }
    function admit(line, kind, d) {
      var r = {
        id: issued++,
        line: line,
        kind: kind,
        admit: t,
        start: null,
        ready: null,
        done: null,
        used: false,
        waiters: d ? [d] : []
      };
      active.push(r);
      requests.push(r);
      if (kind === 'prefetch') stats.pfIssued++;
      return r;
    }
    while ((completed < p.streams * p.count || active.length) && t < 200000) {
      var ready = active
        .filter(function (r) {
          return r.ready !== null && r.ready <= t;
        })
        .sort(function (a, b) {
          return a.ready - b.ready || a.id - b.id;
        });
      if (ready.length && t >= nextReturn) {
        var r = ready[0];
        r.done = t;
        nextReturn = t + p.returnGap;
        active.splice(active.indexOf(r), 1);
        var old = resident(r.line);
        if (old) cache.splice(cache.indexOf(old), 1);
        cache.unshift({ line: r.line, prefetch: r.kind === 'prefetch', used: r.used, request: r });
        if (cache.length > p.cacheLines) {
          var victim = cache.pop();
          if (victim.prefetch && !victim.request.used) stats.pfUnusedEvicted++;
          if (r.kind === 'prefetch' && !victim.prefetch) stats.pollutionEvictions++;
        }
        r.waiters.forEach(finishDemand);
      }
      streams.forEach(function (st) {
        if (st.index >= p.count || st.waiting || t < st.next) return;
        var line = st.lines[st.index],
          c = resident(line),
          r = flight(line),
          d = {
            id: st.id + ':' + st.index,
            stream: st.id,
            line: line,
            arrival: st.next,
            admit: t,
            done: null,
            miss: !c,
            outcome: 'hit'
          };
        if (c) {
          cache.splice(cache.indexOf(c), 1);
          cache.unshift(c);
          stats.demandHits++;
          if (c.prefetch && !c.request.used) {
            stats.covered++;
            d.outcome = 'covered';
            use(c.request);
          }
          finishDemand(d);
          predict(st, line);
          return;
        }
        if (
          !r &&
          (active.length >= p.missEntries ||
            active.filter(function (x) {
              return x.start === null;
            }).length >= p.queue)
        )
          return;
        stats.demandMisses++;
        st.waiting = true;
        if (r) {
          r.waiters.push(d);
          d.outcome = r.kind === 'prefetch' ? 'late' : 'merged';
          if (r.kind === 'prefetch') {
            stats.late++;
            use(r);
          }
        } else {
          admit(line, 'demand', d);
          d.outcome = 'miss';
        }
        predict(st, line);
      });
      if (completed === p.streams * p.count) predictions = [];
      /* Predictions wait in a separate bounded detector queue. Once admitted,
         they consume exactly the same miss, transport and fill resources. */
      while (
        predictions.length &&
        active.length < p.missEntries &&
        active.filter(function (r) {
          return r.start === null;
        }).length < p.queue
      ) {
        var line = predictions.shift();
        if (!resident(line) && !flight(line)) admit(line, 'prefetch', null);
      }
      var queued = active.filter(function (r) {
        return r.start === null;
      });
      if (queued.length && t >= nextBus) {
        queued.sort(function (a, b) {
          return p.priority === 'demand'
            ? (a.kind === 'demand' ? 0 : 1) - (b.kind === 'demand' ? 0 : 1) || a.id - b.id
            : a.id - b.id;
        });
        var x = queued[0];
        x.start = t;
        x.ready = t + p.latency;
        nextBus = t + p.busGap;
        stats.busBytes += 64;
        stats[x.kind === 'demand' ? 'demandBytes' : 'prefetchBytes'] += 64;
      }
      queued = active.filter(function (r) {
        return r.start === null;
      });
      stats.peakMiss = Math.max(stats.peakMiss, active.length);
      stats.peakQueue = Math.max(stats.peakQueue, queued.length);
      stats.peakPredictions = Math.max(stats.peakPredictions, predictions.length);
      stats.occupancy += active.length;
      if (active.length === p.missEntries) stats.missFull++;
      if (queued.length === p.queue) stats.requestQueueFull++;
      if (p.trace !== false)
        trace.push({
          t: t,
          completed: completed,
          misses: active.map(function (r) {
            return {
              line: r.line,
              kind: r.kind,
              state:
                r.start === null
                  ? 'request queue'
                  : r.ready > t
                    ? 'service / transport'
                    : 'return wait'
            };
          }),
          queued: queued.length,
          predictions: predictions.length,
          cache: cache.map(function (c) {
            return { line: c.line, kind: c.prefetch ? 'prefetch' : 'demand', used: c.request.used };
          })
        });
      t++;
    }
    if (completed !== p.streams * p.count || active.length)
      throw new Error('Prefetch model failed to drain');
    outcomes.sort(function (a, b) {
      return a.stream - b.stream || Number(a.id.split(':')[1]) - Number(b.id.split(':')[1]);
    });
    var useful = stats.pfUseful,
      unused = stats.pfIssued - useful;
    return {
      p: p,
      stats: stats,
      requests: requests,
      outcomes: outcomes,
      trace: trace,
      cycles: finish + 1,
      drainCycles: t,
      completed: completed,
      accuracy: stats.pfIssued ? useful / stats.pfIssued : null,
      unused: unused,
      latency: quantiles(
        outcomes.map(function (d) {
          return d.done - d.arrival;
        })
      ),
      usefulBytes: completed * 8,
      bandwidth: (completed * 8) / (finish + 1)
    };
  }
  function prefetchCompare(options) {
    var baseline = prefetch(Object.assign({}, options, { enabled: false, trace: false })),
      experiment = prefetch(options),
      base = new Map(
        baseline.outcomes.map(function (d) {
          return [d.id, d];
        })
      ),
      eliminated = 0,
      added = 0;
    experiment.outcomes.forEach(function (d) {
      var b = base.get(d.id);
      if (b.miss && !d.miss) eliminated++;
      if (!b.miss && d.miss) added++;
    });
    return {
      baseline: baseline,
      experiment: experiment,
      eliminated: eliminated,
      added: added,
      coverage: baseline.stats.demandMisses ? eliminated / baseline.stats.demandMisses : null
    };
  }

  /* Device-visible mapping lifecycle: never release/reuse a frame while DMA or
     stale translation can still reach it. No ATS/PASID/device-side ATC model. */
  function dmaStory() {
    var mapping = [
        { iova: 0, frame: 7 },
        { iova: 1, frame: 19 }
      ],
      tlb = [],
      pins = [7, 19],
      inflight = 0,
      trace = [];
    function snap(action, note) {
      trace.push({
        action: action,
        note: note,
        mapping: mapping.map(function (x) {
          return Object.assign({}, x);
        }),
        tlb: tlb.map(function (x) {
          return Object.assign({}, x);
        }),
        pins: pins.slice(),
        inflight: inflight
      });
    }
    snap(
      'Pin + map',
      'Two discontiguous physical frames form a contiguous IOVA range; this does not make CPU virtual and DMA addresses interchangeable.'
    );
    inflight = 1;
    tlb.push({ iova: 0, frame: 7 });
    snap('DMA translation miss', 'Walk the IOMMU tables; cache IOVA page 0 → frame 7.');
    snap(
      'Unmap requested',
      'Stop new submissions. Existing DMA must finish before tearing down its mappings.'
    );
    inflight = 0;
    snap('DMA completes', 'Completion acknowledgement makes this transfer quiescent.');
    mapping = [];
    snap(
      'Remove mapping',
      'An old IOTLB translation can still point to frame 7. Both frames remain pinned/reserved until invalidation is safe.'
    );
    tlb = [];
    snap(
      'Invalidate + acknowledge',
      'Chosen synchronous policy removes cached translations before reuse. Deferred invalidation requires its own safe-reuse protocol.'
    );
    pins = [];
    snap(
      'Unpin / reuse',
      'The completed transfer and invalidation permit releasing the old pages.'
    );
    mapping = [{ iova: 0, frame: 31 }];
    pins = [31];
    snap(
      'Remap same IOVA',
      'A new translation must resolve to frame 31; a stale frame-7 entry would be incorrect.'
    );
    return trace;
  }
  function io(options) {
    var p = Object.assign(
      {
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
        service: 24,
        dma: 4,
        walk: 6,
        submit: 2,
        handle: 2,
        remote: false,
        reuse: true
      },
      options
    );
    ['count'].forEach(function (k) {
      integer(p[k], 1, 128, k);
    });
    ['qd', 'deviceSlots', 'cq', 'batch', 'pages', 'iotlb'].forEach(function (k) {
      integer(p[k], 1, 32, k);
    });
    ['moderation', 'poll', 'service', 'dma', 'walk', 'submit', 'handle'].forEach(function (k) {
      integer(p[k], 1, 200, k);
    });
    choice(p.mode, ['irq', 'poll'], 'completion mode');
    var active = [],
      cq = [],
      translations = [],
      requests = [],
      trace = [],
      submitted = 0,
      seen = 0,
      t = 0,
      nextSubmit = 0,
      deviceNext = 0,
      dmaNext = 0,
      cpuNext = 0,
      irqDue = null,
      stats = {
        doorbells: 0,
        interrupts: 0,
        polls: 0,
        cpuBusy: 0,
        iotlbHits: 0,
        iotlbMisses: 0,
        cqBlocked: 0,
        peakActive: 0,
        peakCQ: 0,
        dmaBytes: 0,
        remoteBytes: 0
      };
    while (seen < p.count && t < 200000) {
      /* Ready work holds a device slot when the bounded CQ cannot accept it. */
      active
        .filter(function (r) {
          return r.done === null && r.ready <= t;
        })
        .sort(function (a, b) {
          return a.ready - b.ready || a.id - b.id;
        })
        .forEach(function (r) {
          if (cq.length === p.cq) {
            stats.cqBlocked++;
            return;
          }
          r.done = t;
          cq.push(r);
        });
      if (cq.length && irqDue === null) irqDue = t + p.moderation;
      /* Empty polling yields to runnable submission work. Otherwise poll=1
         would monopolize the sole model CPU before it submits its first I/O. */
      var inspect =
        t >= cpuNext &&
        (p.mode === 'poll'
          ? t % p.poll === 0 && (cq.length || submitted === p.count || active.length === p.qd)
          : cq.length && (t >= irqDue || cq.length >= p.batch));
      if (inspect) {
        if (p.mode === 'poll') {
          stats.polls++;
          stats.cpuBusy++;
          cpuNext = t + 1;
        } else stats.interrupts++;
        var n = Math.min(p.batch, cq.length);
        if (n) {
          var work = n * p.handle + (p.mode === 'poll' ? 1 : 0);
          stats.cpuBusy += n * p.handle;
          cpuNext = t + work;
          for (var k = 0; k < n; k++) {
            var r = cq.shift();
            r.observed = t + work;
            active.splice(active.indexOf(r), 1);
            seen++;
          }
          irqDue = cq.length ? t + p.moderation : null;
        }
      }
      if (t >= nextSubmit && t >= cpuNext && submitted < p.count) {
        var n = Math.min(p.batch, p.qd - active.length, p.count - submitted);
        if (n > 0) {
          stats.doorbells++;
          stats.cpuBusy += p.submit;
          cpuNext = t + p.submit;
          nextSubmit = cpuNext;
          for (var k = 0; k < n; k++) {
            var id = submitted++,
              page = p.reuse ? id % p.pages : id,
              hit = touch(translations, page, p.iotlb).hit;
            stats[hit ? 'iotlbHits' : 'iotlbMisses']++;
            var translation = p.walk * (hit ? 0 : 1),
              start = Math.max(t + p.submit + translation, deviceNext);
            deviceNext = start + Math.max(1, Math.ceil(p.service / p.deviceSlots));
            var dataStart = Math.max(start + p.service, dmaNext),
              dataTime = p.dma * (p.remote ? 2 : 1);
            dmaNext = dataStart + dataTime;
            var r = {
              id: id,
              page: page,
              hit: hit,
              submit: t,
              translation: translation,
              start: start,
              dataStart: dataStart,
              ready: dataStart + dataTime,
              done: null,
              observed: null
            };
            active.push(r);
            requests.push(r);
            stats.dmaBytes += 4096;
            if (p.remote) stats.remoteBytes += 4096;
          }
        }
      }
      stats.peakActive = Math.max(stats.peakActive, active.length);
      stats.peakCQ = Math.max(stats.peakCQ, cq.length);
      trace.push({
        t: t,
        submitted: submitted,
        seen: seen,
        active: active.map(function (r) {
          return r.id;
        }),
        cq: cq.map(function (r) {
          return r.id;
        }),
        tlb: translations.slice(),
        irqDue: irqDue
      });
      t++;
    }
    if (seen !== p.count) throw new Error('I/O model failed to drain');
    var end = Math.max.apply(
      null,
      requests.map(function (r) {
        return r.observed;
      })
    );
    return {
      p: p,
      requests: requests,
      stats: stats,
      trace: trace,
      cycles: end,
      latency: quantiles(
        requests.map(function (r) {
          return r.observed - r.submit;
        })
      ),
      deviceLatency: quantiles(
        requests.map(function (r) {
          return r.ready - r.submit;
        })
      ),
      completionDelay: quantiles(
        requests.map(function (r) {
          return r.observed - r.ready;
        })
      ),
      bandwidth: (p.count * 4096) / end
    };
  }

  /* Two sockets, one node each; remote returns share one chosen directional
     link per direction, while each memory node has its own request interval. */
  function numa(options) {
    var p = Object.assign(
      {
        threads: 4,
        count: 32,
        placement: 'first',
        first: 0,
        migrate: false,
        local: 20,
        remoteHop: 12,
        nodeGap: 4,
        linkGap: 8,
        mlp: 4
      },
      options
    );
    integer(p.threads, 1, 8, 'threads');
    integer(p.count, 1, 128, 'requests per thread');
    integer(p.first, 0, 1, 'first-touch node');
    integer(p.mlp, 1, 16, 'per-thread MLP');
    ['local', 'remoteHop', 'nodeGap', 'linkGap'].forEach(function (k) {
      integer(p[k], 1, 200, k);
    });
    choice(p.placement, ['first', 'interleave', 'parallel'], 'placement');
    var nodeNext = [0, 0],
      linkNext = [0, 0],
      requests = [],
      threads = Array.from({ length: p.threads }, function (_, i) {
        return { id: i, cpu: (i % 2) ^ (p.migrate ? 1 : 0), issued: 0, active: [] };
      }),
      t = 0,
      completed = 0,
      stats = { local: 0, remote: 0, linkBytes: 0, nodeBytes: [0, 0], peakLinkWait: 0 };
    while (completed < p.threads * p.count && t < 200000) {
      threads.forEach(function (th) {
        var done = th.active.filter(function (r) {
          return r.done <= t;
        });
        completed += done.length;
        th.active = th.active.filter(function (r) {
          return r.done > t;
        });
        while (th.issued < p.count && th.active.length < p.mlp) {
          var i = th.issued++,
            node =
              p.placement === 'first' ? p.first : p.placement === 'parallel' ? th.id % 2 : i % 2,
            remote = node !== th.cpu,
            arrival = t,
            at = arrival + (remote ? p.remoteHop : 0),
            start = Math.max(at, nodeNext[node]);
          nodeNext[node] = start + p.nodeGap;
          var memoryDone = start + p.local,
            returnStart = remote ? Math.max(memoryDone, linkNext[th.cpu]) : memoryDone;
          if (remote) linkNext[th.cpu] = returnStart + p.linkGap;
          var r = {
            thread: th.id,
            cpu: th.cpu,
            node: node,
            arrival: arrival,
            start: start,
            linkStart: remote ? returnStart : null,
            linkEnd: remote ? returnStart + p.linkGap : null,
            done: returnStart + (remote ? p.remoteHop + p.linkGap : 0),
            remote: remote,
            linkWait: returnStart - memoryDone
          };
          requests.push(r);
          th.active.push(r);
          stats[remote ? 'remote' : 'local']++;
          stats.nodeBytes[node] += 64;
          if (remote) stats.linkBytes += 64;
          stats.peakLinkWait = Math.max(stats.peakLinkWait, r.linkWait);
        }
      });
      t++;
    }
    if (completed !== p.threads * p.count) throw new Error('NUMA model failed to drain');
    var end = Math.max.apply(
      null,
      requests.map(function (r) {
        return r.done;
      })
    );
    return {
      p: p,
      requests: requests,
      stats: stats,
      cycles: end,
      bandwidth: (requests.length * 64) / end,
      latency: quantiles(
        requests.map(function (r) {
          return r.done - r.arrival;
        })
      )
    };
  }

  /* Extended Hamming(8,4), even parity: exact code arithmetic. It illustrates
     SECDED, not a DIMM's undisclosed bit interleaving or Chipkill design. */
  function ecc(data, flips) {
    integer(data, 0, 15, '4-bit payload');
    if (!Array.isArray(flips) || new Set(flips).size !== flips.length)
      throw new Error('Use distinct flipped bit positions');
    flips.forEach(function (i) {
      integer(i, 1, 8, 'flipped bit');
    });
    var bits = Array(9).fill(0),
      positions = [3, 5, 6, 7];
    positions.forEach(function (pos, i) {
      bits[pos] = (data >> i) & 1;
    });
    [1, 2, 4].forEach(function (parity) {
      var x = 0;
      for (var i = 1; i <= 7; i++) if (i & parity) x ^= bits[i];
      bits[parity] = x;
    });
    for (var i = 1; i <= 7; i++) bits[8] ^= bits[i];
    var encoded = bits.slice(1);
    flips.forEach(function (i) {
      bits[i] ^= 1;
    });
    var received = bits.slice(1),
      syndrome = 0,
      overall = 0;
    for (var i = 1; i <= 7; i++) if (bits[i]) syndrome ^= i;
    for (var i = 1; i <= 8; i++) overall ^= bits[i];
    var corrected = null,
      status = 'No error detected';
    if (overall) {
      corrected = syndrome || 8;
      bits[corrected] ^= 1;
      status = 'Single-bit correction indicated';
    } else if (syndrome) status = 'Double-bit error detected; do not correct';
    var decoded = positions.reduce(function (n, pos, i) {
      return n | (bits[pos] << i);
    }, 0);
    return {
      encoded: encoded,
      received: received,
      correctedBits: bits.slice(1),
      syndrome: syndrome,
      overall: overall,
      status: status,
      corrected: corrected,
      decoded: decoded,
      payloadMatches: decoded === data,
      guaranteed: flips.length <= 2
    };
  }
  return {
    instructionTrace: instructionTrace,
    fetch: fetch,
    prefetch: prefetch,
    prefetchCompare: prefetchCompare,
    dmaStory: dmaStory,
    io: io,
    numa: numa,
    ecc: ecc,
    quantiles: quantiles
  };
})();
if (typeof module !== 'undefined') module.exports = AdvancedLab;
