/* chase.c - pointer chases that expose the TLB and the L1's set index.
   tlb  : one 8-byte node per 4 KiB page, each at a pseudo-random line of its page, random order.
          The same chase with 4 KiB pages and with 2 MiB pages: the difference is the time
          spent on TLB misses (page walks).
   vipt : one node per page, all at the same page offset (so all in one L1 set), against the
          same pages with nodes at different line positions.
   Each value: ns per hop over 4,000,000 hops after 1,000,000 warm-up hops, median of 9 runs.
   Build: gcc -O2 -o chase chase.c      Run: taskset -c 0 ./chase tlb; taskset -c 0 ./chase vipt */
#include "../common/lab.h"

static uint64_t rng = 88172645463325252ull;
static uint64_t xr(void) { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return rng; }
static int cmpd(const void *a, const void *b) { double x = *(const double *)a, y = *(const double *)b; return (x > y) - (x < y); }

static double chase(void **start, long hops)
{
    void **p = start;
    for (long i = 0; i < 1000000; i++) p = (void **)*p;
    uint64_t t = now_ns();
    for (long i = 0; i < hops; i++) p = (void **)*p;
    uint64_t dt = now_ns() - t;
    if (p == NULL) printf("!");
    return (double)dt / hops;
}
/* link node[i] for i in a random cyclic order */
static void **build(char *base, long n, long stride, long (*off)(long))
{
    long *perm = malloc(n * sizeof(long));
    for (long i = 0; i < n; i++) perm[i] = i;
    for (long i = n - 1; i > 0; i--) { long j = xr() % (i + 1); long t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (long i = 0; i < n; i++) {
        void **a = (void **)(base + perm[i] * stride + off(perm[i]));
        void **b = (void **)(base + perm[(i + 1) % n] * stride + off(perm[(i + 1) % n]));
        *a = b;
    }
    void **s = (void **)(base + perm[0] * stride + off(perm[0]));
    free(perm);
    return s;
}
static long off_spread(long i) { return (i * 64) % 4096; }
/* a pseudo-random line in each page, so that with 2 MiB pages (physically contiguous) the lines
   still spread over all the L2's sets instead of repeating every 64 pages */
static long off_rand(long i) { uint64_t x = (uint64_t)i * 0x9E3779B97F4A7C15ull; return (long)((x >> 58) * 64); }
static long off_same(long i) { (void)i; return 0x140; }

static char *region(size_t bytes, int huge)
{
    size_t al = 2UL << 20, sz = (bytes + al - 1) & ~(al - 1);
    char *raw = mmap(NULL, sz + al, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    char *p = (char *)(((uintptr_t)raw + al - 1) & ~(al - 1));
    madvise(p, sz, huge ? MADV_HUGEPAGE : MADV_NOHUGEPAGE);
    memset(p, 0, sz); /* prefault */
    return p;
}
static double med(char *base, long n, long (*off)(long))
{
    double v[9];
    for (int r = 0; r < 9; r++) v[r] = chase(build(base, n, 4096, off), 4000000);
    qsort(v, 9, sizeof(double), cmpd);
    return v[4];
}

int main(int argc, char **argv)
{
    if (argc > 1 && !strcmp(argv[1], "vipt")) {
        static const long N[] = {8, 9, 10, 11, 12, 13, 14, 16, 24};
        char *b = region(32 * 4096, 0);
        printf("  pages   same offset (all in L1 set 5)   spread over line positions\n");
        for (unsigned k = 0; k < sizeof N / sizeof N[0]; k++)
            printf("  %5ld   %8.2f                         %8.2f\n", N[k], med(b, N[k], off_same), med(b, N[k], off_spread));
        return 0;
    }
    static const long KB[] = {64, 128, 256, 512, 1024, 2048, 4096, 6144, 8192, 16384, 32768, 65536, 131072, 262144};
    char *small = region(262144UL << 10, 0), *huge = region(262144UL << 10, 1);
    printf("  working set   pages (4 KiB)   ns/hop, 4 KiB pages   ns/hop, 2 MiB pages\n");
    for (unsigned k = 0; k < sizeof KB / sizeof KB[0]; k++) {
        long n = KB[k] / 4;
        printf("  %8ld KiB   %13ld   %19.2f   %19.2f\n", KB[k], n, med(small, n, off_rand), med(huge, n, off_rand));
    }
    FILE *f = fopen("/proc/self/smaps_rollup", "r");
    char line[256];
    while (f && fgets(line, sizeof line, f)) if (!strncmp(line, "AnonHugePages", 13)) printf("# %s", line);
    return 0;
}
