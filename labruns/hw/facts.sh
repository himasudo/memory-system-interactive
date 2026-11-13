#!/bin/sh
# facts.sh - what machine C reports about its CPU, caches and memory.
set -u
echo '$ lscpu | grep -E "Model name|CPU family|Model:|Stepping|Address sizes|Hypervisor|NUMA node"'
lscpu | grep -E "Model name|CPU family|Model:|Stepping|Address sizes|Hypervisor|NUMA node"
echo '$ cd /sys/devices/system/cpu/cpu0/cache && for i in index*; do echo "$i: L$(cat $i/level) $(cat $i/type) $(cat $i/size), $(cat $i/ways_of_associativity) ways, $(cat $i/number_of_sets) sets, $(cat $i/coherency_line_size)-byte lines, shared by CPUs $(cat $i/shared_cpu_list)"; done'
cd /sys/devices/system/cpu/cpu0/cache && for i in index*; do
  echo "$i: L$(cat $i/level) $(cat $i/type) $(cat $i/size), $(cat $i/ways_of_associativity) ways, $(cat $i/number_of_sets) sets, $(cat $i/coherency_line_size)-byte lines, shared by CPUs $(cat $i/shared_cpu_list)"
done
echo '$ ls /sys/devices/system/node | grep node'
ls /sys/devices/system/node | grep node
echo '$ grep MemTotal /proc/meminfo'
grep MemTotal /proc/meminfo
echo '$ cat /sys/kernel/mm/transparent_hugepage/enabled'
cat /sys/kernel/mm/transparent_hugepage/enabled
echo '$ uname -r'
uname -r
