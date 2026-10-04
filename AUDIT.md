# Memory Systems Lab — Expert Completeness Audit

## Audit Standard

This audit uses the following bar:

> **What would the strongest computer-architecture / performance-engineering reader still find missing, oversimplified, insufficiently measured, insufficiently connected to real hardware, or too specific to one implementation without teaching the general principle?**

The goal is **not** to make the project longer for its own sake. The goal is to evolve it from a detailed interactive memory tutorial into a serious interactive computer-architecture and performance-engineering lab.

The current project already covers many important mechanisms, including out-of-order execution, finite core resources, speculative memory disambiguation, store-to-load forwarding, MAB/MSHR behavior, page translation, TLBs, cache hierarchy behavior, DRAM timing, x86-TSO, MOESI, prefetching, DMA/IOMMU, and an end-to-end memory-access path.

The next frontier is therefore not simply “add more component names.”

The major gap is that the lab should increasingly answer questions such as:

- What saturates first?
- What overlaps with what?
- What queues behind what?
- Where does backpressure propagate?
- What throughput results?
- What does the latency distribution look like?
- What changes under contention?
- Which PMU/IBS/perf observation would validate the model?
- Which behavior is universal versus specific to Zen+ or another implementation?

---

# Core Direction

The project should move toward this learning loop:

```text
architecture
    ↓
mechanism
    ↓
prediction
    ↓
simulation
    ↓
real-hardware measurement
    ↓
PMU / IBS / perf evidence
    ↓
model disagrees with measurement?
   ↙                         ↘
explain gap             refine model
   \                         /
    ───────────┬────────────
               ↓
            intuition
```

The project should ultimately combine:

1. **Interactive architecture atlas**
2. **Finite-resource/concurrency simulator**
3. **Real-hardware performance laboratory**
4. **Selective cross-architecture comparison**

---

# Highest-Priority Gaps

## P0. Real Hardware Measurement

This is the single largest opportunity.

The current project explains mechanisms well, but it should close the loop with measurement.

Add a dedicated hardware-measurement layer covering:

- `perf stat`
- `perf mem`
- AMD IBS where supported
- `perf c2c`
- processor PMCs
- CPU affinity/pinning
- scheduler migration
- SMT state
- warm-up
- cold vs warm cache
- compiler optimization
- dead-code elimination
- frequency scaling
- invariant TSC vs core clock
- page placement
- ASLR where relevant
- sample size
- mean vs median
- percentiles
- confidence / run-to-run variance
- background interference
- kernel version
- microcode
- BIOS / memory configuration

### Core experiments

Add or formalize:

- pointer-chase latency vs working-set size
- sequential read bandwidth
- sequential write bandwidth
- cache-size sweep
- stride sweep
- MLP sweep with 1/2/4/8/16+ independent chains
- cache-conflict experiment
- TLB-reach experiment
- huge-page experiment
- split/misaligned access experiment
- store-forwarding experiment
- false-sharing benchmark
- atomic-contention benchmark
- prefetch-friendly vs prefetch-hostile access patterns
- DRAM row-hit / row-conflict experiment where measurable

For each important experiment:

```text
prediction
   ↓
run benchmark
   ↓
raw timing
   ↓
PMU / IBS evidence
   ↓
map result back to architecture
   ↓
explain disagreement between model and measurement
```

A strong reader should leave knowing not just how the machine is supposed to work, but how to test that belief.

---

## P0. Latency vs Throughput vs Bandwidth vs MLP

These ideas should become central rather than peripheral.

A reader must clearly understand that:

- latency = time for one operation
- throughput = operations completed per time
- bandwidth = bytes transferred per time
- MLP = concurrent outstanding memory work
- cache hit latency != cache throughput
- DRAM latency != DRAM bandwidth
- a high-latency system can still sustain high throughput if concurrency is sufficient

Use Little’s Law intuition:

```text
concurrency ≈ throughput × latency
```

Example:

If usable bandwidth is 20 GB/s and cache lines are 64 B:

```text
20 GB/s / 64 B ≈ 312.5 million lines/s
```

At ~80 ns service latency:

```text
312.5M × 80 ns ≈ 25 cache lines in flight
```

This makes MSHRs, request queues and outstanding miss limits meaningful rather than just named structures.

### Interactive experiment

