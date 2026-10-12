/* ======================= Part VI · Devices and I/O, lessons 4–6 ======================= */
(function () {
  'use strict';
  var d = App.gloss;
  d('ioremap', 'ioremap()', 'The kernel function a driver calls to map a device’s physical register range into kernel virtual addresses, uncached. On x86 it uses the UC- memory type.');
  d('sideeffect', 'read side effect', 'A register whose value changes because it was read, such as a status register that clears itself. Reading it twice, or early, loses information.');
  d('vmexit', 'VM exit', 'The CPU leaving a guest to run the hypervisor, for example because the guest touched an emulated device register. The guest continues only after the hypervisor has handled it.');
  d('ring', 'ring', 'A fixed array used as a queue: the producer writes at the tail index, the consumer reads at the head index, and positions wrap around the end of the array.');
  d('virtqueue', 'virtqueue', 'virtio’s ring for requests: a descriptor table, an available ring the driver fills and a used ring the device fills, all in guest memory.');
  d('eventidx', 'event index', 'A virtio feature in which each side writes, in shared memory, the ring position at which it next wants a notification, so the other side can skip doorbells and interrupts it does not need.');
  d('dmaaddr', 'DMA address', 'The address a device puts on the bus to reach memory. Without an IOMMU it is usually the physical address; with one it is an IOVA that the IOMMU translates.');
  d('streaming', 'streaming mapping', 'A DMA mapping made for one transfer and removed right after it, such as a buffer being read into. The other kind, a coherent mapping, lasts for the driver’s lifetime, such as a ring.');
  d('pin', 'pinning', 'Holding a page in place so that the kernel cannot move, swap or free it while a device may access it.');

  /* ---------- VI.04 ---------- */
  App.lesson({
    id: 'io-mmio', short: 'MMIO and memory types', title: 'MMIO and memory types',
    lede: 'A driver reaches device registers with ordinary loads and stores, through a mapping the caches leave alone. Each access goes straight to the device, once, in program order.',
    know: ['A BAR places a device’s registers in the physical address space ([[ch:io-config]]).', 'PCI writes are posted; a read from the same device flushes them ([[ch:io-pcie]]).', 'Page-table entries carry cache-control bits as well as permissions ([[ch:vm-pte]]).'],
    learn: ['Say how a driver maps device registers, and with which memory type', 'Read the kernel’s list of memory types for a device', 'Explain why device registers must never be cached or read early', 'Say what one MMIO access costs a virtual machine'],
    sections: [
      { id: 'map', title: 'Mapping the registers', body: function (L) {
        L.p('Like any memory access, a register access needs a virtual address and a page-table entry. A driver gets them with ioremap(), in the kernel half:', ['ioremap']);
        L.quote('\t/*\n\t * Ideally, this should be:\n\t *\tpat_enabled() ? _PAGE_CACHE_MODE_UC : _PAGE_CACHE_MODE_UC_MINUS;\n\t *\n\t * Till we fix all X drivers to use ioremap_wc(), we will use\n\t * UC MINUS. Drivers that are certain they need or can already\n\t * be converted over to strong UC can use ioremap_uc().\n\t */\n\tenum page_cache_mode pcm = _PAGE_CACHE_MODE_UC_MINUS;', { cite: 'arch/x86/mm/ioremap.c, ioremap(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('The PAT bits in the page-table entry select the memory type ([[ch:vm-pte]]). Linux uses five of them:', ['memtype', 'pat']);
        L.quote('===  ==============\nWB   Write-back\nUC   Uncached\nWC   Write-combined\nWT   Write-through\nUC-  Uncached Minus\n===  ==============', { cite: 'Documentation/arch/x86/pat.rst, Linux v6.18', label: 'Linux source', code: true });
        L.p('UC and UC-minus are both uncached; they differ only in how they combine with the older memory type range registers (MTRRs). RAM is WB.');
        L.p('ioremap() maps only what the driver asks for. The kernel keeps a list of every such mapping and its type.');
      } },
      { id: 'pat', title: 'What the kernel mapped', body: function (L) {
        L.p('debugfs shows the memory type of each range the kernel mapped for devices. For the root disk’s function:');
        L.out('io.pat', { wide: true });
        L.p('Five pieces of 4 KiB, at BAR0 offsets 0x0000, 0x2000, 0x4000, 0x6000 and 0x8000: exactly the regions the capability list named ([[ch:io-config]]). The rest of the 512 KiB BAR is never mapped.');
        L.p('The virtio driver mapped the first four. The fifth is the MSI-X table, mapped by the PCI core:');
        L.quote('\tphys_addr = pci_resource_start(dev, bir) + table_offset;\n\n\treturn ioremap(phys_addr, nr_entries * PCI_MSIX_ENTRY_SIZE);', { cite: 'drivers/pci/msi/msi.c, msix_map_region(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('The first line is the configuration-space window from [[ch:io-config]], uncached as well. Why uncached matters is a question of what a register read does.');
      } },
      { id: 'side', title: 'Registers are not memory', body: function (L) {
        L.p('Reading memory twice gives the same value. Reading a register can change it:', ['sideeffect']);
        L.quote('\t/* reading the ISR has the effect of also clearing it so it\'s very\n\t * important to save off the value. */\n\tisr = ioread8(vp_dev->isr);', { cite: 'drivers/virtio/virtio_pci_common.c, vp_interrupt(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('A cached or speculative read of that register would clear it and lose the event. So the mapping forbids everything a CPU normally does to speed up memory:');
        L.quote('* Uncached - CPU-side caches are bypassed, and all reads and writes are handled directly by the device\n* No speculative operations - the CPU may not issue a read or write to this memory, unless the instruction that does so has been reached in committed program flow.\n* No reordering - The CPU may not reorder accesses to this memory mapping with respect to each other. On some architectures, this relies on barriers in readl_relaxed()/writel_relaxed().\n* No repetition - The CPU may not issue multiple reads or writes for a single program instruction.\n* No write-combining - Each I/O operation results in one discrete read or write being issued to the device, and multiple writes are not combined into larger writes.', { cite: 'Documentation/driver-api/device-io.rst, “ioremap()”, Linux v6.18 (excerpt)', label: 'Linux source' });
        L.p('The cost is speed: an uncached load waits for the device to answer, a full round trip. Drivers keep register reads out of their fast paths and put data in RAM instead ([[ch:io-rings]]).');
        L.note('other', 'Some ranges want the opposite. A frame buffer, or a BAR marked prefetchable, can be mapped write-combining with ioremap_wc(): stores are gathered into full-line writes. Reads there have no side effects.', 'Write-combining');
      } },
      { id: 'order', title: 'readl, writel and their order', body: function (L) {
        L.p('Drivers access registers through accessor functions, never plain pointers. The usual ones also order the access against the driver’s memory writes:');
        L.quote('readq(), readl(), readw(), readb(), writeq(), writel(), writew(), writeb()\n\n  These are the most generic accessors, providing serialization against other MMIO accesses and DMA accesses as well as fixed endianness for accessing little-endian PCI devices and on-chip peripherals.', { cite: 'Documentation/driver-api/device-io.rst, Linux v6.18 (excerpt)', label: 'Linux source' });
        L.p('That ordering is what makes a doorbell safe: the request written to RAM must be visible before the store that tells the device to read it. On x86, stores already stay in order, so writel() is a single instruction:');
        L.quote('build_mmio_write(writel, "l", unsigned int, "r", :"memory")', { cite: 'arch/x86/include/asm/io.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('The <code>"memory"</code> clobber stops only the compiler from moving memory accesses across it; the CPU needs nothing more. The _relaxed versions drop the ordering with DMA, for registers that do not start a transfer.');
        L.note('arm', 'Arm reorders stores to normal memory, so the generic writel() issues a barrier first: <code>__io_bw()</code>, which arm64 defines as <code>dma_wmb()</code>. ioremap() there maps registers as Device-nGnRE memory (<code>_PAGE_IOREMAP</code> in arch/arm64/include/asm/io.h): no gathering, no reordering.');
      } },
      { id: 'vm', title: 'MMIO in a virtual machine', body: function (L) {
        L.p('On machine B the registers belong to software in the host. A guest access to them cannot complete inside the guest:', ['vmexit']);
        L.quote('If exit_reason is KVM_EXIT_MMIO, then the vcpu has executed a memory-mapped I/O instruction which could not be satisfied by kvm.  The \'data\' member contains the written data if \'is_write\' is true, and should be filled by application code otherwise.', { cite: 'Documentation/virt/kvm/api.rst, KVM_RUN, Linux v6.18', label: 'Linux source' });
        L.quote('This ioctl attaches or detaches an ioeventfd to a legal pio/mmio address within the guest.  A guest write in the registered address will signal the provided event instead of triggering an exit.', { cite: 'Documentation/virt/kvm/api.rst, KVM_IOEVENTFD, Linux v6.18', label: 'Linux source' });
        L.p('Either way the CPU leaves the guest for KVM. With an ioeventfd, a doorbell write is handed to the device’s thread without returning to the virtual machine monitor, which keeps it cheap.');
        L.p('So every request costs at least one exit, at the doorbell. The next lesson shows why one doorbell can stand for many requests.');
      } }
    ],
    check: [
      { q: 'Which memory type does ioremap() give device registers on x86?', options: ['UC- (uncached minus)', 'WB (write-back), like RAM', 'WC (write-combining)', 'WT (write-through)'], answer: 0, why: 'ioremap() uses _PAGE_CACHE_MODE_UC_MINUS, an uncached type.' },
      { q: 'Why must a CPU never read the virtio ISR register speculatively?', options: ['Reading it clears it, so a speculative read would lose the event', 'It is too slow', 'It is write-only', 'Speculation would change its address'], answer: 0, why: 'vp_interrupt(): reading the ISR also clears it.' },
      { q: 'A driver writes a request into RAM, then writes the doorbell with writel(). What guarantees the device sees the request?', options: ['writel() is ordered after the driver’s earlier memory writes', 'The device always waits 1 µs', 'The doorbell write flushes the caches', 'The request is in the doorbell register'], answer: 0, why: 'writel() serializes against DMA: on x86 by store order, on Arm with a barrier first.' },
      { q: 'What happens when machine B’s driver writes a doorbell?', options: ['The CPU leaves the guest; KVM hands the write to the device emulation', 'The write goes straight to a physical SSD', 'Nothing until the next interrupt', 'The CPU caches the write'], answer: 0, why: 'An emulated device register cannot be satisfied inside the guest: an exit, then KVM or the VMM handles it.' }
    ],
    remember: [
      'Drivers map registers with ioremap(): uncached (UC- on x86, Device-nGnRE on Arm).',
      'Only the regions a driver maps get page-table entries; debugfs lists them with their types.',
      'Register reads can have side effects, so device memory is never cached, speculated, repeated or combined.',
      'writel() orders the doorbell after the request in RAM; _relaxed accessors skip that ordering.',
      'In a virtual machine every access to an emulated register leaves the guest.'
    ],
    sources: [['Linux: Bus-independent device accesses (device-io.rst)', 'https://docs.kernel.org/driver-api/device-io.html'], ['Linux: PAT (x86 Page Attribute Table)', 'https://docs.kernel.org/arch/x86/pat.html'], ['Linux v6.18: arch/x86/mm/ioremap.c', 'https://github.com/torvalds/linux/blob/v6.18/arch/x86/mm/ioremap.c'], ['Linux: KVM API (KVM_EXIT_MMIO, KVM_IOEVENTFD)', 'https://docs.kernel.org/virt/kvm/api.html']]
  });

  /* ---------- VI.05 ---------- */
  App.lesson({
    id: 'io-rings', short: 'Doorbells and rings', title: 'Doorbells and descriptor rings',
    lede: 'Requests and completions travel through rings in ordinary RAM. The only register a request touches is the doorbell, and often not even that.',
    know: ['Register accesses are uncached and, in a virtual machine, leave the guest ([[ch:io-mmio]]).', 'The doorbells sit at BAR0 offset 0x6000 here ([[ch:io-config]]).'],
    learn: ['Use head and tail indexes to manage a ring', 'Name the three parts of a virtqueue and who writes each', 'Follow virtio-blk from adding a request to ringing the doorbell', 'Explain how event indexes and phase bits save notifications'],
    sections: [
      { id: 'ring', title: 'One producer, one consumer', body: function (L) {
        L.p('A ring is a fixed array used as a queue. The producer writes at the tail and advances it; the consumer reads at the head and advances it:', ['ring']);
        L.try('A ring of 8 slots', 'Add and take entries. The indexes only ever grow; the slot is the index masked by the ring size.', function (el) { App.LW.ringsim(el, {}); });
        L.p('Each index has one writer, so producer and consumer need no lock. The only rule is order: write the entry first, then publish the new index ([[ch:stores]]).');
        L.p('A device ring has the same shape, with the driver and the device as the two sides.');
      } },
      { id: 'vq', title: 'A virtqueue', body: function (L) {
        L.p('virtio’s ring is the virtqueue. The virtio specification splits it into parts with one writer each:', ['virtqueue']);
        L.quote('The split virtqueue format separates the virtqueue into several parts, where each part is write-able by either the driver or the device, but not both.\n…\nEach virtqueue consists of three parts:\n• Descriptor Table - occupies the Descriptor Area\n• Available Ring - occupies the Driver Area\n• Used Ring - occupies the Device Area', { cite: 'OASIS VIRTIO 1.2, §2.7 Split Virtqueues', label: 'Specification', src: ['VIRTIO 1.2', 'https://docs.oasis-open.org/virtio/virtio/v1.2/virtio-v1.2.html'] });
        L.p('Linux declares the three parts as structures in guest memory. The driver writes the first two, the device the third:');
        L.quote('struct vring_desc {\n\t__virtio64 addr;\n\t__virtio32 len;\n\t__virtio16 flags;\n\t__virtio16 next;\n};\nstruct vring_avail {\n\t__virtio16 flags;\n\t__virtio16 idx;\n\t__virtio16 ring[];\n};\nstruct vring_used {\n\t__virtio16 flags;\n\t__virtio16 idx;\n\tvring_used_elem_t ring[];\n};', { cite: 'include/uapi/linux/virtio_ring.h, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.table(['Part', 'Written by', 'Holds'], [
          ['descriptor table', 'driver', 'buffers: address, length, flags, and the next descriptor of a chain'],
          ['available ring', 'driver', 'the first descriptor of each new request; idx is the producer index'],
          ['used ring', 'device', 'each finished request and how many bytes it wrote; idx is the device’s index']
        ], { mono: false });
        L.p('A disk read is a chain of three descriptors: a header with the sector, the data buffer, and a status byte:');
        L.quote('\tsg_init_one(&out_hdr, &vbr->out_hdr, sizeof(vbr->out_hdr));\n\tsgs[num_out++] = &out_hdr;\n…\n\t\t\tsgs[num_out + num_in++] = vbr->sg_table.sgl;\n…\n\tsg_init_one(&in_hdr, &vbr->in_hdr.status, vbr->in_hdr_len);\n\tsgs[num_out + num_in++] = &in_hdr;\n\n\treturn virtqueue_add_sgs(vq, sgs, num_out, num_in, vbr, GFP_ATOMIC);', { cite: 'drivers/block/virtio_blk.c, virtblk_add_req(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.quote('/* This marks a buffer as write-only (otherwise read-only). */\n#define VRING_DESC_F_WRITE\t2', { cite: 'include/uapi/linux/virtio_ring.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('The header is read by the device; the buffer and status are written by it, so their descriptors carry VRING_DESC_F_WRITE. The device learns about the chain from the available ring, once something tells it to look.');
      } },
      { id: 'doorbell', title: 'Ringing the doorbell', body: function (L) {
        L.p('virtio-blk adds the request under the queue’s lock, then decides whether to notify the device:');
        L.quote('\terr = virtblk_add_req(vblk->vqs[qid].vq, vbr);\n…\n\tif (bd->last && virtqueue_kick_prepare(vblk->vqs[qid].vq))\n\t\tnotify = true;\n\tspin_unlock_irqrestore(&vblk->vqs[qid].lock, flags);\n\n\tif (notify)\n\t\tvirtqueue_notify(vblk->vqs[qid].vq);', { cite: 'drivers/block/virtio_blk.c, virtio_queue_rq(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('The notification itself is one 16-bit MMIO store: the queue’s number, written to the queue’s doorbell:', ['doorbell']);
        L.quote('\t/* we write the queue\'s selector into the notification register to\n\t * signal the other end */\n\tiowrite16(vq->index, (void __iomem *)vq->priv);', { cite: 'drivers/virtio/virtio_pci_common.c, vp_notify(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('Each queue’s doorbell address comes from the notification capability. Its multiplier was 4 in [[ch:io-config]]:');
        L.quote('\t\treturn mdev->notify_base + off * mdev->notify_offset_multiplier;', { cite: 'drivers/virtio/virtio_pci_modern_dev.c, vp_modern_map_vq_notify(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.code('notify_base = BAR0 + 0x6000 = 0x4000086000\nqueue q’s doorbell = 0x4000086000 + queue_notify_off(q) × 4', { lang: 'text', title: 'the doorbell of vda’s request queue', label: 'Inference' });
        L.p('That page is the fourth uncached piece in the list of [[ch:io-mmio]].');
        L.p('Notice what the device never gets through a register: the request itself. It reads the descriptors from RAM by DMA ([[ch:io-dma]]).');
      } },
      { id: 'fewer', title: 'Fewer doorbells, fewer interrupts', body: function (L) {
        L.p('Doorbells and interrupts are the expensive part, so both sides skip the ones the other does not need. vda negotiated these features:', ['eventidx']);
        L.out('io.features', { wide: true });
        L.quote('/* The Guest publishes the used index for which it expects an interrupt\n * at the end of the avail ring. Host should ignore the avail->flags field. */\n/* The Host publishes the avail index for which it expects a kick\n * at the end of the used ring. Guest should ignore the used->flags field. */\n#define VIRTIO_RING_F_EVENT_IDX\t\t29', { cite: 'include/uapi/linux/virtio_ring.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('Bit 29 is set, so virtqueue_kick_prepare() rings only when the device asked to be woken at this index. While the device is still busy with earlier requests, new ones go into the ring with no doorbell at all.');
        L.table(['Bit', 'Name', 'Means'], [
          ['2', 'VIRTIO_BLK_F_SEG_MAX', 'the device states how many buffers one request may have'],
          ['6', 'VIRTIO_BLK_F_BLK_SIZE', 'the device states its block size'],
          ['9', 'VIRTIO_BLK_F_FLUSH', 'the device has a flush command'],
          ['10', 'VIRTIO_BLK_F_TOPOLOGY', 'the device states alignment and physical block size'],
          ['13', 'VIRTIO_BLK_F_DISCARD', 'the device accepts discards'],
          ['29', 'VIRTIO_RING_F_EVENT_IDX', 'event indexes, above'],
          ['32', 'VIRTIO_F_VERSION_1', 'a modern (virtio 1.0 or later) device']
        ], { mono: false, cap: 'Names from include/uapi/linux/virtio_blk.h, virtio_ring.h and virtio_config.h (Linux v6.18). Bit 12, VIRTIO_BLK_F_MQ, is clear: vda has one request queue.' });
        L.note('other', 'NVMe completion queues use a phase bit instead of a device index: every entry carries a bit that flips on each pass around the ring, so the driver spots new entries without reading a register. Linux checks it first: <code>(le16_to_cpu(READ_ONCE(hcqe->status)) & 1) == nvmeq->cq_phase</code> (drivers/nvme/host/pci.c, nvme_cqe_pending()). [[ch:dev]] steps through an NVMe read.', 'NVMe');
        L.p('So far the descriptors only held addresses. Which addresses a device may use is the next question.');
      } }
    ],
    check: [
      { q: 'A ring of 8 slots has head = 9 and tail = 13. How many entries wait, and where is the next one written?', options: ['4 wait; the next goes into slot 5 (13 & 7)', '13 wait; slot 13', '4 wait; slot 1', 'The ring is full'], answer: 0, why: 'tail − head = 4; the next entry goes to slot tail & 7 = 5.' },
      { q: 'Which part of a virtqueue does the device write?', options: ['The used ring', 'The descriptor table', 'The available ring', 'The doorbell register'], answer: 0, why: 'The driver writes descriptors and the available ring; the device returns finished requests in the used ring.' },
      { q: 'What does the doorbell write carry?', options: ['Only the queue’s number', 'The whole 4 KiB of data', 'The descriptor chain', 'The sector number'], answer: 0, why: 'vp_notify() writes vq->index; the device then reads the ring in RAM.' },
      { q: 'With VIRTIO_RING_F_EVENT_IDX, when does the driver skip the doorbell?', options: ['When the device has not asked to be woken at this ring position', 'Never', 'When the request is a write', 'When interrupts are off'], answer: 0, why: 'The device publishes the index at which it wants a kick; virtqueue_kick_prepare() checks it.' }
    ],
    remember: [
      'A ring has a producer index (tail) and a consumer index (head); each has one writer, so no lock is needed.',
      'A virtqueue is a descriptor table and an available ring written by the driver, and a used ring written by the device.',
      'A virtio-blk read is a chain of three descriptors: header, buffer, status.',
      'The doorbell is one MMIO store of the queue number; everything else is in RAM.',
      'Event indexes (virtio) and phase bits (NVMe) save doorbells, interrupts and register reads.'
    ],
    sources: [['Linux v6.18: include/uapi/linux/virtio_ring.h', 'https://github.com/torvalds/linux/blob/v6.18/include/uapi/linux/virtio_ring.h'], ['Linux v6.18: drivers/block/virtio_blk.c', 'https://github.com/torvalds/linux/blob/v6.18/drivers/block/virtio_blk.c'], ['Linux: Virtio on Linux (virtqueues)', 'https://docs.kernel.org/driver-api/virtio/virtio.html'], ['OASIS VIRTIO 1.2, §2.7 Split Virtqueues', 'https://docs.oasis-open.org/virtio/virtio/v1.2/virtio-v1.2.html']]
  });

  /* ---------- VI.06 ---------- */
  App.lesson({
    id: 'io-dma', short: 'DMA and the DMA API', title: 'DMA and the DMA API',
    lede: 'A device moves data by reading and writing memory itself. The driver must give it an address it can use, and keep that memory in place until the device is done.',
    know: ['The bus-master bit lets a device start memory accesses ([[ch:io-config]]).', 'A virtqueue descriptor holds a buffer’s address ([[ch:io-rings]]).', 'A guest’s physical addresses are guest-physical ([[ch:vm-virt]]).'],
    learn: ['Say which address a device needs, and why it is not a virtual one', 'Choose between a coherent and a streaming DMA mapping', 'Explain what O_DIRECT changes: the program’s buffer becomes the target', 'Explain why machine B’s virtio devices bypass the DMA API'],
    sections: [
      { id: 'addr', title: 'The address a device uses', body: function (L) {
        L.p('A device knows nothing of page tables. It needs an address on the bus, which may differ from the physical address:', ['dmaaddr']);
        L.quote('I/O devices use a third kind of address: a "bus address".  If a device has registers at an MMIO address, or if it performs DMA to read or write system memory, the addresses used by the device are bus addresses.  In some systems, bus addresses are identical to CPU physical addresses, but in general they are not.  IOMMUs and host bridges can produce arbitrary mappings between physical and bus addresses.', { cite: 'Documentation/core-api/dma-api-howto.rst, Linux v6.18', label: 'Linux source' });
        L.table(['Address', 'Used by', 'Example from this course'], [
          ['virtual', 'programs and the kernel, through page tables', 'the read buffer at 0x7fdb41b48000'],
          ['physical', 'the CPU’s memory accesses after translation', 'its frame 0x124451'],
          ['DMA (bus)', 'the device', 'the physical address, unless an IOMMU sits between ([[ch:io-iommu]])']
        ], { mono: false });
        L.p('Drivers never compute DMA addresses themselves. They ask the DMA API, which knows whether an IOMMU or a bounce buffer is in the way.');
      } },
      { id: 'api', title: 'Coherent and streaming mappings', body: function (L) {
        L.p('The DMA API has two kinds of mapping:', ['streaming']);
        L.quote('- Coherent DMA mappings which are usually mapped at driver initialization, unmapped at the end and for which the hardware should guarantee that the device and the CPU can access the data in parallel and will see updates made by each other without any explicit software flushing.', { cite: 'Documentation/core-api/dma-api-howto.rst, “Types of DMA mappings”, Linux v6.18', label: 'Linux source' });
        L.quote('- Streaming DMA mappings which are usually mapped for one DMA transfer, unmapped right after it (unless you use dma_sync_* below) and for which hardware can optimize for sequential accesses.', { cite: 'Documentation/core-api/dma-api-howto.rst, “Types of DMA mappings”, Linux v6.18', label: 'Linux source' });
        L.table(['Kind', 'Call', 'Typical use'], [
          ['coherent', 'dma_alloc_coherent()', 'rings and descriptors, shared for the driver’s lifetime'],
          ['streaming', 'dma_map_single(), dma_map_sg()', 'one request’s buffers, mapped before the transfer, unmapped after']
        ], { mono: false });
        L.p('A streaming mapping names a direction: DMA_TO_DEVICE, DMA_FROM_DEVICE or DMA_BIDIRECTIONAL. The kernel uses it to decide what to do about the caches ([[ch:io-coherence]]).');
        L.quote('\tdma_handle = dma_map_single(dev, addr, size, direction);\n\tif (dma_mapping_error(dev, dma_handle)) {\n\t\t/*\n\t\t * reduce current DMA mapping usage,\n\t\t * delay and try again later or\n\t\t * reset driver.\n\t\t */\n\t\tgoto map_error_handling;\n\t}\n\nand to unmap it::\n\n\tdma_unmap_single(dev, dma_handle, size, direction);', { cite: 'Documentation/core-api/dma-api-howto.rst, “Using Streaming DMA mappings”, Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('The mapping can fail, for example when an IOMMU runs out of address space, so it must be checked. Between map and unmap, the buffer belongs to the device.');
      } },
      { id: 'odirect', title: 'O_DIRECT: the program’s own buffer', body: function (L) {
        L.p('The measured reads use O_DIRECT, which skips the page cache. The device writes straight into the program’s buffer:', ['pin']);
        L.out('io.buffer');
        L.quote(' * This takes either an iterator pointing to user memory, or one pointing to\n * kernel pages (BVEC iterator). If we\'re adding user pages, we pin them and\n * map them into the kernel. On IO completion, the caller should put those\n * pages.', { cite: 'block/bio.c, bio_iov_iter_get_pages(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('Pinning keeps frame 0x124451 in place until the read completes: reclaim may not take it ([[ch:vm-reclaim]]) and nothing may move it ([[ch:vm-buddy]]). No copy is made; 4 KiB arrive where the program will read them.');
        L.p('A request may be spread over many buffers: vda accepts up to 254 per request (max_segments in [[ch:io-block]]). A list of such pieces is a scatter-gather list.');
      } },
      { id: 'bypass', title: 'Machine B: no DMA mapping at all', body: function (L) {
        L.p('One feature bit decides whether virtio uses the DMA API. None of machine B’s devices offers it:');
        L.out('io.virtio', { wide: true });
        L.quote('static inline bool virtio_has_dma_quirk(const struct virtio_device *vdev)\n{\n\t/*\n\t * Note the reverse polarity of the quirk feature (compared to most\n\t * other features), this is for compatibility with legacy systems.\n\t */\n\treturn !virtio_has_feature(vdev, VIRTIO_F_ACCESS_PLATFORM);\n}', { cite: 'include/linux/virtio_config.h, Linux v6.18', label: 'Linux source', code: true });
        L.p('Without bit 33, virtio skips the DMA API and puts the buffer’s physical address straight into the descriptor:');
        L.quote('\tif (!vq->use_map_api) {\n…\n\t\t*addr = (dma_addr_t)sg_phys(sg);\n\t\treturn 0;\n\t}', { cite: 'drivers/virtio/virtio_ring.c, vring_map_one_sg(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.quote(' * @addr: buffer address (guest-physical)', { cite: 'include/uapi/linux/virtio_ring.h, struct vring_desc, Linux v6.18', label: 'Linux source', code: true });
        L.p('The trace of the read confirms it: not one DMA-mapping or bounce-buffer event fired.');
        L.out('io.dmacount');
        L.code('buffer frame 0x124451 → descriptor addr = 0x124451000 (guest-physical)', { lang: 'text', title: 'what the data descriptor held', label: 'Inference' });
        L.p('The host’s device code translates that guest-physical address into its own mapping of guest memory and writes the data there. A real device behind an IOMMU would get an IOVA instead ([[ch:io-iommu]]).');
      } }
    ],
    check: [
      { q: 'Why can’t a driver hand a device the buffer’s virtual address?', options: ['Devices do not use the CPU’s page tables; they need a bus (DMA) address', 'Virtual addresses are too long', 'The device would see the wrong process', 'Virtual addresses change every second'], answer: 0, why: 'DMA uses bus addresses: physical, or IOVAs translated by an IOMMU.' },
      { q: 'A driver allocates a ring shared with its device for its whole lifetime. Which call fits?', options: ['dma_alloc_coherent()', 'dma_map_single() for each access', 'kmalloc() and the virtual address', 'ioremap()'], answer: 0, why: 'Long-lived shared structures use coherent mappings; per-transfer buffers use streaming ones.' },
      { q: 'With O_DIRECT, where does the device write the data?', options: ['Into the program’s own buffer, which the kernel pins', 'Into the page cache, then a copy', 'Into a kernel bounce buffer always', 'Into the device’s BAR'], answer: 0, why: 'bio_iov_iter_get_pages() pins the user pages and the bio points at them.' },
      { q: 'Why did no dma_* event fire during machine B’s read?', options: ['The device did not offer VIRTIO_F_ACCESS_PLATFORM, so virtio bypasses the DMA API', 'Tracing was off', 'The read came from the page cache', 'The device has no DMA engine'], answer: 0, why: 'virtio_has_dma_quirk() is true, so vring_map_one_sg() uses sg_phys() directly.' }
    ],
    remember: [
      'Devices use bus (DMA) addresses: physical addresses, or IOVAs if an IOMMU translates.',
      'Coherent mappings last for the driver’s life (rings); streaming mappings cover one transfer and name a direction.',
      'dma_map_*() can fail and must be checked; between map and unmap the buffer belongs to the device.',
      'O_DIRECT pins the program’s pages and the device writes into them: no copy.',
      'virtio without VIRTIO_F_ACCESS_PLATFORM bypasses the DMA API and gives the device guest-physical addresses.'
    ],
    sources: [['Linux: Dynamic DMA mapping Guide (dma-api-howto.rst)', 'https://docs.kernel.org/core-api/dma-api-howto.html'], ['Linux v6.18: drivers/virtio/virtio_ring.c', 'https://github.com/torvalds/linux/blob/v6.18/drivers/virtio/virtio_ring.c'], ['Linux v6.18: block/bio.c', 'https://github.com/torvalds/linux/blob/v6.18/block/bio.c'], ['open(2): O_DIRECT', 'https://man7.org/linux/man-pages/man2/open.2.html']]
  });
})();
