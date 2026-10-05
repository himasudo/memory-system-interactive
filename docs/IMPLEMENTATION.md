# Audit implementation ledger

`AUDIT.md` is the supplied, agreed roadmap, copied without editing. This is an
implementation map, not a new audit. Baseline: `da35edc`.

## Architecture and preservation boundaries

`build.py` sorts and concatenates `src/*.js` and `src/*.css` into `shell.html`.
`memory_end_to_end.html` is the checked-in, standalone application. `index.html`
redirects to it. There is no framework or runtime dependency.

`00_core.js` owns lazy chapter construction, hash/section routing, theme/config,
glossary popovers, steppers, focus cameras and chapter navigation. Glossary and
source registries live in `01`–`03`; foundations and SVG helpers in `04`.
`10_pipesim.js` is a pure instruction-level engine consumed by `11_pipeline.js`.
Other chapters own their state machines. `04_shared_plates.js` shares the DRAM,
page-walk and end-to-end data with the detailed plates. `23_section_figs.js`
adds overview figures. The later CSS layers deliberately preserve the current
dark hardware-lab visual language.

All source files, the shell, documentation and tooling were read. Rebuilding
the baseline produces byte-identical checked-in HTML, so that generated file
does not represent an additional implementation. README references to a 3D
build are stale: those files do not exist in this checkout.

## Roadmap to implementation map

| Phase / audit items | Existing home | Dependencies / implementation order |
| --- | --- | --- |
| 1: measurement, vocabulary, latency/throughput/bandwidth/MLP | `04_found_b` time; `15_ch05_hier`; new performance lab and `benchmarks/` | Define units, evidence and measurement boundaries first. |
| 1: finite queues, saturation, observability | `10_pipesim`, `11_pipeline`; new pure `09_performance_model` | A separate stream experiment shares one state for occupancy, stalls, timing and traffic; retain the instruction simulator. |
| 1: critical path and steady state | `04_shared_plates`, `21_ch11_e2e` | DAG after timing contract; steady state reuses the tested queue model. |
| 2: 3C/reuse distance, ports/banks, split accesses (1–5, 9) | `14_ch04_l1d`, `15_ch05_hier` | Extend access/cache state before adding bandwidth and dirty-eviction contention. |
| 2: MSHRs, forwarding, aliasing, SMT (6–8, 11–12) | `10_pipesim`, `11_pipeline`, `17_ch07_stores` | Use finite-resource accounting from Phase 1; forwarding and replay before SMT interference. |
| 2: retirement/visibility, RFO, atomics, false sharing, locks, transient states, HITM (13–19) | `17_ch07_stores`, `18_ch08_coherence` | Ownership transactions before atomics/locks; traffic accounting before comparative experiments. |
| 2/5: ordering layers and litmus tests (20–21) | `17_ch07_stores`, `04_found_b` sharing | Separate language/compiler/ISA/implementation/measurement; vendor contrasts in Phase 5. |
| 3: controller, FCFS/FR-FCFS, R/W queues, write drain, turnaround, bank/rank/channel parallelism, timings, distributions (22–26) | `16_ch06_dram`, `04_shared_plates` | Start from Phase 1 queues; preserve existing command-level walkthrough. Scheduling precedes write drain and refresh tails. |
| 4: mmap, demand-zero, COW, page cache, huge pages (28–31, 33–34) | `04_found_b` VM, `13_ch03_translate` | Separate mappings/PTEs/backing/physical frames before fault experiments. Five-level paging is a comparison, not a Zen+ feature. |
| 4: reclaim, page walks, shootdowns, NUMA (32, 35–37) | `13_ch03_translate`, hierarchy and coherence | Walks reuse hierarchy contention; shootdowns need multiple cores and invalidation acknowledgment. |
| 5: Zen+ anchor, selective Intel/ARM lenses, fidelity (45–47) | sources, map, config; relevant chapter callouts | Full architecture comparison waits for generic mechanisms. Evidence labels accompany Phase 1 additions immediately, as required by the task. |
| 6: instruction side, prefetch resources/accuracy/coverage/timeliness (10, 38–40) | code, core, `19_ch09_prefetch` | Share finite queues/cache pollution; correct absolute wording now. |
| 6: IOTLB, pinning/scatter-gather, polling, NVMe/io_uring (41–44) | `20_ch10_devices` | Translation and coherence transactions precede device concurrency. |
| 6: ECC, Rowhammer, multisocket and modern machines (27, 37, 46) | DRAM, VM, selective new extensions | Keep explicit applicability; no undocumented address maps or mitigation guarantees. |

