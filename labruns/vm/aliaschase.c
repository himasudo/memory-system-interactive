/* aliaschase.c - does a load cost more when its line was last loaded through another alias?
   One 4 KiB memfd page is mapped twice (views A and B). Each of its 64 lines holds two nodes,
   one at byte 0 and one at byte 8. Two pointer chases visit the same 128 nodes in the same
   random order:
     one view : every node is reached through view A
     two views: byte-0 nodes are reached through view A and byte-8 nodes through view B, so
                each line is loaded alternately through A and through B
   Both chases touch the same 64 lines of one frame, which stay in the L1.
   Each value: ns per hop over 20,000,000 hops after 1,000,000 warm-up hops; 9 runs.
   Build: gcc -O2 -o aliaschase aliaschase.c      Run as root: taskset -c 0 ./aliaschase */
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

/* node k (0..127) is line k/2, byte (k%2)*8; reached through view b for odd k if two views */
static void **build(char *a, char *b, const int *perm, int two)
{
    void **first = NULL;
    for (int i = 0; i < 128; i++) {
        int k = perm[i], n = perm[(i + 1) % 128];
        char *vk = (two && (k & 1)) ? b : a, *vn = (two && (n & 1)) ? b : a;
        void **here = (void **)(vk + (k >> 1) * 64 + (k & 1) * 8);
        *here = (void *)(vn + (n >> 1) * 64 + (n & 1) * 8);
        if (i == 0) first = here;
    }
    return first;
}

int main(void)
{
    int fd = memfd_create("one-frame", 0);
    if (fd < 0 || ftruncate(fd, 4096)) { perror("memfd"); return 1; }
    char *a = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    char *b = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    a[0] = 1;
    if (*(volatile char *)b != 1) return 1;   /* fault view B in as well */
    printf("view A %p  view B %p  pagemap pfn: A 0x%llx  B 0x%llx\n", (void *)a, (void *)b,
           (unsigned long long)(pagemap(a) & ((1ULL << 55) - 1)), (unsigned long long)(pagemap(b) & ((1ULL << 55) - 1)));
    int perm[128];
    for (int i = 0; i < 128; i++) perm[i] = i;
    for (int i = 127; i > 0; i--) { int j = xr() % (i + 1); int t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    double v1[9], v2[9];
    for (int r = 0; r < 9; r++) {           /* interleave the two kinds of run */
        v1[r] = chase(build(a, b, perm, 0), 20000000);
        v2[r] = chase(build(a, b, perm, 1), 20000000);
    }
    qsort(v1, 9, sizeof(double), cmpd);
    qsort(v2, 9, sizeof(double), cmpd);
    printf("128 nodes in the 64 lines of one frame, ns per hop over 9 runs\n");
    printf("  one view (A only)       median %.2f   min %.2f   max %.2f\n", v1[4], v1[0], v1[8]);
    printf("  two views (A and B)     median %.2f   min %.2f   max %.2f\n", v2[4], v2[0], v2[8]);
    return 0;
}
