/* Linux native Phase 1 experiments. No instruction-count or DRAM-byte claims. */
#define _GNU_SOURCE
#include <errno.h>
#include <inttypes.h>
#include <sched.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct Node { struct Node *next; unsigned char padding[64-sizeof(void*)]; } Node;
_Static_assert(sizeof(Node)==64, "One pointer node per reference-machine cache line");
static volatile uintptr_t sink;
static uint64_t rng_state;
static uint64_t random64(void) { rng_state^=rng_state<<13; rng_state^=rng_state>>7; rng_state^=rng_state<<17; return rng_state; }
static uint64_t ns(void) { struct timespec t; if(clock_gettime(CLOCK_MONOTONIC_RAW,&t)) {perror("clock_gettime");exit(1);} return (uint64_t)t.tv_sec*1000000000ULL+(uint64_t)t.tv_nsec; }
static void barrier(void) { __asm__ __volatile__("" ::: "memory"); }
static uint64_t number(const char *s) { char *end;errno=0; if(!*s||*s=='-') {fprintf(stderr,"Invalid number\n");exit(2);} unsigned long long n=strtoull(s,&end,10);if(errno||*end){fprintf(stderr,"Invalid number: %s\n",s);exit(2);}return n; }
/* Explicit kernels keep independent pointer dependencies visible in assembly.
   More chains may require register spills: inspect your compiled binary. */
