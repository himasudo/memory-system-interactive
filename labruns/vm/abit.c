/* abit.c - the kernel clears accessed (A) bits without flushing the TLB.
   16 pages (64 kB). After each step, smaps reports "Referenced": kB of the region whose A bit
   (or the kernel's own referenced flag) is set. Writing 1 to /proc/self/clear_refs clears the
   A bits, but a CPU that still holds a translation in its TLB does not set A again when it uses it.
   Build: gcc -O1 -o abit abit.c      Run: taskset -c 0 ./abit   (20 runs: for i in $(seq 20); do ...) */
#include "../common/lab.h"

#define N 16
static long referenced(void *start)
{
    char line[512];
    long v = -1;
    int in = 0;
    FILE *f = fopen("/proc/self/smaps", "r");
    while (fgets(line, sizeof line, f)) {
        unsigned long a, b;
        char perm[8];
        if (sscanf(line, "%lx-%lx %7s", &a, &b, perm) == 3) in = (a == (unsigned long)start);
        else if (in && !strncmp(line, "Referenced:", 11)) { v = atol(line + 11); break; }
    }
    fclose(f);
    return v;
}
static void clear_refs(void)
{
    int fd = open("/proc/self/clear_refs", O_WRONLY);
    if (fd < 0 || write(fd, "1", 1) != 1) perror("clear_refs");
    close(fd);
}

int main(int argc, char **argv)
{
    int verbose = argc > 1;
    /* a fixed address far from other mappings, so the region is not merged with a neighbour */
    volatile char *p = mmap((void *)0x7f3a1b400000UL, N * 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED_NOREPLACE, -1, 0);
    long s = 0;
    if (verbose) printf("after mmap                                Referenced %2ld kB\n", referenced((void *)p));
    for (int i = 0; i < N; i++) p[i * 4096] = 1;
    if (verbose) printf("after one store per page                  Referenced %2ld kB\n", referenced((void *)p));
    clear_refs();
    if (verbose) printf("after writing 1 to clear_refs             Referenced %2ld kB\n", referenced((void *)p));
    for (int i = 0; i < N; i++) s += p[i * 4096];
    long first = referenced((void *)p);
    if (verbose) printf("after one load per page                   Referenced %2ld kB\n", first);
    mprotect((void *)p, N * 4096, PROT_READ);
    mprotect((void *)p, N * 4096, PROT_READ | PROT_WRITE);
    if (verbose) printf("after mprotect R, then RW (TLB flushed)   Referenced %2ld kB\n", referenced((void *)p));
    for (int i = 0; i < N; i++) s += p[i * 4096];
    long second = referenced((void *)p);
    if (verbose) printf("after one load per page                   Referenced %2ld kB\n", second);
    if (!verbose) printf("%ld %ld\n", first, second);
    return (int)(s & 0);
}