Let users increase independent misses:

```text
1 → 2 → 4 → 8 → 16 → 32 ...
```

Visualize:

```text
MLP ↑
→ bandwidth ↑
→ finite resource fills
→ bottleneck saturates
→ queueing delay ↑
→ observed latency ↑
→ IPC stops scaling or falls
```

---

## P0. Saturation, Queue Occupancy and Backpressure

The project already has finite structures in the core. Extend this philosophy through the full hierarchy.

Pedagogically model finite capacities for:

```text
Load Queue
Store Queue
MSHR/MAB
L1 request resources
fill buffers
writeback buffers
L2 request queue
fabric/interconnect credits or queues
LLC outstanding requests
memory-controller request queue
DRAM-bank availability
```

Show the difference between:

```text
one miss
```

and:

```text
many independent misses
```

Make backpressure visible.

Example:

```text
memory-controller queue fills
       ↓
fabric requests wait
       ↓
LLC miss resources remain occupied
       ↓
MSHRs fill
       ↓
new misses cannot allocate
       ↓
load execution stalls
       ↓
ROB fills
       ↓
front-end eventually stalls
```

This is much closer to how performance bottlenecks actually propagate.

---

## P0. End-to-End Execution Needs Concurrency

The end-to-end chapter should not imply that total memory time is simply:

```text
TLB + L1 + L2 + L3 + DRAM
```

Add three modes:

### A. Single-access mode

Keep the current clean educational waterfall.

### B. Critical-path mode

Represent work as a dependency DAG.

Show overlap between:

- TLB lookup
- VIPT cache indexing where relevant
- unrelated execution
- multiple independent loads
- page walks
- cache misses
- writebacks
- prefetches
- DRAM commands

### C. Steady-state mode

Show many requests flowing at once.

Expose:

- occupancies
- queue depths
- throughput
- bandwidth
- bottleneck
- latency distribution
- useful overlap

A real OoO machine is fundamentally about overlapping latency.

---

# Cache System Audit

## 1. Complete Cache-Miss Taxonomy

The project has strong conflict-miss material, but add the full:

- compulsory
- capacity
- conflict

model.

Use a classification experiment.

A useful conceptual test:

```text
first ever access?
  → compulsory

would same-size fully-associative cache also miss?
  → capacity

otherwise
  → conflict
```

### Go beyond 3C with reuse distance

Use traces such as:

```text
A B C A D A B E ...
```

Visualize reuse/stack distance.

Allow users to vary:

- cache capacity
- associativity
- line size
- access order

This connects theory to working-set behavior.

---

## 2. Cache Throughput, Ports and Banking

A cache should not be modeled only as:

> hit = N cycles

Also teach finite throughput.

Add pedagogical treatment of:

- accepted loads per cycle
- stores per cycle
- execution/load-store ports
- banking where relevant
- bank conflicts where relevant
- simultaneous hits
- fill traffic
- writeback traffic
- read/write competition

Example:

```text
one L1 hit = ~N-cycle latency
```

does not imply:

```text
8 independent L1 hits = 8 × N cycles
```

Latency and throughput must remain separate.

---

## 3. Split and Misaligned Accesses

Add an interactive address-offset visualizer.

Example for an 8-byte load:

```text
offset 56:
|..............XXXXXXXX|

offset 60:
line N                              line N+1
|............................XXXX|XXXX............................|
```

Show consequences of crossing:

- cache-line boundary
- page boundary

Potential effects:

- two cache-line accesses
- two translations
- two TLB states
- two physical pages
- one side may fault while the other is valid

Extend to:

- 16-byte access
- 32-byte SIMD access
- wider vector accesses where appropriate
- loads and stores

---

## 4. Cache Inclusion Policy

Add:

- inclusive
- exclusive
- non-inclusive/non-exclusive

Use architecture comparisons where they teach an actual design tradeoff.

The lesson should be:

> cache hierarchy topology is not universal.

Avoid presenting one vendor’s hierarchy as “how caches work.”

---

## 5. Fill / Eviction / Writeback Pressure

Show that a miss can create more than one downstream action.

For example:

```text
new fill arrives
   ↓
victim line selected
   ↓
victim dirty?
  yes
   ↓
writeback generated
   ↓
fill still needs space/resources
```

Under sustained traffic:

