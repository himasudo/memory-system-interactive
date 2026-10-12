# Memory Systems Lab

> An interactive lab that follows one memory access through a computer, from a line of C down to the DRAM chips and back.

Every simulation runs on one small example machine, so each structure fits on screen. Lesson II.01 compares that machine with current AMD EPYC 9005, Intel Xeon 6 and Arm Neoverse V3 designs, and one command runs the same experiments on your own Linux machine (x86-64 or Arm). No single vendor or chip is the reference.

---

## Overview

This project follows one running example:

```c
hist[data[i]]++;
```

and traces it across the system — from source code and µops, through out-of-order execution and address translation, into the cache hierarchy, DRAM, coherence machinery, and device I/O.

The goal is to make low-level memory behavior **visible, stateful, and interactive** rather than explain it only through static diagrams.

---

## Course

The site is a course in seven parts. A page's number comes from its place in the course: `00` is the start page, `III.04` the fourth page of Part III. The routes did not change with the numbers (`#l1d`, `#xlate/walk`), so older links open the same page. The Atlas and the glossary are unnumbered references.

| Part | Pages | Contents |
|---|---|---|
| Start | `00` | The running example, the course map with your progress, how to read the pages, where the numbers come from |
| **I** Foundations | `I.01`–`I.08` | Bits and hex, memory and addresses, instructions and registers, reading x86 assembly, cycles and latency, why caches exist, virtual memory, cores and devices |
| **II** The machine and the core | `II.01`–`II.03` | The whole example machine and how AMD, Intel and Arm build the same parts; C → instructions → µops; the out-of-order core, cycle by cycle |
| **III** Virtual memory | `III.01`–`III.24` | 23 lessons and one lab, listed below |
| **IV** Caches and DRAM | `IV.01`–`IV.04` | The L1d lookup; L2, L3, fabric and the path to DRAM; DRAM banks, commands, refresh and ECC; prefetchers |
| **V** Stores, ordering and coherence | `V.01`–`V.02` | The store path, memory types and fences; MOESI coherence and false sharing |
| **VI** Devices and I/O | `VI.01`–`VI.13` | 12 lessons and one lab, listed below |
| **VII** The whole system | `VII.01`–`VII.02` | One `hist[123]++`, end to end; units, Little's law, queue limits and benchmarks on your machine |
| Reference | `REF`, `A–Z` | **Atlas**: every full-width plate, plus the AMD, Intel and Arm package diagrams. **Glossary**: every term, searchable |

Pages scroll in linkable sections (`#page/section`, for example `#l1d/lookup` or `#vm-walk/walk`). The top bar shows the current section, a section menu and reading progress. Each lesson and lab has **Mark as done**; the sidebar and the start page count the pages done in each part, and the start page links to the next page not done. Progress stays in the browser (`localStorage`).

### Parts III and VI: lessons

Parts III and VI are written as lessons. A lesson is a series of short steps: one or two sentences, then one figure, output, source excerpt or small widget, then one or two sentences. Each term is defined once, in the margin, where it first appears. A lesson ends with **Check yourself** (questions with feedback) and **What to remember**.

The examples come from real Linux machines. Program outputs are quoted from runs on two cloud virtual machines, kept with their scripts in [`labruns/`](labruns/README.md); kernel code is quoted from Linux v6.18. The worked example is x86-64, with notes where Arm, AMD or Intel differ.

The earlier chapters on translation and on devices are now the labs `III.09` and `VI.12`. Their experiments sit inside the lessons they belong to (copy-on-write in `III.17`, the IOMMU mapping lifetime in `VI.08`, interrupt and queue depth in `VI.09`, io_uring in `VI.11`). `III.09` keeps the translation and page-walk steppers; `VI.12` keeps the step-by-step NVMe read.

