/* ======================= Part VI · Devices and I/O, lessons 1–3 ======================= */
(function () {
  'use strict';
  var d = App.gloss, P = App.P;
  d('pcifn', 'PCI function', 'One device as software sees it, with its own configuration space, registers and interrupts. It is named domain:bus:device.function, such as 0000:00:02.0; one card can hold up to 8 functions.');
  d('virtio', 'virtio', 'A standard set of devices (disk, network card, entropy source and others) designed for virtual machines. The hypervisor implements them in software; the guest drives them like hardware, over PCI.');
  d('rootcx', 'root complex', 'The part of the processor that connects the CPU cores and memory to PCI Express. Its root ports start the links to devices.');
  d('endpoint', 'endpoint', 'A PCI Express device at the end of a link, such as an SSD or a network card, as opposed to a switch or a port, which only forward traffic.');
  d('posted', 'posted write', 'A write that the sender does not wait for: no reply comes back. Reads are non-posted: the requester waits for a completion that carries the data.');
  d('lane', 'lane', 'One pair of serial connections, one in each direction. A link has 1, 2, 4, 8 or 16 lanes, written x1 to x16.');
  d('mps', 'Max_Payload_Size', 'The largest data payload one PCI Express packet may carry on a link: 128 to 4096 bytes, set by the kernel for each device.');
  d('cfgspace', 'configuration space', 'A small block of registers every PCI function has (256 bytes on PCI, 4 KiB on PCI Express): IDs, class, command and status, BARs and a list of capabilities.');
  d('ecam', 'ECAM', 'Enhanced configuration access mechanism: all configuration spaces mapped into physical memory, 4 KiB per function, so the CPU reads them with ordinary loads.');
  d('pcicap', 'capability list', 'A chain of small structures in configuration space, each with an ID and a pointer to the next, that describe optional features such as MSI-X or the PCI Express registers.');

  /* ---------- VI.01 ---------- */
  App.lesson({
    id: 'io-paths', short: 'How the CPU and devices talk', title: 'How the CPU and devices talk',
    lede: 'Device registers and RAM share one physical address space. The CPU reaches a device with loads and stores, the device reaches memory by itself, and it signals back with an interrupt.',
    know: ['Page tables map virtual pages to physical frames ([[ch:vm-pte]]).', 'The kernel reaches every frame through its direct map ([[ch:vm-tree]]).', 'A guest’s physical addresses are its own; the host maps them again ([[ch:vm-virt]]).'],
    learn: ['Read /proc/iomem: RAM, device windows and configuration space', 'Name the three paths between the CPU and a device', 'Identify machine B’s devices from their PCI IDs', 'Say which read the rest of this part takes apart'],
    sections: [
      { id: 'space', title: 'One physical address space', body: function (L) {
        L.p('These runs come from machine B. Root can list what the kernel placed at each physical address:');
        L.out('io.iomem', { wide: true });
        L.p('RAM fills three ranges, 16 GiB in all. Everything else in the list is not memory: a load or store there reaches a device.');
        L.table(['Range', 'What is there'], [
          ['0x1000–0xbfffffff, 0x100000000–0x43fffffff', 'RAM'],
          ['0xc0001000–0xeebfffff', 'a window for device registers below 4 GiB, unused here'],
          ['0xeec00000–0xeecfffff', 'the configuration space of bus 0 ([[ch:io-config]])'],
          ['0xfec00000', 'the I/O APIC, which routes pin interrupts ([[ch:io-irq]])'],
          ['0x4000000000–0x7fffffffff', 'a 256 GiB window for device registers; each device has 512 KiB of it']
        ], { mono: false });
        L.p('The firmware tells the kernel which ranges hold RAM, and devices get addresses in the gaps. So an address alone decides whether an access goes to DRAM or to a device.');
      } },
      { id: 'three', title: 'Three paths', body: function (L) {
        L.p('Between the CPU and a device there are three kinds of traffic:', ['mmio', 'dma']);
        L.table(['Path', 'Direction', 'Used for'], [
          ['MMIO', 'CPU → device registers', 'a load or store to a device address: commands, status, the doorbell that says “work waiting” ([[ch:io-mmio]])'],
          ['DMA', 'device → memory', 'the device reads and writes RAM itself: the data, and the descriptors that describe it ([[ch:io-dma]])'],
          ['interrupt', 'device → CPU', 'a signal that work finished; with MSI-X it is a memory write too ([[ch:io-irq]])']
        ], { mono: false });
        L.p('One read from a disk uses all three: a store to a register to announce the request, the device copying the data into RAM, then an interrupt. [[ch:io-review]] times each step on machine B.', ['msix']);
      } },
      { id: 'devices', title: 'Machine B’s devices', body: function (L) {
        L.p('Each device appears as a PCI function, named by where it sits:', ['pcifn']);
        L.out('io.functions', { wide: true });
        L.p('Vendor 0x1af4 makes all but the first: they are virtio devices. A modern virtio device’s PCI device ID is 0x1040 plus its virtio type:', ['virtio']);
        L.quote('/* Modern devices: simply use PCI device id, but start from 0x1040. */\nmdev->id.device = pci_dev->device - 0x1040;', { cite: 'drivers/virtio/virtio_pci_modern_dev.c, vp_modern_probe(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.quote('#define VIRTIO_ID_NET       1 /* virtio net */\n#define VIRTIO_ID_BLOCK     2 /* virtio block */\n#define VIRTIO_ID_RNG       4 /* virtio rng */\n#define VIRTIO_ID_BALLOON   5 /* virtio balloon */\n…\n#define VIRTIO_ID_VSOCK     19 /* virtio vsock transport */', { cite: 'include/uapi/linux/virtio_ids.h, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.table(['Slot', 'Device ID', 'Device'], [
          ['00:00.0', '0x0d57, class 0x0600', 'the host bridge: the path from the CPU to this bus'],
          ['00:01.0', '0x1045 = 0x1040 + 5', 'memory balloon: lets the host take memory back'],
          ['00:02.0 to 00:07.0', '0x1042 = 0x1040 + 2', 'six disks, vda to vdf'],
          ['00:08.0', '0x1041 = 0x1040 + 1', 'network card'],
          ['00:09.0', '0x1053 = 0x1040 + 19', 'vsock: sockets between guest and host'],
          ['00:0a.0', '0x1044 = 0x1040 + 4', 'entropy source']
        ], { mono: false });
        L.quote('Although the virtio devices are really an abstraction layer in the hypervisor, they\'re exposed to the guest as if they are physical devices using a specific transport method -- PCI, MMIO or CCW -- that is orthogonal to the device itself.', { cite: 'Documentation/driver-api/virtio/virtio.rst, Linux v6.18', label: 'Linux source' });
        L.p('So the registers, rings and interrupts in this part are real PCI mechanisms, and the device behind them is software in the host. [[ch:dev]] follows the same steps on an NVMe SSD.');
      } },
      { id: 'disk', title: 'The read this part takes apart', body: function (L) {
        L.p('The measured device is vda, the root disk. sysfs links the disk to its virtio device and PCI function:');
        L.out('io.path');
        L.p('A program reads 4 KiB at a time from a file on it, bypassing the page cache, 1000 times:');
        L.out('io.stats', { lines: [1] });
        L.p('About 41 µs per read, of which the program runs only a few. The lessons that follow take that read apart: the bus, the registers, the rings, DMA, the caches, interrupts, the block layer and io_uring.');
        L.note('vm', 'Machine B is a virtual machine. Its physical addresses are guest-physical ([[ch:vm-virt]]), and its devices are implemented by the host, so a device’s own time is host software time. The lessons point out where that changes what a number means.');
      } }
    ],
    check: [
      { q: 'A load goes to physical address 0x4000080000 on machine B. What answers it?', options: ['The registers of PCI function 0000:00:02.0', 'DRAM, like any other address', 'The I/O APIC', 'Nothing: the address is not mapped'], answer: 0, why: '/proc/iomem shows 4000080000-40000fffff belonging to 0000:00:02.0, the root disk.' },
      { q: 'Which path carries the 4 KiB of data from the disk into RAM?', options: ['DMA: the device writes memory itself', 'MMIO: the CPU loads it from device registers', 'An interrupt carries it', 'The I/O APIC'], answer: 0, why: 'MMIO is for small register accesses; bulk data moves by DMA.' },
      { q: 'A PCI function has vendor 0x1af4 and device 0x1042. What is it?', options: ['A virtio block device (0x1040 + 2)', 'A virtio network card', 'An NVMe SSD', 'A PCI bridge'], answer: 0, why: 'Modern virtio devices use 0x1040 plus the virtio type, and type 2 is block.' }
    ],
    remember: [
      'RAM and device registers share one physical address space; /proc/iomem shows which is where.',
      'MMIO: the CPU loads and stores device registers. DMA: the device reads and writes RAM. Interrupts: the device signals the CPU.',
      'Each device is a PCI function, named domain:bus:device.function.',
      'Machine B’s devices are virtio devices: real PCI mechanisms, implemented in software by the host.'
    ],
    sources: [['proc(5): /proc/iomem', 'https://man7.org/linux/man-pages/man5/proc.5.html'], ['Linux: Virtio on Linux', 'https://docs.kernel.org/driver-api/virtio/virtio.html'], ['Linux v6.18: include/uapi/linux/virtio_ids.h', 'https://github.com/torvalds/linux/blob/v6.18/include/uapi/linux/virtio_ids.h'], ['OASIS: Virtual I/O Device (VIRTIO) specification', 'https://docs.oasis-open.org/virtio/virtio/v1.2/virtio-v1.2.html']]
  });

  /* ---------- VI.02 ---------- */
  function topoFigure(sv) {
    var T = P.T, R = P.R;
    R(sv, 150, 8, 160, 40, 'box', 6); T(sv, 230, 33, 'CPU cores, memory', 's', 'middle');
    P.Ln(sv, 'M230 48 L230 66');
    R(sv, 90, 66, 280, 44, 'a3b', 6); T(sv, 230, 86, 'root complex', 'h', 'middle'); T(sv, 230, 102, 'root ports', 's', 'middle');
    P.Ln(sv, 'M140 110 L80 150'); P.Ln(sv, 'M320 110 L370 150');
    T(sv, 96, 136, 'link x16', 's m', 'end'); T(sv, 358, 136, 'link x8', 's m', 'start');
    R(sv, 20, 150, 120, 40, 'box', 6); T(sv, 80, 175, 'endpoint: GPU', 's', 'middle');
    R(sv, 310, 150, 120, 40, 'box', 6); T(sv, 370, 175, 'switch', 's', 'middle');
    P.Ln(sv, 'M340 190 L300 226'); P.Ln(sv, 'M400 190 L430 226');
    T(sv, 312, 214, 'x4', 's m', 'end'); T(sv, 424, 214, 'x4', 's m', 'start');
    R(sv, 240, 226, 120, 40, 'box', 6); T(sv, 300, 251, 'endpoint: SSD', 's', 'middle');
    R(sv, 380, 226, 100, 40, 'box', 6); T(sv, 430, 251, 'endpoint: NIC', 's', 'middle');
  }
  App.lesson({
    id: 'io-pcie', short: 'PCI Express', title: 'PCI Express',
    lede: 'PCI Express connects devices to the processor with point-to-point serial links. Every access, from either side, travels as a packet.',
    know: ['Each device is a PCI function on a bus ([[ch:io-paths]]).', 'Loads and stores to device addresses reach the device ([[ch:io-paths]]).'],
    learn: ['Draw the path from the CPU to an endpoint', 'Decode a domain:bus:device.function name', 'Tell posted writes from non-posted reads, and why it matters', 'Compute a link’s bandwidth from its generation and width'],
    sections: [
      { id: 'tree', title: 'Root complex, links and endpoints', body: function (L) {
        L.p('PCI Express is a tree of point-to-point links. The root complex sits in the processor; switches fan links out; devices sit at the ends:', ['rootcx', 'endpoint']);
        L.fig(500, 274, topoFigure, { cap: 'A typical PCI Express tree. Each link is private to the two ends it joins; a switch forwards packets between its ports.', maxw: 520 });
        L.p('Machine B’s functions all sit on bus 0, behind a host bridge, with no switch. In a virtual machine the bus is emulated, so there is no physical link to see ([[ch:io-config]]).');
        L.p('Every function is named by its place in the tree:');
        L.bits([
          { bits: 'domain', val: '0000', name: '16 bits: a separate tree', tone: 'mute' },
          { bits: 'bus', val: '00', name: '8 bits', tone: 'a1' },
          { bits: 'device', val: '02', name: '5 bits', tone: 'a4' },
          { bits: 'function', val: '0', name: '3 bits', tone: 'a2' }
        ], { title: 'The root disk’s function: 0000:00:02.0' });
        L.quote('#define PCI_DEVFN(slot, func)\t((((slot) & 0x1f) << 3) | ((func) & 0x07))', { cite: 'include/uapi/linux/pci.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('So a bus holds up to 32 devices of up to 8 functions each. Software reaches all of them the same way: with packets.');
      } },
      { id: 'tlps', title: 'Every access is a packet', body: function (L) {
        L.p('A load or store to a device address leaves the root complex as a transaction-layer packet. The common kinds:', ['tlp']);
        L.table(['Packet', 'Sent by', 'Answer'], [
          ['Memory Read', 'the CPU (an MMIO load) or a device (DMA)', 'a Completion carrying the data'],
          ['Memory Write', 'the CPU (an MMIO store) or a device (DMA, MSI-X)', 'none: the write is posted'],
          ['Configuration Read or Write', 'the root complex only', 'a Completion'],
          ['Message', 'either side', 'none']
        ], { mono: false });
        L.p('A device’s interrupt is a Memory Write too, to a special address ([[ch:io-irq]]). So the device side of a read is all writes: the data, the completion entry, the interrupt.');
      } },
      { id: 'posted', title: 'Posted writes and ordering', body: function (L) {
        L.p('A write is posted: the sender does not wait for it to arrive. A read is not: the reader waits for the completion.', ['posted']);
        L.quote('While the basic functions are defined to be synchronous with respect to each other and ordered with respect to each other the buses the devices sit on may themselves have asynchronicity. In particular many authors are burned by the fact that PCI bus writes are posted asynchronously. A driver author must issue a read from the same device to ensure that writes have occurred in the specific cases the author cares.', { cite: 'Documentation/driver-api/device-io.rst, Linux v6.18', label: 'Linux source' });
        L.p('Posted writes are what make a doorbell cheap: the CPU stores and moves on. When a driver must know a write arrived, it reads a register of the same device, and the read cannot pass the write.');
        L.p('The same rule protects DMA. A device writes the data, then the completion, then the interrupt; none of them may pass the ones before ([[ch:io-irq]]).');
      } },
      { id: 'links', title: 'Lanes and transfer rates', body: function (L) {
        L.p('A link is 1 to 16 lanes, each a serial connection in each direction. Each generation raises the transfer rate per lane; Linux computes the usable rate like this:', ['lane']);
        L.quote('/* PCIe speed to Mb/s reduced by encoding overhead */\n#define PCIE_SPEED2MBS_ENC(speed) \\\n\t((speed) == PCIE_SPEED_64_0GT ? 64000*1/1 : \\\n\t (speed) == PCIE_SPEED_32_0GT ? 32000*128/130 : \\\n\t (speed) == PCIE_SPEED_16_0GT ? 16000*128/130 : \\\n\t (speed) == PCIE_SPEED_8_0GT  ?  8000*128/130 : \\\n\t (speed) == PCIE_SPEED_5_0GT  ?  5000*8/10 : \\\n\t (speed) == PCIE_SPEED_2_5GT  ?  2500*8/10 : \\\n\t 0)', { cite: 'drivers/pci/pci.h, Linux v6.18', label: 'Linux source', code: true });
        L.code('PCIe 4.0 x4:  16000 × 128/130 = 15754 Mb/s per lane\n              × 4 lanes        = 63015 Mb/s = 7.9 GB/s each way\n4 KiB at that rate:   4096 × 8 / 63015 Mb/s ≈ 0.52 µs', { lang: 'text', title: 'arithmetic' });
        L.p('So moving a 4 KiB block over a PCIe 4.0 x4 link takes about half a microsecond. The read on machine B took about 41 µs: for one small read, the link is not where the time goes.');
        L.p('Data travels in packets of at most Max_Payload_Size bytes, 128 to 4096, set per device; 4 KiB at 256 bytes is 16 packets. On a real machine <code>lspci -vv</code> shows each link’s speed, width and payload size (LnkSta, DevCtl).', ['mps']);
        L.try('Link bandwidth', 'Pick a generation and a width. The per-lane rate is the one Linux uses above; packet headers are not subtracted.', function (el) { App.LW.pcielink(el, {}); });
        L.p('Before any of this traffic can flow, software must find each device and give it addresses. That is configuration space.');
      } }
    ],
    check: [
      { q: 'What does 0000:00:02.0 name?', options: ['Domain 0, bus 0, device 2, function 0', 'Bus 2, function 0', 'Physical address 0x0002', 'Interrupt 2'], answer: 0, why: 'domain:bus:device.function, with 8 bits of bus, 5 of device and 3 of function.' },
      { q: 'A driver writes a device register and must be sure the device has seen it before going on. What does it do?', options: ['Reads a register of the same device', 'Nothing: MMIO writes always wait', 'Writes the register twice', 'Flushes the CPU caches'], answer: 0, why: 'MMIO writes are posted; a read from the same device cannot complete before them.' },
      { q: 'About how long does 4 KiB take on a PCIe 4.0 x4 link?', options: ['About 0.5 µs', 'About 41 µs', 'About 5 ns', 'About 5 ms'], answer: 0, why: '15754 Mb/s per lane × 4 ≈ 63 Gb/s; 32768 bits / 63 Gb/s ≈ 0.52 µs.' },
      { q: 'Which of these is a non-posted transaction?', options: ['A Memory Read', 'A Memory Write', 'An MSI-X interrupt', 'A DMA write of data'], answer: 0, why: 'Reads wait for a completion with the data; writes, including MSI-X, are posted.' }
    ],
    remember: [
      'PCI Express is a tree of point-to-point links from the root complex, through switches, to endpoints.',
      'A function is named domain:bus:device.function: up to 32 devices of 8 functions per bus.',
      'Every access is a packet: reads get a completion, writes are posted.',
      'A driver confirms a write by reading the same device; a device’s data, completion and interrupt arrive in order.',
      'Per lane: 8, 16, 32 and 64 GT/s for PCIe 3 to 6; 4 KiB over PCIe 4.0 x4 takes about 0.5 µs.'
    ],
    sources: [['Linux: Bus-independent device accesses (device-io.rst)', 'https://docs.kernel.org/driver-api/device-io.html'], ['Linux v6.18: drivers/pci/pci.h', 'https://github.com/torvalds/linux/blob/v6.18/drivers/pci/pci.h'], ['Linux v6.18: include/uapi/linux/pci.h', 'https://github.com/torvalds/linux/blob/v6.18/include/uapi/linux/pci.h'], ['lspci(8)', 'https://man7.org/linux/man-pages/man8/lspci.8.html']]
  });

  /* ---------- VI.03 ---------- */
  App.lesson({
    id: 'io-config', short: 'Configuration space and BARs', title: 'Configuration space and BARs',
    lede: 'Every PCI function has a small block of configuration registers. It says what the device is and lets the kernel turn it on and place its registers in the address space.',
    know: ['Each device is a PCI function named domain:bus:device.function ([[ch:io-pcie]]).', 'Device registers sit in windows of the physical address space ([[ch:io-paths]]).'],
    learn: ['Read a configuration-space dump field by field', 'Say what the command register’s memory and bus-master bits enable', 'Size a BAR the way the kernel does, and compute its address', 'Follow the capability list to the virtio registers and MSI-X'],
    sections: [
      { id: 'dump', title: 'The first 256 bytes', body: function (L) {
        L.p('Every function has a configuration space: 256 bytes on PCI, 4 KiB on PCI Express. Root can read it through sysfs:', ['cfgspace']);
        L.out('io.cfghex');
        L.quote('#define PCI_CFG_SPACE_SIZE\t256\n#define PCI_CFG_SPACE_EXP_SIZE\t4096', { cite: 'include/uapi/linux/pci_regs.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('Machine B’s functions show 256 bytes: they have no PCI Express capability, so the kernel treats them as plain PCI. Values are little-endian: f4 1a is 0x1af4.');
      } },
      { id: 'header', title: 'The header', body: function (L) {
        L.p('The first 64 bytes have a fixed layout. pcicfg.py decodes them:');
        L.out('io.cfghdr', { wide: true });
        L.p('The command register, 0x0406, has three bits set:');
        L.bits([
          { bits: '10', val: '1', name: 'INTx disable', tone: 'a2' },
          { bits: '9:3', val: '0', name: '', tone: 'mute', w: 1.4 },
          { bits: '2', val: '1', name: 'bus master', tone: 'a1', hot: true },
          { bits: '1', val: '1', name: 'memory space', tone: 'a4', hot: true },
          { bits: '0', val: '0', name: 'I/O space', tone: 'mute' }
        ], { title: 'command = 0x0406', dense: true });
        L.quote('#define  PCI_COMMAND_IO\t\t0x1\t/* Enable response in I/O space */\n#define  PCI_COMMAND_MEMORY\t0x2\t/* Enable response in Memory space */\n#define  PCI_COMMAND_MASTER\t0x4\t/* Enable bus mastering */\n…\n#define  PCI_COMMAND_INTX_DISABLE 0x400 /* INTx Emulation Disable */', { cite: 'include/uapi/linux/pci_regs.h, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('Memory space on: the device answers at its BAR addresses. Bus master on: the device may start its own memory reads and writes, DMA, which a driver enables only when it is ready ([[ch:io-dma]]).');
      } },
      { id: 'bars', title: 'BARs: where the registers live', body: function (L) {
        L.p('A base address register holds where the device’s registers start. BAR0 here is 64 bits wide, so it uses two slots:', ['bar']);
        L.code('BAR0 = 0x00080004: bit 0 = 0 memory, bits 2:1 = 10 64-bit, bit 3 = 0 not prefetchable\nBAR1 = 0x00000040: the upper 32 bits\n\naddress = 0x00000040 << 32 | (0x00080004 & ~0xf) = 0x4000080000', { lang: 'text', title: 'decoding the two slots', label: 'Inference' });
        L.p('The size is not stored anywhere. The kernel finds it by writing all ones and reading back which bits stuck:');
        L.quote('pci_read_config_dword(dev, pos, &orig);\npci_write_config_dword(dev, pos, mask);\npci_read_config_dword(dev, pos, sizes);\npci_write_config_dword(dev, pos, orig);', { cite: 'drivers/pci/probe.c, __pci_size_bars(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.quote('\tu64 size = mask & maxbase;\t/* Find the significant bits */\n…\n\t/*\n\t * Get the lowest of them to find the decode size, and from that\n\t * the extent.\n\t */\n\tsize = size & ~(size-1);', { cite: 'drivers/pci/probe.c, pci_size(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('pcicfg.py never writes: it takes the size from sysfs, 512 KiB. Try the probe on a BAR of your choice:');
        L.try('Size a BAR', 'The device decides the size by tying low address bits to 0. Pick a size and type and follow the kernel’s probe.', function (el) { App.LW.barsize(el, {}); });
        L.p('The kernel then assigns each BAR an address in a window, aligned to its size: 0x4000080000 is a multiple of 512 KiB. That is the entry /proc/iomem showed in [[ch:io-paths]].');
      } },
      { id: 'caps', title: 'The capability list', body: function (L) {
        L.p('Offset 0x34 points to a chain of capability structures. Each starts with an ID and the offset of the next:', ['pcicap']);
        L.out('io.caps', { wide: true });
        L.p('Five virtio capabilities (ID 0x09, vendor-specific) say where in BAR0 each group of virtio registers sits. The sixth is MSI-X ([[ch:io-irq]]).');
        L.table(['BAR0 offset', 'Size', 'Contents'], [
          ['0x0000', '56 bytes', 'common configuration: features, status, queue setup ([[ch:io-rings]])'],
          ['0x2000', '1 byte', 'ISR status, cleared when read ([[ch:io-mmio]])'],
          ['0x4000', '4 KiB', 'disk configuration: size, block size'],
          ['0x6000', '4 KiB', 'notification registers: the doorbells ([[ch:io-rings]])'],
          ['0x8000', '2 × 16 bytes', 'the MSI-X table: one entry per vector ([[ch:io-irq]])'],
          ['0x48000', '8 bytes', 'MSI-X pending bits']
        ], { mono: false });
        L.p('So a driver reads configuration space once to learn where things are, and from then on uses BAR0. There is no PCI Express capability (ID 0x10) in the list, which is why there is no link speed to show.');
      } },
      { id: 'ecam', title: 'How configuration space is reached', body: function (L) {
        L.p('Configuration space is memory-mapped too. /proc/iomem showed a window for bus 0:', ['ecam']);
        L.out('io.iomem', { lines: [5], what: 'iomem.sh: the ECAM line of the /proc/iomem list in [[ch:io-paths]].' });
        L.p('Each function gets 4 KiB of it, found from the bus, device and function numbers:');
        L.quote('#define PCIE_ECAM_BUS_SHIFT\t20 /* Bus number */\n#define PCIE_ECAM_DEVFN_SHIFT\t12 /* Device and Function number */', { cite: 'include/linux/pci-ecam.h, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.code('devfn of 00:02.0 = 2 << 3 | 0 = 0x10\n0xeec00000 + (0 << 20) + (0x10 << 12) = 0xeec10000', { lang: 'text', title: 'where 0000:00:02.0’s configuration space is', label: 'Inference' });
        L.p('A 4 KiB slot per function is why ECAM can map PCI Express’s full 4 KiB configuration spaces. With the registers placed, the next lesson looks at how the CPU actually touches them.');
      } }
    ],
    check: [
      { q: 'The command register reads 0x0406. May the device start DMA?', options: ['Yes: bit 2, bus master, is set', 'No: bit 0 is clear', 'Only through I/O space', 'Only after an interrupt'], answer: 0, why: '0x0406 = bits 10, 2 and 1. Bit 2 (0x4) is bus mastering.' },
      { q: 'After the kernel writes all ones to a 64-bit BAR, the low half reads 0xfff80004 and the high half 0xffffffff. How big is the BAR?', options: ['512 KiB', '4 KiB', '4 GiB', '1 MiB'], answer: 0, why: 'Clear bits 3:0: the lowest set bit of 0xfff80000 is bit 19, 0x80000 = 512 KiB.' },
      { q: 'Where does a virtio driver find its doorbell registers?', options: ['In BAR0, at the offset a virtio capability gives (0x6000 here)', 'At a fixed address for all PCI devices', 'In the I/O APIC', 'In the first 64 bytes of configuration space'], answer: 0, why: 'The notification capability points into BAR0; the header itself has no doorbells.' },
      { q: 'Why does every BAR start at a multiple of its size?', options: ['The device ties the low address bits to 0', 'The kernel prefers round numbers', 'PCI links need it for speed', 'Page tables require it'], answer: 0, why: 'Those bits cannot be written, so the base must have them as 0: aligned to the size.' }
    ],
    remember: [
      'Every function has a configuration space: 256 bytes on PCI, 4 KiB on PCI Express.',
      'The command register enables memory responses (bit 1) and DMA (bit 2, bus master).',
      'A BAR holds a base address; its size is found by writing all ones, and the BAR is aligned to it.',
      'The capability list points to optional features: here the virtio register groups in BAR0, and MSI-X.',
      'ECAM maps configuration space into memory, 4 KiB per function at base + bus << 20 + devfn << 12.'
    ],
    sources: [['Linux v6.18: include/uapi/linux/pci_regs.h', 'https://github.com/torvalds/linux/blob/v6.18/include/uapi/linux/pci_regs.h'], ['Linux v6.18: drivers/pci/probe.c', 'https://github.com/torvalds/linux/blob/v6.18/drivers/pci/probe.c'], ['Linux v6.18: include/linux/pci-ecam.h', 'https://github.com/torvalds/linux/blob/v6.18/include/linux/pci-ecam.h'], ['OASIS VIRTIO 1.2, §4.1 Virtio Over PCI Bus', 'https://docs.oasis-open.org/virtio/virtio/v1.2/virtio-v1.2.html']]
  });
})();
