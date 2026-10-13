"""Optional curation gates; all bundles here are explicitly synthetic fixtures."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from public_export_test import fixture, export_bundle, ROOT
from register_dataset import register


class Registry(unittest.TestCase):
    def test_curating_multiple_architectures_preserves_input_bytes_and_browser_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            registry = root / "index.json"
            for name, arch in [("x86", "x86_64"), ("arm", "aarch64")]:
                bundle = fixture()
                bundle["machine"]["cpu_model"] = "SYNTHETIC " + name
                bundle["machine"]["architecture"] = arch
                context = bundle["suites"]["memory"]["runs"][0]["result"]["context"]
                context["cpu_model"] = bundle["machine"]["cpu_model"]
                context["architecture"] = arch
                path = root / (name + ".json")
                path.write_text(json.dumps(export_bundle(bundle)))
                before = path.read_bytes()
                result = register(path, registry, name, "Test " + name)
                self.assertEqual(path.read_bytes(), before)
                self.assertEqual(result["machines"][-1]["identity"], {k: bundle["machine"][k] for k in ("cpu_model", "architecture", "cpu_details")})
            # Exercise the actual browser validator against the Python-written registry.
            subprocess.run(["node", "-e", "require('./src/13_measured_registry.js').validate(JSON.parse(require('fs').readFileSync(process.argv[1])))", str(registry)], cwd=ROOT, check=True)

    def test_private_or_mislabeled_paths_do_not_create_a_registry(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "test.json"
            for bundle in [fixture(), {**export_bundle(fixture()), "notes": "/home/private/secret"}]:
                path.write_text(json.dumps(bundle))
                with self.assertRaises(ValueError):
                    register(path, root / "index.json", "test", "Test fixture")
                self.assertFalse((root / "index.json").exists())

    def test_duplicate_malformed_and_cross_directory_changes_are_non_destructive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "test.json"
            path.write_text(json.dumps(export_bundle(fixture())))
            registry = root / "index.json"
            register(path, registry, "test", "Test fixture")
            before = registry.read_bytes()
            for target, machine_id in [(registry, "test"), (registry, "bad/id"), (root / "other" / "index.json", "new")]:
                with self.assertRaises(ValueError):
                    register(path, target, machine_id, "Test fixture")
                self.assertEqual(registry.read_bytes(), before)
            registry.write_text('{"schema":"wrong","machines":[]}')
            before = registry.read_bytes()
            with self.assertRaises(ValueError):
                register(path, registry, "new", "Test fixture")
            self.assertEqual(registry.read_bytes(), before)

    def test_cli_registers_existing_export_without_benchmark_or_network(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.json"
            path.write_text(json.dumps(export_bundle(fixture())))
            run = subprocess.run([sys.executable, "benchmarks/register_dataset.py", str(path), "--id", "test", "--label", "TEST ONLY"], cwd=ROOT, text=True, capture_output=True, check=True)
            self.assertIn("No benchmarks, commit, or upload", run.stdout)
            self.assertTrue((path.parent / "index.json").exists())


if __name__ == "__main__":
    unittest.main()
