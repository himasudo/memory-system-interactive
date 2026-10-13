/* oneread.c - one 4 KiB read from a file on a virtio disk, through io_uring with O_DIRECT (no
   page cache), traced from the system call to the completion. Raw system calls, no liburing.
   1. io_uring_setup with 4 entries; print the ring offsets the kernel returns.
   2. Map the submission ring, the completion ring and the SQE array.
   3. Traced: one IORING_OP_READ of 4096 bytes at offset 1 MiB into a page-aligned buffer, then
      io_uring_enter(fd, 1, 1, IORING_ENTER_GETEVENTS). Prints the buffer's frame (the device
      writes there) and the completion.
   4. Not traced: 1000 more reads at pseudo-random 4 KiB offsets; time per read.
   The file's contents are never printed. run_all.sh creates the file, sets up the trace events
   and filters; this program only switches tracing on and off around step 3 and writes markers.
   Build: gcc -O2 -o oneread oneread.c      Run as root: ./oneread FILE */
#include "../common/lab.h"
#include <linux/io_uring.h>
#include <sys/syscall.h>

static int ring_fd;
static unsigned *sq_tail, *sq_mask, *sq_array, *cq_head, *cq_tail, *cq_mask;
static struct io_uring_sqe *sqes;
static struct io_uring_cqe *cqes;

static int cmpu(const void *a, const void *b) { uint64_t x = *(const uint64_t *)a, y = *(const uint64_t *)b; return (x > y) - (x < y); }

/* queue one read, enter the kernel, take the completion; returns the result (bytes or -errno) */
static int read_once(int fd, void *buf, uint64_t off)
{
    unsigned tail = *sq_tail, idx = tail & *sq_mask;
    struct io_uring_sqe *e = &sqes[idx];
    memset(e, 0, sizeof *e);
    e->opcode = IORING_OP_READ;
    e->fd = fd;
    e->addr = (uint64_t)(uintptr_t)buf;
    e->len = 4096;
    e->off = off;
    e->user_data = 0x2a;
    sq_array[idx] = idx;
    __atomic_store_n(sq_tail, tail + 1, __ATOMIC_RELEASE);
    if (syscall(__NR_io_uring_enter, ring_fd, 1, 1, IORING_ENTER_GETEVENTS, NULL, 0) < 0) { perror("io_uring_enter"); exit(1); }
    unsigned head = *cq_head;
    while (head == __atomic_load_n(cq_tail, __ATOMIC_ACQUIRE)) {}
    int res = cqes[head & *cq_mask].res;
    __atomic_store_n(cq_head, head + 1, __ATOMIC_RELEASE);
    return res;
}

