#!/usr/bin/env python3
"""Run the safe Linux suites once; keep raw files and one portable result bundle."""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import io
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
from urllib.parse import urlsplit
import webbrowser

from workflow import (SCHEMA, SUITES, capability, collect_perf, cpu_list, detect_capabilities,
                      inspect_machine, inspect_topology, read, select_placements, sha256,
                      summarize, utc, validate_bundle, write_json)

ROOT = Path(__file__).resolve().parents[1]
RUNNERS = {"memory": "run.py", **{name: name + ".py" for name in SUITES if name != "memory"}}


def execute_suite(argv, timeout):
    # Killing only the Python runner would orphan its C process / worker threads.
    with subprocess.Popen(argv, cwd=ROOT, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, start_new_session=True) as process:
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.communicate(timeout=2)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.communicate()
            raise
        return subprocess.CompletedProcess(argv, process.returncode, stdout, stderr)


def available_memory():
    """Respect a container's remaining memory, not just host MemAvailable."""
    fields = dict(line.split(":", 1) for line in (read("/proc/meminfo") or "").splitlines() if ":" in line)
    values = []
    if "MemAvailable" in fields:
        values.append(int(fields["MemAvailable"].split()[0]) * 1024)
    # Locate this process's cgroup v2 or v1 memory controller, including nested groups.
    for line in (read("/proc/self/cgroup") or "").splitlines():
        _, controllers, relative = line.split(":", 2)
        if not controllers:
            base, maximum, current = Path("/sys/fs/cgroup") / relative.lstrip("/"), "memory.max", "memory.current"
        elif "memory" in controllers.split(","):
            base, maximum, current = Path("/sys/fs/cgroup/memory") / relative.lstrip("/"), "memory.limit_in_bytes", "memory.usage_in_bytes"
        else:
            continue
        while str(base).startswith("/sys/fs/cgroup"):
            limit, used = read(base / maximum), read(base / current)
            if limit and used and limit.isdigit() and used.isdigit():
                values.append(max(0, int(limit) - int(used)))
            if base == Path("/sys/fs/cgroup"):
                break
            base = base.parent
    return min(values) if values else None


def run_suite(name, placements, args, folder, machine, memory):
    suite = {"status": "skipped", "reason": "Not run yet.", "runs": [], "summaries": [], "attempts": []}
    if not placements:
        suite["reason"] = "No usable CPU placement."
        return suite
    if memory is not None and memory < 128 * 1024**2:
        suite["reason"] = "Less than 128 MiB remaining memory for compiler/workloads; safe execution budget unavailable."
        return suite
    for index, placement in enumerate(placements):
        run_id = placement["kind"] + "-" + str(index)
        # Per-placement original files remain untouched. Canonical raw sharing.json
        # is a lossless composite when two placements were actually run.
        raw = folder / (name + ("-" + run_id if len(placements) > 1 else "") + ".json")
        raw.unlink(missing_ok=True)  # never reuse stale results after a failed run
        quick = args.quick or memory is not None and memory < 512 * 1024**2
        argv = [sys.executable, str(ROOT / "benchmarks" / RUNNERS[name]), "--output", str(raw),
                "--cc", args.cc, "--seed", str(args.seed), "--notes", args.notes]
        argv += ["--cpus", ",".join(map(str, placement["cpus"]))] if name in ("sharing", "loaded") else ["--cpu", str(placement["cpus"][0])]
        if quick:
            argv.append("--quick")
        attempt = {"id": run_id, "command": argv, "placement": placement,
                   "started_utc": utc(), "effective_quick": quick,
                   "fallback_reason": "Low remaining memory; reduced smoke suite, not characterization." if quick and not args.quick else None}
        print(f"[{name}] {placement['kind']} CPUs {placement['cpus']}" + (" (quick)" if quick else ""), flush=True)
        try:
            completed = execute_suite(argv, args.timeout)
            attempt.update(returncode=completed.returncode, stdout=completed.stdout, stderr=completed.stderr)
        except (OSError, subprocess.TimeoutExpired) as error:
            attempt.update(returncode=None, error=str(error))
        attempt["finished_utc"] = utc()
        suite["attempts"].append(attempt)
        if raw.exists():
            try:
                result = json.loads(raw.read_text())
                if result["samples"] and all(result["context"].get(k) == machine[k] for k in ("cpu_model", "kernel", "architecture")):
                    run = {"id": run_id, "placement": placement, "invocation": attempt,
                           "runner_sha256": sha256(ROOT / "benchmarks" / RUNNERS[name]),
                           "raw_file": raw.name, "raw_sha256": sha256(raw), "result": result}
                    suite["summaries"].extend(summarize(name, run))
                    suite["runs"].append(run)
                else:
                    attempt["error"] = "Empty result or CPU/kernel/architecture differs from inspected machine."
            except (ValueError, KeyError, TypeError) as error:
                attempt["error"] = "Invalid raw result: " + str(error)
    good = len(suite["runs"]) == len(placements) and all(r["result"]["complete"] and r["invocation"].get("returncode") == 0 for r in suite["runs"])
    suite["status"] = "measured" if good else "partial" if suite["runs"] else "failed"
    suite["reason"] = None if good else "One or more native runs failed or did not complete; retained trials and attempt diagnostics are explicit."
    if len(placements) > 1:
        if suite["runs"]:
            results = [r["result"] for r in suite["runs"]]
            composite = {"schema": results[0]["schema"], "complete": good,
                         "context": {**results[0]["context"], "placement_runs": {r["id"]: r["result"]["context"] for r in suite["runs"]}},
                         "samples": [{**sample, "placement_id": r["id"]} for r in suite["runs"] for sample in r["result"]["samples"]]}
            write_json(folder / (name + ".json"), composite)
        else:
            (folder / (name + ".json")).unlink(missing_ok=True)
    write_json(folder / (name + "-attempts.json"), suite["attempts"])
    return suite