- fills
- writebacks
- demand loads
- stores
- prefetches

can compete.

This is important for realistic cache saturation.

---

# Core / Memory Interaction Audit

## 6. MSHR/MAB Saturation

The project already models MAB/MSHR concepts.

Deepen them by showing:

- mergeable misses
- non-mergeable misses
- finite outstanding miss resources
- saturation
- allocation failure
- downstream backpressure
- interaction with ROB occupancy

Make MSHR saturation a first-class experiment.

---

## 7. Store-to-Load Forwarding Failure Matrix

The project already has store-to-load forwarding.

Add the ugly cases.

Dimensions:

```text
store size
load size
store address
load address
overlap
alignment
```

Cases:

- exact match
- load contained inside older store
- partial overlap
- size mismatch
- cross-line
- unresolved older store address
- aliasing case

Outcomes:

```text
forward
wait
replay
```

Do not overspecify undocumented Zen+ internals; present generic mechanisms and label implementation-specific behavior clearly.

---

## 8. 4 KiB Aliasing / Memory Dependence Prediction

Make address aliasing more explicit.

Teach why different virtual addresses sharing lower address bits can complicate early memory-dependence decisions.

Connect this to:

- speculative load execution
- store-address resolution
- replay
- performance penalties

This is exactly the kind of microarchitectural corner that advanced readers expect.

---

## 9. SIMD and Access Width

Show that “a load” is not always the same kind of operation.

Compare:

- scalar 4 B
- scalar 8 B
- 16 B SIMD
- 32 B SIMD
- wider architecture-appropriate operations

Then connect access width to:

- alignment
- split lines
- throughput
- ports
- cache bandwidth

---

## 10. Front-End Starvation

The memory-system story is overwhelmingly data-side.

Add explicit cases where performance is limited by instruction fetch.

Show:

```text
PC
 ↓
iTLB
 ↓
L1I
 ↓
L2
 ↓
LLC
 ↓
DRAM
```

Cover:

- iTLB miss
- L1I miss
- op/uop-cache behavior where relevant
- branch-target fetches
- large code footprint
- front-end starvation

“Memory-bound” is not synonymous with “data-cache bound.”

---

# SMT and Shared-Resource Interference

## 11. SMT on the Reference Machine

The reference Ryzen 7 3750H is 4C/8T.

Use that.

Teach:

- two logical threads on one physical core
- which resources are duplicated
- which are partitioned
- which are dynamically shared
- when SMT hides bubbles
- when SMT hurts

Experiments:

```text
pointer chase alone

pointer chase + compute-heavy sibling

pointer chase + memory-heavy sibling
```

Show effects on:

- execution resources
- cache pressure
- queue occupancy
- latency
- IPC

Do not make unsupported claims about exact undocumented partitioning policies.

---

## 12. Cross-Core Interference

Add a loaded-system experiment.

Example:

```text
Core 0:
latency-sensitive pointer chase

Core 1:
memory-bandwidth stress workload
```

Show why Core 0 can slow down despite unchanged code:

```text
shared LLC
fabric
memory-controller queue
DRAM banks
data bus
```

This introduces:

- unloaded latency
- loaded latency
- shared-resource contention

This is central to real performance engineering.

---

# Stores, Atomics and Synchronization

## 13. Store Retirement != Global Visibility

Make this visually explicit.

```text
store instruction retires
        ↓
store may remain buffered
        ↓
ownership / coherence work
        ↓
eventual visibility to other cores
```

Teach the distinction between:

- retirement
- completion
- cache ownership
- visibility
- persistence where relevant

---

## 14. RFO Traffic Accounting

A cold temporal store may create read-for-ownership traffic.

Show actual bytes moved.

Compare:

```text
normal temporal stores
vs
non-temporal stores
```

across working-set size.

Make users predict the crossover point.

---

## 15. Atomic RMW Path

Add proper atomics.

Example:

```c
atomic_fetch_add(&counter, 1);
```

Modes:

- 1 thread
- 2 SMT siblings
- 2 physical cores
- multiple physical cores
- same counter
- separate counters
- separate counters sharing a line
- padded counters

Visualize cache-line ownership:

```text
Core 0        Core 1

  M
  |
atomic
  |
  +------ ownership request ------>
                                 M
  I                            atomic
                                |
<------- ownership request ------+
  M                              I
```

