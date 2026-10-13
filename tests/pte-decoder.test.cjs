'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/39_lesson_widgets.js'), 'utf8');
const sandbox = { App: { h() {} } };
vm.runInNewContext(source, sandbox);
const validate = sandbox.App.LW.validatePte;

test('valid sample entries for the documented 46-bit machine A configuration', () => {
  assert.equal(validate(0x8000000129b49067n, 'pt', 46).length, 0);
  assert.equal(validate(0x0000000133c05067n, 'pml4', 46).length, 0);
  assert.equal(validate(0x80000001588000e7n, 'pd', 46).length, 0);
});
test('physical address bit 46 is reserved on machine A but allowed on machine B', () => {
  assert.match(validate(0x0000400000000001n, 'pt', 46).join(' '), /51:46/);
  assert.equal(validate(0x0000400000000001n, 'pt', 52).length, 0);
});
test('large page low address bits 13-20 and 13-29 are reserved, while PAT bit 12 is allowed', () => {
  assert.match(validate(0x2081n, 'pd', 46).join(' '), /20:13/);
  assert.match(validate(0x2081n, 'pdpt', 52).join(' '), /29:13/);
  assert.equal(validate(0x1081n, 'pd', 46).length, 0);
  assert.equal(validate(0x1081n, 'pdpt', 46).length, 0);
});
test('PML4 bit 7 is reserved, nonpresent entries can retain software bits', () => {
  assert.match(validate(0x81n, 'pml4', 46).join(' '), /Bit 7/);
  assert.equal(validate(0x0000400000002080n, 'pd', 46).length, 0);
});
test('reject ungrounded physical address widths', () => {
  assert.throws(() => validate(1n, 'pt', 53), /MAXPHYADDR/);
});
