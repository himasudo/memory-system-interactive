#define _GNU_SOURCE
#include <errno.h>
#include <inttypes.h>
#include <pthread.h>
#include <sched.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* Aligned C11 atomic counters; no volatile/data-race substitute. Timing includes
   the release barrier and joins, excludes allocation, creation and warm-up. */
typedef struct {
    _Atomic uint64_t *counter;
    pthread_barrier_t *ready, *go;
    uint64_t iterations, failures;
    int cpu, observed_start, observed_end, cas, error;
} worker;
static uint64_t number(const char *s, uint64_t lo, uint64_t hi) {
    char *end; errno=0;
    if (!s[0] || s[0]=='-') { fprintf(stderr,"invalid integer\n"); exit(2); }
    uint64_t v=strtoull(s,&end,10);
    if (errno || *end || v<lo || v>hi) { fprintf(stderr,"integer out of range\n"); exit(2); }
    return v;
}
static uint64_t now(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC_RAW,&ts)) { perror("clock_gettime"); exit(2); }
    return (uint64_t)ts.tv_sec*1000000000ULL+(uint64_t)ts.tv_nsec;
}
static void *run(void *arg) {
    worker *w=arg; cpu_set_t set; CPU_ZERO(&set); CPU_SET(w->cpu,&set);
    w->error=pthread_setaffinity_np(pthread_self(),sizeof(set),&set);
    _Atomic uint64_t warm=0;
    for (int i=0;i<1024;i++) atomic_fetch_add_explicit(&warm,1,memory_order_relaxed);
    pthread_barrier_wait(w->ready);
    pthread_barrier_wait(w->go);
    w->observed_start=sched_getcpu();
    uint64_t failures=0;
    if (!w->error) for (uint64_t i=0;i<w->iterations;i++) {
        if (!w->cas) atomic_fetch_add_explicit(w->counter,1,memory_order_relaxed);
        else {
            uint64_t expected=atomic_load_explicit(w->counter,memory_order_relaxed);
            while (!atomic_compare_exchange_weak_explicit(w->counter,&expected,expected+1,memory_order_relaxed,memory_order_relaxed)) failures++;
        }
    }
    w->observed_end=sched_getcpu(); w->failures=failures;
    return NULL;
}
int main(int argc,char **argv) {
    const char *mode="packed",*op="add",*cpulist=NULL;
    unsigned threads=2; uint64_t iterations=1000000;
    for (int i=1;i<argc;i+=2) {
        if (i+1>=argc) { fprintf(stderr,"options need values\n"); return 2; }
        if (!strcmp(argv[i],"--mode")) mode=argv[i+1];
        else if (!strcmp(argv[i],"--op")) op=argv[i+1];
        else if (!strcmp(argv[i],"--threads")) threads=(unsigned)number(argv[i+1],1,4);
        else if (!strcmp(argv[i],"--iterations")) iterations=number(argv[i+1],1,1000000000);
        else if (!strcmp(argv[i],"--cpus")) cpulist=argv[i+1];
        else { fprintf(stderr,"unknown option: %s\n",argv[i]); return 2; }
    }
    if ((!cpulist)|| (strcmp(mode,"same")&&strcmp(mode,"packed")&&strcmp(mode,"padded")) || (strcmp(op,"add")&&strcmp(op,"cas"))) { fprintf(stderr,"use --cpus LIST --mode same|packed|padded --op add|cas\n"); return 2; }
    if (sizeof(_Atomic uint64_t)!=8) { fprintf(stderr,"requires 8-byte uint64 atomics\n"); return 2; }
    unsigned stride=!strcmp(mode,"same")?0:!strcmp(mode,"packed")?8:64;
    void *allocation=NULL;
    if (posix_memalign(&allocation,64,256)) { fprintf(stderr,"allocation failed\n"); return 2; }
    for (unsigned i=0;i<threads;i++) atomic_init((_Atomic uint64_t *)((char *)allocation+i*stride),0);
    if (!atomic_is_lock_free((_Atomic uint64_t *)allocation)) { fprintf(stderr,"requires lock-free 64-bit atomics\n"); free(allocation); return 2; }
    pthread_t ids[4]; worker workers[4]={0}; pthread_barrier_t ready,go;
    if (pthread_barrier_init(&ready,NULL,threads+1)||pthread_barrier_init(&go,NULL,threads+1)) { fprintf(stderr,"barrier init failed\n"); return 2; }
    char *copy=strdup(cpulist),*save=NULL,*token=copy?strtok_r(copy,",",&save):NULL;
    for (unsigned i=0;i<threads;i++) {
        if (!token) { fprintf(stderr,"CPU list length must match threads\n"); return 2; }
        workers[i]=(worker){.counter=(_Atomic uint64_t *)((char *)allocation+i*stride),.ready=&ready,.go=&go,.iterations=iterations,.cpu=(int)number(token,0,CPU_SETSIZE-1),.cas=!strcmp(op,"cas")};
        token=strtok_r(NULL,",",&save);
    }
    if (token) { fprintf(stderr,"CPU list length must match threads\n"); return 2; }
    free(copy);
    for (unsigned i=0;i<threads;i++) if (pthread_create(&ids[i],NULL,run,&workers[i])) { fprintf(stderr,"thread creation failed\n"); exit(2); }
    pthread_barrier_wait(&ready);
    uint64_t start=now(); pthread_barrier_wait(&go);
    for (unsigned i=0;i<threads;i++) if (pthread_join(ids[i],NULL)) { fprintf(stderr,"join failed\n"); return 2; }
    uint64_t elapsed=now()-start,checksum=0,failures=0;
    for (unsigned i=0;i<threads;i++) {
        if (workers[i].error||workers[i].observed_start!=workers[i].cpu||workers[i].observed_end!=workers[i].cpu) { fprintf(stderr,"affinity failed or changed for CPU %d\n",workers[i].cpu); return 2; }
        if (stride||i==0) checksum+=atomic_load_explicit(workers[i].counter,memory_order_relaxed);
        failures+=workers[i].failures;
    }
    if (!elapsed || checksum!=iterations*threads) { fprintf(stderr,"counter validation failed\n"); return 2; }
    printf("{\"mode\":\"%s\",\"op\":\"%s\",\"threads\":%u,\"iterations\":%"PRIu64",\"operations\":%"PRIu64",\"elapsed_ns\":%"PRIu64",\"checksum\":%"PRIu64",\"cas_failures\":%"PRIu64",\"stride_bytes\":%u,\"line_bytes_assumed\":64,\"counter_base\":\"%p\",\"observed_cpus\":[",mode,op,threads,iterations,iterations*threads,elapsed,checksum,failures,stride,allocation);
    for (unsigned i=0;i<threads;i++) printf("%s%d",i?",":"",workers[i].observed_start);
    puts("]}");
    pthread_barrier_destroy(&ready); pthread_barrier_destroy(&go); free(allocation); return 0;
}
