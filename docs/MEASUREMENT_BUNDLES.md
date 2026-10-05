# Portable native bundle contract

`python3 benchmarks/run_all.py` produces `memory-lab-bundle-v1` as
`results/reference-machine.json`. This filename is a local output name, not a
claim that the host is a Ryzen. Individual runner formats remain unchanged.

| Field | Meaning |
|---|---|
| `schema`, `created_utc`, `complete` | Version, UTC collection start, and whether all selected native suites completed |
| `machine` | Recorded CPU model/identity, architecture, kernel, Linux topology/affinity, page/governor/THP/BIOS metadata and unmeasured controls |
| `machine.is_ryzen_7_3750h` | Derived from AMD model name, vendor, family 23 and model 24; rechecked by the browser |
| `selection` | Single CPU, confirmed physical cores, reciprocal SMT siblings, placement topology and explicit fallback reasons |
| `provenance` | Orchestrator/workflow hashes, invocation, Python version, memory budget, quick-mode request and statistic definitions |
| `capabilities` | Availability/reason records for compiler, perf, IBS, collection/skip policies and optional raw perf evidence |
| `suites` | All five slots: `memory`, `sharing`, `loaded`, `vm`, `prefetch`, including unsupported slots |
| `suites[name].status` | `measured`, `partial`, `failed` or `skipped`; every non-measured status requires a reason |
| `suites[name].runs` | Original native results with distinct placement identities; no synthetic samples for skips |
| `run.result` | Unmodified individual-runner document: schema, context, completion and every raw trial |
| `run.placement`, `invocation` | CPUs/core relationship, exact command, timestamps, exit status, stdout/stderr and effective quick mode |
| `run.raw_file`, `raw_sha256`, `runner_sha256` | Raw file relative to `results/raw`, its hash, and the Python runner's hash |
| `suites[name].summaries` | Run identity, parameters, metric, contributing raw-trial indices, count, mean, median, population SD, MAD, range and nearest-rank p95 |

Native context retains compiler version/command/flags, C source and binary hashes,
CPU affinity, case order/seed, notes and timer/work/placement boundaries. Checksum
strings stay strings. Native validation and browser validators verify work,
content and affinity accounting where the corresponding harness supports them.
The complete raw result is preserved even when a normalized field is added.

The median averages the middle two values for an even sample count; MAD is the
median absolute deviation around that median. These statistics describe repeated
whole-trial ns/op, ns/load, ns/update or whole-VM-stage ns. A p95 across three/nine
trial averages is not an individual-access tail estimate. The browser derives
comparison statistics from raw trials rather than trusting supplied summaries.

## Loading and provenance gates

The browser checks the bundle version, required suite slots, completion/status
agreement, CPU/kernel/architecture equality between aggregate and runs, compiler
and hashes, native schemas/verification, allowed affinity and topology-backed
placement labels. Missing provenance, malformed data, invalid counts or a
contradictory target claim reject the import before replacing existing data.
Valid partial bundles expose available runs and explicit unavailable-suite reasons.

Public reference reads use a fixed relative GET for
`data/reference/ryzen7-3750h.json`; they also require the derived target identity.
A missing file is a normal unavailable state. Local `--serve` adds a fixed GET
endpoint `/__memory_lab__/bundle.json`, read only on a loopback origin with
`?local=1`. It serves the newly generated output even outside the repository root.
Neither route accepts an arbitrary visitor-provided URL or writes files.

Visitor import only calls `File.text()`, `JSON.parse` and local validation/state
updates. No fetch/XHR, upload, GitHub call, localStorage or sessionStorage stores
visitor data. Reload/clear removes it. Existing theme/navigation persistence is
independent. Reference and visitor bundles remain distinct, and no imported
measurement changes simulation defaults or the documented architecture profile.

## Comparisons and optional PMU scope

Automatic comparisons join exact work/seed, source hash, compiler flags, native
timing/unit boundaries, quick/full mode and physical/SMT/single relationships.
Placement matching allows different logical CPU numbers but checks package/NUMA
relationships; VM comparisons also check recorded page-mapping outcomes.
Unmatched cases produce no ratio. Compiler versions, actual frequency, memory
configuration and background activity remain visible confounds. Ratios are
descriptive comparisons, not architecture attribution or inferred queue sizes.

Perf evidence contains exact event symbols, commands, return status, raw outputs,
counter runtime/running percentage, semantics and workload-lifetime scope.
Separate process counts cannot explain a timed-kernel result directly. No
cross-execution IPC, MPKI, cache-level or DRAM-byte statistic is derived. IBS PMU
detection and validated IBS evidence are separate states; unvalidated sampling
and model-specific event semantics remain explicitly skipped.

The bundled loader tests use synthetic identity fixtures only inside test
contexts. No fixture or development-host result is shipped as Ryzen measurements.
