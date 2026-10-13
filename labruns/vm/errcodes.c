/* errcodes.c - what the CPU reports for each kind of refused access.
   A SIGSEGV handler prints the trap number, the error code and CR2 that the kernel copies into
   the signal context; the page_fault_user trace event records the error code exactly as the CPU
   pushed it. (For a user access to the kernel half the kernel sets bit 0 in the copy it gives
   signal handlers; see sanitize_error_code() in arch/x86/mm/fault.c.)
   Build: gcc -O1 -o errcodes errcodes.c      Run as root: taskset -c 0 ./errcodes */
#include "../common/lab.h"
#include <setjmp.h>
#include <signal.h>
#include <ucontext.h>

static sigjmp_buf jb;
static void on_segv(int sig, siginfo_t *si, void *uc_)
{
    ucontext_t *uc = uc_;
    const char *code = si->si_code == SEGV_MAPERR ? "SEGV_MAPERR" : si->si_code == SEGV_ACCERR ? "SEGV_ACCERR" : si->si_code == SI_KERNEL ? "SI_KERNEL" : "other";
    lg("trap=%-2lld err=0x%-3llx si_code=%s\n", (long long)uc->uc_mcontext.gregs[REG_TRAPNO],
       (long long)uc->uc_mcontext.gregs[REG_ERR], code);
    (void)sig;
    siglongjmp(jb, 1);
}
#define TRY(label, stmt) do { lg("%-40s ", label); tr_mark("== " label); if (!sigsetjmp(jb, 1)) { stmt; lg("no signal\n"); } } while (0)

int main(void)
{
    static const char *ev[] = {"exceptions/page_fault_user", NULL};
    struct sigaction sa = {0};
    stack_t ss = {.ss_sp = malloc(65536), .ss_size = 65536};
    memset(ss.ss_sp, 0, 65536); /* touch it now, so the first signal does not fault on it */
    sigaltstack(&ss, NULL);
    sa.sa_sigaction = on_segv;
    sa.sa_flags = SA_SIGINFO | SA_ONSTACK;
    sigaction(SIGSEGV, &sa, NULL);
    sigaction(SIGBUS, &sa, NULL);
    lg_init();
    char *ro = mmap(NULL, 8192, PROT_READ, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    char *none = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    char *nx = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    none[0] = 1;
    mprotect(none, 4096, PROT_NONE);
    nx[0] = (char)0xc3; /* a ret instruction */
    char *unm = mmap(NULL, 4096, PROT_NONE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    munmap(unm, 4096); /* now nothing is mapped there (nothing is mapped after this) */
    volatile char v;
    (void)pagemap(ro); tr_mark("warm-up"); lg("warm-up\n"); *lg_len = 0;

    tr_on(ev, 0);
    TRY("read  an unmapped user address", v = *(volatile char *)unm);
    TRY("write an unmapped user address", *(volatile char *)unm = 1);
    TRY("write a PROT_READ page, never touched", *(volatile char *)ro = 1);
    TRY("read  a PROT_READ page", v = *(volatile char *)(ro + 4096));
    TRY("write that page after the read", *(volatile char *)(ro + 4096) = 1);
    TRY("read  a PROT_NONE page (was written)", v = *(volatile char *)none);
    TRY("call into a PROT_READ|PROT_WRITE page", ((void (*)(void))nx)());
    TRY("read  0xffff888000000000 (kernel half)", v = *(volatile char *)0xffff888000000000UL);
    TRY("write 0xffff888000000000 (kernel half)", *(volatile char *)0xffff888000000000UL = 1);
    TRY("read  0xffffffff81000000 (kernel code)", v = *(volatile char *)0xffffffff81000000UL);
    TRY("read  0x0000800000000000 (non-canonical)", v = *(volatile char *)0x0000800000000000UL);
    tr_off();
    (void)v;
    lg_flush();
    return 0;
}