## Stage contract

Phase 1 is the first reviewable change set. No phase is reordered. Later phases are tracked separately below; adding foundation hooks does not
complete their roadmap items.
The Phase 1 memory service is deliberately a generic finite-service model, not
a Zen+ memory-controller scheduler. Actual DDR command scheduling belongs to
Phase 3. Model capacities must never be presented as measured Zen+ capacities.

New labs follow mechanism → prediction → experiment → observability →
explanation. Existing chapter IDs and numbered chapters remain stable; the
performance lab is added after the existing end-to-end chapter. Do not replace
the current lookup, pipeline, store, coherence, prefetch or I/O simulations.

## Validation gates

- Pure model: conservation of requests/bytes, capacity bounds, in-order
  retirement, dependency serialization, queueing, saturation, and DAG overlap.
- Hardware harness: compile with warnings as errors; validate ring coverage,
  multiple independent chains, run metadata and JSON schema. Execution here is
  a harness smoke check, never a Ryzen 7 3750H calibration.
- Rendered app: all chapter routes, controls, representative original state
  machines, deep links, glossary, latency updates, theme persistence and mobile
  viewport overflow. Rebuild checked-in HTML and verify build determinism.
- Measurement honesty: browser results say simulation; hardware import says
  measurement and retains context. No invented PMU events or fabricated traces.

## Status

Phases 1–5 are implemented. Phase 6 is pending. Validation is recorded by stage below.

| Phase 1 item | Delivered |
| --- | --- |
| Measurement framework | Native randomized pointer rings, fixed-total-working-set 1/2/4/8/16-chain sweep, sequential read/write kernels, affinity, warm-up, repetitions, checksums, compiler/platform context and JSON import. See `benchmarks/README.md`. |
| Performance vocabulary | Timing boundaries, IPC/CPI, miss rate/MPKI, useful vs line vs DRAM bytes, occupancy/utilization and percentiles in `#perf/vocabulary`; new glossary definitions. |
| Latency / throughput / bandwidth | Interactive Little's-law calculator, prediction checkpoint, time-foundations links and actual traffic accounting. |
| MLP | Single vs independent dependent chains, controlled sweep and serial/parallel throughput checks. |
| Finite queues | Bounded ROB bodies, load queue, miss entries, fabric, controller, parallel service and return queues. Existing instruction-level MAB allocation now respects its declared limit. |
| Saturation / backpressure | Presets expose dependency, miss-entry, controller and return-link pressure. Downstream full queues hold upstream work in place. |
| Observability | Live cycle state, occupancy plot, average/peak/full counts, overlapping stall counters, IPC/CPI/MPKI, byte counts, service/transport/queue decomposition, request-latency quantiles and real-tool mapping. |
| End-to-end modes | Original single-access view, dependency DAG with translation/index overlap, serial page reads, independent work and unrelated writeback; steady-state experiment shares the finite-resource engine. |

Integration fixes: restored persistent light/dark selection, connected the
existing section menu/progress UI, retained hash fragments through the entry
redirect, corrected row-hit timing in shared table/plate data, bounded invalid
latency inputs, and relabeled pipeline instruction-group throughput accurately.
The instruction-memory and pointer-prefetch wording corrections from the audit
are included without removing the original technical content.

Validation: 13 model/regression tests; one native-harness test covering all five
chain counts and read/write modes; 96 rendered checks in Chromium 138.0.7204.0,
including all 24 routes, 1440px desktop and 390/768px viewports, both themes,
original controls, mode/section navigation, measurement import and glossary.
No uncaught browser errors. Rendered screenshots were inspected. See the
reproducible commands in README and `tests/`.

Hardware validation on the reference Ryzen 7 3750H remains a separate gate.
The local C execution is a harness smoke check, not performance evidence for
the reference CPU. PMU event availability and meaningful steady-state benchmark
results must be established on that machine. Middle-half simulation rates are
explicitly finite-window estimates, not proof of asymptotic steady state.

