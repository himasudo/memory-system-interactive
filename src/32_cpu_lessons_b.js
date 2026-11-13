/* ======================= Part II · inside the core (II.05–II.11) ======================= */
(function () {
  'use strict';
  var d = App.gloss;
  d('stage', 'pipeline stage', 'One step of an instruction’s path through a core, taking one clock cycle. Each stage works on a different instruction in the same cycle.');
  d('width', 'width (superscalar)', 'How many instructions a stage can handle per cycle. The example core fetches, decodes, renames and retires up to 4 per cycle.');
  d('truedep', 'true dependence (RAW)', 'A µop reads a value an older µop writes: read after write. It must wait for that value. The only kind of dependence renaming cannot remove.');
  d('falsedep', 'false dependence (WAR, WAW)', 'Two µops use the same register name for unrelated values: write after read, or write after write. Renaming removes it by giving each write its own physical register.');
  d('archreg', 'architectural register', 'A register name the instruction set defines, such as rax. x86-64 has 16 integer ones. A core keeps many more physical registers behind them.');
  d('precise', 'precise exception', 'An exception handled as if every older instruction had finished and no younger one had changed anything. Retiring in program order makes every exception precise.');
  d('window', 'instruction window', 'The µops a core holds between dispatch and retirement, from which it picks work out of order. Its size is bounded by the ROB and the other queues.');
  d('replay', 'replay', 'Running a µop again because it ran with a wrong input, for example a load that went ahead of an older store to the same address.');
  App.setCategory('stage width truedep falsedep archreg precise window replay', 'core');
  var AGNER = ['Agner Fog, The microarchitecture of Intel, AMD and VIA CPUs', 'https://www.agner.org/optimize/microarchitecture.pdf'];
  var SDM = ['Intel 64 and IA-32 Software Developer Manuals', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html'];
  var DREPPER = ['Ulrich Drepper, What Every Programmer Should Know About Memory (2007)', 'https://www.akkadia.org/drepper/cpumemory.pdf'];

  /* ---------- II.05 ---------- */
  App.lesson({
    id: 'cpu-pipe', short: 'A pipeline', title: 'A pipeline: many instructions at once',
    lede: 'A core works on many instructions at once, each at a different step. Pipelining raises how many finish per cycle; it does not make any one of them faster.',
    know: ['Latency, throughput and dependency chains ([[ch:time]]).', 'Fetch, predecode, decode and µops ([[ch:cpu-code]], [[ch:cpu-uops]]).'],
    learn: ['Explain how a pipeline overlaps instructions, and what it does to latency and throughput', 'Name the example core’s stages in order', 'Say what stops a pipeline: a dependency, a branch, a miss'],
    sections: [
      { id: 'steps', title: 'The same steps for every instruction', body: function (L) {
        L.p('Every instruction goes through the same steps. A simple version has four: fetch it, decode it, execute it, write back its result.');
        L.p('A core that finished one instruction before starting the next would need four cycles for each:');
        L.table(['cycle', '1', '2', '3', '4', '5', '6', '7', '8'], [
          ['instruction 1', 'fetch', 'decode', 'execute', 'write', '', '', '', ''],
          ['instruction 2', '', '', '', '', 'fetch', 'decode', 'execute', 'write']
        ], { title: 'one at a time: 2 instructions in 8 cycles' });
        L.p('While instruction 1 decodes, the fetch hardware sits idle. So does every other step, three cycles out of four.');
      } },
      { id: 'overlap', title: 'Overlap them', body: function (L) {
        L.p('A pipeline starts the next instruction’s fetch while the previous one decodes. Each step becomes a stage, and every stage works on a different instruction in the same cycle.', ['pipeline', 'stage']);
        L.table(['cycle', '1', '2', '3', '4', '5', '6', '7'], [
          ['instruction 1', 'fetch', 'decode', 'execute', 'write', '', '', ''],
          ['instruction 2', '', 'fetch', 'decode', 'execute', 'write', '', ''],
          ['instruction 3', '', '', 'fetch', 'decode', 'execute', 'write', ''],
          { cells: ['instruction 4', '', '', '', 'fetch', 'decode', 'execute', 'write'], hot: true }
        ], { title: 'pipelined: 4 instructions in 7 cycles' });
        L.p('Each instruction still takes 4 cycles from fetch to write: its latency is unchanged. But once the pipeline is full, one instruction finishes every cycle. 100 independent instructions take 103 cycles, not 400.');
      } },
      { id: 'wide', title: 'Several per cycle', body: function (L) {
        L.p('A pipeline can also be wide: each stage handles several instructions per cycle. The example core fetches, decodes, renames and retires up to 4 per cycle.', ['width']);
        L.p('The best case is then 4 instructions per cycle. The number a program really achieves is its IPC.', ['ipc']);
        L.p('Our loop is 4 instructions per iteration, counting the fused <code>cmp</code> + <code>jne</code> as one. At full width, one iteration would finish every cycle. The next lessons show what stands in the way.');
      } },
      { id: 'stages', title: 'The example core’s stages', body: function (L) {
        L.p('A real core splits the work into more stages than four. The example core has these, and the lab at the end of this part uses the same short names:');
        L.table(['Stage', 'Name', 'What happens', 'Lesson'], [
          ['BP', 'predict', 'guess the next fetch address', '[[ch:cpu-branch]]'],
          ['IF', 'fetch', 'read 32 bytes from the L1i', '[[ch:cpu-code]]'],
          ['PD', 'predecode', 'find where instructions start', '[[ch:cpu-code]]'],
          ['DE', 'decode', 'turn instructions into µops', '[[ch:cpu-uops]]'],
          ['UQ', 'µop queue', 'wait for the back end', '[[ch:cpu-uops]]'],
          ['RN', 'rename', 'give each result its own register', '[[ch:cpu-rename]]'],
          ['DS', 'dispatch', 'take ROB, scheduler and queue entries', '[[ch:cpu-sched]]'],
          ['IS', 'issue', 'pick a ready µop for a port', '[[ch:cpu-sched]]'],
          ['RR', 'register read', 'read the µop’s inputs', '[[ch:cpu-sched]]'],
          ['EX / AG', 'execute / address', 'compute a result or an address', '[[ch:cpu-sched]]'],
          ['D1, D2', 'data cache', 'TLB and L1d tags, then data or the store queue', '[[ch:cpu-lsq]]'],
          ['WB', 'write back', 'store the result, wake µops that need it', '[[ch:cpu-sched]]'],
          ['RT', 'retire', 'make the result final, in program order', '[[ch:cpu-ooo]]'],
          ['CM', 'commit', 'a retired store writes the L1d', '[[ch:cpu-lsq]]']
        ], { mono: false });
        L.p('The front end, from BP to UQ, works in program order. From IS to WB, µops move in whatever order their inputs allow. RT and CM put everything back in program order.');
      } },
      { id: 'stops', title: 'What stops the flow', body: function (L) {
        L.p('A full pipeline finishes one instruction per stage-slot per cycle only while nothing holds it up. Three things do:');
        L.list([
          '<b>A dependency.</b> A µop needs a value that is not ready. The add in <code>hist[k]++</code> needs the load of <code>hist[k]</code>: 4 cycles even when it hits the L1d.',
          '<b>A branch.</b> Fetch needs the next address before the branch has executed.',
          '<b>A miss.</b> A load waits 12, 35 or hundreds of cycles for its line.'
        ], ['depchain']);
        L.p('A simple pipeline stops behind each of these. A modern core keeps going: it predicts branches ([[ch:cpu-branch]]), runs µops out of order ([[ch:cpu-ooo]]) and overlaps misses ([[ch:cpu-miss]]).');
      } }
    ],
    check: [
      { q: 'In the 4-stage pipeline, how many cycles does one instruction take from fetch to write?', options: ['4, the same as without pipelining', '1', '2', 'It depends on the width'], answer: 0, why: 'Pipelining overlaps instructions; each one still passes through all four stages.' },
      { q: 'About how many cycles do 100 independent instructions take in a 4-stage, 1-wide pipeline?', options: ['103', '400', '100', '25'], answer: 0, why: '3 cycles to fill the pipeline, then one instruction finishes each cycle.' },
      { q: 'Between which stages do the example core’s µops move out of program order?', options: ['From issue (IS) to write back (WB)', 'From fetch to decode', 'From retire to commit', 'Everywhere'], answer: 0, why: 'The front end and rename work in order; schedulers pick ready µops in any order; retirement restores the order.' },
      { q: 'Which of these does not stop a simple pipeline?', options: ['An instruction that does not depend on anything in flight', 'A load that misses in the L1d', 'A branch whose target is not known yet', 'An add that needs the result of a load'], answer: 0, why: 'Independent instructions are exactly what a pipeline overlaps. Dependencies, branches and misses each make a stage wait.' }
    ],
    remember: [
      'A pipeline overlaps instructions: latency stays the same, throughput rises.',
      'The example core is 4 wide; IPC is how many instructions per cycle a program really retires.',
      'The front end works in program order; the middle of the core does not; retirement restores the order.',
      'Dependencies, branches and misses are what hold a pipeline up.'
    ],
    sources: [AGNER]
  });

  /* ---------- II.06 ---------- */
  App.lesson({
    id: 'cpu-branch', short: 'Predicting branches', title: 'Predicting branches',
    lede: 'A branch is resolved about ten stages after it is fetched, so fetch guesses where it goes. A wrong guess throws away everything fetched after it.',
    know: ['The example core’s stages ([[ch:cpu-pipe]]).', 'The loop ends with a fused cmp + jne ([[ch:cpu-uops]]).'],
    learn: ['Explain why fetch must predict branches', 'Follow the example core’s one misprediction, at the end of the loop', 'Read what wrong guesses cost on a real machine'],
    sections: [
      { id: 'problem', title: 'Fetch cannot wait', body: function (L) {
        L.p('The <code>jne</code> at the end of the loop decides where the next instruction comes from. But it only executes late: in the example core, the first one is fetched in cycle 1 and resolved in cycle 10.');
        L.p('If fetch waited for every branch, each iteration would cost about ten cycles, whatever the width of the core.');
      } },
      { id: 'predict', title: 'Guess, and keep fetching', body: function (L) {
        L.p('So the first stage, BP, guesses. A branch predictor remembers how each branch went before and predicts it will do the same.', ['bp']);
        L.p('It also needs the target. A branch target buffer remembers where each branch jumped last time, keyed by the branch’s address.', ['btb']);
        L.p('A loop branch is easy: taken, taken, taken. The example core predicts <code>jne .L3</code> taken every time and keeps fetching the loop.');
      } },
      { id: 'spec', title: 'Running on a guess', body: function (L) {
        L.p('Everything fetched after a predicted branch runs before anyone knows the guess was right. That is speculative execution.', ['spec']);
        L.p('Its results stay inside the core. Registers are renamed copies, and stores sit in the store queue. Nothing becomes final until it retires, after the branch has been checked ([[ch:cpu-ooo]]).');
        L.note('careful', 'Squashed µops change no registers and no memory, but a load they ran may already have brought a line into the cache. Measuring that left-over line is how the Spectre attacks read data across a security boundary.');
      } },
      { id: 'wrong', title: 'The wrong guess at the end of the loop', body: function (L) {
        L.p('The example runs the loop for <code>n</code> = 3 bytes. The third <code>jne</code> is predicted taken, like the two before it, but this time <code>rdi</code> equals <code>rsi</code> and the branch falls through.');
        L.chain([
          { k: 'cycle 3', v: 'J3 fetched', d: 'predicted taken' },
          { k: 'cycles 4–11', v: '8 more iterations fetched', d: '32 instructions on the wrong path' },
          { k: 'cycle 12', v: 'J3 resolves', d: 'not taken: mispredicted', hot: true },
          { k: 'cycle 13', v: 'fetch restarts at ret', d: 'the 32 instructions are squashed' }
        ], { title: 'The example core’s one misprediction', label: 'Simulation' });
        L.p('Every instruction younger than the branch is thrown away: its ROB entry, its queue entries and its physical registers are released. Fetch restarts at the correct address, <code>ret</code>.', ['mispredict', 'squash']);
        L.p('The cost is the time from the guess to the redirect, plus the time to refill the front end. Here <code>ret</code> reaches decode in cycle 16, 13 cycles after J3 was fetched.');
      } },
      { id: 'measure', title: 'What wrong guesses cost on a real machine', body: function (L) {
        L.p('This program counts the bytes of a 1 MiB array that are 128 or more. The <code>if</code> becomes a conditional jump, taken or not depending on each byte:');
        L.code('for (long i = 0; i < n; i++)\n    if (d[i] >= 128)\n        c++;', { title: 'labruns/hw/branch.c (shortened)' });
        L.p('It runs twice on machine C over the same bytes: first in random order, then sorted. Sorted, the branch goes one way for the first half and the other way for the second; random, it is a coin toss each time.');
        L.out('c.branch');
        L.p('Same bytes, same instructions, same count; 15 times slower in random order. With random bytes about half of the guesses are wrong, so each wrong guess costs about (3.81 − 0.26) × 2 ≈ 7 ns. (Inference)');
        L.note('deeper', 'A compiler can avoid the branch altogether with a conditional move or arithmetic. labruns/hw/branch.c stops gcc from doing that, so the branch is really there to measure.');
      } }
    ],
    check: [
      { q: 'Why does a core predict branches instead of waiting for them?', options: ['A branch resolves many stages after it is fetched, and fetch would sit idle until then', 'Branches are rare', 'Predictions are always right', 'To save power in the ALUs'], answer: 0, why: 'In the example core a branch fetched in cycle 1 resolves in cycle 10; waiting would cost those cycles on every branch.' },
      { q: 'What happens to the 32 instructions fetched after the mispredicted jne?', options: ['They are squashed: their entries and registers are released and nothing they did becomes final', 'They retire normally', 'They are moved to another core', 'They are saved and replayed later'], answer: 0, why: 'They ran on a wrong guess. Since nothing retires before it is confirmed, the core can simply throw them away.' },
      { q: 'Machine C counts the same bytes 15 times faster when they are sorted. Why?', options: ['Sorted, the branch is easy to predict; random, about half of the guesses are wrong', 'Sorted data fits in the L1d and random data does not', 'Sorting removes the branch', 'Random data needs more instructions'], answer: 0, why: 'The same 1 MiB array and the same loop run in both cases; only the order of outcomes changes, and with it the number of mispredictions.' }
    ],
    remember: [
      'Fetch predicts each branch’s direction and target, so it never waits for the branch to execute.',
      'Everything after a predicted branch runs speculatively; nothing is final until it retires.',
      'A misprediction squashes every younger instruction and restarts fetch: tens of cycles lost.',
      'Unpredictable branches can make the same work many times slower: 15 times on machine C.'
    ],
    sources: [AGNER]
  });

  /* ---------- II.07 ---------- */
  App.lesson({
    id: 'cpu-ooo', short: 'Running out of order', title: 'Running out of order',
    lede: 'A core starts each µop as soon as its inputs are ready, not in program order. The reorder buffer puts the results back in order at the end.',
    know: ['Pipelines stop on dependencies, branches and misses ([[ch:cpu-pipe]]).', 'Fetch keeps going past branches by predicting them ([[ch:cpu-branch]]).'],
    learn: ['Explain why an in-order core waits behind a miss and an out-of-order core need not', 'Find what each µop of the loop depends on', 'Say what the reorder buffer does at dispatch and at retirement, and what limits it'],
    sections: [
      { id: 'wait', title: 'An in-order core waits', body: function (L) {
        L.p('Suppose the load of <code>hist[123]</code> in iteration 1 misses the L1d and the L2, and hits the L3: 35 cycles.');
        L.p('A core that runs µops in program order cannot start anything after that load until it returns. Yet the next iteration’s <code>movzbl</code> reads <code>data[1]</code>, which has nothing to do with <code>hist</code>.');
        L.p('35 cycles of useful work sit there, ready to run, behind one slow load.');
      } },
      { id: 'graph', title: 'What depends on what', body: function (L) {
        L.p('Write down, for each µop of one iteration, which values it needs:');
        L.table(['µop', 'needs', 'produces'], [
          ['A: load <code>data[i]</code>', '<code>rdi</code>', '<code>rax</code>'],
          ['B: <code>rdi + 1</code>', '<code>rdi</code>', 'the next <code>rdi</code>'],
          ['C.ld: load <code>hist[rax]</code>', '<code>rdx</code>, <code>rax</code> from A', 'the old count'],
          ['C.add', 'the old count', 'the new count'],
          ['C.sta', '<code>rdx</code>, <code>rax</code> from A', 'the store’s address'],
          ['C.std', 'the new count', 'the store’s data'],
          ['BR', 'the next <code>rdi</code> from B, <code>rsi</code>', 'the branch outcome']
        ], { mono: false, terms: ['truedep'] });
        L.p('The only thing the next iteration needs from this one is <code>rdi</code>, one add. The long part, A → C.ld → C.add → C.std, hangs off to the side. So iterations can overlap: the next one’s loads can start while this one’s count is still on its way.');
      } },
      { id: 'ooo', title: 'Start each µop when its inputs are ready', body: function (L) {
        L.p('An out-of-order core keeps a window of µops that have been fetched and renamed but not finished. Each cycle it starts any of them whose inputs are ready, oldest first.', ['window']);
        L.p('While the load of <code>hist[123]</code> waits, the window still holds iteration 2 and 3: their <code>data</code> loads, their pointer adds, their branches. They run in the meantime.');
        L.p('The lab at the end of this part shows it cycle by cycle: in the example, iteration 2’s <code>movzbl</code> issues in cycle 8, three cycles before iteration 1’s load of <code>hist</code>.');
      } },
      { id: 'rob', title: 'The reorder buffer keeps the order', body: function (L) {
        L.p('Running out of order must not change what the program does. The reorder buffer, ROB, takes care of that.', ['rob']);
        L.chain([
          { k: 'dispatch', v: 'in program order', d: 'each instruction takes the next ROB entry' },
          { k: 'execute', v: 'in any order', d: 'a finished µop marks its entry done', hot: true },
          { k: 'retire', v: 'in program order', d: 'only from the oldest entry, once it is done' }
        ], { cap: 'Order in, any order in the middle, order out.' });
        L.p('An instruction retires only when it and every older instruction are done. Then its results become final, and its ROB entry is reused. The example core retires up to 4 per cycle.', ['retire', 'dispatch']);
        L.p('The example ROB has 24 entries, six iterations of the loop. AMD’s Zen 5 has 448.');
      } },
      { id: 'precise', title: 'Why retire in order', body: function (L) {
        L.p('Suppose a load takes a page fault. The kernel must find the program as if every instruction before the load had run and none after it had ([[ch:vm-faults]]).', ['precise']);
        L.p('Retiring in order makes that easy. Younger instructions may have executed, but none has retired, so the core throws them away, exactly as after a mispredicted branch ([[ch:cpu-branch]]).');
      } },
      { id: 'limit', title: 'How far ahead a core can look', body: function (L) {
        L.p('The window cannot grow forever. When the oldest instruction is a load still waiting for its line, nothing can retire, and new instructions keep filling the ROB until it is full. Then dispatch stops.');
        L.p('In the example core, 24 entries at 4 per cycle fill in about 6 cycles. A DRAM access takes about ' + App.dramCycles() + ' cycles, so the core then waits for most of it.');
        L.p('Even 448 entries fill in about 110 cycles at that rate. That is why a core’s ability to keep several misses in flight at once matters as much as its window ([[ch:cpu-miss]]).');
      } }
    ],
    check: [
      { q: 'The load of hist[k] misses. What can an out-of-order core do meanwhile?', options: ['Run younger µops whose inputs are ready, such as the next data loads and pointer adds', 'Nothing until the load returns', 'Retire the younger µops first', 'Skip the load'], answer: 0, why: 'Only µops that need the loaded value must wait. Independent ones run, but none of them retires before the load.' },
      { q: 'What does the next iteration need from this one?', options: ['Only the new rdi', 'The new value of hist[k]', 'The branch outcome and rax', 'Nothing at all'], answer: 0, why: 'Its movzbl reads data at rdi, and its add increments rdi. The count chain hangs off to the side (unless two iterations hit the same hist entry; see [[ch:cpu-lsq]]).' },
      { q: 'Why does retirement happen in program order?', options: ['So a fault or a misprediction leaves the program in a state where every older instruction is done and no younger one counts', 'Because execution units are in order', 'Because the cache needs it', 'It does not: retirement is out of order'], answer: 0, why: 'In-order retirement gives precise exceptions and lets the core discard younger work after a wrong guess.' },
      { q: 'A load at the head of the ROB waits for DRAM. What happens next?', options: ['The ROB fills up and dispatch stops until the load returns', 'The load moves to the back of the ROB', 'The core retires younger instructions around it', 'The ROB grows'], answer: 0, why: 'Nothing retires past the head, so new instructions only add entries until none is left.' }
    ],
    remember: [
      'Out-of-order execution starts each µop when its inputs are ready, so independent work runs during a miss.',
      'The ROB: dispatch in order, execute in any order, retire in order.',
      'In-order retirement makes exceptions precise and lets wrong-path work be thrown away.',
      'A long miss at the head fills the ROB; then the core stops until the miss returns.'
    ],
    sources: [AGNER]
  });

  /* ---------- II.08 ---------- */
  App.lesson({
    id: 'cpu-rename', short: 'Register renaming', title: 'Register renaming',
    lede: 'Every iteration writes rax again. Renaming gives each write its own physical register, so µops wait only for the values they really need.',
    know: ['Out-of-order execution and the ROB ([[ch:cpu-ooo]]).', 'The loop writes rax in movzbl and reads it in addq ([[ch:cpu-code]]).'],
    learn: ['Tell a true dependence from a false one', 'Read the example core’s renaming of the first two iterations', 'Say when a physical register is freed, and what happens when none is free'],
    sections: [
      { id: 'names', title: 'One name, many values', body: function (L) {
        L.p('The loop uses the register <code>rax</code> for <code>data[i]</code> in every iteration: 123, then 123, then 7.');
        L.p('If <code>rax</code> were one storage place, iteration 2’s <code>movzbl</code> could not write it before iteration 1’s <code>addq</code> had read it. That wait has nothing to do with data: the two iterations only share a name.', ['truedep', 'falsedep']);
        L.p('A true dependence is a µop reading a value another µop writes. A false one comes from reusing a name. Out-of-order execution needs the false ones gone.');
      } },
      { id: 'prf', title: 'More registers than names', body: function (L) {
        L.p('x86-64 defines 16 integer registers. A core has many more storage places for register values behind them, the physical registers: 48 in the example core, 240 integer ones in AMD’s Zen 5.', ['archreg', 'prf']);
        L.p('A table, the RAT, records for each register name which physical register holds its newest value. Renaming reads it for each µop’s inputs and gives each output a fresh physical register.', ['rat', 'rename']);
      } },
      { id: 'walk', title: 'Renaming the loop', body: function (L) {
        L.p('Before the loop, the example core’s RAT maps <code>rax</code> to p1, <code>rdx</code> to p2, <code>rsi</code> to p3 and <code>rdi</code> to p4. These are the first two iterations, as the lab renames them:');
        L.table(['µop', 'reads', 'writes', 'RAT afterwards'], [
          ['A1 load <code>data[0]</code>', 'rdi = p4', 'p7', 'rax → p7'],
          ['B1 <code>rdi + 1</code>', 'rdi = p4', 'p8', 'rdi → p8'],
          ['C1.ld load <code>hist[rax]</code>', 'rdx = p2, rax = p7', 'p9', ''],
          ['C1.add', 'p9', 'p10', ''],
          ['C1.sta, C1.std', 'p2, p7; p10', '', ''],
          ['J1 compare and branch', 'rdi = p8, rsi = p3', 'p11', 'flags → p11'],
          { cells: ['A2 load <code>data[1]</code>', 'rdi = p8', 'p12', 'rax → p12'], hot: true },
          ['B2 <code>rdi + 1</code>', 'rdi = p8', 'p13', 'rdi → p13']
        ], { title: 'Renaming in the example core, cycles 5 and 6', label: 'Simulation' });
        L.p('A2 writes p12, not p7. It can run while C1 still needs p7: the false dependence is gone. A2 still truly depends on B1, through p8.');
        L.p('Each iteration takes five physical registers: <code>rax</code>, <code>rdi</code>, the flags, and two values with no name that live only inside <code>addq</code>.');
      } },
      { id: 'free', title: 'Giving registers back', body: function (L) {
        L.p('When can p1, the old <code>rax</code>, be reused? Not when A1 writes p7: an older instruction might still read p1, and if A1 were squashed, <code>rax</code> would be p1 again.');
        L.p('So p1 is freed when A1 retires. From then on nothing can need the old value. In the lab, that is cycle 13: “A1 retires: frees p1”.', ['freelist']);
        L.p('A second table, the committed RAT, keeps the mapping as of the last retired instruction. After a squash the core rebuilds the RAT from it.', ['crat']);
      } },
      { id: 'limit', title: 'When renaming stops', body: function (L) {
        L.p('With no free physical register, rename stops until a retirement frees one. The same happens when the ROB, a scheduler, the load queue or the store queue is full: every µop needs an entry in each structure it uses.');
        L.p('In the example core, 48 physical registers minus the 6 that hold the starting values leave 42, enough for 8 iterations at 5 each. The 24-entry ROB, 6 iterations, runs out first. In the lab, the load queue fills even earlier, in cycle 11, with loads from the wrong path.');
      } }
    ],
    check: [
      { q: 'Iteration 2’s movzbl writes rax while iteration 1’s addq still needs the old rax. With renaming, must iteration 2 wait?', options: ['No: it writes a new physical register (p12), and C1 keeps reading p7', 'Yes: rax can hold only one value', 'Only if both values are 123', 'Only on Arm'], answer: 0, why: 'Renaming gives each write its own physical register, so the shared name no longer orders the two.' },
      { q: 'Which dependence is true?', options: ['C1.ld reading rax, which A1 wrote', 'A2 writing rax after C1 read it', 'A2 writing rax after A1 wrote it', 'B2 writing rdi after A2 read it'], answer: 0, why: 'C1.ld needs the value A1 loaded. The others only share register names.' },
      { q: 'When is p1, the old rax, freed?', options: ['When A1, the next writer of rax, retires', 'When A1 is renamed', 'When the loop ends', 'When C1 reads it'], answer: 0, why: 'Until A1 retires, a squash could make p1 the current rax again, so it must be kept.' }
    ],
    remember: [
      'Reusing a register name creates false dependences; renaming removes them.',
      'The RAT maps each name to the physical register with its newest value; each write gets a fresh one.',
      'A physical register is freed when the next write to the same name retires.',
      'Rename stops when physical registers, the ROB or a queue run out.'
    ],
    sources: [AGNER]
  });

  /* ---------- II.09 ---------- */
  App.lesson({
    id: 'cpu-sched', short: 'Schedulers and ports', title: 'Schedulers, ports and execution units',
    lede: 'Renamed µops wait in schedulers until their inputs are ready. Every cycle, each port takes one ready µop and starts it.',
    know: ['Renaming leaves only true dependences ([[ch:cpu-rename]]).', 'The loop’s 7 µops and their units ([[ch:cpu-uops]]).'],
    learn: ['Follow a µop from dispatch through wakeup and issue to execution', 'Map the loop’s µops onto the example core’s ports', 'Work out which units limit the loop’s speed in the example core'],
    sections: [
      { id: 'dispatch', title: 'Into a scheduler', body: function (L) {
        L.p('After rename, dispatch places each µop in a ROB entry, in a scheduler, and for loads and stores in the load or store queue.', ['dispatch']);
        L.p('A scheduler holds µops that wait for their inputs. The example core has two: one with 16 entries for ALU work, one with 12 for address work.', ['sched']);
      } },
      { id: 'wakeup', title: 'Waiting for inputs', body: function (L) {
        L.p('Each waiting µop knows which physical registers it reads, and whether each is ready.');
        L.p('When a µop is about to produce its result, it announces its destination register to every scheduler. Every µop waiting for that register marks the input ready.', ['wakeup']);
      } },
      { id: 'issue', title: 'Picking who goes', body: function (L) {
        L.p('Each cycle, every port takes the oldest µop in its scheduler that has all inputs ready, and starts it.', ['issue', 'port']);
        L.p('The example core has 4 ALU ports, for arithmetic, compares and branches, and 2 address ports, AGUs, which compute load and store addresses. Up to 6 µops can start per cycle.', ['alu', 'agu']);
        L.p('A result can feed the next µop in the following cycle, straight from the unit’s output, without going through the register file first.', ['bypass']);
      } },
      { id: 'map', title: 'The loop on the ports', body: function (L) {
        L.p('Here is where each µop of one iteration runs:');
        L.table(['µop', 'port', 'why'], [
          ['A: load <code>data[i]</code>', 'address', 'computes <code>rdi</code>, then reads the L1d'],
          ['B: <code>rdi + 1</code>', 'ALU', 'an add'],
          ['C.ld: load <code>hist[k]</code>', 'address', 'computes <code>rdx + rax × 8</code>, then reads'],
          ['C.add', 'ALU', 'an add'],
          ['C.sta', 'address', 'computes the store address'],
          ['C.std', 'ALU', 'moves the data into the store queue'],
          ['BR', 'ALU', 'compares and checks the prediction']
        ], { mono: false, label: 'Simulation' });
        L.p('Per iteration: 4 ALU µops for 4 ALU ports, 1 cycle; but 3 address µops for 2 address ports, at least 1.5 cycles.');
        L.p('So even with every input ready, the example core cannot run this loop faster than one iteration every 1.5 cycles. Its address ports are the limit, not its width of 4.');
        L.note('deeper', 'Real cores have more units, and loads and stores usually have separate address units. The question is the same on any core: how many µops of each kind does an iteration need, and how many ports of that kind are there?');
      } }
    ],
    check: [
      { q: 'What makes a waiting µop ready to issue?', options: ['Every input it reads has been announced as produced', 'It is the oldest µop in the ROB', 'Its instruction has retired', 'The front end has fetched the next branch'], answer: 0, why: 'Wakeup marks inputs ready as producers finish. Issue then picks among the ready ones, oldest first.' },
      { q: 'How many address µops does one iteration need?', options: ['3: two loads and the store address', '2', '1', '7'], answer: 0, why: 'The data load, the hist load and C.sta each compute an address.' },
      { q: 'With 2 address ports, what is the fastest the example core can run the loop?', options: ['One iteration every 1.5 cycles', 'One per cycle', 'One every 7 cycles', 'Four per cycle'], answer: 0, why: '3 address µops over 2 ports need at least 1.5 cycles per iteration, whatever else is free.' }
    ],
    remember: [
      'Dispatch puts each µop in a scheduler; wakeup marks its inputs ready; issue starts the oldest ready µop on each port.',
      'The example core has 4 ALU ports and 2 address ports.',
      'Count µops per iteration by kind and divide by ports of that kind: here the address ports limit the loop to one iteration per 1.5 cycles.'
    ],
    sources: [AGNER]
  });

  /* ---------- II.10 ---------- */
  App.lesson({
    id: 'cpu-lsq', short: 'Loads and stores in the core', title: 'Loads and stores inside the core',
    lede: 'Every load and store takes a queue entry in program order. A load can take its value from an older store that has not reached the cache yet.',
    know: ['A store is two µops, STA and STD ([[ch:cpu-uops]]).', 'Instructions retire in program order ([[ch:cpu-ooo]]).'],
    learn: ['Say what the load queue and the store queue hold, and why', 'Follow the store-to-load forwarding between iterations 1 and 2', 'Explain why a store writes the cache only after it retires'],
    sections: [
      { id: 'queues', title: 'Two queues, in program order', body: function (L) {
        L.p('Dispatch gives every load an entry in the load queue and every store an entry in the store queue, in program order. The example core has 10 and 8.', ['lq', 'sq']);
        L.p('A load keeps its entry until it retires, so the core can check it against older stores. A store keeps its entry until it has written the cache.');
      } },
      { id: 'late', title: 'A store writes the cache late', body: function (L) {
        L.p('C.sta puts the address in the store’s entry; C.std puts the data. Neither touches the L1d.');
        L.p('The cache is written only after the store retires. Before that, a mispredicted branch or a fault in an older instruction could still cancel it, and a cache write cannot be taken back.', ['commit']);
        L.p('A retired store that has not written the cache yet is a senior store. In the lab, iteration 1’s store retires in cycle 20 and writes the L1d in cycle 21.', ['senior']);
      } },
      { id: 'forward', title: 'A load that needs a store’s value', body: function (L) {
        L.p('The example data is {123, 123, 7}. So iteration 2 reads <code>hist[123]</code> again, while iteration 1’s store of the new count, 42, is still in the store queue.');
        L.p('The L1d still holds the old count, 41. Reading it would lose an increment. So every load also checks the store queue for older stores to the same address.');
        L.chain([
          { k: 'cycle 14', v: 'C2.ld has its address', d: '0x7ffd4a3c2e58, same as C1’s store' },
          { k: 'cycles 17–18', v: 'waits', d: 'C1.std has not delivered the data yet' },
          { k: 'cycle 19', v: '42 arrives from the store queue', d: 'not from the L1d', hot: true },
          { k: 'end of the run', v: 'hist[123] = 43', d: 'both increments counted' }
        ], { title: 'Store-to-load forwarding in the example core', label: 'Simulation' });
        L.p('This is store-to-load forwarding. It works when the older store covers every byte the load reads and its data is ready.', ['stlf']);
      } },
      { id: 'disamb', title: 'Loads that run ahead of stores', body: function (L) {
        L.p('Sometimes an older store’s address is not known yet when a load is ready. Waiting would cost time, and most loads do not overlap the stores before them.');
        L.p('So cores predict that the load is independent and let it go. When the store’s address arrives, the core checks. If they overlap after all, the load and everything after it run again.', ['disamb', 'replay']);
      } },
      { id: 'commit', title: 'Committing stores', body: function (L) {
        L.p('Senior stores leave the store queue in program order, one by one, as each writes its line in the L1d.');
        L.p('That write, the commit, is the moment other cores can see the new value. Before it, only this core can: through forwarding. Part V starts from here ([[ch:st-visible]]).');
      } }
    ],
    check: [
      { q: 'Why does a store not write the L1d when its data is ready?', options: ['It could still be cancelled by a misprediction or an older fault; it writes after it retires', 'The L1d is busy with loads', 'Stores always miss', 'Because STA and STD run on different ports'], answer: 0, why: 'A cache write cannot be undone. Waiting for retirement guarantees the store really belongs to the program.' },
      { q: 'Iteration 2 loads hist[123] before iteration 1’s store has committed. Where does its value come from?', options: ['From iteration 1’s entry in the store queue: 42', 'From the L1d: 41', 'From DRAM', 'From the L2'], answer: 0, why: 'The load matches an older store to the same address and takes its data: store-to-load forwarding.' },
      { q: 'A load runs before an older store whose address was unknown, and they turn out to overlap. What happens?', options: ['The load and the µops after it run again with the right value', 'The program gets the wrong value', 'The store is cancelled', 'Nothing: overlapping is impossible'], answer: 0, why: 'Running ahead is a prediction; when it proves wrong, the core replays the load.' }
    ],
    remember: [
      'Loads and stores take queue entries in program order: 10 and 8 in the example core.',
      'A store writes the cache only after it retires (commit); until then it waits in the store queue.',
      'A load checks older stores first and takes a matching store’s data: store-to-load forwarding.',
      'Loads may run ahead of stores with unknown addresses and are replayed if that was wrong.'
    ],
    sources: [AGNER, SDM]
  });

  /* ---------- II.11 ---------- */
  App.lesson({
    id: 'cpu-miss', short: 'When a load misses', title: 'When a load misses',
    lede: 'A miss takes tens to hundreds of cycles. The core tracks each missing line, keeps working, and overlaps misses that do not depend on each other.',
    know: ['Out-of-order execution and the ROB ([[ch:cpu-ooo]]).', 'The time to reach each level ([[ch:map]]).'],
    learn: ['Say what a miss buffer holds and when a second load joins it', 'Explain why one miss at a time is so slow and how overlap helps', 'Read how many misses one core of machine C overlaps'],
    sections: [
      { id: 'mab', title: 'One miss buffer per missing line', body: function (L) {
        L.p('When a load misses in the L1d, the core takes a miss buffer: an entry that records the missing line and which loads wait for it. The example core has 4.', ['mab']);
        L.p('A second load to the same line does not ask again. It joins the existing entry and wakes when the line arrives.');
        L.p('When all 4 are taken, a load to yet another line must wait for one to free up, however much other work is ready.');
      } },
      { id: 'one', title: 'One miss at a time', body: function (L) {
        L.p('A pointer chase cannot overlap anything. Each 64-byte line holds the address of another line, in a random cycle, and each load’s address is the value of the load before it:');
        L.code('for (size_t i = 0; i < steps; i++)\n    for (int c = 0; c < k; c++)\n        p[c] = (void **)*p[c];      /* chain c: the next address is the value just loaded */', { title: 'labruns/hw/mlp.c (excerpt)', cap: 'With k = 1 this is a single chain.' });
        L.p('With a 1 GiB working set nearly every load goes to DRAM. With one chain, one load at a time, each waits the full DRAM latency.');
      } },
      { id: 'overlap', title: 'Independent misses overlap', body: function (L) {
        L.p('Now walk the same 1 GiB cycle as several separate chains at once. Within a chain each load still waits for the previous one; between chains there is no dependence, so their misses can be in flight together.', ['mlp']);
        L.out('c.mlp');
        L.p('One chain: 192 ns per load. Sixteen chains: 13 ns per load, about 15 times as many loads per second. Each miss still takes nearly 200 ns; they just no longer wait for each other.');
        L.p('So one core of machine C can keep at least 15 misses in flight. (Inference)');
        L.p('The example core’s 4 miss buffers would cap the same experiment at 4 chains. A miss buffer is a small structure, and its size limits how much DRAM latency a core can hide.');
      } },
      { id: 'window', title: 'Overlap needs a window', body: function (L) {
        L.p('To have 16 misses in flight, the core must have reached 16 independent loads. They must all fit in the window at once, behind the oldest miss that blocks retirement ([[ch:cpu-ooo]]).');
        L.p('That is why server cores have hundreds of ROB entries and tens of miss buffers, and why a chain of dependent loads is the slowest way to walk memory.');
      } },
      { id: 'smt', title: 'Two threads on one core', body: function (L) {
        L.p('Another way to fill the waiting time is a second thread. With SMT, two hardware threads share one core: when one waits for a miss, the other can use the units.', ['smt']);
        L.p('They also share the queues, the miss buffers and the caches, so they can slow each other down. The lab’s SMT experiment shows both sides.');
        L.note('arm', 'Arm’s Neoverse server cores run one thread each. AMD’s Zen 5 and Intel’s Xeon P-cores run two.');
      } }
    ],
    check: [
      { q: 'Two loads miss on the same line. How many miss buffers do they use?', options: ['One: the second joins the first entry', 'Two', 'None: the second load hits', 'Four'], answer: 0, why: 'A miss buffer tracks a line, not a load. Later loads to the same line wait on the same entry.' },
      { q: 'On machine C, 1 chain takes 192 ns per load and 16 chains take 13 ns per load. What changed?', options: ['16 misses were in flight at once instead of 1', 'DRAM became 15 times faster', 'The data moved into the L3', 'The loads were removed'], answer: 0, why: 'Each miss takes about as long as before. Independent chains let the core overlap them.' },
      { q: 'Why can a pointer chase not overlap its misses?', options: ['Each load’s address is the value of the previous load', 'Pointers are not cached', 'It has no branches', 'It uses huge pages'], answer: 0, why: 'The next address does not exist until the previous load returns, so there is nothing to start early.' }
    ],
    remember: [
      'A miss buffer tracks one missing line; later loads to it join the same entry.',
      'Dependent misses happen one at a time; independent ones overlap (memory-level parallelism).',
      'One core of machine C overlaps at least 15 misses; the example core, at most 4.',
      'Overlap needs both miss buffers and a window large enough to reach the independent loads.'
    ],
    sources: [DREPPER, AGNER]
  });
})();
