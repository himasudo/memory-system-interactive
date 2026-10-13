'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const M = require('../src/12_advanced_models.js'),
  C = require('../src/12_controller_model.js');

test('instruction delivery accounts for page/line splits and serial wait boundaries', () => {
  const r = M.fetch(
    [
      { addr: 4090, size: 16 },
      { addr: 4090, size: 16 }
    ],
    { lines: 8, itlb: 8 }
  );
  assert.equal(r.stats.itlbMisses, 2);
  assert.equal(r.stats.walkReads, 8);
  assert.equal(r.stats.iMisses, 2);
  assert.equal(r.stats.fillBytes, 128);
  assert.equal(r.cycles, r.stats.starved + r.stats.delivery);
  assert.equal(r.trace[0].done, r.trace[1].start);
  assert.equal(r.trace[1].wait, r.p.decode);
});
test('equal executed blocks expose instruction footprint and decoded-cache bypass', () => {
  const dense = M.fetch(M.instructionTrace({ blocks: 16, spacing: 64 })),
    sparse = M.fetch(M.instructionTrace({ blocks: 16, spacing: 4096 })),
    decoded = M.fetch(M.instructionTrace({ blocks: 16 }), { lines: 4, opEntries: 16 });
  assert.equal(dense.stats.blocks, sparse.stats.blocks);
  assert.ok(sparse.stats.itlbMisses > dense.stats.itlbMisses);
  assert.ok(sparse.cycles > dense.cycles);
  assert.equal(decoded.stats.opHits, 48);
  assert.equal(decoded.stats.decodeBlocks, 16);
  assert.equal(decoded.stats.iMisses, 16);
  assert.ok(
    decoded.trace.every((q) => q.ic.length <= 4 && q.tlb.length <= 8 && q.ops.length <= 16)
  );
});
test('finite prefetch resources conserve work/traffic and serialize shared links across policies', () => {
  for (const pattern of ['stream', 'stride', 'hot', 'chase'])
    for (const priority of ['demand', 'fifo'])
      for (const distance of [0, 4, 16]) {
        const r = M.prefetch({
          streams: 3,
          count: 16,
          cacheLines: 4,
          missEntries: 3,
          queue: 2,
          pfQueue: 4,
          pattern,
          priority,
          distance
        });
        assert.equal(r.completed, 48);
        assert.equal(r.outcomes.length, 48);
        assert.equal(new Set(r.outcomes.map((d) => d.id)).size, 48);
        assert.equal(r.usefulBytes, 48 * 8);
        assert.equal(r.stats.demandHits + r.stats.demandMisses, 48);
        assert.equal(r.stats.busBytes, r.requests.length * 64);
        assert.equal(r.stats.busBytes, r.stats.prefetchBytes + r.stats.demandBytes);
        assert.equal(r.stats.pfIssued, r.requests.filter((x) => x.kind === 'prefetch').length);
        assert.equal(
          r.stats.pfUseful,
          r.requests.filter((x) => x.kind === 'prefetch' && x.used).length
        );
        assert.equal(r.unused + r.stats.pfUseful, r.stats.pfIssued);
        assert.ok(
          r.trace.every(
            (q) =>
              q.misses.length <= 3 && q.queued <= 2 && q.predictions <= 4 && q.cache.length <= 4
          )
        );
        const launched = r.requests.slice().sort((a, b) => a.start - b.start),
          returned = r.requests.slice().sort((a, b) => a.done - b.done);
        for (let i = 1; i < launched.length; i++)
          assert.ok(launched[i].start - launched[i - 1].start >= r.p.busGap);
        for (let i = 1; i < returned.length; i++)
          assert.ok(returned[i].done - returned[i - 1].done >= r.p.returnGap);
        assert.ok(
          r.requests.every(
            (x) => x.start >= x.admit && x.ready === x.start + r.p.latency && x.done >= x.ready
          )
        );
        assert.ok(r.outcomes.every((d) => d.done >= d.admit && d.admit >= d.arrival));
        assert.ok(r.accuracy === null || (r.accuracy >= 0 && r.accuracy <= 1));
      }
});
test('prefetch-off is an identical baseline and late-use accuracy differs from coverage', () => {
  const off = M.prefetchCompare({ enabled: false });
  assert.equal(off.baseline.cycles, off.experiment.cycles);
  assert.equal(off.experiment.stats.pfIssued, 0);
  assert.equal(off.coverage, 0);
  const late = M.prefetchCompare({ distance: 1, think: 2 });
  assert.ok(late.experiment.stats.late > 0);
  assert.ok(late.experiment.accuracy > late.coverage);
  const chase = M.prefetch({ pattern: 'chase' });
  assert.equal(chase.stats.pfIssued, 0);
});
test('speculation can slow a hot workload, add misses and evict useful demand lines', () => {
  const r = M.prefetchCompare({
    pattern: 'hot',
    cacheLines: 4,
    distance: 32,
    missEntries: 2,
    busGap: 16
  });
  assert.ok(r.experiment.cycles > r.baseline.cycles * 2);
  assert.ok(r.added > 0);
  assert.ok(r.experiment.stats.pollutionEvictions > 0);
  assert.ok(r.experiment.stats.busBytes > r.baseline.stats.busBytes);
  const a = M.prefetchCompare({ distance: 8 }),
    b = M.prefetchCompare({ distance: 32 });
  assert.ok(b.experiment.cycles > a.experiment.cycles);
  assert.ok(b.experiment.accuracy < a.experiment.accuracy);
});
test('DMA page lifetime outlasts active transfers and stale translations', () => {
  const a = M.dmaStory(),
    removed = a.find((q) => q.action === 'Remove mapping'),
    invalidated = a.find((q) => q.action === 'Invalidate + acknowledge'),
    released = a.find((q) => q.action === 'Unpin / reuse');
  assert.equal(removed.inflight, 0);
  assert.equal(removed.mapping.length, 0);
  assert.equal(removed.tlb[0].frame, 7);
  assert.ok(removed.pins.includes(7));
  assert.equal(invalidated.tlb.length, 0);
  assert.ok(invalidated.pins.length);
  assert.equal(released.pins.length, 0);
  assert.equal(a.at(-1).mapping[0].frame, 31);
});
test('I/O queue bounds, DMA link, completion and CPU-work accounting hold under contention', () => {
  for (const mode of ['irq', 'poll'])
    for (const qd of [1, 4, 16])
      for (const cq of [1, 4]) {
        const r = M.io({ count: 32, qd, cq, batch: 4, mode, moderation: 32, remote: true });
        assert.equal(r.requests.length, 32);
        assert.equal(r.stats.dmaBytes, 32 * 4096);
        assert.equal(r.stats.remoteBytes, r.stats.dmaBytes);
        assert.equal(r.stats.iotlbHits + r.stats.iotlbMisses, 32);
        assert.ok(r.stats.cpuBusy <= r.cycles);
        assert.ok(
          r.trace.every(
            (q) => q.active.length <= qd && q.cq.length <= cq && q.tlb.length <= r.p.iotlb
          )
        );
        assert.equal(new Set(r.requests.map((x) => x.id)).size, 32);
        assert.ok(
          r.requests.every((q) => q.submit < q.ready && q.ready <= q.done && q.done <= q.observed)
        );
        assert.equal(r.cycles, Math.max(...r.requests.map((q) => q.observed)));
        const dma = r.requests.slice().sort((a, b) => a.dataStart - b.dataStart);
        for (let i = 1; i < dma.length; i++) assert.ok(dma[i].dataStart >= dma[i - 1].ready);
        assert.equal(mode === 'irq' ? r.stats.polls : r.stats.interrupts, 0);
      }
});
test('buffer translation reuse, moderation, polling and remote placement change stated boundaries', () => {
  const hot = M.io({ pages: 4, iotlb: 4 }),
    fresh = M.io({ pages: 4, iotlb: 4, reuse: false });
  assert.equal(hot.stats.iotlbMisses, 4);
  assert.equal(fresh.stats.iotlbMisses, 48);
  const fast = M.io({ qd: 1, moderation: 1, batch: 4 }),
    slow = M.io({ qd: 1, moderation: 64, batch: 4 });
  assert.ok(slow.cycles > fast.cycles);
  assert.ok(slow.completionDelay.p95 > fast.completionDelay.p95);
  const poll = M.io({ mode: 'poll', poll: 1 });
  assert.ok(poll.stats.polls > 0);
  assert.equal(poll.stats.interrupts, 0);
  const local = M.io(),
    remote = M.io({ remote: true });
  assert.ok(remote.cycles > local.cycles);
});
test('NUMA placement conserves bytes and remote responses respect directional link intervals', () => {
  for (const placement of ['first', 'parallel', 'interleave'])
    for (const migrate of [false, true]) {
      const r = M.numa({ placement, migrate, threads: 4, count: 16, mlp: 4, linkGap: 16 });
      assert.equal(r.requests.length, 64);
      assert.equal(r.stats.local + r.stats.remote, 64);
      assert.equal(
        r.stats.nodeBytes.reduce((n, x) => n + x, 0),
        64 * 64
      );
      assert.equal(r.stats.linkBytes, r.stats.remote * 64);
      for (const cpu of [0, 1]) {
        const a = r.requests
          .filter((x) => x.remote && x.cpu === cpu)
          .sort((a, b) => a.linkStart - b.linkStart);
        for (let i = 1; i < a.length; i++) assert.ok(a[i].linkStart >= a[i - 1].linkEnd);
        assert.ok(
          a.every((x) => x.linkEnd - x.linkStart === 16 && x.done === x.linkEnd + r.p.remoteHop)
        );
      }
      assert.ok(r.requests.every((x) => x.remote === (x.cpu !== x.node) && x.done > x.arrival));
    }
  const before = M.numa({ placement: 'parallel' }),
    after = M.numa({ placement: 'parallel', migrate: true });
  assert.equal(before.stats.remote, 0);
  assert.equal(after.stats.local, 0);
  assert.deepEqual(
    before.requests.map((r) => r.node),
    after.requests.map((r) => r.node)
  );
  assert.ok(after.cycles > before.cycles);
});
test('parallel first touch distributes node pressure while link limits affect remote throughput', () => {
  const serial = M.numa(),
    parallel = M.numa({ placement: 'parallel' }),
    slow = M.numa({ placement: 'parallel', migrate: true, linkGap: 32 }),
    fast = M.numa({ placement: 'parallel', migrate: true, linkGap: 2 });
  assert.ok(parallel.cycles < serial.cycles);
  assert.ok(slow.cycles > fast.cycles);
  assert.ok(slow.stats.peakLinkWait > 0);
});
test('extended Hamming corrects every single error and detects every double error for all payloads', () => {
  for (let data = 0; data < 16; data++) {
    const clean = M.ecc(data, []);
    assert.equal(clean.decoded, data);
    assert.equal(clean.syndrome, 0);
    assert.equal(clean.overall, 0);
    for (let a = 1; a <= 8; a++) {
      const one = M.ecc(data, [a]);
      assert.equal(one.corrected, a);
      assert.equal(one.decoded, data);
      assert.deepEqual(one.correctedBits, one.encoded);
      for (let b = a + 1; b <= 8; b++) {
        const two = M.ecc(data, [a, b]);
        assert.equal(two.corrected, null);
        assert.match(two.status, /Double-bit/);
        assert.equal(two.overall, 0);
        assert.notEqual(two.syndrome, 0);
      }
    }
  }
});
test('three or more errors exceed SECDED guarantees, including undetected valid words', () => {
  const triple = M.ecc(9, [1, 2, 3]);
  assert.equal(triple.guaranteed, false);
  assert.equal(triple.corrected, 8);
  assert.equal(triple.payloadMatches, false);
  const four = M.ecc(9, [1, 2, 3, 8]);
  assert.equal(four.guaranteed, false);
  assert.equal(four.syndrome, 0);
  assert.equal(four.overall, 0);
  assert.equal(four.payloadMatches, false);
  assert.equal(four.status, 'No error detected');
});
test('refresh experiment preserves requests and timing, and adds a nonuniform observed tail', () => {
  const input = C.workload({ count: 128, spacing: 8, writes: 0 }),
    a = C.simulate(input, { trace: false }),
    b = C.simulate(input, { trace: false, REFI: 128, RFC: 24 });
  assert.deepEqual(
    a.requests.map((r) => [r.id, r.arrival, r.bank, r.row]),
    b.requests.map((r) => [r.id, r.arrival, r.bank, r.row])
  );
  assert.ok(b.stats.refreshes > 0);
  assert.ok(b.latency.p99 > a.latency.p99);
  assert.ok(new Set(b.requests.map((r, i) => r.latency - a.requests[i].latency)).size > 1);
  assert.equal(a.bytes, b.bytes);
});
test('malformed advanced parameters fail before producing misleading results', () => {
  for (const f of [
    () => M.fetch([{ addr: -1, size: 4 }]),
    () => M.fetch([]),
    () => M.fetch([{ addr: 0, size: 4 }], { opEntries: -1 }),
    () => M.prefetch({ distance: NaN }),
    () => M.prefetch({ queue: 0 }),
    () => M.prefetch({ pattern: 'unknown' }),
    () => M.io({ qd: 0 }),
    () => M.io({ mode: 'busy' }),
    () => M.numa({ first: 2 }),
    () => M.numa({ mlp: 0 }),
    () => M.ecc(16, []),
    () => M.ecc(1, [2, 2])
  ])
    assert.throws(f);
});
