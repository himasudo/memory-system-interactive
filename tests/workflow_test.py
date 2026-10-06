"""Real harness integration plus deterministic topology/capability fallbacks."""
import copy
import json
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "benchmarks"))
from workflow import (collect_perf, cpu_list, detect_capabilities, inspect_topology,
                      parse_perf, select_placements, sha256, summarize, validate_bundle)


class Topology(unittest.TestCase):
    def machine(self, root, online="0-7", allowed=range(8)):
        root = Path(root)
        (root / "online").write_text(online)
        for cpu in range(8):
            folder = root / f"cpu{cpu}" / "topology"
            folder.mkdir(parents=True)
            for k, v in {"physical_package_id": 0, "die_id": 0, "core_id": cpu % 4,
                         "thread_siblings_list": f"{cpu % 4},{cpu % 4 + 4}"}.items():
                (folder / k).write_text(str(v))
            (folder.parent / "node0").mkdir()
        return inspect_topology(root, allowed)

    def test_physical_cores_and_nonadjacent_smt(self):
        with tempfile.TemporaryDirectory() as root:
            topology = self.machine(root)
            p = select_placements(topology)
            self.assertEqual(p["single"]["cpus"], [0])
            self.assertEqual(p["physical"]["cpus"], [0, 1, 2, 3])
            self.assertEqual(p["smt"]["cpus"], [0, 4])
            self.assertNotEqual(p["physical"]["topology"][0]["core_id"], p["physical"]["topology"][1]["core_id"])

    def test_restricted_affinity_and_unavailable_requested_cpu(self):
        with tempfile.TemporaryDirectory() as root:
            t = self.machine(root, allowed=[2, 6])
            p = select_placements(t, preferred_cpu=9999, requested=[9999])
            self.assertEqual(p["single"]["cpus"], [2])
            self.assertIsNone(p["physical"])
            self.assertEqual(p["smt"]["cpus"], [2, 6])
            self.assertTrue(any("falling back" in reason for reason in p["reasons"]))

    def test_no_sysfs_never_guesses_physical_or_smt(self):
        with tempfile.TemporaryDirectory() as root:
            p = select_placements(inspect_topology(root, [7, 11, 2048]))
            self.assertEqual(p["single"]["cpus"], [7])
            self.assertIsNone(p["physical"])
            self.assertIsNone(p["smt"])
            none = select_placements(inspect_topology(root, [2048]))
            self.assertIsNone(none["single"])

    def test_offline_cpus_and_nonreciprocal_siblings(self):
        with tempfile.TemporaryDirectory() as root:
            t = self.machine(root, online="0-3", allowed=[0, 1, 4])
            self.assertIsNone(select_placements(t)["smt"])
            t["cpus"][4]["online"] = True
            t["cpus"][4]["thread_siblings"] = [4]
            self.assertIsNone(select_placements(t)["smt"])

    def test_same_package_and_node_preferred(self):
        with tempfile.TemporaryDirectory() as root:
            t = self.machine(root)
            for row in t["cpus"]:
                row["package_id"] = 0 if row["cpu"] % 4 >= 2 else 1
                row["numa_node"] = row["package_id"]
            p = select_placements(t, preferred_cpu=2)
            self.assertEqual(p["physical"]["cpus"][:2], [2, 3])
            self.assertEqual(p["smt"]["cpus"], [2, 6])

    def test_linux_cpu_list(self):
        self.assertEqual(cpu_list("0-3,8,10-11"), [0, 1, 2, 3, 8, 10, 11])
        for invalid in ("3-1", "0,,2", "-1", "1;2", "0-9999999"):
            with self.assertRaises(ValueError):
                cpu_list(invalid)