Teach the difference between:

- uncontended atomic
- contended atomic

The cost is not merely “an atomic ALU operation.” It can be coherence traffic and serialization.

---

## 16. False Sharing

Treat false sharing as both:

- a coherence concept
- a measurable performance problem

Experiment:

```text
counter A and B same cache line
vs
counter A and B padded apart
```

Measure:

- runtime
- cache-line bouncing
- `perf c2c`/related evidence when supported

This should become one of the flagship hardware experiments.

---

## 17. Locks

Build from atomics into:

- spinlock
- CAS retry loop
- ticket lock at a conceptual level
- uncontended mutex
- contended mutex
- futex sleep/wakeup as an advanced extension

The objective is to connect high-level synchronization primitives back to cache ownership and memory-system behavior.

---

# Coherence Audit

## 18. Stable MOESI States Are Not Enough

The existing stable-state MOESI material is useful.

Add pedagogical transient states.

Examples:

```text
I
|
GetS issued
↓
I→S pending
|
data arrives
↓
S
```

and:

```text
S
|
ownership request
↓
S→M pending
|
wait for invalidation acknowledgements
↓
M
```

Use generic teaching states; do not pretend to expose AMD’s proprietary exact protocol.

Teach why transient states exist:

- network messages take time
- acknowledgements take time
- data may be in flight
- races occur
- probes can arrive during transitions
- retries/NACKs may be necessary

---

## 19. HITM / Peer Cache Transfers

Add clear observable concepts:

- modified line supplied by another core
- peer-cache transfer
- ownership movement
- cache-line bouncing
- false-sharing hotspots

Connect these to real observability such as `perf c2c` where supported.

---

# Memory Ordering Audit

## 20. Explicitly Separate Five Layers

Create an unmistakable conceptual firewall between:

1. language memory model
2. compiler ordering
3. ISA memory model
4. microarchitectural execution/speculation
5. cache coherence

These are often conflated.

The project should repeatedly reinforce that they are related but not identical.

---

## 21. Expand Litmus Tests

Include carefully selected examples such as:

- Store Buffering
- Message Passing
- Load Buffering as contrast
- possibly IRIW when comparing stronger/weaker models

Use these to compare:

- x86-TSO
- weaker ARM-style ordering

The point is not “AMD vs ARM.”

The point is:

> which observed behavior is a universal property, and which is an ISA memory-model guarantee?

---

# DRAM / Memory Controller Audit

## 22. Add a Real Memory-Controller Teaching Model

The current DRAM material covers the DRAM device well.

Add the queueing system in front of it.

Example request set:

```text
Req   Arrival   Bank   Row   Type
A       0        B0     R3   Read
B       1        B1     R9   Read
C       2        B0     R3   Read
D       3        B0     R7   Read
E       4        B1     R9   Write
```

Compare:

### FCFS

```text
A → B → C → D → E
```

### Simplified FR-FCFS-style policy

Prefer:

- ready commands
- row hits
- older requests among equivalent candidates

Show:

- total completion time
- individual request latency
- fairness
- possible starvation

Do not claim this is Zen+’s exact proprietary scheduler.

Label it:

> Generic timing-correct teaching memory controller

---

## 23. Read / Write Queue Behavior

Add:

- separate or logically distinct read/write queues
- write draining
- high/low watermarks conceptually
- read→write turnaround
- write→read turnaround
- starvation considerations

This explains why store-heavy workloads can affect unrelated reads.

---

## 24. Parallelism in DRAM

Make distinct:

- bank-level parallelism
- rank-level parallelism
- channel-level parallelism

Show how concurrency differs from row-buffer locality.

A scheduler may trade:

```text
row-hit locality
vs
parallelism
vs
fairness
```

---

## 25. More Timing Constraints

Where useful, add concepts such as:

- tFAW
- tWR
- tWTR
- bus-turnaround effects
- refresh interference

Do not turn the chapter into a JEDEC timing encyclopedia.

Only add timing parameters when they explain a meaningful scheduling or performance consequence.

---

## 26. Latency Distributions

Do not show only one “DRAM latency.”

Show a distribution:

- row hit
- row closed
- row conflict
- queued request
- refresh interference
- bus turnaround
- contention

Teach:

```text
service time
≠
queueing time
≠
observed/use latency
```

