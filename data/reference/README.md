# Curated reference measurements

The site reads `data/reference/ryzen7-3750h.json` automatically when present.
There is intentionally no measured JSON here until a real target-machine run is
available. Development-host checks and synthetic test fixtures are not reference
measurements.

On the actual Ryzen 7 3750H Linux machine:

```sh
python3 benchmarks/run_all.py --serve \
  --notes "Ryzen 7 3750H reference run; Ubuntu 24.04; normal idle system"
```

Inspect `results/reference-machine.json`: all suites should be complete, full
runs (`context.quick: false`), source/compiler/timing/placement provenance should
be intact, and CPU identification should be AMD Ryzen 7 3750H, AuthenticAMD,
family 23, model 24. Keep optional-evidence skip reasons; do not fill them with
assumed PMCs or counts. Record unknown configuration honestly.

Inspect the environment snapshots and potential-confound warnings in **Results**:
the before/after full-run and per-suite readings preserve power/profile, governor,
boost, per-CPU reported frequencies and named temperatures where available.
Suite elapsed time is separate from native trial timers. Material observed state
changes can qualify interpretation (especially loaded latency) but are not a
causal diagnosis, proof of throttling, or an automatic reason to discard trials.
Retain independent runs with distinct `--results` folders when comparing them.

After choosing an appropriate **existing** run, export a sanitized public copy:

```sh
python3 benchmarks/export_public.py \
  results/reference-machine.json data/reference/ryzen7-3750h.json
```

The exporter never reruns benchmarks or mutates the private bundle/raw files.
Measurements, hashes, source/compiler/timing/placement provenance and environment
observations remain intact. Local absolute paths become logical paths; Windows
drive/UNC paths and paths embedded in diagnostics/notes are sanitized. Only the
pathname portion of a VM smaps header changes; all mapping/trial values remain.
Export provenance explains that raw-file hashes still describe original private
file bytes. Older bundles remain exportable with telemetry explicitly unrecorded.

Commit the derived curated file through the normal repository workflow. Export
and visitor import do not commit or upload it. Path sanitization does not remove
unrelated personal prose from free-form notes; inspect that content when curating.

The loader validates provenance and refuses another CPU's bundle as this named
reference. Absent, malformed or incompatible files leave reference measurements
unavailable while the simulations, visitor import and individual imports remain
usable. Visitor files are read locally in their browser, kept only in the page
session and never modify this directory or the public dataset.
