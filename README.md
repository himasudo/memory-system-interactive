# Memory Systems Lab

> An interactive lab that follows one memory access through a computer, from a line of C down to the DRAM chips and back.

Every simulation runs on one small example machine, so each structure fits on screen. Chapter 09 compares that machine with current AMD EPYC 9005, Intel Xeon 6 and Arm Neoverse V3 designs, and one command runs the same experiments on your own Linux machine (x86-64 or Arm). No single vendor or chip is the reference.

---

## Overview

This project follows one running example:

```c
hist[data[i]]++;
```

and traces it across the system — from source code and µops, through out-of-order execution and address translation, into the cache hierarchy, DRAM, coherence machinery, and device I/O.

The goal is to make low-level memory behavior **visible, stateful, and interactive** rather than explain it only through static diagrams.

---

## Chapters

Chapters are numbered from their order in the build: `00` Start here, `01`–`08` Foundations, `09`–`20` the hardware path, and `21` the performance lab. Existing chapter numbers and routes are preserved. The Atlas and glossary are unnumbered references.

| # | Chapter | Focus |
|---|---|---|
| `00` | **Start here** | The running example, two ways in, how to read the pages, where the numbers come from |
| `01` | **Bits, bytes and hex** | Binary, hexadecimal, powers of two, reading bit ranges such as bits 11:6 |
| `02` | **Memory and addresses** | Addresses, pointers and arrays, little-endian byte order, alignment and cache lines |
| `03` | **Instructions and registers** | The ISA, the 16 general-purpose registers, loads and stores, machine code bytes |
| `04` | **Reading x86 assembly** | AT&T syntax, memory operands, flags and conditional jumps, the example line by line |
| `05` | **Cycles and latency** | Clock cycles, latency vs throughput, dependency chains, the memory latency ladder |
| `06` | **Why caches exist** | DRAM vs SRAM, temporal and spatial locality, cache lines, hits and misses, levels |
| `07` | **Virtual memory** | Processes, pages, 4-level page tables, the TLB and page faults |
| `08` | **Cores, sharing and devices** | Private caches, coherence, store visibility, MMIO, DMA and interrupts |
| `09` | **The Machine** | Whole-system map of the example machine, then how AMD, Intel and Arm build the same parts |
| `10` | **C → Instructions → µops** | Source, assembly, decode fields, instruction-fetch footprint and starvation |
| `11` | **Inside the Core** | OoO execution, register renaming, scheduling, ROB, LSU, forwarding, misprediction |
| `12` | **Virtual → Physical** | TLBs, page walks, page faults, large pages, PCIDs |
| `13` | **L1d Lookup** | Sets, ways, tags, data arrays, comparators, pLRU, dirty writeback, conflict misses |
| `14` | **Down the Hierarchy** | L2, L3, fabric, peer-core lookup, memory controller, DRAM path, MLP |
| `15` | **DRAM** | Banks, commands, controller scheduling, refresh tails, ECC and architectural disturbance |
| `16` | **Stores & Memory Types** | Store queue, senior stores, ownership requests, RFO vs. non-temporal stores, memory types |
| `17` | **Coherence (MOESI)** | Per-core cache states, probes, invalidations, cache-to-cache transfer, false sharing |
| `18` | **Prefetchers** | Stream/stride detection, finite shared resources, accuracy/coverage/timeliness and native software hints |
| `19` | **Devices, DMA, IOMMU** | MMIO, PCIe, IOTLB/mapping lifetime, DMA, completion queues, interrupts/polling and io_uring layers |
| `20` | **End to End** | Single-access walkthrough, dependency graph, and finite-resource steady-state experiment |
| `21` | **Measure & explain** | Units, Little's law, overlap and queue limits, and running the benchmarks on your machine |
| ref | **Atlas** | Every full-width plate on one page, plus the AMD, Intel and Arm package diagrams |
| `A–Z` | **Glossary** | Every term used across the site, searchable (unnumbered reference) |

Chapters use long-scroll, linkable sections (`#chapter/section`, for example `#l1d/lookup`). The top bar shows the current section, section menu and reading progress. End to End has three selectable modes, also directly linkable as `#e2e/scenario`, `#e2e/critical` and `#e2e/steady`. Hardware chapters retain their overview figures and detailed SVG plates with view tabs.

---

## Design Goals

