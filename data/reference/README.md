# Curated reference measurements

The site reads `data/reference/ryzen7-3750h.json` automatically when present.
There is intentionally no measured JSON here until a real target-machine run is
available. Development-host checks and synthetic test fixtures are not reference
measurements.

On the actual Ryzen 7 3750H Linux machine:

```sh
python3 benchmarks/run_all.py --notes 'DIMM/channel configuration, BIOS, thermals and background load'
python3 benchmarks/run_all.py --serve  # optional new run with automatic inspection
```

Inspect `results/reference-machine.json`: all suites should be complete, full
runs (`context.quick: false`), source/compiler/timing/placement provenance should
be intact, and CPU identification should be AMD Ryzen 7 3750H, AuthenticAMD,
family 23, model 24. Keep optional-evidence skip reasons; do not fill them with
assumed PMCs or counts. Record unknown configuration honestly.

After reviewing an appropriate run, copy **that actual bundle** to this path:

```sh
cp results/reference-machine.json data/reference/ryzen7-3750h.json
```

Commit the curated file through the normal repository workflow. The runner and
visitor importer never do this automatically. Consider the recorded compiler
paths, notes and platform metadata before intentionally publishing them.

The loader validates provenance and refuses another CPU's bundle as this named
reference. Absent, malformed or incompatible files leave reference measurements
unavailable while the simulations, visitor import and individual imports remain
usable. Visitor files are read locally in their browser, kept only in the page
session and never modify this directory or the public dataset.
