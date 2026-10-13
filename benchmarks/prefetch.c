/* One 8-byte read per 64-byte line. Software hints are not hardware counters. */
#define _GNU_SOURCE
#include <errno.h>
#include <inttypes.h>
#include <sched.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static volatile uint64_t sink;
static uint64_t number(const char *s) {
    char *end; errno=0;
    if(!*s || *s=='-') { fprintf(stderr,"Invalid number\n"); exit(2); }
    unsigned long long n=strtoull(s,&end,10);
    if(errno || *end) { fprintf(stderr,"Invalid number\n"); exit(2); }
    return n;
}
static uint64_t ns(void) {
    struct timespec t;
    if(clock_gettime(CLOCK_MONOTONIC_RAW,&t)) { perror("clock_gettime"); exit(1); }
    return (uint64_t)t.tv_sec*1000000000ULL+(uint64_t)t.tv_nsec;
}
static void barrier(void) { __asm__ __volatile__("" ::: "memory"); }
__attribute__((noinline)) static uint64_t plain(const uint64_t *a,size_t mask,size_t loads,size_t stride) {
    size_t index=0; uint64_t sum=0;
    for(size_t i=0;i<loads;i++) { sum+=a[index*8]; index=(index+stride)&mask; }
    return sum;
}
__attribute__((noinline)) static uint64_t hinted(const uint64_t *a,size_t mask,size_t loads,size_t stride,size_t distance) {
    size_t index=0,ahead=distance*stride; uint64_t sum=0;
    for(size_t i=0;i<loads;i++) {
        __builtin_prefetch(a+(((index+ahead)&mask)*8),0,3);
        sum+=a[index*8]; index=(index+stride)&mask;
    }
    return sum;
}
int main(int argc,char **argv) {
    size_t bytes=1<<20,passes=16,distance=0,stride=1,repeats=7,cpu=0;
    for(int i=1;i<argc;i+=2) {
        if(i+1==argc) return 2;
        size_t v=number(argv[i+1]);
        if(!strcmp(argv[i],"--bytes")) bytes=v;
        else if(!strcmp(argv[i],"--passes")) passes=v;
        else if(!strcmp(argv[i],"--distance")) distance=v;
        else if(!strcmp(argv[i],"--stride")) stride=v;
        else if(!strcmp(argv[i],"--repeats")) repeats=v;
        else if(!strcmp(argv[i],"--cpu")) cpu=v;
        else return 2;
    }
    if(bytes<4096 || bytes>(1ULL<<28) || (bytes&(bytes-1)) || !passes || passes>64 || distance>64 || !stride || stride>63 || !(stride&1) || !repeats || repeats>100 || cpu>=CPU_SETSIZE) return 2;
    cpu_set_t allowed,set;
    if(sched_getaffinity(0,sizeof(allowed),&allowed) || !CPU_ISSET(cpu,&allowed)) return 2;
    CPU_ZERO(&set); CPU_SET(cpu,&set);
    if(sched_setaffinity(0,sizeof(set),&set)) { perror("affinity"); return 1; }
    uint64_t *a=NULL;
    if(posix_memalign((void**)&a,4096,bytes)) return 1;
    memset(a,0,bytes);
    size_t lines=bytes/64,loads=lines*passes,mask=lines-1;
    for(size_t i=0;i<lines;i++) a[i*8]=i+1;
    /* Odd stride visits every line of a power-of-two ring. The independent
       closed-form checksum verifies full passes, including wrapped hints. */
    uint64_t expected=(uint64_t)passes*lines*(lines+1)/2;
    sink=plain(a,mask,loads,stride);
    for(size_t trial=0;trial<repeats;trial++) {
        barrier(); int before=sched_getcpu(); uint64_t begin=ns();
        uint64_t sum=distance?hinted(a,mask,loads,stride,distance):plain(a,mask,loads,stride);
        barrier(); uint64_t elapsed=ns()-begin; int after=sched_getcpu(); sink=sum;
        if(sum!=expected || before!=(int)cpu || after!=(int)cpu || !elapsed) { free(a); return 1; }
        printf("{\"bytes\":%zu,\"loads\":%zu,\"passes\":%zu,\"stride_lines\":%zu,\"distance\":%zu,\"trial\":%zu,\"elapsed_ns\":%"PRIu64",\"useful_bytes\":%zu,\"checksum\":\"%"PRIu64"\",\"expected_checksum\":\"%"PRIu64"\",\"cpu_before\":%d,\"cpu_after\":%d,\"verified\":true}\n",bytes,loads,passes,stride,distance,trial,elapsed,loads*8,sum,expected,before,after);
    }
    free(a); return 0;
}