- **Hardware-first explanations** instead of generic box diagrams.
- **Interactive state transitions** instead of static prose.
- **One continuous running example** across chapters.
- **Real structures** such as RATs, ROBs, TLBs, cache arrays, queues, controllers, and coherence state.
- **Clear labels** on where a statement comes from: simulation, vendor docs, a paper, a published measurement, your machine, inference, or not published.
- **Say so when vendors don't publish** a size or policy, instead of guessing.
- **Responsive visualizations** with light and dark theme support, down to mobile widths.
- **No runtime framework dependency** — plain HTML, CSS, SVG, and JavaScript. Node/Playwright is used only for development checks.
- **No manual zoom on 2D diagrams** — switch views with focus tabs. This checkout contains the SVG plates, not the optional 3D code referenced by older documentation.

---

## Run It

### GitHub Pages

The repository root uses `index.html` to redirect to:

```text
memory_end_to_end.html
```

Once GitHub Pages is enabled, opening the repository's Pages URL will launch the visualizer directly.

---

### Local

Clone the repository:

```bash
git clone <repository-url>
cd <repository-directory>
```

Measure the local Linux machine with one command:

```bash
python3 benchmarks/run_all.py
```

To measure, open the local lab and load every suite automatically:

```bash
python3 benchmarks/run_all.py --serve
```

Requires Python 3 and a GCC-compatible C compiler. The runner selects permitted
physical cores and SMT siblings from Linux topology, preserves raw suite files in
`results/raw/`, and writes `results/reference-machine.json`. Optional perf evidence
is collected only when usable; permissions and unsupported capabilities have
recorded skip reasons. The local server prints its URL and opens a browser; use
`--no-browser` for a headless session and Ctrl+C to stop it. `--quick` checks the
harness rather than characterizing the machine.

Runs also record read-only power/profile, governor/boost, per-CPU frequency and
named thermal readings before/after the run and every suite. **Results** exposes
suite durations, unavailable readings and descriptive potential-confound warnings.
Environment changes do not discard trials or diagnose their cause.

To characterize your machine, measure and inspect first:

```bash
python3 benchmarks/run_all.py --serve \
  --notes "My machine; recorded OS and memory configuration; normal idle system"
```

After selecting that existing run, export a separate public copy:

```bash
python3 benchmarks/export_public.py \
  results/reference-machine.json data/reference/my-machine.json
```

Export does not rerun benchmarks or modify private results. It replaces local
absolute paths with logical paths while preserving measurements and hashes.
Optionally register the selected sanitized dataset, then review/commit the derived files through the normal repository workflow:

```bash
python3 benchmarks/register_dataset.py data/reference/my-machine.json \
  --id my-machine --label "My measured machine"
```

Registration records the bundle’s CPU identity in `data/reference/index.json`; it does not measure, commit or upload anything. No optional dataset is required to use the lab.

For browsing without running experiments, `python3 -m http.server 8000` remains
available. Opening through HTTP is preferable to `file://`.

### Shipped results and comparing your machine

If `data/reference/index.json` lists result bundles, the site loads them as
**shipped machines** you can pick from. Each keeps the CPU identity it was
recorded with. No shipped results is a normal state; every simulation works
without them. See [dataset curation](data/reference/README.md).

**Measure your machine** (`#perf/datasets`) loads your own bundle and pairs the
cases that ran with the same settings on the shipped machine. The file is read in
the browser only: nothing is uploaded, and reloading the page clears it.

---

## Repository Layout

```text
.
├── index.html
├── memory_end_to_end.html   built by build.py from shell.html + src/
├── build.py
├── shell.html
├── src/                     chapter, core, glossary and CSS modules
├── benchmarks/              native C experiments, Python runner and protocol
├── data/reference/          optional sanitized datasets and identity registry
├── tests/                   pure-model, native-harness and rendered-browser checks
├── docs/IMPLEMENTATION.md   roadmap mapping, dependencies and phase ledger
├── AUDIT.md                 agreed technical roadmap (unaltered)
├── tools/                   check_links.py
└── README.md
```

### `memory_end_to_end.html`

The main application. A single self-contained file (no build step required to run it) containing:

- the chapter router
- shared glossary
- latency configuration
- running example and address map
- interactive diagrams
- simulators and state-transition logic

### `index.html`

Small GitHub Pages entry point that redirects to the main visualizer.

### `README.md`

Project overview and usage instructions.

---

## Editing the Source

`memory_end_to_end.html` is generated from a modular source tree (one file per chapter, plus shared core/glossary/CSS modules) concatenated by a small build script. If you have that source tree:

```bash
python3 build.py
```

regenerates `memory_end_to_end.html`. Edit `src/` or `shell.html`, then rebuild; direct changes to the generated file are overwritten.

Shared drawing code and data:

