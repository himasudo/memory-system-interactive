# Optional measured machines

No processor is the lab’s universal reference and no measured JSON is required.
Development checks and synthetic test fixtures are never shipped as hardware
evidence. A historical Ryzen 7 3750H run can be one contributed dataset, with its
recorded identity and conditions, alongside other machines.

Measure and inspect on the actual Linux host:

```sh
python3 benchmarks/run_all.py --serve \
  --notes "My machine; recorded OS and memory configuration; normal idle system"
```

**Measure your machine** loads every suite automatically. Inspect completeness,
full versus quick mode, source/binary hashes, compiler, timing, CPU placement,
raw-trial dispersion and environment telemetry. Missing perf/IBS or sensor data
retain reasons. Environment changes are potential confounds, not diagnoses or
an automatic reason to discard trials. Keep independent runs in separate
`--results` folders.

After choosing an **existing** run, derive an optional public artifact:

```sh
python3 benchmarks/export_public.py \
  results/reference-machine.json data/reference/my-machine.json
python3 benchmarks/register_dataset.py data/reference/my-machine.json \
  --id my-machine --label "My measured machine"
```

Neither command reruns benchmarks, commits or uploads. Export leaves private
results unchanged while sanitizing local POSIX/Windows paths and preserving
measurements, hashes, environment and scope. Review free-form notes: path
sanitization does not remove unrelated personal prose. Registration only writes
an adjacent identity registry from an already sanitized bundle.

Commit the reviewed derived JSON and registry through the normal repository
workflow. `results/reference-machine.json` is a retained compatibility output
name; it does not make that CPU the project’s architectural reference. The old
`ryzen7-3750h.json` export filename retains its specific identity guard but is
loaded only when deliberately listed, just like any other optional dataset.

## Registry contract

`data/reference/index.json` uses this shape (the example identity is a placeholder,
not hardware evidence; the registration command records the real bundle fields):

```json
{
  "schema": "memory-lab-measured-machines-v1",
  "machines": [
    {
      "id": "my-machine",
      "label": "My measured machine",
      "file": "my-machine.json",
      "identity": {
        "cpu_model": "Copy the recorded model from the bundle",
        "architecture": "Copy the recorded architecture",
        "cpu_details": {}
      }
    }
  ]
}
```

The browser supports up to eight entries and verifies complete recorded CPU
details, architecture and model against each bundle. Filenames must be simple
JSON basenames; URLs, traversal and local paths are rejected. Missing/empty
registries are normal. Unavailable or malformed entries retain a reason, and
other usable datasets remain selectable. Models and published evidence remain
usable without local measurements; absent values are never invented.

Selecting a shipped machine changes only the comparison view. Visitor imports
read `File.text()` locally and remain in the current page session, with no
network request, storage persistence, GitHub integration or repository write.
They cannot change this directory, a shipped dataset or another visitor’s view.
Manual per-suite import and the two-run comparison remain available.
