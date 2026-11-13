/* seq.c - the same lines read in address order and in random order, with and without dependence.
   1 GiB buffer, one 8-byte load per 64-byte line, 2 MiB pages.
   "independent": the line numbers come from an array, so loads do not wait for each other.
   "dependent":   each line holds the address of the next one, so each load waits for the previous.
   Only the order changes between the address-order and random-order runs; the difference comes from
   what the hardware can guess (prefetchers) and from DRAM rows.
   Usage: seq              (pin it: taskset -c 0 ./seq) */
#include "../common/lab.h"

static uint64_t rng = 88172645463325252ULL;
static uint64_t next(void) { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return rng; }
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e9 + t.tv_nsec; }

int main(void)
{
    size_t bytes = 1UL << 30, line = 64, n = bytes / line;
    char *buf = mmap(NULL, bytes + (2UL << 20), PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (buf == MAP_FAILED) { perror("mmap"); return 1; }
    buf = (char *)(((uintptr_t)buf + (2UL << 20) - 1) & ~((2UL << 20) - 1));
    madvise(buf, bytes, MADV_HUGEPAGE);
    memset(buf, 1, bytes);
    uint32_t *order = malloc(n * sizeof *order);
    printf("1 GiB, one 8-byte load per 64-byte line, 2 MiB pages\n");
    printf("%-12s %-14s %12s\n", "loads", "order", "ns per line");
    for (int shuffled = 0; shuffled < 2; shuffled++) {
        for (size_t i = 0; i < n; i++) order[i] = i;
        if (shuffled)
            for (size_t i = n - 1; i > 0; i--) { size_t j = next() % i; uint32_t t = order[i]; order[i] = order[j]; order[j] = t; } /* one cycle */
        /* independent loads: the next line number comes from the array */
        uint64_t sum = 0;
        double ns = 0;
        for (int rep = 0; rep < 2; rep++) {
            double t0 = now();
            for (size_t i = 0; i < n; i++) sum += *(volatile uint64_t *)(buf + (size_t)order[i] * line);
            ns = (now() - t0) / n;
        }
        printf("%-12s %-14s %12.1f%s\n", "independent", shuffled ? "random" : "address", ns, sum ? "" : " ");
        /* dependent loads: each line points to the next line in the same order */
        for (size_t i = 0; i < n; i++) *(void **)(buf + (size_t)order[i] * line) = buf + (size_t)order[(i + 1) % n] * line;
        void **p = (void **)(buf + (size_t)order[0] * line);
        size_t hops = shuffled ? 4000000 : n;
        for (size_t i = 0; i < hops; i++) p = (void **)*p; /* warm-up pass */
        double t0 = now();
        for (size_t i = 0; i < hops; i++) p = (void **)*p;
        ns = (now() - t0) / hops;
        printf("%-12s %-14s %12.1f%s\n", "dependent", shuffled ? "random" : "address", ns, p ? "" : " ");
    }
    return 0;
}
