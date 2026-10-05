"""Topology, conservative perf evidence and lossless measurement-bundle helpers.

Only reads machine configuration. Never elevates privileges or changes policy.
"""
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import statistics
import subprocess

from run import command, read

SCHEMA = "memory-lab-bundle-v1"
SUITES = {"memory": "memory-lab-v1", "sharing": "memory-lab-sharing-v1",
          "loaded": "memory-lab-loaded-v1", "vm": "memory-lab-vm-v1",
          "prefetch": "memory-lab-prefetch-v1"}
STATES = {"measured", "partial", "failed", "skipped"}


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, data):
    """Atomic checkpoints never leave a truncated JSON file after interruption."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")
    temporary.replace(path)


def cpu_list(value):
    """Parse Linux cpulist syntax (not a hexadecimal cpumask)."""
    if not value:
        return []
    cpus = set()
    for part in value.strip().split(","):
        if not re.fullmatch(r"\d+(?:-\d+)?", part):
            raise ValueError("Invalid Linux CPU list: " + value)
        ends = list(map(int, part.split("-")))
        first, last = ends[0], ends[-1]
        if first > last or last > 1048575:
            raise ValueError("Invalid Linux CPU range")
        cpus.update(range(first, last + 1))
    return sorted(cpus)


def number(value):
    try:
        return int(value) if value is not None and int(value) >= 0 else None
    except ValueError:
        return None


def inspect_topology(sysroot=Path("/sys/devices/system/cpu"), allowed=None):
    sysroot = Path(sysroot)
    allowed = sorted(os.sched_getaffinity(0) if allowed is None else allowed)
    online = cpu_list(read(sysroot / "online")) or allowed
    rows, warnings = [], []
    for cpu in sorted(set(online) | set(allowed)):
        root = sysroot / f"cpu{cpu}"
        topology = root / "topology"
        try:
            siblings = cpu_list(read(topology / "thread_siblings_list"))
        except ValueError as error:
            siblings = []
            warnings.append(str(error))
        nodes = sorted(root.glob("node[0-9]*"))
        rows.append({"cpu": cpu, "online": cpu in online, "allowed": cpu in allowed,
                     "package_id": number(read(topology / "physical_package_id")),
                     "die_id": number(read(topology / "die_id")),
                     "core_id": number(read(topology / "core_id")),
                     "numa_node": int(nodes[0].name[4:]) if nodes else None,
                     "thread_siblings": siblings,
                     "governor": read(root / "cpufreq/scaling_governor"),
                     "line_bytes": number(read(root / "cache/index0/coherency_line_size"))})
    return {"source": "Linux sysfs topology + process sched_getaffinity",
            "online_cpus": online, "allowed_cpus": allowed, "cpus": rows,
            "warnings": warnings}


def core_key(row):
    if row["package_id"] is None or row["core_id"] is None:
        return None
    return row["package_id"], row["die_id"], row["core_id"]


def select_placements(topology, preferred_cpu=None, requested=None):
    """Use confirmed distinct cores and reciprocal siblings, within affinity.

    Unknown topology gets a single-CPU baseline, never guessed SMT labels.
    Prefer the anchor's package/node, then other documented physical cores.
    """
    reasons = []
    eligible = [r for r in topology["cpus"] if r["allowed"] and r["online"] and r["cpu"] < 1024]
    if requested is not None:
        missing = sorted(set(requested) - {r["cpu"] for r in eligible})
        if missing:
            reasons.append("Requested CPUs unavailable/offline/outside affinity or native CPU_SETSIZE: " + str(missing))
        restricted = [r for r in eligible if r["cpu"] in requested]
        if restricted:
            eligible = restricted
        else:
            reasons.append("No requested CPU usable; falling back to current permitted CPUs.")
    if not eligible:
        return {"single": None, "physical": None, "smt": None,
                "reasons": reasons + ["No online permitted CPU below native CPU_SETSIZE (1024)."]}
    by_cpu = {r["cpu"]: r for r in eligible}
    if preferred_cpu is not None and preferred_cpu not in by_cpu:
        reasons.append(f"Preferred CPU {preferred_cpu} unavailable; selected a permitted CPU instead.")
    anchor = by_cpu.get(preferred_cpu, min(eligible, key=lambda r: r["cpu"]))
    # If an SMT pair exists, anchor it by default so all placements are comparable.
    def sibling_pair(r):
        return next((q for q in eligible if q["cpu"] != r["cpu"] and core_key(r) is not None
                     and core_key(q) == core_key(r) and q["cpu"] in r["thread_siblings"]
                     and r["cpu"] in q["thread_siblings"]), None)
    if preferred_cpu is None:
        anchor = next((r for r in eligible if sibling_pair(r)), anchor)
    sibling = sibling_pair(anchor)
    physical = [anchor]
    ordered = sorted(eligible, key=lambda r: (r["package_id"] != anchor["package_id"],
                                              r["numa_node"] != anchor["numa_node"], r["cpu"]))
    for row in ordered:
        if core_key(row) is not None and all(core_key(p) is not None and core_key(row) != core_key(p)
                                            and row["cpu"] not in p["thread_siblings"]
                                            and p["cpu"] not in row["thread_siblings"] for p in physical):
            physical.append(row)
        if len(physical) == 4:
            break
    def placement(kind, rows):
        return {"kind": kind, "cpus": [r["cpu"] for r in rows],
                "topology": rows, "isolation": "affinity only; sibling/background activity not isolated"}
    if not sibling:
        reasons.append("No confirmed allowed SMT-sibling pair for the selected CPU; SMT run skipped.")
    if len(physical) == 1:
        reasons.append("No confirmed second physical core available; using a single-CPU baseline.")
    return {"single": placement("single", [anchor]),
            "physical": placement("physical_cores", physical) if len(physical) > 1 else None,
            "smt": placement("smt_siblings", [anchor, sibling]) if sibling else None,
            "reasons": reasons}


def target_machine(machine):
    details = machine.get("cpu_details", {})
    return bool(re.search(r"\bAMD Ryzen 7 3750H(?:\s|$)", machine.get("cpu_model", ""), re.I)
                and details.get("vendor_id") == "AuthenticAMD"
                and str(details.get("cpu family")) == "23" and str(details.get("model")) == "24")


def inspect_machine(topology, selected_cpu):
    blocks = []
    for block in (read("/proc/cpuinfo") or "").split("\n\n"):
        blocks.append({k.strip(): v.strip() for line in block.splitlines() if ":" in line
                       for k, v in [line.split(":", 1)]})
    details = next((b for b in blocks if b.get("processor") == str(selected_cpu)), {})
    fields = {k: v for k, v in details.items() if k in
              {"vendor_id", "cpu family", "model", "model name", "stepping", "microcode", "flags"}}
    machine = {"cpu_model": details.get("model name", "unknown"), "cpu_details": fields,
               "kernel": platform.release(), "architecture": platform.machine(), "topology": topology,
               "selected_cpu_models": {b["processor"]: b.get("model name", "unknown") for b in blocks
                                       if b.get("processor", "").isdigit() and int(b["processor"]) in topology["allowed_cpus"]},
               "lscpu": command(["lscpu"]), "page_size": os.sysconf("SC_PAGE_SIZE"),
               "boost": read("/sys/devices/system/cpu/cpufreq/boost"),
               "thp": read("/sys/kernel/mm/transparent_hugepage/enabled"),
               "bios_version": read("/sys/class/dmi/id/bios_version"),
               "bios_date": read("/sys/class/dmi/id/bios_date"),
               "unmeasured": ["DIMM configuration", "temperature", "dynamic core frequency",
                              "background contention", "CPU isolation", "NUMA binding"]}
    machine["is_ryzen_7_3750h"] = target_machine(machine)
    return machine


def capability(status, reason, **fields):
    return {"status": status, "reason": reason, **fields}


def detect_capabilities(cc="cc", event_root=Path("/sys/bus/event_source/devices"), which=shutil.which):
    perf = which("perf")
    ibs = {}
    for name in ("ibs_op", "ibs_fetch"):
        root = Path(event_root) / name
        if root.is_dir():
            ibs[name] = {"type": read(root / "type"),
                         "format": {p.name: read(p) for p in sorted((root / "format").glob("*"))},
                         "caps": {p.name: read(p) for p in sorted((root / "caps").glob("*"))}}
    return {"compiler": capability("available" if which(cc) else "unavailable",
                                    "Compiler found." if which(cc) else "C compiler not found in PATH.",
                                    version=command([cc, "--version"])),
            "perf": capability("detected" if perf else "unavailable",
                               "perf found; event access still requires a successful probe." if perf else "perf not found in PATH.",
                               version=command([perf, "--version"]) if perf else None,
                               paranoid=read("/proc/sys/kernel/perf_event_paranoid")),
            "ibs": capability("detected" if ibs else "unavailable",
                              "Kernel exposes IBS PMU(s); sampling permission and model-specific field semantics are not validated."
                              if ibs else "No ibs_op/ibs_fetch PMU exposed by this hardware/kernel.", pmus=ibs),
            "ibs_sampling": capability("skipped", "Automatic IBS sampling requires verified model/kernel field semantics and appropriate filtering/permission; detection alone is insufficient."),
            "cache_pmu": capability("skipped", "No model-specific cache/DRAM/ownership events have been validated for this machine. Generic cache-misses is not a cache-level or DRAM-byte measurement."),
            "privileged_protocols": capability("skipped", "Storage, cache dropping, page-policy changes, disturbance and system-wide profiling are outside the safe automatic suite.")}


def parse_perf(text, event):
    """perf stat -x ';': retain running percentage and reject uncounted rows."""
    for line in text.splitlines():
        fields = line.strip().split(";")
        if len(fields) >= 5 and fields[2].strip() == event:
            try:
                value, runtime, percent = float(fields[0]), float(fields[3]), float(fields[4])
            except ValueError:
                return None
            if all(math.isfinite(v) for v in (value, runtime, percent)) and value > 0 and runtime > 0 and 0 < percent <= 100:
                return {"event": event, "value": value, "unit": fields[1].strip() or "count",
                        "counter_runtime_ns": runtime, "running_percent": percent,
                        "scaled_by_perf": percent < 100}
    return None


def collect_perf(binary_command, capabilities, disabled=False, executor=None):
    """Separate representative runs; never normalize PMU counts by kernel time.

    Only documented Linux generic user cycles/instructions and software task-clock.
    Each event is probed and counted independently to avoid group scheduling
    failures. No cross-event IPC is derived from these distinct executions.
    """
    if disabled or capabilities["perf"]["status"] == "unavailable" or not binary_command:
        reason = "Disabled by --no-perf." if disabled else ("No completed memory workload for evidence." if not binary_command else capabilities["perf"]["reason"])
        return capability("skipped", reason, records=[])
    def bounded(args):
        with subprocess.Popen(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              start_new_session=True, env={**os.environ, "LC_ALL": "C"}) as process:
            try:
                stdout, stderr = process.communicate(timeout=180)
            except (subprocess.TimeoutExpired, KeyboardInterrupt):
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.communicate()
                raise
            return subprocess.CompletedProcess(args, process.returncode, stdout, stderr)
    execute = executor or bounded
    records = []
    for event, semantics in [("task-clock", "Software task execution time; user + kernel."),
                             ("cycles:u", "Generic hardware cycle count in user space, not invariant TSC ticks."),
                             ("instructions:u", "Generic retired architectural instructions in user space, not uops.")]:
        args = ["perf", "stat", "--no-big-num", "-x", ";", "-e", event, "--", *binary_command]
        try:
            result = execute(args)
            count = parse_perf(result.stderr, event) if result.returncode == 0 else None
            records.append({"status": "collected" if count else "skipped",
                            "reason": "Separate supporting execution." if count else "Event unsupported, denied, uncounted or output not understood; see raw stderr.",
                            "event": event, "semantics": semantics, "command": args,
                            "collected_utc": utc(),
                            "binary_sha256": sha256(binary_command[0]) if Path(binary_command[0]).is_file() else None,
                            "returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr,
                            "counter": count, "scope": "one benchmark process, including setup, pinning, allocation, validation, warm-up and teardown; inherited child scope if any",
                            "boundary": "perf workload lifetime; NOT the native timed kernel",
                            "relation_to_trials": "separate execution, not a timed-trial PMC measurement",
                            "interpretation": "No IPC, MPKI, cache-level, queue or DRAM-traffic attribution; no division by timed-kernel ns."})
        except (OSError, subprocess.TimeoutExpired) as error:
            records.append({"status": "skipped", "reason": str(error), "event": event, "command": args,
                            "scope": "no usable evidence collected", "counter": None})
    return capability("collected" if any(r["status"] == "collected" for r in records) else "skipped",
                      "Exact commands, separate scopes and raw outputs retained; optional failures do not fail native suites.", records=records)


def statistics_of(values):
    ordered = sorted(values)
    median = statistics.median(ordered)
    return {"n": len(values), "mean": statistics.mean(values), "median": median,
            "sd": statistics.pstdev(values), "mad": statistics.median(abs(v - median) for v in values),
            "min": ordered[0], "max": ordered[-1],
            "p95": ordered[math.ceil(.95 * len(ordered)) - 1],
            "population": "whole-trial averages; not individual-access tails"}


def summarize(name, run):
    result, groups = run["result"], {}
    for index, row in enumerate(result["samples"]):
        if name == "vm":
            observations = [("ns/stage", stage["elapsed_ns"], stage["name"]) for stage in row["stages"]]
            params = {k: row[k] for k in ("kind", "advice", "bytes", "page_bytes")}
        else:
            keys, divisor = {
                "memory": (("mode", "bytes", "chains", "steps", "operations", "seed"), "operations"),
                "sharing": (("mode", "op", "threads", "iterations", "operations", "stride_bytes", "line_bytes_assumed"), "operations"),
                "loaded": (("mode", "bytes_per_worker", "background_threads", "steps", "chunk_bytes", "seed"), "steps"),
                "prefetch": (("bytes", "stride_lines", "distance", "loads", "passes"), "loads"),
            }[name]
            params = {k: row[k] for k in keys}
            observations = [("ns/update" if name == "sharing" else "ns/op" if name == "memory" else "ns/load", row["elapsed_ns"] / row[divisor], None)]
        for metric, value, stage in observations:
            if not math.isfinite(value) or value <= 0:
                raise ValueError("Invalid timed observation or work count.")
            group_params = {**params, "stage": stage} if stage else params
            key = json.dumps([group_params, metric], sort_keys=True)
            group = groups.setdefault(key, {"run_id": run["id"], "placement": run["placement"]["kind"],
                                           "parameters": group_params, "metric": metric, "trial_indices": [], "values": []})
            group["trial_indices"].append(index)
            group["values"].append(value)
    for group in groups.values():
        group["statistics"] = statistics_of(group.pop("values"))
    return list(groups.values())


def validate_bundle(bundle):
    """Fail closed on missing provenance; partial suites remain explicit."""
    if bundle.get("schema") != SCHEMA or not isinstance(bundle.get("complete"), bool):
        raise ValueError("Expected memory-lab-bundle-v1 with explicit completion.")
    if not isinstance(bundle.get("provenance"), dict) or not isinstance(bundle.get("created_utc"), str):
        raise ValueError("Missing aggregate provenance or UTC time.")
    if not isinstance(bundle.get("capabilities"), dict) or any(not isinstance(c, dict) or not isinstance(c.get("status"), str)
                                                              or not isinstance(c.get("reason"), str) for c in bundle["capabilities"].values()):
        raise ValueError("Capabilities require availability and reasons.")
    machine = bundle["machine"]
    if not all(isinstance(machine.get(k), str) and machine[k] for k in ("cpu_model", "kernel", "architecture")):
        raise ValueError("Missing machine provenance.")
    topology = machine["topology"]
    cpus = {r["cpu"] for r in topology["cpus"]}
    if len(cpus) != len(topology["cpus"]) or not set(topology["allowed_cpus"]).issubset(cpus):
        raise ValueError("Invalid topology / affinity provenance.")
    if machine.get("is_ryzen_7_3750h") != target_machine(machine):
        raise ValueError("Target-machine claim disagrees with recorded CPU identification.")
    if set(bundle["suites"]) != set(SUITES):
        raise ValueError("All suite slots must exist, including explicit skips.")
    for name, suite in bundle["suites"].items():
        if suite["status"] not in STATES or not isinstance(suite["runs"], list) or not isinstance(suite.get("summaries"), list):
            raise ValueError("Invalid suite status.")
        if suite["status"] != "measured" and not suite.get("reason"):
            raise ValueError("Partial/skipped/failed suite requires a reason.")
        if suite["status"] == "measured" and not suite["runs"]:
            raise ValueError("Measured suite has no trials.")
        for run in suite["runs"]:
            result, context = run["result"], run["result"]["context"]
            if result["schema"] != SUITES[name] or not result["samples"] or not isinstance(result["complete"], bool):
                raise ValueError("Wrong or empty native result.")
            if any(context.get(k) != machine[k] for k in ("cpu_model", "kernel", "architecture")):
                raise ValueError("Native result provenance disagrees with bundle machine.")
            for k in ("vendor_id", "cpu family", "model", "model name"):
                if k in context.get("cpu_details", {}) and k in machine.get("cpu_details", {}) and str(context["cpu_details"][k]) != str(machine["cpu_details"][k]):
                    raise ValueError("CPU identity fields disagree with machine provenance.")
            if not all(re.fullmatch(r"[a-f0-9]{64}", context.get(k, "")) for k in ("source_sha256", "binary_sha256")):
                raise ValueError("Missing source/binary provenance.")
            if not context.get("compile_command") or not context.get("compiler") or not context.get("clock"):
                raise ValueError("Missing compiler / timer provenance.")
            if not any(context.get(k) for k in ("timing_boundary", "chase_boundary", "stage_boundary")):
                raise ValueError("Missing timing boundary.")
            placement_cpus = run["placement"]["cpus"]
            if not placement_cpus or not set(placement_cpus).issubset(topology["allowed_cpus"]):
                raise ValueError("Placement outside measured affinity.")
            recorded = context.get("cpus", [context.get("cpu")])
            if recorded != placement_cpus:
                raise ValueError("Native affinity differs from placement record.")
            if name not in ("sharing", "loaded") and (run["placement"]["kind"] != "single" or len(placement_cpus) != 1):
                raise ValueError("This suite requires a single-CPU placement.")
            if suite["status"] == "measured" and result["complete"] is not True:
                raise ValueError("Partial run labeled measured.")
            # Required units/parameters must be usable; native verification remains authoritative.
            summarize(name, run)
    if bundle["complete"] != all(s["status"] == "measured" for s in bundle["suites"].values()):
        raise ValueError("Aggregate completion disagrees with suite states.")
    return bundle
