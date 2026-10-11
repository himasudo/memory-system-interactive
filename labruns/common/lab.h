/* Helpers shared by the lab-run programs.
   - pagemap(): what /proc/self/pagemap says about one virtual page
   - faults(): minor + major page faults so far (getrusage)
   - tr_*(): turn kernel trace events on and off, and write markers into the trace
   - status_kb(): one line of /proc/self/status, such as VmPTE
   Physical frame numbers and the trace need root. Without root the PFN reads as 0
   and the trace calls do nothing. */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <sched.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#define TRACEFS "/sys/kernel/tracing/"

/* The file is reopened after fork: an inherited descriptor would still show the parent's pages. */
static inline uint64_t pagemap(void *va)
{
    static int fd = -1;
    static pid_t owner;
    uint64_t e = 0;
    if (fd >= 0 && owner != getpid()) { close(fd); fd = -1; }
    if (fd < 0) { fd = open("/proc/self/pagemap", O_RDONLY); owner = getpid(); }
    if (fd < 0 || pread(fd, &e, 8, ((uintptr_t)va / 4096) * 8) != 8) return 0;
    return e;
}
static inline void show_pagemap(const char *what, void *va)
{
    uint64_t e = pagemap(va);
    printf("%-28s pagemap=0x%016llx  present=%d exclusive=%d pfn=0x%llx\n", what,
           (unsigned long long)e, (int)(e >> 63 & 1), (int)(e >> 56 & 1),
           (unsigned long long)(e & ((1ULL << 55) - 1)));
}
static inline long faults(void)
{
    struct rusage r;
    getrusage(RUSAGE_SELF, &r);
    return r.ru_minflt + r.ru_majflt;
}
static inline void faults2(long *minor, long *major)
{
    struct rusage r;
    getrusage(RUSAGE_SELF, &r);
    *minor = r.ru_minflt;
    *major = r.ru_majflt;
}
static inline long status_kb(const char *key)
{
    char line[256];
    long v = -1;
    size_t n = strlen(key);
    FILE *f = fopen("/proc/self/status", "r");
    if (!f) return -1;
    while (fgets(line, sizeof line, f))
        if (!strncmp(line, key, n) && line[n] == ':') { v = atol(line + n + 1); break; }
    fclose(f);
    return v;
}
static inline void pin_cpu(int cpu)
{
    cpu_set_t s;
    CPU_ZERO(&s);
    CPU_SET(cpu, &s);
    sched_setaffinity(0, sizeof s, &s);
}
static inline uint64_t now_ns(void)
{
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (uint64_t)t.tv_sec * 1000000000ull + t.tv_nsec;
}

/* ---- kernel trace events ---- */
static inline int tr_write(const char *file, const char *val)
{
    char path[256];
    snprintf(path, sizeof path, TRACEFS "%s", file);
    int fd = open(path, O_WRONLY | O_TRUNC);
    if (fd < 0) return -1;
    int r = write(fd, val, strlen(val));
    close(fd);
    return r < 0 ? -1 : 0;
}
/* events: NULL-terminated list such as "exceptions/page_fault_user" */
static inline void tr_on(const char **events, int follow_children)
{
    char pid[32];
    tr_write("tracing_on", "0");
    tr_write("events/enable", "0");
    tr_write("trace", "");
    snprintf(pid, sizeof pid, "%d", getpid());
    tr_write("set_event_pid", pid);
    tr_write("options/event-fork", follow_children ? "1" : "0");
    for (const char **e = events; *e; e++) {
        char f[200];
        snprintf(f, sizeof f, "events/%s/enable", *e);
        tr_write(f, "1");
    }
    tr_write("tracing_on", "1");
}
static inline void tr_mark(const char *fmt, ...)
{
    static int fd = -1;
    char buf[256];
    va_list ap;
    if (fd < 0) fd = open(TRACEFS "trace_marker", O_WRONLY);
    if (fd < 0) return;
    va_start(ap, fmt);
    int n = vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    if (write(fd, buf, n) < 0) {}
}
static inline void tr_off(void)
{
    tr_write("tracing_on", "0");
    tr_write("events/enable", "0");
    tr_write("set_event_pid", "");
}

/* ---- a log kept in a shared, pre-faulted buffer, printed at the end ----
   printf while tracing would allocate page-cache pages for the output file and add noise
   to the trace. Parent and child both append here; the parent prints it all at the end. */
static char *lg_buf;
static size_t *lg_len;
#define LG_SIZE (1u << 20)
static inline void lg_init(void)
{
    lg_buf = mmap(NULL, LG_SIZE + 4096, PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANONYMOUS, -1, 0);
    memset(lg_buf, 0, LG_SIZE + 4096);
    lg_len = (size_t *)(lg_buf + LG_SIZE);
}
static inline void lg(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    int n = vsnprintf(lg_buf + *lg_len, LG_SIZE - *lg_len, fmt, ap);
    va_end(ap);
    if (n > 0) *lg_len += n;
}
static inline void lg_flush(void)
{
    if (write(1, lg_buf, *lg_len) < 0) {}
    *lg_len = 0;
}
static inline void lg_pagemap(const char *what, void *va)
{
    uint64_t e = pagemap(va);
    lg("%-30s pagemap=0x%016llx  present=%d exclusive=%d pfn=0x%llx\n", what,
       (unsigned long long)e, (int)(e >> 63 & 1), (int)(e >> 56 & 1),
       (unsigned long long)(e & ((1ULL << 55) - 1)));
}
