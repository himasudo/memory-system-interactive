#!/bin/sh
# run_all.sh - the Part VI runs, captured on machine B. Outputs go to ./out/.
# Needs root, gcc, python3 and tracefs. The device reads go to a 4 MiB file of random bytes that
# this script creates in bin-dir; PCI configuration space is only read, never written.
# Usage: sudo sh run_all.sh [bin-dir]      (bin-dir must be on a virtio disk)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin=${1:-/home/lab}
mkdir -p "$bin" "$here/out"
gcc -O2 -Wall -o "$bin/oneread" "$here/oneread.c"
mountpoint -q /sys/kernel/tracing || mount -t tracefs nodev /sys/kernel/tracing
T=/sys/kernel/tracing
file=$bin/disk.bin
dd if=/dev/urandom of="$file" bs=1M count=4 2>/dev/null
sync

# the file's disk, its virtio device, PCI function and request-queue interrupt
devt=$(stat -c '%Hd:%Ld' "$file")                                       # 254:0
disk=$(basename "$(readlink -f /sys/dev/block/$devt)")                  # vda
vdev=$(basename "$(readlink -f /sys/block/$disk/device)")              # virtio1
fn=$(basename "$(readlink -f /sys/block/$disk/device/..)")             # 0000:00:02.0
irq=$(grep "$vdev-req.0" /proc/interrupts | cut -d: -f1 | tr -d ' ')   # 37
kdev=$(( (${devt%:*} << 20) | ${devt#*:} ))                            # dev_t as the kernel stores it

sh "$here/iomem.sh" "$fn" > "$here/out/iomem.txt" 2>&1
python3 "$here/pcicfg.py" "$fn" > "$here/out/pcicfg.txt"
sh "$here/queue.sh" "$disk" > "$here/out/queue.txt" 2>&1

# trace one read: io_uring, the block layer (this disk only), the queue's interrupt, the program's
# wakeups and CPU switches, and any DMA-mapping or bounce-buffer event
echo 0 > $T/tracing_on; echo 0 > $T/events/enable; echo > $T/trace; echo > $T/set_event_pid
echo mono > $T/trace_clock
for e in io_uring/io_uring_submit_req io_uring/io_uring_complete io_uring/io_uring_task_add \
         io_uring/io_uring_task_work_run block/block_bio_queue block/block_getrq block/block_rq_insert \
         block/block_rq_issue block/block_rq_complete irq/irq_handler_entry irq/irq_handler_exit \
         sched/sched_wakeup sched/sched_switch ipi/ipi_send_cpu dma swiotlb; do
  echo 1 > $T/events/$e/enable
done
for e in block_bio_queue block_getrq block_rq_insert block_rq_issue block_rq_complete; do
  echo "dev == $kdev" > $T/events/block/$e/filter
done
echo "irq == $irq" > $T/events/irq/irq_handler_entry/filter
echo "irq == $irq" > $T/events/irq/irq_handler_exit/filter
echo 'comm == "oneread"' > $T/events/sched/sched_wakeup/filter
echo 'cpu == 0' > $T/events/ipi/ipi_send_cpu/filter    # interrupts sent to the program's CPU
echo 'prev_comm == "oneread" || next_comm == "oneread"' > $T/events/sched/sched_switch/filter

{ printf '%s\n' "\$ grep -E \"CPU|$vdev-req\" /proc/interrupts    # before"; grep -E "CPU|$vdev-req" /proc/interrupts; } > "$here/out/counts.txt"
taskset -c 0 "$bin/oneread" "$file" > "$here/out/oneread.txt"
{ printf '%s\n' "\$ grep -E \"CPU|$vdev-req\" /proc/interrupts    # after"; grep -E "CPU|$vdev-req" /proc/interrupts; } >> "$here/out/counts.txt"

echo 0 > $T/events/enable
for f in $T/events/block/*/filter $T/events/irq/*/filter $T/events/sched/*/filter $T/events/ipi/*/filter; do echo 0 > "$f"; done
python3 "$here/../common/trace_clean.py" --time > "$here/out/oneread.trace.txt"
{ printf '%s\n' '$ grep -c -E "  (dma_|swiotlb_)" oneread.trace.txt    # DMA-mapping and bounce-buffer events in the trace'
  grep -c -E "  (dma_|swiotlb_)" "$here/out/oneread.trace.txt" || true; } >> "$here/out/counts.txt"
echo local > $T/trace_clock
rm -f "$file"
echo done
