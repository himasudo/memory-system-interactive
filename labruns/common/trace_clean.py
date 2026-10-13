#!/usr/bin/env python3
"""Print /sys/kernel/tracing/trace with the task, CPU, flags and timestamp columns removed.

   trace_clean.py            -> event lines only, e.g. "page_fault_user: address=0x... error_code=0x6"
   trace_clean.py --time     -> keep the timestamp (microseconds since the first line) and CPU
Markers written by the programs (tracing_mark_write) are kept as "# == ..." lines.
"""
import os
import re
import sys

LINE = re.compile(r'^\s*(?P<task>.+?)-(?P<pid>\d+)\s+\[(?P<cpu>\d+)\]\s+(?P<flags>\S+)\s+(?P<ts>[\d.]+):\s+(?P<ev>[\w:]+):\s?(?P<rest>.*)$')


def main():
    keep_time = '--time' in sys.argv
    path = os.path.join(os.environ.get('MEMLAB_TRACEFS', '/sys/kernel/tracing'), 'trace')
    t0 = None
    for raw in open(path):
        if raw.startswith('#'):
            continue
        m = LINE.match(raw.rstrip('\n'))
        if not m:
            continue
        ev, rest = m.group('ev'), m.group('rest')
        ts = float(m.group('ts'))
        if t0 is None:
            t0 = ts
        if ev == 'tracing_mark_write':
            out = '# ' + rest.strip()
        else:
            out = ev + ': ' + rest.strip()
        if keep_time:
            out = '%10.1f us  cpu%s  %s' % ((ts - t0) * 1e6, m.group('cpu'), out)
        print(out)


if __name__ == '__main__':
    main()