---

## 27. ECC and Rowhammer — Advanced

Optional advanced material:

### ECC

Explain:

- check bits
- detection
- correction
- ECC DIMM concept
- why ECC is more than parity

### Rowhammer

Explain only at the architecture level:

```text
repeated ACT/PRE
→ electrical disturbance
→ adjacent-row vulnerability
```

Then discuss mitigation concepts.

Do not turn this into an exploitation tutorial.

---

# Virtual Memory / OS Memory Audit

## 28. `mmap`

Show the difference between:

```text
virtual mapping exists
```

and:

```text
physical page is resident
```

Introduce VMAs and lazy population conceptually.

---

## 29. Demand-Zero Pages

Make clear:

```text
malloc()
```

does not necessarily mean all requested physical RAM is immediately allocated.

Show first-touch allocation.

---

## 30. `fork()` + Copy-on-Write

This would be an excellent visualization.

```text
Parent PTE ─┐
            ├── same physical page, read-only/COW
Child PTE ──┘
```

Then:

```text
child writes
  ↓
page fault
  ↓
allocate new frame
  ↓
copy data
  ↓
update child PTE
  ↓
invalidate relevant TLB entry
  ↓
resume
```

This ties together:

- page tables
- protection
- faults
- allocation
- TLB invalidation

---

## 31. File-Backed Mappings and Page Cache

Connect:

```text
virtual address
→ PTE
→ physical page
→ page cache
→ storage if not resident
```

Teach:

- anonymous memory
- file-backed memory
- minor fault
- major fault

at an appropriate conceptual depth.

---

## 32. Reclaim / Swap

Add a conceptual advanced section explaining that under memory pressure:

- pages may be reclaimed
- clean file-backed pages may be dropped
- dirty pages may require writeback
- anonymous pages may be swapped depending on policy/configuration

Avoid making slow-path VM behavior appear common on healthy systems.

---

## 33. Huge Pages

Distinguish:

- regular 4 KiB pages
- explicit hugetlb pages
- Transparent Huge Pages

Teach tradeoffs:

- greater TLB reach
- fewer page-walks
- larger allocation granularity
- fragmentation/compaction considerations
- potential latency effects

---

## 34. 5-Level Paging

Keep the Zen+ machine’s real 4-level translation as the main reference.

Add a clearly marked evolution note for 5-level x86 paging (LA57) so readers do not generalize “x86-64 always uses four levels.”

---

## 35. Page Walks Use the Memory Hierarchy

Make this much more explicit.

A page walk is itself memory traffic.

PML4E/PDPTE/PDE/PTE accesses can:

- hit caches
- miss caches
- consume request resources
- consume DRAM bandwidth
- compete with normal demand loads
- coexist with other page walks
- benefit from page-walk caches

Therefore:

```text
TLB miss penalty
```

is not a single universal constant.

---

## 36. TLB Shootdown Scaling

The project explains shootdowns.

Turn this into an experiment.

```text
CPU0 updates PTE
      ↓
determine CPUs that may hold translation
      ↓
send IPIs
      ↓
remote CPUs enter handler
      ↓
invalidate TLB entries
      ↓
acknowledge
      ↓
origin continues
```

Let CPU count increase.

Teach why frequent mapping/protection changes can scale badly on large systems.

---

## 37. NUMA

Keep NUMA clearly marked as a server/multi-socket extension if the reference laptop does not expose true NUMA behavior.

Teach:

- local memory
- remote memory
- first-touch placement
- thread migration
- memory affinity
- `numactl`
- CPU affinity
- local vs remote latency/bandwidth

Do not falsely imply the reference machine has a topology it does not have.

---

# Prefetcher Audit

## 38. Make Prefetches Consume Resources

The project already has useful/late/unused ideas.

Go further.

A prefetch should consume:

- MSHR capacity
- request-queue entries
- fabric bandwidth
- DRAM bandwidth
- cache capacity

This allows aggressive prefetching to hurt performance.

---

## 39. Track Three Distinct Metrics

### Accuracy

```text
useful prefetches / issued prefetches
```

### Coverage

```text
misses eliminated / original demand misses
```

### Timeliness

Did the prefetched line arrive before demand?

Then demonstrate:

```text
distance too small
→ late

good distance
→ useful

distance too large
→ pollution / bandwidth pressure
```