| # | Part III: Virtual memory | Route |
|---|---|---|
| `III.01` | Two kinds of address | `#vm-addresses` |
| `III.02` | Pages, frames and the page offset | `#vm-pages` |
| `III.03` | A process’s address space | `#vm-space` |
| `III.04` | A tree of tables | `#vm-tree` |
| `III.05` | Four levels of tables, and CR3 | `#vm-levels` |
| `III.06` | The page-table entry, bit by bit | `#vm-pte` |
| `III.07` | The page walk | `#vm-walk` |
| `III.08` | The TLB: a cache of translations | `#vm-tlb` |
| `III.09` | **Lab** · Virtual to physical: TLBs and the page walk | `#xlate` |
| `III.10` | Huge pages | `#vm-huge` |
| `III.11` | Reading the L1 while translating | `#vm-vipt` |
| `III.12` | Switching address spaces: CR3, PCIDs and KPTI | `#vm-switch` |
| `III.13` | TLBs are not coherent: shootdowns | `#vm-shootdown` |
| `III.14` | Page faults: what the CPU reports | `#vm-faults` |
| `III.15` | Demand paging and the zero page | `#vm-demand` |
| `III.16` | File mappings, the page cache and major faults | `#vm-files` |
| `III.17` | fork and copy-on-write | `#vm-cow` |
| `III.18` | Faults on purpose: mprotect, PROT_NONE and MADV_DONTNEED | `#vm-protect` |
| `III.19` | What a page fault costs | `#vm-cost` |
| `III.20` | Where frames come from: the page allocator | `#vm-buddy` |
| `III.21` | When memory runs short: reclaim and the OOM killer | `#vm-reclaim` |
| `III.22` | Two views of one frame | `#vm-alias` |
| `III.23` | Translation inside a virtual machine | `#vm-virt` |
| `III.24` | One store, end to end | `#vm-review` |

| # | Part VI: Devices and I/O | Route |
|---|---|---|
| `VI.01` | How the CPU and devices talk | `#io-paths` |
| `VI.02` | PCI Express | `#io-pcie` |
| `VI.03` | Configuration space and BARs | `#io-config` |
| `VI.04` | MMIO and memory types | `#io-mmio` |
| `VI.05` | Doorbells and descriptor rings | `#io-rings` |
| `VI.06` | DMA and the DMA API | `#io-dma` |
| `VI.07` | DMA and the caches | `#io-coherence` |
| `VI.08` | The IOMMU | `#io-iommu` |
| `VI.09` | Interrupts: INTx, MSI and MSI-X | `#io-irq` |
| `VI.10` | The block layer | `#io-block` |
| `VI.11` | io_uring | `#io-uring` |
| `VI.12` | **Lab** · Devices: MMIO, DMA, the IOMMU and interrupts | `#dev` |
| `VI.13` | One 4 KiB read, end to end | `#io-review` |

---

## Design Goals

- **Hardware-first explanations** instead of generic box diagrams.
- **Interactive state transitions** instead of static prose.
- **One continuous running example** across the course.
- **Real structures** such as RATs, ROBs, TLBs, cache arrays, queues, controllers, and coherence state.
- **Clear labels** on where a statement comes from: simulation, vendor docs, a specification, Linux source, a lab run, a paper, a published measurement, your machine, inference, or not published.
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
├── src/                     course, lesson, chapter, core, glossary and CSS modules
├── labruns/                 programs whose outputs the lessons quote, with those outputs
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

- the course router: parts, page numbers, navigation and progress
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

`memory_end_to_end.html` is generated from a modular source tree (one file per chapter or group of lessons, plus shared core/glossary/CSS modules) concatenated by a small build script. If you have that source tree:

```bash
python3 build.py
```

regenerates `memory_end_to_end.html`. Edit `src/` or `shell.html`, then rebuild; direct changes to the generated file are overwritten.

Shared drawing code and data:

