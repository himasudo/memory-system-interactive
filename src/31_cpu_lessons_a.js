/* ======================= Part II · from C to µops (II.02–II.03) ======================= */
(function () {
  'use strict';
  var d = App.gloss;
  d('varlen', 'variable-length instructions', 'x86 instructions are 1 to 15 bytes long, and the length is known only after reading the prefixes, the opcode and often the ModRM byte. Arm’s AArch64 instructions are all 4 bytes.');
  d('opcodeb', 'opcode', 'The byte or bytes that say which operation an instruction performs. 0x83 is a group of arithmetic operations on a register or memory with an 8-bit constant; ModRM picks the member.');
  d('frontbound', 'front-end bound', 'The back end could run more µops than the front end delivers, so it waits for instructions: because of instruction-cache or iTLB misses, mispredicted branches, or slow decoding.');
  App.setCategory('varlen opcodeb frontbound', 'core');
  var SDM = ['Intel SDM Vol. 2 (instruction format and encoding)', 'https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html'];
  var ENC = ['OSDev Wiki, X86-64 Instruction Encoding', 'https://wiki.osdev.org/X86-64_Instruction_Encoding'];
  var AGNER = ['Agner Fog, The microarchitecture of Intel, AMD and VIA CPUs', 'https://www.agner.org/optimize/microarchitecture.pdf'];

  /* ---------- II.02 ---------- */
  App.lesson({
    id: 'cpu-code', short: 'From C to machine code', title: 'From C to machine code',
    lede: 'The compiler turns hist[data[i]]++ into five instructions, 17 bytes. Before it can run them, the core has to find where each one starts.',
    know: ['A load or store names an address built from registers ([[ch:instr]]).', 'How to read AT&T assembly, and the example loop line by line ([[ch:asm]]).', 'A core has a front end, an execution engine and a load/store unit ([[ch:map]]).'],
    learn: ['Read the compiled loop and say what each instruction does to registers and memory', 'Split an x86 instruction into prefix, opcode, ModRM, SIB and constant bytes', 'Explain why an x86 front end must find instruction boundaries before it can decode'],
    sections: [
      { id: 'loop', title: 'Five instructions', body: function (L) {
        L.p('gcc 13.3 at <code>-O2</code> compiles the histogram function to these instructions. Each line shows the offset from the function’s start, the bytes, and the instruction:');
        L.code('  0:  48 85 f6                 test   %rsi,%rsi\n  3:  7e 1c                    jle    .L1\n  5:  48 01 fe                 add    %rdi,%rsi\n  8:  0f 1f 84 00 00 00 00 00  nopl   0x0(%rax,%rax,1)\n.L3:\n ⟦10:  0f b6 07                 movzbl (%rdi),%eax⟧\n ⟦13:  48 83 c7 01              add    $0x1,%rdi⟧\n ⟦17:  48 83 04 c2 01           addq   $0x1,(%rdx,%rax,8)⟧\n ⟦1c:  48 39 f7                 cmp    %rsi,%rdi⟧\n ⟦1f:  75 ef                    jne    .L3⟧\n.L1:\n 21:  c3                       ret', { lang: 'text', title: 'objdump -d, the histogram function (gcc 13.3, -O2)', cap: 'The marked lines are the loop body. It runs once per byte of data.' });
        L.p('The arguments arrive in registers: <code>rdi</code> = <code>data</code>, <code>rsi</code> = <code>n</code>, <code>rdx</code> = <code>hist</code>.');
        L.table(['Instruction', 'What it does'], [
          ['<code>movzbl (%rdi),%eax</code>', 'loads one byte, <code>data[i]</code>, and widens it to 32 bits; writing <code>eax</code> also clears the top half of <code>rax</code>'],
          ['<code>add $0x1,%rdi</code>', 'moves the data pointer to the next byte'],
          ['<code>addq $0x1,(%rdx,%rax,8)</code>', 'adds 1 to the 8 bytes at <code>rdx + rax × 8</code>: <code>hist[data[i]]</code>, in memory'],
          ['<code>cmp %rsi,%rdi</code> and <code>jne .L3</code>', 'compare the data pointer with the end pointer, and loop until they are equal']
        ], { mono: false, terms: ['zx'] });
        L.p('The compiler replaced the counter <code>i</code> with a moving pointer. Before the loop, <code>add %rdi,%rsi</code> turned <code>rsi</code> into <code>data + n</code>, one past the last byte.');
      } },
      { id: 'lengths', title: 'Instructions of different lengths', body: function (L) {
        L.p('x86 instructions are not all one size. In this loop they take 3, 4, 5, 3 and 2 bytes: 17 bytes for five instructions.', ['varlen']);
        L.p('The 8-byte <code>nopl</code> before the loop does nothing. It pads the code so the loop starts at offset 0x10, a multiple of 16: the function is at 0x555555555180, so <code>.L3</code> is at 0x555555555190.');
        L.p('Instructions live in memory like data. Fetching them needs a translation from the instruction TLB and the bytes from the L1 instruction cache.', ['itlb', 'l1i']);
        L.note('arm', 'Every AArch64 instruction is 4 bytes long, so an Arm core knows where each one starts. AArch64 also has no instruction that adds to memory directly: the same loop needs a separate load, add and store.');
      } },
      { id: 'encoding', title: 'One instruction, byte by byte', body: function (L) {
        L.p('Take the read-modify-write of <code>hist[k]</code>, <code>addq $0x1,(%rdx,%rax,8)</code>. Its five bytes are 48 83 04 c2 01:');
        L.bits([
          { bits: 'byte 0', val: '48', name: 'REX prefix: 64-bit operands', tone: 'a1' },
          { bits: 'byte 1', val: '83', name: 'opcode: arithmetic with an 8-bit constant', tone: 'a2' },
          { bits: 'byte 2', val: '04', name: 'ModRM: ADD, memory, SIB follows', tone: 'a3' },
          { bits: 'byte 3', val: 'c2', name: 'SIB: scale 8, index rax, base rdx', tone: 'a4' },
          { bits: 'byte 4', val: '01', name: 'the constant 1', tone: 'n' }
        ], { title: 'addq $0x1,(%rdx,%rax,8) = 48 83 04 c2 01', terms: ['rex', 'opcodeb'] });
        L.p('The REX byte, 0x48, has its W bit set: the add works on 64 bits, because <code>hist</code> is an array of <code>long</code>.');
        L.p('ModRM, 0x04, splits into three fields. Its reg field, 0, picks ADD from the opcode’s group. Its r/m field, 100, says a SIB byte follows to describe the address:', ['modrm']);
        L.bits([
          { bits: '7:6', val: '00', name: 'mod: memory, no displacement', tone: 'a3' },
          { bits: '5:3', val: '000', name: 'reg: /0 = ADD', tone: 'a2' },
          { bits: '2:0', val: '100', name: 'r/m: SIB follows', tone: 'a3' }
        ], { title: 'ModRM = 0x04' });
        L.bits([
          { bits: '7:6', val: '11', name: 'scale: × 8', tone: 'a4' },
          { bits: '5:3', val: '000', name: 'index: rax', tone: 'a4' },
          { bits: '2:0', val: '010', name: 'base: rdx', tone: 'a4' }
        ], { title: 'SIB = 0xc2' });
        L.p('So the address is <code>rdx</code> + <code>rax</code> × 8: <code>hist</code> + <code>data[i]</code> × <code>sizeof(long)</code>. For <code>data[i]</code> = 123 that is 0x7ffd4a3c2e58, the address [[ch:map]] followed.');
      } },
      { id: 'boundaries', title: 'Where does each instruction start?', body: function (L) {
        L.p('In memory the loop body is 17 bytes in a row. Nothing in a byte says “an instruction starts here”:');
        L.code('0f b6 07 48 83 c7 01 48 83 04 c2 01 48 39 f7 75 ef', { lang: 'text', title: 'the loop body in memory, from 0x555555555190' });
        L.p('The length of an instruction is known only after reading its prefixes, its opcode and often its ModRM byte. Yet a core wants to decode four instructions in the same cycle.');
        L.p('So the front end first marks the boundaries: predecode looks at every byte that could start an instruction and works out where it ends. The decoders then each get one whole instruction.', ['predecode']);
        L.code('0f b6 07 | 48 83 c7 01 | 48 83 04 c2 01 | 48 39 f7 | 75 ef', { lang: 'text', title: 'after predecode: five instructions' });
        L.p('The example core reads 32 bytes per cycle from the L1i, starting at any multiple of 16. Because the loop starts at 0x…190, one such fetch window holds all of it.', ['fetchwin']);
      } }
    ],
    check: [
      { q: 'How many bytes does one iteration of the loop take in memory?', options: ['17', '5', '32', '64'], answer: 0, why: '3 + 4 + 5 + 3 + 2 bytes: movzbl, add, addq, cmp and jne.' },
      { q: 'In 48 83 04 c2 01, what does the byte c2 say?', options: ['Scale 8, index rax, base rdx', 'Add the constant 1', 'Use 64-bit operands', 'Jump back to .L3'], answer: 0, why: 'c2 is the SIB byte: 11 000 010. Scale 11 is × 8, index 000 is rax, base 010 is rdx.' },
      { q: 'Why does an x86 front end need a predecode step?', options: ['Instruction lengths vary, so boundaries must be found before several instructions can be decoded at once', 'To translate virtual addresses', 'To fetch data for loads', 'To decide which branches are taken'], answer: 0, why: 'An instruction can be 1 to 15 bytes long. Its length shows only after reading its first bytes, so a separate step marks where each one starts.' },
      { q: 'What is the 8-byte nopl before the loop for?', options: ['It pads the code so the loop starts on a 16-byte boundary', 'It waits for the data to arrive', 'It clears rax', 'It reserves space for the stack'], answer: 0, why: 'It runs once on entry and does nothing. With it, .L3 lands at offset 0x10, so one fetch window can hold the whole loop.' }
    ],
    remember: [
      'The loop body is five instructions in 17 bytes: movzbl, add, addq to memory, cmp, jne.',
      'An x86 instruction is a prefix, an opcode, ModRM and SIB bytes when it addresses memory, and any constant.',
      'x86 instructions vary in length, so the front end must find their boundaries (predecode) before decoding several at once.',
      'Instruction bytes are fetched like data, through the iTLB and the L1i.'
    ],
    sources: [SDM, ENC]
  });

  /* ---------- II.03 ---------- */
  App.lesson({
    id: 'cpu-uops', short: 'Instructions become µops', title: 'Decoding: instructions become µops',
    lede: 'A core does not run x86 instructions as they are. Decode turns each into one or more µops: 7 for one iteration of the loop.',
    know: ['The loop’s five instructions and their bytes ([[ch:cpu-code]]).', 'Latency and throughput ([[ch:time]]).'],
    learn: ['Say what a µop is, and why cores split instructions into them', 'Split the loop into its 7 µops and name the unit each one needs', 'Explain macro-fusion, the µop queue and the op cache'],
    sections: [
      { id: 'why', title: 'One instruction, four jobs', body: function (L) {
        L.p('<code>addq $0x1,(%rdx,%rax,8)</code> does four things: it computes an address, reads 8 bytes, adds 1, and writes 8 bytes back.');
        L.p('Each of those needs a different unit, at a different moment. The read cannot start before the address exists; the write needs the sum.');
        L.p('So decode splits the instruction into µops: simple operations that each use one unit once. Everything after decode handles µops, not instructions.', ['decode', 'uop']);
      } },
      { id: 'seven', title: 'The loop as µops', body: function (L) {
        L.p('Here is one iteration as the example core sees it:');
        L.table(['Instruction', 'µops', 'Each one'], [
          ['<code>movzbl (%rdi),%eax</code>', 'LD', 'reads <code>data[i]</code> into <code>rax</code>'],
          ['<code>add $0x1,%rdi</code>', 'ALU', 'adds 1 to <code>rdi</code>'],
          { cells: ['<code>addq $0x1,(%rdx,%rax,8)</code>', 'LD, ALU, STA, STD', 'reads <code>hist[k]</code>; adds 1; writes the address into the store queue; writes the data into the store queue'], hot: true },
          ['<code>cmp %rsi,%rdi</code> + <code>jne .L3</code>', 'BR', 'compares and branches, as one µop']
        ], { mono: false });
        L.p('Five instructions, seven µops. The store became two µops: STA computes where to write, and STD delivers what to write. They can run at different times, each as soon as its own input is ready.', ['sta', 'std']);
        L.p('Neither half writes the cache. Both only fill an entry in the store queue; the cache is written later, after the instruction is finished for good. [[ch:cpu-lsq]] follows that entry.');
        L.note('amd', 'AMD counts a memory read-modify-write such as this addq as one macro-op in its retire queue, while its units still do the same four pieces of work. Intel documents the four-µop form shown here.');
      } },
      { id: 'fusion', title: 'Two instructions, one µop', body: function (L) {
        L.p('<code>cmp</code> sets the flags and <code>jne</code> reads them, right away. Current AMD and Intel cores decode the pair into a single compare-and-branch µop.', ['fusion']);
        L.p('That saves a slot in every queue the pair would have used, and the flags never need to exist on their own. The example core counts the pair as one instruction from decode on.');
      } },
      { id: 'queue', title: 'The µop queue and the op cache', body: function (L) {
        L.p('Decoded µops wait in the µop queue until the rest of the core can take them. The queue absorbs short mismatches: decode may deliver four instructions in one cycle and none in the next.', ['uq']);
        L.p('Most x86 cores also keep recently decoded µops in an op cache, found by instruction address. On a hit, fetch, predecode and decode are all skipped.', ['opcache']);
        L.p('A small loop like ours runs from the op cache after its first pass. Decoding x86 is costly in power and time, so the op cache saves both.');
      } },
      { id: 'feed', title: 'When the front end cannot keep up', body: function (L) {
        L.p('The front end has to deliver µops as fast as the rest of the core can run them. Sometimes it cannot: the code misses in the L1i or the iTLB, a branch was mispredicted, or the instructions are too long to decode quickly.', ['frontbound']);
        L.p('Then the execution units sit idle however fast the data arrives. The lab that follows this lesson has an experiment on exactly that: code spread over many pages starves the core.');
        L.note('deeper', 'Agner Fog’s microarchitecture manual lists, for each AMD and Intel generation, how many instructions per cycle each decoder takes, how large the op cache is, and which pairs fuse.');
      } }
    ],
    check: [
      { q: 'How many µops does one iteration of the loop become in the example core?', options: ['7', '5', '4', '17'], answer: 0, why: 'movzbl 1, add 1, addq to memory 4 (LD, ALU, STA, STD), and the fused cmp + jne 1.' },
      { q: 'Why is a store split into STA and STD?', options: ['Its address and its data become ready at different times, and each half can run as soon as its own input is', 'Because stores are 16 bytes wide', 'So the cache is written twice', 'Because the AGU cannot add'], answer: 0, why: 'In the loop the address is known as soon as rax is, while the data waits for the load and the add. Splitting lets the address half go early.' },
      { q: 'What does macro-fusion do to cmp + jne?', options: ['Decodes the pair into one compare-and-branch µop', 'Runs them on two different cores', 'Removes the branch entirely', 'Predicts the branch from the flags'], answer: 0, why: 'The pair always appears together and the flags are used at once, so one µop does both.' },
      { q: 'When does the op cache help?', options: ['When the same instructions run again soon, as in a loop', 'On every load that misses', 'When the data is in DRAM', 'Only for the first run of a program'], answer: 0, why: 'It holds µops already decoded for recently run code, so a hot loop skips fetch, predecode and decode.' }
    ],
    remember: [
      'Decode turns each instruction into µops; the rest of the core schedules and runs µops.',
      'One iteration is 7 µops: LD; ALU; LD, ALU, STA, STD; and one fused branch.',
      'A store is two µops, address and data. Neither writes the cache; the cache is written after the instruction retires.',
      'The µop queue smooths the flow; the op cache lets hot code skip decode.'
    ],
    sources: [AGNER, SDM]
  });
})();
