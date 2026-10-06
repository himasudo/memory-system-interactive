#!/usr/bin/env python3
"""Register an existing sanitized bundle as an optional shipped machine. No run/upload."""
import argparse
import json
from pathlib import Path
import re

from export_public import SCHEMA as EXPORT_SCHEMA, local_paths
from workflow import validate_bundle, write_json

SCHEMA = "memory-lab-measured-machines-v1"
ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")
FILE = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+)*\.json\Z")


def register(bundle_path, registry_path, machine_id, label):
    if not ID.fullmatch(machine_id) or not label or len(label) > 160:
        raise ValueError("Use a short label and a lowercase alphanumeric/dash ID.")
    if not FILE.fullmatch(bundle_path.name) or bundle_path.name == "index.json":
        raise ValueError("Dataset must have a plain JSON basename distinct from index.json.")
    if registry_path.name != "index.json" or bundle_path.resolve().parent != registry_path.resolve().parent:
        raise ValueError("Registry index.json and the public bundle must share a directory.")
    data = bundle_path.read_bytes()
    if len(data) > 32 * 1024**2:
        raise ValueError("Bundle exceeds the browser size limit.")
    bundle = json.loads(data)
    validate_bundle(bundle)
    if bundle.get("public_export", {}).get("schema") != EXPORT_SCHEMA or list(local_paths(bundle)):
        raise ValueError("Export a sanitized public copy first; private local paths cannot be registered.")
    registry = json.loads(registry_path.read_text()) if registry_path.exists() else {"schema": SCHEMA, "machines": []}
    if not isinstance(registry, dict) or registry.get("schema") != SCHEMA or not isinstance(registry.get("machines"), list):
        raise ValueError("Unsupported existing registry; it was left unchanged.")
    machines = registry["machines"]
    if len(machines) >= 8:
        raise ValueError("The optional registry supports at most eight machines.")
    if any(not isinstance(e, dict) or e.get("id") == machine_id or e.get("file") == bundle_path.name for e in machines):
        raise ValueError("Duplicate ID/file or malformed entry; curate the existing registry explicitly.")
    machine = bundle["machine"]
    registry["machines"].append({"id": machine_id, "label": label, "file": bundle_path.name,
        "identity": {k: machine[k] for k in ("cpu_model", "architecture", "cpu_details")}})
    # Match the browser contract, including malformed existing entries, before writing.
    for entry in machines:
        identity = entry.get("identity", {})
        if (not isinstance(entry.get("id"), str) or not ID.fullmatch(entry["id"])
                or not isinstance(entry.get("file"), str) or not FILE.fullmatch(entry["file"])
                or entry["file"] == "index.json" or not isinstance(entry.get("label"), str)
                or not 0 < len(entry["label"]) <= 160 or not isinstance(identity, dict)
                or not all(isinstance(identity.get(k), str) and identity[k] for k in ("cpu_model", "architecture"))
                or not isinstance(identity.get("cpu_details"), dict)
                or not all(isinstance(v, (str, int, float)) and not isinstance(v, bool) for v in identity["cpu_details"].values())):
            raise ValueError("Registry entry fails the browser contract; it was left unchanged.")
    if len({e["id"] for e in machines}) != len(machines) or len({e["file"] for e in machines}) != len(machines):
        raise ValueError("Duplicate registry IDs/files; it was left unchanged.")
    if len(json.dumps(registry).encode()) > 32768:
        raise ValueError("Registry exceeds the browser size limit.")
    write_json(registry_path, registry)
    return registry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path, help="sanitized public bundle in data/reference")
    parser.add_argument("--id", required=True, help="stable dataset ID")
    parser.add_argument("--label", required=True, help="short display name; recorded CPU identity remains visible")
    args = parser.parse_args()
    try:
        registry = args.bundle.parent / "index.json"
        register(args.bundle, registry, args.id, args.label)
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.error(str(error))
    print(f"Registered optional measured machine in {registry}. No benchmarks, commit, or upload performed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
