/* story.c - the main run of Part III.
   One program reserves 4 pages at 0x7f3a1b2c3000 and stores one byte at 0x7f3a1b2c3d4e.
   Then it loads from page 1, forks, changes permissions and gives a page back.
   Every user page fault, frame allocation, frame free and TLB flush is recorded through the
   kernel's trace events, and /proc/self/pagemap shows which frame each page got.

   Build: gcc -O1 -o story story.c
   Run as root, on one CPU:  taskset -c 0 ./story > story.txt
                             python3 ../common/trace_clean.py > story.trace.txt   */
#include "../common/lab.h"
#include <setjmp.h>
#include <signal.h>
#include <sys/wait.h>
#include <ucontext.h>

#define BASE ((char *)0x7f3a1b2c3000UL)
static sigjmp_buf jb;

static void on_segv(int sig, siginfo_t *si, void *uc_)
{
    ucontext_t *uc = uc_;
    const char *code = si->si_code == SEGV_MAPERR ? "SEGV_MAPERR" : si->si_code == SEGV_ACCERR ? "SEGV_ACCERR" : si->si_code == SI_KERNEL ? "SI_KERNEL" : "other";
    lg("SIGSEGV: trap=%lld err=0x%llx cr2=0x%llx si_code=%s\n",
       (long long)uc->uc_mcontext.gregs[REG_TRAPNO], (long long)uc->uc_mcontext.gregs[REG_ERR],
       (long long)uc->uc_mcontext.gregs[REG_CR2], code);
    (void)sig;
    siglongjmp(jb, 1);
}

static void maps_lines(const char *title, uintptr_t lo, uintptr_t hi)
{
    char line[512];
    int any = 0;
    FILE *f = fopen("/proc/self/maps", "r");
    lg("%s\n", title);
    while (fgets(line, sizeof line, f)) {
        unsigned long a, b;
        if (sscanf(line, "%lx-%lx", &a, &b) == 2 && b > lo && a < hi) { lg("  %s", line); any = 1; }
    }
    if (!any) lg("  (none)\n");
    fclose(f);
}

int main(void)
{
    static const char *ev[] = {"exceptions/page_fault_user", "kmem/mm_page_alloc", "kmem/mm_page_free", "tlb/tlb_flush", NULL};
    volatile char *p;
    long f;
    char x;
    struct sigaction sa = {0};
    sa.sa_sigaction = on_segv;
    sa.sa_flags = SA_SIGINFO;
    sigaction(SIGSEGV, &sa, NULL);
    lg_init();
    /* warm up everything used while tracing, so its own first-use faults stay out of the trace */
    (void)pagemap(&f); (void)faults(); (void)status_kb("VmPTE"); tr_mark("warm-up");
    maps_lines("warm-up", 0, 1);
    *lg_len = 0;

    maps_lines("== /proc/self/maps at start", 0, ~0UL);
    maps_lines("== mappings in PML4 slot 254 (0x7f0000000000-0x7f7fffffffff)", 0x7f0000000000UL, 0x7f8000000000UL);
    lg("VmPTE at start: %ld kB\n", status_kb("VmPTE"));

    tr_on(ev, 1);
    tr_mark("== mmap 4 pages at 0x7f3a1b2c3000");
    p = mmap(BASE, 16384, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED_NOREPLACE, -1, 0);
    if (p != BASE) { perror("mmap"); return 1; }
    lg("\n== mmap(0x7f3a1b2c3000, 16384, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS|MAP_FIXED_NOREPLACE) = %p\n", (void *)p);
    maps_lines("its line in /proc/self/maps:", (uintptr_t)BASE, (uintptr_t)BASE + 16384);
    lg_pagemap("page 0 after mmap", (void *)p);
    lg("VmPTE after mmap: %ld kB\n", status_kb("VmPTE"));

    lg("\n== store p[0xd4e] = 1  (address %p)\n", (void *)(p + 0xd4e));
    f = faults();
    tr_mark("== store to page 0: p[0xd4e] = 1");
    p[0xd4e] = 1;
    lg("faults during the store: %ld\n", faults() - f);
    lg_pagemap("page 0 after the store", (void *)p);
    lg("VmPTE after the store: %ld kB\n", status_kb("VmPTE"));
    f = faults();
    tr_mark("== second store to page 0");
    p[0xd4e] = 2;
    lg("faults during a second store: %ld\n", faults() - f);

    lg("\n== load from page 1: x = p[0x1d4e]\n");
    f = faults();
    tr_mark("== load from page 1");
    x = p[0x1d4e];
    lg("read %d, faults %ld\n", x, faults() - f);
    lg_pagemap("page 1 after the load", (void *)(p + 0x1000));
    f = faults();
    tr_mark("== store to page 1");
    p[0x1d4e] = 3;
    lg("store to page 1: faults %ld\n", faults() - f);
    lg_pagemap("page 1 after the store", (void *)(p + 0x1000));
    tr_mark("== store to page 3");
    p[0x3d4e] = 1;
    lg_pagemap("page 3 after a store", (void *)(p + 0x3000));

    lg("\n== fork\n");
    lg_pagemap("parent page 0 before fork", (void *)p);
    tr_mark("== fork");
    pid_t pid = fork();
    if (pid == 0) {
        tr_mark("== child: warm-up (its first writes to the stack and libc data fault)");
        lg_pagemap("child page 0 after fork", (void *)p);
        f = faults();
        tr_mark("== child stores 9 to page 0");
        p[0xd4e] = 9;
        long d = faults() - f;
        lg("child: faults during its store %ld, reads %d\n", d, p[0xd4e]);
        lg_pagemap("child page 0 after its store", (void *)p);
        _exit(0);
    }
    lg_pagemap("parent page 0 after fork", (void *)p);
    waitpid(pid, NULL, 0);
    f = faults();
    tr_mark("== parent stores 7 to page 0 (child has exited)");
    p[0xd4e] = 7;
    long d = faults() - f;
    lg("parent: faults during its store %ld, reads %d\n", d, p[0xd4e]);
    lg_pagemap("parent page 0 after its store", (void *)p);

    /* fork left page 3's entry read-only too; write it once so mprotect has something to change */
    tr_mark("== parent stores to page 3 again");
    p[0x3d4e] = 2;
    lg("\n== mprotect(page 3, PROT_READ), then store to it\n");
    tr_mark("== mprotect page 3 read-only");
    mprotect((void *)(p + 0x3000), 4096, PROT_READ);
    maps_lines("/proc/self/maps now:", (uintptr_t)BASE, (uintptr_t)BASE + 16384);
    tr_mark("== store to read-only page 3");
    if (!sigsetjmp(jb, 1)) { p[0x3d4e] = 1; lg("  (no fault?)\n"); }

    lg("\n== madvise(page 0, MADV_DONTNEED)\n");
    tr_mark("== madvise DONTNEED page 0");
    madvise((void *)p, 4096, MADV_DONTNEED);
    lg_pagemap("page 0 after madvise", (void *)p);
    tr_mark("== load from page 0");
    x = p[0xd4e];
    lg("load from page 0 reads %d\n", x);
    tr_mark("== store to page 0");
    p[0xd4e] = 6;
    lg_pagemap("page 0 after the store", (void *)p);
    tr_off();
    lg_flush();
    return 0;
}
