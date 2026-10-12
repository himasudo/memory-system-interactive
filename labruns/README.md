# Lab runs

Small programs whose outputs the course quotes. Every "Lab run" block in a lesson names the
file it was taken from and the machine it ran on, and `tests/runs.test.cjs` checks that each
quoted line really is in that file.

| Folder | Machine | Used by | Script |
|---|---|---|---|
| `vm/out/` | A | Part III | `vm/run_all.sh` |
| `vm/out-b/` | B | Part III (runs added later) | `vm/run_b.sh` |

**Machine A**: a cloud virtual machine (KVM), Linux 6.18.44, 2 vCPUs. The CPU reports itself as
an Intel Xeon at 2.80 GHz (family 6, model 85, stepping 7), 46-bit physical and 48-bit virtual
addresses.

**Machine B**: another cloud virtual machine (KVM), the same Linux 6.18.44 build, 4 vCPUs. The
CPU reports itself as an Intel Xeon at 2.10 GHz (family 6, model 207, stepping 2), 52-bit
physical and 57-bit virtual addresses; the kernel uses 4-level paging. Details in
`machine-b.txt`.

On a virtual machine, physical addresses are the virtual machine's own (the host translates
them once more), and the CPU model and cache sizes are what the hypervisor reports.

## Running them

The scripts build the programs with gcc and need root: physical frame numbers in
`/proc/self/pagemap`, kernel trace events (tracefs) and `drop_caches` are root-only.

    sudo sh vm/run_all.sh /tmp/lab     # writes vm/out/
    sudo sh vm/run_b.sh /tmp/lab       # writes vm/out-b/

Your numbers will differ: frame numbers change on every run, and timings depend on the machine.
`common/lab.h` holds the helpers (pagemap, fault counts, trace markers) and
`common/trace_clean.py` strips the trace down to the event lines quoted in the lessons.
