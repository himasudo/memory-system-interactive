/* ladder.c - load-to-use latency for working sets from 16 KiB to 2 GiB.
   One pointer per 64-byte line, linked in a random cycle, so each load's address comes from the
   previous load and no prefetcher can guess the next line. The buffer asks for 2 MiB transparent
   huge pages, so large working sets do not also measure TLB misses.
   Usage: ladder            (pin it: taskset -c 0 ./ladder) */
#include "../common/lab.h"

static uint64_t rng = 88172645463325252ULL;
static uint64_t next(void) { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return rng; }
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e9 + t.tv_nsec; }

int main(void)
{
    size_t max = 2UL << 30, line = 64;
    char *buf = mmap(NULL, max + (2UL << 20), PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (buf == MAP_FAILED) { perror("mmap"); return 1; }
    buf = (char *)(((uintptr_t)buf + (2UL << 20) - 1) & ~((2UL << 20) - 1));
    madvise(buf, max, MADV_HUGEPAGE);
    memset(buf, 1, max);
    long thp = status_kb("AnonHugePages");
    if (thp < 0) { /* smaps_rollup has it on this kernel */
        char l[256]; FILE *f = fopen("/proc/self/smaps_rollup", "r");
        while (f && fgets(l, sizeof l, f)) if (!strncmp(l, "AnonHugePages:", 14)) thp = atol(l + 14);
        if (f) fclose(f);
    }
    printf("buffer: %zu MiB, of which %ld MiB in 2 MiB pages\n", max >> 20, thp / 1024);
    printf("%10s %12s\n", "working set", "ns per load");
    static const size_t kib[] = {16, 32, 48, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768,
                                 65536, 131072, 262144, 524288, 1048576, 2097152};
    for (size_t k = 0; k < sizeof kib / sizeof kib[0]; k++) {
        size_t bytes = kib[k] << 10, n = bytes / line;
        uint32_t *perm = malloc(n * sizeof *perm);
        for (size_t i = 0; i < n; i++) perm[i] = i;
        for (size_t i = n - 1; i > 0; i--) { size_t j = next() % i; uint32_t t = perm[i]; perm[i] = perm[j]; perm[j] = t; } /* one cycle */
        for (size_t i = 0; i < n; i++) *(void **)(buf + (size_t)perm[i] * line) = buf + (size_t)perm[(i + 1) % n] * line;
        free(perm);
        void **p = (void **)buf;
        size_t warm = n < 4000000 ? n : 4000000;
        for (size_t i = 0; i < warm; i++) p = (void **)*p;
        size_t hops = 20000000;
        double t0 = now();
        for (size_t i = 0; i < hops; i++) p = (void **)*p;
        double ns = (now() - t0) / hops;
        char label[32];
        if (kib[k] >= 1048576) snprintf(label, sizeof label, "%zu GiB", kib[k] >> 20);
        else if (kib[k] >= 1024) snprintf(label, sizeof label, "%zu MiB", kib[k] >> 10);
        else snprintf(label, sizeof label, "%zu KiB", kib[k]);
        printf("%10s %12.1f%s\n", label, ns, p ? "" : " ");
    }
    return 0;
}
