/* ======================= Part IV · DRAM and prefetchers (IV.09–IV.12, IV.14) ======================= */
(function () {
  'use strict';
  var d = App.gloss, h = App.h, LW = function () { return App.LW; };
  d('senseamp', 'sense amplifier', 'A circuit at the end of each bitline that detects the tiny charge a cell shares when its row opens, and drives the bitline back to a full 0 or 1, which also restores the cell.');
  d('rank', 'rank', 'The set of DRAM chips that answer one command together and fill the whole 64-bit bus: eight x8 chips. A DIMM has one or more ranks.');
  d('dimmterm', 'DIMM', 'A memory module: a small board of DRAM chips that plugs into a slot on one channel.');
  d('xn', 'x8 chip', 'A DRAM chip with 8 data pins. Eight of them side by side make the 64-bit bus; x4 chips need sixteen.');
  d('tck', 'tCK', 'One period of the DRAM clock. DDR4-2400 runs a 1200 MHz clock, tCK = 0.833 ns, and moves data on both clock edges: 2400 transfers per microsecond.');
  d('rowhit', 'row hit, closed row, row conflict', 'Row hit: the needed row is already open in that bank. Closed row: no row is open. Row conflict: another row is open and must be closed first.');
  d('frfcfs', 'FR-FCFS', 'First ready, first come first served: a controller policy that serves requests hitting an open row before older requests that would need a row change.');
  d('treffi', 'tREFI', 'The interval between REF commands: 7.8 µs for DDR4 at normal temperature. 8192 of them cover every row in 64 ms.');
  d('rowhammer', 'disturbance errors (Rowhammer)', 'Opening and closing one row very many times can flip bits in the rows next to it. Memory makers and controllers add defences, such as refreshing neighbours of busy rows.');
  d('covered', 'covered, late, useless', 'A covered prefetch arrives before the load that needs it; a late one is still on its way when the load comes; a useless one is never used and only cost bandwidth and cache space.');
  App.setCategory('senseamp rank dimmterm xn tck rowhit frfcfs treffi rowhammer', 'memory');
  App.setCategory('covered', 'pref');
  var MICRON = ['Micron, 8Gb x4/x8/x16 DDR4 SDRAM data sheet', 'https://classes.engineering.wustl.edu/cse362/images/0/0c/8Gb_DDR4_SDRAM.pdf'];
  var DREPPER = ['Ulrich Drepper, What Every Programmer Should Know About Memory (2007)', 'https://www.akkadia.org/drepper/cpumemory.pdf'];
  var KIM = ['Kim et al., Flipping Bits in Memory Without Accessing Them (ISCA 2014)', 'https://doi.org/10.1109/ISCA.2014.6853210'];
  var RIXNER = ['Rixner et al., Memory Access Scheduling (ISCA 2000)', 'https://doi.org/10.1145/339647.339668'];
  var GCCPF = ['GCC, __builtin_prefetch', 'https://gcc.gnu.org/onlinedocs/gcc/Other-Builtins.html'];

  /* The DRAM coordinates of any physical address, in the example layout. */
  function mapper(el) {
    var form = h('div', { 'class': 'lx-form' }, el);
    var inp = LW().field(form, 'Physical address', '0x1a3f7ce40', { width: '220px' });
    var out = h('div', { 'class': 'lx-out', 'aria-live': 'polite' }, el);
    function draw() {
      var pa = LW().parseHex(inp.value);
      if (pa === null) { out.innerHTML = '<p class="lx-msg">Enter a hex address such as 0x1a3f7ce40.</p>'; return; }
      var m = App.HW.dramMap(pa);
      out.innerHTML = LW().bitsHTML([
        { bits: '33:18', val: String(m.row), name: 'row', tone: 'a1', w: 2 },
        { bits: '17:16', val: String(m.bg), name: 'bank group', tone: 'a2' },
        { bits: '15:14', val: String(m.bank), name: 'bank', tone: 'a2' },
        { bits: '13:7', val: String(m.col), name: 'column', tone: 'a4' },
        { bits: '6', val: String(m.ch), name: 'channel', tone: 'a3' },
        { bits: '5:0', val: String(Number(pa & 63n)), name: 'byte', tone: 'n' }
      ]) + '<p class="lx-msg">Channel ' + m.ch + ', bank group ' + m.bg + ', bank ' + m.bank + ', row ' + m.row + ', column ' + m.col + '. Add 0x40 to move to the next line: the channel bit flips.</p>';
    }
    inp.addEventListener('input', draw);
    draw();
  }

  /* ---------- IV.09 ---------- */
  App.lesson({
    id: 'dram-cells', short: 'Inside a DRAM chip', title: 'Inside a DRAM chip: cells, rows and banks',
    lede: 'A DRAM bit is a tiny capacitor. Cells sit in rows; a whole row must be opened before any bit in it can be read.',
    know: ['A miss in every cache ends at a memory controller and DRAM ([[ch:cache-miss]]).', 'DRAM is dense and slow; SRAM caches are small and fast ([[ch:whycache]]).'],
    learn: ['Say how one DRAM cell stores a bit and why reading it is slow', 'Explain rows, the row buffer and banks', 'Follow one 64-byte line from eight chips to the bus'],
    sections: [
      { id: 'cell', title: 'One bit, one capacitor', body: function (L) {
        L.p('A DRAM cell is one transistor and one capacitor. A charged capacitor is a 1, an empty one a 0. That makes DRAM dense and cheap: a few gigabits per chip.', ['dramcell']);
        L.p('The charge is tiny. Reading it means connecting the capacitor to a long wire, the bitline, and detecting a very small change in its voltage.');
        L.p('A sense amplifier does that detection, then drives the bitline back to a full 0 or 1, which also refills the cell: reading drains the cell, and the read restores it.', ['senseamp']);
      } },
      { id: 'rows', title: 'Rows open as a whole', body: function (L) {
        L.p('Cells sit in a grid of rows and columns. One wire, the wordline, connects every cell of a row to its bitline at once.', ['row']);
        L.p('So DRAM never reads one bit: it opens a whole row into the sense amplifiers, the row buffer. In an 8 Gbit x8 chip a row is 1 KiB per bank.', ['rowbuf']);
        L.p('Once the row is open, reading any part of it is quick. Reaching a different row means closing this one and opening the other: slow.');
      } },
      { id: 'banks', title: 'Banks work in parallel', body: function (L) {
        L.p('Each chip is split into independent arrays, banks, each with its own row buffer. A DDR4 x8 chip has 16 banks, in 4 bank groups of 4.', ['bank']);
        L.p('While one bank opens a row, another can deliver data. So a controller spreads requests over banks to keep them all busy.');
        L.table(['Per 8 Gbit DDR4 x8 chip', 'Value'], [
          ['banks', '16, in 4 bank groups'],
          ['rows per bank', '65,536'],
          ['column addresses per row', '1,024, one byte each; a burst reads 8 in a row'],
          ['row (page) size', '1 KiB per bank']
        ], { mono: false, label: 'Vendor docs', src: MICRON });
      } },
      { id: 'rank', title: 'Eight chips make one line', body: function (L) {
        L.p('A chip has only 8 data pins. Eight x8 chips side by side fill the 64-bit bus; together they are a rank, and they all receive the same commands.', ['xn', 'rank']);
        L.p('When the controller opens “row 26877 of bank 3”, every one of the eight chips opens its row 26877 of bank 3. The rank’s row is 8 × 1 KiB = 8 KiB.');
        L.p('A read sends 8 transfers. In each, every chip delivers 8 bits: 8 bytes across the bus. 8 transfers × 8 bytes = 64 bytes: one cache line, a burst.', ['burst']);
        L.chain([
          { k: 'row opened', v: '8 KiB', d: 'across the 8 chips of the rank' },
          { k: 'one column read', v: '8 bytes per transfer', d: '1 byte from each chip' },
          { k: 'burst of 8', v: '64 bytes', d: 'one cache line', hot: true }
        ]);
      } },
      { id: 'channel', title: 'DIMMs and channels', body: function (L) {
        L.p('The chips sit on a DIMM, a module in a slot. A DIMM carries one or more ranks; one or more DIMMs share a channel: one 64-bit data bus and one command bus from one controller.', ['dimmterm', 'channel']);
        L.p('The example machine has two channels, so it can move two lines at the same time. Large servers have 8 to 12 per socket ([[ch:chips]]).');
        L.note('other', 'DDR5 splits each DIMM into two independent 32-bit subchannels, and a burst is 16 transfers of 4 bytes: still 64 bytes, one line.', 'DDR5');
      } }
    ],
    check: [
      { q: 'Why does DRAM open a whole row instead of reading one cell?', options: ['One wordline connects every cell of the row to the sense amplifiers at once', 'Because rows are smaller than lines', 'To save power on writes', 'Because the cache asks for a whole row'], answer: 0, why: 'Activating a row connects all its cells; the sense amplifiers then hold the whole row, the row buffer.' },
      { q: 'How do eight x8 chips deliver one 64-byte line?', options: ['8 transfers, each with 1 byte from each chip', '1 transfer of 64 bytes from one chip', '64 transfers of 1 byte', '8 bytes from one chip, then the next chip'], answer: 0, why: 'Each transfer is 64 bits wide, 8 from each chip. A burst of 8 transfers is 64 bytes.' },
      { q: 'What does a bank give the controller?', options: ['An independent array with its own row buffer, so requests to different banks can overlap', 'A second channel', 'A larger row', 'Error correction'], answer: 0, why: 'Each bank opens and reads rows on its own; the controller interleaves work across banks.' }
    ],
    remember: [
      'A DRAM cell is a transistor and a capacitor; sense amplifiers detect and restore its charge.',
      'A row is opened whole into the row buffer; reading inside an open row is quick, changing rows is slow.',
      'A DDR4 x8 chip has 16 banks in 4 groups; eight x8 chips form a rank on the 64-bit bus.',
      'One burst is 8 transfers × 8 bytes = one 64-byte line.'
    ],
    sources: [MICRON, DREPPER]
  });

  /* ---------- IV.10 ---------- */
  App.lesson({
    id: 'dram-cmds', short: 'Commands and timings', title: 'Commands and timings',
    lede: 'A controller reads a line with up to three commands: close the open row, open the new one, read a column. The DRAM timings set the minimum gap between them.',
    know: ['Rows, the row buffer and banks ([[ch:dram-cells]]).'],
    learn: ['Name the four main DRAM commands', 'Use CL, tRCD and tRP to price a row hit, a closed row and a row conflict', 'Compute the time of one burst on a DDR4-2400 bus'],
    sections: [
      { id: 'cmds', title: 'Four commands', body: function (L) {
        L.p('The controller speaks to a rank in commands. Four matter here:', ['act']);
        L.table(['Command', 'Does'], [
          ['ACT (activate)', 'opens a row of one bank into its row buffer'],
          ['RD / WR', 'reads or writes one column of the open row: one burst'],
          ['PRE (precharge)', 'closes the bank’s open row'],
          ['REF (refresh)', 'rewrites some rows before their charge leaks ([[ch:dram-refresh]])']
        ], { mono: false });
      } },
      { id: 'clock', title: 'The clock', body: function (L) {
        L.p('DDR4-2400 runs a 1200 MHz clock and moves data on both of its edges, 2400 million transfers a second. One clock period, tCK, is 0.833 ns.', ['tck']);
        L.p('A burst of 8 transfers therefore takes 4 clocks, 3.33 ns. All other timings are counted in clocks too.');
      } },
      { id: 'timings', title: 'The gaps between commands', body: function (L) {
        L.p('Each command needs time before the next may follow. A common DDR4-2400 speed bin, CL17, uses these:', ['tcl']);
        L.table(['Name', 'From → to', 'Clocks', 'ns'], [
          ['tRCD', 'ACT → RD', '17', '14.2'],
          ['CL', 'RD → first data', '17', '14.2'],
          ['tRP', 'PRE → next ACT', '17', '14.2'],
          ['tRAS', 'ACT → PRE, at least', '39', '32.5'],
          ['burst', 'first → last data', '4', '3.3']
        ], { label: 'Vendor docs', src: MICRON });
      } },
      { id: 'prices', title: 'Three prices for the same read', body: function (L) {
        L.p('What a read costs depends on what is open in its bank:', ['rowhit']);
        L.table(['Bank state', 'Commands', 'Clocks to the last data', 'ns'], [
          ['row hit: the row is open', 'RD', 'CL + 4 = 21', '17.5'],
          ['closed: no row open', 'ACT, RD', 'tRCD + CL + 4 = 38', '31.7'],
          ['conflict: another row open', 'PRE, ACT, RD', 'tRP + tRCD + CL + 4 = 55', '45.8']
        ], { title: 'DDR4-2400 CL17' });
        L.p('A row conflict costs more than twice a row hit. That is device time only; the trip through the caches, the interconnect and the controller’s queues comes on top: the example’s 90 ns.');
        L.p('The lab after these lessons steps four requests through these commands: <code>hist[123]</code>’s line opens row 26877, a second line hits the open row, a third needs the next row in the same bank and pays the conflict.');
      } }
    ],
    check: [
      { q: 'The needed row is already open. What does the controller send?', options: ['Only RD', 'ACT and RD', 'PRE, ACT and RD', 'REF'], answer: 0, why: 'A row hit reads straight from the row buffer.' },
      { q: 'With CL17 and tCK = 0.833 ns, how long is a row conflict from PRE to the last data?', options: ['55 clocks, about 46 ns', '21 clocks, about 17.5 ns', '17 clocks', '4 clocks'], answer: 0, why: 'tRP + tRCD + CL + 4 = 17 + 17 + 17 + 4 = 55 clocks.' },
      { q: 'How long does one 8-transfer burst take on DDR4-2400?', options: ['4 clocks, 3.33 ns', '8 clocks', '1 clock', '17 clocks'], answer: 0, why: 'Two transfers per clock, so 8 transfers take 4 clocks of 0.833 ns.' }
    ],
    remember: [
      'ACT opens a row, RD/WR use it, PRE closes it, REF refreshes.',
      'tRCD, CL and tRP are each about 14 ns on DDR4-2400 CL17.',
      'Row hit 17.5 ns, closed row 31.7 ns, row conflict 45.8 ns of device time.',
      'A burst is 4 clocks; everything else is waiting for rows.'
    ],
    sources: [MICRON, DREPPER]
  });

  /* ---------- IV.11 ---------- */
  App.lesson({
    id: 'dram-map', short: 'Address to DRAM', title: 'From a physical address to a bank and a row',
    lede: 'The memory controller slices each physical address into channel, bank group, bank, row and column, and reorders its queue to hit open rows.',
    know: ['Banks, rows and the three prices of a read ([[ch:dram-cmds]]).'],
    learn: ['Turn a physical address into DRAM coordinates in the example layout', 'Explain why consecutive lines alternate channels and banks', 'Say what an FR-FCFS controller does, and what it trades away'],
    sections: [
      { id: 'slice', title: 'Address bits to DRAM coordinates', body: function (L) {
        L.p('The controller cuts every physical address into fields. The example machine uses a simple layout you can read off:', ['umc']);
        L.bits([
          { bits: '33:18', val: '26877', name: 'row', tone: 'a1', w: 2 },
          { bits: '17:16', val: '3', name: 'bank group', tone: 'a2' },
          { bits: '15:14', val: '3', name: 'bank', tone: 'a2' },
          { bits: '13:7', val: '28', name: 'column', tone: 'a4' },
          { bits: '6', val: '1', name: 'channel', tone: 'a3' },
          { bits: '5:0', val: '0', name: 'byte', tone: 'n' }
        ], { title: 'hist[123]’s line, 0x1a3f7ce40, in the example layout' });
        L.p('Here the column field counts whole bursts: an 8 KiB rank row holds 128 lines of 64 bytes, so 7 bits pick one.');
        L.try('Map an address', 'Type any physical address. Try the next line, 0x1a3f7ce80, and an address 256 KiB higher, 0x1a3fbce40.', mapper);
      } },
      { id: 'spread', title: 'Why the low bits pick the channel', body: function (L) {
        L.p('Bit 6 is the lowest bit above the line offset. So line 0 goes to channel 0, line 1 to channel 1, line 2 to channel 0 again.');
        L.p('A program that reads memory in order keeps both channels busy at once, doubling the bandwidth it can get. The column bits come next, so a run of lines on one channel stays in one open row.');
        L.p('0x1a3fbce40 is 256 KiB above <code>hist</code>’s line: same channel, same bank, the next row. Two such lines in turn are a row conflict every time.');
      } },
      { id: 'hash', title: 'Real controllers hash', body: function (L) {
        L.p('A layout this simple lets a regular pattern pile onto one bank. Real controllers combine higher address bits with the bank and channel bits, with XOR, so that strides spread out.');
        L.p('Firmware sets the mapping, and vendors do not publish it. Researchers recover it by timing pairs of addresses: a pair that conflicts must share a bank.');
      } },
      { id: 'sched', title: 'The controller reorders', body: function (L) {
        L.p('Requests wait in the controller’s queues. Taking them strictly in arrival order would often close a row only to reopen it two requests later.');
        L.p('So controllers serve requests that hit an open row first, then older ones. This policy is called FR-FCFS.', ['frfcfs']);
        L.p('It raises throughput, but an old request to a busy bank can wait behind a stream of row hits. Controllers cap that wait. They also collect writes and send them in batches, because switching the bus between reading and writing costs time.');
        L.p('The DRAM lab’s controller experiment runs the same requests under different policies and shows both throughput and the slowest requests.');
      } }
    ],
    check: [
      { q: 'In the example layout, which bit picks the channel?', options: ['Bit 6', 'Bit 0', 'Bit 17', 'Bit 33'], answer: 0, why: 'Bits 5:0 are the byte in the line; bit 6 is the lowest bit that changes from one line to the next.' },
      { q: 'Two lines map to the same bank but different rows, and are read alternately. What does each read cost?', options: ['A row conflict: PRE, ACT, RD', 'A row hit', 'Nothing: they are in different channels', 'A refresh'], answer: 0, why: 'A bank holds one open row; switching rows needs a precharge and an activate each time.' },
      { q: 'What does FR-FCFS do?', options: ['Serves requests that hit an open row before older ones that do not', 'Serves requests strictly in order', 'Serves writes before reads', 'Refreshes rows first'], answer: 0, why: 'It trades fairness for throughput, and needs a limit on how long an old request may wait.' }
    ],
    remember: [
      'The controller slices a physical address into channel, bank group, bank, row and column.',
      'Low bits pick the channel, so consecutive lines alternate channels; real controllers also XOR in higher bits.',
      'FR-FCFS serves row hits first: more throughput, longer waits for some requests.'
    ],
    sources: [RIXNER, DREPPER]
  });

  /* ---------- IV.12 ---------- */
  App.lesson({
    id: 'dram-refresh', short: 'Refresh and errors', title: 'Refresh, errors and ECC',
    lede: 'Capacitors leak, so every row is rewritten every 64 ms. Bits can still flip; error-correcting codes find and fix most of them.',
    know: ['Cells are capacitors read through sense amplifiers ([[ch:dram-cells]]).', 'The DRAM commands, including REF ([[ch:dram-cmds]]).'],
    learn: ['Say why DRAM needs refresh, how often, and what it costs', 'Explain how ECC corrects one flipped bit and detects two', 'Say what disturbance errors are, in outline'],
    sections: [
      { id: 'refresh', title: 'Refresh', body: function (L) {
        L.p('A cell’s charge leaks away in milliseconds. So every row must be read and rewritten before it fades: refresh.', ['refresh']);
        L.p('The controller sends a REF command every 7.8 µs. Each one refreshes a group of rows; 8192 of them cover every row in 64 ms. Above 85 °C cells leak faster, and the interval halves.', ['treffi']);
        L.p('During a refresh, the rank can do nothing else for a few hundred nanoseconds. That is a few percent of all time, and a request that arrives just then waits.');
        L.p('The DRAM lab’s refresh experiment runs the same requests with refresh off and on: the median barely moves, the slowest requests move a lot.');
      } },
      { id: 'flips', title: 'Bits flip', body: function (L) {
        L.p('Even with refresh, a bit sometimes flips: a cell leaks faster than expected, or a particle strike disturbs it. With billions of cells, “sometimes” happens.');
        L.p('A parity bit can notice one flipped bit in a word, but not say which. Servers need more.');
      } },
      { id: 'ecc', title: 'ECC: find the bit, fix the bit', body: function (L) {
        L.p('ECC memory stores 8 check bits with every 64 data bits: 72 bits per transfer, from a ninth chip on the module.');
        L.p('The usual code corrects any single flipped bit and detects any two: SECDED. On every read the controller recomputes the check bits; the difference, the syndrome, names the flipped bit.', ['secded']);
        L.p('A corrected error is logged and the read goes on; Linux counts them per memory controller. An uncorrectable one is reported as a machine check.');
        L.p('The DRAM lab’s ECC experiment flips bits one, two and three at a time, and shows where the guarantee ends.');
      } },
      { id: 'disturb', title: 'Disturbance errors', body: function (L) {
        L.p('Cells are so close together that opening and closing one row many thousands of times can drain charge from the rows next to it, faster than refresh restores it.', ['rowhammer']);
        L.p('Researchers showed in 2014 that ordinary programs could flip bits this way. Memory makers and controllers now add defences, such as refreshing the neighbours of rows that are opened very often.');
        L.p('The DRAM lab shows only the command pattern that matters, many ACT and PRE commands to one row, not any way to cause flips.');
      } }
    ],
    check: [
      { q: 'How often is each DDR4 row refreshed at normal temperature?', options: ['At least every 64 ms', 'Every 7.8 µs', 'Every second', 'Only after a write'], answer: 0, why: 'A REF every 7.8 µs refreshes a group of rows; 8192 of them cover all rows in 64 ms.' },
      { q: 'What can SECDED do?', options: ['Correct one flipped bit and detect two in a 64-bit word', 'Correct any number of flipped bits', 'Only detect errors', 'Prevent refresh'], answer: 0, why: '8 check bits per 64 data bits are enough to locate one error and notice two.' },
      { q: 'Why does refresh hurt the slowest requests more than the median?', options: ['Most requests miss the refresh windows, but those that arrive during one wait hundreds of nanoseconds', 'Refresh slows every request equally', 'Refresh only affects writes', 'Refresh closes every bank forever'], answer: 0, why: 'Refresh is short and rare, so it lands on a few requests and adds a lot to each of them.' }
    ],
    remember: [
      'DRAM cells leak; each row is refreshed at least every 64 ms, one REF every 7.8 µs.',
      'A refresh blocks its rank for a few hundred nanoseconds: a few percent of time, felt by the slowest requests.',
      'ECC adds 8 check bits per 64: correct one flipped bit, detect two.',
      'Opening one row very often can disturb its neighbours; modern memory defends against it.'
    ],
    sources: [MICRON, KIM]
  });

  /* ---------- IV.14 ---------- */
  App.lesson({
    id: 'pref-hw', short: 'Prefetchers', title: 'Fetching before being asked: prefetchers',
    lede: 'A prefetcher watches the lines a core touches, guesses the next ones and requests them early. A good guess hides DRAM latency; a bad one wastes bandwidth.',
    know: ['A miss to DRAM takes hundreds of cycles ([[ch:cache-miss]]).', 'Independent misses overlap; dependent ones do not ([[ch:cpu-miss]]).'],
    learn: ['Say what stream and stride prefetchers detect', 'Read machine C’s measurement: the same loads in address order and in random order', 'Tell covered, late and useless prefetches apart, and use software prefetch where hardware cannot guess'],
    sections: [
      { id: 'idea', title: 'Guess the next line', body: function (L) {
        L.p('The loop reads <code>data[]</code> one byte at a time: line after line, in order. Nothing stops the hardware from fetching the next lines before the loads get there.');
        L.p('A prefetcher watches the stream of lines a core touches. When the distance from one line to the next repeats, it requests lines further along that pattern.', ['pref']);
        L.table(['Prefetcher', 'Notices', 'In the loop'], [
          ['next-line or stream', 'consecutive lines in one direction', '<code>data[]</code>: +1 line every 64 bytes'],
          ['stride', 'a constant step from one access to the next', 'an array read every k-th element'],
          ['none can help', 'no pattern at all', '<code>hist[data[i]]</code>: wherever the data says']
        ], { mono: false, terms: ['stream', 'stride'] });
      } },
      { id: 'measure', title: 'The same loads, two orders', body: function (L) {
        L.p('This run on machine C reads one word from every line of 1 GiB, four ways: in address order or in random order, with each load’s address either known in advance or loaded by the load before it.');
        L.out('c.seq');
        L.p('Look at the dependent loads. Each must wait for the previous one either way, yet in address order they take 5.2 ns, and in random order 197 ns: 38 times longer.');
        L.p('In address order the line is already on its way, or there, before the load asks for it: the prefetchers saw the pattern. In random order there is nothing to see.');
        L.p('The independent loads differ far less, 6.8 and 10.5 ns. Out-of-order execution already overlaps their misses ([[ch:cpu-miss]]), so prefetching adds less.');
      } },
      { id: 'score', title: 'Covered, late or useless', body: function (L) {
        L.p('Every prefetch is one of three things:', ['covered']);
        L.list([
          '<b>Covered</b>: the line arrives before the load needs it; the load hits.',
          '<b>Late</b>: the load comes while the prefetch is still on its way; it waits less, but still waits.',
          '<b>Useless</b>: the line is never used; it cost a memory transfer and pushed out a line that might have been used.'
        ], ['late', 'pollute']);
        L.p('To be on time, a prefetcher must run ahead by at least the latency divided by the time between accesses. With a 395-cycle miss and a new line every 100 cycles, that is 4 lines ahead.');
      } },
      { id: 'limits', title: 'Where prefetchers stop', body: function (L) {
        L.p('Prefetchers see physical addresses, and the next virtual page may be anywhere in physical memory. So most stop at a 4 KiB page boundary and must learn the pattern again in the next page.');
        L.p('They cannot follow pointers: the next address of a linked list is only known when the current load returns. That is the dependent random row above.');
        L.p('And they cannot guess data-dependent addresses like <code>hist[data[i]]</code>. Our loop is fast anyway because <code>hist</code> is only 2 KiB and stays in the L1d.');
      } },
      { id: 'sw', title: 'Software prefetch', body: function (L) {
        L.p('When the program knows an address early but the hardware cannot guess it, the program can ask: a prefetch instruction starts fetching a line without waiting for it.', ['swpf']);
        L.code('for (long i = 0; i < n; i++) {\n    __builtin_prefetch(&hist[data[i + 16]], 1);   /* the line needed 16 iterations from now, for writing */\n    hist[data[i]]++;\n}', { title: 'a software prefetch with GCC (illustration)' });
        L.p('GCC turns <code>__builtin_prefetch</code> into a <code>prefetchw</code> or <code>prefetcht0</code> instruction. The distance, 16 here, must cover the latency, and the extra loads of <code>data[i + 16]</code> cost something. It only pays when <code>hist</code> is too large to stay in a cache.');
        L.p('The prefetcher lab measures exactly this trade-off with a distance you choose.');
      } }
    ],
    check: [
      { q: 'On machine C, dependent loads take 5.2 ns per line in address order and 197 ns in random order. Why?', options: ['In address order the prefetchers fetch the next lines before the loads ask', 'Random addresses are slower to compute', 'The random order uses more memory', 'Address order uses the L1i'], answer: 0, why: 'Each load still waits for the previous one, but in order the line is already close by when it is asked for.' },
      { q: 'A prefetched line arrives after the load that needs it was issued. What is it?', options: ['A late prefetch', 'A covered prefetch', 'A useless prefetch', 'A conflict miss'], answer: 0, why: 'It helped a little, since the load waited less than a full miss, but it did not arrive in time.' },
      { q: 'Why can no hardware prefetcher help hist[data[i]]?', options: ['The address depends on data values, not on a pattern of earlier addresses', 'hist is too small', 'hist is written, not read', 'Prefetchers only work for code'], answer: 0, why: 'Stream and stride detectors predict from the sequence of addresses; here the next address is whatever the data says.' }
    ],
    remember: [
      'Stream and stride prefetchers notice repeating distances between accessed lines and fetch ahead.',
      'On machine C, a dependent chain in address order is 38 times faster than in random order: prefetching at work.',
      'A prefetch is covered, late or useless; useless ones cost bandwidth and cache space.',
      'Prefetchers stop at page boundaries and cannot follow pointers or data-dependent addresses; software prefetch can help there.'
    ],
    sources: [DREPPER, GCCPF]
  });
})();