---

## 40. Avoid Over-Absolute Claims

Do not say:

> no predictor could ever prefetch a pointer chase

More accurate:

> conventional stream/stride-style mechanisms cannot know a data-dependent next address until the dependent data becomes available.

Specialized dependent/pointer-chase or speculative schemes exist conceptually.

Always scope claims to the modeled mechanism.

---

# DMA / IOMMU / I/O Audit

## 41. IOTLB and Translation

Expand DMA/IOMMU material with:

- IOTLB
- translation cache behavior
- invalidation concept
- device-visible mappings

---

## 42. Pinned Pages / Scatter-Gather / Descriptor Rings

Add:

- pinned memory
- scatter-gather lists
- descriptor rings
- queue depth

Show why device I/O is also a memory-system problem.

---

## 43. Interrupts vs Polling

Cover:

- MSI-X
- interrupt moderation
- polling
- batching
- CPU affinity

Connect these to:

- cache locality
- queue latency
- throughput

---

## 44. NVMe / io_uring Extension

Advanced optional path:

```text
userspace
   ↓
syscall / io_uring
   ↓
submission queue
   ↓
doorbell
   ↓
device DMA
   ↓
data transfer
   ↓
completion queue
   ↓
MSI-X / polling
```

Tie this back to:

- DMA coherency
- IOMMU
- queue depth
- cache lines
- NUMA
- batching

Keep this clearly advanced so it does not derail the core memory path.

---

# Architecture Comparison Strategy

## 45. Keep Zen+ as the Anchor

Do not remove Zen+ specificity.

Use Zen+ as:

- the concrete reference machine
- the machine used for hardware experiments
- a real finite implementation of generic concepts

But every architecture-specific fact should answer at least one of:

1. Does it affect a simulation?
2. Does it explain a benchmark result?
3. Does it expose a design tradeoff?
4. Does it differ meaningfully from another implementation?
5. Does it constrain performance?

If not, demote it to reference/tooltip material.

---

## 46. Add Selective Intel and ARM “Architecture Lenses”

Do not duplicate all chapters.

Use comparison only where it teaches something.

Good comparison targets:

- OoO window / ROB
- load/store queues
- cache hierarchy
- LLC organization
- inclusion policy
- coherence
- SMT
- interconnect topology
- TLB organization
- memory ordering
- prefetchers
- NUMA/chiplets
- memory controllers

Structure:

```text
universal concept
      ↓
Zen+ implementation
      ↓
Intel / ARM comparison
      ↓
performance consequence
      ↓
general lesson
```

---

## 47. Add Explicit Fidelity Labels

Use visible labels such as:

- **Universal concept**
- **Zen+ implementation**
- **Implementation-dependent**
- **Documented vendor fact**
- **Measured / reverse-engineered**
- **Teaching-model approximation**
- **Undocumented / unknown**

This is important because deep microarchitecture material easily turns into confident but unsupported claims.

---

# Measurement Vocabulary

By the end of the lab, readers should instinctively understand:

| Metric | Meaning |
|---|---|
| Latency | Time for one operation |
| Throughput | Operations completed per unit time |
| Bandwidth | Bytes transferred per unit time |
| IPC | Instructions retired per cycle |
| CPI | Cycles per instruction |
| MPKI | Misses per thousand instructions |
| MLP | Concurrent memory operations/misses |
| Occupancy | How full a finite resource is |
| Queueing delay | Time waiting before service |
| Hit rate | Fraction serviced at a hierarchy level |
| Prefetch accuracy | Fraction of issued prefetches that become useful |
| Prefetch coverage | Fraction of original misses eliminated |
| p50/p95/p99 | Latency distribution rather than one average |

These metrics should appear throughout simulations, not only in a glossary.

---

# Observability Panels

Every major simulator should eventually expose a performance-engineering panel.

Example:

```text
Cycle:                   1834
Retired instructions:     942
IPC:                      2.31

ROB occupancy:           81 / capacity
Load queue:              37 / capacity
Outstanding misses:       9

L1 MPKI:                  8.4
L2 MPKI:                  3.1
L3 MPKI:                  0.9

DRAM queue depth:         14
Row-buffer hit rate:      63%
Bandwidth:                11.8 GB/s

Latency:
p50                       ...
p95                       ...
p99                       ...
```

