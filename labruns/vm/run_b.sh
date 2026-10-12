#!/bin/sh
# run_b.sh - the Part III runs captured on machine B. Outputs go to ./out-b/.
# Needs root (physical frame numbers, the hugetlb pool, kernel trace events) and gcc.
# Usage: sudo sh run_b.sh [bin-dir]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin=${1:-/home/lab}
mkdir -p "$bin" "$here/out-b"
for p in hugetlb chase zeropage buddy eat; do
  gcc -O2 -Wall -o "$bin/$p" "$here/$p.c"
done
cd "$bin"
./hugetlb > "$here/out-b/hugetlb.txt"
taskset -c 0 ./chase vipt > "$here/out-b/vipt.txt"
./zeropage > "$here/out-b/zeropage.txt"
mountpoint -q /sys/kernel/tracing || mount -t tracefs nodev /sys/kernel/tracing
taskset -c 0 ./buddy > "$here/out-b/buddy.txt"
sh "$here/zones.sh" > "$here/out-b/zones.txt" 2>&1
sh "$here/reclaim.sh" "$bin" > "$here/out-b/reclaim.txt" 2>&1
{ printf '%s\n' '$ cat /proc/swaps'; cat /proc/swaps
  printf '%s\n' '$ zcat /proc/config.gz | grep -E "^(# )?CONFIG_(SWAP|ZSWAP|ZRAM|LRU_GEN)[= ]"'
  zcat /proc/config.gz | grep -E "^(# )?CONFIG_(SWAP|ZSWAP|ZRAM|LRU_GEN)[= ]"; } > "$here/out-b/swap.txt"
sh "$here/facts.sh" > "$here/out-b/facts.txt" 2>&1
{ printf '%s\n' '$ grep -o -w -E "invlpgb|pcid|invpcid|pti" /proc/cpuinfo | sort -u | tr "\n" " "'
  grep -o -w -E "invlpgb|pcid|invpcid|pti" /proc/cpuinfo | sort -u | tr '\n' ' '; echo; } > "$here/out-b/flags.txt"
echo done
