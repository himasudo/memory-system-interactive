/* ======================= Part VI · Devices and I/O, lessons 10, 11 and 13 ======================= */
(function () {
  'use strict';
  var d = App.gloss;
  d('bio', 'bio', 'The block layer’s description of one I/O: a device, a starting sector, a direction and a list of memory pieces. One or more bios make a request.');
  d('blkrq', 'request', 'What the block layer hands a driver: one or more bios for neighbouring sectors, with a tag that identifies it until it completes.');
  d('blkmq', 'blk-mq', 'The multi-queue block layer: per-CPU software queues feeding one or more hardware queues, each matching a submission queue of the device.');
  d('tag', 'tag', 'A small number naming an in-flight request in a hardware queue, 0 to 127 for vda. The number of tags caps how many requests the device may have at once.');
  d('sector', 'sector', 'The block layer’s unit of disk position: 512 bytes, whatever the device’s real block size.');
  d('sqe', 'SQE', 'Submission queue entry: a 64-byte request in io_uring’s submission ring, naming the operation, file, buffer, length, offset and a user_data tag.');
  d('cqe', 'CQE', 'Completion queue entry: io_uring’s answer to one SQE, 16 bytes holding the user_data tag and the result (bytes, or a negative error).');
  d('taskwork', 'task work', 'Work queued for a specific thread, run when that thread next enters or leaves the kernel. io_uring uses it to post completions from the submitter’s own thread.');

  /* ---------- VI.10 ---------- */
  App.lesson({
    id: 'io-block', short: 'The block layer', title: 'The block layer',
    lede: 'Between a file read and a device driver sits the block layer. It turns the read into a request, queues it per CPU, and hands it to the driver’s hardware queue.',
    know: ['The page cache holds file pages; O_DIRECT skips it ([[ch:vm-files]], [[ch:io-dma]]).', 'A virtio-blk request is a chain of descriptors in a virtqueue ([[ch:io-rings]]).'],
    learn: ['Follow a read from bio to request to driver', 'Explain blk-mq’s software queues, hardware queues and tags', 'Read a block trace line: device, flags, sector and size', 'Time the block layer’s part of one read'],
    sections: [
      { id: 'in', title: 'Two ways in', body: function (L) {
        L.p('A file read reaches the block layer only when the data is not already in memory:');
        L.table(['Read', 'What happens'], [
          ['buffered, page in the page cache', 'a copy from the page cache; the block layer is not involved ([[ch:vm-files]])'],
          ['buffered, page missing', 'the page cache allocates pages and reads them, with readahead, through the block layer'],
          ['O_DIRECT', 'the program’s own pages go to the block layer, pinned ([[ch:io-dma]])']
        ], { mono: false });
        L.p('The measured reads are O_DIRECT, so every one reaches the device. Each starts as a bio.', ['bio']);
      } },
      { id: 'bio', title: 'From bio to request', body: function (L) {
        L.p('The block layer turns bios into requests and keeps them in two kinds of queue:', ['blkrq', 'blkmq']);
        L.quote('blk-mq has two group of queues: software staging queues and hardware dispatch queues. When the request arrives at the block layer, it will try the shortest path possible: send it directly to the hardware queue. However, there are two cases that it might not do that: if there\'s an IO scheduler attached at the layer or if we want to try to merge requests. In both cases, requests will be sent to the software queue.', { cite: 'Documentation/block/blk-mq.rst, Linux v6.18', label: 'Linux source' });
        L.p('The trace shows the four steps for the measured read, each about a microsecond apart:');
        L.out('io.trace', { lines: [2, 3, 4, 5], wide: true });
        L.table(['Event', 'Means'], [
          ['block_bio_queue', 'a bio arrived for device 254,0 (vda)'],
          ['block_getrq', 'a request was allocated for it, with a tag'],
          ['block_rq_insert', 'the request went to the I/O scheduler'],
          ['block_rq_issue', 'the request was handed to the virtio-blk driver']
        ], { mono: false });
        L.p('The rest of each line: RS is a synchronous read, 19671040 + 8 is the start sector and the length in 512-byte sectors, 4096 the bytes, be,0,4 the I/O priority.', ['sector']);
        L.quote('\tcase REQ_OP_READ:\n\t\trwbs[i++] = \'R\';\n\t\tbreak;\n…\n\tif (opf & REQ_SYNC)\n\t\trwbs[i++] = \'S\';', { cite: 'kernel/trace/blktrace.c, blk_fill_rwbs(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.code('8 sectors × 512 bytes = 4096 bytes\n19671040 × 512 = 10071572480 bytes: 9.38 GiB into the disk, where the file system put the file’s block', { lang: 'text', title: 'arithmetic', label: 'Inference' });
      } },
      { id: 'queues', title: 'Queues, tags and the scheduler', body: function (L) {
        L.p('vda’s settings in sysfs:');
        L.out('io.queue', { wide: true });
        L.out('io.mq');
        L.p('vda has one hardware queue, fed by all four CPUs, with 128 tags: at most 128 requests in flight. The scheduler, mq-deadline, may hold up to 256 requests before that.', ['tag']);
        L.quote('[RW] If this option is \'1\', the block layer will migrate request completions to the cpu "group" that originally submitted the request. For some workloads this provides a significant reduction in CPU cycles due to caching effects.', { cite: 'Documentation/ABI/stable/sysfs-block, rq_affinity, Linux v6.18', label: 'Linux source' });
        L.p('rq_affinity is 1: completions run in the submitter’s CPU group. The trace showed the completion on CPU 3, where the interrupt arrived, and only the program’s wake-up went to CPU 0 ([[ch:io-irq]]).');
        L.p('io_poll is 0: vda has no polled queues, so completions always arrive by interrupt. A device with several hardware queues, such as an NVMe SSD, usually gets one per CPU and needs no sharing at all.');
      } },
      { id: 'time', title: 'The block layer’s share', body: function (L) {
        L.p('In the traced read, the block layer took 3 µs from bio to driver, and the request was then out for 41 µs:');
        L.table(['From', 'To', 'Time', 'Spent in'], [
          ['block_bio_queue 11 µs', 'block_rq_issue 14 µs', '3 µs', 'the block layer, with tracing on'],
          ['block_rq_issue 14 µs', 'interrupt 53 µs', '39 µs', 'the driver’s doorbell, then the device'],
          ['interrupt 53 µs', 'block_rq_complete 55 µs', '2 µs', 'the interrupt handler']
        ], { mono: false });
        L.p('The device’s 39 µs include everything the host did: reading the data and writing it into guest memory. On machine B that host work is most of a read.');
        L.p('The request entered the block layer from io_uring. That interface is next.');
      } }
    ],
    check: [
      { q: 'A buffered read finds its page in the page cache. What does the block layer do?', options: ['Nothing: the data is copied from the page cache', 'It issues a request anyway', 'It merges the read with others', 'It sends it to the scheduler only'], answer: 0, why: 'Only page-cache misses and O_DIRECT reads become bios.' },
      { q: 'A trace line says “254,0 RS 19671040 + 8”. How much data, and where?', options: ['8 sectors = 4 KiB, starting at sector 19671040 of device 254:0', '8 KiB at byte 19671040', '19671040 bytes at sector 8', '8 requests'], answer: 0, why: 'Sectors are 512 bytes; R = read, S = synchronous.' },
      { q: 'vda has 128 tags. What do they limit?', options: ['How many requests can be in flight in its hardware queue', 'How many files are open', 'How many CPUs may submit', 'The request size'], answer: 0, why: 'Each in-flight request holds a tag until it completes.' },
      { q: 'Why did the completion run on CPU 3, although the program ran on CPU 0?', options: ['The interrupt arrived on CPU 3, and rq_affinity = 1 allows completion in the submitter’s CPU group', 'CPU 0 was offline', 'The scheduler moved the program', 'Completions always run on CPU 3'], answer: 0, why: 'rq_affinity = 1 completes in the same group; only the wake-up needed CPU 0.' }
    ],
    remember: [
      'Only page-cache misses and O_DIRECT reads reach the block layer, as bios.',
      'blk-mq turns bios into requests: software queues per CPU, hardware queues per device queue, a tag per request in flight.',
      'Trace lines give device, flags (R read, W write, S sync), start sector and length in 512-byte sectors.',
      'vda: one hardware queue, 128 tags, mq-deadline, no polling.',
      'On machine B the block layer took about 3 µs of a read; the device and host took about 39 µs.'
    ],
    sources: [['Linux: Multi-Queue Block IO Queueing Mechanism (blk-mq)', 'https://docs.kernel.org/block/blk-mq.html'], ['Linux: sysfs-block ABI', 'https://docs.kernel.org/admin-guide/abi-stable.html'], ['Linux v6.18: kernel/trace/blktrace.c', 'https://github.com/torvalds/linux/blob/v6.18/kernel/trace/blktrace.c']]
  });

  /* ---------- VI.11 ---------- */
  App.lesson({
    id: 'io-uring', short: 'io_uring', title: 'io_uring',
    lede: 'io_uring is two rings shared between a program and the kernel. The program writes requests into one and reads results from the other, with one system call, or none, for many I/Os.',
    know: ['A ring has a producer and a consumer index, each with one writer ([[ch:io-rings]]).', 'Shared structures hold offsets, not pointers ([[ch:vm-alias]]).', 'O_DIRECT reads go from the device straight into the program’s buffer ([[ch:io-dma]]).'],
    learn: ['Set up io_uring with raw system calls, and read the offsets it returns', 'Fill a submission entry and publish it with a release store', 'Read the io_uring events in machine B’s trace', 'Say what SQPOLL, IOPOLL and registered buffers remove'],
    sections: [
      { id: 'setup', title: 'Two rings, one mapping', body: function (L) {
        L.p('io_uring_setup() creates the rings and returns where each field sits in them. The program maps them with mmap():', ['sqe', 'cqe']);
        L.out('io.ring', { wide: true });
        L.p('Everything is an offset from the mapping: the submission tail is at byte 4, the completion entries start at byte 64. The kernel maps the same frames at its own addresses, which is why pointers would not work ([[ch:vm-alias]]).');
        L.p('“one mapping: yes” is the IORING_FEAT_SINGLE_MMAP feature: both rings share one mapping. The 64-byte SQEs live in a second one.');
      } },
      { id: 'submit', title: 'Submitting a read', body: function (L) {
        L.p('oneread.c fills one SQE, adds it to the ring, and enters the kernel:');
        L.code('struct io_uring_sqe *e = &sqes[idx];\nmemset(e, 0, sizeof *e);\ne->opcode = IORING_OP_READ;\ne->fd = fd;\ne->addr = (uint64_t)(uintptr_t)buf;\ne->len = 4096;\ne->off = off;\ne->user_data = 0x2a;\nsq_array[idx] = idx;\n__atomic_store_n(sq_tail, tail + 1, __ATOMIC_RELEASE);\nif (syscall(__NR_io_uring_enter, ring_fd, 1, 1, IORING_ENTER_GETEVENTS, NULL, 0) < 0) { perror("io_uring_enter"); exit(1); }', { title: 'labruns/io/oneread.c, read_once() (excerpt)' });
        L.p('The release store makes the SQE visible before the new tail, the same rule as for any ring ([[ch:stores]]). io_uring_enter(fd, 1, 1, GETEVENTS) submits one entry and waits for one completion.');
        L.p('user_data is the program’s own tag, 0x2a here: the kernel copies it into the CQE so the program can match answers to requests.');
      } },
      { id: 'trace', title: 'What the kernel did', body: function (L) {
        L.p('The io_uring events of the traced read, around the block-layer events of [[ch:io-block]]:');
        L.out('io.trace', { lines: [0, 1, 11, 12, 13, 14, 15], wide: true });
        L.p('The submission ran inside the program’s system call, at 8 µs. The completion was posted at 100 µs, on CPU 0, right after the program woke.', ['taskwork']);
        L.p('The interrupt on CPU 3 did not write the CQE. Completing the read only queued task work for the program’s thread and woke it:');
        L.quote('\treq->io_task_work.func = io_req_rw_complete;\n\t__io_req_task_work_add(req, IOU_F_TWQ_LAZY_WAKE);', { cite: 'io_uring/rw.c, io_complete_rw(), Linux v6.18 (excerpt)', label: 'Linux source', code: true });
        L.p('So the CQE was written by the program’s own thread, in io_uring_task_work_run (count 1), and io_uring_enter returned at 102 µs.');
      } },
      { id: 'reap', title: 'Reaping the completion', body: function (L) {
        L.p('The program takes the CQE at the head of the completion ring, then advances the head:');
        L.code('unsigned head = *cq_head;\nwhile (head == __atomic_load_n(cq_tail, __ATOMIC_ACQUIRE)) {}\nint res = cqes[head & *cq_mask].res;\n__atomic_store_n(cq_head, head + 1, __ATOMIC_RELEASE);', { title: 'labruns/io/oneread.c, read_once() (excerpt)' });
        L.p('The acquire load pairs with the kernel’s release when it posted the CQE. The result was 4096: all bytes read.');
        L.out('io.stats', { lines: [0] });
      } },
      { id: 'more', title: 'Removing the remaining costs', body: function (L) {
        L.p('One read still cost a system call, an interrupt and a wake-up. io_uring can remove each of them:');
        L.quote('When this flag is specified, a kernel thread is created to perform submission queue polling. An io_uring instance configured in this way enables an application to issue I/O without ever context switching into the kernel.', { cite: 'io_uring_setup(2), IORING_SETUP_SQPOLL', label: 'Specification', src: ['io_uring_setup(2)', 'https://man7.org/linux/man-pages/man2/io_uring_setup.2.html'] });
        L.quote('Perform busy-waiting for an I/O completion, as opposed to getting notifications via an asynchronous IRQ (Interrupt Request). The file system (if any) and block device must support polling in order for this to work.', { cite: 'io_uring_setup(2), IORING_SETUP_IOPOLL', label: 'Specification' });
        L.quote('The buffers associated with the iovecs will be locked in memory and charged against the user\'s RLIMIT_MEMLOCK resource limit.', { cite: 'io_uring_register(2), IORING_REGISTER_BUFFERS', label: 'Specification', src: ['io_uring_register(2)', 'https://man7.org/linux/man-pages/man2/io_uring_register.2.html'] });
        L.table(['Option', 'Removes', 'Costs'], [
          ['SQPOLL', 'the system call per submission', 'a kernel thread busy polling the ring'],
          ['IOPOLL', 'the interrupt and the wake-up', 'a CPU polling the device; vda has no poll queues (io_poll = 0)'],
          ['registered buffers', 'pinning the buffer on every I/O', 'memory locked for as long as it is registered']
        ], { mono: false });
        L.p('The lab below follows one read through io_uring and an NVMe queue, with these options switched on and off.');
        L.lab(function (el) { App.AdvancedUI.labs.uring(el); });
      } }
    ],
    check: [
      { q: 'Why does io_uring_setup() return offsets instead of pointers?', options: ['The program and the kernel map the rings at different addresses', 'Offsets are shorter', 'Pointers are not allowed in C', 'The rings move every second'], answer: 0, why: 'One frame, two virtual addresses: only offsets from each side’s base work for both.' },
      { q: 'Why is the SQ tail written with a release store?', options: ['So the SQE is visible before the kernel sees the new tail', 'To make the write faster', 'To flush the cache', 'Because the kernel writes it too'], answer: 0, why: 'Write the entry, then publish the index: the release orders the two.' },
      { q: 'In machine B’s trace, who wrote the CQE?', options: ['The program’s own thread on CPU 0, through task work after it woke', 'The interrupt handler on CPU 3', 'The device, by DMA', 'A kernel polling thread'], answer: 0, why: 'io_uring_complete and io_uring_task_work_run ran on CPU 0 after the program was switched back in.' },
      { q: 'Which option removes the completion interrupt?', options: ['IORING_SETUP_IOPOLL', 'IORING_SETUP_SQPOLL', 'Registered buffers', 'IORING_FEAT_SINGLE_MMAP'], answer: 0, why: 'IOPOLL busy-waits for completions instead of taking an interrupt; it needs a device with poll queues.' }
    ],
    remember: [
      'io_uring is a submission ring and a completion ring in memory shared with the kernel, found by offsets.',
      'An SQE is 64 bytes: operation, file, buffer, length, offset and a user_data tag the CQE returns.',
      'Write the SQE, then publish the tail with a release store; io_uring_enter() submits and can wait.',
      'On machine B the CQE was posted by the program’s own thread, through task work, after the wake-up.',
      'SQPOLL removes system calls, IOPOLL removes interrupts, registered buffers remove per-I/O pinning.'
    ],
    sources: [['io_uring_setup(2)', 'https://man7.org/linux/man-pages/man2/io_uring_setup.2.html'], ['io_uring_enter(2)', 'https://man7.org/linux/man-pages/man2/io_uring_enter.2.html'], ['io_uring_register(2)', 'https://man7.org/linux/man-pages/man2/io_uring_register.2.html'], ['Linux v6.18: include/uapi/linux/io_uring.h', 'https://github.com/torvalds/linux/blob/v6.18/include/uapi/linux/io_uring.h']]
  });

  /* ---------- VI.13 ---------- */
  var READ_ROWS = [
    { k: 'program (CPU 0)', v: 'io_uring_enter()', d: 'one 4 KiB read at offset 1 MiB' },
    { k: 'io_uring', v: '', d: '' },
    { k: 'block layer', v: '', d: '' },
    { k: 'driver and doorbell', v: '', d: '' },
    { k: 'device (host)', v: '', d: '' },
    { k: 'interrupt (CPU 3)', v: '', d: '' },
    { k: 'scheduler', v: '', d: '' }
  ];
  var READ_STEPS = [
    { t: '0 µs · enter the kernel', d: 'The program has filled an SQE and called io_uring_enter(fd, 1, 1, GETEVENTS). The marker is written just before.', hot: [0] },
    { t: '8 µs · io_uring takes the SQE', d: 'io_uring_submit_req: opcode READ, user_data 0x2a. It issues the read on the file, which for O_DIRECT pins the buffer and builds a bio.', hot: [1], set: { 1: { v: 'submit_req', d: 'READ, user_data 0x2a' } } },
    { t: '11–14 µs · bio, request, scheduler, driver', d: 'block_bio_queue, block_getrq, block_rq_insert, block_rq_issue: 4 KiB at sector 19671040 of vda, a request with a tag, through mq-deadline, to virtio-blk.', hot: [2], set: { 2: { v: 'bio → request → issue', d: 'RS 19671040 + 8' } } },
    { t: '14 µs · descriptors and doorbell', d: 'virtio_queue_rq() writes a chain of three descriptors (header, buffer at guest-physical 0x124451000, status) and, if the device asked, writes the queue number to the doorbell. Not traced: an MMIO store that leaves the guest.', hot: [3], set: { 3: { v: '3 descriptors, 1 doorbell', d: 'buffer 0x124451000 (inferred)' } } },
    { t: '29 µs · the program sleeps', d: 'io_uring_enter waits for the completion; CPU 0 switches to its idle task.', hot: [0, 6], set: { 0: { v: 'sleeping', d: 'state S' }, 6: { v: 'CPU 0 idle', d: '' } } },
    { t: '14–53 µs · the device works', d: 'The host’s device code reads the 4 KiB and writes them into guest frame 0x124451, then the status byte and a used-ring entry. 39 µs that the guest cannot see into.', hot: [4], set: { 4: { v: 'read, write data, used ring', d: '39 µs' } } },
    { t: '53 µs · MSI-X on CPU 3', d: 'The device’s interrupt for virtio1-req.0 arrives on CPU 3, its effective affinity. The handler runs for 2 µs: virtio-blk takes the used entry and completes the request (block_rq_complete at 55 µs).', hot: [5, 2], set: { 5: { v: 'irq 37 virtio1-req.0', d: 'handler 2 µs' }, 2: { v: 'rq_complete', d: '55 µs' } } },
    { t: '56 µs · wake CPU 0', d: 'Completing the read queues io_uring task work for the program and wakes it: CPU 3 sends an inter-processor interrupt to CPU 0.', hot: [5, 6], set: { 6: { v: 'IPI to CPU 0', d: 'ttwu_queue_wakelist' } } },
    { t: '98 µs · the program runs again', d: 'CPU 0 handles the wake-up 42 µs after the interrupt was sent: it was idle, and in this run waking it took longer than the device did.', hot: [6, 0], set: { 6: { v: 'sched_wakeup, switch', d: '98–99 µs' }, 0: { v: 'running', d: '' } } },
    { t: '100 µs · the CQE', d: 'In the program’s own thread, task work posts the CQE: result 4096, user_data 0x2a.', hot: [1], set: { 1: { v: 'io_uring_complete', d: 'result 4096' } } },
    { t: '102 µs · back in the program', d: 'io_uring_enter returns; the program reads the CQE and advances the completion head. The data is already in its buffer.', hot: [0], set: { 0: { v: 'returned 4096', d: '102 µs in all' } } }
  ];
  App.lesson({
    id: 'io-review', short: 'One read, end to end', title: 'One 4 KiB read, end to end',
    lede: 'One read from machine B’s disk, from io_uring_enter() to the completion, with every step this part described and the time it took.',
    know: ['Doorbells, rings and descriptors ([[ch:io-rings]]).', 'Interrupts and wake-ups ([[ch:io-irq]]).', 'The block layer and io_uring ([[ch:io-block]], [[ch:io-uring]]).'],
    learn: ['Follow one read through io_uring, the block layer, the driver, the device and the interrupt', 'Split its time between the kernel, the device and the wake-up', 'Say what changes on an NVMe drive, with an IOMMU or with polling', 'Run the measurement on your own machine'],
    sections: [
      { id: 'steps', title: 'The read, step by step', body: function (L) {
        L.p('Every number below comes from the trace of the traced read on machine B:');
        L.out('io.trace', { wide: true });
        L.try('Follow the read', 'Times are from the trace; the descriptor contents are inferred from the driver code and the buffer’s frame.', function (el) { App.LW.stepRows(el, READ_ROWS, READ_STEPS); });
        L.p('Three CPUs took part: CPU 0 for the program’s system call, a host CPU for the device code, and CPU 3 for the interrupt. The 4 KiB moved once, by the device, with no copy.');
      } },
      { id: 'budget', title: 'Where the 102 µs went', body: function (L) {
        L.p('Split by phase, the traced read looks like this:');
        L.table(['Phase', 'Time', 'Lesson'], [
          ['0–14 µs: submission through io_uring, the block layer, the driver and the doorbell', '14 µs', '[[ch:io-uring]], [[ch:io-block]], [[ch:io-rings]]'],
          ['14–53 µs: the device, in the host', '39 µs', '[[ch:io-paths]]'],
          ['53–56 µs: interrupt and completion', '3 µs', '[[ch:io-irq]]'],
          ['56–98 µs: waking the idle CPU 0', '42 µs', '[[ch:io-irq]]'],
          ['98–102 µs: CQE and return', '4 µs', '[[ch:io-uring]]']
        ], { mono: false });
        L.p('Untraced, the same reads took a median of 40.9 µs:');
        L.out('io.stats', { lines: [1] });
        L.p('So the traced read was slow mostly in its wake-up, and tracing adds to the kernel steps. Typical reads spend most of their time in the device (Inference from the two runs).');
      } },
      { id: 'other', title: 'The same read elsewhere', body: function (L) {
        L.p('On other machines one step or another changes:');
        L.table(['If', 'then'], [
          ['the disk is an NVMe SSD', 'the doorbell reaches real hardware, which fetches the command by DMA and reads flash ([[ch:dev]])'],
          ['an IOMMU sits in front of the device', 'the buffer gets an IOVA, and every unmap invalidates the IOTLB ([[ch:io-iommu]])'],
          ['the device is not cache-coherent (some Arm systems)', 'the DMA API cleans and invalidates the buffer’s lines around the transfer ([[ch:io-coherence]])'],
          ['the page is already in the page cache', 'a buffered read copies it and no device is involved ([[ch:vm-files]])'],
          ['io_uring uses IOPOLL on a device with poll queues', 'no interrupt and no wake-up: the program’s CPU polls ([[ch:io-irq]])'],
          ['io_uring uses SQPOLL', 'no system call: a kernel thread picks up the SQE ([[ch:io-uring]])']
        ], { mono: false });
        L.p('[[ch:dev]] steps through the NVMe version of this read in the example machine.');
      } },
      { id: 'run', title: 'Run it on your machine', body: function (L) {
        L.p('The Part VI runs come from <code>labruns/io/</code>. They need root, gcc, python3 and tracefs, and only read: configuration space is never written, and the reads go to a 4 MiB file the script creates:');
        L.code('sudo sh labruns/io/run_all.sh /tmp/lab    # /tmp/lab must be on a virtio or NVMe disk', { lang: 'sh', title: 'from the repository root' });
        L.p('On real hardware the device time drops or grows with the drive, and the doorbell no longer leaves a guest. Part VII puts this read together with everything else: [[ch:e2e]].');
      } }
    ],
    check: [
      { q: 'Which phase took longest in the traced read?', options: ['Waking the idle CPU 0 (42 µs), just ahead of the device (39 µs)', 'The block layer', 'The interrupt handler', 'Posting the CQE'], answer: 0, why: '56 → 98 µs for the wake-up; 14 → 53 µs for the device.' },
      { q: 'Which CPU ran the interrupt handler, and which posted the CQE?', options: ['CPU 3 ran the handler; CPU 0 posted the CQE in the program’s thread', 'CPU 0 did both', 'CPU 3 did both', 'The device posted the CQE'], answer: 0, why: 'irq_handler_entry on cpu003; io_uring_complete on cpu000 after the wake-up.' },
      { q: 'How did the 4 KiB reach the program’s buffer?', options: ['The device wrote them straight into the pinned buffer (frame 0x124451)', 'The CPU copied them from the page cache', 'Through a bounce buffer', 'In the CQE'], answer: 0, why: 'O_DIRECT pins the user pages; virtio gives the device their guest-physical address.' }
    ],
    remember: [
      'One read: SQE → io_uring → bio → request → descriptors → doorbell → device → used ring → MSI-X → completion → wake-up → CQE.',
      'On machine B: about 14 µs to submit (traced), 39 µs in the device, 3 µs of interrupt, 4 µs to return.',
      'The wake-up of an idle CPU can cost as much as the device; polling removes it.',
      'The data moved once, from the device into the program’s pinned buffer.',
      'NVMe, IOMMUs, non-coherent devices, the page cache and polling each change one step.'
    ],
    sources: [['labruns/io: the programs and their outputs', 'https://github.com/himasudo/memory-system-interactive/tree/lessons/labruns/io'], ['Linux: blk-mq', 'https://docs.kernel.org/block/blk-mq.html'], ['io_uring_enter(2)', 'https://man7.org/linux/man-pages/man2/io_uring_enter.2.html']]
  });
})();
