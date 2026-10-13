/* hugetlb.c - ask for one 2 MiB page from the hugetlb pool with mmap(MAP_HUGETLB),
   first with whatever pool the machine has, then (as root) with a pool of one page.
   The pool size is restored at the end.
   Build: gcc -O2 -o hugetlb hugetlb.c      Run as root: ./hugetlb */
#include "../common/lab.h"

static long read_long(const char *path)
{
    long v = -1;
    FILE *f = fopen(path, "r");
    if (f) { if (fscanf(f, "%ld", &v) != 1) v = -1; fclose(f); }
    return v;
}
static int write_long(const char *path, long v)
{
    FILE *f = fopen(path, "w");
    if (!f) return -1;
    fprintf(f, "%ld\n", v);
    return fclose(f);
}
static void meminfo(const char *key)
{
    char line[256];
    size_t n = strlen(key);
    FILE *f = fopen("/proc/meminfo", "r");
    while (f && fgets(line, sizeof line, f))
        if (!strncmp(line, key, n)) printf("  %s", line);
    if (f) fclose(f);
}
static void try_once(void)
{
    char *p = mmap(NULL, 2 << 20, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS | MAP_HUGETLB, -1, 0);
    if (p == MAP_FAILED) { printf("mmap(2 MiB, MAP_HUGETLB) failed: %s\n", strerror(errno)); return; }
    printf("mmap(2 MiB, MAP_HUGETLB) = %p\n", (void *)p);
    long f = faults();
    p[0xc3d4e] = 1;
    printf("faults during one store: %ld\n", faults() - f);
    show_pagemap("first 4 KiB piece", p);
    uint64_t e = pagemap(p) & ((1ULL << 55) - 1);
    printf("first pfn %% 512 = %llu\n", (unsigned long long)(e % 512));
    meminfo("HugePages_Total");
    meminfo("HugePages_Free");
    munmap(p, 2 << 20);
}

int main(void)
{
    const char *pool = "/proc/sys/vm/nr_hugepages";
    long old = read_long(pool);
    printf("$ cat /proc/sys/vm/nr_hugepages\n%ld\n", old);
    try_once();
    if (write_long(pool, old + 1) == 0) {
        printf("$ echo %ld > /proc/sys/vm/nr_hugepages\n", old + 1);
        try_once();
        write_long(pool, old);
        printf("$ echo %ld > /proc/sys/vm/nr_hugepages    # restored\n", old);
    }
    return 0;
}
