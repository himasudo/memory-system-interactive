#!/bin/sh
# virt.sh - what a guest can see of the virtual machine it runs in: the hypervisor CPUID flag,
# the boot messages of a KVM guest, and the guest-physical address ranges that hold RAM.
# Usage: sudo sh virt.sh
echo '$ lscpu | grep -E "Hypervisor vendor|Virtualization type"'
lscpu | grep -E "Hypervisor vendor|Virtualization type"
echo '$ grep -o -w -E "hypervisor|vmx|svm" /proc/cpuinfo | sort | uniq -c'
grep -o -w -E "hypervisor|vmx|svm" /proc/cpuinfo | sort | uniq -c
echo '$ dmesg | grep -E "Hypervisor detected|Booting paravirtualized|pv remote TLB flush"'
dmesg | grep -E "Hypervisor detected|Booting paravirtualized|pv remote TLB flush" | sed 's/^\[[ 0-9.]*\] //'
echo '$ grep "System RAM" /proc/iomem'
grep "System RAM" /proc/iomem