Phase 2 built cache miss taxonomy/reuse distance and traffic accounting before
splits, forwarding/aliasing, resource sharing and ownership transactions.
Next stage: Phase 3 controller queues, scheduling and read/write contention.

## Phase 2 delivery

The implementation order follows the ledger: cache state and traffic first,
then dependencies and resource sharing, then ownership and native experiments.
`12_cache_lab_models.js` contains deterministic, independently tested models.
`24_cache_lab.js` and `25_coherence_lab.js` extend existing chapters after their
original workbenches are built. This avoids disturbing the legacy child-index
layout transformations. No original chapter is renumbered or replaced.

| Roadmap item | Delivered route / behavior |
| --- | --- |
| 3C and reuse distance | `#l1d/taxonomy`: editable trace, capacity/associativity/line-size controls, true-LRU shadow classification, dirty eviction and RFO accounting. |
| Throughput, ports and banks | `#l1d/split`: independent hit fragments share explicitly hypothetical ports/banks; includes whole-line fill writes. |
| Splits / SIMD width | Exact byte coverage for 1–64-byte accesses across 64-byte lines and 4 KiB pages; page crossing is distinguished from faulting. Wider operands are generic, not Zen+ ISA claims. |
| Forwarding / 4 KiB aliasing | `#stores/forwarding`: coverage matrix, known/unknown address/data, partial-address false aliases and validate/replay choices; no invented fast-path penalties. |
| MSHR saturation | `#core/miss-entries`: same-line merging, bounded miss table and in-order ROB drain. |
| SMT interference | `#core/smt`: dependent thread versus compute/memory sibling, bounded shared resources and hypothetical dynamic/fixed allocation. |
| Fill / eviction pressure | `#hier/write-pressure`: dirty victims fill a bounded writeback queue, hold returned fills and block upstream requests. |
| RFO / useful store bytes | `#stores/write-traffic`: working-set/reuse sweep with final-drain accounting and a clearly limited ideal full-line non-temporal comparison. |
| Atomics / false sharing | `#coh/transactions`: one thread, SMT siblings, two/four physical cores; shared/packed/padded counters; add/CAS/retry/store/read traces. |
| Transient coherence | Generic IS/IM/SM/OM, in-flight data and explicit invalidation acknowledgements; store retirement versus visibility. Race handling is explained, not falsely presented as a concurrent network simulator. |
| Dirty peers / HITM | Dirty owner supplies current data while memory is stale; peer/home/ack counters and architecture-dependent perf c2c guidance. |
| Locks | `#stores/locks`: CAS versus read polling with multiple waiters; ticket/mutex/futex mechanisms and language-level ordering distinctions. |
| Native experiment | `benchmarks/sharing.c` and `sharing.py`: pinned C11 atomic counters, topology/context, random repeated cases, checksum validation and safe JSON import. |

Validation: 24 model/regression tests, two native harness tests and 124 rendered
browser checks (Chromium 138.0.7204.0), including original routes/controls,
new section navigation, model controls, native imports, both themes and
390/768/1440px layouts. No uncaught browser errors. Desktop and mobile rendered
screenshots were inspected. Phase 1 remote CI is green at `fad6a7a`.

Remaining hardware gate: run representative trials on the actual Ryzen 7 3750H,
with recorded topology/conditions and PMU support. No local smoke timing is
claimed as Zen+ evidence. Cache inclusion/vendor topology comparisons belong to
Phase 5; read/write bus scheduling belongs to Phase 3. All added exact queue,
bank, forwarding-policy and coherence-timing choices are labeled teaching rules.

## Phase 3 delivery

`12_controller_model.js` schedules actual commands from request arrivals;
`26_controller_lab.js` appends `#dram/controller` to the original DDR4 chapter.
The original device plate/stepper and its speed-bin example are preserved.
The new model uses deliberately small model-clock timings, supplied bank/rank/
channel coordinates, and no claimed Zen+ address mapping or scheduler.

