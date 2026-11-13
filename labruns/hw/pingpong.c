/* pingpong.c - how long one core takes to see a value another core wrote.
   Two threads on CPUs 0 and 1 pass a counter back and forth through one cache line:
   thread 0 writes an odd number and waits for the next even one; thread 1 waits for the odd
   number and answers with the even one. Every handoff moves the line from the writer's cache
   to the reader's, so the time per handoff is the cost of one cache-to-cache transfer plus
   the invalidation before it. On a virtual machine the two vCPUs run on whichever host cores
   the hypervisor picks, so the result can change from run to run; the program repeats the
   measurement eight times, two seconds apart.
   Usage: pingpong         (it pins its two threads to CPUs 0 and 1) */
#define _GNU_SOURCE
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <time.h>
#include <unistd.h>

#define N 1000000L
static _Alignas(64) long line[8];        /* one 64-byte line, the one that moves; only line[0] is used */

static void pin(int cpu)
{
    cpu_set_t s;
    CPU_ZERO(&s);
    CPU_SET(cpu, &s);
    pthread_setaffinity_np(pthread_self(), sizeof s, &s);
}

static double now_ns(void)
{
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return t.tv_sec * 1e9 + t.tv_nsec;
}

static void *answer(void *arg)
{
    (void)arg;
    pin(1);
    for (long i = 0; i < N; i++) {
        while (__atomic_load_n(&line[0], __ATOMIC_ACQUIRE) != 2 * i + 1) ;
        __atomic_store_n(&line[0], 2 * i + 2, __ATOMIC_RELEASE);
    }
    return NULL;
}

int main(void)
{
    pin(0);
    printf("%ld round trips between CPU 0 and CPU 1, one 64-byte line\n", N);
    for (int run = 1; run <= 8; run++) {
        if (run > 1) sleep(2);
        pthread_t t;
        __atomic_store_n(&line[0], 0, __ATOMIC_RELEASE);
        pthread_create(&t, NULL, answer, NULL);
        double t0 = now_ns();
        for (long i = 0; i < N; i++) {
            __atomic_store_n(&line[0], 2 * i + 1, __ATOMIC_RELEASE);
            while (__atomic_load_n(&line[0], __ATOMIC_ACQUIRE) != 2 * i + 2) ;
        }
        double t1 = now_ns();
        pthread_join(t, NULL);
        printf("run %d: %6.1f ns per round trip, %5.1f ns per handoff\n", run, (t1 - t0) / N, (t1 - t0) / N / 2);
    }
    return 0;
}
