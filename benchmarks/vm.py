#!/usr/bin/env python3
"""Observe Linux mapping/fault/COW stages; no privileged cache or policy changes."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import random
import subprocess
import sys
from run import read, command, cpu_details


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cpu', type=int)
    p.add_argument('--bytes', type=int, default=16777216)
    p.add_argument('--repeats', type=int, default=9)
    p.add_argument('--seed', type=int, default=1)
    p.add_argument('--cc', default='cc')
    p.add_argument('--quick', action='store_true')
    p.add_argument('--notes', default='')
    p.add_argument('--output', type=Path, default=Path('vm-results.json'))
    args = p.parse_args()
    if not sys.platform.startswith('linux'):
        p.error('Linux mmap, getrusage, smaps and affinity are required.')
    allowed = sorted(os.sched_getaffinity(0))
    cpu = allowed[0] if args.cpu is None else args.cpu
    page = os.sysconf('SC_PAGE_SIZE')
    if cpu not in allowed or cpu >= 1024 or not page <= args.bytes <= 134217728 or args.bytes % page or not 1 <= args.repeats <= 100:
        p.error('Choose an allowed CPU below 1024, a page-multiple size up to 128 MiB, and 1–100 repeats.')
    directory = Path(__file__).resolve().parent
    source, binary = directory / 'vm.c', directory / 'vm'
    compile_cmd = [args.cc, '-O2', '-std=c11', '-Wall', '-Wextra', '-Werror', '-g', str(source), '-o', str(binary)]
    subprocess.run(compile_cmd, check=True)
    context = {
        'time_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'cpu_model': cpu_details(cpu).get('model name', 'unknown'), 'cpu_details': cpu_details(cpu),
        'cpuinfo': read('/proc/cpuinfo'), 'kernel': platform.release(), 'architecture': platform.machine(),
        'cpu': cpu, 'allowed_cpus': allowed, 'lscpu': command(['lscpu']),
        'compiler': command([args.cc, '--version']), 'compile_command': compile_cmd,
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'binary_sha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
        'clock': 'CLOCK_MONOTONIC_RAW; whole-stage ns, not cycles or per-load latency',
        'fault_boundary': 'getrusage(RUSAGE_SELF) deltas around each touch stage; child reports its own counters; incidental process faults possible',
        'stage_boundary': 'one volatile byte per base page; write stages include a readback checksum; setup, fork, joins, smaps reads and final msync excluded',
        'placement': 'pinned before mmap/first touch; child inherits affinity; inherited NUMA policy',
        'file_state': 'temporary unlinked file written immediately before mmap: initially page-cache warm; no drop_caches or cold-storage claim',
        'temporary_filesystem': command(['findmnt', '-T', '/tmp', '-J']),
        'page_policy': read('/sys/kernel/mm/transparent_hugepage/enabled'),
        'page_defrag': read('/sys/kernel/mm/transparent_hugepage/defrag'),
        'per_size_thp': {str(path.parent.name): read(path) for path in Path('/sys/kernel/mm/transparent_hugepage').glob('hugepages-*/enabled')},
        'swap': read('/proc/swaps'), 'page_bytes': page,
        'actual_mapping_evidence': 'selected /proc/self/smaps fields for the isolated target VMA at four stages; advice_errno=0 alone does not prove huge-page use',
        'governor': read(f'/sys/devices/system/cpu/cpu{cpu}/cpufreq/scaling_governor'),
        'boost': read('/sys/devices/system/cpu/cpufreq/boost'), 'notes': args.notes, 'quick': args.quick, 'seed': args.seed,
    }
    repeats, size = (3, max(page, 262144)) if args.quick else (args.repeats, args.bytes)
    cases = [(kind, advice, rep) for kind, advice in [('anon', 'base'), ('anon', 'huge'), ('file-private', 'base'), ('file-shared', 'base')] for rep in range(repeats)]
    random.Random(args.seed).shuffle(cases)
    context['case_order'] = cases
    result = {'schema': 'memory-lab-vm-v1', 'context': context, 'samples': [], 'complete': False}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for kind, advice, rep in cases:
        cmd = [str(binary), '--cpu', str(cpu), '--bytes', str(size), '--kind', kind, '--advice', advice]
        sample = json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
        sample['repeat'] = rep
        result['samples'].append(sample)
        args.output.write_text(json.dumps(result, indent=2) + '\n')
    result['complete'] = True
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(args.output)


if __name__ == '__main__':
    main()
