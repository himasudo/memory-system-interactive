#!/bin/sh
# zones.sh - how Linux divides physical memory: zones, free blocks per order, migrate types and
# the per-CPU lists. Run as root (dmesg).
set -u
echo '$ dmesg | grep -A4 "Zone ranges"'
dmesg | grep -A4 "Zone ranges" | sed 's/^\[[ 0-9.]*\] //'
echo '$ cat /proc/buddyinfo'
cat /proc/buddyinfo
echo '$ grep -E "Page block|Pages per|zone   Normal, type" /proc/pagetypeinfo | head -6'
grep -E "Page block|Pages per|zone   Normal, type" /proc/pagetypeinfo | head -6
echo '$ awk ... /proc/zoneinfo    # the Normal zone: free pages, watermarks, CPU 0 list (see zones.sh)'
awk '/^Node 0, zone +Normal/{z=1; print; next} /^Node/{z=0} z && /pages free|^ +min |^ +low |^ +high /{print} z && /cpu: 0/{c=1; print} c && /count|high|batch/{print; n++} n==3{exit}' /proc/zoneinfo
echo '$ zcat /proc/config.gz | grep -E "CONFIG_PCP_BATCH_SCALE_MAX|CONFIG_NUMA="'
zcat /proc/config.gz | grep -E "CONFIG_PCP_BATCH_SCALE_MAX|CONFIG_NUMA="