Where the teaching simulator intentionally uses reduced capacities, keep the existing distinction between:

- real published/reported hardware capacity
- reduced simulation capacity

Do not silently mix them.

---

# Map Simulated Metrics to Real Tools

Where useful:

```text
Lab concept               Real observation
────────────────────────────────────────────
cycles/instructions    →  perf stat
cache events           →  PMU counters
memory access samples  →  perf mem / AMD IBS
false sharing          →  perf c2c
CPU topology           →  lscpu
NUMA placement         →  numactl
page faults            →  perf / proc / vmstat
bandwidth              →  benchmark + PMU evidence
```

The lab should teach that performance engineers infer internal behavior from observations rather than directly seeing every hidden microarchitectural event.

---

# “Break the Machine” Exercises

Add adversarial exercises.

Examples:

### Destroy the cache hit rate

Discover conflict/capacity patterns.

### Maximize bandwidth while latency remains high

Discover MLP.

### Make two independent counters dramatically slower

Discover false sharing.

### Increase cache misses without increasing working-set size

Discover mapping/associativity effects.

### Make DRAM traffic explode without increasing useful write data

Discover write allocation / RFO.

### Make prefetching reduce performance

Discover pollution and bandwidth pressure.

### Make TLB shootdowns dominate

Discover mapping churn + many cores.

### Make a cache-resident workload slow down

Discover SMT/shared-resource interference.

These build intuition much better than happy-path demos alone.

---

# Prediction Checkpoints

Before important animations or experiments, require a prediction.

Example:

```text
Eight independent DRAM misses each have ~80 ns unloaded latency.

How long will the group take?

A. 8 × 80 ns
B. ~80 ns
C. somewhere between
D. impossible to determine from this information
```

The correct answer is often:

> not enough information

because the missing information is precisely what performance engineering cares about:

- MLP capacity
- bank mapping
- queue depth
- bandwidth
- scheduler state
- contention
- dependencies

---

# Chapter-by-Chapter Audit

| Chapter | Expert-level status | Recommended additions |
|---|---|---|
| **00 Start Here** | Good orientation | Formal model contract, fidelity labels, assumptions, validation methodology |
| **01 Bits, Bytes, Hex** | Fine | Do not bloat; add bitfield/mask cross-links only where useful |
| **02 Memory & Addresses** | Missing physical edge cases | Alignment, cache-line splits, page splits, object layout implications |
| **03 Instructions & Registers** | Simplified | Architectural vs physical regs, memory operands, implicit accesses, atomic RMW, SIMD widths |
| **04 Reading x86** | Needs compiler connection | O0/O2/O3, vectorization, addressing modes, compiler transformations, µop consequences |
| **05 Cycles & Latency** | Major opportunity | Throughput, distributions, TSC/core frequency, queueing, Little’s Law |
| **06 Why Caches Exist** | Needs formal analysis | 3C misses, reuse distance, working-set curves, AMAT limitations |
| **07 Virtual Memory** | Good foundation | mmap, COW, page cache, THP, reclaim |
| **08 Cores / Sharing / Devices** | Too conceptual for expert tier | SMT, contention, affinity, NUMA, coherence-vs-consistency |
| **09 Machine** | Good atlas | Finite queues, shared bottlenecks, capacity labels, contention paths |
| **10 C → µops** | Strong start | Compiler variability, SIMD, fusion nuance, measured µop/throughput evidence |
| **11 Inside Core** | One of the strongest | SMT, port pressure, forwarding failures, aliasing, split accesses, queue occupancy |
| **12 VA → PA** | Strong | COW/mmap/THP, 5-level note, page-walk contention, shootdown scaling |
| **13 L1d** | Good mechanics | 3C misses, ports/banks, split lines, fill/writeback pressure |
| **14 Hierarchy** | Good path model | Saturation curves, finite queues, loaded latency, bandwidth, shared interference |
| **15 DRAM** | Good device explanation | Memory-controller queues, scheduling, write drain, turnaround, rank/channel parallelism |
| **16 Stores** | Broad | Atomic contention, traffic accounting, more litmus tests, quantitative NT-store comparison |
| **17 MOESI** | Good stable-state teaching | Transient states, ACKs, races, retries, peer-cache observability |
| **18 Prefetchers** | Good simulator | Finite-resource competition, adaptive distance, multi-stream pressure, PMU validation |
| **19 DMA/IOMMU** | Good architecture path | IOTLB, pinned pages, SG, descriptor rings, queue depth, IRQ/polling, NUMA |
| **20 End-to-End** | Strong idea, too single-request-centric | Critical-path DAG, steady-state mode, contention mode, measured-vs-predicted mode |

