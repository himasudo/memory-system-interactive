/* mlp.c - independent misses overlap; dependent ones do not.
   The same 1 GiB random pointer cycle as ladder.c, walked as 1, 2, 4, 8 or 16 separate chains at once.
   Within a chain each load's address comes from the previous load; different chains do not depend on
   each other, so the core can have one miss from each in flight at the same time.
   Usage: mlp               (pin it: taskset -c 0 ./mlp) */
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
    uint32_t *perm = malloc(n * sizeof *perm);
    for (size_t i = 0; i < n; i++) perm[i] = i;
    for (size_t i = n - 1; i > 0; i--) { size_t j = next() % i; uint32_t t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (size_t i = 0; i < n; i++) *(void **)(buf + (size_t)perm[i] * line) = buf + (size_t)perm[(i + 1) % n] * line;
    printf("1 GiB of lines in one random cycle, 2 MiB pages\n");
    printf("%7s %14s %16s\n", "chains", "ns per load", "loads per us");
    for (int k = 1; k <= 16; k *= 2) {
        void **p[16];
        for (int c = 0; c < k; c++) p[c] = (void **)(buf + (size_t)perm[(size_t)c * (n / k)] * line); /* starts far apart */
        size_t steps = 4000000 / k;
        double t0 = now();
        for (size_t i = 0; i < steps; i++)
            for (int c = 0; c < k; c++) p[c] = (void **)*p[c];
        double ns = (now() - t0) / ((double)steps * k);
        int sink = 0; for (int c = 0; c < k; c++) sink += p[c] != 0;
        printf("%7d %14.1f %16.1f%s\n", k, ns, 1000.0 / ns, sink ? "" : " ");
    }
    free(perm);
    return 0;
}
