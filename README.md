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

## Current Chapters

| Route | Chapter | Focus |
|---|---|---|
| `00` | **The Machine** | Whole-system map: cores, caches, fabric, memory controllers, DRAM, I/O, devices |
| `01` | **C → Instructions → µops** | Source, assembly, instruction bytes, decode fields |
| `02` | **Inside the Core** | OoO execution, register renaming, scheduling, ROB, LSU, forwarding, misprediction |
| `03` | **Virtual → Physical** | TLBs, page walks, page faults, large pages, PCIDs |
| `04` | **L1d Lookup** | Sets, ways, tags, data arrays, comparators, pLRU, dirty writeback, conflict misses |
| `05` | **Down the Hierarchy** | L2, L3, fabric, peer-core lookup, memory controller, DRAM path, MLP |

---

## Planned Chapters

```text
06  DRAM internals
07  Store path + memory types
08  Cache coherence / MOESI
09  Hardware prefetchers
10  Devices, MMIO, DMA, IOMMU, MSI-X
11  One memory access, end to end
12  Searchable glossary
```

---

## Design Goals

- **Hardware-first explanations** instead of generic box diagrams.
- **Interactive state transitions** instead of static prose.
- **One continuous running example** across chapters.
- **Real structures** such as RATs, ROBs, TLBs, cache arrays, queues, controllers, and coherence state.
- **Clear separation** between measured values, published values, and simplified models.
- **Explicit uncertainty** where hardware behavior is undocumented.
- **Responsive visualizations** with light and dark theme support.
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

The main application and source of truth.

It contains:

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

## Current Status

**In active development.**

Routes `00–05` are present in the integrated application. Existing chapters are being audited and refined while the remaining memory-system chapters are added.

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
```

That lets each chapter build on the same machine state instead of starting over.

---

## License

MIT. See [LICENSE](LICENSE).