- `src/04_shared_hw.js` (`App.HW`): parts drawn in several chapters (core blocks, set-associative arrays, L3 slices, shadow-tag grids, DRAM ranks, cache-line words, device pipelines, the latency ladder). Each draws inside an existing box; a cell with class `box` lights up with its parent group.
- `src/04_shared_plates.js` (`App.Plates`): the five full-width plates, plus data the chapters share with them: `App.DDR4`, `App.DRAMREQ`, `App.WALK`, `App.E2E.steps(options)`. Any `.scroller` that sets `_views` gets the standard view tabs.
- `src/09_performance_model.js` (`LabModel`): pure finite-queue simulation and dependency DAG, shared by the performance lab and End to End. All capacities and policies are teaching assumptions.
- `src/21_ch11a_performance.js`: learning flow, prediction controls, observability, measurement import and Linux-tool mapping.
- `src/12_advanced_models.js` / `29_advanced_lab.js`: instruction delivery, shared prefetch resources, DMA translation lifetime, I/O completion queues, remote links and exact teaching ECC arithmetic. Refresh-tail comparisons reuse `ControllerLab`.

### Validate changes

```sh
npm ci
npm test
python3 build.py
npx playwright install chromium
npm run test:browser
```

The browser check serves the generated application locally, visits all chapters,
exercises original and new controls, checks desktop/mobile layouts and both
themes, and saves screenshots/report data in ignored `test-results/`. Set
`BROWSER_BINARY` to use an existing Chromium executable if needed. The CI
workflow also checks that the generated HTML matches the sources.

For real hardware experiments, start with [the measurement protocol](benchmarks/README.md).
The browser cannot run native CPU/PMU experiments. `run_all.py --serve` loads its
new bundle automatically into memory, sharing, loaded-latency, VM and prefetch
sections. Bundle imports and individual JSON fallbacks stay local and never
silently recalibrate the simulations.

---

### Chapter numbers and cross-references

Never write a chapter number by hand: numbers come from build order, so inserting a chapter renumbers everything automatically. In chapter text use tokens, which become links when rendered:

- `[[ch:l1d]]` → "Chapter 13" (a link)
- `[[chs:stores,coh]]` → "Chapters 16 and 17"
- `[[chr:hier,dram]]` → "Chapters 14–15"
- `[[num:l1d]]` → "13" (plain number)

Overview figures: `src/23_section_figs.js` registers one per section with `add(chapter, section, {h, cap, draw, live})`; Foundations chapters lay out text and figures with the `App.P` helpers in `src/04_found_a.js`.

Glossary terms: `g(key, label)` marks a term explicitly. Register names, hex values and acronyms in prose, and mnemonics inside `<code>`, are linked automatically (first occurrence per paragraph; never in headings, captions, or tables without the `autolink` class).

## Core Idea

The project is built around continuity.

Instead of teaching each topic with an unrelated example, the same operation:

```c
hist[data[i]]++;
```

is followed through progressively deeper layers:

```text
C source
   ↓
machine instructions
   ↓
µops
   ↓
rename / schedule / execute
   ↓
AGU + load/store machinery
   ↓
virtual address
   ↓
TLB / page walk
   ↓
L1d
   ↓
L2
   ↓
L3
   ↓
fabric
   ↓
memory controller
   ↓
DRAM
   ↓
refill / store / coherence
   ↓
device DMA (NVMe, as a worked example)
```

That lets each chapter build on the same machine state instead of starting over, and lets the end-to-end chapter reassemble every earlier chapter's cost into one timeline for a single instruction.

---

## Status

The original hardware walkthrough is unchanged in structure. On top of it:

- Most hardware chapters end with an **Experiments** part: small simulations with a prediction to make first (caches, forwarding, SMT, coherence, the DRAM controller, page tables and TLBs, prefetching, I/O queues, NUMA, ECC, refresh and more).
- Chapter 09 has a **Real chips** part comparing the example machine with AMD EPYC 9005, Intel Xeon 6 and Arm Neoverse V3, with sources.
- **Measure your machine** runs native benchmarks with one command and shows the results next to each simulation.

Every simulation uses round example numbers (four cores, 32 KiB L1d, 512 KiB L2, 4 MiB L3, two DDR4 channels). The assembly and page tables use x86-64; the DRAM chip example uses DDR4, with notes on DDR5. Measurements never change the simulations' settings.

Seven labels say where a statement comes from: **Simulation**, **Vendor docs**, **Peer-reviewed**, **Published measurement**, **Your machine**, **Inference** and **Not published**. The Start page explains each one. Background: [AUDIT.md](AUDIT.md) (the original roadmap), [the implementation notes](docs/IMPLEMENTATION.md) and [the evidence notes](docs/IMPLEMENTATION_EVIDENCE.md).

---

## License

MIT. See [LICENSE](LICENSE).