int main(int argc, char **argv)
{
    const char *path = argc > 1 ? argv[1] : "/home/lab/disk.bin";
    int fd = open(path, O_RDONLY | O_DIRECT);
    if (fd < 0) { perror(path); return 1; }
    uint64_t size = lseek(fd, 0, SEEK_END);

    struct io_uring_params p;
    memset(&p, 0, sizeof p);
    ring_fd = syscall(__NR_io_uring_setup, 4, &p);
    if (ring_fd < 0) { perror("io_uring_setup"); return 1; }
    size_t sq_sz = p.sq_off.array + p.sq_entries * sizeof(unsigned);
    size_t cq_sz = p.cq_off.cqes + p.cq_entries * sizeof(struct io_uring_cqe);
    if ((p.features & IORING_FEAT_SINGLE_MMAP) && cq_sz > sq_sz) sq_sz = cq_sz;
    char *sq = mmap(NULL, sq_sz, PROT_READ | PROT_WRITE, MAP_SHARED | MAP_POPULATE, ring_fd, IORING_OFF_SQ_RING);
    char *cq = (p.features & IORING_FEAT_SINGLE_MMAP) ? sq :
               mmap(NULL, cq_sz, PROT_READ | PROT_WRITE, MAP_SHARED | MAP_POPULATE, ring_fd, IORING_OFF_CQ_RING);
    sqes = mmap(NULL, p.sq_entries * sizeof(struct io_uring_sqe), PROT_READ | PROT_WRITE, MAP_SHARED | MAP_POPULATE, ring_fd, IORING_OFF_SQES);
    if (sq == MAP_FAILED || cq == MAP_FAILED || sqes == MAP_FAILED) { perror("mmap"); return 1; }
    sq_tail = (unsigned *)(sq + p.sq_off.tail); sq_mask = (unsigned *)(sq + p.sq_off.ring_mask);
    sq_array = (unsigned *)(sq + p.sq_off.array);
    cq_head = (unsigned *)(cq + p.cq_off.head); cq_tail = (unsigned *)(cq + p.cq_off.tail);
    cq_mask = (unsigned *)(cq + p.cq_off.ring_mask); cqes = (struct io_uring_cqe *)(cq + p.cq_off.cqes);

    printf("io_uring_setup(4) = fd %d: %u submission entries, %u completion entries\n", ring_fd, p.sq_entries, p.cq_entries);
    printf("sq_off: head %u  tail %u  ring_mask %u  ring_entries %u  flags %u  dropped %u  array %u\n",
           p.sq_off.head, p.sq_off.tail, p.sq_off.ring_mask, p.sq_off.ring_entries, p.sq_off.flags, p.sq_off.dropped, p.sq_off.array);
    printf("cq_off: head %u  tail %u  ring_mask %u  ring_entries %u  overflow %u  cqes %u  flags %u\n",
           p.cq_off.head, p.cq_off.tail, p.cq_off.ring_mask, p.cq_off.ring_entries, p.cq_off.overflow, p.cq_off.cqes, p.cq_off.flags);
    printf("rings mapped at %p (one mapping: %s), SQEs at %p, %zu bytes each\n", (void *)sq,
           (p.features & IORING_FEAT_SINGLE_MMAP) ? "yes" : "no", (void *)sqes, sizeof(struct io_uring_sqe));

    char *buf = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS | MAP_POPULATE, -1, 0);
    buf[0] = 1;
    printf("buffer at %p, frame 0x%llx\n", (void *)buf, (unsigned long long)(pagemap(buf) & ((1ULL << 55) - 1)));

    /* warm up the path once (first use of the ring, the file and the buffer), untraced */
    if (read_once(fd, buf, 0) != 4096) { fprintf(stderr, "warm-up read failed\n"); return 1; }

    tr_write("tracing_on", "1");
    tr_mark("== io_uring_enter: submit one 4 KiB read at offset 1 MiB, wait for it");
    uint64_t t0 = now_ns();
    int res = read_once(fd, buf, 1 << 20);
    uint64_t t1 = now_ns();
    tr_mark("== io_uring_enter returned %d", res);
    tr_write("tracing_on", "0");
    printf("traced read: result %d, %.1f us from submission to completion\n", res, (t1 - t0) / 1000.0);

    enum { N = 1000 };
    static uint64_t ns[N];
    uint64_t pages = size / 4096, x = 88172645463325252ull;
    for (int i = 0; i < N; i++) {
        x ^= x << 13; x ^= x >> 7; x ^= x << 17;
        uint64_t off = (x % pages) * 4096, t = now_ns();
        if (read_once(fd, buf, off) != 4096) { fprintf(stderr, "read failed\n"); return 1; }
        ns[i] = now_ns() - t;
    }
    qsort(ns, N, sizeof ns[0], cmpu);
    printf("%d more reads at random 4 KiB offsets of the %llu-KiB file, us per read: min %.1f  median %.1f  99th percentile %.1f  max %.1f\n",
           N, (unsigned long long)(size >> 10), ns[0] / 1000.0, ns[N / 2] / 1000.0, ns[N * 99 / 100] / 1000.0, ns[N - 1] / 1000.0);
    return 0;
}
