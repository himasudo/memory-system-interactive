'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/13_measurement_bundle.js'),
  { fixture, referenceIdentity } = require('./bundle-fixture.cjs');
test('aggregate preserves raw trials and derives whole-trial median / dispersion', () => {
  const b = fixture();
  assert.equal(M.validate(b), b);
  const stats = M.summarize('memory', b.suites.memory.runs[0])[0].statistics;
  assert.equal(stats.n, 3);
  assert.equal(stats.median, 20);
  assert.equal(stats.mad, 10);
  assert.equal(stats.p95, 30);
  assert.equal(b.suites.memory.runs[0].result.samples[0].elapsed_ns, 1000);
});
test('partial and unsupported suites require explicit reasons', () => {
  const b = fixture();
  assert.equal(M.validate(b).complete, false);
  b.suites.vm.reason = null;
  assert.throws(() => M.validate(b), /reason/);
});
test('malformed aggregate provenance is rejected before replacement', () => {
  for (const mutate of [
    (b) => (b.suites.vm = null),
    (b) => (b.complete = true),
    (b) => (b.machine.is_ryzen_7_3750h = true),
    (b) => (b.suites.memory.runs[0].result.context.kernel = 'elsewhere'),
    (b) => (b.suites.memory.runs[0].result.context.source_sha256 = 'bad'),
    (b) => (b.suites.memory.runs[0].placement.cpus = [100]),
    (b) => (b.suites.memory.runs[0].result.samples[0].cpu_after = 1),
    (b) => b.machine.topology.cpus.push(b.machine.topology.cpus[0])
  ]) {
    const b = fixture();
    mutate(b);
    assert.throws(() => M.validate(b));
  }
});
test('Ryzen identity comes from model, vendor, family and model; never filename', () => {
  const b = referenceIdentity(fixture());
  assert.equal(M.validate(b), b);
  assert.equal(M.target(b.machine), true);
  b.machine.cpu_details.model = '25';
  assert.equal(M.target(b.machine), false);
  assert.throws(() => M.validate(b), /identity|identification/);
});
test('SMT and physical labels are checked against topology', () => {
  for (const kind of ['smt_siblings', 'physical_cores']) {
    const b = fixture(),
      r = b.suites.memory.runs[0];
    r.placement.kind = kind;
    assert.throws(() => M.validate(b), /placement/);
  }
  const b = fixture();
  b.machine.topology.cpus[0].thread_siblings = [0];
  assert.equal(M.validate(b), b);
});
test('comparison pairs exact work and boundaries and derives a descriptive ratio', () => {
  const a = fixture(),
    b = fixture();
  for (const row of b.suites.memory.runs[0].result.samples) row.elapsed_ns *= 2;
  const rows = M.comparisons(a, b, 'memory');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ratio, 2);
  assert.equal(rows[0].partial, false);
  for (const change of [
    (r) => (r.result.context.timing_boundary = 'whole process'),
    (r) => (r.result.context.source_sha256 = 'd'.repeat(64)),
    (r) => (r.result.context.quick = false),
    (r) => (r.result.context.compile_command[1] = '-O2'),
    (r) => r.result.samples.forEach((s) => (s.seed = 2)),
    (r) => r.result.samples.forEach((s) => (s.steps = 101))
  ]) {
    const other = fixture();
    change(other.suites.memory.runs[0]);
    assert.deepEqual(M.comparisons(a, other, 'memory'), []);
  }
});
test('logical CPU numbers may differ while the physical placement relationship matches', () => {
  const a = fixture(),
    b = fixture(),
    r = b.suites.memory.runs[0];
  r.placement.cpus = [1];
  r.result.context.cpu = 1;
  for (const s of r.result.samples) s.cpu = s.cpu_before = s.cpu_after = 1;
  assert.equal(M.validate(b), b);
  assert.equal(M.comparisons(a, b, 'memory').length, 1);
});
test('whole-process perf evidence is not part of kernel-time comparison arithmetic', () => {
  const a = fixture(),
    b = fixture();
  b.capabilities.perf = {
    status: 'collected',
    reason: 'separate execution',
    records: [{ event: 'cycles:u', counter: { value: 999999999 }, boundary: 'whole process' }]
  };
  assert.equal(M.comparisons(a, b, 'memory')[0].ratio, 1);
});
test('memory work, CPU identity and quick/full provenance are required', () => {
  for (const change of [
    (r) => r.result.samples[0].steps++,
    (r) => (r.result.samples[0].elapsed_ns = 1.5),
    (r) => delete r.result.context.quick,
    (r) => (r.result.context.cpu_details = { 'model name': 'different CPU' })
  ]) {
    const b = fixture();
    b.machine.cpu_details = { 'model name': b.machine.cpu_model };
    change(b.suites.memory.runs[0]);
    assert.throws(() => M.validate(b));
  }
});
function sharing(kind, cpus) {
  const b = fixture(),
    base = b.suites.memory.runs[0],
    context = { ...base.result.context, cpus, timing_boundary: 'release barrier through joins' };
  delete context.cpu;
  const run = {
    ...base,
    id: kind,
    placement: { kind, cpus },
    result: {
      schema: 'memory-lab-sharing-v1',
      context,
      complete: true,
      samples: [
        {
          mode: 'padded',
          op: 'add',
          threads: 2,
          iterations: 100,
          operations: 200,
          elapsed_ns: 2000,
          checksum: 200,
          cas_failures: 0,
          stride_bytes: 64,
          line_bytes_assumed: 64,
          observed_cpus: cpus
        }
      ]
    }
  };
  b.suites.memory = { status: 'skipped', reason: 'Fixture only', runs: [], summaries: [] };
  b.suites.sharing = {
    status: 'measured',
    reason: null,
    runs: [run],
    summaries: M.summarize('sharing', run)
  };
  return b;
}
test('valid reciprocal SMT and distinct physical placements survive bundle validation', () => {
  const smt = sharing('smt_siblings', [0, 4]),
    physical = sharing('physical_cores', [0, 1]);
  assert.equal(M.validate(smt), smt);
  assert.equal(M.validate(physical), physical);
  smt.machine.topology.cpus.find((r) => r.cpu === 4).thread_siblings = [4];
  assert.throws(() => M.validate(smt), /reciprocal/);
  physical.machine.topology.cpus.find((r) => r.cpu === 1).core_id = 0;
  assert.throws(() => M.validate(physical), /Physical-core/);
});
test('VM comparisons refuse differing or mixed observed page-mapping outcomes', () => {
  const a = fixture(),
    run = a.suites.memory.runs[0],
    context = {
      ...run.result.context,
      stage_boundary: 'whole-stage traversal',
      fault_boundary: 'stage getrusage deltas'
    };
  delete context.timing_boundary;
  const row = {
    kind: 'anon',
    advice: 'huge',
    bytes: 4096,
    page_bytes: 4096,
    cpu: 0,
    advice_errno: 0,
    repeat: 0,
    smaps: { before: 'KernelPageSize: 4 kB\nMMUPageSize: 4 kB\nAnonHugePages: 0 kB' },
    stages: ['first-read', 'first-write', 'repeat-write', 'child-write', 'parent-check'].map(
      (name) => ({
        name,
        elapsed_ns: 1000,
        minor: 0,
        major: 0,
        checksum: 0,
        cpu_before: 0,
        cpu_after: 0
      })
    ),
    verification: { passed: true }
  };
  a.suites.vm = {
    status: 'measured',
    reason: null,
    runs: [
      {
        ...run,
        id: 'vm-0',
        result: { schema: 'memory-lab-vm-v1', context, complete: true, samples: [row] }
      }
    ],
    summaries: []
  };
  const b = structuredClone(a);
  assert.equal(M.comparisons(a, b, 'vm').length, 5);
  b.suites.vm.runs[0].result.samples[0].smaps.before += '\nAnonHugePages: 2048 kB';
  assert.deepEqual(M.comparisons(a, b, 'vm'), []);
  b.suites.vm.runs[0].result.samples.unshift(structuredClone(row));
  assert.deepEqual(M.comparisons(a, b, 'vm'), []);
  const unknown = structuredClone(a);
  unknown.suites.vm.runs[0].result.samples[0].smaps = { before: 'unavailable: permission denied' };
  assert.deepEqual(M.comparisons(unknown, unknown, 'vm'), []);
});