#define DECL1 Node *p0=heads[0];
#define DECL2 DECL1 Node *p1=heads[1];
#define DECL4 DECL2 Node *p2=heads[2],*p3=heads[3];
#define DECL8 DECL4 Node *p4=heads[4],*p5=heads[5],*p6=heads[6],*p7=heads[7];
#define DECL16 DECL8 Node *p8=heads[8],*p9=heads[9],*p10=heads[10],*p11=heads[11],*p12=heads[12],*p13=heads[13],*p14=heads[14],*p15=heads[15];
#define STEP1 p0=p0->next;
#define STEP2 STEP1 p1=p1->next;
#define STEP4 STEP2 p2=p2->next;p3=p3->next;
#define STEP8 STEP4 p4=p4->next;p5=p5->next;p6=p6->next;p7=p7->next;
#define STEP16 STEP8 p8=p8->next;p9=p9->next;p10=p10->next;p11=p11->next;p12=p12->next;p13=p13->next;p14=p14->next;p15=p15->next;
#define SUM1 (uintptr_t)p0
#define SUM2 SUM1 ^ (uintptr_t)p1
#define SUM4 SUM2 ^ (uintptr_t)p2 ^ (uintptr_t)p3
#define SUM8 SUM4 ^ (uintptr_t)p4 ^ (uintptr_t)p5 ^ (uintptr_t)p6 ^ (uintptr_t)p7
#define SUM16 SUM8 ^ (uintptr_t)p8 ^ (uintptr_t)p9 ^ (uintptr_t)p10 ^ (uintptr_t)p11 ^ (uintptr_t)p12 ^ (uintptr_t)p13 ^ (uintptr_t)p14 ^ (uintptr_t)p15
#define KERNEL(N) __attribute__((noinline)) static uintptr_t chase##N(Node **heads,size_t steps) { DECL##N barrier();for(size_t j=0;j<steps;j++){STEP##N} return SUM##N; }
KERNEL(1) KERNEL(2) KERNEL(4) KERNEL(8) KERNEL(16)
typedef uintptr_t (*Chase)(Node **,size_t);
__attribute__((noinline)) static uintptr_t read_stream(uint64_t *a,size_t n,size_t passes) {
    uint64_t sum=0;for(size_t p=0;p<passes;p++){barrier();for(size_t i=0;i<n;i++)sum+=a[i];}return (uintptr_t)sum;
}
__attribute__((noinline)) static uintptr_t write_stream(uint64_t *a,size_t n,size_t passes) {
    for(size_t p=0;p<passes;p++){for(size_t i=0;i<n;i++)a[i]=(uint64_t)i+p;barrier();}return (uintptr_t)a[n-1];
}
static void usage(void) {fprintf(stderr,"memlab --mode chase|read|write --bytes N --chains 1|2|4|8|16 --steps N --repeats N --cpu N --seed N\nFor chase, steps are loads per chain. For read/write, steps are whole-array passes.\n");}
int main(int argc,char **argv) {
    const char *mode="chase";size_t bytes=1<<20,chains=1,steps=2000000,repeats=7,cpu=0;uint64_t seed=1;
    for(int i=1;i<argc;i+=2){
        if(i+1==argc){usage();return 2;}
        if(!strcmp(argv[i],"--mode"))mode=argv[i+1];
        else if(!strcmp(argv[i],"--bytes"))bytes=number(argv[i+1]);
        else if(!strcmp(argv[i],"--chains"))chains=number(argv[i+1]);
        else if(!strcmp(argv[i],"--steps"))steps=number(argv[i+1]);
        else if(!strcmp(argv[i],"--repeats"))repeats=number(argv[i+1]);
        else if(!strcmp(argv[i],"--cpu"))cpu=number(argv[i+1]);
        else if(!strcmp(argv[i],"--seed"))seed=number(argv[i+1]);
        else {usage();return 2;}
    }
    int chase=!strcmp(mode,"chase"),readmode=!strcmp(mode,"read"),writemode=!strcmp(mode,"write");
    if(!(chase||readmode||writemode)||bytes<1024||bytes>(1ULL<<30)||bytes%64||!steps||steps>100000000||!repeats||repeats>100||cpu>=CPU_SETSIZE||!seed||!(chains==1||chains==2||chains==4||chains==8||chains==16)||bytes/64%chains||(!chase&&chains!=1)||(!chase&&steps>10000)){usage();return 2;}
    cpu_set_t set;CPU_ZERO(&set);CPU_SET(cpu,&set);if(sched_setaffinity(0,sizeof(set),&set)){perror("sched_setaffinity");return 1;}
    void *memory=NULL;if(posix_memalign(&memory,4096,bytes)){fprintf(stderr,"Allocation failed\n");return 1;}memset(memory,1,bytes);
    Node **heads=calloc(chains,sizeof(*heads));if(!heads){free(memory);return 1;}
    Chase kernel=chains==1?chase1:chains==2?chase2:chains==4?chase4:chains==8?chase8:chase16;
    size_t n=bytes/sizeof(Node), per_chain=n/chains;
    if(chase){
        size_t *order=malloc(n*sizeof(*order));if(!order){free(heads);free(memory);return 1;}
        for(size_t i=0;i<n;i++)order[i]=i;
        rng_state=seed;
        for(size_t i=n-1;i>0;i--){size_t j=random64()%(i+1),tmp=order[i];order[i]=order[j];order[j]=tmp;}
        Node *nodes=memory;
        for(size_t c=0;c<chains;c++){size_t base=c*per_chain;heads[c]=&nodes[order[base]];for(size_t i=0;i<per_chain;i++)nodes[order[base+i]].next=&nodes[order[base+(i+1)%per_chain]];}
        /* Validate complete disjoint coverage, without relying on timings. */
        unsigned char *seen=calloc(n,1);if(!seen){free(order);free(heads);free(memory);return 1;}
        for(size_t c=0;c<chains;c++){Node *p=heads[c];for(size_t i=0;i<per_chain;i++){size_t index=(size_t)(p-nodes);if(index>=n||seen[index]){fprintf(stderr,"Ring validation failed\n");return 1;}seen[index]=1;p=p->next;}if(p!=heads[c]){fprintf(stderr,"Ring does not close\n");return 1;}}
        free(seen);free(order);
    }
    for(size_t r=0;r<repeats;r++){
        /* Full warm traversal before every repetition; first touch excluded. */
        if(chase)sink=kernel(heads,per_chain);
        else if(readmode)sink=read_stream(memory,bytes/8,1);
        else sink=write_stream(memory,bytes/8,1);
        int before=sched_getcpu();barrier();uint64_t begin=ns();
        uintptr_t sum=chase?kernel(heads,steps):readmode?read_stream(memory,bytes/8,steps):write_stream(memory,bytes/8,steps);
        barrier();uint64_t elapsed=ns()-begin;sink=sum;int after=sched_getcpu();
        if(before!=(int)cpu||after!=(int)cpu||!elapsed){fprintf(stderr,"CPU placement or clock validation failed\n");return 1;}
        uint64_t operations=chase?(uint64_t)steps*chains:(uint64_t)steps*(bytes/8);
        printf("{\"mode\":\"%s\",\"bytes\":%zu,\"chains\":%zu,\"steps\":%zu,\"repeat\":%zu,\"seed\":%"PRIu64",\"cpu\":%zu,\"cpu_before\":%d,\"cpu_after\":%d,\"elapsed_ns\":%"PRIu64",\"operations\":%"PRIu64",\"useful_bytes\":%"PRIu64",\"checksum\":\"%"PRIuPTR"\",\"warmup\":\"full traversal before each repetition\"}\n",mode,bytes,chains,steps,r,seed,cpu,before,after,elapsed,operations,operations*8,sum);
    }
    free(heads);free(memory);return 0;
}