| Roadmap item | Delivered behavior |
| --- | --- |
| Controller queues | Separate bounded read/write admission with explicit upstream waiting; editable request table and generated workloads. |
| FCFS / FR-FCFS-style | Oldest-request head-of-line blocking versus ready-command/row-hit preference; identical-trace comparison, per-request bypass counts and optional age override. |
| Write draining | High/low watermark selection, drain mode, old-read override at mode boundaries; started requests finish before switching modes. |
| Bus turnaround | Read/write direction gaps, same-rank write-to-read timing and rank-switch gaps; one non-overlapping data bus per channel. |
| Parallelism | Independent bank activation subject to rank timing, shared rank bus and independent channels; command/data timeline and per-bank state. |
| Additional timing | RCD, RP, RAS, RC, RRD, CCD, RTP, WR, WTR, four-activate windows and stated simplified turnaround rules. Scope explicitly excludes a complete JEDEC validator. |
| Refresh / tails | Rank quiescence, precharge, data drain, REF busy interval and staggered simplified deadlines; individual-request mean/quantiles/max. |
| Loaded latency | Offered-load sweep, admission/queue/command-interval decomposition and request detail; no mislabeled pure service time. |
| Native observability | `loaded.c` / `loaded.py`: validated dependent ring with concurrent pinned read/write generators, random repeated cases, context/hashes and safe import. Background useful bandwidth is chunk-quantized and not DRAM bus bytes. |

The native timer excludes setup and generator ramp-up. Generators publish
progress in 64 KiB chunks; the measurement UI names that approximation and
retains raw trials. No hardware output is bundled or labeled as a 3750H result.
Reference-machine characterization remains an external hardware gate.

Model validation: 38 total tests, including 14 controller tests independently
reconstructing timing constraints from the command log, queue bounds, byte
conservation, non-overlapping transfers, refresh exclusion, multi-channel
concurrency and scheduler/age counterexamples. Three native harness tests
compile with warnings as errors, execute every mode and reject invalid inputs.
Phase 2 remote CI is green at `5b8426a`.

Rendered validation: 130 checks pass in Chromium 138 at 1440/768/390px, both
themes, with the original chapters and controls retained. No uncaught errors.
Command timelines, JSON export/import and mobile rendering were inspected.
A targeted follow-up verified invalid-trace recovery and disabled stale-result
export; timeline SVGs now retain readable scale inside horizontal scrollers.

## Phase 4 delivery

`12_vm_model.js` separates VMA policy, present/swapped leaf entries, conceptual
TLBs, physical frames, file page cache and swap backing. `27_vm_lab.js` appends
four scenes to translation and a clearly scoped two-node extension to hierarchy.
Original translation controls, synthetic page tables and detailed plates remain.

| Roadmap item | Delivered route / behavior |
| --- | --- |
| mmap / demand-zero | `#xlate/os`: mapping without residency, shared zero-page reads, private allocation/zeroing on write and independent TLB/walk/fault counters. |
| COW | Fork protects private mappings before the child runs; parent invalidation, child copying or exclusive-page reuse; actual representative word values remain consistent. |
| Page cache | Warm/cold model state, private versus shared file mappings, dirty shared data and explicit backing writeback before eviction. Storage durability is not equated with CPU visibility. |
| Reclaim / swap | Advanced interactive reclaim, dirty file writeback, anonymous swap preservation, swap-cache reuse, COW across swap and a disabled-swap outcome that retains data. |
| THP / explicit huge pages | `#xlate/pages`: dense/sparse TLB traces, reach/footprint, successful PMD mapping, THP base-page fallback and explicit HugeTLB failure. Multi-size THP and actual-mapping observation are distinguished. |
| Walk contention | `#xlate/walk-contention`: serial dependent PTE requests, cached upper levels, finite walkers and memory slots shared with ordinary data; request timeline and traffic. |
| Shootdown scaling | `#xlate/shootdown`: CPU mask, page batching, invalidation choice, remote handler delay, acknowledgements and sum-of-work versus origin critical path. |
| NUMA | `#hier/numa`: two memory nodes, first-touch/interleave placement, execution migration without automatic data migration and a contended remote response link. Explicitly outside the laptop topology. |
| Native observability | `vm.c` / `vm.py`: pinned anonymous/private/shared mapping probes, fault deltas and content validation, parent/child checks, advice versus actual smaps evidence, raw context and safe import. |

The OS model is deliberately not a Linux implementation or a predicted fault
count. It shows one word per full 4 KiB frame, ignores page-table allocation,
uses immediate invalidation in lifecycle scenes and models storage-backed
faults without time. The separate shootdown scene exposes completion delays.
NUMA clocks, topology and bandwidth are chosen. No new proprietary Zen+ walker
count, TLB replacement policy or hardware page-size capacity is asserted.
The older walkthrough now qualifies the private allocation path and removes an
unsupported exact walker count without removing its detailed translation steps.

