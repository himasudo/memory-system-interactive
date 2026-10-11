#!/bin/sh
# run_all.sh - build and run every Part III program, writing the outputs the lessons quote.
# Needs root (physical frame numbers, kernel trace events, drop_caches) and gcc.
# Usage: sudo sh run_all.sh [bin-dir]      Outputs go to ./out/
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin=${1:-/home/lab}
mkdir -p "$bin" "$here/out"
mountpoint -q /sys/kernel/tracing || mount -t tracefs nodev /sys/kernel/tracing
clean() { python3 "$here/../common/trace_clean.py" | sed 's/page=[0-9a-f]* //'; }

# story is built with -O1 so the store stays one readable instruction: movb $0x1,0xd4e(%reg)
gcc -O1 -Wall -o "$bin/story" "$here/story.c"
for p in errcodes thp major cost fork64 pcid abit alias chase; do
  gcc -O2 -Wall -o "$bin/$p" "$here/$p.c"
done
gcc -O2 -Wall -pthread -o "$bin/shoot" "$here/shoot.c"
cd "$bin"

# the main run: retry until nothing else lives in PML4 slot 254 (0x7f0000000000-0x7f7fffffffff),
# so the first store has to build the whole path of tables (ASLR may put libraries there)
for i in 1 2 3 4 5 6 7 8 9 10; do
  taskset -c 0 ./story > "$here/out/story.txt"
  grep -A1 "slot 254" "$here/out/story.txt" | tail -1 | grep -q "(none)" && break
done
clean > "$here/out/story.trace.txt"
objdump -d --no-show-raw-insn ./story > "$here/out/story.objdump.txt"

taskset -c 0 ./errcodes > "$here/out/errcodes.txt";      clean > "$here/out/errcodes.trace.txt"
taskset -c 0 ./thp > "$here/out/thp.txt";                clean > "$here/out/thp.trace.txt"
taskset -c 0 ./major "$bin/hello.txt" > "$here/out/major.txt"; clean > "$here/out/major.trace.txt"
taskset -c 0 ./cost > "$here/out/cost.txt"
taskset -c 0 ./fork64 > "$here/out/fork64.txt"
for r in 1 2 3 4; do ./pcid; python3 "$here/count_switch.py"; done > "$here/out/pcid.txt"
for r in 1 2 3; do echo "### run $r (taskset -c 0 ./shoot)"; taskset -c 0 ./shoot; done > "$here/out/shoot.txt"
{ taskset -c 0 ./abit v
  echo "# 20 runs: Referenced after the reload (kB), first after clear_refs, then after the flush"
  for i in $(seq 20); do taskset -c 0 ./abit; done | awk '{a=a" "$1; b=b" "$2} END {print "# after clear_refs:" a; print "# after the flush: " b}'
} > "$here/out/abit.txt"
{ ./alias; ./alias libc; ./alias libc; } > "$here/out/alias.txt"
taskset -c 0 ./chase vipt > "$here/out/vipt.txt"
taskset -c 0 ./chase tlb > "$here/out/tlb.txt"
sh "$here/facts.sh" > "$here/out/facts.txt" 2>&1
echo done
