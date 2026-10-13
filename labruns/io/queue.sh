#!/bin/sh
# queue.sh - the block layer's view of one disk: its I/O scheduler and limits, its hardware
# queues (blk-mq) and the interrupt of its request queue.
# Usage: sudo sh queue.sh vdb
d=${1:-vdb}
vdev=$(basename "$(readlink -f /sys/block/$d/device)")
irq=$(grep "$vdev-req.0" /proc/interrupts | cut -d: -f1 | tr -d ' ')
printf '%s\n' "\$ cd /sys/block/$d/queue; grep . scheduler nr_requests max_sectors_kb max_segments logical_block_size physical_block_size rq_affinity io_poll"
(cd /sys/block/$d/queue && grep . scheduler nr_requests max_sectors_kb max_segments logical_block_size physical_block_size rq_affinity io_poll)
printf '%s\n' "\$ ls /sys/block/$d/mq; grep . /sys/block/$d/mq/0/cpu_list /sys/block/$d/mq/0/nr_tags"
ls /sys/block/$d/mq
grep . /sys/block/$d/mq/0/cpu_list /sys/block/$d/mq/0/nr_tags
printf '%s\n' "\$ readlink -f /sys/block/$d/device    # the virtio device and PCI function behind the disk"
readlink -f /sys/block/$d/device
printf '%s\n' "\$ grep -E \"CPU|$vdev\" /proc/interrupts"
grep -E "CPU|$vdev" /proc/interrupts
printf '%s\n' "\$ cat /proc/irq/$irq/smp_affinity_list /proc/irq/$irq/effective_affinity_list"
cat /proc/irq/$irq/smp_affinity_list /proc/irq/$irq/effective_affinity_list
