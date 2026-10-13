/* fork64.c - fork is cheap until someone writes.
   Write 64 MiB (small pages), fork, let the child write every page, then (after the child has
   exited) let the parent write every page. 3 runs.
   Build: gcc -O2 -o fork64 fork64.c      Run: taskset -c 0 ./fork64 */
#include "../common/lab.h"
#include <sys/wait.h>

#define SZ (64UL << 20)
static void pass(volatile char *p, char v) { for (unsigned long o = 0; o < SZ; o += 4096) p[o] = v; }

int main(void)
{
    (void)now_ns(); (void)faults();
    for (int run = 1; run <= 3; run++) {
        char *p = mmap(NULL, SZ, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        madvise(p, SZ, MADV_NOHUGEPAGE);
        pass(p, 1);
        int pfd[2];
        if (pipe(pfd)) return 1;
        uint64_t t = now_ns();
        pid_t pid = fork();
        if (pid == 0) {
            uint64_t tf = now_ns() - t;
            long f = faults();
            uint64_t t0 = now_ns();
            pass(p, 2);
            uint64_t dt = now_ns() - t0;
            long nf = faults() - f;
            char msg[200];
            int n = snprintf(msg, sizeof msg, "run %d  fork returned in the child after %.2f ms\n       child store pass:  %ld faults, %.1f ms, %.0f ns per fault\n", run, tf / 1e6, nf, dt / 1e6, (double)dt / nf);
            if (write(pfd[1], msg, n) < 0) {}
            _exit(0);
        }
        char buf[256];
        ssize_t n = read(pfd[0], buf, sizeof buf - 1);
        buf[n > 0 ? n : 0] = 0;
        waitpid(pid, NULL, 0);
        long f = faults();
        uint64_t t0 = now_ns();
        pass(p, 3);
        uint64_t dt = now_ns() - t0;
        long nf = faults() - f;
        printf("%s       parent store pass: %ld faults, %.1f ms, %.0f ns per fault (after the child exited)\n", buf, nf, dt / 1e6, (double)dt / nf);
        munmap(p, SZ);
        close(pfd[0]); close(pfd[1]);
    }
    return 0;
}
