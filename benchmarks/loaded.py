#!/usr/bin/env python3
"""Randomized pointer-chase trials under pinned background read/write load."""
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
    p.add_argument('--cpus', help='chase CPU first, then up to seven generator CPUs')
    p.add_argument('--bytes', type=int, default=67108864)
    p.add_argument('--steps', type=int, default=2000000)
    p.add_argument('--repeats', type=int, default=9)
    p.add_argument('--seed', type=int, default=1)
    p.add_argument('--cc', default='cc')
    p.add_argument('--quick', action='store_true')
    p.add_argument('--notes', default='')
    p.add_argument('--output', type=Path, default=Path('loaded-results.json'))
    args = p.parse_args()
    if not sys.platform.startswith('linux'):
        p.error('Linux affinity is required.')
    allowed = sorted(os.sched_getaffinity(0))
    try:
        cpus = list(map(int, args.cpus.split(','))) if args.cpus else allowed[:min(4, len(allowed))]
    except ValueError:
        p.error('Use comma-separated integer CPU IDs.')
    if not 1 <= len(cpus) <= 8 or len(set(cpus)) != len(cpus) or any(c not in allowed or c >= 1024 for c in cpus):
        p.error('Choose 1–8 distinct allowed CPUs below 1024; inspect physical topology first.')
    if not 65536 <= args.bytes <= 268435456 or args.bytes % 65536 or not 1 <= args.steps <= 100000000 or not 1 <= args.repeats <= 100 or not 1 <= args.seed < 2**64:
        p.error('Invalid size, steps, repeats or seed; see --help and benchmarks/README.md.')
    directory = Path(__file__).resolve().parent
    source, binary = directory / 'loaded.c', directory / 'loaded'
    compile_cmd = [args.cc, '-O3', '-std=c11', '-Wall', '-Wextra', '-Werror', '-g', '-pthread', str(source), '-o', str(binary), '-latomic']
    subprocess.run(compile_cmd, check=True)
    topology = {str(cpu): {k: read(f'/sys/devices/system/cpu/cpu{cpu}/topology/{k}') for k in ['core_id', 'physical_package_id', 'thread_siblings_list']} for cpu in cpus}
    context = {
        'time_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'cpu_model': cpu_details(cpus[0]).get('model name', 'unknown'), 'cpu_details': cpu_details(cpus[0]),
        'cpuinfo': read('/proc/cpuinfo'), 'kernel': platform.release(), 'architecture': platform.machine(),
        'cpus': cpus, 'topology': topology, 'allowed_cpus': allowed, 'lscpu': command(['lscpu']),
        'compiler': command([args.cc, '--version']), 'compile_command': compile_cmd,
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'binary_sha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
        'clock': 'CLOCK_MONOTONIC_RAW; ns, not cycles',
        'chase_boundary': 'dependent kernel only; excludes allocation, initialization, full ring warm-up and generator ramp-up',
        'background_boundary': '64 KiB completed-chunk counts sampled just before/after the chase; approximate concurrent useful throughput',
        'placement': 'each worker pins before allocation and first touch; inherited NUMA policy',
        'page_policy': read('/sys/kernel/mm/transparent_hugepage/enabled'), 'actual_mapping_page_size': 'not collected',
        'governors': {str(c): read(f'/sys/devices/system/cpu/cpu{c}/cpufreq/scaling_governor') for c in cpus},
        'boost': read('/sys/devices/system/cpu/cpufreq/boost'), 'intel_no_turbo': read('/sys/devices/system/cpu/intel_pstate/no_turbo'),
        'microarchitecture_attribution': 'unknown; no controller PMU events, mapping or physical DRAM-byte measurement',
        'notes': args.notes, 'quick': args.quick, 'seed': args.seed,
    }
    repeats, size, steps = (3, 65536, 50000) if args.quick else (args.repeats, args.bytes, args.steps)
    cases = [(load, mode, rep) for load in range(len(cpus)) for mode in (['read'] if load == 0 else ['read', 'write']) for rep in range(repeats)]
    random.Random(args.seed).shuffle(cases)
    context['case_order'] = cases
    result = {'schema': 'memory-lab-loaded-v1', 'context': context, 'samples': [], 'complete': False}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for load, mode, rep in cases:
        cmd = [str(binary), '--cpus', ','.join(map(str, cpus[:load+1])), '--mode', mode, '--bytes', str(size), '--steps', str(steps), '--seed', str(args.seed)]
        sample = json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
        sample['repeat'] = rep
        result['samples'].append(sample)
        args.output.write_text(json.dumps(result, indent=2) + '\n')
    result['complete'] = True
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(args.output)


if __name__ == '__main__':
    main()
