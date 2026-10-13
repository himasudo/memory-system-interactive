/* eat.c - allocate N MiB of anonymous memory and write one byte in every page, printing every
   16 MiB. Used by reclaim.sh inside a memory cgroup with a 64 MiB limit.
   Build: gcc -O2 -o eat eat.c      Run: ./eat 128 */
#include "../common/lab.h"

int main(int argc, char **argv)
{
    long mib = argc > 1 ? atol(argv[1]) : 128;
    char *p = mmap(NULL, mib << 20, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (p == MAP_FAILED) { perror("mmap"); return 1; }
    setvbuf(stdout, NULL, _IONBF, 0);
    for (long off = 0; off < (mib << 20); off += 4096) {
        p[off] = 1;
        if (off % (16 << 20) == 0) printf("written %ld MiB\n", off >> 20);
    }
    printf("written all %ld MiB\n", mib);
    return 0;
}
