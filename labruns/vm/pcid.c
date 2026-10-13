/* pcid.c - two processes on one CPU pass a byte back and forth 1000 times through pipes.
   Every pass is a context switch to the other address space. The tlb_flush trace event says,
   for each switch, whether the TLB was flushed (pages:-1) or kept (pages:0).
   Build: gcc -O2 -o pcid pcid.c      Run as root: ./pcid; then python3 count_switch.py */
#include "../common/lab.h"
#include <sys/wait.h>

int main(void)
{
    static const char *ev[] = {"sched/sched_switch", "tlb/tlb_flush", NULL};
    int a[2], b[2];
    char c = 0;
    if (pipe(a) || pipe(b)) return 1;
    pin_cpu(0);
    tr_on(ev, 1);
    tr_mark("== start: parent pid %d", getpid());
    pid_t pid = fork();
    if (pid == 0) {
        for (int i = 0; i < 1000; i++) {
            if (read(a[0], &c, 1) != 1) _exit(1);
            if (write(b[1], &c, 1) != 1) _exit(1);
        }
        _exit(0);
    }
    for (int i = 0; i < 1000; i++) {
        if (write(a[1], &c, 1) != 1) return 1;
        if (read(b[0], &c, 1) != 1) return 1;
    }
    waitpid(pid, NULL, 0);
    tr_mark("== end: child pid %d", pid);
    tr_off();
    printf("parent %d, child %d: 1000 round trips on CPU 0\n", getpid(), pid);
    return 0;
}
