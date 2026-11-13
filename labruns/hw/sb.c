/* sb.c - the store-buffering litmus test on two CPUs.
   Thread 0 runs:  x = 1; r0 = y;      Thread 1 runs:  y = 1; r1 = x;
   x and y start at 0 and sit in different cache lines. If every store were visible to the other
   CPU before the next load ran, at least one thread would read 1. On x86 a store can wait in the
   store buffer while the next load runs, so both can read 0. Run three times: with nothing between
   the store and the load, with mfence, and with a locked instruction (lock orq $0,(%rsp)), which is
   what gcc 13 emits for a C11 atomic_thread_fence(memory_order_seq_cst) on x86-64.
   Usage: sb               (it pins its two threads to CPUs 0 and 1) */
#define _GNU_SOURCE
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>

#define N 2000000
struct line { volatile int v; char pad[60]; } __attribute__((aligned(64)));
static struct line X, Y;
static int res[2][N];
static int mode; /* 0: nothing, 1: mfence, 2: lock or */
static volatile int arrived, phase;

static void barrier(int *local)
{
    *local ^= 1;
    if (__atomic_add_fetch(&arrived, 1, __ATOMIC_SEQ_CST) == 2) { arrived = 0; __atomic_store_n(&phase, *local, __ATOMIC_SEQ_CST); }
    else while (__atomic_load_n(&phase, __ATOMIC_ACQUIRE) != *local) ;
}

static void *run(void *arg)
{
    int t = (int)(long)arg, local = 0;
    cpu_set_t s; CPU_ZERO(&s); CPU_SET(t, &s); pthread_setaffinity_np(pthread_self(), sizeof s, &s);
    volatile int *mine = t ? &Y.v : &X.v, *other = t ? &X.v : &Y.v;
    for (int i = 0; i < N; i++) {
        *mine = 0;
        barrier(&local);
        *mine = 1;
        if (mode == 1) __asm__ volatile("mfence" ::: "memory");
        else if (mode == 2) __asm__ volatile("lock orq $0,(%%rsp)" ::: "memory", "cc");
        else __asm__ volatile("" ::: "memory");   /* stops only the compiler */
        res[t][i] = *other;
        barrier(&local);
    }
    return NULL;
}

int main(void)
{
    static const char *name[3] = {"nothing between the store and the load", "mfence between them", "lock orq $0,(%rsp) between them"};
    for (mode = 0; mode < 3; mode++) {
        pthread_t a, b;
        arrived = 0; phase = 0;
        pthread_create(&a, NULL, run, (void *)0L);
        pthread_create(&b, NULL, run, (void *)1L);
        pthread_join(a, NULL); pthread_join(b, NULL);
        long c[2][2] = {{0, 0}, {0, 0}};
        for (int i = 0; i < N; i++) c[res[0][i]][res[1][i]]++;
        printf("%s: %d runs\n", name[mode], N);
        printf("  r0=0 r1=0: %8ld\n  r0=0 r1=1: %8ld\n  r0=1 r1=0: %8ld\n  r0=1 r1=1: %8ld\n", c[0][0], c[0][1], c[1][0], c[1][1]);
    }
    return 0;
}
