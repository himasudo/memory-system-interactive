/* major.c - a file mapping: the first load waits for the disk (a major fault); a store into a
   MAP_PRIVATE mapping makes a private copy and leaves the file alone.
   Build: gcc -O1 -o major major.c      Run as root: taskset -c 0 ./major /path/on/a/disk/hello.txt */
#include "../common/lab.h"

int main(int argc, char **argv)
{
    static const char *ev[] = {"exceptions/page_fault_user", "kmem/mm_page_alloc", "filemap/mm_filemap_add_to_page_cache", "tlb/tlb_flush", NULL};
    const char *path = argc > 1 ? argv[1] : "hello.txt";
    char buf[4096];
    long mi, ma, mi2, ma2;
    struct stat st;
    lg_init();
    memset(buf, 0, sizeof buf);
    strcpy(buf, "HELLO from the file on disk");
    int fd = open(path, O_RDWR | O_CREAT | O_TRUNC, 0644);
    if (fd < 0 || write(fd, buf, sizeof buf) != sizeof buf) { perror(path); return 1; }
    fsync(fd);
    fstat(fd, &st);
    /* Evict only the file's clean cache pages, not the host-wide page cache. */
    int advice = posix_fadvise(fd, 0, 0, POSIX_FADV_DONTNEED);
    if (advice) {
        fprintf(stderr, "file-specific page-cache eviction failed: %s\\n", strerror(advice));
        return 1;
    }
    char *p = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE, fd, 0);
    lg("file %s, inode %lu, mapped MAP_PRIVATE at %p\n", path, (unsigned long)st.st_ino, (void *)p);
    (void)pagemap(p); faults2(&mi, &ma); tr_mark("warm-up");
    tr_on(ev, 0);
    tr_mark("== first load");
    faults2(&mi, &ma);
    volatile char c = p[0];
    faults2(&mi2, &ma2);
    lg("first load : reads '%c', major +%ld minor +%ld\n", c, ma2 - ma, mi2 - mi);
    lg_pagemap("after the first load", p);
    tr_mark("== second load");
    faults2(&mi, &ma);
    c = p[1];
    faults2(&mi2, &ma2);
    lg("second load: major +%ld minor +%ld\n", ma2 - ma, mi2 - mi);
    tr_mark("== store p[0] = 'J'");
    faults2(&mi, &ma);
    p[0] = 'J';
    faults2(&mi2, &ma2);
    tr_off();
    lg("store      : major +%ld minor +%ld\n", ma2 - ma, mi2 - mi);
    lg_pagemap("after the store", p);
    pread(fd, buf, 32, 0);
    lg("memory now reads \"%.27s\", the file still reads \"%.27s\"\n", p, buf);
    lg_flush();
    return 0;
}
