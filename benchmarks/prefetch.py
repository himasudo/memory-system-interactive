#!/usr/bin/env python3
"""Pinned software-prefetch sweep; preserve raw trials and experimental context."""
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
from run import command, read


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cpu", type=int)
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--output", type=Path, default=Path("prefetch-results.json"))
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--cc", default="cc")
    parser.add_argument("--notes", default="")
    args = parser.parse_args()
    if not sys.platform.startswith("linux"):
        parser.error("Linux affinity and CLOCK_MONOTONIC_RAW are required.")
    allowed = sorted(os.sched_getaffinity(0))
    cpu = allowed[0] if args.cpu is None else args.cpu
    if cpu not in allowed or not 0 < args.seed < 2**64:
        parser.error("Choose a permitted CPU and positive uint64 seed.")
    directory = Path(__file__).resolve().parent
    source, binary = directory / "prefetch.c", directory / "prefetch"
    compile_cmd = [args.cc, "-O3", "-std=c11", "-Wall", "-Wextra", "-Werror", "-g", str(source), "-o", str(binary)]
    subprocess.run(compile_cmd, check=True)
    cpu_model = "unknown"
    cpu_fields = {}
    for block in (read("/proc/cpuinfo") or "").split("\n\n"):
        fields = {k.strip(): v.strip() for line in block.splitlines() if ":" in line for k, v in [line.split(":", 1)]}
        if fields.get("processor") == str(cpu):
            cpu_model = fields.get("model name", "unknown")
            cpu_fields = {k: v for k, v in fields.items() if k in {"model name", "cpu family", "model", "stepping", "microcode", "flags"}}
    sizes = [65536] if args.quick else [65536, 1048576, 16777216, 67108864]
    distances = [0, 1, 4, 16] if args.quick else [0, 1, 2, 4, 8, 16, 32, 64]
    cases = [(size, stride, distance) for size in sizes for stride in [1, 3] for distance in distances]
    random.Random(args.seed).shuffle(cases)
    cpuroot = f"/sys/devices/system/cpu/cpu{cpu}"
    context = {
        "time_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "cpu_model": cpu_model, "cpu_details": cpu_fields, "cpu": cpu, "allowed_cpus": allowed,
        "kernel": platform.release(), "architecture": platform.machine(), "quick": args.quick,
        "compiler": command([args.cc, "--version"]), "compile_command": compile_cmd,
        "binary_sha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "lscpu": command(["lscpu"]), "smt_siblings": read(cpuroot + "/topology/thread_siblings_list"),
        "governor": read(cpuroot + "/cpufreq/scaling_governor"),
        "boost": read("/sys/devices/system/cpu/cpufreq/boost"),
        "thp": read("/sys/kernel/mm/transparent_hugepage/enabled"),
        "page_size": os.sysconf("SC_PAGE_SIZE"), "notes": args.notes, "case_order": cases,
        "clock": "CLOCK_MONOTONIC_RAW; ns, not core cycles",
        "timing_boundary": "kernel only; excludes allocation, first touch and plain warm-up",
        "placement": "pinned before allocation and first touch; inherited NUMA policy",
        "useful_byte_boundary": "one 8-byte word per 64-byte reference line; DRAM traffic unknown",
        "hint": "__builtin_prefetch read/locality=3; compiler emission and actual hardware handling must be inspected",
        "confounds": "hardware prefetchers remain enabled; address arithmetic and loop work are timed; warm cache regime depends on size; actual page size/frequency/PMU data not collected",
        "validation_scope": "verified executable and checksum; no target-machine calibration or queue attribution",
    }
    result = {"schema": "memory-lab-prefetch-v1", "context": context, "samples": [], "complete": False}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for size, stride, distance in cases:
        cmd = [str(binary), "--cpu", str(cpu), "--bytes", str(size), "--stride", str(stride), "--distance", str(distance), "--passes", "4" if args.quick else "16", "--repeats", "3" if args.quick else "9"]
        completed = subprocess.run(cmd, text=True, capture_output=True, check=True, timeout=180)
        result["samples"].extend(json.loads(line) for line in completed.stdout.splitlines())
        args.output.write_text(json.dumps(result, indent=2) + "\n")
    result["complete"] = True
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(args.output)


if __name__ == "__main__":
    main()
