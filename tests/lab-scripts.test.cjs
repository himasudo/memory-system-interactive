'use strict';
// Non-privileged smoke tests for the experimental runner changes. Actual
// tracefs events and cold-cache behavior still require an isolated Linux VM.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '..');
const at = (p) => path.join(root, p);
const shell = [
  'labruns/common/trace_instance.sh',
  'labruns/vm/run_all.sh',
  'labruns/vm/run_b.sh',
  'labruns/vm/reclaim.sh',
  'labruns/io/run_all.sh'
];

test('modified privileged shell runners parse correctly with /bin/sh', () => {
  for (const p of shell) cp.execFileSync('/bin/sh', ['-n', at(p)]);
});
test('modified C programs parse using the system Linux headers', () => {
  for (const p of ['labruns/vm/major.c', 'labruns/io/oneread.c', 'labruns/vm/story.c'])
    cp.execFileSync('gcc', ['-O2', '-Wall', '-fsyntax-only', at(p)], { stdio: 'pipe' });
});
test('file-specific eviction helper preserves file contents', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memlab-evict-'));
  try {
    const target = path.join(dir, 'sample.bin');
    const data = Buffer.alloc(16384, 0xa9);
    fs.writeFileSync(target, data);
    cp.execFileSync('python3', [at('labruns/common/evict_file_cache.py'), target]);
    assert.deepEqual(fs.readFileSync(target), data);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('lab runners avoid global drop_caches and use isolated trace buffers', () => {
  for (const p of ['labruns/vm/reclaim.sh', 'labruns/vm/major.c']) {
    assert.doesNotMatch(fs.readFileSync(at(p), 'utf8'), /\/proc\/sys\/vm\/drop_caches/, p);
  }
  for (const p of ['labruns/vm/run_all.sh', 'labruns/vm/run_b.sh', 'labruns/io/run_all.sh']) {
    const s = fs.readFileSync(at(p), 'utf8');
    assert.match(s, /memlab_trace_setup/, p);
    assert.doesNotMatch(s, /mount -t tracefs/, p);
  }
  const trace = fs.readFileSync(at('labruns/common/trace_instance.sh'), 'utf8');
  assert.match(trace, /trap 'memlab_trace_cleanup' EXIT/);
  assert.match(trace, /\/instances\//);
});
