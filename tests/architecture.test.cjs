'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/12_architecture_model.js');
test('SC, TSO and selected relaxed witnesses distinguish SB, MP and LB', () => {
  for (const name of ['SB', 'MP', 'LB']) {
    const sc = M.litmus({ name, model: 'sc' }),
      tso = M.litmus({ name, model: 'tso' }),
      relaxed = M.litmus({ name, model: 'relaxed' });
    assert.equal(sc.targetAllowed, false);
    assert.equal(tso.targetAllowed, name === 'SB');
    assert.equal(relaxed.targetAllowed, true);
    assert.equal(Object.keys(sc.outcomes).length, 3);
    assert.equal(Object.keys(relaxed.outcomes).length, 4);
  }
});
test('full ordering points remove all selected weak outcomes and store buffers drain', () => {
  for (const name of ['SB', 'MP', 'LB'])
    for (const model of ['sc', 'tso', 'relaxed']) {
      const r = M.litmus({ name, model, fenced: true });
      assert.equal(r.targetAllowed, false);
      for (const o of Object.values(r.outcomes)) {
        const last = o.trace.at(-1).state;
        assert.deepEqual(last.buffers, [[], []]);
        assert.deepEqual([last.registers.r0, last.registers.r1], o.values);
        assert.ok(last.issued.every((t) => t.every(Boolean)));
      }
    }
});
test('TSO witnesses issue in program order and publish their own FIFO stores', () => {
  for (const name of ['SB', 'MP', 'LB']) {
    const r = M.litmus({ name, model: 'tso' });
    for (const o of Object.values(r.outcomes))
      for (let i = 1; i < o.trace.length; i++) {
        const a = o.trace[i - 1].state,
          b = o.trace[i].state;
        for (let cpu = 0; cpu < 2; cpu++) {
          let gap = false;
          for (const issued of b.issued[cpu]) {
            if (!issued) gap = true;
            else assert.equal(gap, false);
          }
          if (b.buffers[cpu].length < a.buffers[cpu].length) {
            assert.deepEqual(b.buffers[cpu], a.buffers[cpu].slice(1));
            const w = a.buffers[cpu][0];
            assert.equal(b.memory[w.addr], w.value);
          }
        }
      }
  }
});
const trace = '0:A 1:B 1:C 1:D 1:E 0:A 1:F 0:A'
  .split(' ')
  .map((t) => ({ cpu: +t[0], line: t.charCodeAt(2) - 65 }));
test('inclusive evictions invalidate a hot private copy while NINE may preserve it', () => {
  const a = M.inclusion(trace),
    b = M.inclusion(trace, { policy: 'nine' });
  assert.ok(a.stats.backInvalidations > 0);
  assert.equal(b.stats.backInvalidations, 0);
  assert.equal(a.trace[5].where, 'memory read');
  assert.equal(b.trace[5].where, 'private hit');
  assert.ok(a.stats.memoryReads > b.stats.memoryReads);
});
test('inclusion and exclusivity invariants hold at every completed read', () => {
  const input = Array.from({ length: 128 }, (_, i) => ({
    cpu: i % 2,
    line: (i * 7 + Math.floor(i / 5)) % 11
  }));
  for (const policy of ['inclusive', 'exclusive', 'nine'])
    for (const privateLines of [1, 4])
      for (const llcLines of [1, 4]) {
        const r = M.inclusion(input, { policy, privateLines, llcLines });
        assert.equal(
          Object.values(r.stats)
            .slice(0, 4)
            .reduce((n, x) => n + x, 0),
          128
        );
        assert.equal(r.bytes, r.stats.memoryReads * 64);
        for (const e of r.trace) {
          assert.ok(e.lower.length <= llcLines);
          assert.ok(e.upper.every((a) => a.length <= privateLines));
          const upper = e.upper.flat();
          if (policy === 'inclusive') assert.ok(upper.every((x) => e.lower.includes(x)));
          if (policy === 'exclusive') assert.ok(upper.every((x) => !e.lower.includes(x)));
          assert.equal(e.unique, new Set([...upper, ...e.lower]).size);
        }
      }
});
test('peer copies are coherent holders even when an exclusive LLC has no data copy', () => {
  const r = M.inclusion(
    [
      { cpu: 0, line: 1 },
      { cpu: 1, line: 1 },
      { cpu: 0, line: 2 },
      { cpu: 1, line: 2 }
    ],
    { policy: 'exclusive', privateLines: 1 }
  );
  assert.equal(r.trace[1].where, 'peer hit');
  assert.deepEqual(r.trace[1].lower, []);
  assert.equal(r.trace[1].duplicates, 1);
  assert.ok(r.trace[3].lower.includes(1));
});
test('equal-entry granule comparison separates dense reach from sparse footprint', () => {
  const a = M.granule(),
    b = M.granule({ pageBytes: 16384 }),
    c = M.granule({ pageBytes: 65536 }),
    sparse = M.granule({ pageBytes: 65536, stride: 65536 });
  assert.equal(a.misses, 512);
  assert.equal(b.misses, 64);
  assert.equal(c.misses, 16);
  assert.equal(sparse.misses, 512);
  assert.equal(sparse.mappedBytes, a.mappedBytes * 16);
});
test('measurement comparison joins exact work and seed, using per-operation medians', () => {
  const sample = { mode: 'chase', bytes: 4096, chains: 1, steps: 100, operations: 100, seed: 1 },
    a = {
      samples: [
        { ...sample, elapsed_ns: 1000 },
        { ...sample, elapsed_ns: 3000 }
      ]
    },
    b = { samples: [{ ...sample, elapsed_ns: 4000 }] };
  const r = M.compare(a, b);
  assert.equal(r[0].a, 20);
  assert.equal(r[0].ratio, 2);
  assert.deepEqual(M.compare(a, { samples: [{ ...sample, seed: 2, elapsed_ns: 4000 }] }), []);
  assert.throws(() =>
    M.compare(a, { samples: [{ ...sample, operations: 101, elapsed_ns: 4000 }] })
  );
});
