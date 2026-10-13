#!/bin/sh
# memtype.sh - how the kernel mapped a device's registers (x86 PAT memory types, from debugfs),
# whether a bounce-buffer pool exists, and which IOMMU drivers the kernel has.
# Usage: sudo sh memtype.sh 0000:00:02.0
fn=${1:-0000:00:02.0}
mountpoint -q /sys/kernel/debug || mount -t debugfs none /sys/kernel/debug
printf '%s\n' "\$ cat /sys/kernel/debug/x86/pat_memtype_list    # only the lines for the ECAM window and for BAR0 of $fn"
python3 - "$fn" <<'PY'
import re, sys
fn = sys.argv[1]
start, end = (int(x, 16) for x in open('/sys/bus/pci/devices/%s/resource' % fn).readline().split()[:2])
for line in open('/sys/kernel/debug/x86/pat_memtype_list'):
    m = re.search(r'\[mem 0x([0-9a-f]+)-0x([0-9a-f]+)\]', line)
    if m and (int(m.group(1), 16) == 0xeec00000 or start <= int(m.group(1), 16) <= end):
        print(line.rstrip())
PY
printf '%s\n' '$ ls -A /sys/kernel/debug/swiotlb    # the bounce-buffer pool'"'"'s statistics'
if [ -n "$(ls -A /sys/kernel/debug/swiotlb)" ]; then ls -A /sys/kernel/debug/swiotlb; else echo "(empty)"; fi
printf '%s\n' '$ zcat /proc/config.gz | grep -E "^(# )?CONFIG_(INTEL_IOMMU|AMD_IOMMU|VIRTIO_IOMMU|IRQ_REMAP|SWIOTLB)[= ]"'
zcat /proc/config.gz | grep -E "^(# )?CONFIG_(INTEL_IOMMU|AMD_IOMMU|VIRTIO_IOMMU|IRQ_REMAP|SWIOTLB)[= ]"
