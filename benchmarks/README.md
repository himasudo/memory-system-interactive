# Native performance experiments — Phase 1

These Linux experiments accompany **Measure & explain** (`#perf/measure`). They
are native C workloads, not browser timing benchmarks and not a calibrated Zen+
simulator. Record the actual CPU; results from another machine are not 3750H data.

```sh
python3 benchmarks/run.py --cpu 2 --output results.json \
  --notes 'Record BIOS, DIMM/channel setup, thermal/load state and NUMA policy here'
# If CPU 2 is outside your affinity mask, choose an allowed CPU or omit --cpu.
python3 benchmarks/run.py --quick --output smoke.json
```

Python 3 and a GCC-compatible C compiler are required. No root permissions or
Python packages are required. The runner compiles with `-O3 -std=c11 -g`, pins
before first touch, randomizes case order reproducibly, and checkpoints raw JSON.
It does not alter frequency, page, ASLR, NUMA or security settings. A failed
case is an error; a partial JSON has `complete: false`.

## Mechanism → prediction → experiment

- **Working-set sweep:** randomized disjoint pointer rings, one pointer per
  64-byte node. Sizes cover 4 KiB to 64 MiB. Predict latency plateaus; transitions
  also reflect TLBs, prefetching, placement and cache policy, not just capacity.
- **MLP sweep:** 1/2/4/8/16 independent chains, fixed *total* working-set bytes and
  approximately fixed total loads. Each chain is dependent; chains are mutually
  independent. Predict higher aggregate throughput until something saturates.
- **Sequential read/write:** visit every 8-byte element. Predict higher useful
  bandwidth than one pointer chase. Writes can induce RFO and later writebacks;
  useful bytes/time is not measured memory-bus bandwidth. These are ordinary
  cached C stores, not guaranteed non-temporal stores or a STREAM replacement.

Each repetition warms the entire working set first. “Warm” means first-touch
and warm-up excluded, **not** that a set larger than cache fits in cache. The
ring builder verifies complete disjoint coverage and closure before timing.
The shuffle is reproducible and not a claim of cryptographic uniformity.

`steps` means loads per chain for chase and whole-array passes for read/write.
`operations` counts pointer loads or 8-byte elements. `useful_bytes` is 8 times
that count. The checksum consumes the kernel result; compiler memory barriers
prevent folding repeated stream passes. Check assembly: read reductions may
vectorize, and many pointer chains may spill registers. Compiler barriers do
not flush caches or fence hardware. Long kernels amortize timestamp overhead;
the reported interval is an estimate that includes call/loop overhead.

```sh
objdump -d -S benchmarks/memlab > /tmp/memlab-assembly.txt
benchmarks/memlab --mode chase --bytes 67108864 --chains 4 \
  --steps 500000 --repeats 9 --cpu 2 --seed 1
```

## Observe and explain

Import `results.json` in the app. Inspect raw ns, operations, checksum, placement,
compiler and hashes. Mean, median, population standard deviation and nearest-rank
p95/p99 refer to **run-average ns/operation**. With nine repeats p95 and p99 both
select the maximum; they do not estimate per-load tails. Repeat for longer if
drift/noise dominates; retain outliers and explain exclusions rather than silently
discarding them. `--quick` validates the harness only.

```sh
perf list
perf stat -r 5 -e cycles,instructions,cache-references,cache-misses -- \
  taskset -c 2 benchmarks/memlab --mode chase --bytes 67108864 --chains 1 \
  --steps 2000000 --repeats 1 --cpu 2 --seed 1
# If supported by the actual CPU/kernel/perf and permitted for this account:
perf mem record -- taskset -c 2 benchmarks/memlab --mode chase \
  --bytes 67108864 --chains 1 --steps 2000000 --repeats 1 --cpu 2
perf mem report
# For a separate multithreaded sharing experiment, not the single-thread chase:
perf c2c record -- ./your-sharing-benchmark
perf c2c report
```

These perf commands count/sample the **whole process**, including setup and
warm-up. Do not divide those counts by the harness's kernel-only time. Use long
runs to investigate mechanisms; use matched-region PMU instrumentation before
claiming matching IPC/MPKI. Check unsupported events, access errors, counter
multiplexing and running percentages. No raw PMU encodings are prescribed.

