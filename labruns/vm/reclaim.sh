#!/bin/sh
# reclaim.sh - memory pressure confined to one memory cgroup (cgroup v1) with a 64 MiB limit,
# so the rest of the machine is not touched.
#   1. Read a 16 MiB file twice from inside the cgroup: its pages start on the inactive list,
#      and the second read moves them to the active list.
#   2. Read a 256 MiB file once. Its page cache is charged to the cgroup, and reclaim keeps the
#      cgroup under its limit by evicting the cgroup's own inactive file pages.
#   3. Write 128 MiB of anonymous memory from inside the cgroup. With no swap, anonymous pages
#      cannot be evicted, and the cgroup's out-of-memory killer ends the program.
# Needs root, the cgroup v1 memory controller at /sys/fs/cgroup/memory, and eat (eat.c).
# Usage: sudo sh reclaim.sh <bin-dir>
set -u
bin=${1:-/home/lab}
CG=/sys/fs/cgroup/memory/lab
FILE=$bin/big.bin
SMALL=$bin/small.bin
vm() { grep -E "^(pgscan_kswapd|pgscan_direct|pgsteal_kswapd|pgsteal_direct|oom_kill) " /proc/vmstat; }
mkdir -p $CG
echo $((64 << 20)) > $CG/memory.limit_in_bytes
dd if=/dev/urandom of=$FILE bs=1M count=256 2>/dev/null
dd if=/dev/urandom of=$SMALL bs=1M count=16 2>/dev/null
python3 "$(dirname "$0")/../common/evict_file_cache.py" "$SMALL" "$FILE" || exit 1

echo '$ grep -E "^(MemTotal|MemFree|Active|Inactive|Unevictable|SwapTotal)" /proc/meminfo'
grep -E "^(MemTotal|MemFree|Active|Inactive|Unevictable|SwapTotal)" /proc/meminfo
echo '$ cat /sys/fs/cgroup/memory/lab/memory.limit_in_bytes'
cat $CG/memory.limit_in_bytes

stat() { grep -E "^(cache|rss|active_file|inactive_file) " $CG/memory.stat; }
echo '== 1. read a 16 MiB file twice inside the cgroup'
sh -c "echo \$\$ > $CG/cgroup.procs; exec cat $SMALL" > /dev/null
echo '$ grep -E "^(cache|rss|active_file|inactive_file) " memory.stat    # after the first read'
stat
sh -c "echo \$\$ > $CG/cgroup.procs; exec cat $SMALL" > /dev/null
echo '$ grep -E "^(cache|rss|active_file|inactive_file) " memory.stat    # after the second read'
stat

echo '== 2. read a 256 MiB file once inside the cgroup'
vm > $bin/vm.before
sh -c "echo \$\$ > $CG/cgroup.procs; exec cat $FILE" > /dev/null
vm > $bin/vm.after
echo '$ cat memory.max_usage_in_bytes memory.failcnt'
cat $CG/memory.max_usage_in_bytes $CG/memory.failcnt
echo '$ grep -E "^(cache|rss|active_file|inactive_file) " memory.stat'
stat
echo '$ /proc/vmstat: change during the read (reclaim for the whole machine)'
join $bin/vm.before $bin/vm.after | awk '{print $1, $3 - $2}'

echo '== 3. write 128 MiB of anonymous memory inside the cgroup'
vm > $bin/vm.before
sh -c "echo \$\$ > $CG/cgroup.procs; exec $bin/eat 128"
echo "exit status: $?"
vm > $bin/vm.after
echo '$ cat memory.oom_control'
cat $CG/memory.oom_control
echo '$ /proc/vmstat: change during the run'
join $bin/vm.before $bin/vm.after | awk '{print $1, $3 - $2}'
echo '$ dmesg | grep "Memory cgroup out of memory" | tail -1'
dmesg | grep "Memory cgroup out of memory" | tail -1 | sed 's/^\[[ 0-9.]*\] //'

rm -f $FILE $SMALL $bin/vm.before $bin/vm.after
rmdir $CG
