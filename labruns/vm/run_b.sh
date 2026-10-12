#!/bin/sh
# run_b.sh - the Part III runs captured on machine B. Outputs go to ./out-b/.
# Needs root (physical frame numbers, the hugetlb pool, kernel trace events) and gcc.
# Usage: sudo sh run_b.sh [bin-dir]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin=${1:-/home/lab}
mkdir -p "$bin" "$here/out-b"
for p in hugetlb chase; do
  gcc -O2 -Wall -o "$bin/$p" "$here/$p.c"
done
cd "$bin"
./hugetlb > "$here/out-b/hugetlb.txt"
taskset -c 0 ./chase vipt > "$here/out-b/vipt.txt"
sh "$here/facts.sh" > "$here/out-b/facts.txt" 2>&1
echo done
