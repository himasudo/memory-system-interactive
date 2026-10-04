#!/usr/bin/env python3
"""Compile, pin, warm, repeat and retain raw native measurements; Linux only."""
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


def read(path):
    try:
        return Path(path).read_text().strip()
    except OSError:
        return None


def command(args):
    try:
        r = subprocess.run(args, text=True, capture_output=True, timeout=15)
        return {"command": args, "returncode": r.returncode, "stdout": r.stdout, "stderr": r.stderr}
    except (OSError, subprocess.TimeoutExpired) as e:
        return {"command": args, "unavailable": str(e)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cpu", type=int)
    parser.add_argument("--quick", action="store_true", help="harness smoke check, not characterization")
    parser.add_argument("--output", type=Path, default=Path("results.json"))
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--cc", default="cc")
    parser.add_argument("--notes", default="", help="BIOS, DIMMs, load/thermal state, NUMA/page policy and other controls")
    args = parser.parse_args()
    if not sys.platform.startswith("linux"):
        parser.error("These benchmarks require Linux affinity and CLOCK_MONOTONIC_RAW.")
    allowed = sorted(os.sched_getaffinity(0))
    cpu = allowed[0] if args.cpu is None else args.cpu
    if cpu not in allowed or not 0 < args.seed < 2**64:
        parser.error("Choose a CPU in the current affinity mask and a nonzero uint64 seed.")
    directory = Path(__file__).resolve().parent
    source, binary = directory / "memlab.c", directory / "memlab"
    flags = ["-O3", "-std=c11", "-Wall", "-Wextra", "-Werror", "-g"]
    compile_cmd = [args.cc, *flags, str(source), "-o", str(binary)]
    subprocess.run(compile_cmd, check=True)
    cpuinfo = read("/proc/cpuinfo") or ""
    keys = {"vendor_id", "cpu family", "model", "model name", "stepping", "microcode", "flags"}
    cpu_info = {}
    for block in cpuinfo.split("\n\n"):
        fields = {k.strip(): v.strip() for line in block.splitlines() if ":" in line for k, v in [line.split(":", 1)]}
        if fields.get("processor") == str(cpu):
            cpu_info = {k: v for k, v in fields.items() if k in keys}
            break
    cpuroot = f"/sys/devices/system/cpu/cpu{cpu}"
    context = {
        "time_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "cpu_model": cpu_info.get("model name", "unknown"), "cpu_details": cpu_info,
        "kernel": platform.release(), "architecture": platform.machine(), "cpu": cpu,
        "allowed_cpus": allowed, "smt_siblings": read(cpuroot + "/topology/thread_siblings_list"),
        "governor": read(cpuroot + "/cpufreq/scaling_governor"),
        "boost": read("/sys/devices/system/cpu/cpufreq/boost"),
        "intel_no_turbo": read("/sys/devices/system/cpu/intel_pstate/no_turbo"),
        "thp": read("/sys/kernel/mm/transparent_hugepage/enabled"),
        "aslr": read("/proc/sys/kernel/randomize_va_space"),
        "bios_version": read("/sys/class/dmi/id/bios_version"),
        "bios_date": read("/sys/class/dmi/id/bios_date"),
        "dimm_configuration": "not collected; record in notes", "notes": args.notes,
        "placement": "pinned before allocation and first touch; inherited NUMA policy",
        "page_size": os.sysconf("SC_PAGE_SIZE"), "actual_mapping_page_size": "not collected",
        "clock": "CLOCK_MONOTONIC_RAW; ns, not core cycles or TSC ticks",
        "timing_boundary": "kernel only; excludes allocation, initialization, ring validation and warm-up",
        "useful_byte_boundary": "8 B per pointer load or read/write array element; physical DRAM traffic unknown",
        "compiler": command([args.cc, "--version"]), "compile_command": compile_cmd,
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "binary_sha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
        "lscpu": command(["lscpu"]), "perf": command(["perf", "--version"]),
        "ibs_op_available": Path("/sys/bus/event_source/devices/ibs_op").exists(),
        "seed": args.seed, "quick": args.quick,
        "validation_scope": "Ring coverage and executable harness; no automatic microarchitecture attribution",
    }
    sizes = [4096, 65536] if args.quick else [4096, 16384, 32768, 65536, 262144, 524288, 1048576, 4194304, 16777216, 67108864]
    repeats = 3 if args.quick else 9
    cases = [("chase", size, n) for size in sizes for n in [1, 2, 4, 8, 16]]
    cases += [(mode, sizes[-1], 1) for mode in ["read", "write"]]
    random.Random(args.seed).shuffle(cases)  # retain order to expose drift
    context["case_order"] = cases
    result = {"schema": "memory-lab-v1", "context": context, "samples": []}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for mode, size, chains in cases:
        # Keep total loads fixed across chain counts and cover each ring >= once.
        steps = max(size // 64, 16000 if args.quick else 2000000) // chains if mode == "chase" else (2 if args.quick else 32)
        cmd = [str(binary), "--mode", mode, "--bytes", str(size), "--chains", str(chains), "--steps", str(steps), "--repeats", str(repeats), "--seed", str(args.seed), "--cpu", str(cpu)]
        print(f"{mode}: {size} bytes, {chains} chains", file=sys.stderr)
        completed = subprocess.run(cmd, text=True, capture_output=True, check=True)
        result["samples"].extend(json.loads(line) for line in completed.stdout.splitlines())
        # Checkpoint raw data after each case. Completion is explicitly recorded.
        result["complete"] = False
        args.output.write_text(json.dumps(result, indent=2) + "\n")
    result["complete"] = True
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(args.output)


if __name__ == "__main__":
    main()
