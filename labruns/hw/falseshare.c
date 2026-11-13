/* falseshare.c - two threads, two counters, one cache line or two.
   Each thread adds 1 to its own counter 20 million times; neither reads the other's counter.
   "one line": the counters are 8 bytes apart. "padded": they are 128 bytes apart.
   Twice: with a plain increment (load, add, store) and with an atomic one (lock add).
   Usage: falseshare       (it pins its threads to CPUs 0 and 1) */
#define _GNU_SOURCE
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <time.h>

#define N 20000000L
static char area[256] __attribute__((aligned(64)));
static long *ctr[2];
static int atomic;
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e9 + t.tv_nsec; }

static void *run(void *arg)
{
    int t = (int)(long)arg;
    cpu_set_t s; CPU_ZERO(&s); CPU_SET(t, &s); pthread_setaffinity_np(pthread_self(), sizeof s, &s);
    long *c = ctr[t];
    if (atomic) for (long i = 0; i < N; i++) __atomic_fetch_add(c, 1, __ATOMIC_RELAXED);   /* lock add */
    else        for (long i = 0; i < N; i++) (*(volatile long *)c)++;                     /* load, add, store */
    return NULL;
}

static double timed(int threads, int gap)
{
    pthread_t th[2];
    ctr[0] = (long *)(area + 0);
    ctr[1] = (long *)(area + gap);
    double t0 = now();
    for (int t = 0; t < threads; t++) pthread_create(&th[t], NULL, run, (void *)(long)t);
    for (int t = 0; t < threads; t++) pthread_join(th[t], NULL);
    return (now() - t0) / N;
}

int main(void)
{
    printf("%-16s %-28s %s\n", "increment", "threads and counters", "ns per increment");
    for (atomic = 0; atomic < 2; atomic++) {
        printf("%-16s %-28s %6.2f\n", atomic ? "atomic" : "plain", "1 thread", timed(1, 8));
        printf("%-16s %-28s %6.2f\n", atomic ? "atomic" : "plain", "2 threads, one line", timed(2, 8));
        printf("%-16s %-28s %6.2f\n", atomic ? "atomic" : "plain", "2 threads, 128 bytes apart", timed(2, 128));
    }
    return 0;
}
