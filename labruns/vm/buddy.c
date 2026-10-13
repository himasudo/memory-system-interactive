/* buddy.c - where frames come from.
   1. One 2 MiB transparent huge page: the Normal zone's line of /proc/buddyinfo before the fault,
      after it, and after munmap.
   2. 256 fresh 4 KiB pages, touched one by one, with the trace events mm_page_alloc (every block
      handed out) and mm_page_alloc_zone_locked (blocks taken from the zone's free lists;
      percpu_refill=1 means: to refill this CPU's list). /proc/zoneinfo shows CPU 0's list.
   3. 16384 more fresh pages: enough to empty CPU 0's list, so the refills show.
   4. One page freed with MADV_DONTNEED, then written again.
   Build: gcc -O2 -o buddy buddy.c      Run as root: taskset -c 0 ./buddy */
#include "../common/lab.h"

static void normal_line(const char *what)
{
    char line[512];
    FILE *f = fopen("/proc/buddyinfo", "r");
    while (f && fgets(line, sizeof line, f))
        if (strstr(line, "Normal")) printf("%-22s %s", what, strstr(line, "Normal") + 6);
    if (f) fclose(f);
}
static void cpu0_list(const char *what)
{
    char line[256];
    int zone = 0, cpu = 0, n = 0;
    FILE *f = fopen("/proc/zoneinfo", "r");
    printf("%s", what);
    while (f && fgets(line, sizeof line, f) && n < 3) {
        if (!strncmp(line, "Node", 4)) zone = strstr(line, "Normal") != NULL;
        else if (zone && strstr(line, "cpu: 0")) cpu = 1;
        else if (zone && cpu && (strstr(line, "count:") || strstr(line, "high:") || strstr(line, "batch:"))) {
            char k[16]; long v;
            if (sscanf(line, " %15[a-z]: %ld", k, &v) == 2) { printf(" %s %ld", k, v); n++; }
        }
    }
    if (f) fclose(f);
    printf("\n");
}
static unsigned long pfn_of(void *p) { return (unsigned long)(pagemap(p) & ((1ULL << 55) - 1)); }


/* touch n fresh pages with tracing on; count where their frames came from */
static volatile char *touch(long n, const char **ev)
{
    volatile char *q = mmap(NULL, n * 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    madvise((void *)q, n * 4096, MADV_NOHUGEPAGE);
    tr_on(ev, 0);
    for (long i = 0; i < n; i++) q[i * 4096] = 1;
    tr_off();
    char line[512];
    long data = 0, tables = 0, refill = 0, other = 0, run = 0, runs[256], nruns = 0;
    FILE *f = fopen(TRACEFS "trace", "r");
    while (f && fgets(line, sizeof line, f)) {
        int zl = strstr(line, "mm_page_alloc_zone_locked:") != NULL;
        if (zl) { if (strstr(line, "percpu_refill=1")) { refill++; run++; } else other++; }
        else if (strstr(line, "mm_page_alloc:")) { if (strstr(line, "GFP_HIGHUSER_MOVABLE")) data++; else tables++; }
        if (!zl && run) { if (nruns < 256) runs[nruns++] = run; run = 0; }
    }
    if (run && nruns < 256) runs[nruns++] = run;
    if (f) fclose(f);
    printf("mm_page_alloc: %ld blocks for user pages, %ld for page tables\n", data, tables);
    printf("taken from the zone's free lists to refill CPU 0's list: %ld pages", refill);
    if (other) printf(" (and %ld taken directly)", other);
    printf("\n");
    if (nruns) {
        printf("refills, in order:");
        for (long i = 0; i < nruns; i++) printf(" %ld", runs[i]);
        printf("\n");
    }
    return q;
}

int main(void)
{
    static const char *ev[] = {"kmem/mm_page_alloc", "kmem/mm_page_alloc_zone_locked", NULL};
    (void)pagemap(&ev); (void)faults();

    printf("== 1. one 2 MiB transparent huge page (Normal zone; free blocks of order 0 1 2 ... 10)\n");
    char *raw = mmap(NULL, 4 << 20, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    char *h = (char *)(((uintptr_t)raw + (2 << 20) - 1) & ~((uintptr_t)(2 << 20) - 1));
    madvise(h, 2 << 20, MADV_HUGEPAGE);
    normal_line("before the fault");
    h[0] = 1;
    normal_line("after the fault");
    printf("huge page: pfn=0x%lx, pfn %% 512 = %lu: one block of order 9\n", pfn_of(h), pfn_of(h) % 512);
    munmap(raw, 4 << 20);
    normal_line("after munmap");

    printf("\n== 2. 256 fresh 4 KiB pages, one store each\n");
    cpu0_list("CPU 0's list before:");
    volatile char *q = touch(256, ev);
    printf("frames of the first 8 pages:");
    for (int i = 0; i < 8; i++) printf(" 0x%lx", pfn_of((void *)(q + i * 4096)));
    printf("\n");

    printf("\n== 3. 16384 more fresh pages (64 MiB), one store each\n");
    (void)touch(16384, ev);
    cpu0_list("CPU 0's list after:");

    printf("\n== 4. free one page, then write it again\n");
    unsigned long before = pfn_of((void *)q);
    madvise((void *)q, 4096, MADV_DONTNEED);
    q[0] = 2;
    printf("page 0: pfn=0x%lx before MADV_DONTNEED, pfn=0x%lx after the next store\n", before, pfn_of((void *)q));
    return 0;
}
