'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const I = require('../src/03_implementation_cases.js'),
  R = require('../src/13_measured_registry.js'),
  M = require('../src/13_measurement_bundle.js');
const { fixture } = require('./bundle-fixture.cjs');
const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
function entry(bundle, id = 'example') {
  return {
    id,
    label: 'Optional test machine',
    file: id + '.json',
    identity: Object.fromEntries(
      ['cpu_model', 'architecture', 'cpu_details'].map((k) => [k, bundle.machine[k]])
    )
  };
}
test('seven evidence labels stay distinct and the Start page legend explains each one', () => {
  assert.deepEqual(I.categories, [
    'Vendor docs',
    'Peer-reviewed',
    'Published measurement',
    'Your machine',
    'Inference',
    'Simulation',
    'Not published'
  ]);
  const sandbox = { App: {} };
  require('node:vm').runInNewContext(read('src/03_architecture_evidence.js'), sandbox);
  const labels = sandbox.App.Evidence.labels;
  assert.deepEqual(Array.from(labels, (l) => l.kind).sort(), I.categories.slice().sort());
  for (const l of labels) assert.ok(l.means && l.means.length > 20, l.kind);
});
test('implementation schematics name the generation, cite vendor sources and state limits', () => {
  assert.deepEqual(
    I.cases.map((c) => c.id),
    ['amd', 'intel', 'arm']
  );
  for (const c of I.cases) {
    assert.equal(c.kind, 'Vendor docs');
    assert.match(
      I.sources[c.source][1],
      /^https:\/\/(docs\.amd\.com|www\.intel\.com|documentation-service\.arm\.com)\//
    );
    assert.ok(c.sources.includes(c.source));
    for (const k of c.sources) assert.ok(I.sources[k], k);
    assert.ok(c.generation && c.scope && c.limits && c.prediction && c.experiment);
    assert.ok(c.nodes.length && c.edges.length);
  }
  const arm = I.cases.find((c) => c.id === 'arm');
  assert.ok(arm.nodes.some((n) => n.unknown));
  assert.equal(arm.latency_cycles, undefined);
  assert.equal(arm.llc_bytes, undefined);
});
test('published measurements keep their boundary and unknown SKU, and never set the latency model', () => {
  assert.equal(I.instruction.reported, true);
  assert.equal(I.instruction.kind, 'Published measurement');
  assert.match(I.instruction.scope, /address comes from the previous load.*core cycles.*not memory latency/);
  assert.match(I.instruction.method, /dependency chains/);
  for (const r of I.instruction.rows) {
    assert.equal(r.cpu_model, null);
    assert.ok(r.cpu_model_reason);
    assert.ok(I.sources[r.source]);
    assert.equal(r.latency_cycles, 4);
  }
  assert.deepEqual(I.counterCase.models, [
    'Intel Core Ultra 9 285K · Lion Cove',
    'AMD Ryzen 9 9900X · Zen 5'
  ]);
  assert.match(I.counterCase.fact, /different populations/);
  assert.match(I.counterCase.limits, /can’t be divided into a ratio/);
  assert.equal(I.counterCase.ratio, undefined);
  assert.doesNotMatch(read('src/28_implementation_cases.js'), /App\.CFG\s*\[[^\]]+\]\s*=/);
});
test('landing and architecture identity do not center a historical CPU', () => {
  for (const file of [
    'shell.html',
    'src/04_found_a.js',
    'src/05_ch00_map.js',
    'src/21_ch11b_atlas.js'
  ])
    assert.doesNotMatch(read(file), /Zen\+|3750H|Primary reference/i, file);
  assert.match(read('README.md'), /^# Memory Systems Lab\n/);
  assert.doesNotMatch(read('README.md').split('##')[0], /anchored|3750H|Zen\+/);
});
test('generic public registry accepts independently recorded x86 and Arm hosts', () => {
  const a = fixture(),
    b = fixture();
  b.machine.cpu_model = 'Arm fixture; TEST ONLY';
  b.machine.architecture = 'aarch64';
  b.suites.memory.runs[0].result.context.cpu_model = b.machine.cpu_model;
  b.suites.memory.runs[0].result.context.architecture = b.machine.architecture;
  M.validate(a);
  M.validate(b);
  const registry = {
    schema: 'memory-lab-measured-machines-v1',
    machines: [entry(a, 'x86'), entry(b, 'arm')]
  };
  assert.equal(R.validate(registry), registry);
  assert.ok(R.matches(registry.machines[0], a.machine));
  assert.ok(R.matches(registry.machines[1], b.machine));
  assert.equal(R.matches(registry.machines[0], b.machine), false);
});
test('registry rejects external URLs, traversal, local paths and duplicate identities before fetching', () => {
  for (const file of [
    '../secret.json',
    '/home/user/a.json',
    'https://example.com/a.json',
    'C:\\Users\\a.json',
    '\\\\host\\a.json',
    'a%2fsecret.json',
    'a..json',
    'index.json'
  ]) {
    const e = entry(fixture());
    e.file = file;
    assert.throws(() => R.validate({ schema: 'memory-lab-measured-machines-v1', machines: [e] }));
  }
  const e = entry(fixture());
  for (const registry of [
    {},
    { schema: 'memory-lab-measured-machines-v1', machines: [e, e] },
    { schema: 'memory-lab-measured-machines-v1', machines: Array(9).fill(e) }
  ])
    assert.throws(() => R.validate(registry));
  assert.deepEqual(
    R.validate({ schema: 'memory-lab-measured-machines-v1', machines: [] }).machines,
    []
  );
});
test('registry CPU gate validates architecture and complete recorded details, not filename or label', () => {
  const a = fixture(),
    e = entry(a);
  e.identity.cpu_details = { vendor_id: 'TEST', model: '1' };
  a.machine.cpu_details = { model: '1', vendor_id: 'TEST' };
  assert.ok(R.matches(e, a.machine));
  for (const change of [
    { cpu_model: 'other' },
    { architecture: 'aarch64' },
    { cpu_details: { vendor_id: 'TEST', model: '2' } }
  ])
    assert.equal(R.matches(e, { ...a.machine, ...change }), false);
  assert.doesNotMatch(
    read('src/30_measurement_workflow.js'),
    /data\/reference\/ryzen7-3750h\.json|!M\.target/
  );
});