- `src/02_course.js` (`App.Course`, `App.lesson`): the parts, page numbers, navigation, progress and part pages, and the builder lessons are written with (`L.p`, `L.fig`, `L.out`, `L.quote`, `L.note`, `L.try`, `L.lab`, `L.ask` and others). Lessons are `src/40_vm_lessons_a.js`–`46_vm_lessons_g.js` (Part III) and `src/50_io_lessons_a.js`–`53_io_lessons_d.js` (Part VI).
- `src/38_runs.js` (`App.Runs`): every lab-run output a lesson shows, with the file in `labruns/` it was taken from and the machine it ran on. `tests/runs.test.cjs` checks that each quoted line is in that file.
- `src/39_lesson_widgets.js` (`App.LW`): the small interactive widgets inside lessons (address splitter, page-table entry and fault-code decoders, TLB and LRU simulators, buddy allocator, two-dimensional walk counter, PCIe link and BAR sizing calculators, a descriptor ring and others).
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

The browser check serves the generated application locally, visits every page,
exercises original and new controls, checks desktop/mobile layouts and both
themes, and saves screenshots/report data in ignored `test-results/`.
`tests/browser-lessons.cjs` opens every lesson at 1440 px (dark) and 390 px
(light) and checks for horizontal overflow, unresolved lesson links and
overlapping margin notes; it also answers a question and marks a lesson done. Set
`BROWSER_BINARY` to use an existing Chromium executable if needed. The CI
workflow also checks that the generated HTML matches the sources.

For real hardware experiments, start with [the measurement protocol](benchmarks/README.md).
The browser cannot run native CPU/PMU experiments. `run_all.py --serve` loads its
new bundle automatically into memory, sharing, loaded-latency, VM and prefetch
sections. Bundle imports and individual JSON fallbacks stay local and never
silently recalibrate the simulations.

---

### Page numbers and cross-references

Never write a page number by hand: numbers come from each page's part and build order, so inserting a page renumbers the rest. In page text use tokens, which become links when rendered:

- `[[ch:vm-walk]]` → "Lesson III.07" (a link). A lab renders as "Lab III.09", a part page (`[[ch:part-vmem]]`) as "Part III".
- `[[chs:stores,coh]]` → "Lessons V.01 and V.02"
- `[[chr:hier,dram]]` → "Lessons IV.02–IV.03"
- `[[num:l1d]]` → "IV.01" (plain number)

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

That lets each page build on the same machine state instead of starting over, and lets the end-to-end page (`VII.01`) reassemble every earlier page's cost into one timeline for a single instruction.

---

## Status

The original hardware walkthrough keeps its pages and routes, arranged as a course. On top of it:

- **Parts III and VI** are short lessons built on outputs from real Linux machines, with the earlier experiments placed inside them.
- Most hardware pages end with an **Experiments** part: small simulations with a prediction to make first (caches, forwarding, SMT, coherence, the DRAM controller, page tables and TLBs, prefetching, I/O queues, NUMA, ECC, refresh and more).
- Lesson II.01 has a **Real chips** part comparing the example machine with AMD EPYC 9005, Intel Xeon 6 and Arm Neoverse V3, with sources.
- **Measure your machine** runs native benchmarks with one command and shows the results next to each simulation.

Every simulation uses round example numbers (four cores, 32 KiB L1d, 512 KiB L2, 4 MiB L3, two DDR4 channels). The assembly and page tables use x86-64; the DRAM chip example uses DDR4, with notes on DDR5. Measurements never change the simulations' settings.

Ten labels say where a statement comes from: **Simulation**, **Vendor docs**, **Specification**, **Linux source**, **Lab run**, **Peer-reviewed**, **Published measurement**, **Your machine**, **Inference** and **Not published**. The Start page explains each one. Background: [AUDIT.md](AUDIT.md) (the original roadmap), [the implementation notes](docs/IMPLEMENTATION.md) and [the evidence notes](docs/IMPLEMENTATION_EVIDENCE.md).

---

## License

MIT. See [LICENSE](LICENSE).
