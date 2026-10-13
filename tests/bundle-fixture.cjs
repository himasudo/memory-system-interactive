/* Synthetic TEST FIXTURE ONLY. Never a published or curated measured dataset. */
'use strict';
const M = require('../src/13_measurement_bundle.js');
function fixture() {
  const context = {
    cpu_model: 'Fixture CPU (test only)',
    kernel: 'test-kernel',
    architecture: 'x86_64',
    cpu: 0,
    allowed_cpus: [0, 1, 4, 5],
    source_sha256: 'a'.repeat(64),
    binary_sha256: 'b'.repeat(64),
    compiler: { stdout: 'fixture cc' },
    compile_command: ['cc', '-O3', 'test.c', '-o', 'test'],
    clock: 'CLOCK_MONOTONIC_RAW; ns',
    timing_boundary: 'kernel only',
    useful_byte_boundary: '8 B per load',
    quick: true,
    notes: 'SYNTHETIC TEST FIXTURE; NOT HARDWARE EVIDENCE'
  };
  const cpus = [0, 1, 4, 5].map((cpu) => ({
    cpu,
    core_id: cpu % 4,
    package_id: 0,
    die_id: 0,
    numa_node: 0,
    thread_siblings: [cpu % 4, (cpu % 4) + 4],
    online: true,
    allowed: true
  }));
  const result = {
    schema: 'memory-lab-v1',
    complete: true,
    context,
    samples: [1000, 2000, 3000].map((elapsed_ns, repeat) => ({
      mode: 'chase',
      bytes: 4096,
      chains: 1,
      steps: 100,
      operations: 100,
      useful_bytes: 800,
      seed: 1,
      cpu: 0,
      cpu_before: 0,
      cpu_after: 0,
      elapsed_ns,
      repeat,
      checksum: 'test only'
    }))
  };
  const run = {
    id: 'single-0',
    placement: { kind: 'single', cpus: [0] },
    invocation: { command: ['fixture'] },
    raw_file: 'memory.json',
    raw_sha256: 'c'.repeat(64),
    result
  };
  const suites = Object.fromEntries(
    Object.keys(M.schemas).map((name) => [
      name,
      { status: 'skipped', reason: 'Absent in synthetic fixture', runs: [], summaries: [] }
    ])
  );
  suites.memory = {
    status: 'measured',
    reason: null,
    runs: [run],
    summaries: M.summarize('memory', run)
  };
  return {
    schema: 'memory-lab-bundle-v1',
    created_utc: '2026-01-01T00:00:00Z',
    complete: false,
    notes: context.notes,
    provenance: { test_fixture: true },
    capabilities: { perf: { status: 'skipped', reason: 'Test fixture only' } },
    machine: {
      cpu_model: context.cpu_model,
      kernel: context.kernel,
      architecture: context.architecture,
      cpu_details: {},
      is_ryzen_7_3750h: false,
      topology: { cpus, allowed_cpus: [0, 1, 4, 5], online_cpus: [0, 1, 4, 5] }
    },
    suites
  };
}
function referenceIdentity(bundle) {
  // Tests emulate a file endpoint. These identity replacements are not measurements.
  const b = structuredClone(bundle);
  b.notes = 'SYNTHETIC REFERENCE-LOADER TEST; NOT HARDWARE EVIDENCE';
  b.machine.cpu_model = 'AMD Ryzen 7 3750H with Radeon Vega Mobile Gfx';
  b.machine.cpu_details = { vendor_id: 'AuthenticAMD', 'cpu family': '23', model: '24' };
  b.machine.is_ryzen_7_3750h = true;
  for (const suite of Object.values(b.suites))
    for (const run of suite.runs) {
      run.result.context.cpu_model = b.machine.cpu_model;
      run.result.context.cpu_details = b.machine.cpu_details;
      run.result.context.notes = b.notes;
      if (run.result.context.cpuinfo)
        run.result.context.cpuinfo = 'Synthetic identity fixture only; not hardware evidence';
    }
  return b;
}
module.exports = { fixture, referenceIdentity };
