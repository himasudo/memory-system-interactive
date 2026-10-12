#!/bin/sh
# virtio.sh - the feature bits a virtio disk and its driver agreed on, read from sysfs.
# Usage: sh virtio.sh vda
d=${1:-vda}
v=$(basename "$(readlink -f /sys/block/$d/device)")
f=$(cat /sys/bus/virtio/devices/$v/features)
printf '%s\n' "\$ cat /sys/bus/virtio/devices/$v/features    # one character per bit, bit 0 first"
echo "$f"
printf 'bits set:'
i=0
while [ $i -lt ${#f} ]; do
  [ "$(echo "$f" | cut -c$((i + 1)))" = 1 ] && printf ' %d' $i
  i=$((i + 1))
done
echo
