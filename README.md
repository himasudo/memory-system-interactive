# Memory System — Interactive Visualizations

> A hardware-level interactive visualizer for tracing a memory access through the CPU and memory hierarchy.

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
| `09` | **The Machine** | Whole-system map: cores, caches, fabric, memory controllers, DRAM, I/O, devices |
| `10` | **C → Instructions → µops** | Source, assembly, instruction bytes, decode fields |
| `11` | **Inside the Core** | OoO execution, register renaming, scheduling, ROB, LSU, forwarding, misprediction |
| `12` | **Virtual → Physical** | TLBs, page walks, page faults, large pages, PCIDs |
| `13` | **L1d Lookup** | Sets, ways, tags, data arrays, comparators, pLRU, dirty writeback, conflict misses |
| `14` | **Down the Hierarchy** | L2, L3, fabric, peer-core lookup, memory controller, DRAM path, MLP |
| `15` | **DRAM** | Address-to-bank/row/column mapping, row buffer, ACT/RD/PRE/REF, timing parameters, refresh |
| `16` | **Stores & Memory Types** | Store queue, senior stores, ownership requests, RFO vs. non-temporal stores, memory types |
| `17` | **Coherence (MOESI)** | Per-core cache states, probes, invalidations, cache-to-cache transfer, false sharing |
| `18` | **Prefetchers** | Stream/stride detection, prefetch distance, coverage vs. lateness vs. pollution |
| `19` | **Devices, DMA, IOMMU** | MMIO doorbells, PCIe TLPs, IOMMU translation, coherent DMA, MSI-X interrupts |
| `20` | **End to End** | Single-access walkthrough, dependency graph, and finite-resource steady-state experiment |
| `21` | **Measure & explain** | Evidence, units, Little's law, MLP/queue saturation, observability and native Linux measurements |
| ref | **Atlas** | Every full-width plate on one page: DRAM chip, L1d arrays, page walk, Zen+ core, end-to-end timeline |
| `A–Z` | **Glossary** | Every term used across the site, searchable (unnumbered reference) |

Chapters use long-scroll, linkable sections (`#chapter/section`, for example `#l1d/lookup`). The top bar shows the current section, section menu and reading progress. End to End has three selectable modes, also directly linkable as `#e2e/scenario`, `#e2e/critical` and `#e2e/steady`. Hardware chapters retain their overview figures and detailed SVG plates with view tabs.

---

## Design Goals

- **Hardware-first explanations** instead of generic box diagrams.
- **Interactive state transitions** instead of static prose.
- **One continuous running example** across chapters.
- **Real structures** such as RATs, ROBs, TLBs, cache arrays, queues, controllers, and coherence state.
- **Clear separation** between measured values, published values, and simplified models.
- **Explicit uncertainty** where hardware behavior is undocumented.
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

Run a simple local server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Using a local HTTP server is preferable to opening the page directly through `file://`.

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
The browser cannot run native CPU/PMU experiments. Import runner JSON in
`#perf/measure`; imports remain local and do not silently recalibrate the model.

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

The original hardware path is preserved. [AUDIT.md](AUDIT.md) is the accepted
roadmap; [the implementation ledger](docs/IMPLEMENTATION.md) maps it to the code
and records phase boundaries. Phase 1 adds performance foundations and a
measurement workflow. Phases 2–6 remain planned work.

Zen+ on the Ryzen 7 3750H remains the concrete reference. Addresses are synthetic;
latency defaults are representative unloaded inputs from external measurements
and estimates, not vendor guarantees or this machine's calibration. New models
label teaching assumptions explicitly. Native harness checks on development
hardware do not validate any 3750H latency or undocumented microarchitecture.

---

## License

MIT. See [LICENSE](LICENSE).
