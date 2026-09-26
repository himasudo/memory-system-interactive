/* ======================= chapter: devices ======================= */
App.chapter({id: 'dev', short: 'Devices & DMA', title: 'Devices: MMIO, DMA, the IOMMU and interrupts',
lede: 'One 4 KB read from an NVMe SSD, from the io_uring request to the application reading the data.',
points: ['The CPU talks to the SSD by writing device registers (MMIO).', 'The SSD reads and writes host memory itself (DMA), through the IOMMU.', 'Those device accesses stay coherent with the CPU caches.'],
build: function(root){
  var h = App.h, s = App.s, g = App.g;
  var intro = h('div', {'class': 'grid2'}, root);
  h('div', {'class': 'card'}, intro, '<h3>Two ways the CPU and a device touch</h3><p>' + g('mmio') + ': device registers sit at physical addresses inside the device\u2019s ' + g('bar') + '; the CPU reads or writes them with ordinary <code>mov</code> instructions on pages mapped uncacheable (UC, [[ch:stores]]). ' + g('dma') + ': the device itself reads and writes host memory, which is how bulk data moves. NVMe uses MMIO only for tiny ' + g('doorbell', 'doorbells') + ' and DMA for everything else.</p>');
  h('div', {'class': 'card'}, intro, '<h3>The queues</h3><p>' + g('nvme') + ' works through rings in host RAM: a submission queue of 64-byte commands and a completion queue of 16-byte entries, each with head and tail indices. The driver produces commands and the SSD consumes them; the SSD produces completions and the driver consumes them. io_uring (Modules 25\u201326) uses the same design between user space and the kernel.</p>');
  var wrap = h('div', {'class': 'scroller'}, root);
  var sv = s('svg', {viewBox: '0 0 1200 600', style: 'min-width:920px'}, wrap);
  s('defs', null, sv).innerHTML = '<marker id="da" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9z" fill="context-stroke"/></marker>';
  var E = {};
  function box(id, x, y, w, ht, t, sub, cls){ var gr = s('g', null, sv); s('rect', {x: x, y: y, width: w, height: ht, rx: 9, 'class': cls || 'box'}, gr); if (t) s('text', {x: x + 10, y: y + 20, 'class': 'h'}, gr, t); if (sub) s('text', {x: x + 10, y: y + 37, 'class': 's'}, gr, sub); E[id] = gr; return gr; }
  box('core', 10, 10, 330, 170, 'Core 0 \u2014 driver, io_uring', 'its L1d/L2 lines for the queues and buffer:');
  E.cl = [0, 1, 2].map(function(k){ return {r: s('rect', {x: 22, y: 58 + k * 38, width: 306, height: 30, rx: 5, 'class': 'sunk'}, E.core), t: s('text', {x: 32, y: 78 + k * 38, 'font-size': 12}, E.core, '')}; });
  box('fab', 10, 200, 740, 38, 'Infinity Fabric \u2014 coherent: device traffic is checked against CPU caches', '', 'a3b');
  box('dram', 10, 260, 560, 330, 'DRAM (host memory)');
  s('text', {x: 22, y: 302, 'class': 'h'}, E.dram, 'I/O submission queue 1 (64 B entries)');
  E.sq = []; for (var i = 0; i < 8; i++) E.sq.push({r: s('rect', {x: 22 + i * 66, y: 310, width: 60, height: 40, rx: 4, 'class': 'sunk'}, E.dram), t: s('text', {x: 52 + i * 66, y: 335, 'text-anchor': 'middle', 'class': 'm', 'font-size': 11}, E.dram, '')});
  E.sqP = s('text', {x: 22, y: 366, 'class': 's'}, E.dram, '');
  s('text', {x: 22, y: 392, 'class': 'h'}, E.dram, 'I/O completion queue 1 (16 B entries, phase bit)');
  E.cq = []; for (i = 0; i < 8; i++) E.cq.push({r: s('rect', {x: 22 + i * 66, y: 400, width: 60, height: 36, rx: 4, 'class': 'sunk'}, E.dram), t: s('text', {x: 52 + i * 66, y: 423, 'text-anchor': 'middle', 'class': 'm', 'font-size': 11}, E.dram, '')});
  E.cqP = s('text', {x: 22, y: 452, 'class': 's'}, E.dram, '');
  s('text', {x: 22, y: 478, 'class': 'h'}, E.dram, 'read buffer: 4 KB = 64 lines');
  E.buf = []; for (i = 0; i < 64; i++) E.buf.push(s('rect', {x: 22 + (i % 32) * 16.5, y: 488 + Math.floor(i / 32) * 20, width: 14, height: 16, rx: 2, 'class': 'sunk'}, E.dram));
  E.bufT = s('text', {x: 22, y: 548, 'class': 's'}, E.dram, '');
  E.bufT2 = s('text', {x: 22, y: 566, 'class': 's'}, E.dram, '');
  box('hub', 590, 260, 170, 330, 'I/O hub');
  E.rc = s('rect', {x: 600, y: 290, width: 150, height: 60, rx: 5, 'class': 'box'}, E.hub); s('text', {x: 610, y: 312, 'font-size': 12}, E.hub, 'PCIe root complex'); s('text', {x: 610, y: 330, 'class': 's'}, E.hub, 'MMIO \u2194 TLPs');
  E.io = s('rect', {x: 600, y: 362, width: 150, height: 90, rx: 5, 'class': 'box'}, E.hub); s('text', {x: 610, y: 384, 'font-size': 12}, E.hub, 'IOMMU + IOTLB'); E.ioT = s('text', {x: 610, y: 404, 'class': 's m'}, E.hub, ''); E.ioT2 = s('text', {x: 610, y: 422, 'class': 's m'}, E.hub, ''); E.ioT3 = s('text', {x: 610, y: 440, 'class': 's'}, E.hub, '');
  E.ic = s('rect', {x: 600, y: 464, width: 150, height: 60, rx: 5, 'class': 'box'}, E.hub); s('text', {x: 610, y: 486, 'font-size': 12}, E.hub, 'interrupt remap'); s('text', {x: 610, y: 504, 'class': 's'}, E.hub, '\u2192 local APIC');
  box('link', 780, 260, 90, 330, 'PCIe', 'link');
  E.tlp = [0, 1, 2, 3].map(function(k){ return s('text', {x: 825, y: 330 + k * 60, 'text-anchor': 'middle', 'class': 'm', 'font-size': 10}, E.link, ''); });
  box('ssd', 890, 10, 300, 580, 'NVMe SSD');
  s('rect', {x: 900, y: 44, width: 280, height: 110, rx: 5, 'class': 'a3b'}, E.ssd); s('text', {x: 910, y: 64, 'font-size': 12}, E.ssd, 'BAR0 registers (MMIO)');
  E.db1 = s('text', {x: 910, y: 88, 'class': 'm', 'font-size': 11.5}, E.ssd, ''); E.db2 = s('text', {x: 910, y: 110, 'class': 'm', 'font-size': 11.5}, E.ssd, ''); s('text', {x: 910, y: 140, 'class': 's'}, E.ssd, 'doorbell stride 4 B; admin queue 0 at 0x1000/0x1004');
  E.ctl = s('rect', {x: 900, y: 170, width: 280, height: 150, rx: 5, 'class': 'box'}, E.ssd); s('text', {x: 910, y: 192, 'font-size': 12}, E.ssd, 'controller + DMA engine');
  E.ctT = [0, 1, 2, 3].map(function(k){ return s('text', {x: 910, y: 216 + k * 22, 'font-size': 11.5}, E.ssd, ''); });
  E.nand = s('rect', {x: 900, y: 336, width: 280, height: 240, rx: 5, 'class': 'box'}, E.ssd); s('text', {x: 910, y: 358, 'font-size': 12}, E.ssd, 'NAND flash');
  for (i = 0; i < 24; i++) s('rect', {x: 912 + (i % 6) * 44, y: 372 + Math.floor(i / 6) * 48, width: 38, height: 40, rx: 3, 'class': 'sunk'}, E.ssd);
  E.nT = s('text', {x: 910, y: 568, 'class': 's'}, E.ssd, '');
  var AR = {};
  function ar(id, d){ AR[id] = s('path', {d: d, 'class': 'wire', 'stroke-width': 2.5, 'marker-end': 'url(#da)', style: 'opacity:.12'}, sv); }
  ar('core_dram', 'M 120 180 L 120 258');
  ar('core_hub', 'M 300 180 L 300 190 L 675 190 L 675 288');
  ar('hub_link', 'M 752 320 L 778 320');
  ar('link_ssd', 'M 870 300 L 888 300');
  ar('ssd_link', 'M 888 420 L 872 420');
  ar('link_hub', 'M 778 420 L 752 420');
  ar('hub_fab', 'M 640 360 L 640 240');
  ar('fab_core', 'M 200 200 L 200 182');
  ar('fab_dram', 'M 420 238 L 420 258');
  ar('hub_irq', 'M 700 464 L 700 440 L 700 190 L 330 150');
  var stp = App.stepper(root, {render: draw});
  var F = [];
  function f(p, t, d, st){ st.p = p; st.t = t; st.d = d; F.push(st); }
  f('command', 'The driver writes a command into the submission queue', 'The application\u2019s io_uring read request reaches the NVMe driver (<code>nvme_queue_rq()</code>), which fills slot 3 of I/O submission queue 1 with a 64-byte Read command:\n<ul><li>opcode 0x02 (Read), command ID 17, namespace 1</li><li>starting LBA 0x123400, 8 blocks of 512 B</li><li>PRP1 = the ' + g('iova') + ' of the 4 KB buffer</li></ul>\nThese are ordinary stores to write-back memory, so the command sits in core 0\u2019s L1d as a dirty line; DRAM does not have it yet.', {cl: [['SQ slot 3: dirty (M)', 'a1b'], ['CQ slot 3: not cached', 'sunk'], ['buffer: not cached', 'sunk']], sq: 3, sqTail: 4, cqPh: 0, buf: 0, ar: ['core_dram'], hl: ['core'], ct: ['idle'], db: [3, 3]});
  f('doorbell', 'Ring the doorbell: one MMIO store', 'The driver writes the new tail (4) to the SQ1 tail doorbell at BAR0 + 0x1008 with <code>writel()</code>. That page is mapped UC, so the store is not cached or merged; it leaves the core as-is.\nx86 keeps stores in order, so it cannot become visible before the command stores above it. On weakly ordered CPUs <code>writel()</code> adds a barrier to give the same guarantee.', {cl: [['SQ slot 3: dirty (M)', 'a1b'], ['CQ slot 3: not cached', 'sunk'], ['buffer: not cached', 'sunk']], sq: 3, sqTail: 4, buf: 0, ar: ['core_hub'], hl: ['core', 'hub'], ct: ['idle'], db: [3, 3]});
  f('MWr', 'The root complex sends a posted write', 'The root complex turns the MMIO store into a PCIe Memory Write ' + g('tlp') + ' carrying 4 bytes. Writes are <b>posted</b>: the sender does not wait for any reply. The SSD latches SQ1 tail = 4 and now knows slot 3 holds a new command.', {cl: [['SQ slot 3: dirty (M)', 'a1b'], ['CQ slot 3: not cached', 'sunk'], ['buffer: not cached', 'sunk']], sq: 3, sqTail: 4, buf: 0, ar: ['hub_link', 'link_ssd'], hl: ['link', 'ssd'], tlp: ['MWr 4 B \u2192', 'SQ1 tail = 4'], ct: ['doorbell: SQ1 tail 3 \u2192 4'], db: [4, 3]});
  f('fetch', 'The SSD fetches the command by DMA', 'The SSD sends a Memory Read TLP (non-posted: it expects a completion) for the 64 bytes at the IOVA of slot 3.\nThe ' + g('iommu') + ' translates that IOVA to a physical address through its IOTLB, walking its own page tables on a miss, and rejects addresses the OS never mapped for this device.\nThe fabric then performs a coherent read: core 0\u2019s L1d holds the line dirty, so it is probed and supplies the data (' + g('iocoh') + '). The command travels back in a Completion-with-Data TLP.', {cl: [['SQ slot 3: supplied to device', 'okb'], ['CQ slot 3: not cached', 'sunk'], ['buffer: not cached', 'sunk']], sq: 3, sqTail: 4, sqHead: 4, buf: 0, ar: ['ssd_link', 'link_hub', 'hub_fab', 'fab_core', 'hub_link', 'link_ssd'], hl: ['hub', 'fab', 'core', 'link'], tlp: ['\u2190 MRd 64 B', 'slot 3 IOVA', 'CplD 64 B \u2192', 'command'], iommu: ['IOVA \u2192 PA', 'IOTLB lookup'], ct: ['command fetched: Read, 8 \u00d7 512 B', 'CID 17, PRP1 = buffer IOVA'], db: [4, 3]});
  f('flash', 'The SSD reads flash', 'The controller maps LBA 0x123400 to a NAND location and reads it. This is the slow part: tens of microseconds is typical for a NAND read, thousands of times a DRAM access. It is a typical figure, not a measurement; <code>fio</code> measures a real drive.', {cl: [['SQ slot 3: clean copy', 'sunk'], ['CQ slot 3: not cached', 'sunk'], ['buffer: not cached', 'sunk']], sq: 3, sqTail: 4, sqHead: 4, buf: 0, ar: [], hl: ['ssd'], ct: ['reading NAND', 'LBA 0x123400, 4 KB'], nand: 1, db: [4, 3]});
  f('data', 'DMA the data into the buffer', 'The SSD writes 4096 bytes with posted Memory Write TLPs, each at most Max_Payload_Size bytes (256 B shown: 16 TLPs; <code>lspci -vv</code> shows the real value). Each is translated by the IOMMU. The fabric writes the lines to DRAM and invalidates any copies of them in the CPU caches, so no core can later read a stale line.', {cl: [['SQ slot 3: clean copy', 'sunk'], ['CQ slot 3: not cached', 'sunk'], ['buffer: copies invalidated', 'badb']], sq: 3, sqTail: 4, sqHead: 4, buf: 64, ar: ['ssd_link', 'link_hub', 'hub_fab', 'fab_dram'], hl: ['hub', 'fab', 'dram', 'link'], tlp: ['\u2190 MWr 256 B', '\u00d7 16', 'data'], iommu: ['IOVA \u2192 PA', 'per TLP'], ct: ['DMA write 4 KB'], db: [4, 3]});
  f('CQE', 'Post the completion entry', 'The SSD writes a 16-byte completion into CQ1 slot 3: status success, SQ head = 4, command ID 17, and the phase bit set to 1. The phase bit flips on every pass around the ring, so the driver can tell a new entry from an old one without a separate counter. PCIe keeps posted writes in order: the data is in memory before this entry is.', {cl: [['SQ slot 3: clean copy', 'sunk'], ['CQ slot 3: invalidated', 'badb'], ['buffer: copies invalidated', 'badb']], sq: 3, sqTail: 4, sqHead: 4, buf: 64, cqe: 1, ar: ['ssd_link', 'link_hub', 'hub_fab', 'fab_dram'], hl: ['dram', 'link'], tlp: ['\u2190 MWr 16 B', 'CQ1 slot 3', 'phase = 1'], ct: ['completion posted'], db: [4, 3]});
  f('MSI-X', 'Interrupt: another memory write', 'The SSD raises ' + g('msix') + ': one more posted write, a 32-bit message to an address in the 0xFEE0_0000 range. The IOMMU\u2019s interrupt remapping checks and routes it to core 0\u2019s local APIC, and the core enters <code>nvme_irq()</code>. With polled I/O (<code>IORING_SETUP_IOPOLL</code>) there is no interrupt: the driver polls the completion queue instead.', {cl: [['SQ slot 3: clean copy', 'sunk'], ['CQ slot 3: invalidated', 'badb'], ['buffer: copies invalidated', 'badb']], sq: 3, sqTail: 4, sqHead: 4, buf: 64, cqe: 1, ar: ['ssd_link', 'link_hub', 'hub_irq'], hl: ['hub', 'core', 'link'], tlp: ['\u2190 MWr 4 B', '0xFEE0_xxxx', 'interrupt'], ct: ['MSI-X vector sent'], db: [4, 3]});
  f('consume', 'The driver consumes the completion', 'The driver reads CQ1 slot 3. The DMA write invalidated that line, so the load misses and reads DRAM. The phase bit matches the value expected on this pass: new entry.\nThe request completes and io_uring posts a completion to the application\u2019s ring.\nThe driver writes CQ1 head = 4 to the doorbell at BAR0 + 0x100C so the SSD may reuse the slot.', {cl: [['SQ slot 3: clean copy', 'sunk'], ['CQ slot 3: read from DRAM', 'a4b'], ['buffer: copies invalidated', 'badb']], sq: 3, sqTail: 4, sqHead: 4, buf: 64, cqe: 1, cqHead: 4, ar: ['fab_dram', 'fab_core', 'core_hub', 'hub_link', 'link_ssd'], hl: ['core', 'dram'], tlp: ['MWr 4 B \u2192', 'CQ1 head = 4'], ct: ['CQ1 head 3 \u2192 4'], db: [4, 4]});
  f('use', 'The application reads the data', 'The application touches the buffer. Each of its 64 lines misses in the caches and comes from DRAM ([[chr:hier,dram]]): the data never passed through a CPU cache on the way in. Every byte was moved by the device; the CPU executed a few hundred instructions for the whole 4 KB.', {cl: [['SQ slot 3: clean copy', 'sunk'], ['CQ slot 3: cached (S/E)', 'a4b'], ['buffer: filling on demand', 'a4b']], sq: 3, sqTail: 4, sqHead: 4, buf: 64, cqe: 1, cqHead: 4, ar: ['fab_dram', 'fab_core'], hl: ['core', 'dram'], ct: ['idle'], db: [4, 4]});
  function draw(fr){
    E.cl.forEach(function(c, k){ c.t.textContent = fr.cl[k][0]; c.r.setAttribute('class', fr.cl[k][1]); });
    E.sq.forEach(function(c, k){ var own = k === 3; c.t.textContent = own ? 'Read' : k < 3 ? 'done' : ''; c.r.setAttribute('class', own ? (fr.sqHead ? 'sunk' : 'a1b') : k < 3 ? 'sunk' : 'sunk'); });
    E.sqP.textContent = 'tail = ' + (fr.sqTail || 3) + ' (driver writes here next)   head = ' + (fr.sqHead || 3) + ' (SSD has fetched up to here)';
    E.cq.forEach(function(c, k){ var own = k === 3; c.t.textContent = own ? (fr.cqe ? 'CID 17 P=1' : 'P=0') : k < 3 ? 'P=1' : 'P=0'; c.r.setAttribute('class', own && fr.cqe ? 'okb' : 'sunk'); });
    E.cqP.textContent = 'head = ' + (fr.cqHead || 3) + ' (driver has consumed up to here); slots 0\u20132 hold older completions from this pass';
    E.buf.forEach(function(b, k){ b.setAttribute('class', k < fr.buf ? 'a2b' : 'sunk'); });
    E.bufT.textContent = fr.buf ? '64 lines written by DMA' : 'empty';
    E.bufT2.textContent = fr.buf ? 'IOVA 0xfff02000 \u2192 physical frame chosen by the OS' : '';
    E.db1.textContent = 'SQ1 tail doorbell (0x1008) = ' + fr.db[0]; E.db2.textContent = 'CQ1 head doorbell (0x100C) = ' + fr.db[1];
    E.ctT.forEach(function(t, k){ t.textContent = fr.ct[k] || ''; });
    E.nT.textContent = fr.nand ? 'reading: tens of \u00b5s is typical (not measured)' : '';
    E.ioT.textContent = fr.iommu ? fr.iommu[0] : ''; E.ioT2.textContent = fr.iommu ? fr.iommu[1] : ''; E.ioT3.textContent = fr.iommu ? 'device can reach only mapped pages' : '';
    E.io.setAttribute('class', fr.iommu ? 'on box' : 'box'); E.rc.setAttribute('class', fr.hl.indexOf('hub') >= 0 && !fr.iommu && fr.p !== 'MSI-X' ? 'on box' : 'box');
    E.ic.setAttribute('class', fr.p === 'MSI-X' ? 'on box' : 'box'); E.nand.setAttribute('class', fr.nand ? 'on box' : 'box'); E.ctl.setAttribute('class', fr.ct[0] !== 'idle' ? 'on box' : 'box');
    E.tlp.forEach(function(t, k){ t.textContent = (fr.tlp || [])[k] || ''; });
    ['core', 'fab', 'dram', 'hub', 'link', 'ssd'].forEach(function(id){ E[id].setAttribute('class', fr.hl.indexOf(id) >= 0 && id !== 'hub' && id !== 'ssd' ? 'on' : ''); });
    for (var id in AR){ var on = fr.ar.indexOf(id) >= 0; AR[id].style.opacity = on ? 1 : .12; AR[id].setAttribute('class', 'wire' + (on ? ' on flow' : '')); }
  }
  stp.set(F);
  var cards = h('div', {'class': 'grid2'}, root);
  h('div', {'class': 'card'}, cards, '<h3>Where each chapter showed up</h3><table class="mt"><tr><th>step</th><th>mechanism</th><th>chapter</th></tr>' +
    [['command in SQ', 'WB stores, dirty line in L1d', '04, 07'], ['doorbell', 'UC memory type, store ordering', '07'], ['command fetch', 'IOMMU walk, coherent read of a dirty line', '03, 08'], ['data DMA', 'writes to DRAM, cached copies invalidated', '06, 08'], ['completion read', 'miss to DRAM after invalidation', '05']]
    .map(function(r){ return '<tr><td style="font-family:var(--sans)">' + r[0] + '</td><td style="font-family:var(--sans)">' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join('') + '</table>');
  h('div', {'class': 'card'}, cards, '<h3>The same ring, one level up</h3><p>io_uring puts a submission ring and a completion ring in memory shared by the application and the kernel.</p><p>Head and tail indices are published with store-release and read with load-acquire (the <code>smp_store_release()</code> / <code>smp_load_acquire()</code> pair from [[ch:stores]]), exactly the ordering the NVMe ring needs between driver and device.</p><p>Kernel function names above are from recent mainline and move between versions.</p>');
  return {key: stp.key};
}});
