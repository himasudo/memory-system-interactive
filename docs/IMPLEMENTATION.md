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

Phase 1 is the first reviewable change set. No phase is reordered. Later phases
remain pending; adding foundation hooks does not complete their roadmap items.
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

Phase 1 is implemented and locally validated. Phases 2–6 are pending.

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

Next stage: Phase 2 cache miss taxonomy/reuse distance, then cache access/traffic
accounting; use that state for splits, forwarding/aliasing, resource sharing and
coherence transactions. This order avoids bolting atomics or false-sharing
statistics onto a cache/coherence model that cannot yet account for their traffic.
