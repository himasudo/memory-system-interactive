/* ======================= lab runs: real outputs quoted by the lessons =======================
   Every excerpt names the file under labruns/ it was taken from. tests/runs.test.cjs checks that
   each quoted line (⟦highlight⟧ marks removed, lines starting with "#" or "…" skipped) appears in
   that file, so a lesson can only quote what a program really printed. */
var LabRuns = (function () {
  'use strict';
  var R = {
    /* ---- Part III: the main run (labruns/vm/story.c) ---- */
    'story.mmap': {
      file: 'vm/out/story.txt',
      what: 'The main run (story.c): reserve 4 pages at 0x7f3a1b2c3000, then look at page 0.',
      lines: [
        '== mmap(0x7f3a1b2c3000, 16384, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS|MAP_FIXED_NOREPLACE) = 0x7f3a1b2c3000',
        'its line in /proc/self/maps:',
        '  7f3a1b2c3000-7f3a1b2c7000 rw-p 00000000 00:00 0',
        'page 0 after mmap              pagemap=⟦0x0000000000000000⟧  present=0 exclusive=0 pfn=0x0'
      ]
    },
    'story.store': {
      file: 'vm/out/story.txt',
      what: 'The main run: the store, then what pagemap says about page 0.',
      lines: [
        '== store p[0xd4e] = 1  (address 0x7f3a1b2c3d4e)',
        'faults during the store: 1',
        'page 0 after the store         pagemap=0x8100000000129b49  present=1 exclusive=1 pfn=⟦0x129b49⟧'
      ]
    },
    'story.pagemap0': {
      file: 'vm/out/story.txt',
      what: 'The main run: page 0 before and after the store.',
      lines: [
        'page 0 after mmap              pagemap=0x0000000000000000  present=0 exclusive=0 pfn=0x0',
        'page 0 after the store         pagemap=⟦0x8100000000129b49⟧  present=1 exclusive=1 pfn=0x129b49'
      ]
    },
    'story.objdump': {
      file: 'vm/out/story.objdump.txt',
      what: 'objdump -d story: the instruction the compiler made from p[0xd4e] = 1. %r12 holds p.',
      lines: ['    1e97:\tmovb   $0x1,0xd4e(%r12)']
    },
    'story.maps': {
      file: 'vm/out/story.txt',
      what: 'The main run: /proc/self/maps at start (file paths shortened to …/name).',
      lines: []
    }
  };
  function get(id) {
    var r = R[id];
    if (!r) throw new Error('Unknown lab run: ' + id);
    return r;
  }
  function text(id) {
    return get(id).lines.join('\n');
  }
  return { runs: R, get: get, text: text };
})();
if (typeof App !== 'undefined') App.RUNS = LabRuns;
if (typeof module !== 'undefined') module.exports = LabRuns;
