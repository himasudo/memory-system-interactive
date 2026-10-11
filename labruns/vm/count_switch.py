#!/usr/bin/env python3
"""Count context switches between the two pcid.c processes, and what each did to the TLB.
   Reads /sys/kernel/tracing/trace right after ./pcid. A switch into a process is followed by a
   tlb_flush event with reason "flush on task switch": pages:-1 means the TLB was flushed for that
   address space, pages:0 means its old entries were kept (its PCID was still valid)."""
import re
import sys

lines = open('/sys/kernel/tracing/trace').read().splitlines()
start = next(l for l in lines if 'start: parent pid' in l)
parent = int(re.search(r'parent pid (\d+)', start).group(1))
end = next(l for l in lines if 'end: child pid' in l)
child = int(re.search(r'child pid (\d+)', end).group(1))
pair = {parent, child}
switches = flushed = kept = other = 0
pending = False
for l in lines:
    m = re.search(r'sched_switch: prev_comm=.* prev_pid=(\d+) .* next_comm=.* next_pid=(\d+)', l)
    if m:
        pv, nx = int(m.group(1)), int(m.group(2))
        pending = pv in pair and nx in pair
        if pending:
            switches += 1
        continue
    m = re.search(r'tlb_flush: pages:(-?\d+) reason:flush on task switch', l)
    if m and pending:
        if m.group(1) == '-1':
            flushed += 1
        else:
            kept += 1
        pending = False
print('context switches between the two processes: %d' % switches)
print('  CR3 loads at those switches that flushed the TLB: %d' % flushed)
print('  CR3 loads at those switches that kept the TLB:    %d' % kept)
