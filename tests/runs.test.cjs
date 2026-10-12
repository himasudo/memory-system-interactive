/* Every lab-run excerpt a lesson quotes must appear in the raw output file it names. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Runs = require('../src/38_runs.js');

const root = path.join(__dirname, '..', 'labruns');
const norm = (s) => s.replace(/[⟦⟧]/g, '').replace(/\s+/g, ' ').trim();

test('every quoted line appears in its lab-run file', () => {
  const ids = Object.keys(Runs.runs);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const r = Runs.runs[id];
    const file = path.join(root, r.file);
    assert.ok(fs.existsSync(file), id + ': missing ' + r.file);
    const text = norm(fs.readFileSync(file, 'utf8'));
    for (const line of r.lines) {
      const l = norm(line);
      if (!l || l.startsWith('#') || l.startsWith('…')) continue;
      assert.ok(text.includes(l), id + ': not found in ' + r.file + ': ' + l);
    }
  }
});

test('every excerpt says what was run', () => {
  for (const [id, r] of Object.entries(Runs.runs)) {
    assert.ok(typeof r.what === 'string' && r.what.length > 10, id + ' needs a description');
  }
});

test('every excerpt names the machine its file came from', () => {
  /* labruns/vm/out: machine A; labruns/vm/out-b, labruns/io and machine-b.txt: machine B */
  for (const [id, r] of Object.entries(Runs.runs)) {
    const isB = /^(vm\/out-b\/|io\/|machine-b\.txt$)/.test(r.file);
    assert.equal(r.machine || 'a', isB ? 'b' : 'a', id + ': ' + r.file + ' comes from machine ' + (isB ? 'B' : 'A'));
  }
});
