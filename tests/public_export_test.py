"""Public export privacy/equivalence; fixtures are synthetic, never measurements."""
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "benchmarks"))
from export_public import export_bundle, hashes, local_paths
from environment import snapshot, changes, SCHEMA as ENV_SCHEMA, THRESHOLDS, INTERPRETATION
from workflow import validate_bundle


def fixture(windows=False):
    prefix = r"C:\Users\Private User\work\memory-lab" if windows else "/home/private-user/work/memory-lab"
    def path(tail):
        return prefix + ("\\" + tail.replace("/", "\\") if windows else "/" + tail)
    context = {"cpu_model": "Synthetic fixture CPU; NOT HARDWARE EVIDENCE", "kernel": "test-kernel", "architecture": "x86_64",
        "cpu": 0, "allowed_cpus": [0], "source_sha256": "a" * 64, "binary_sha256": "b" * 64,
        "compiler": {"command": [path("tools/gcc"), "--version"], "stdout": "gcc (fixture) 13.3.0\nConfigured with --prefix=/opt/private-build/compiler\n"},
        "compile_command": [path("tools/gcc"), "-O3", "-std=c11", "-g", path("benchmarks/memlab.c"), "-o", path("benchmarks/memlab")],
        "clock": "CLOCK_MONOTONIC_RAW; ns", "timing_boundary": "kernel only", "useful_byte_boundary": "8 B/load", "quick": False,
        "notes": 'Fixture only; private directory "' + path("notes/Private File.txt") + '"'}
    samples = [{"mode": "chase", "bytes": 4096, "chains": 1, "steps": 100, "operations": 100, "useful_bytes": 800,
                "seed": 1, "cpu": 0, "cpu_before": 0, "cpu_after": 0, "elapsed_ns": elapsed, "repeat": index, "checksum": "42"} for index, elapsed in enumerate([1000, 2000, 3000])]
    run = {"id": "single-0", "placement": {"kind": "single", "cpus": [0]}, "runner_sha256": "d" * 64,
           "invocation": {"command": [path("venv/bin/python3"), path("benchmarks/run.py"), "--output", path("results/raw/memory.json")],
                          "stdout": 'wrote "' + path("results/raw/memory.json") + '"', "stderr": ""},
           "raw_file": "memory.json", "raw_sha256": "c" * 64,
           "result": {"schema": "memory-lab-v1", "complete": True, "context": context, "samples": samples}}
    suites = {n: {"status": "skipped", "reason": "Not present in synthetic fixture", "runs": [], "summaries": []} for n in ["memory", "sharing", "loaded", "vm", "prefetch"]}
    suites["memory"] = {"status": "measured", "reason": None, "runs": [run], "summaries": []}
    return {"schema": "memory-lab-bundle-v1", "created_utc": "2026-01-01T00:00:00Z", "complete": False,
            "machine": {"cpu_model": context["cpu_model"], "kernel": context["kernel"], "architecture": context["architecture"],
                "cpu_details": {}, "is_ryzen_7_3750h": False, "topology": {"allowed_cpus": [0], "online_cpus": [0],
                    "cpus": [{"cpu": 0, "core_id": 0, "package_id": 0, "die_id": 0, "numa_node": 0, "thread_siblings": [0], "online": True, "allowed": True}]}},
            "provenance": {"command": [path("venv/bin/python3"), path("benchmarks/run_all.py"), "--results", path("results")], "orchestrator_sha256": "e" * 64},
            "capabilities": {"perf": {"status": "unavailable", "reason": "No perf in PATH; no policy changed."}, "ibs": {"status": "skipped", "reason": "No validated IBS sampling semantics."}}, "suites": suites}