AMD IBS sampling can provide operation/cache/translation information on supported
hardware and kernels; not every newer IBS field or filter exists on Zen+. `perf
mem` latency meanings differ across architectures. `perf c2c` may classify sharing
traffic where supported; never equate every miss with HITM or a DRAM access.

The metadata deliberately leaves actual huge-page mapping, current clock,
temperature, DIMM timings/population and background contention unresolved when
it cannot measure them. Record those controls manually. Pinning does not silence
the SMT sibling. Invariant TSC ticks are not dynamic core cycles; this harness
uses `CLOCK_MONOTONIC_RAW` ns and makes no IPC claim.

Primary references:

- [Upstream perf stat](https://kernel.googlesource.com/pub/scm/linux/kernel/git/stable/linux-stable/+/master/tools/perf/Documentation/perf-stat.txt)
- [Linux AMD IBS documentation](https://android.googlesource.com/kernel/common/+/0e674132ddfa938cd53ba7c3706f0d83b2a91491/tools/perf/Documentation/perf-amd-ibs.txt)
- [AMD Family 17h optimization guide 55723](https://docs.amd.com/v/u/en-US/55723_3.01) — verify model applicability; use the exact processor PPR for PMCs.

Conflict, split-access, forwarding, false-sharing and atomics experiments belong
to Phase 2; DRAM scheduling to Phase 3; page and NUMA experiments to Phase 4.
No fabricated result file is shipped as hardware evidence.

## Atomic counters and false sharing (Phase 2)

```sh
lscpu -e=CPU,CORE,SOCKET,NODE,ONLINE
cat /sys/devices/system/cpu/cpu0/topology/thread_siblings_list
python3 benchmarks/sharing.py --cpus 0,2 --output sharing-results.json \
  --notes 'Record actual topology, background activity, thermals and placement here'
```

Replace `0,2` with allowed CPUs after inspecting topology. Run a pair of SMT
siblings, a pair of different physical cores and, optionally, four physical
cores. `--cpus 0` runs the one-thread cases only; every multi-thread run also
includes one-thread baselines. A 3750H has four physical cores, so eight logical
CPUs must not be treated as eight independent cache-owning physical cores.

The C kernel compares one shared counter, separate counters eight bytes apart,
and separate counters 64 bytes apart. Allocation is 64-byte aligned and the
assumed coherence line is explicitly 64 bytes. For machines with another line
size, this is not a valid padded-versus-packed classification. The kernel
requires lock-free, eight-byte C11 atomic integers and checks that condition at
runtime. `-latomic` supplies the query where required; non-lock-free results
are rejected rather than silently benchmarking library locks.

Both `atomic_fetch_add_explicit` and a weak compare-exchange retry loop use
`memory_order_relaxed`. Each successful operation increments one counter.
Failure counts are retained for CAS; a weak CAS can fail spuriously. These are
atomic counter experiments, not publication or lock implementations. Inspect
assembly (`objdump -drwC benchmarks/sharing`) to identify what the compiler
actually emitted. C11 semantics: [WG14 N1570, §7.17](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf).

Each worker pins itself, warms the atomic instruction path on a private local
counter, and reaches a readiness barrier. The timed boundary begins immediately
before the release barrier and ends after all joins. It excludes allocation,
thread creation and warm-up, but **includes barrier, scheduler and join costs**.
Use `--iterations` to make this fixed overhead small and check the result across
larger counts. Initialization is done by the main thread under its inherited
NUMA policy; this is recorded, not silently called worker first-touch placement.

Trials are randomized across modes, operations and repetitions. Defaults:
nine repeats and one million successful updates per thread. `--quick` gives
10,000 updates and three repeats as a correctness smoke check, not useful
hardware characterization. Every trial verifies pinned CPU IDs and the final
sum, and retains time, offsets, addresses, successful updates and CAS retries.
The output includes compiler command/hashes, CPU information, topology, kernel,
clock boundary, available IBS PMU and supplied notes. An interrupted run is
explicitly partial. Import its JSON in **Coherence → Atomic updates, false
sharing and transient ownership** (`#coh/transactions`).

Compare median **aggregate ns/update** and the distribution of trial averages.
Those are not single-operation latency distributions. Runtime differences are
evidence of performance changes, not direct counts of cache-line transfers.
For supported machines, use `perf c2c record -e list` to inspect the available
sampling events and consult the installed tool's help. A long single native
case is a better profiling target than many short Python-spawned cases:

```sh
# Example workload only; choose CPU IDs for the intended placement.
benchmarks/sharing --cpus 0,2 --threads 2 --mode packed --op add --iterations 100000000
```

Use that executable under the supported `perf c2c record` invocation, then
`perf c2c report --stdio` to examine hot lines and offsets. The
[upstream perf c2c documentation](https://kernel.googlesource.com/pub/scm/linux/kernel/git/frowand/linux/+/b72b5fecc1b8a2e595bd03d7d257c88ea3f9fd45/tools/perf/Documentation/perf-c2c.txt)
and [AMD IBS documentation](https://android.googlesource.com/kernel/common/+/0e674132ddfa938cd53ba7c3706f0d83b2a91491/tools/perf/Documentation/perf-amd-ibs.txt)
explain architecture-dependent sampling. AMD uses IBS Op on supported hardware;
permissions, kernel support, sampling bias and data-source fields matter. Do
not substitute Intel HITM raw events or equate sampled records with all ownership
handoffs. The harness collects no PMU traffic counters by itself.

## Loaded latency (Phase 3)

```sh
lscpu -e=CPU,CORE,SOCKET,NODE,ONLINE
python3 benchmarks/loaded.py --cpus 0,2,4,6 --output loaded-results.json \
  --notes 'Record topology, memory population, frequency/thermal state and load'
```

Choose **actual** physical-core IDs; the sample numbers do not prescribe the
3750H's logical CPU enumeration. The first CPU runs a randomized dependent ring;
subsequent CPUs run independent streaming read or temporal-write generators.
The runner includes a zero-generator baseline and sweeps up to the supplied
number of generators, with randomized case order and repeated trials. Use SMT
siblings only for an explicitly separate interference comparison.

Every worker pins before allocating and first-touching its data. The pointer
ring uses 64-byte nodes, validates exactly-once coverage and closure, and checks
the final pointer against the expected position. It is warmed before timing.
Each generator fills and repeatedly accesses its own array; the chase starts
only after every generator has completed a full pass. Default working set is
64 MiB **per worker**; adjust `--bytes` after a working-set sweep. Small sizes
measure cache effects. There is no claim that a fixed size is always DRAM-bound.

The clock covers the dependent kernel only. Background progress is published
once per 64 KiB chunk, on separate aligned worker records, and sampled around
the chase. Useful background bytes divided by chase time give an **approximate
concurrent rate**, with chunk-boundary and snapshot-time error. These are neither
DRAM bus bytes nor exact per-cycle bandwidth samples. The progress publications
and stop polling are part of the generator implementation; inspect assembly
and increase trial duration to check their effect. Temporal writes may generate
ownership reads and dirty evictions beyond the useful bytes counted here.

`--steps`, `--repeats`, `--bytes` and `--seed` control the run. The defaults are
2,000,000 dependent loads, nine repetitions and a deterministic randomized ring.
`--quick` uses 64 KiB and 50,000 loads for executable/JSON validation only. Size
must be a multiple of 64 KiB, 64 KiB–256 MiB, with at most eight distinct CPUs;
account for the total per-worker allocation. The JSON retains topology,
compiler command/hashes, CPU/kernel, frequency controls, THP policy and notes.
Actual mapping page size and microarchitecture attribution remain unknown.

Import `memory-lab-loaded-v1` results in `#dram/controller`. Report the median
chase ns/load alongside generator useful GB/s and raw trial distributions. A
p95 across trials is a percentile of run averages, not an individual-load tail.
Repeat long enough to expose drift and record thermals/background activity.
Shared caches, fabric, execution resources (for SMT), page walks and the memory
controller can all contribute to a slowdown. Controller queue occupancy, row
hits and refresh attribution need applicable PMU/sampling evidence; timing
alone cannot establish them.

## Mapping, first touch and COW observations (Phase 4)

```sh
python3 benchmarks/vm.py --output vm-results.json \
  --notes 'Record page policy, placement, kernel, memory pressure and thermals'
# Optional: --cpu <allowed CPU> --bytes 16777216 --repeats 9
```

The runner compiles `vm.c` with warnings as errors and randomizes repeated cases:
private anonymous memory with base/huge advice, a private file mapping, and a
shared file mapping. It touches one volatile byte per base page. Five separately
timed stages record `getrusage(RUSAGE_SELF)` minor/major deltas, checksums and
observed CPU: first read, first write, repeated write, a child write after fork,
and the parent's final read. Write stages include readback for validation.
Fork, joins, file creation, `smaps` reads and final `msync` are outside the stage
timers. The child reports its own counters, not `RUSAGE_CHILDREN` aggregates.
These are **whole-stage observations**, not isolated fault-service or load
latency. Incidental process faults remain possible within the counter boundary.

Private mappings must preserve the parent's value (7) after the child writes
42. Shared file mappings must expose 42 to the parent. File backing must retain
10 for the private case and contain 42 for the shared case after explicit
`msync`. The program rejects content or affinity mismatches. Its final file
check is a read through the OS and is **not** a crash-persistence test.

File fixtures are temporary, unlinked, and written immediately before mapping.
They start page-cache warm; the temporary filesystem may itself be memory-backed.
Its mount information is recorded when `findmnt` is available. There is no
privileged cache dropping, forced storage miss, swap-pressure generation, global
policy change or claim that a warm page maps with exactly one fault per page.
Readahead/fault-around and kernel optimizations affect that relationship.

The target VMA sits inside an owned guarded reservation at a 2 MiB boundary.
`MADV_NOHUGEPAGE` or `MADV_HUGEPAGE` and the advice error code are recorded;
success does not prove a large mapping. Selected `/proc/self/smaps` fields are
captured before touch, after first read/write and after the child's write.
Inspect `AnonHugePages`, residency and flags alongside policy/per-size THP
settings. `KernelPageSize` alone does not describe every THP case. Linux
[multi-size THP](https://docs.kernel.org/admin-guide/mm/transhuge.html) can use
PTE-mapped large pages as well as PMD-size huge mappings. This probe does not
infer hardware leaf size from advice or convert aggregate huge bytes into a
per-access translation claim.

Default size is 16 MiB and nine trials per case. `--quick` uses 256 KiB and three
trials to validate execution/JSON only; it is too small for a full 2 MiB target
mapping. Sizes must be base-page multiples up to 128 MiB. Explicit HugeTLB pool
management is not automated; the browser explains reservation/failure separately.
Reclaim, swap and shootdown timing remain controlled models unless you collect
appropriate target-host evidence.

Import `memory-lab-vm-v1` JSON at `#xlate/os`. The UI retains raw per-stage
observations, mapping snapshots, compiler/binary hashes and context. Compare
counter deltas, content invariants and mapping evidence before interpreting
timing. `/proc/PID/maps` describes VMAs; `/proc/PID/smaps` adds residency/accounting.
Use supported `perf` page-fault counters or tracepoints for longer workloads,
with the scope of child processes and kernel/tool support recorded. Hardware
TLB misses/walks, kernel page faults, and ordinary cache misses are separate
quantities.

For the two-node NUMA extension, inspect `lscpu`, `numactl --hardware`,
`/proc/PID/numa_maps` and `numastat -p` before comparing CPU migration against
page placement. Record memory policy and automatic balancing. The reference
laptop is not evidence of multisocket behavior; run that experiment on a host
that actually exposes multiple memory nodes.

## Architecture comparisons (Phase 5)

`#perf/compare` accepts two `memory-lab-v1` files from the original native runner.
It pairs exact mode/working-set/chains/steps/operation-count/seed cases and shows
per-operation median times, trial counts and the B/A time ratio. CPU, compiler,
clock boundary, page/frequency state and source hashes stay visible. Different
source hashes, missing metadata, quick runs or partial datasets limit what can
be concluded. A matching source hash is necessary for a controlled program
comparison, but does not establish identical generated code or system conditions.

For Zen+/Intel/Arm comparisons, compile for each actual target with recorded
flags and inspect the kernels. Keep useful work and the measurement boundary
equal; record differences in page size, working-set/cache fit, SMT placement,
memory population, frequency and compiler transformations. Report dispersion
and raw trials alongside medians. An ISA name or faster total cannot identify
the responsible cache policy, queue capacity or memory-controller behavior.
There is no controlled cross-machine dataset bundled with the project.

The [ordering protocol](litmus/README.md) supplies generated assembly litmus
tests for herd7 and supported native litmus7 workflows. Browser witness counts
are exhaustive only for their small stated model; they are neither empirical
frequency estimates nor a complete AArch64/C11 semantics implementation.
