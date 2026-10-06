#!/usr/bin/env python3
"""Export an existing bundle for public curation. Never runs a benchmark."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re

from workflow import SUITES, target_machine, utc, validate_bundle, write_json

SCHEMA = "memory-lab-public-export-v1"
# URLs and units such as ns/load are not filesystem paths. Critical local roots
# also match inside diagnostics, dictionary keys and compiler option values.
TOKEN = r"[^\s\"'<>|;,()\[\]{}]+"
SPACED_DIRECTORIES = r"(?:[ \t]+[^\s\"'<>|;,()\[\]{}]*[/\\]" + TOKEN + r")*"
POSIX = re.compile(r"(?:(?<![\w:/\\])|(?=/(?:home|Users|private|tmp|workspace|root|mnt|media|opt|usr|var|etc|run)/))/(?!\s)" + TOKEN + SPACED_DIRECTORIES)
WINDOWS = re.compile(r"(?:(?<![\w])|(?<=-I)|(?<=-L))(?:[A-Za-z]:[\\/]+|\\\\[^\\\s]+\\)" + TOKEN + SPACED_DIRECTORIES)
QUOTED = re.compile(r"(?P<quote>[\"'])(?P<path>(?:/|[A-Za-z]:[\\/]|\\\\)[^\n]*?)(?P=quote)")
FILE_URL = re.compile(r"file://(?:localhost)?(?P<path>/[^\s\"'<>|;,()\[\]{}]+)")
BINARIES = {"memory": "memlab", **{n: n for n in SUITES if n != "memory"}}


def normalized(path):
    return re.sub(r"/+", "/", str(path).replace("\\", "/"))


def absolute(path):
    return path.startswith(("/", "\\\\")) or bool(re.match(r"^[A-Za-z]:[\\/]", path))


def system_path(path):
    # Stable kernel/device interfaces are scientifically meaningful source labels.
    parts = normalized(path).split("/")
    return (path.startswith(("/sys/", "/proc/", "/dev/")) and ".." not in parts or
            path in ("/org/freedesktop/UPower/PowerProfiles", "/net/hadess/PowerProfiles"))


class Sanitizer:
    def __init__(self, bundle):
        self.aliases = {}
        self.unknown = {}
        self.changed = 0
        self.key_changes = 0
        def alias(path, logical):
            if isinstance(path, str) and absolute(path):
                self.aliases[path] = logical
                if "\\" in path:
                    self.aliases[path.replace("\\", "\\\\")] = logical
        def repository(path):
            match = re.search(r"[/\\]benchmarks[/\\]", path)
            if match:
                prefix = path[:match.start()]
                alias(prefix + ("\\" if "\\" in path else "/"), "")
                alias(prefix, "repository")
        def invocation(command):
            if not isinstance(command, list):
                return
            for index, value in enumerate(command):
                if not isinstance(value, str):
                    continue
                leaf = normalized(value).rsplit("/", 1)[-1]
                if re.fullmatch(r"python(?:\d+(?:\.\d+)*)?", leaf):
                    alias(value, "python3")
                if leaf in ("run_all.py", "run.py", "sharing.py", "loaded.py", "vm.py", "prefetch.py"):
                    alias(value, "benchmarks/" + leaf)
                    repository(value)
                if index and command[index - 1] in ("--output", "--results"):
                    if command[index - 1] == "--output":
                        alias(value, "results/raw/" + leaf)
                        parent = value.rsplit("\\" if "\\" in value else "/", 1)[0]
                        alias(parent, "results/raw")
                    else:
                        alias(value, "results")
        invocation(bundle.get("provenance", {}).get("command"))
        for name, suite in bundle["suites"].items():
            for attempt in suite.get("attempts", []):
                invocation(attempt.get("command"))
            for run in suite["runs"]:
                invocation(run["invocation"].get("command"))
                command = run["result"]["context"]["compile_command"]
                binary = BINARIES[name]
                for index, value in enumerate(command):
                    if normalized(value).endswith(".c"):
                        alias(value, "benchmarks/" + binary + ".c")
                        repository(value)
                    elif index and command[index - 1] == "-o":
                        alias(value, "benchmarks/" + binary)
                        repository(value)
        # Most specific aliases first; do not publish this private mapping table.
        self.replacements = sorted(self.aliases.items(), key=lambda item: len(item[0]), reverse=True)

    def logical(self, path):
        if system_path(path):
            return path
        value = normalized(path)
        for private, public in self.replacements:
            source = normalized(private)
            # Windows drive paths are case-insensitive; POSIX paths are not.
            equal = value.lower() == source.lower() if re.match(r"^[A-Za-z]:", value) else value == source
            if equal:
                return public
        leaf = value.rsplit("/", 1)[-1]
        known = {n for n in BINARIES.values()} | {n + ".c" for n in BINARIES.values()} | {n + ".py" for n in BINARIES.values()} | {"run.py", "run_all.py", "environment.py", "workflow.py"}
        if leaf in known:
            return "benchmarks/" + leaf
        if re.fullmatch(r"python(?:\d+(?:\.\d+)*)?", leaf):
            return "python3"
        if leaf in ("cc", "gcc", "clang", "perf", "busctl"):
            return leaf
        if re.fullmatch(r"memory-lab-vm-[A-Za-z0-9]+", leaf):
            return "temporary/vm-file"
        if path not in self.unknown:
            self.unknown[path] = "paths/local-" + str(len(self.unknown) + 1)
        return self.unknown[path]

    def text(self, value):
        original = value
        for private, public in self.replacements:
            boundary = "" if private.endswith(("/", "\\")) else r"(?=$|[/\\\s\"':;,()\[\]{}])"
            value = re.sub(re.escape(private) + boundary, lambda _: public, value)
        # Whole path arguments can contain spaces. Keep quoted diagnostics intact.
        if absolute(value) and "\n" not in value and not re.search(r":\s|\s\(deleted\)", value):
            value = self.logical(value)
        value = QUOTED.sub(lambda m: m["quote"] + self.logical(m["path"]) + m["quote"], value)
        value = FILE_URL.sub(lambda m: self.logical(m["path"]), value)
        value = WINDOWS.sub(lambda m: self.logical(m[0]), value)
        value = POSIX.sub(lambda m: self.logical(m[0]), value)
        if value != original:
            self.changed += 1
        return value

    def walk(self, value):
        if isinstance(value, str):
            return self.text(value)
        if isinstance(value, list):
            return [self.walk(v) for v in value]
        if isinstance(value, dict):
            result = {}
            for key, child in value.items():
                public_key = self.text(key)
                if public_key in result:
                    raise ValueError("Path sanitization would collapse distinct metadata keys.")
                self.key_changes += public_key != key
                if key == "raw_file":
                    child = "results/raw/" + normalized(child).rsplit("/", 1)[-1]
                result[public_key] = self.walk(child)
            return result
        return value


def local_paths(value):
    """Fail closed on surviving POSIX, drive-letter, UNC or file-URL paths."""
    found = []
    if isinstance(value, dict):
        for key, child in value.items():
            found.extend(local_paths(key))
            found.extend(local_paths(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(local_paths(child))
    elif isinstance(value, str):
        if absolute(value) and not system_path(value):
            found.append(value)
        for pattern in (QUOTED, FILE_URL, WINDOWS, POSIX):
            for match in pattern.finditer(value):
                path = match.groupdict().get("path") or match[0]
                if not system_path(path):
                    found.append(path)
    return found


def hashes(value, prefix=()):
    result = {}
    if isinstance(value, dict):
        for key, child in value.items():
            if key.endswith("sha256"):
                result[prefix + (key,)] = child
            result.update(hashes(child, prefix + (key,)))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            result.update(hashes(child, prefix + (index,)))
    return result


def verify_measurements(original, public, sanitizer):
    """Trial values are exact. Only VM smaps pathname text may be redacted."""
    for name, suite in original["suites"].items():
        other = public["suites"][name]
        if len(suite["runs"]) != len(other["runs"]) or suite["status"] != other["status"]:
            raise ValueError("Public export altered suite/run accounting.")
        for run, exported in zip(suite["runs"], other["runs"]):
            before, after = copy.deepcopy(run["result"]["samples"]), copy.deepcopy(exported["result"]["samples"])
            if name == "vm":
                for a, b in zip(before, after):
                    expected = {k: sanitizer.text(v) for k, v in a.get("smaps", {}).items()}
                    if b.get("smaps", {}) != expected:
                        raise ValueError("Public export altered VM mapping evidence.")
                    a.pop("smaps", None)
                    b.pop("smaps", None)
            if json.dumps(before, sort_keys=True) != json.dumps(after, sort_keys=True):
                raise ValueError("Public export would alter scientific raw trial values.")
            if run["placement"] != exported["placement"]:
                # Placement source text may mention sysfs; CPU/core identities may not change.
                if sanitizer.walk(run["placement"]) != exported["placement"]:
                    raise ValueError("Public export altered CPU placement.")
        if suite["summaries"] != other["summaries"]:
            raise ValueError("Public export altered measurement statistics/parameters.")
    for path, value in hashes(original).items():
        exported = public
        for segment in path:
            exported = exported[sanitizer.text(segment) if isinstance(segment, str) else segment]
        if exported != value:
            raise ValueError("Public export altered original provenance hashes.")


def export_bundle(bundle, input_sha256=None):
    if not isinstance(bundle, dict):
        raise ValueError("Expected an aggregate JSON object.")
    validate_bundle(bundle)
    if "public_export" in bundle:
        raise ValueError("Input is already a public export; select the original private bundle.")
    sanitizer = Sanitizer(bundle)
    public = sanitizer.walk(bundle)
    changed_strings, changed_keys = sanitizer.changed, sanitizer.key_changes
    verify_measurements(bundle, public, sanitizer)
    if local_paths(public):
        raise ValueError("Machine-local paths remain; no public file was written.")
    public["public_export"] = {"schema": SCHEMA, "exported_utc": utc(),
        "input_bundle_sha256": input_sha256 or hashlib.sha256(json.dumps(bundle, sort_keys=True).encode()).hexdigest(),
        "exporter_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "sanitized_string_count": changed_strings, "sanitized_key_count": changed_keys,
        "path_policy": "Stable logical benchmark/result paths; other local paths redacted. Kernel sysfs/proc/device and known D-Bus interface source paths retained.",
        "raw_hash_scope": "raw_sha256 identifies original private per-suite file bytes, not the sanitized embedded metadata. Source/binary/runner hashes are unchanged.",
        "trial_equivalence": "All raw trial values and statistics preserved exactly; only local pathname text in VM smaps headers is sanitized.",
        "environment_telemetry": "preserved" if "environment" in bundle else "not recorded by the input bundle; no snapshots inferred"}
    validate_bundle(public)
    return public


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="existing results/reference-machine.json; no new benchmark run")
    parser.add_argument("output", type=Path, help="separate public JSON artifact")
    args = parser.parse_args()
    try:
        if args.input.resolve() == args.output.resolve() or args.input.exists() and args.output.exists() and os.path.samefile(args.input, args.output):
            raise ValueError("Public export must be separate from the private input bundle.")
        if args.output.resolve().is_relative_to(args.input.resolve().parent / "raw"):
            raise ValueError("Public export cannot overwrite the private raw-result directory.")
        private_bytes = args.input.read_bytes()
        if len(private_bytes) > 32 * 1024**2:
            raise ValueError("Bundle exceeds the browser's 32 MiB limit.")
        bundle = json.loads(private_bytes)
        if not isinstance(bundle, dict):
            raise ValueError("Expected an aggregate JSON object.")
        validate_bundle(bundle)
        for suite in bundle.get("suites", {}).values():
            for run in suite.get("runs", []):
                argv = run.get("invocation", {}).get("command", [])
                for index, flag in enumerate(argv[:-1]):
                    if flag == "--output":
                        raw = Path(argv[index + 1])
                        if raw.resolve() == args.output.resolve() or raw.exists() and args.output.exists() and os.path.samefile(raw, args.output):
                            raise ValueError("Public export cannot overwrite an original per-suite raw file.")
        if args.output.name == "ryzen7-3750h.json" and not target_machine(bundle.get("machine", {})):
            raise ValueError("The named Ryzen reference requires recorded Ryzen 7 3750H identity.")
        public = export_bundle(bundle, hashlib.sha256(private_bytes).hexdigest())
        write_json(args.output, public)
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.error(str(error))
    trials = sum(len(r["result"]["samples"]) for s in public["suites"].values() for r in s["runs"])
    print(f"Public export: {args.output}\nPreserved {trials} raw trials. Private bundle unchanged. No benchmarks run, commit, or upload performed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