Validation: 50 model/regression tests, including 12 VM/translation tests for
ownership, swapped aliases, permissions, value preservation, serial walk
dependencies, finite resources, shootdown completion and remote-link bounds.
Four native harness tests compile and exercise their modes with data/affinity
checks. Fault totals and THP success are not asserted as fixed hardware results.
Phase 3 remote CI is green at `336596d`.

Rendered validation: 154 checks pass in Chromium 138 at 1440/768/390px, both
themes, including new VM actions, model outcomes and native imports. No uncaught
errors. Desktop/mobile screenshots were inspected; a follow-up corrects an
ambiguous parent-to-frame wire and checks import accounting. Reference-host
measurement on the actual 3750H remains an external gate; development smoke
results are not bundled as reference-machine evidence.

## Phase 5 delivery

`03_architecture_evidence.js` provides the claim/source registry;
`12_architecture_model.js` contains pure ordering, inclusion and granule
experiments; `28_architecture_lab.js` appends scoped comparisons to their existing
chapters. There is no separate duplicated Intel or Arm chapter sequence.

| Roadmap item | Delivered route / behavior |
| --- | --- |
| Formal Zen+ anchor | `#map/reference`: exact-product facts, externally reported family observations, inference, teaching choices and unknowns, with scope and experimental relevance. |
| Fidelity labels | Filterable claim registry, original-chapter scope notes, primary source links and point-of-claim corrections for unverified legacy values. |
| Intel / Arm contrasts | Ordinary x86 WB ordering versus selected AArch64 cases; E5 v4 inclusive versus Skylake-SP non-inclusive LLC; AArch64 translation-granule choices. No universal vendor queue or cache layout. |
| Ordering layers | `#stores/litmus` separates language, compiler, ISA, microarchitecture and coherence. SB/MP/LB state enumeration produces actual witnesses; full ordering points change outcomes. |
| Language semantics | `#stores/language`: invalid non-atomic flag synchronization, all-relaxed atomic access, one-publication release/acquire, and seq_cst; synchronization depends on reading the published value. |
| Cache/topology | `#hier/inclusion`: read-only inclusive/exclusive/NINE policies, data duplication, victim movement, private back-invalidations and ideal directory assumptions. Existing SMT/NUMA labs supply topology experiments. |
| Translation contrast | `#xlate/granules`: equal-entry TLB geometry and page-offset VIPT constraint with 4/16/64 KiB granules; actual implementation/OS support remains required. |
| Benchmark comparison | `#perf/compare`: two real native imports, exact work/seed pairing, context/source-hash differences and descriptive median ratios. No fabricated cross-machine results. |
| Reproduction | `benchmarks/litmus/generate.py` emits x86/AArch64 SB/MP/LB variants with optional full barriers; the protocol separates formal enumeration from native observations. |

The reduced relaxed ordering engine is explicitly **not** a complete Arm model.
SC/TSO modes cover ordinary reads, writes and full fences in three two-thread
tests; no atomics, mixed sizes, device attributes or speculative timing. Formal
ISA verification uses the linked primary models and the supplied herd7 workflow.
herd7 was not installed locally; no formal-tool or native litmus result is claimed.

The existing model queue sizes and execution behavior remain intact. The legacy
44-entry load-queue reference conflicts with the external Zen notes' 72; it is
now unresolved for the 3750H rather than silently treated as a product fact.
Other unverified limits and the unsupported 20.8-TSC-tick misprediction statement
retain their historical numbers with explicit qualification, not false measured
attribution. Product capacities remain concrete. No audit replacement was made.

Validation: 58 model/regression tests, including eight architecture tests for
ordering outcomes, FIFO publication, fence completion, inclusion/exclusion at
each access, peer copies, page geometry and exact-work measurement joins. Four
native harness checks pass. Phase 4 remote CI is green at `6ba79d5`.
Rendered validation: 182 checks pass in Chromium 138 at 1440/768/390px in both
themes, including evidence filters, ordering witnesses, language semantics,
inclusion/granule controls and real native-run comparison imports. No uncaught
errors. Desktop/mobile screenshots were inspected. The new litmus section uses
`#stores/litmus`, preserving the original `#stores/ordering` route.
