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

Chapters are numbered from their order in the build: `00` Start here, `01`–`08` Foundations (the background a software developer needs), `09`–`20` the hardware path. The glossary is an unnumbered reference.

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
| `20` | **End to End** | One instruction's full critical path, reassembled across every earlier chapter |
| `A–Z` | **Glossary** | Every term used across the site, searchable (unnumbered reference) |

Every chapter is one long page. Sections are numbered, always visible, and linkable as `#chapter/section` (for example `#l1d/lookup`); the top bar shows the current section, a section menu and reading progress. Sections of the hardware chapters open with a small overview figure before their interactive part.

---

## Design Goals

- **Hardware-first explanations** instead of generic box diagrams.
- **Interactive state transitions** instead of static prose.
- **One continuous running example** across chapters.
- **Real structures** such as RATs, ROBs, TLBs, cache arrays, queues, controllers, and coherence state.
- **Clear separation** between measured values, published values, and simplified models.
- **Explicit uncertainty** where hardware behavior is undocumented.
- **Responsive visualizations** with light and dark theme support, down to mobile widths.
- **No framework dependency** — the application is plain HTML, CSS, SVG, and JavaScript.

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
├── memory_end_to_end.html
└── README.md
```

### `memory_end_to_end.html`

The main application and source of truth. A single self-contained file (no build step required to run it) containing:

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

regenerates `memory_end_to_end.html` from the individual chapter files. Editing the shipped HTML directly also works fine for small fixes; the modular source is only useful for larger changes across chapters.

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

**Feature-complete for the 21-chapter arc: Start here, eight Foundations chapters, the twelve hardware chapters, and the glossary.** Numeric defaults (cache and DRAM latencies) are published figures for a Zen/Zen+-class CPU, clearly marked as such, and are meant to be overwritten with values measured on whatever machine the reader is using — the settings panel makes this the normal way to use the site rather than an edge case.

Open follow-ups: broader validation across CPU vendors/generations, and extending the address-mapping and DRAM-timing examples beyond the single illustrative configuration currently shown.

---

## License

MIT. See [LICENSE](LICENSE).