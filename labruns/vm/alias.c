/* alias.c - two virtual addresses for one frame.
   1. One 4 KiB memfd (a file that lives only in RAM) mapped twice with MAP_SHARED.
   2. Where getpid's code is, in this process and in a second process started separately:
      run it twice ("./alias" then "./alias libc") and compare the frames.
   Build: gcc -O1 -o alias alias.c      Run as root: ./alias; ./alias libc */
#include "../common/lab.h"
#include <sys/syscall.h>

int main(int argc, char **argv)
{
    if (argc > 1) {
        void *f = (void *)getpid;
        printf("process %d: getpid at %p, pagemap pfn=0x%llx\n", getpid(), f, (unsigned long long)(pagemap(f) & ((1ULL << 55) - 1)));
        return 0;
    }
    int fd = memfd_create("one-frame", 0);
    if (fd < 0 || ftruncate(fd, 4096)) { perror("memfd"); return 1; }
    char *a = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    char *b = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    strcpy(a + 0xd4e, "written through view A");
    printf("view A %p  view B %p\n", (void *)a, (void *)b);
    printf("read through view B at +0xd4e: \"%s\"\n", b + 0xd4e);
    printf("pagemap view A: pfn=0x%llx   view B: pfn=0x%llx\n",
           (unsigned long long)(pagemap(a) & ((1ULL << 55) - 1)), (unsigned long long)(pagemap(b) & ((1ULL << 55) - 1)));
    char line[512];
    FILE *m = fopen("/proc/self/maps", "r");
    while (fgets(line, sizeof line, m)) if (strstr(line, "memfd:")) printf("%s", line);
    return 0;
}