class Capabilities(unittest.TestCase):
    def test_missing_tools_and_ibs(self):
        with tempfile.TemporaryDirectory() as root:
            c = detect_capabilities(event_root=root, which=lambda _: None)
            self.assertEqual(c["perf"]["status"], "unavailable")
            self.assertEqual(c["ibs"]["status"], "unavailable")
            self.assertEqual(collect_perf(["not-run"], c)["status"], "skipped")

    def test_ibs_detection_does_not_imply_sampling_permission(self):
        with tempfile.TemporaryDirectory() as root:
            op = Path(root) / "ibs_op"
            (op / "format").mkdir(parents=True)
            (op / "type").write_text("9")
            (op / "format/cnt_ctl").write_text("config:19")
            c = detect_capabilities(event_root=root, which=lambda _: None)
            self.assertEqual(c["ibs"]["status"], "detected")
            self.assertEqual(c["ibs"]["pmus"]["ibs_op"]["format"]["cnt_ctl"], "config:19")
            self.assertEqual(c["ibs_sampling"]["status"], "skipped")
            self.assertIn("semantics", c["ibs_sampling"]["reason"])

    def test_perf_permission_failure_is_clean_and_keeps_stderr(self):
        calls = []
        def denied(argv):
            calls.append(argv)
            return subprocess.CompletedProcess(argv, 255, "", "No permission to enable cycles event")
        result = collect_perf(["memlab", "--cpu", "3"], {"perf": {"status": "detected"}}, executor=denied)
        self.assertEqual(result["status"], "skipped")
        self.assertEqual(len(calls), 3)
        self.assertTrue(all(r["status"] == "skipped" and "permission" in r["stderr"] for r in result["records"]))
        self.assertTrue(all("-a" not in argv for argv in calls))

    def test_perf_semantics_scope_and_multiplexing(self):
        def counted(argv):
            event = argv[argv.index("-e") + 1]
            return subprocess.CompletedProcess(argv, 0, '{"verified":true}\n', f"1234;;{event};900000;97.50;;\n")
        result = collect_perf(["memlab"], {"perf": {"status": "detected"}}, executor=counted)
        self.assertEqual(result["status"], "collected")
        self.assertEqual([r["event"] for r in result["records"]], ["task-clock", "cycles:u", "instructions:u"])
        for record in result["records"]:
            self.assertEqual(record["counter"]["running_percent"], 97.5)
            self.assertTrue(record["counter"]["scaled_by_perf"])
            self.assertIn("NOT the native timed kernel", record["boundary"])
            self.assertNotIn("ipc", record)
        self.assertIsNone(parse_perf("<not supported>;;cycles:u;0;0", "cycles:u"))
        self.assertIsNone(parse_perf("NaN;;cycles:u;1;100", "cycles:u"))
        self.assertIsNone(parse_perf("100;;cycles:u;1;100.01", "cycles:u"))


