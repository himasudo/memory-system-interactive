#!/usr/bin/env python3
"""pcicfg.py - decode one PCI function's configuration space, read-only.

Reads /sys/bus/pci/devices/<slot>/config (root sees all 256 bytes) and the sysfs `resource`
file, then prints the header fields, the BARs and the capability list, including the virtio
vendor capabilities and MSI-X. Nothing is ever written: BAR sizes come from sysfs, not from
writing all-ones to the BAR.

Usage: sudo python3 pcicfg.py 0000:00:03.0
"""
import struct
import sys

VIRTIO_TYPES = {1: 'network card', 2: 'block device', 4: 'entropy source', 5: 'memory balloon', 19: 'socket (vsock)'}
VIRTIO_CFG = {1: 'common config', 2: 'notifications', 3: 'ISR status', 4: 'device config', 5: 'PCI config access'}
CLASSES = {0x01: 'mass storage', 0x02: 'network', 0x06: 'bridge', 0xff: 'unassigned'}


def u8(c, o):
    return c[o]


def u16(c, o):
    return struct.unpack_from('<H', c, o)[0]


def u32(c, o):
    return struct.unpack_from('<I', c, o)[0]


def size_text(n):
    for unit, shift in (('GiB', 30), ('MiB', 20), ('KiB', 10)):
        if n >= 1 << shift and n % (1 << shift) == 0:
            return '%d %s' % (n >> shift, unit)
    return '%d bytes' % n


def main():
    slot = sys.argv[1] if len(sys.argv) > 1 else '0000:00:03.0'
    base = '/sys/bus/pci/devices/' + slot + '/'
    c = open(base + 'config', 'rb').read()
    res = [tuple(int(x, 16) for x in line.split()) for line in open(base + 'resource')]
    print('config space of %s: %d bytes (from %sconfig)' % (slot, len(c), base))
    last = max(i for i in range(len(c)) if c[i]) | 15
    for i in range(0, last + 1, 16):
        print('%02x: %s' % (i, ' '.join('%02x' % b for b in c[i:i + 16])))
    if last + 1 < len(c):
        print('(rows %02x-%02x are all zero)' % (last + 1, len(c) - 16))

    ven, dev = u16(c, 0), u16(c, 2)
    note = ''
    if ven == 0x1af4 and dev >= 0x1040:
        t = dev - 0x1040
        note = '   virtio: 0x1040 + type %d (%s)' % (t, VIRTIO_TYPES.get(t, 'other'))
    print('0x00 vendor ID        0x%04x' % ven)
    print('0x02 device ID        0x%04x%s' % (dev, note))
    cmd = u16(c, 4)
    print('0x04 command          0x%04x   I/O space %s, memory space %s, bus master %s, INTx disabled %s' % (
        cmd, 'on' if cmd & 1 else 'off', 'on' if cmd & 2 else 'off', 'on' if cmd & 4 else 'off',
        'yes' if cmd & 0x400 else 'no'))
    st = u16(c, 6)
    print('0x06 status           0x%04x   capabilities list %s' % (st, 'yes' if st & 0x10 else 'no'))
    print('0x08 revision         0x%02x' % u8(c, 8))
    cls = u8(c, 0xb) << 16 | u8(c, 0xa) << 8 | u8(c, 9)
    print('0x09 class code       0x%06x %s (0x%02x), subclass 0x%02x' % (cls, CLASSES.get(u8(c, 0xb), 'other'), u8(c, 0xb), u8(c, 0xa)))
    ht = u8(c, 0xe)
    print('0x0e header type      0x%02x     type %d: %s' % (ht, ht & 0x7f, 'an endpoint' if ht & 0x7f == 0 else 'a bridge'))
    i = 0
    while i < 6:
        off = 0x10 + 4 * i
        v = u32(c, off)
        if v == 0:
            i += 1
            continue
        if v & 1:
            print('0x%02x BAR%d             0x%08x   I/O ports' % (off, i, v))
            i += 1
            continue
        is64 = (v >> 1) & 3 == 2
        pre = 'prefetchable' if v & 8 else 'not prefetchable'
        print('0x%02x BAR%d             0x%08x   memory, %s, %s' % (off, i, v, '64-bit (with BAR%d)' % (i + 1) if is64 else '32-bit', pre))
        addr = v & ~0xf
        if is64:
            hi = u32(c, off + 4)
            print('0x%02x BAR%d             0x%08x   upper half of BAR%d' % (off + 4, i + 1, hi, i))
            addr |= hi << 32
        start, end, flags = res[i]
        print('     BAR%d address     0x%x, size %s (sysfs resource: 0x%x-0x%x)' % (i, addr, size_text(end - start + 1), start, end))
        i += 2 if is64 else 1
    print('0x2c subsystem        0x%04x:0x%04x' % (u16(c, 0x2c), u16(c, 0x2e)))
    print('0x34 capabilities at  0x%02x' % u8(c, 0x34))
    pin = u8(c, 0x3d)
    print('0x3d interrupt pin    %d        %s' % (pin, 'no INTx pin: interrupts come only as messages (MSI-X)' if pin == 0 else 'INT%s' % 'ABCD'[pin - 1]))

    print('capability list:')
    p, seen = u8(c, 0x34) & ~3, set()
    while p and p not in seen:
        seen.add(p)
        cid, nxt = u8(c, p), u8(c, p + 1)
        if cid == 0x09 and ven == 0x1af4:
            cfg, bar, off, ln = u8(c, p + 3), u8(c, p + 4), u32(c, p + 8), u32(c, p + 12)
            extra = ', notify_off_multiplier %d' % u32(c, p + 16) if cfg == 2 else ''
            print('  0x%02x  0x09 vendor (virtio)  %-17s  BAR%d offset 0x%04x  length %d%s' % (p, VIRTIO_CFG.get(cfg, 'type %d' % cfg), bar, off, ln, extra))
        elif cid == 0x11:
            mc, tbl, pba = u16(c, p + 2), u32(c, p + 4), u32(c, p + 8)
            print('  0x%02x  0x11 MSI-X  %d vectors, %s%s; table in BAR%d at 0x%x; pending bits in BAR%d at 0x%x' % (
                p, (mc & 0x7ff) + 1, 'enabled' if mc & 0x8000 else 'disabled', ', all masked' if mc & 0x4000 else '',
                tbl & 7, tbl & ~7, pba & 7, pba & ~7))
        elif cid == 0x10:
            print('  0x%02x  0x10 PCI Express' % p)
        elif cid == 0x05:
            print('  0x%02x  0x05 MSI' % p)
        else:
            print('  0x%02x  0x%02x' % (p, cid))
        p = nxt & ~3


if __name__ == '__main__':
    main()
