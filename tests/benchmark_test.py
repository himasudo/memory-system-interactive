"""Validate native execution and result accounting, not performance thresholds."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class NativeBenchmark(unittest.TestCase):
    def test_runner_and_rejections(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / "smoke.json"
            subprocess.run(["python3", "benchmarks/run.py", "--quick", "--output", str(out)], cwd=root, check=True, capture_output=True)
            data = json.loads(out.read_text())
            self.assertEqual(data["schema"], "memory-lab-v1")
            self.assertTrue(data["complete"])
            self.assertEqual(len(data["samples"]), 36)
            self.assertEqual({r["chains"] for r in data["samples"]}, {1, 2, 4, 8, 16})
            for row in data["samples"]:
                self.assertGreater(row["elapsed_ns"], 0)
                self.assertEqual(row["operations"] * 8, row["useful_bytes"])
                self.assertEqual(row["cpu_before"], data["context"]["cpu"])
                self.assertEqual(row["cpu_after"], data["context"]["cpu"])
                self.assertIn("checksum", row)
            self.assertEqual(len(data["context"]["binary_sha256"]), 64)
            for args in [["--bytes", "-1"], ["--chains", "3"], ["--mode", "bad"], ["--steps", "0"], ["--seed", "0"], ["--bytes", "1025"]]:
                completed = subprocess.run([str(root / "benchmarks/memlab"), *args], capture_output=True)
                self.assertEqual(completed.returncode, 2)


if __name__ == "__main__":
    unittest.main()
