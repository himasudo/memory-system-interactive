/* Queueing and dependency models behind the performance chapter. Pure functions; every
   size and latency is a parameter the labs show. */
var LabModel = (function () {
  'use strict';
  var defaults = {
    requests: 192,
    chains: 8,
    rob: 32,
    lq: 24,
    mshr: 12,
    fabric: 6,
    controller: 8,
    lanes: 4,
    fill: 4,
    issue: 2,
    retire: 2,
    service: 320,
    hop: 4,
    burst: 13,
    trace: true
  };
  function quantile(values, p) {
    if (!values.length) return 0;
    var a = values.slice().sort(function (x, y) {
      return x - y;
    });
    return a[Math.max(0, Math.ceil(p * a.length) - 1)];
  }
  function mean(a) {
    return a.length
      ? a.reduce(function (s, x) {
          return s + x;
        }, 0) / a.length
      : 0;
  }
  function simulate(input) {
    var p = Object.assign({}, defaults, input || {});
    Object.keys(defaults).forEach(function (k) {
      if (k === 'trace') return;
      if (
        !Number.isInteger(p[k]) ||
        p[k] < 1 ||
        p[k] > (k === 'service' ? 4000 : k === 'requests' ? 1024 : 256)
      )
        throw new Error('Invalid model parameter: ' + k);
    });
    if (p.chains > p.requests) throw new Error('Chains exceed requests');
    var all = [],
      rob = [],
      fabric = [],
      controller = [],
      active = [],
      fill = [],
      bus = null;
    var previous = [],
      trace = [],
      retired = 0,
      complete = 0,
      outstanding = 0,
      lq = 0,
      t = 0;
    var areas = { rob: 0, lq: 0, mshr: 0, fabric: 0, controller: 0, service: 0, fill: 0 };
    var peaks = Object.assign({}, areas),
      stalls = { rob: 0, lq: 0, dependency: 0, mshr: 0, fabric: 0, controller: 0, fill: 0 };
    var busy = 0,
      full = Object.assign({}, areas),
      stalledFront = 0;
    var caps = {
      rob: p.rob,
      lq: p.lq,
      mshr: p.mshr,
      fabric: p.fabric,
      controller: p.controller,
      service: p.lanes,
      fill: p.fill
    };
    /* Events at t change occupancy over [t,t+1). Every request remains in
       its upstream stage until the destination can actually accept it. */
    for (t = 0; retired < p.requests && t < 5000000; t++) {
      var reason = {};
      if (bus && bus.end === t) {
        bus.r.done = t;
        bus.r.state = 'done';
        complete++;
        outstanding--;
        lq--;
        bus = null;
      }
      for (var n = 0; n < p.retire && rob.length && rob[0].done !== undefined; n++) {
        var r = rob.shift();
        r.retired = t;
        r.state = 'retired';
        retired++;
      }
      /* A full fill buffer holds completed service slots occupied. */
      for (var i = 0; i < active.length;) {
        var a = active[i];
        if (a.serviceEnd <= t) {
          if (fill.length < p.fill) {
            a.fillAt = t;
            a.state = 'fill';
            fill.push(a);
            active.splice(i, 1);
            continue;
          }
          reason.fill = true;
        }
        i++;
      }
      if (!bus && fill.length) {
        var b = fill.shift();
        b.busAt = t;
        b.state = 'bus';
        bus = { r: b, end: t + p.burst };
      }
      while (active.length < p.lanes && controller.length) {
        var m = controller.shift();
        m.serviceAt = t;
        m.serviceEnd = t + p.service;
        m.state = 'service';
        active.push(m);
      }
      if (fabric.length && fabric[0].issue + p.hop <= t) {
        if (controller.length < p.controller) {
          var f = fabric.shift();
          f.mcAt = t;
          f.state = 'controller';
          controller.push(f);
        } else reason.controller = true;
      }
      var issued = 0;
      for (i = 0; i < rob.length && issued < p.issue; i++) {
        var q = rob[i];
        if (q.issue !== undefined) continue;
        if (q.dep !== null && all[q.dep].done === undefined) {
          reason.dependency = true;
          continue;
        }
        if (q.ready === undefined) q.ready = t;
        if (outstanding >= p.mshr) {
          reason.mshr = true;
          break;
        }
        if (fabric.length >= p.fabric) {
          reason.fabric = true;
          break;
        }
        q.issue = t;
        q.state = 'fabric';
        outstanding++;
        fabric.push(q);
        issued++;
      }
      /* One abstract loop body per cycle: one load + three other instructions.
         ROB control counts bodies, not a hardware ROB allocation unit or fused µops. */
      if (all.length < p.requests) {
        if (rob.length >= p.rob) reason.rob = true;
        else if (lq >= p.lq) reason.lq = true;
        else {
          var id = all.length,
            stream = id % p.chains;
          var req = {
            id: id,
            stream: stream,
            born: t,
            dep: previous[stream] === undefined ? null : previous[stream],
            state: 'waiting'
          };
          previous[stream] = id;
          all.push(req);
          rob.push(req);
          lq++;
        }
      }
      if (reason.rob || reason.lq) stalledFront++;
      Object.keys(reason).forEach(function (k) {
        stalls[k]++;
      });
      var occ = {
        rob: rob.length,
        lq: lq,
        mshr: outstanding,
        fabric: fabric.length,
        controller: controller.length,
        service: active.length,
        fill: fill.length
      };
      Object.keys(areas).forEach(function (k) {
        areas[k] += occ[k];
        peaks[k] = Math.max(peaks[k], occ[k]);
        if (occ[k] === caps[k]) full[k]++;
      });
      if (bus) busy++;
      if (p.trace)
        trace.push(
          Object.assign(
            {
              t: t,
              retired: retired,
              complete: complete,
              bus: bus ? 1 : 0,
              stalls: Object.keys(reason)
            },
            occ
          )
        );
    }
    if (retired !== p.requests) throw new Error('Model failed to drain');
    var latency = all.map(function (r) {
      return r.done - r.issue;
    });
    var queue = all.map(function (r) {
      return r.done - r.issue - p.hop - p.service - p.burst;
    });
    var readyWait = all.map(function (r) {
      return r.issue - Math.max(r.born + 1, r.dep === null ? 0 : all[r.dep].done);
    });
    var depWait = all.map(function (r) {
      return Math.max(0, (r.dep === null ? r.born + 1 : all[r.dep].done) - r.born - 1);
    });
    var rates = {};
    Object.keys(areas).forEach(function (k) {
      rates[k] = areas[k] / t;
    });
    var start = Math.floor(t / 4),
      end = Math.floor((3 * t) / 4),
      middle = all.filter(function (r) {
        return r.done >= start && r.done < end;
      });
    return {
      p: p,
      requests: all,
      trace: trace,
      cycles: t,
      completed: complete,
      retired: retired,
      bytes: complete * 64,
      usefulBytes: complete * 8,
      instructions: retired * 4,
      ipc: (retired * 4) / t,
      cpi: t / (retired * 4),
      mpki: 250,
      throughput: complete / t,
      window: {
        start: start,
        end: end,
        completed: middle.length,
        throughput: middle.length / (end - start)
      },
      latency: {
        mean: mean(latency),
        p50: quantile(latency, 0.5),
        p95: quantile(latency, 0.95),
        p99: quantile(latency, 0.99),
        max: Math.max.apply(null, latency)
      },
      timing: {
        service: p.service,
        transport: p.hop + p.burst,
        queue: mean(queue),
        dependency: mean(depWait),
        readyWait: mean(readyWait),
        retireWait: mean(
          all.map(function (r) {
            return r.retired - r.done;
          })
        )
      },
      occupancy: rates,
      areas: areas,
      peaks: peaks,
      full: full,
      capacities: caps,
      stalls: stalls,
      frontStall: stalledFront,
      busUtil: busy / t
    };
  }
  function dag(nodes, target) {
    var by = {},
      pending = nodes.map(function (n) {
        return Object.assign({}, n);
      }),
      result = [];
    if (
      new Set(
        pending.map(function (n) {
          return n.id;
        })
      ).size !== pending.length
    )
      throw new Error('Duplicate DAG node');
    while (pending.length) {
      var at = pending.findIndex(function (n) {
        return n.deps.every(function (d) {
          return !!by[d];
        });
      });
      if (at < 0) throw new Error('Cyclic or missing DAG dependency');
      var n = pending.splice(at, 1)[0];
      if (!Number.isFinite(n.duration) || n.duration < 0) throw new Error('Invalid DAG duration');
      n.start = n.deps.reduce(function (a, k) {
        return Math.max(a, by[k].end);
      }, 0);
      n.end = n.start + n.duration;
      by[n.id] = n;
      result.push(n);
    }
    if (!by[target]) throw new Error('Missing DAG target');
    var critical = [],
      cur = by[target];
    while (cur) {
      critical.push(cur.id);
      cur = cur.deps.length
        ? by[
            cur.deps.reduce(function (a, b) {
              return by[a].end >= by[b].end ? a : b;
            })
          ]
        : null;
    }
    return { nodes: result, by: by, critical: critical.reverse(), end: by[target].end };
  }
  function criticalPath(cfg, o) {
    var hit =
      o.level === 'L1'
        ? cfg.l1
        : o.level === 'L2'
          ? cfg.l2
          : o.level === 'L3'
            ? cfg.l3
            : cfg.l3 + cfg.dramNs * cfg.ghz;
    var nodes = [];
    function add(id, label, duration, deps) {
      nodes.push({ id: id, label: label, duration: duration, deps: deps });
    }
    add('front', 'Fetch / decode', 5, []);
    add('rename', 'Rename / dispatch', 2, ['front']);
    add('data', 'data[i] L1 load', cfg.l1, ['rename']);
    add('agu', 'hist address', 1, ['data']);
    add('tlb', 'DTLB lookup', 1, ['agu']);
    add('index', 'VIPT index', 1, ['agu']);
    var translation = 'tlb';
    if (o.walk) {
      ['PML4E (walk cache)', 'PDPTE (walk cache)', 'PDE (L2)', 'PTE (L2)'].forEach(function (s, i) {
        var id = 'walk' + i;
        add(id, s, i < 2 ? 1 : cfg.l2, [translation]);
        translation = id;
      });
    }
    add('hist', 'hist data / tag', Math.max(0, hit - 1), [translation, 'index']);
    add('value', 'Add 1: value ready', 1, ['hist']);
    add('store', 'SQ address + data', 2, ['value']);
    add('other', 'Independent older work', o.work, ['rename']);
    add('retire', 'In-order retirement', 1, ['store', 'other']);
    add('commit', 'L1 store visibility', 1, ['retire']);
    /* Separate branch: no claim that every instruction causes a writeback. */
    if (o.background) add('writeback', 'Unrelated dirty writeback', hit, ['rename']);
    var r = dag(nodes, 'retire');
    r.valueAt = r.by.value.end;
    r.commitAt = r.by.commit.end;
    r.serial = nodes
      .filter(function (n) {
        return n.id !== 'commit' && n.id !== 'writeback';
      })
      .reduce(function (s, n) {
        return s + n.duration;
      }, 0);
    return r;
  }
  return {
    defaults: defaults,
    simulate: simulate,
    dag: dag,
    criticalPath: criticalPath,
    quantile: quantile,
    mean: mean
  };
})();
if (typeof module !== 'undefined') module.exports = LabModel;
