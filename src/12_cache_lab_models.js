/* Phase 2: independent, deterministic teaching models. No proprietary implementation policy. */
var CacheLab = (function () {
  'use strict';
  function integer(v, min, max, name) {
    if (!Number.isSafeInteger(v) || v < min || v > max) throw new Error('Invalid ' + name);
    return v;
  }
  function split(addr, size, line) {
    integer(addr, 0, Math.pow(2, 48) - 129, 'address');
    integer(size, 1, 128, 'access size');
    integer(line, 16, 256, 'line size');
    if ((line & (line - 1)) !== 0) throw new Error('Line size must be a power of two');
    var fragments = [],
      end = addr + size;
    for (var a = addr; a < end;) {
      var n = Math.min(end - a, line - (a % line));
      fragments.push({
        addr: a,
        bytes: n,
        line: Math.floor(a / line),
        offset: a % line,
        page: Math.floor(a / 4096)
      });
      a += n;
    }
    return {
      fragments: fragments,
      lines: fragments.length,
      pages: Math.floor((end - 1) / 4096) - Math.floor(addr / 4096) + 1,
      aligned: addr % size === 0
    };
  }
  function replay(accesses, options) {
    var p = Object.assign({ sets: 4, ways: 2, line: 64, drain: false }, options);
    integer(p.sets, 1, 64, 'sets');
    integer(p.ways, 1, 16, 'ways');
    integer(p.line, 16, 256, 'line size');
    if (!Array.isArray(accesses) || !accesses.length || accesses.length > 2048)
      throw new Error('Trace needs 1–2048 accesses');
    var sets = Array.from({ length: p.sets }, function () {
        return [];
      }),
      stack = [],
      seen = new Set(),
      events = [];
    var counts = {
      accesses: accesses.length,
      lineAccesses: 0,
      hits: 0,
      compulsory: 0,
      capacity: 0,
      conflict: 0,
      fills: 0,
      evictions: 0,
      dirtyEvictions: 0,
      readFillBytes: 0,
      rfoBytes: 0,
      writebackBytes: 0,
      usefulReadBytes: 0,
      usefulWriteBytes: 0,
      splitLines: 0,
      splitPages: 0
    };
    accesses.forEach(function (op, index) {
      if (op.op !== 'read' && op.op !== 'write')
        throw new Error('Trace operation must be read or write');
      var parts = split(op.addr, op.size, p.line);
      counts[op.op === 'read' ? 'usefulReadBytes' : 'usefulWriteBytes'] += op.size;
      if (parts.lines > 1) counts.splitLines++;
      if (parts.pages > 1) counts.splitPages++;
      parts.fragments.forEach(function (f) {
        counts.lineAccesses++;
        var set = f.line % p.sets,
          ways = sets[set],
          position = ways.findIndex(function (x) {
            return x.line === f.line;
          }),
          distance = stack.indexOf(f.line),
          first = !seen.has(f.line),
          classification = 'hit',
          victim = null;
        if (position >= 0) {
          counts.hits++;
          var hit = ways.splice(position, 1)[0];
          hit.dirty = hit.dirty || op.op === 'write';
          ways.unshift(hit);
        } else {
          classification = first
            ? 'compulsory'
            : distance >= 0 && distance < p.sets * p.ways
              ? 'conflict'
              : 'capacity';
          counts[classification]++;
          counts.fills++;
          if (ways.length === p.ways) {
            victim = ways.pop();
            counts.evictions++;
            if (victim.dirty) {
              counts.dirtyEvictions++;
              counts.writebackBytes += p.line;
            }
          }
          counts[op.op === 'write' ? 'rfoBytes' : 'readFillBytes'] += p.line;
          ways.unshift({ line: f.line, dirty: op.op === 'write' });
        }
        seen.add(f.line);
        if (distance >= 0) stack.splice(distance, 1);
        stack.unshift(f.line);
        events.push({
          index: index,
          addr: f.addr,
          bytes: f.bytes,
          op: op.op,
          line: f.line,
          set: set,
          distance: distance < 0 ? null : distance,
          classification: classification,
          shadowHit: distance >= 0 && distance < p.sets * p.ways,
          victim: victim,
          sets: sets.map(function (s) {
            return s.map(function (x) {
              return Object.assign({}, x);
            });
          }),
          counts: Object.assign({}, counts)
        });
      });
    });
    var dirtyResident = sets.reduce(function (n, s) {
      return (
        n +
        s.filter(function (x) {
          return x.dirty;
        }).length
      );
    }, 0);
    if (p.drain) counts.writebackBytes += dirtyResident * p.line;
    counts.totalLineBytes = counts.readFillBytes + counts.rfoBytes + counts.writebackBytes;
    return {
      p: p,
      events: events,
      counts: counts,
      sets: sets,
      dirtyResident: dirtyResident,
      drainedLines: p.drain ? dirtyResident : 0
    };
  }
  function hitSchedule(accesses, options) {
    var p = Object.assign({ ports: 2, banks: 4, width: 8, latency: 4 }, options);
    ['ports', 'banks', 'width', 'latency'].forEach(function (k) {
      integer(p[k], 1, 64, k);
    });
    if (!Array.isArray(accesses) || !accesses.length || accesses.length > 2048)
      throw new Error('Trace needs 1–2048 operations');
    var busy = {},
      events = [],
      operations = [],
      bytes = 0,
      bankStalls = 0,
      portStalls = 0;
    accesses.forEach(function (op, index) {
      var fragments = split(op.addr, op.size, 64).fragments,
        complete = 0,
        first = Infinity;
      fragments.forEach(function (f) {
        for (var used = 0; used < f.bytes;) {
          var addr = f.addr + used,
            size = Math.min(f.bytes - used, p.width - (addr % p.width)),
            bank = Math.floor(addr / p.width) % p.banks,
            t = 0;
          while (true) {
            var slot = busy[t] || (busy[t] = { ports: 0, banks: [] });
            if (slot.ports < p.ports && slot.banks.indexOf(bank) < 0) break;
            if (slot.ports >= p.ports) portStalls++;
            else bankStalls++;
            t++;
          }
          busy[t].ports++;
          busy[t].banks.push(bank);
          first = Math.min(first, t);
          complete = Math.max(complete, t + p.latency);
          events.push({
            op: index,
            addr: addr,
            bytes: size,
            bank: bank,
            issue: t,
            done: t + p.latency,
            kind: op.op
          });
          used += size;
          bytes += size;
        }
      });
      operations.push({ issue: first, done: complete });
    });
    var cycles = Math.max.apply(
      null,
      operations.map(function (x) {
        return x.done;
      })
    );
    return {
      p: p,
      events: events,
      operations: operations,
      cycles: cycles,
      bytes: bytes,
      throughput: operations.length / cycles,
      bytesPerCycle: bytes / cycles,
      portStalls: portStalls,
      bankStalls: bankStalls
    };
  }
  function forwarding(o) {
    var p = Object.assign(
      {
        storeAddr: 4096,
        storeSize: 8,
        loadAddr: 4096,
        loadSize: 8,
        addressKnown: true,
        dataKnown: true,
        speculate: false
      },
      o
    );
    var st = split(p.storeAddr, p.storeSize, 64),
      ld = split(p.loadAddr, p.loadSize, 64);
    var overlap = Math.max(
      0,
      Math.min(p.storeAddr + p.storeSize, p.loadAddr + p.loadSize) -
        Math.max(p.storeAddr, p.loadAddr)
    );
    var exact = p.storeAddr === p.loadAddr && p.storeSize === p.loadSize,
      contains = overlap === p.loadSize,
      lowMatch = p.storeAddr % 4096 === p.loadAddr % 4096;
    var mechanism, outcome, certainty;
    if (!p.addressKnown) {
      mechanism = lowMatch
        ? 'Lower 12 address bits match; full-address comparison is pending.'
        : 'Older store address is unresolved.';
      outcome = p.speculate
        ? overlap
          ? 'execute, then replay when the overlap is discovered'
          : 'execute; later validation succeeds'
        : 'wait for address resolution';
      certainty =
        'Teaching disambiguation policy; the 12-bit filter is illustrative, not a claim about a proprietary predictor.';
    } else if (!overlap) {
      mechanism = lowMatch
        ? 'Same page offset, different addresses: a false partial-address alias.'
        : 'No byte overlap with the older store.';
      outcome = 'read through the cache hierarchy';
      certainty = 'No true data dependency after full-address resolution.';
    } else if (!p.dataKnown) {
      mechanism = 'A matching older store exists but its data is not ready.';
      outcome = 'wait for store data';
      certainty = 'A correct dependent value cannot be forwarded before it exists.';
    } else if (contains && st.lines === 1 && ld.lines === 1) {
      mechanism = exact
        ? 'Exact address and size match.'
        : 'Every loaded byte is contained in one older store.';
      outcome = 'forward candidate';
      certainty =
        'Byte coverage permits forwarding; alignment/size support and timing are implementation-dependent, especially for contained or mixed-width cases.';
    } else {
      mechanism = contains
        ? 'Byte coverage crosses a cache-line boundary.'
        : 'Partial overlap: a single store does not provide all loaded bytes.';
      outcome = 'wait or replay / implementation-specific merge';
      certainty =
        'A hardware forwarding rule or penalty requires scoped evidence. The visual shows the required bytes, not a guaranteed hardware fast path.';
    }
    return {
      p: p,
      store: st,
      load: ld,
      overlap: overlap,
      exact: exact,
      contains: contains,
      lowMatch: lowMatch,
      mechanism: mechanism,
      outcome: outcome,
      certainty: certainty
    };
  }
  function misses(lines, options) {
    var p = Object.assign({ entries: 2, latency: 20, rob: 8 }, options);
    integer(p.entries, 1, 32, 'miss entries');
    integer(p.latency, 1, 1000, 'miss latency');
    integer(p.rob, 1, 128, 'ROB entries');
    if (!Array.isArray(lines) || !lines.length || lines.length > 2048)
      throw new Error('Trace needs 1–2048 lines');
    lines.forEach(function (n) {
      integer(n, 0, Math.pow(2, 40), 'line');
    });
    var pending = [],
      resident = new Set(),
      loads = [],
      rob = [],
      trace = [],
      issued = 0,
      retired = 0,
      merged = 0,
      hits = 0,
      blocked = 0,
      t = 0;
    while (retired < lines.length && t < 100000) {
      pending = pending.filter(function (m) {
        if (m.done > t) return true;
        resident.add(m.line);
        m.waiters.forEach(function (r) {
          r.done = t;
        });
        return false;
      });
      while (rob.length && rob[0].done !== undefined && rob[0].done <= t) {
        rob.shift().retired = t;
        retired++;
      }
      var stall = '';
      if (issued < lines.length && rob.length < p.rob) {
        var line = lines[issued],
          same = pending.find(function (m) {
            return m.line === line;
          });
        if (resident.has(line) || same || pending.length < p.entries) {
          var r = { id: issued++, line: line, issue: t };
          loads.push(r);
          rob.push(r);
          if (resident.has(line)) {
            r.done = t + 1;
            hits++;
          } else if (same) {
            same.waiters.push(r);
            merged++;
          } else pending.push({ line: line, done: t + p.latency, waiters: [r] });
        } else {
          blocked++;
          stall = 'miss entries full';
        }
      } else if (issued < lines.length) stall = 'ROB full';
      trace.push({
        t: t,
        entries: pending.length,
        rob: rob.length,
        retired: retired,
        issued: issued,
        stall: stall,
        lines: pending.map(function (m) {
          return { line: m.line, waiters: m.waiters.length, done: m.done };
        })
      });
      t++;
    }
    if (retired !== lines.length) throw new Error('Miss model failed to drain');
    return {
      p: p,
      loads: loads,
      trace: trace,
      cycles: t,
      retired: retired,
      merged: merged,
      hits: hits,
      requests: loads.length - merged - hits,
      blocked: blocked
    };
  }
  function siblings(options) {
    var p = Object.assign(
      { capacity: 8, policy: 'shared', sibling: 'memory', requests: 64 },
      options
    );
    integer(p.capacity, 2, 64, 'shared load slots');
    integer(p.requests, 1, 2048, 'requests');
    if (
      ['shared', 'partitioned'].indexOf(p.policy) < 0 ||
      ['memory', 'compute', 'off'].indexOf(p.sibling) < 0
    )
      throw new Error('Invalid SMT scenario');
    var threads = [
      { issued: 0, done: 0, waiting: 0, latency: 4, max: 1, end: 0 },
      { issued: 0, done: 0, waiting: 0, latency: p.sibling === 'memory' ? 80 : 4, max: 16, end: 0 }
    ];
    if (p.sibling === 'off') threads[1].done = p.requests;
    var active = [],
      trace = [],
      t = 0,
      turn = 0,
      blocked = [0, 0];
    for (
      t = 0;
      t < 100000 &&
      threads.some(function (x) {
        return x.done < p.requests;
      });
      t++
    ) {
      active = active.filter(function (r) {
        if (r.done > t) return true;
        var th = threads[r.thread];
        th.done++;
        th.waiting--;
        th.end = t;
        return false;
      });
      /* Shared front-end/load issue: one admitted operation per model cycle.
         Compute sibling instead consumes alternate issue slots, not LQ slots. */
      var picked = false;
      for (var k = 0; k < 2; k++) {
        var n = (turn + k) % 2,
          th = threads[n];
        if (th.done >= p.requests || th.issued >= p.requests || th.waiting >= th.max) continue;
        if (n === 1 && p.sibling === 'compute') {
          th.issued++;
          th.done++;
          th.end = t;
          turn = 0;
          picked = true;
          break;
        }
        var quota = p.policy === 'partitioned' ? Math.floor(p.capacity / 2) : p.capacity;
        if (active.length >= p.capacity || th.waiting >= quota) {
          blocked[n]++;
          continue;
        }
        th.issued++;
        th.waiting++;
        active.push({ thread: n, done: t + th.latency });
        turn = 1 - n;
        picked = true;
        break;
      }
      trace.push({
        t: t,
        a: threads[0].waiting,
        b: threads[1].waiting,
        doneA: threads[0].done,
        doneB: p.sibling === 'off' ? 0 : threads[1].done,
        issued: picked
      });
    }
    return {
      p: p,
      threads: threads,
      trace: trace,
      cycles: t,
      blocked: blocked,
      aCycles: threads[0].end + 1
    };
  }
  function coherence(operations, options) {
    var p = Object.assign({ cores: 2, ack: 4, data: 8, flush: false }, options);
    integer(p.cores, 1, 4, 'cores');
    integer(p.ack, 1, 64, 'ack delay');
    integer(p.data, 1, 64, 'data delay');
    if (!Array.isArray(operations) || !operations.length || operations.length > 2048)
      throw new Error('Trace needs 1–2048 operations');
    var lines = {},
      events = [],
      clock = 0,
      stats = {
        gets: 0,
        getm: 0,
        upgrades: 0,
        invalidations: 0,
        acks: 0,
        peerBytes: 0,
        homeBytes: 0,
        writebackBytes: 0,
        atomics: 0,
        failedCAS: 0,
        ownershipMoves: 0
      },
      results = [];
    function lineAt(word) {
      var key = Math.floor(word / 8);
      if (!lines[key])
        lines[key] = {
          states: Array(p.cores).fill('I'),
          values: Array(8).fill(0),
          memory: Array(8).fill(0)
        };
      return { line: lines[key], key: key, offset: word % 8 };
    }
    function event(label, op, key, pending) {
      events.push({
        t: clock,
        label: label,
        op: op,
        key: key,
        pending: pending || [],
        lines: JSON.parse(JSON.stringify(lines)),
        stats: Object.assign({}, stats)
      });
    }
    operations.forEach(function (op, index) {
      integer(op.core, 0, p.cores - 1, 'core');
      integer(op.word, 0, 1024, 'word');
      if (['read', 'store', 'add', 'cas'].indexOf(op.kind) < 0)
        throw new Error('Invalid coherence operation');
      if (op.kind === 'store' || op.kind === 'cas')
        integer(op.value, 0, 1000000000, 'written value');
      if (op.kind === 'cas') integer(op.expected, 0, 1000000000, 'expected value');
      var found = lineAt(op.word),
        line = found.line,
        core = op.core,
        key = found.key,
        offset = found.offset,
        state = line.states[core];
      var peers = line.states
          .map(function (s, i) {
            return i !== core && s !== 'I' ? i : -1;
          })
          .filter(function (i) {
            return i >= 0;
          }),
        dirty = peers.find(function (i) {
          return line.states[i] === 'M' || line.states[i] === 'O';
        });
      var write = op.kind !== 'read',
        old = line.values[offset];
      if (op.kind === 'store')
        event('Store retires into a buffer; visibility still pending', index, key);
      if (!write && state === 'I') {
        stats.gets++;
        line.states[core] = 'IS';
        event('GetS: waiting for data', index, key);
        clock += p.data;
        if (dirty !== undefined) {
          stats.peerBytes += 64;
          line.states[dirty] = 'O';
        } else {
          stats.homeBytes += 64;
          peers.forEach(function (i) {
            if (line.states[i] === 'E') line.states[i] = 'S';
          });
        }
        line.states[core] = peers.length ? 'S' : 'E';
        event(
          dirty !== undefined
            ? 'Dirty peer supplies data; memory remains stale'
            : 'Home supplies clean data',
          index,
          key
        );
      } else if (write && state !== 'M' && state !== 'E') {
        stats.getm++;
        if (state === 'S' || state === 'O') stats.upgrades++;
        line.states[core] = state === 'I' ? 'IM' : state === 'O' ? 'OM' : 'SM';
        stats.invalidations += peers.length;
        event(
          state === 'I' ? 'GetM / ownership request' : 'Upgrade / invalidations sent',
          index,
          key,
          peers
        );
        if (state === 'I') {
          clock += p.data;
          if (dirty !== undefined) stats.peerBytes += 64;
          else stats.homeBytes += 64;
          event(
            peers.length
              ? 'Data ready; ownership still waits for acknowledgements'
              : 'Data ready; no peer acknowledgements required',
            index,
            key,
            peers
          );
        }
        if (peers.length) {
          clock += p.ack;
          peers.forEach(function (i) {
            line.states[i] = 'I';
            stats.acks++;
          });
          stats.ownershipMoves++;
          event('All invalidation acknowledgements received', index, key);
        }
        line.states[core] = 'M';
        event('Exclusive writable ownership obtained', index, key);
      }
      clock++;
      if (write) {
        line.states[core] = 'M';
        if (op.kind === 'cas') {
          stats.atomics++;
          if (old !== op.expected) stats.failedCAS++;
          else line.values[offset] = op.value;
        } else if (op.kind === 'add') {
          stats.atomics++;
          line.values[offset] = old + 1;
        } else line.values[offset] = op.value;
        event(
          op.kind === 'cas'
            ? old === op.expected
              ? 'CAS succeeds'
              : 'CAS fails; observed value returned'
            : op.kind === 'add'
              ? 'Atomic read-modify-write completes'
              : 'Buffered store becomes visible through coherent caches',
          index,
          key
        );
      } else event('Read completes with value ' + old, index, key);
      results.push({
        old: old,
        value: line.values[offset],
        core: core,
        kind: op.kind,
        word: op.word
      });
    });
    if (p.flush)
      Object.keys(lines).forEach(function (key) {
        var line = lines[key],
          owner = line.states.findIndex(function (s) {
            return s === 'M' || s === 'O';
          });
        if (owner >= 0) {
          clock += p.data;
          line.memory = line.values.slice();
          line.states[owner] = 'I';
          stats.writebackBytes += 64;
          event('Dirty owner evicts; modeled backing memory updated', operations.length, +key);
        }
      });
    return { p: p, events: events, lines: lines, stats: stats, results: results, ticks: clock };
  }
  function writePressure(options) {
    var p = Object.assign(
      { count: 32, cache: 4, fill: 4, writeback: 2, latency: 8, drain: 12 },
      options
    );
    Object.keys(p).forEach(function (k) {
      integer(p[k], 1, k === 'count' ? 256 : 64, k);
    });
    var pending = [],
      wb = [],
      resident = [],
      trace = [],
      issued = 0,
      installed = 0,
      written = 0,
      fillBlocked = 0,
      frontBlocked = 0,
      t = 0;
    while ((installed < p.count || wb.length) && t < 100000) {
      if (wb.length && wb[0].done <= t) {
        wb.shift();
        written++;
      }
      var blocked = false;
      if (pending.length && pending[0].ready <= t) {
        if (resident.length === p.cache && wb.length === p.writeback) {
          blocked = true;
          fillBlocked++;
        } else {
          if (resident.length === p.cache) {
            var victim = resident.shift();
            wb.push({
              line: victim,
              done: Math.max(t, wb.length ? wb[wb.length - 1].done : t) + p.drain
            });
          }
          resident.push(pending.shift().line);
          installed++;
        }
      }
      if (issued < p.count) {
        if (pending.length < p.fill) {
          pending.push({ line: issued++, ready: t + p.latency });
        } else frontBlocked++;
      }
      trace.push({
        t: t,
        fill: pending.length,
        wb: wb.length,
        installed: installed,
        written: written,
        blocked: blocked,
        resident: resident.slice(),
        pending: pending.map(function (x) {
          return Object.assign({}, x);
        })
      });
      t++;
    }
    if (installed !== p.count || wb.length) throw new Error('Writeback model failed to drain');
    return {
      p: p,
      trace: trace,
      cycles: t,
      installed: installed,
      writebacks: written,
      dirtyResident: resident.length,
      fillBlocked: fillBlocked,
      frontBlocked: frontBlocked,
      rfoBytes: p.count * 64,
      writebackBytes: written * 64
    };
  }
  return {
    split: split,
    replay: replay,
    hitSchedule: hitSchedule,
    forwarding: forwarding,
    misses: misses,
    siblings: siblings,
    coherence: coherence,
    writePressure: writePressure
  };
})();
if (typeof module !== 'undefined') module.exports = CacheLab;
