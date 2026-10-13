/* Linux VM lifecycle observations. Timings are whole touch stages, not load latency. */
#define _GNU_SOURCE
#include <errno.h>
#include <inttypes.h>
#include <sched.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/resource.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

typedef struct {uint64_t ns, checksum; long minor, major; int before, after;} sample;
static void fail(const char *what){perror(what);exit(1);}
static uint64_t number(const char *s){char *end;errno=0;unsigned long long n=strtoull(s,&end,10);if(errno||!*s||*s=='-'||*end){fprintf(stderr,"invalid integer\n");exit(2);}return n;}
static uint64_t now(void){struct timespec t;if(clock_gettime(CLOCK_MONOTONIC_RAW,&t))fail("clock_gettime");return (uint64_t)t.tv_sec*1000000000+t.tv_nsec;}
static sample touch(volatile unsigned char *p,size_t bytes,size_t page,int write_value){
    struct rusage a,b;sample r={0};r.before=sched_getcpu();if(getrusage(RUSAGE_SELF,&a))fail("getrusage");uint64_t start=now(),sum=0;
    for(size_t i=0;i<bytes;i+=page){if(write_value>=0)p[i]=(unsigned char)write_value;sum+=p[i];}
    r.ns=now()-start;if(getrusage(RUSAGE_SELF,&b))fail("getrusage");r.after=sched_getcpu();r.minor=b.ru_minflt-a.ru_minflt;r.major=b.ru_majflt-a.ru_majflt;r.checksum=sum;return r;
}
static void transfer(int fd,void *data,size_t size,int writing){
    size_t n=0;while(n<size){ssize_t got=writing?write(fd,(char *)data+n,size-n):read(fd,(char *)data+n,size-n);if(got<0&&errno==EINTR)continue;if(got<=0){fprintf(stderr,"incomplete pipe/file transfer\n");exit(1);}n+=(size_t)got;}
}
static void snapshot(void *address,char *out,size_t cap){
    FILE *f=fopen("/proc/self/smaps","r");if(!f){snprintf(out,cap,"unavailable: %s",strerror(errno));return;}char line[512];size_t used=0;int found=0;
    while(fgets(line,sizeof(line),f)){unsigned long lo,hi;
        if(sscanf(line,"%lx-%lx",&lo,&hi)==2){if(found)break;found=(uintptr_t)address>=lo&&(uintptr_t)address<hi;if(!found)continue;}
        if(found&&(strchr(line,'-')||!strncmp(line,"Rss:",4)||!strncmp(line,"Pss:",4)||!strncmp(line,"Anonymous:",10)||!strncmp(line,"AnonHugePages:",14)||!strncmp(line,"KernelPageSize:",15)||!strncmp(line,"MMUPageSize:",12)||!strncmp(line,"THPeligible:",12)||!strncmp(line,"VmFlags:",8))){size_t n=strlen(line);if(used+n<cap){memcpy(out+used,line,n);used+=n;}}
    }out[used]=0;fclose(f);
}
static void quoted(const char *s){putchar('"');for(;*s;s++){unsigned char c=(unsigned char)*s;if(c=='"'||c=='\\'){putchar('\\');putchar(c);}else if(c=='\n')fputs("\\n",stdout);else if(c<32)printf("\\u%04x",c);else putchar(c);}putchar('"');}
int main(int argc,char **argv){
    size_t bytes=16*1024*1024;int cpu=-1;const char *kind="anon",*advice="base";
    for(int i=1;i<argc;i++){if(i+1>=argc){fprintf(stderr,"missing argument\n");return 2;}const char *v=argv[++i];if(!strcmp(argv[i-1],"--bytes"))bytes=number(v);else if(!strcmp(argv[i-1],"--cpu")){uint64_t c=number(v);if(c>=CPU_SETSIZE)return 2;cpu=(int)c;}else if(!strcmp(argv[i-1],"--kind"))kind=v;else if(!strcmp(argv[i-1],"--advice"))advice=v;else return 2;}
    long base_page=sysconf(_SC_PAGESIZE);if(base_page<=0)fail("page size");size_t page=(size_t)base_page;int anon=!strcmp(kind,"anon"),shared=!strcmp(kind,"file-shared"),huge=!strcmp(advice,"huge");
    if((!anon&&!shared&&strcmp(kind,"file-private"))||(strcmp(advice,"base")&&!huge)||(!anon&&huge)||bytes<page||bytes>128*1024*1024||bytes%page)return 2;
    cpu_set_t allowed,set;CPU_ZERO(&allowed);if(sched_getaffinity(0,sizeof(allowed),&allowed))fail("sched_getaffinity");if(cpu<0){for(int c=0;c<CPU_SETSIZE;c++)if(CPU_ISSET(c,&allowed)){cpu=c;break;}}if(cpu<0||!CPU_ISSET(cpu,&allowed))return 2;
    CPU_ZERO(&set);CPU_SET(cpu,&set);if(sched_setaffinity(0,sizeof(set),&set))fail("sched_setaffinity");
    int fd=-1;if(!anon){char name[]="/tmp/memory-lab-vm-XXXXXX";fd=mkstemp(name);if(fd<0)fail("mkstemp");if(unlink(name))fail("unlink");unsigned char buf[65536];memset(buf,10,sizeof(buf));for(size_t off=0;off<bytes;){size_t n=bytes-off<sizeof(buf)?bytes-off:sizeof(buf);transfer(fd,buf,n,1);off+=n;}}
    /* Own the entire reservation before replacing its middle with MAP_FIXED.
       Guard VMAs isolate smaps accounting and a 2 MiB boundary permits PMD THP. */
    size_t alignment=2*1024*1024,total=bytes+alignment+2*page;
    void *reservation=mmap(NULL,total,PROT_NONE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);if(reservation==MAP_FAILED)fail("reserve mmap");
    uintptr_t addr=((uintptr_t)reservation+page+alignment-1)&~(uintptr_t)(alignment-1);
    volatile unsigned char *p=mmap((void *)addr,bytes,PROT_READ|PROT_WRITE,MAP_FIXED|(shared?MAP_SHARED:MAP_PRIVATE)|(anon?MAP_ANONYMOUS:0),fd,0);if(p==MAP_FAILED)fail("data mmap");
    int advice_errno=0;if(madvise((void *)p,bytes,huge?MADV_HUGEPAGE:MADV_NOHUGEPAGE))advice_errno=errno;
    char smaps[4][4096];sample samples[5];struct rusage warm;getrusage(RUSAGE_SELF,&warm);(void)now();snapshot((void *)p,smaps[0],sizeof(smaps[0]));
    samples[0]=touch(p,bytes,page,-1);snapshot((void *)p,smaps[1],sizeof(smaps[1]));
    samples[1]=touch(p,bytes,page,7);snapshot((void *)p,smaps[2],sizeof(smaps[2]));samples[2]=touch(p,bytes,page,7);
    int pipefd[2];if(pipe(pipefd))fail("pipe");pid_t child=fork();if(child<0)fail("fork");
    if(!child){close(pipefd[0]);sample result=touch(p,bytes,page,42);transfer(pipefd[1],&result,sizeof(result),1);close(pipefd[1]);_exit(0);}
    close(pipefd[1]);transfer(pipefd[0],&samples[3],sizeof(samples[3]),0);close(pipefd[0]);int status;if(waitpid(child,&status,0)<0)fail("waitpid");if(!WIFEXITED(status)||WEXITSTATUS(status)){fprintf(stderr,"child failed\n");return 1;}
    samples[4]=touch(p,bytes,page,-1);snapshot((void *)p,smaps[3],sizeof(smaps[3]));
    uint64_t expected[5]={bytes/page*(anon?0:10),bytes/page*7,bytes/page*7,bytes/page*42,bytes/page*(shared?42:7)},backing=0;
    for(int i=0;i<5;i++)if(samples[i].checksum!=expected[i]||samples[i].before!=cpu||samples[i].after!=cpu||!samples[i].ns){fprintf(stderr,"content/affinity verification failed\n");return 1;}
    if(!anon){if(shared&&msync((void *)p,bytes,MS_SYNC))fail("msync");for(size_t off=0;off<bytes;off+=page){unsigned char v;ssize_t n;do{n=pread(fd,&v,1,(off_t)off);}while(n<0&&errno==EINTR);if(n!=1)fail("pread");backing+=v;}if(backing!=(bytes/page)*(shared?42:10)){fprintf(stderr,"file backing verification failed\n");return 1;}}
    const char *names[]={"first-read","first-write","repeat-write","child-write","parent-check"},*snapnames[]={"before-touch","after-read","after-write","after-child"};
    printf("{\"kind\":\"%s\",\"advice\":\"%s\",\"advice_errno\":%d,\"bytes\":%zu,\"page_bytes\":%zu,\"cpu\":%d,\"stages\":[",kind,advice,advice_errno,bytes,page,cpu);
    for(int i=0;i<5;i++)printf("%s{\"name\":\"%s\",\"elapsed_ns\":%"PRIu64",\"minor\":%ld,\"major\":%ld,\"checksum\":%"PRIu64",\"cpu_before\":%d,\"cpu_after\":%d}",i?",":"",names[i],samples[i].ns,samples[i].minor,samples[i].major,samples[i].checksum,samples[i].before,samples[i].after);
    fputs("],\"smaps\":{",stdout);for(int i=0;i<4;i++){if(i)putchar(',');quoted(snapnames[i]);putchar(':');quoted(smaps[i]);}printf("},\"verification\":{\"passed\":true,\"parent_word\":%d,\"child_word\":42,\"file_checksum\":%"PRIu64"}}\n",shared?42:7,backing);
    if(munmap(reservation,total))fail("munmap");
    if(fd>=0)close(fd);
    return 0;
}