def server_for(bundle_path, port=8000, root=ROOT):
    """Loopback, read-only server with one fixed result endpoint. No uploads."""
    root, bundle_path = Path(root).resolve(), Path(bundle_path).resolve()
    class Handler(SimpleHTTPRequestHandler):
        def send_head(self):
            if urlsplit(self.path).path == "/__memory_lab__/bundle.json":
                data = bundle_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                return io.BytesIO(data)
            if urlsplit(self.path).path == "/":
                self.path = "/index.html" + ("?" + urlsplit(self.path).query if urlsplit(self.path).query else "")
            path = Path(self.translate_path(self.path)).resolve()
            if not path.is_relative_to(root) or any(p.startswith(".") for p in path.relative_to(root).parts) or path.is_dir():
                self.send_error(404)
                return None
            return super().send_head()

        def reject_write(self):
            self.send_error(405, "This lab server only reads files; uploads/writes are disabled.")
        do_POST = do_PUT = do_PATCH = do_DELETE = reject_write

    handler = functools.partial(Handler, directory=str(root))
    try:
        return ThreadingHTTPServer(("127.0.0.1", port), handler)
    except OSError:
        if port == 8000:
            return ThreadingHTTPServer(("127.0.0.1", 0), handler)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serve", action="store_true", help="open the local lab with this bundle automatically loaded")
    parser.add_argument("--quick", action="store_true", help="smoke checks only, not hardware characterization")
    parser.add_argument("--results", type=Path, default=ROOT / "results")
    parser.add_argument("--cpu", type=int, help="preferred anchor CPU; unavailable IDs fall back with a recorded reason")
    parser.add_argument("--cpus", help="restrict placement to this Linux CPU list; unavailable IDs are recorded")
    parser.add_argument("--cc", default="cc")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--notes", default="", help="optional DIMM, BIOS, thermal/load and placement notes")
    parser.add_argument("--no-perf", action="store_true", help="skip optional supporting perf stat runs")
    parser.add_argument("--timeout", type=int, default=1800, help="seconds per suite placement, including compilation")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true", help="print local URL without opening a browser")
    args = parser.parse_args()
    if not sys.platform.startswith("linux") or not hasattr(os, "sched_getaffinity"):
        parser.error("The native workflow requires Linux CPU affinity; browser imports remain portable.")
    if not 0 < args.seed <= 2**53 - 1 or args.timeout < 1 or not 0 <= args.port <= 65535:
        parser.error("Choose an exactly representable bundle seed (1–2^53-1), positive timeout and valid port.")
    try:
        requested = cpu_list(args.cpus) if args.cpus is not None else None
    except ValueError as error:
        parser.error(str(error))
    topology = inspect_topology()
    placements = select_placements(topology, args.cpu, requested)
    machine = inspect_machine(topology, placements["single"]["cpus"][0] if placements["single"] else None)
    capabilities = detect_capabilities(args.cc)
    memory = available_memory()
    bundle = {"schema": SCHEMA, "created_utc": utc(), "complete": False, "machine": machine,
              "selection": placements, "capabilities": capabilities, "notes": args.notes,
              "provenance": {"orchestrator_sha256": sha256(__file__), "workflow_sha256": sha256(ROOT / "benchmarks/workflow.py"),
                             "command": [sys.executable, *sys.argv], "python": sys.version,
                             "remaining_memory_bytes": memory, "quick_requested": args.quick,
                             "statistics": "median averages the middle pair; SD is population SD; p95 is nearest rank; all raw trials retained"},
              "suites": {name: {"status": "skipped", "reason": "Not run yet.", "runs": [], "summaries": []} for name in SUITES}}
    folder = args.results.resolve() / "raw"
    folder.mkdir(parents=True, exist_ok=True)
    output = args.results.resolve() / "reference-machine.json"
    single = [placements["single"]] if placements["single"] else []
    physical = placements["physical"] or placements["single"]
    sharing = []
    if physical:
        sharing.append({**physical, "cpus": physical["cpus"][:2], "topology": physical["topology"][:2]})
    if placements["smt"]:
        sharing.append(placements["smt"])
    scheduled = {"memory": single, "sharing": sharing, "loaded": [physical] if physical else [], "vm": single, "prefetch": single}
    write_json(output, bundle)
    for name in SUITES:
        # Remove canonical stale outputs even when a capability now prevents execution.
        (folder / (name + ".json")).unlink(missing_ok=True)
        if capabilities["compiler"]["status"] == "unavailable":
            bundle["suites"][name]["reason"] = capabilities["compiler"]["reason"]
        elif name == "sharing" and any(r["line_bytes"] not in (None, 64) for p in scheduled[name] for r in p["topology"]):
            bundle["suites"][name]["reason"] = "Detected cache-line size differs from the sharing harness's 64-byte spacing; packed/padded classification unsupported."
        else:
            bundle["suites"][name] = run_suite(name, scheduled[name], args, folder, machine, memory)
        bundle["complete"] = all(s["status"] == "measured" for s in bundle["suites"].values())
        write_json(output, bundle)
    perf_command = None
    if bundle["suites"]["memory"]["status"] == "measured":
        sample = next(r for r in bundle["suites"]["memory"]["runs"][0]["result"]["samples"] if r["mode"] == "chase" and r["chains"] == 1)
        perf_command = [str(ROOT / "benchmarks/memlab"), "--mode", "chase", "--bytes", str(sample["bytes"]),
                        "--chains", "1", "--steps", str(sample["steps"]), "--repeats", "1", "--seed", str(sample["seed"]), "--cpu", str(sample["cpu"])]
    capabilities["perf_stat"] = collect_perf(perf_command, capabilities, args.no_perf)
    bundle["complete"] = all(s["status"] == "measured" for s in bundle["suites"].values())
    validate_bundle(bundle)
    write_json(output, bundle)
    print(f"Bundle: {output}\nHost: {machine['cpu_model']}\n" + ("Selected native suites complete." if bundle["complete"] else "Some suites unavailable/partial; inspect recorded reasons.") + (" Quick checks only; not characterization." if args.quick else ""), flush=True)
    failed = any(s["status"] in ("failed", "partial") for s in bundle["suites"].values())
    if args.serve:
        subprocess.run([sys.executable, str(ROOT / "build.py")], cwd=ROOT, check=True)
        server = server_for(output, args.port)
        url = f"http://127.0.0.1:{server.server_port}/memory_end_to_end.html?local=1#perf/datasets"
        print(f"Local lab: {url}\nResults load automatically. Stop with Ctrl+C.", flush=True)
        if not args.no_browser:
            threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("Interrupted; the last aggregate and raw checkpoints remain available.", file=sys.stderr)
        sys.exit(130)