---

# Important Wording / Model Corrections

## “Loads and stores are the only way data moves between memory and registers”

This is too categorical for x86.

Better:

> Ordinary architectural memory dependencies ultimately involve memory reads/writes, although x86 frequently expresses them through memory operands or implicit accesses rather than separate explicit load/store instructions.

---

## Fixed Cache / DRAM Latencies

Label displayed timing values as something like:

> **Representative unloaded latency**

Observed latency may include:

- queueing
- coherence
- MLP
- prefetch effects
- refresh
- page-walk activity
- contention
- scheduling
- frequency effects

---

## “Memory latency” should be decomposed

Teach distinctions between:

```text
service time
queueing time
dependency delay
observed/use latency
retirement impact
```

They are not interchangeable.

---

## Pointer-Chase Prefetch Wording

Avoid universal claims that pointer chasing is impossible to prefetch.

Scope claims to the modeled or conventional stream/stride-style prefetcher.

---

# What NOT to Prioritize

Do not spend major effort on decorative 3D.

For this project:

> intellectual visualization > spatial spectacle

A simple occupancy graph that reveals MSHR saturation is more valuable than a polished 3D cache hierarchy that teaches nothing new.

---

# Recommended Implementation Phases

## Phase 1 — Performance Foundations

1. measurement framework
2. performance vocabulary
3. latency vs throughput vs bandwidth
4. MLP
5. finite queues
6. saturation/backpressure
7. observability panels
8. end-to-end critical-path / steady-state modes

This phase changes the conceptual model of the whole site.

---

## Phase 2 — Core / Cache / Coherence

1. 3C misses
2. reuse distance
3. cache throughput / ports / banks
4. split accesses
5. forwarding failure matrix
6. 4 KiB aliasing
7. MSHR saturation
8. SMT interference
9. atomics
10. false sharing
11. transient coherence states
12. HITM / peer-cache concepts

---

## Phase 3 — DRAM / Memory Controller

1. controller queues
2. FCFS vs FR-FCFS-style scheduling
3. read/write queues
4. write draining
5. bus turnaround
6. bank/rank/channel parallelism
7. loaded latency
8. additional useful timing constraints
9. refresh-induced tails

---

## Phase 4 — Virtual Memory / OS

1. mmap
2. demand-zero
3. COW
4. page cache
5. THP
6. explicit huge pages
7. page-walk contention
8. TLB shootdown scaling
9. NUMA extension
10. reclaim/swap as advanced material

---

## Phase 5 — Architecture Lenses

1. formal Zen+ anchor
2. implementation-fidelity labels
3. Intel contrasts
4. ARM contrasts
5. memory-ordering comparison
6. cache/topology comparison
7. benchmark comparison where reliable data exists

Do this after the generic mechanisms are solid so the project does not turn into a spec-table collection.

---

## Phase 6 — Advanced Extensions

- instruction-side memory hierarchy
- deeper prefetcher resource modeling
- IOTLB
- NVMe / io_uring path
- multi-socket NUMA
- ECC
- refresh-tail behavior
- Rowhammer architecture
- additional modern CPU/chiplet comparisons

---

# Final Target

The project should no longer be framed as:

> a detailed Zen+ memory hierarchy tutorial

or merely:

> a generic memory systems explainer

The target should be:

> **Use a real Zen+ machine as the primary experimental specimen to teach universal computer-architecture and performance-engineering principles, validate those principles against real hardware, and use selective Intel/ARM contrasts to show which behaviors are fundamental versus implementation-specific.**

The final identity should be:

```text
interactive architecture atlas
        +
finite-resource/concurrency simulator
        +
real-hardware performance laboratory
        +
selective cross-architecture case studies
```

The strongest-reader test should remain active throughout implementation:

> **What would an expert still find missing, oversimplified, insufficiently measured, insufficiently connected to real hardware, or accidentally presented as universal when it is only one implementation choice?**
