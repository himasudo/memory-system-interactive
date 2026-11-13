#!/bin/sh
# run_all.sh - the hardware runs captured on machine C. Outputs go to ./out/.
# Needs gcc. Pins each timing program to CPU 0 (CPUs 0 and 1 for the two-thread ones).
# Usage: sh run_all.sh [bin-dir]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin=${1:-/tmp/memlab-hw}
mkdir -p "$bin" "$here/out"
for p in ladder branch mlp seq; do
  gcc -O2 -Wall -o "$bin/$p" "$here/$p.c"
done
for p in sb falseshare pingpong; do
  gcc -O2 -Wall -pthread -o "$bin/$p" "$here/$p.c"
done
sh "$here/facts.sh" > "$here/out/facts.txt" 2>&1
taskset -c 0 "$bin/ladder" > "$here/out/ladder.txt"
taskset -c 0 "$bin/branch" > "$here/out/branch.txt"
taskset -c 0 "$bin/mlp" > "$here/out/mlp.txt"
taskset -c 0 "$bin/seq" > "$here/out/seq.txt"
"$bin/sb" > "$here/out/sb.txt"
"$bin/falseshare" > "$here/out/falseshare.txt"
"$bin/pingpong" > "$here/out/pingpong.txt"
echo done
