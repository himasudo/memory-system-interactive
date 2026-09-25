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

| Route | Chapter | Focus |
|---|---|---|
| `00` | **The Machine** | Whole-system map: cores, caches, fabric, memory controllers, DRAM, I/O, devices |
| `01` | **C → Instructions → µops** | Source, assembly, instruction bytes, decode fields |
| `02` | **Inside the Core** | OoO execution, register renaming, scheduling, ROB, LSU, forwarding, misprediction |
| `03` | **Virtual → Physical** | TLBs, page walks, page faults, large pages, PCIDs |
| `04` | **L1d Lookup** | Sets, ways, tags, data arrays, comparators, pLRU, dirty writeback, conflict misses |
| `05` | **Down the Hierarchy** | L2, L3, fabric, peer-core lookup, memory controller, DRAM path, MLP |
| `06` | **DRAM** | Address-to-bank/row/column mapping, row buffer, ACT/RD/PRE/REF, timing parameters, refresh |
| `07` | **Stores & Memory Types** | Store queue, senior stores, ownership requests, RFO vs. non-temporal stores, memory types, fences |
| `08` | **Coherence (MOESI)** | Per-core cache states, probes, invalidations, cache-to-cache transfer, false sharing |
| `09` | **Prefetchers** | Stream/stride detection, prefetch distance, coverage vs. lateness vs. pollution |
| `10` | **Devices, DMA, IOMMU** | MMIO doorbells, PCIe TLPs, IOMMU translation, coherent DMA, MSI-X interrupts |
| `11` | **End to End** | One instruction's full critical path, reassembled across every earlier chapter |
| `12` | **Glossary** | Every term used across the site, searchable |

All 13 chapters are built and live in the integrated application.

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

**Feature-complete for the planned 13-chapter arc (00–12).** Numeric defaults (cache and DRAM latencies) are published figures for a Zen/Zen+-class CPU, clearly marked as such, and are meant to be overwritten with values measured on whatever machine the reader is using — the settings panel makes this the normal way to use the site rather than an edge case.

Open follow-ups: broader validation across CPU vendors/generations, and extending the address-mapping and DRAM-timing examples beyond the single illustrative configuration currently shown.

---

## License

MIT. See [LICENSE](LICENSE).