/* branch.c - the cost of mispredicted branches.
   Counts the bytes >= 128 in a 1 MiB array, once with the array sorted and once in random order.
   The compiler is kept from turning the if into branch-free code by an empty asm statement, so the
   loop really contains a conditional jump that depends on each byte.
   Usage: branch            (pin it: taskset -c 0 ./branch) */
#include "../common/lab.h"

static uint64_t rng = 2463534242ULL;
static uint32_t next(void) { rng ^= rng << 13; rng ^= rng >> 7; rng ^= rng << 17; return (uint32_t)rng; }
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e9 + t.tv_nsec; }
static int cmp(const void *a, const void *b) { return *(const unsigned char *)a - *(const unsigned char *)b; }

static long count(const unsigned char *d, long n)
{
    long c = 0;
    for (long i = 0; i < n; i++) {
        if (d[i] >= 128) {
            __asm__ volatile("" ::: "memory"); /* keep a real branch here */
            c++;
        }
    }
    return c;
}

int main(void)
{
    long n = 1 << 20, reps = 200;
    unsigned char *d = malloc(n);
    for (long i = 0; i < n; i++) d[i] = next() & 0xff;
    for (int pass = 0; pass < 2; pass++) {
        if (pass == 1) qsort(d, n, 1, cmp);
        long c = count(d, n); /* warm up */
        double t0 = now();
        for (long r = 0; r < reps; r++) c = count(d, n);
        double ns = (now() - t0) / ((double)n * reps);
        printf("%-7s data: %ld of %ld bytes are >= 128, %.2f ns per byte\n", pass ? "sorted" : "random", c, n, ns);
    }
    return 0;
}
