#!/bin/sh
# iomem.sh - how RAM and device registers share the physical address space, which PCI functions
# exist, and what the kernel says about DMA translation (IOMMU, bounce buffers).
# Usage: sudo sh iomem.sh [slot]      (root: /proc/iomem shows real addresses only to root)
fn=${1:-0000:00:02.0}
printf '%s\n' '$ grep -E "System RAM|Kernel code|PCI Bus|PCI ECAM|IOAPIC|: 0000:00:" /proc/iomem'
grep -E "System RAM|Kernel code|PCI Bus|PCI ECAM|IOAPIC|: 0000:00:" /proc/iomem
printf '%s\n' "\$ grep -A1 \": $fn\" /proc/iomem    # the disk's PCI function, and who claimed its registers"
grep -A1 ": $fn" /proc/iomem
printf '%s\n' '$ for each PCI function: slot, vendor:device, class, driver, MSI-X vectors'
for d in /sys/bus/pci/devices/*; do
  drv=$(basename "$(readlink "$d/driver" 2>/dev/null)" 2>/dev/null)
  n=$(ls "$d/msi_irqs" 2>/dev/null | wc -l)
  printf '%s  %s:%s  class %s  driver %-10s  vectors %s\n' "$(basename "$d")" "$(cat "$d/vendor")" "$(cat "$d/device")" "$(cat "$d/class")" "${drv:--}" "$n"
done
printf '%s\n' '$ for each virtio device: device type, and feature bit 33 (VIRTIO_F_ACCESS_PLATFORM)'
for v in /sys/bus/virtio/devices/virtio*; do
  f=$(cat "$v/features")
  printf '%s  on %s  type %d  bit 33 = %s\n' "$(basename "$v")" "$(basename "$(readlink -f "$v/..")")" "$(cat "$v/device")" "$(echo "$f" | cut -c34)"
done
printf '%s\n' '$ ls /sys/class/iommu    # IOMMU hardware the kernel found'
ls /sys/class/iommu
printf '%s\n' '$ dmesg | grep -E "iommu: Default domain|TLB invalidation policy|PCI-DMA|software IO TLB"'
dmesg | grep -E "iommu: Default domain|TLB invalidation policy|PCI-DMA|software IO TLB" | sed 's/^\[[ 0-9.]*\] //'
printf '%s\n' '$ tr " " "\n" < /proc/cmdline | grep "^swiotlb"'
tr " " "\n" < /proc/cmdline | grep "^swiotlb"
