#!/bin/sh
# facts.sh - the machine facts Part III quotes. Run as root (kallsyms addresses read as 0 otherwise).
set -u
echo '$ lscpu | grep -E "Model name|Address sizes|Hypervisor"'
lscpu | grep -E "Model name|Address sizes|Hypervisor"
printf '%s\n' '$ grep -o -w -E "pcid|invpcid|la57|pdpe1gb|nx|smep|smap|pku|pti" /proc/cpuinfo | sort -u | tr "\n" " "'
grep -o -w -E "pcid|invpcid|la57|pdpe1gb|nx|smep|smap|pku|pti" /proc/cpuinfo | sort -u | tr '\n' ' '; echo
echo '$ cat /sys/kernel/mm/transparent_hugepage/enabled /sys/kernel/mm/transparent_hugepage/defrag'
cat /sys/kernel/mm/transparent_hugepage/enabled /sys/kernel/mm/transparent_hugepage/defrag
echo '$ cat /proc/sys/vm/nr_hugepages /proc/sys/kernel/randomize_va_space'
cat /proc/sys/vm/nr_hugepages /proc/sys/kernel/randomize_va_space
echo '$ cat /sys/devices/system/cpu/vulnerabilities/meltdown'
cat /sys/devices/system/cpu/vulnerabilities/meltdown
echo '$ grep -w -E "_text|_etext" /proc/kallsyms'
grep -w -E "_text|_etext" /proc/kallsyms
echo '$ cd /sys/devices/system/cpu/cpu0/cache/index0 && grep . level type size ways_of_associativity number_of_sets coherency_line_size'
(cd /sys/devices/system/cpu/cpu0/cache/index0 && grep . level type size ways_of_associativity number_of_sets coherency_line_size)
echo '$ cat /proc/self/maps    # run 1'
cat /proc/self/maps
echo '$ cat /proc/self/maps    # run 2'
cat /proc/self/maps
echo '$ grep VmPTE /proc/self/status    # 5 runs'
for i in 1 2 3 4 5; do grep VmPTE /proc/self/status; done
echo '$ uname -r'
uname -r
