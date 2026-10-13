/* thp.c - one store into a 2 MiB region that asked for transparent huge pages.
   Build: gcc -O1 -o thp thp.c      Run as root: taskset -c 0 ./thp */
#include "../common/lab.h"

static long smaps_field(void *start, const char *key)
{
    char line[512];
    long v = -1;
    int in = 0;
    size_t n = strlen(key);
    FILE *f = fopen("/proc/self/smaps", "r");
    while (fgets(line, sizeof line, f)) {
        unsigned long a, b;
        if (sscanf(line, "%lx-%lx ", &a, &b) == 2 && strchr(line, '-') == line + strcspn(line, "-")) in = (a == (unsigned long)start);
        else if (in && !strncmp(line, key, n) && line[n] == ':') { v = atol(line + n + 1); break; }
    }
    fclose(f);
    return v;
}

int main(void)
{
    static const char *ev[] = {"exceptions/page_fault_user", "kmem/mm_page_alloc", NULL};
    char *base = (char *)0x7f3a1b200000UL;
    lg_init();
    (void)pagemap(base); (void)status_kb("VmPTE"); (void)faults(); tr_mark("warm-up"); (void)smaps_field(base, "Rss");
    char *p = mmap(base, 2 << 20, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED_NOREPLACE, -1, 0);
    if (p != base) { perror("mmap"); return 1; }
    int r = madvise(p, 2 << 20, MADV_HUGEPAGE);
    lg("mmap 2 MiB at %p, madvise(MADV_HUGEPAGE) = %d\n", (void *)p, r);
    lg("VmPTE before the store: %ld kB\n", status_kb("VmPTE"));
    long f = faults();
    tr_on(ev, 0);
    tr_mark("== store to 0x7f3a1b2c3d4e");
    p[0xc3d4e] = 1;
    tr_off();
    lg("faults during the store: %ld\n", faults() - f);
    lg("VmPTE after the store: %ld kB\n", status_kb("VmPTE"));
    lg("smaps AnonHugePages: %ld kB, Rss: %ld kB\n", smaps_field(base, "AnonHugePages"), smaps_field(base, "Rss"));
    lg_pagemap("first 4 KiB of the region", p);
    lg_pagemap("4 KiB piece at +0xc3000", p + 0xc3000);
    lg_pagemap("last 4 KiB piece (+0x1ff000)", p + 0x1ff000);
    uint64_t e = pagemap(p) & ((1ULL << 55) - 1);
    lg("first pfn %% 512 = %llu\n", (unsigned long long)(e % 512));
    lg_flush();
    return 0;
}
