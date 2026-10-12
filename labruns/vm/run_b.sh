#!/bin/sh
# run_b.sh - the Part III runs captured on machine B. Outputs go to ./out-b/.
# Needs root (physical frame numbers, the hugetlb pool, kernel trace events) and gcc.
# Usage: sudo sh run_b.sh [bin-dir]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin=${1:-/home/lab}
mkdir -p "$bin" "$here/out-b"
for p in hugetlb chase zeropage; do
  gcc -O2 -Wall -o "$bin/$p" "$here/$p.c"
done
cd "$bin"
./hugetlb > "$here/out-b/hugetlb.txt"
taskset -c 0 ./chase vipt > "$here/out-b/vipt.txt"
./zeropage > "$here/out-b/zeropage.txt"
sh "$here/facts.sh" > "$here/out-b/facts.txt" 2>&1
{ printf '%s\n' '$ grep -o -w -E "invlpgb|pcid|invpcid|pti" /proc/cpuinfo | sort -u | tr "\n" " "'
  grep -o -w -E "invlpgb|pcid|invpcid|pti" /proc/cpuinfo | sort -u | tr '\n' ' '; echo; } > "$here/out-b/flags.txt"
echo done