class FullWorkflow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        cls.results = Path(cls.folder.name)
        cls.process = subprocess.Popen([sys.executable, "benchmarks/run_all.py", "--quick", "--no-perf",
                                        "--serve", "--no-browser", "--port", "0", "--cpu", "999999",
                                        "--results", str(cls.results)], cwd=ROOT, stdout=subprocess.PIPE,
                                       stderr=subprocess.STDOUT, text=True, start_new_session=True, bufsize=1)
        selector = selectors.DefaultSelector()
        selector.register(cls.process.stdout, selectors.EVENT_READ)
        deadline, lines, url = time.monotonic() + 90, [], None
        while time.monotonic() < deadline:
            if selector.select(.25):
                lines.append(os.read(cls.process.stdout.fileno(), 65536).decode())
                found = re.search(r"Local lab: (http://\S+)", "".join(lines))
                if found:
                    url = found.group(1)
                    break
            if cls.process.poll() is not None:
                break
        selector.close()
        if url is None:
            cls.process.kill()
            raise RuntimeError("Local --serve workflow failed: " + "".join(lines))
        cls.url = url
        cls.origin = url.split("/memory_end_to_end.html")[0]
        cls.bundle = json.loads((cls.results / "reference-machine.json").read_text())

    @classmethod
    def tearDownClass(cls):
        cls.process.send_signal(signal.SIGINT)
        cls.process.communicate(timeout=10)
        cls.folder.cleanup()

    def test_safe_suite_and_provenance_preserved(self):
        b = validate_bundle(self.bundle)
        self.assertTrue(b["complete"])
        self.assertIn("?local=1#perf/datasets", self.url)
        self.assertTrue(any("999999" in r for r in b["selection"]["reasons"]))
        for name, suite in b["suites"].items():
            self.assertEqual(suite["status"], "measured")
            self.assertTrue((self.results / "raw" / (name + ".json")).exists())
            for run in suite["runs"]:
                raw = self.results / "raw" / run["raw_file"]
                self.assertEqual(run["result"], json.loads(raw.read_text()))
                self.assertEqual(run["raw_sha256"], sha256(raw))
                self.assertEqual(run["result"]["context"]["cpu_model"], b["machine"]["cpu_model"])
                self.assertEqual(run["result"]["context"]["source_sha256"], sha256(ROOT / "benchmarks" / ("memlab.c" if name == "memory" else name + ".c")))
                self.assertEqual(run["placement"]["cpus"], run["result"]["context"].get("cpus", [run["result"]["context"].get("cpu")]))
                self.assertTrue(summarize(name, run))
        self.assertEqual(b["capabilities"]["perf_stat"]["reason"], "Disabled by --no-perf.")
        self.assertEqual(b["capabilities"]["ibs_sampling"]["status"], "skipped")

    def test_schema_provenance_and_completion_rejections(self):
        for change in (lambda b: b.update(schema="wrong"),
                       lambda b: b["suites"].pop("vm"),
                       lambda b: b["machine"].update(is_ryzen_7_3750h=not b["machine"]["is_ryzen_7_3750h"]),
                       lambda b: b["suites"]["memory"]["runs"][0]["result"]["context"].update(kernel="different"),
                       lambda b: b["suites"]["memory"]["runs"][0]["result"]["context"].update(source_sha256="missing"),
                       lambda b: b.update(complete=False)):
            bad = copy.deepcopy(self.bundle)
            change(bad)
            with self.assertRaises(ValueError):
                validate_bundle(bad)

    def test_partial_bundle_and_skips_are_explicit(self):
        b = copy.deepcopy(self.bundle)
        b["complete"] = False
        b["suites"]["vm"] = {"status": "skipped", "reason": "No mapping capability in this test case.", "runs": [], "summaries": []}
        self.assertFalse(validate_bundle(b)["complete"])

    def test_local_endpoint_and_read_only_server(self):
        with urlopen(self.origin + "/__memory_lab__/bundle.json", timeout=5) as response:
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(json.load(response), self.bundle)
        with urlopen(Request(self.origin + "/__memory_lab__/bundle.json", method="HEAD"), timeout=5) as response:
            self.assertEqual(response.status, 200)
        with urlopen(self.origin + "/", timeout=5) as response:
            self.assertIn(b"location.replace", response.read())
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(self.origin + "/__memory_lab__/bundle.json", data=b'{}', method=method), timeout=5)
            self.assertEqual(error.exception.code, 405)
        for path in ("/.git/config", "/benchmarks/", "/%2e%2e/etc/passwd"):
            with self.assertRaises(HTTPError) as error:
                urlopen(self.origin + path, timeout=5)
            self.assertEqual(error.exception.code, 404)

    def test_environment_snapshots_and_suite_durations_are_associated(self):
        b = self.bundle
        self.assertEqual(b["environment"]["before_run"]["position"], "before_run")
        self.assertEqual(b["environment"]["after_run"]["position"], "after_run")
        self.assertGreater(b["environment"]["elapsed_ns"], 0)
        for name, suite in b["suites"].items():
            e = suite["environment"]
            self.assertEqual(e["suite"], name)
            self.assertGreater(e["elapsed_ns"], 0)
            for position, value in [("before_suite", e["before"]), ("after_suite", e["after"])]:
                self.assertEqual(value["position"], position)
                self.assertEqual(value["suite"], name)
                self.assertEqual([r["cpu"] for r in value["cpus"]["entries"]], sorted(b["machine"]["topology"]["online_cpus"]))
                self.assertTrue(value["captured_utc"])
                self.assertTrue(value["finished_utc"])
                self.assertIn("not be the exact", value["frequency_semantics"])
        self.assertEqual(b["provenance"]["environment_collector_sha256"], sha256(ROOT / "benchmarks/environment.py"))

    def test_public_export_preserves_every_native_suite_and_private_bytes(self):
        from export_public import export_bundle, local_paths
        path = self.results / "reference-machine.json"
        before = path.read_bytes()
        exported = export_bundle(self.bundle)
        self.assertEqual(path.read_bytes(), before)
        self.assertEqual(validate_bundle(exported), exported)
        self.assertFalse(local_paths(exported))
        for name, suite in self.bundle["suites"].items():
            for a, z in zip(suite["runs"], exported["suites"][name]["runs"]):
                self.assertEqual(len(a["result"]["samples"]), len(z["result"]["samples"]))
                for key in ["source_sha256", "binary_sha256", "clock", "quick"]:
                    self.assertEqual(a["result"]["context"][key], z["result"]["context"][key])
                self.assertEqual(a["raw_sha256"], z["raw_sha256"])
                self.assertEqual(a["runner_sha256"], z["runner_sha256"])
                self.assertEqual(a["result"]["samples"], z["result"]["samples"]) if name != "vm" else None


if __name__ == "__main__":
    unittest.main()
