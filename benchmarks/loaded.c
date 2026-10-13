#define _GNU_SOURCE
#include <errno.h>
#include <inttypes.h>
#include <pthread.h>
#include <sched.h>
#include <stdalign.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* A dependent ring plus independent pinned bandwidth generators. Progress is
   published once per 64 KiB chunk, on a separate cache line per worker. */
typedef struct node { struct node *next; char pad[64-sizeof(void *)]; } node;
_Static_assert(sizeof(node)==64,"64-byte reference-machine nodes");
typedef struct {
    alignas(64) _Atomic uint64_t chunks;
    alignas(64) _Atomic int ready;
    int cpu,write,error,before,after;
    size_t bytes;
    uint64_t checksum;
} generator;
static alignas(64) _Atomic int stop;
static alignas(64) volatile uintptr_t sink;
static uint64_t clock_ns(void) { struct timespec t;if(clock_gettime(CLOCK_MONOTONIC_RAW,&t)){perror("clock_gettime");exit(2);}return (uint64_t)t.tv_sec*1000000000ULL+(uint64_t)t.tv_nsec; }
static void barrier(void) { __asm__ __volatile__("" ::: "memory"); }
static uint64_t number(const char *s,uint64_t min,uint64_t max) {char *end;errno=0;if(!*s||*s=='-'){fprintf(stderr,"invalid number\n");exit(2);}uint64_t n=strtoull(s,&end,10);if(errno||*end||n<min||n>max){fprintf(stderr,"number out of range\n");exit(2);}return n;}
static int pin(int cpu) {cpu_set_t mask;CPU_ZERO(&mask);CPU_SET(cpu,&mask);return pthread_setaffinity_np(pthread_self(),sizeof(mask),&mask);}
static uint64_t rng(uint64_t *s) {*s^=*s<<13;*s^=*s>>7;*s^=*s<<17;return *s;}
__attribute__((noinline)) static uintptr_t chase(node *p,size_t steps) {barrier();for(size_t i=0;i<steps;i++)p=p->next;return (uintptr_t)p;}
__attribute__((noinline)) static uint64_t chunk(uint64_t *a,size_t start,size_t count,int write,uint64_t generation) {
    uint64_t sum=0;
    if(write){for(size_t i=start;i<start+count;i++)a[i]=i+generation;barrier();sum=a[start+count-1];}
    else {barrier();for(size_t i=start;i<start+count;i++)sum+=a[i];}
    return sum;
}
static void *generate(void *arg) {
    generator *g=arg;g->error=pin(g->cpu);uint64_t *a=NULL;
    if(!g->error)g->error=posix_memalign((void **)&a,4096,g->bytes);
    if(g->error){atomic_store_explicit(&g->ready,1,memory_order_release);return NULL;}
    size_t elements=g->bytes/8,block=65536/8;
    for(size_t i=0;i<elements;i++)a[i]=i;
    g->before=sched_getcpu();uint64_t chunks=0,sum=0;size_t offset=0;
    /* Publish ready after initialization; main waits for >= one complete pass. */
    atomic_store_explicit(&g->ready,1,memory_order_release);
    while(!atomic_load_explicit(&stop,memory_order_acquire)) {
        sum+=chunk(a,offset,block,g->write,chunks);chunks++;
        atomic_store_explicit(&g->chunks,chunks,memory_order_release);
        offset+=block;if(offset==elements)offset=0;
    }
    g->after=sched_getcpu();g->checksum=sum;free(a);return NULL;
}
int main(int argc,char **argv) {
    const char *cpulist=NULL,*mode="read";size_t bytes=64ULL<<20,steps=2000000;uint64_t seed=1;
    for(int i=1;i<argc;i+=2){if(i+1>=argc){fprintf(stderr,"options need values\n");return 2;}
        if(!strcmp(argv[i],"--cpus"))cpulist=argv[i+1];
        else if(!strcmp(argv[i],"--mode"))mode=argv[i+1];
        else if(!strcmp(argv[i],"--bytes"))bytes=number(argv[i+1],65536,256ULL<<20);
        else if(!strcmp(argv[i],"--steps"))steps=number(argv[i+1],1,100000000);
        else if(!strcmp(argv[i],"--seed"))seed=number(argv[i+1],1,UINT64_MAX);
        else {fprintf(stderr,"unknown option\n");return 2;}}
    if(!cpulist||bytes%65536||(strcmp(mode,"read")&&strcmp(mode,"write"))){fprintf(stderr,"use --cpus chase,bg,... --mode read|write --bytes multiple-of-65536\n");return 2;}
    int cpus[8],ncpus=0;char *copy=strdup(cpulist),*save=NULL,*token=copy?strtok_r(copy,",",&save):NULL;
    while(token){if(ncpus==8){fprintf(stderr,"at most eight CPUs\n");return 2;}cpus[ncpus]=(int)number(token,0,CPU_SETSIZE-1);for(int i=0;i<ncpus;i++)if(cpus[i]==cpus[ncpus]){fprintf(stderr,"duplicate CPU\n");return 2;}ncpus++;token=strtok_r(NULL,",",&save);}free(copy);
    if(!ncpus||pin(cpus[0])){fprintf(stderr,"chase affinity failed\n");return 2;}
    node *nodes=NULL;if(posix_memalign((void **)&nodes,4096,bytes)){fprintf(stderr,"allocation failed\n");return 2;}
    size_t n=bytes/64,*order=malloc(n*sizeof(*order));unsigned char *seen=calloc(n,1);
    if(!order||!seen){fprintf(stderr,"allocation failed\n");return 2;}
    for(size_t i=0;i<n;i++)order[i]=i;
    uint64_t state=seed;
    for(size_t i=n-1;i;i--){size_t j=rng(&state)%(i+1),tmp=order[i];order[i]=order[j];order[j]=tmp;}
    for(size_t i=0;i<n;i++)nodes[order[i]].next=&nodes[order[(i+1)%n]];
    node *head=&nodes[order[0]],*p=head;
    for(size_t i=0;i<n;i++){size_t index=(size_t)(p-nodes);if(index>=n||seen[index]){fprintf(stderr,"invalid ring\n");return 2;}seen[index]=1;p=p->next;}
    if(p!=head){fprintf(stderr,"ring does not close\n");return 2;}
    uintptr_t expected=(uintptr_t)&nodes[order[steps%n]];
    free(seen);free(order);sink=chase(head,n);
    generator generators[7]={0};pthread_t threads[7];atomic_init(&stop,0);
    for(int i=0;i<ncpus-1;i++){generator *g=&generators[i];atomic_init(&g->chunks,0);atomic_init(&g->ready,0);g->cpu=cpus[i+1];g->bytes=bytes;g->write=!strcmp(mode,"write");if(pthread_create(&threads[i],NULL,generate,g)){fprintf(stderr,"thread creation failed\n");exit(2);}}
    for(int i=0;i<ncpus-1;i++){generator *g=&generators[i];while(!atomic_load_explicit(&g->ready,memory_order_acquire))sched_yield();if(g->error){fprintf(stderr,"generator affinity/allocation failed\n");exit(2);}while(atomic_load_explicit(&g->chunks,memory_order_acquire)<bytes/65536)sched_yield();}
    uint64_t before[7]={0},after[7]={0};for(int i=0;i<ncpus-1;i++)before[i]=atomic_load_explicit(&generators[i].chunks,memory_order_acquire);
    int cpu_before=sched_getcpu();barrier();uint64_t start=clock_ns();sink=chase(head,steps);barrier();uint64_t elapsed=clock_ns()-start;int cpu_after=sched_getcpu();
    for(int i=0;i<ncpus-1;i++)after[i]=atomic_load_explicit(&generators[i].chunks,memory_order_acquire);
    atomic_store_explicit(&stop,1,memory_order_release);
    for(int i=0;i<ncpus-1;i++)if(pthread_join(threads[i],NULL)){fprintf(stderr,"join failed\n");return 2;}
    if(cpu_before!=cpus[0]||cpu_after!=cpus[0]||!elapsed||sink!=expected){fprintf(stderr,"chase placement/clock/checksum failed\n");return 2;}
    printf("{\"mode\":\"%s\",\"bytes_per_worker\":%zu,\"background_threads\":%d,\"chase_cpu\":%d,\"steps\":%zu,\"elapsed_ns\":%"PRIu64",\"seed\":%"PRIu64",\"checksum\":\"%"PRIuPTR"\",\"chunk_bytes\":65536,\"generators\":[",mode,bytes,ncpus-1,cpus[0],steps,elapsed,seed,sink);
    for(int i=0;i<ncpus-1;i++){generator *g=&generators[i];if(g->before!=g->cpu||g->after!=g->cpu){fprintf(stderr,"generator placement changed\n");return 2;}printf("%s{\"cpu\":%d,\"chunks_before\":%"PRIu64",\"chunks_after\":%"PRIu64",\"useful_bytes\":%"PRIu64",\"checksum\":\"%"PRIu64"\"}",i?",":"",g->cpu,before[i],after[i],(after[i]-before[i])*65536,g->checksum);}
    puts("]}");free(nodes);return 0;
}
