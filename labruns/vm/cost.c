/* cost.c - what page faults cost, and how to move them out of the way.
   1. page tables: VmPTE before and after touching 64 MiB, and after munmap
   2. fault counts: first and second pass; a load pass then a store pass
   3. prefaulting with MADV_POPULATE_WRITE
   4. time per fault, 21 samples, each on a fresh 64 MiB mapping (mmap/munmap not timed):
      small pages (MADV_NOHUGEPAGE) and transparent huge pages (MADV_HUGEPAGE)
   Build: gcc -O2 -o cost cost.c      Run: taskset -c 0 ./cost */
#include "../common/lab.h"

#define SZ (64UL << 20)
#define PG 4096UL

static char *map64(int huge)
{
    /* over-allocate so the region can start on a 2 MiB boundary */
    char *raw = mmap(NULL, SZ + (2UL << 20), PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    char *p = (char *)(((uintptr_t)raw + (2UL << 20) - 1) & ~((2UL << 20) - 1));
    if (p > raw) munmap(raw, p - raw);
    munmap(p + SZ, (raw + SZ + (2UL << 20)) - (p + SZ));
    madvise(p, SZ, huge ? MADV_HUGEPAGE : MADV_NOHUGEPAGE);
    return p;
}
static void store_pass(volatile char *p, char v) { for (unsigned long o = 0; o < SZ; o += PG) p[o] = v; }
static long load_pass(volatile char *p) { long s = 0; for (unsigned long o = 0; o < SZ; o += PG) s += p[o]; return s; }
static int cmp(const void *a, const void *b) { double x = *(const double *)a, y = *(const double *)b; return (x > y) - (x < y); }

int main(void)
{
    long f;
    uint64_t t;
    /* first calls of the clock, madvise and getrusage fault on their own; do them now */
    (void)now_ns(); (void)faults(); madvise(NULL, 0, MADV_NORMAL); (void)status_kb("VmPTE");

    printf("== 1. page tables for 64 MiB (small pages)\n");
    char *p = map64(0);
    long before = status_kb("VmPTE");
    store_pass(p, 1);
    long after = status_kb("VmPTE");
    munmap(p, SZ);
    printf("VmPTE before %ld kB, after one store per 4 KiB page %ld kB, after munmap %ld kB\n", before, after, status_kb("VmPTE"));

    printf("\n== 2. fault counts, 64 MiB, one access per 4 KiB page\n");
    p = map64(0);
    f = faults(); store_pass(p, 1); printf("first store pass   faults %ld\n", faults() - f);
    f = faults(); store_pass(p, 2); printf("second store pass  faults %ld\n", faults() - f);
    munmap(p, SZ);
    p = map64(0);
    f = faults(); (void)load_pass(p); printf("load pass (fresh)  faults %ld\n", faults() - f);
    f = faults(); store_pass(p, 1); printf("then a store pass  faults %ld\n", faults() - f);
    munmap(p, SZ);

    printf("\n== 3. prefaulting with madvise(MADV_POPULATE_WRITE), 64 MiB, small pages\n");
    p = map64(0);
    f = faults(); t = now_ns();
    madvise(p, SZ, MADV_POPULATE_WRITE);
    printf("faults inside madvise %ld (%.1f ms)\n", faults() - f, (now_ns() - t) / 1e6);
    f = faults(); t = now_ns();
    store_pass(p, 1);
    printf("faults during the store pass %ld (%.2f ms)\n", faults() - f, (now_ns() - t) / 1e6);
    munmap(p, SZ);

    printf("\n== 4. time per fault, 21 samples, fresh 64 MiB each, one store per 4 KiB page\n");
    for (int huge = 0; huge <= 1; huge++) {
        double perf[21], permib[21];
        long nf = 0;
        for (int s = 0; s < 21; s++) {
            p = map64(huge);
            f = faults(); t = now_ns();
            store_pass(p, 1);
            uint64_t dt = now_ns() - t;
            nf = faults() - f;
            perf[s] = (double)dt / nf;
            permib[s] = (double)dt / 64;
            munmap(p, SZ);
        }
        qsort(perf, 21, sizeof(double), cmp);
        qsort(permib, 21, sizeof(double), cmp);
        printf("%-11s %5ld faults per sample; ns per fault min %.0f, median %.0f, max %.0f; median per MiB %.0f ns\n",
               huge ? "huge pages" : "small pages", nf, perf[0], perf[10], perf[20], permib[10]);
    }
    p = map64(1);
    store_pass(p, 1);
    FILE *sm = fopen("/proc/self/smaps_rollup", "r");
    char line[256];
    while (sm && fgets(line, sizeof line, sm)) if (!strncmp(line, "AnonHugePages", 13)) printf("huge-page region after one pass: %s", line);
    printf("first pfn of the huge-page region: 0x%llx\n", (unsigned long long)(pagemap(p) & ((1ULL << 55) - 1)));
    return 0;
}
