'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  vm = require('node:vm'),
  path = require('node:path');
const Model = require('../src/09_performance_model.js'),
  Pipe = require('../src/10_pipesim.js');
const root = path.join(__dirname, '..');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'src/00_core.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/04_shared_hw.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/04_shared_plates.js'), 'utf8'), context);
const cfg = { ghz: 4, l1: 4, l2: 12, l3: 35, dramNs: 90 };
const scenarios = [
  {},
  { chains: 1 },
  { chains: 32, mshr: 2 },
  { chains: 32, mshr: 48, controller: 1, lanes: 1, lq: 48, rob: 64 },
  {
    chains: 32,
    mshr: 48,
    controller: 16,
    lanes: 16,
    fill: 1,
    burst: 128,
    service: 80,
    lq: 48,
    rob: 64
  },
  { chains: 4, rob: 4, lq: 4, mshr: 2, controller: 1, fill: 1, service: 1, burst: 1 },
  { chains: 16, rob: 8, lq: 16, mshr: 48, lanes: 16, service: 11, burst: 4 }
];
for (const [i, params] of scenarios.entries())
  test('conservation and timing boundaries, scenario ' + i, () => {
    const r = Model.simulate({ ...params, requests: 64 });
    assert.equal(r.completed, 64);
    assert.equal(r.retired, 64);
    assert.equal(r.bytes, 64 * 64);
    assert.equal(r.usefulBytes, 64 * 8);
    for (const k of Object.keys(r.capacities)) {
      assert.ok(r.peaks[k] <= r.capacities[k], k + ' exceeds capacity');
      assert.equal(r.trace.at(-1)[k], 0, k + ' did not drain');
    }
    for (const q of r.requests) {
      if (q.dep !== null)
        assert.ok(q.issue >= r.requests[q.dep].done, 'dependent chain issued early');
      assert.ok(q.done >= q.issue + r.p.hop + r.p.service + r.p.burst);
      assert.ok(q.retired >= q.done);
      if (q.id) assert.ok(q.retired >= r.requests[q.id - 1].retired, 'out of order retirement');
    }
    assert.equal(
      r.areas.mshr,
      r.requests.reduce((s, q) => s + q.done - q.issue, 0)
    );
    assert.ok(
      Math.abs(r.occupancy.mshr - r.throughput * r.latency.mean) < 1e-9,
      'Little law boundaries mismatch'
    );
    assert.ok(
      Math.abs(r.timing.service + r.timing.transport + r.timing.queue - r.latency.mean) < 1e-9
    );
    assert.ok(r.timing.queue >= 0 && r.timing.dependency >= 0 && r.timing.readyWait >= 0);
    assert.ok(r.busUtil <= 1);
  });
test('independent chains improve throughput until service saturation; queueing then increases', () => {
  const one = Model.simulate({ chains: 1, trace: false }),
    four = Model.simulate({ chains: 4, trace: false }),
    eight = Model.simulate({ chains: 8, trace: false }),
    sixteen = Model.simulate({ chains: 16, trace: false });
  assert.ok(four.throughput > one.throughput * 3.5);
  assert.equal(eight.cycles, sixteen.cycles);
  assert.ok(sixteen.latency.mean > eight.latency.mean);
  assert.ok(sixteen.stalls.mshr > 0);
  assert.ok(sixteen.frontStall > 0);
});
test('downstream queues exert backpressure; tiny return link holds service slots', () => {
  const mc = Model.simulate({ ...scenarios[3], trace: false });
  assert.ok(mc.stalls.controller > 0 && mc.stalls.fabric > 0 && mc.frontStall > 0);
  const fill = Model.simulate({ ...scenarios[4], trace: false });
  assert.ok(fill.stalls.fill > 0);
  assert.ok(fill.busUtil > 0.95);
  assert.ok(fill.throughput <= 1 / fill.p.burst);
});
test('quantiles use nearest rank and invalid parameters fail explicitly', () => {
  assert.equal(Model.quantile([9, 1, 3, 2], 0.5), 2);
  assert.equal(Model.quantile([9, 1, 3, 2], 0.99), 9);
  for (const bad of [0, -1, NaN, Infinity, 1.2]) assert.throws(() => Model.simulate({ mshr: bad }));
  assert.throws(() => Model.simulate({ requests: 2, chains: 4 }));
});
test('dependency DAG overlaps index/translation and work, serializes page reads, separates retirement', () => {
  const r = Model.criticalPath(cfg, { level: 'DRAM', walk: false, work: 32, background: true });
  assert.equal(r.by.tlb.start, r.by.index.start);
  assert.ok(r.end < r.serial);
  assert.ok(r.valueAt < r.end && r.commitAt > r.end);
  assert.ok(!r.critical.includes('writeback'));
  const long = Model.criticalPath(cfg, { level: 'L1', walk: false, work: 512, background: true });
  assert.ok(long.critical.includes('other'));
  assert.equal(
    long.valueAt,
    Model.criticalPath(cfg, { level: 'L1', walk: false, work: 4 }).valueAt
  );
  const walk = Model.criticalPath(cfg, { level: 'DRAM', walk: true, work: 32 });
  assert.equal(walk.by.walk1.start, walk.by.walk0.end);
  assert.equal(walk.by.walk3.start, walk.by.walk2.end);
  assert.ok(walk.valueAt > r.valueAt);
  assert.throws(() =>
    Model.dag(
      [
        { id: 'a', deps: ['b'], duration: 1 },
        { id: 'b', deps: ['a'], duration: 1 }
      ],
      'a'
    )
  );
  assert.throws(() =>
    Model.dag(
      [
        { id: 'a', deps: [], duration: 1 },
        { id: 'a', deps: [], duration: 1 }
      ],
      'a'
    )
  );
});
test('shared single-access data applies row savings inside the drawn load stage', () => {
  const rows = ['hit', 'closed', 'conflict'].map((row) =>
    context.App.E2E.steps({ tlb: 'hit', lvl: 'DRAM', row })
  );
  const totals = rows.map((s) => s.reduce((a, x) => a + x.c, 0));
  assert.ok(totals[0] < totals[1] && totals[1] < totals[2]);
  assert.equal(totals[1] - totals[0], 57);
  rows.flat().forEach((x) => assert.ok(x.c >= 0));
  const l1 = ['hit', 'conflict'].map((row) =>
    context.App.E2E.steps({ tlb: 'hit', lvl: 'L1', row }).reduce((s, x) => s + x.c, 0)
  );
  assert.equal(l1[0], l1[1]);
});
test('original instruction simulator preserves results across cache levels and fractional latency', () => {
  for (const [level, missLat] of [
    ['L1', 0],
    ['L2', 12],
    ['L3', 35],
    ['DRAM', 395],
    ['L2', 1.5],
    ['DRAM', 5500]
  ]) {
    const r = Pipe.simulate({ ex: context.App.EX, level, missLat });
    assert.equal(r.mem.h123, 43n);
    assert.equal(r.mem.h7, 10n);
    assert.equal(r.freeEnd, r.freeStart);
    assert.ok(r.snaps.every((s) => s.mab.length <= r.CAP.mab));
    assert.ok(r.snaps.at(-1).rob.length === 0 && r.snaps.at(-1).sq.length === 0);
  }
});
