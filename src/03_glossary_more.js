/* ======================= glossary: foundations, registers, instructions ======================= */
(function(){
var d = App.gloss;
/* --- foundations --- */
d('bit', 'bit', 'One binary digit: 0 or 1. Every value the machine stores, from a count to an instruction, is a pattern of bits.');
d('byte', 'byte', '8 bits, holding a value from 0 to 255. Memory is addressed in bytes: every address names one byte.');
d('hex', 'hexadecimal (0x\u2026)', 'Base-16 notation, written with a 0x prefix and the digits 0\u20139 and a\u2013f. One hex digit is exactly 4 bits, so two digits make a byte: 0xff = 255, 0x40 = 64. Addresses and machine code are written in hex because the digits map straight onto bits.');
d('bitrange', 'bit range (bits 11:6)', 'A slice of a number\u2019s bits, highest bit first, counting from bit 0 at the right. Bits 11:6 of an address are the six bits from bit 11 down to bit 6; in C, (addr >> 6) & 0x3f. Hardware splits addresses into fields this way.');
d('addr', 'address', 'The number of one byte in memory. A pointer holds an address, and every load or store names the address it touches. On x86-64, user programs use addresses below 0x800000000000.');
d('ptr', 'pointer', 'A variable that holds an address. In the example, data and hist are pointers: data[i] is the byte at address data + i.');
d('endian', 'little-endian', 'The byte order x86 uses: the least significant byte of a multi-byte value is stored at the lowest address. The 8-byte count 41 (0x29) is stored as 29 00 00 00 00 00 00 00.');
d('align', 'alignment', 'An N-byte value is aligned when its address is a multiple of N. An aligned value of 64 bytes or less never straddles two cache lines, so one access reaches all of it.');
d('reg', 'register', 'A small, named storage slot inside the core. Instructions compute on registers; a value in memory must be loaded into a register first.');
d('instr', 'instruction', 'One operation defined by the ISA, such as add or movzbl. In memory it is 1 to 15 bytes of machine code; the core decodes it into one or more \u00b5ops.');
d('mcode', 'machine code', 'Instructions encoded as bytes: the form the CPU fetches and decodes. objdump -d prints each instruction\u2019s bytes next to its assembly text.');
d('asmlang', 'assembly language', 'A text form of machine code, one line per instruction, such as addq $0x1,(%rdx,%rax,8). This site uses AT&T syntax, the default of gcc and objdump.');
d('att', 'AT&T syntax', 'The assembly syntax gcc and objdump print by default: source before destination, % before registers, $ before constants, a size suffix on the mnemonic, and memory operands written disp(base,index,scale).');
d('load', 'load', 'An operation that reads memory into a register. Its latency depends on where the data is found: L1d, L2, L3 or DRAM.');
d('store', 'store', 'An operation that writes a register to memory. It waits in the store queue and reaches the L1d only after its instruction retires.');
d('flags', 'flags (RFLAGS)', 'Status bits that arithmetic and compare instructions set: zero, sign, carry, overflow. Conditional jumps read them.');
d('cycle', 'clock cycle', 'One tick of the core clock. At 4 GHz a cycle lasts 0.25 ns. Work inside the core is counted in cycles; DRAM delays are often quoted in nanoseconds.');
d('latency', 'latency', 'The time from starting an operation to having its result. For a load, the time until the loaded value can be used.');
d('thruput', 'throughput', 'How many operations complete per cycle when many are in flight. A pipelined unit with a 3-cycle latency can still finish one operation every cycle.');
d('pipeline', 'pipelining', 'Splitting work into stages so several operations are in different stages at once. It raises throughput without making any single operation faster.');
d('depchain', 'dependency chain', 'A sequence of operations where each needs the previous result. A chain cannot overlap, so its time is the sum of its latencies.');
d('proc', 'process', 'A running program with its own virtual address space. Two processes can use the same virtual address for different data.');
d('interrupt', 'interrupt', 'A signal that makes a core stop its current work and run a kernel handler. NVMe devices signal completions with MSI-X interrupts.');
/* --- registers --- */
d('gpr', 'general-purpose registers', 'The 16 64-bit integer registers of x86-64: rax, rbx, rcx, rdx, rsi, rdi, rbp, rsp and r8\u2013r15. Each also has names for its low 32, 16 and 8 bits, for example eax, ax and al.');
d('r_rax', 'rax (eax)', 'General-purpose register; eax is its low 32 bits. In the loop, movzbl (%rdi),%eax puts the byte data[i] in eax. Writing eax clears bits 63:32, so rax holds a clean index from 0 to 255 for hist.');
d('r_rdi', 'rdi', 'General-purpose register that carries the first argument. Here it arrives holding data, and add $0x1,%rdi advances it one byte per iteration in place of the counter i.');
d('r_rsi', 'rsi', 'General-purpose register that carries the second argument. Here it arrives holding n; add %rdi,%rsi turns it into the end pointer data + n that the loop compares against.');
d('r_rdx', 'rdx', 'General-purpose register that carries the third argument. Here it holds hist, the base address of the table: addq $0x1,(%rdx,%rax,8) adds 1 at rdx + rax \u00d7 8.');
d('r_rsp', 'rsp', 'The stack pointer: the address of the top of the stack. ret reads the return address at [rsp] and adds 8 to rsp.');
/* --- instructions --- */
d('i_mov', 'mov', 'Copy a value: register to register, memory to register (a load) or register to memory (a store). The suffix gives the size: movq 8 bytes, movl 4, movw 2, movb 1.');
d('i_movzx', 'movzbl / movzx', 'Load one byte and zero-extend it to 32 bits: the upper bits become 0. AT&T syntax calls it movzbl, Intel syntax movzx. The loop uses it to read data[i].');
d('i_add', 'add', 'Integer addition: the destination becomes destination + source, and the flags are set. With a memory destination, as in addq $0x1,(%rdx,%rax,8), one instruction loads, adds and stores.');
d('i_inc', 'inc', 'Add 1 to a register or a memory location. On memory it is a read-modify-write, like add $1.');
d('i_cmp', 'cmp', 'Subtract the first operand from the second and keep only the flags. cmp %rsi,%rdi compares rdi with rsi for the jne that follows.');
d('i_test', 'test', 'Bitwise AND of two operands, keeping only the flags. test %rsi,%rsi checks whether n is zero or negative.');
d('i_jcc', 'conditional jump (jne, jle)', 'Jump to a label if the flags meet a condition, otherwise continue with the next instruction. jne .L3 repeats the loop until the data pointer equals the end pointer.');
d('i_ret', 'ret', 'Return from a function: load the return address from the stack and jump to it.');
d('i_nop', 'nop', 'An instruction that does nothing. gcc inserts multi-byte nops such as nopl to move a loop start onto a 16-byte boundary.');
d('i_lock', 'lock prefix', 'Makes a read-modify-write instruction on memory atomic: the core keeps the cache line to itself for the whole operation. On x86 a locked instruction also acts as a full memory fence.');

App.setCategory('bit byte hex bitrange addr ptr endian align reg instr mcode asmlang att load store flags cycle latency thruput pipeline depchain proc interrupt', 'basics');
App.setCategory('gpr r_rax r_rdi r_rsi r_rdx r_rsp i_mov i_movzx i_add i_inc i_cmp i_test i_jcc i_ret i_nop i_lock', 'core');

var W = function(t, label){ return [label || t.replace(/_/g, ' ').replace(/%E2%80%93/g, '\u2013'), 'https://en.wikipedia.org/wiki/' + t, 'Wikipedia']; };
var FC = function(i){ return [i.toUpperCase() + ' instruction reference', 'https://www.felixcloutier.com/x86/' + i, 'x86 reference (from the Intel SDM)']; };
var ABI = W('X86_calling_conventions', 'x86 calling conventions (System V AMD64)');
var SRC = {
  bit: [W('Bit')], byte: [W('Byte')], hex: [W('Hexadecimal')], bitrange: [W('Bitwise_operation'), W('Mask_(computing)', 'Mask (computing)')],
  addr: [W('Memory_address')], ptr: [W('Pointer_(computer_programming)', 'Pointer (computer programming)')], endian: [W('Endianness')], align: [W('Data_structure_alignment')],
  reg: [W('Processor_register')], instr: [W('Instruction_set_architecture')], mcode: [W('Machine_code')], asmlang: [W('Assembly_language')], att: [W('X86_assembly_language', 'x86 assembly language')],
  load: [W('Processor_register')], store: [W('Processor_register')], flags: [W('FLAGS_register')], cycle: [W('Clock_rate')], latency: [W('Latency_(engineering)', 'Latency (engineering)')],
  thruput: [W('Instruction_pipelining')], pipeline: [W('Instruction_pipelining')], depchain: [W('Instruction-level_parallelism')], proc: [W('Process_(computing)', 'Process (computing)')], interrupt: [W('Interrupt')],
  gpr: [W('X86-64', 'x86-64'), ABI], r_rax: [W('X86-64', 'x86-64'), ABI], r_rdi: [ABI], r_rsi: [ABI], r_rdx: [ABI], r_rsp: [W('Call_stack')],
  i_mov: [FC('mov')], i_movzx: [FC('movzx')], i_add: [FC('add')], i_inc: [FC('inc')], i_cmp: [FC('cmp')], i_test: [FC('test')], i_jcc: [FC('jcc')], i_ret: [FC('ret')], i_nop: [FC('nop')], i_lock: [FC('lock')]
};
for (var k in SRC) App.SRC[k] = SRC[k];
var HOME = {bits: 'bit byte hex bitrange', addr: 'addr ptr endian align', instr: 'reg instr mcode load store', asm: 'asmlang att flags gpr r_rax r_rdi r_rsi r_rdx r_rsp i_mov i_movzx i_add i_inc i_cmp i_test i_jcc i_ret i_nop i_lock',
  time: 'cycle latency thruput pipeline depchain', vm: 'proc', share: 'interrupt'};
for (var ch in HOME) HOME[ch].split(' ').forEach(function(x){ App.TERM_HOME[x] = ch; });
})();
