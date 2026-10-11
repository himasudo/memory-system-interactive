/* shoot.c - when does removing a page interrupt another CPU?
   1000 times on CPU 0: mmap one page, store to it, munmap it.
   Run A: the process has one thread.  Run B: a second thread of the same process spins on CPU 1.
   The tlb_flush trace event shows each flush and its reason; /proc/interrupts counts the
   "TLB shootdowns" interrupts each CPU received.
   Build: gcc -O2 -pthread -o shoot shoot.c      Run as root: ./shoot */
#include "../common/lab.h"
#include <pthread.h>
#include <stdatomic.h>

static atomic_int stop;
static void *spin(void *arg) { pin_cpu(1); while (!atomic_load(&stop)) {} return arg; }

static void tlb_irqs(long *c0, long *c1)
{
    char line[512];
    FILE *f = fopen("/proc/interrupts", "r");
    while (fgets(line, sizeof line, f))
        if (strstr(line, "TLB shootdowns")) { sscanf(line, " TLB: %ld %ld", c0, c1); break; }
    fclose(f);
}
static void count(const char *title)
{
    /* count tlb_flush events by CPU and reason */
    char line[512];
    long n[2][5] = {{0}};
    FILE *f = fopen(TRACEFS "trace", "r");
    while (fgets(line, sizeof line, f)) {
        char *r = strstr(line, "tlb_flush:");
        char *c = strchr(line, '[');
        if (!r || !c) continue;
        int cpu = atoi(c + 1), reason = -1;
        char *p = strstr(r, "reason:");
        char *q = p ? strrchr(p, '(') : NULL;
        if (q) reason = atoi(q + 1);
        if (cpu >= 0 && cpu < 2 && reason >= 0 && reason < 5) n[cpu][reason]++;
    }
    fclose(f);
    static const char *why[] = {"flush on task switch", "remote shootdown", "local shootdown", "local MM shootdown", "remote IPI send"};
    printf("%s\n", title);
    for (int c = 0; c < 2; c++)
        for (int r = 0; r < 5; r++)
            if (n[c][r]) printf("  CPU%d  %-22s %ld\n", c, why[r], n[c][r]);
}
static void loop(void)
{
    for (int i = 0; i < 1000; i++) {
        volatile char *p = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        p[0] = 1;
        munmap((void *)p, 4096);
    }
}

int main(void)
{
    static const char *ev[] = {"tlb/tlb_flush", NULL};
    long a0, a1, b0, b1;
    pin_cpu(0);
    loop(); /* warm up */

    tlb_irqs(&a0, &a1);
    tr_on(ev, 0);
    loop();
    tr_off();
    tlb_irqs(&b0, &b1);
    count("ONE THREAD on CPU0, 1000 x (mmap, store, munmap):");
    printf("  /proc/interrupts TLB shootdowns received: CPU0 +%ld, CPU1 +%ld\n", b0 - a0, b1 - a1);

    pthread_t t;
    pthread_create(&t, NULL, spin, NULL);
    usleep(100000);
    tlb_irqs(&a0, &a1);
    /* follow both threads: set_event_pid filters by thread id, so allow every thread of the process */
    tr_on(ev, 1);
    tr_write("set_event_pid", "");
    loop();
    tr_off();
    tlb_irqs(&b0, &b1);
    atomic_store(&stop, 1);
    pthread_join(t, NULL);
    count("TWO THREADS (the second spinning on CPU1), 1000 x (mmap, store, munmap) on CPU0:");
    printf("  /proc/interrupts TLB shootdowns received: CPU0 +%ld, CPU1 +%ld\n", b0 - a0, b1 - a1);
    return 0;
}