class PublicExport(unittest.TestCase):
    def test_posix_paths_logical_commands_and_trial_equivalence(self):
        b = fixture()
        original = copy.deepcopy(b)
        out = export_bundle(b)
        self.assertEqual(b, original)
        self.assertEqual(b["suites"]["memory"]["runs"][0]["result"]["samples"], out["suites"]["memory"]["runs"][0]["result"]["samples"])
        run = out["suites"]["memory"]["runs"][0]
        self.assertEqual(run["raw_file"], "results/raw/memory.json")
        self.assertEqual(run["result"]["context"]["compile_command"], ["tools/gcc", "-O3", "-std=c11", "-g", "benchmarks/memlab.c", "-o", "benchmarks/memlab"])
        self.assertEqual(run["invocation"]["command"], ["python3", "benchmarks/run.py", "--output", "results/raw/memory.json"])
        self.assertEqual(hashes(b), {k: v for k, v in hashes(out).items() if k in hashes(b)})
        self.assertEqual(out["machine"], b["machine"])
        self.assertEqual(out["capabilities"], b["capabilities"])
        self.assertFalse(local_paths(out))
        self.assertNotIn("private-user", json.dumps(out))
        self.assertIn("not recorded", out["public_export"]["environment_telemetry"])

    def test_windows_paths_with_spaces_are_sanitized_and_not_mistaken_for_urls(self):
        b = fixture(True)
        b["notes"] = r'"D:\Users\Private User\Documents\file.txt" and \\secret-host\private share\other.txt; https://docs.kernel.org/admin-guide/pm/cpufreq.html'
        out = export_bundle(b)
        text = json.dumps(out)
        self.assertNotIn("Private User", text)
        self.assertNotIn("secret-host", text)
        self.assertNotIn("private share", text)
        self.assertNotRegex(text, r"[A-Za-z]:\\")
        self.assertIn("https://docs.kernel.org/admin-guide/pm/cpufreq.html", out["notes"])
        self.assertEqual(out["suites"]["memory"]["runs"][0]["result"]["samples"], b["suites"]["memory"]["runs"][0]["result"]["samples"])
        self.assertEqual(out["suites"]["memory"]["runs"][0]["result"]["context"]["compile_command"][-3:], ["benchmarks/memlab.c", "-o", "benchmarks/memlab"])

    def test_embedded_paths_in_notes_diagnostics_json_and_metadata_keys(self):
        b = fixture()
        b["extra"] = {"diagnostic./home/another-user/private.txt": 'error "' + "/Users/Person/My Documents/file.txt" + '"; errno 13',
                      "opaque_json": json.dumps({"path": "/root/sensitive/tree/secret.log", "elapsed_ns": 123456789}),
                      "file_url": "file:///home/person/private.json", "flag": r"-IC:\Private\include"}
        out = export_bundle(b)
        self.assertFalse(local_paths(out))
        self.assertNotRegex(json.dumps(out), r"/home/|/Users/|/root/|another-user|My Documents")
        self.assertEqual(json.loads(out["extra"]["opaque_json"])["elapsed_ns"], 123456789)
        self.assertIn("errno 13", str(out["extra"]))

    def test_unknown_path_in_a_trial_is_rejected_instead_of_changing_its_value(self):
        b = fixture()
        b["suites"]["memory"]["runs"][0]["result"]["samples"][0]["checksum"] = "/home/private/invalid-checksum"
        with self.assertRaisesRegex(ValueError, "raw trial values"):
            export_bundle(b)

    def test_vm_smaps_only_pathname_is_redacted_all_mapping_and_trial_values_preserved(self):
        b = fixture()
        vm = copy.deepcopy(b["suites"]["memory"])
        run = vm["runs"][0]
        run["result"]["schema"] = "memory-lab-vm-v1"
        run["result"]["context"].update(stage_boundary="whole stage", fault_boundary="rusage deltas")
        run["result"]["samples"] = [{"kind": "file-private", "advice": "base", "bytes": 4096, "page_bytes": 4096, "cpu": 0, "advice_errno": 0,
            "stages": [{"name": "first-read", "elapsed_ns": 123456, "minor": 1, "major": 0, "checksum": 42}],
            "smaps": {"before": "7f00-8f00 rw-p 00000000 00:1b 123 /tmp/memory-lab-vm-aBC123 (deleted)\nKernelPageSize: 4 kB\nMMUPageSize: 4 kB\nAnonHugePages: 0 kB\n"}}]
        b["suites"]["vm"] = vm
        out = export_bundle(b)
        a, z = run["result"]["samples"][0], out["suites"]["vm"]["runs"][0]["result"]["samples"][0]
        self.assertEqual({k: v for k, v in a.items() if k != "smaps"}, {k: v for k, v in z.items() if k != "smaps"})
        self.assertEqual(a["smaps"]["before"].splitlines()[1:], z["smaps"]["before"].splitlines()[1:])
        self.assertIn("7f00-8f00 rw-p 00000000 00:1b 123", z["smaps"]["before"])
        self.assertNotIn("/tmp/", z["smaps"]["before"])

    def test_browser_bundle_validator_accepts_export(self):
        b = export_bundle(fixture())
        script = "const M=require('./src/13_measurement_bundle.js');let s='';process.stdin.on('data',v=>s+=v);process.stdin.on('end',()=>M.validate(JSON.parse(s)));"
        result = subprocess.run(["node", "-e", script], cwd=ROOT, input=json.dumps(b), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def with_environment(self):
        b = fixture()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            def capture(position, suite=None):
                return snapshot([0], position, suite, root, which=lambda _: None)
            initial, before = capture("before_run"), capture("before_suite", "memory")
            path = root / "devices/system/cpu/cpu0/cpufreq"
            path.mkdir(parents=True)
            (path / "scaling_cur_freq").write_text("1400000")
            before = capture("before_suite", "memory")
            (path / "scaling_cur_freq").write_text("2300000")
            after, final = capture("after_suite", "memory"), capture("after_run")
        interval = {"suite": "memory", "before": before, "after": after,
                    "started_utc": before["finished_utc"], "finished_utc": after["captured_utc"],
                    "elapsed_ns": 123456789, "warnings": changes([before, after], "memory")}
        b["suites"]["memory"]["environment"] = interval
        b["environment"] = {"schema": ENV_SCHEMA, "before_run": initial, "after_run": final,
            "started_utc": initial["captured_utc"], "finished_utc": final["finished_utc"], "elapsed_ns": 456789123,
            "thresholds": THRESHOLDS, "interpretation": INTERPRETATION, "warnings": changes([initial, before, after, final])}
        return b

    def test_environment_values_timestamps_and_warnings_remain_attached_to_the_suite(self):
        b = self.with_environment()
        out = export_bundle(b)
        a, z = b["suites"]["memory"]["environment"], out["suites"]["memory"]["environment"]
        for field in ("suite", "started_utc", "finished_utc", "elapsed_ns", "warnings"):
            self.assertEqual(a[field], z[field])
        for phase in ("before", "after"):
            self.assertEqual(a[phase]["suite"], z[phase]["suite"])
            self.assertEqual(a[phase]["captured_utc"], z[phase]["captured_utc"])
            self.assertEqual(a[phase]["cpus"]["entries"][0]["scaling_cur_freq"]["value"], z[phase]["cpus"]["entries"][0]["scaling_cur_freq"]["value"])
        self.assertEqual(out["environment"]["warnings"], b["environment"]["warnings"])
        self.assertEqual(validate_bundle(out), out)
        self.assertFalse(local_paths(out))
        script = "const M=require('./src/13_measurement_bundle.js'),assert=require('node:assert/strict');let s='';process.stdin.on('data',v=>s+=v);process.stdin.on('end',()=>{const [a,b]=JSON.parse(s);M.validate(a);M.validate(b);const r=M.comparisons(a,b,'memory');assert.equal(r.length,1);assert.equal(r[0].ratio,1);assert.ok(a.suites.memory.environment.warnings.length);});"
        result = subprocess.run(["node", "-e", script], cwd=ROOT, input=json.dumps([b,out]), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_snapshot_and_warning_association_mismatches_are_rejected(self):
        for change in (lambda b: b["suites"]["memory"]["environment"]["before"].update(suite="loaded"),
                       lambda b: b["suites"]["memory"]["environment"]["after"].update(position="before_suite"),
                       lambda b: b["suites"]["memory"]["environment"]["warnings"][0].update(suite="loaded"),
                       lambda b: b["suites"]["memory"]["environment"].update(elapsed_ns=-1),
                       lambda b: b.pop("environment")):
            b = self.with_environment()
            change(b)
            with self.assertRaises(ValueError):
                export_bundle(b)

    def test_cli_never_reruns_or_mutates_private_input_and_records_original_byte_hash(self):
        with tempfile.TemporaryDirectory() as folder:
            private, public = Path(folder) / "private.json", Path(folder) / "public.json"
            private.write_text(json.dumps(fixture(), indent=2) + "\n")
            original = private.read_bytes()
            result = subprocess.run([sys.executable, "benchmarks/export_public.py", str(private), str(public)], cwd=ROOT, text=True, capture_output=True, env={**os.environ, "PATH": ""})
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(private.read_bytes(), original)
            self.assertEqual(json.loads(public.read_text())["public_export"]["input_bundle_sha256"], hashlib.sha256(original).hexdigest())
            self.assertIn("No benchmarks run", result.stdout)

    def test_in_place_aliases_and_malformed_input_do_not_overwrite_any_file(self):
        with tempfile.TemporaryDirectory() as folder:
            private, public = Path(folder) / "private.json", Path(folder) / "public.json"
            private.write_text(json.dumps(fixture()))
            before = private.read_bytes()
            aliases = [private, Path(folder) / "symlink.json", Path(folder) / "hardlink.json"]
            aliases[1].symlink_to(private)
            os.link(private, aliases[2])
            for destination in aliases:
                result = subprocess.run([sys.executable, "benchmarks/export_public.py", str(private), str(destination)], cwd=ROOT, text=True, capture_output=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(private.read_bytes(), before)
            public.write_text("existing artifact")
            private.write_text('{"bad":true}')
            result = subprocess.run([sys.executable, "benchmarks/export_public.py", str(private), str(public)], cwd=ROOT, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(public.read_text(), "existing artifact")

    def test_named_ryzen_reference_cannot_export_a_different_cpu(self):
        with tempfile.TemporaryDirectory() as folder:
            private, public = Path(folder) / "private.json", Path(folder) / "ryzen7-3750h.json"
            private.write_text(json.dumps(fixture()))
            result = subprocess.run([sys.executable, "benchmarks/export_public.py", str(private), str(public)], cwd=ROOT, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(public.exists())

    def test_private_raw_result_files_and_aliases_are_protected(self):
        with tempfile.TemporaryDirectory() as folder:
            private, raw = Path(folder) / "reference-machine.json", Path(folder) / "raw/memory.json"
            raw.parent.mkdir()
            raw.write_text("original raw bytes")
            private.write_text(json.dumps(fixture()))
            for output in (raw, Path(folder) / "raw/new.json"):
                result = subprocess.run([sys.executable, "benchmarks/export_public.py", str(private), str(output)], cwd=ROOT, text=True, capture_output=True)
                self.assertNotEqual(result.returncode, 0)
            self.assertEqual(raw.read_text(), "original raw bytes")

    def test_prefix_collisions_and_path_first_diagnostics_keep_the_error_reason(self):
        b = fixture()
        b["extra"] = {"collision": "/home/private-user/work/memory-lab-other/secrets/file.txt",
                      "reason": "/tmp/memory-lab-vm-abC123: permission denied",
                      "spaced": "Failure opening /Users/Private User/Library/Application Support/test.json; errno 13"}
        out = export_bundle(b)
        self.assertNotIn("secrets", out["extra"]["collision"])
        self.assertNotIn("Application Support", out["extra"]["spaced"])
        self.assertIn("permission denied", out["extra"]["reason"])
        self.assertIn("errno 13", out["extra"]["spaced"])


if __name__ == "__main__":
    unittest.main()
