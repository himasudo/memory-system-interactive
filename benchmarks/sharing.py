#!/usr/bin/env python3
"""Pinned, randomized packed/padded/same-counter C11 atomic trials on Linux."""
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
from run import read, command


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cpus', help='one to four comma-separated allowed logical CPUs; record their topology')
    p.add_argument('--quick', action='store_true')
    p.add_argument('--cc', default='cc')
    p.add_argument('--seed', type=int, default=1)
    p.add_argument('--repeats', type=int, default=9)
    p.add_argument('--iterations', type=int, default=1000000)
    p.add_argument('--output', type=Path, default=Path('sharing-results.json'))
    p.add_argument('--notes', default='')
    args = p.parse_args()
    if not sys.platform.startswith('linux'):
        p.error('Linux pthread affinity is required.')
    allowed = sorted(os.sched_getaffinity(0))
    try:
        cpus = list(map(int, args.cpus.split(','))) if args.cpus else allowed[:2]
    except ValueError:
        p.error('CPU list must contain integers.')
    if not 1 <= len(cpus) <= 4 or any(c not in allowed or c >= 1024 for c in cpus) or len(set(cpus)) != len(cpus):
        p.error('Choose 1–4 distinct allowed CPUs below 1024; one CPU gives the solo baseline.')
    if not 1 <= args.repeats <= 100 or not 1 <= args.iterations <= 1000000000:
        p.error('Use 1–100 repeats and 1–1000000000 iterations.')
    directory = Path(__file__).resolve().parent
    source, binary = directory / 'sharing.c', directory / 'sharing'
    compile_cmd = [args.cc, '-O3', '-std=c11', '-Wall', '-Wextra', '-Werror', '-g', '-pthread', str(source), '-o', str(binary), '-latomic']
    subprocess.run(compile_cmd, check=True)
    topology = {}
    for cpu in cpus:
        base = f'/sys/devices/system/cpu/cpu{cpu}'
        topology[str(cpu)] = {k: read(base + '/topology/' + k) for k in ['physical_package_id', 'core_id', 'thread_siblings_list']}
        topology[str(cpu)]['governor'] = read(base + '/cpufreq/scaling_governor')
    context = {
        'time_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'cpu_model': next((l.split(':', 1)[1].strip() for l in (read('/proc/cpuinfo') or '').splitlines() if l.startswith('model name')), 'unknown'),
        'cpuinfo': read('/proc/cpuinfo'), 'kernel': platform.release(), 'architecture': platform.machine(),
        'cpus': cpus, 'topology': topology, 'allowed_cpus': allowed, 'lscpu': command(['lscpu']),
        'compiler': command([args.cc, '--version']), 'compile_command': compile_cmd,
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'binary_sha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
        'clock': 'CLOCK_MONOTONIC_RAW; ns, not cycles',
        'timing_boundary': 'release barrier through all joins; excludes allocation, thread creation and worker warm-up',
        'memory_order': 'C11 relaxed; atomicity of counters, no publication of other data',
        'line_bytes_assumed': 64, 'placement': 'workers pinned; main initializes 256 B under inherited NUMA policy',
        'boost': read('/sys/devices/system/cpu/cpufreq/boost'),
        'intel_no_turbo': read('/sys/devices/system/cpu/intel_pstate/no_turbo'),
        'bios_version': read('/sys/class/dmi/id/bios_version'),
        'perf': command(['perf', '--version']), 'ibs_op_available': Path('/sys/bus/event_source/devices/ibs_op').exists(),
        'pmu_measurements': 'not collected; elapsed time does not measure ownership transfers',
        'notes': args.notes, 'quick': args.quick, 'seed': args.seed,
    }
    repeats = 3 if args.quick else args.repeats
    iterations = 10000 if args.quick else args.iterations
    cases = [(n, mode, op, rep) for n in sorted(set([1, len(cpus)])) for mode in ['same', 'packed', 'padded'] for op in ['add', 'cas'] for rep in range(repeats)]
    random.Random(args.seed).shuffle(cases)
    context['case_order'] = cases
    result = {'schema': 'memory-lab-sharing-v1', 'context': context, 'samples': [], 'complete': False}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for n, mode, op, rep in cases:
        cmd = [str(binary), '--threads', str(n), '--cpus', ','.join(map(str, cpus[:n])), '--mode', mode, '--op', op, '--iterations', str(iterations)]
        sample = json.loads(subprocess.run(cmd, text=True, capture_output=True, check=True).stdout)
        sample['repeat'] = rep
        result['samples'].append(sample)
        args.output.write_text(json.dumps(result, indent=2) + '\n')
    result['complete'] = True
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(args.output)


if __name__ == '__main__':
    main()
