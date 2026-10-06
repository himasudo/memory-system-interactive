# Native measurement workflow

The primary workflow on Linux is:

```sh
python3 benchmarks/run_all.py
# Run, open the local lab and load every chapter automatically:
python3 benchmarks/run_all.py --serve
```

Python 3 and a GCC-compatible C compiler are required. No extra Python packages,
root permissions or remembered CPU IDs are needed. Run from the repository root.
The command reads `/proc/cpuinfo`, kernel information, sysfs core/package/die/NUMA
IDs and reciprocal SMT sibling lists, intersected with the process affinity and
online CPU sets. It runs memory/MLP, atomic sharing, loaded latency, VM/COW and
software-prefetch experiments sequentially. Sharing uses a physical-core pair
and a separate SMT pair when available; loaded latency uses up to four confirmed
physical cores. CPU numbers are never assumed to be alternating physical cores.

Missing topology or restricted affinity falls back to a single-CPU baseline,
with reasons for omitted placements. `--cpu N` prefers an anchor; `--cpus 2-5,8`
restricts candidates. Bundle seeds are restricted to 1–2^53−1 for exact browser
representation; individual runners retain their uint64 interfaces. Unavailable requested IDs produce an explicit fallback,
not a guessed placement. Pinning does not isolate SMT siblings or background
load, and it does not change NUMA policy, governors, boost, ASLR or THP.

```text
results/
  raw/
    memory.json
    sharing.json
    sharing-physical_cores-0.json  # original placement output, when two runs exist
    sharing-smt_siblings-1.json    # original placement output, when available
    loaded.json
    vm.json
    prefetch.json
    *-attempts.json               # commands, exit status and diagnostics
  reference-machine.json
```

The aggregate is a portable `memory-lab-bundle-v1` document. It retains each
untouched native run and its exact context, alongside selected placements,
raw-file SHA-256 hashes, source/binary/runner hashes, compiler commands and flags,
machine/kernel/topology, capability availability, raw repetitions and derived
statistics. A canonical `sharing.json` combines placement trials without losing
their `placement_id` or original contexts; original placement files also remain.
Skipped suites have no invented samples. Native errors retain diagnostics and
partial trials, the remaining suites still run, and the command returns nonzero
for failed/partial suites. Completed runs overwrite their generated outputs;
the aggregate only references the current run's files. Interrupted runs retain
the last aggregate checkpoint and any per-suite checkpoint.

If a detected cache line differs from the sharing harness's assumed 64-byte
spacing, that suite is skipped with a reason. Unknown line size remains an
explicit assumption in raw context and topology, not a measured line-size claim.

The output filename does not assert a particular CPU. The UI uses recorded
model/vendor/family/model provenance, and never calls a generic host 3750H data.
Hashes support reproducibility; this is self-reported measurement provenance,
not remote hardware attestation. See [the bundle contract](../docs/MEASUREMENT_BUNDLES.md).

### Environment observations and reference curation

Every unified run (including quick harness checks) captures the environment
before the run, immediately before/after each suite, and after native suites and
optional perf. Full characterization keeps the same one-command interface:

```sh
python3 benchmarks/run_all.py --serve \
  --notes "Ryzen 7 3750H reference run; Ubuntu 24.04; normal idle system"
```

Read-only telemetry includes Mains online / AC versus battery evidence, battery
status/capacity, ACPI and per-device platform profiles, and an optional bounded
`busctl` D-Bus `Properties.Get` query with daemon activation and interactive
authorization disabled. Inactive services are skipped instead of started. It
records each online logical CPU's governor,
driver, related CPUs, `scaling_cur_freq`, policy min/max and exposed hardware
current/min/max frequency. Boost and `intel_no_turbo` are recorded separately.
Thermal zones retain zone/type names; hwmon temperature inputs retain exposed
driver/label names (including k10temp/coretemp when exposed). Units and the sysfs
source are explicit. A sensor index is never assumed to be CPU/package temperature.
Missing, denied, malformed or disappearing readings have an unavailable reason.
No root permissions or system-policy changes are used.

**Results** exposes snapshots, UTC timestamps, monotonic suite duration and
potential-confound warnings. Suite elapsed time covers the runner(s), compilation,
setup, trials and result collection, excluding the before/after telemetry reads.
Run elapsed time also includes telemetry, checkpoint I/O and optional perf;
neither duration replaces native kernel timing. A snapshot records its own
collection duration because its fields are read sequentially.

Warnings compare available observations across a suite and across the whole run.
A reported current-frequency range must differ by at least 200 MHz **and** 20%
of its observed minimum; a temperature range must differ by at least 10 °C.
Observed governor/profile/boost/AC/battery-state/policy-limit changes are flagged.
The thresholds are descriptive curation aids, not hardware limits. Warnings do
not exclude trials, change completion, diagnose thermal throttling or assert
that frequency caused a timing difference. Missing readings and a lack of
warnings do not prove a stable environment. `scaling_cur_freq` can represent a
requested policy frequency; snapshots are not active-kernel averages. See the
primary [CPUFreq](https://docs.kernel.org/admin-guide/pm/cpufreq.html),
[power supply](https://docs.kernel.org/power/power_supply_class.html),
[platform profile](https://docs.kernel.org/userspace-api/sysfs-platform_profile.html),
[thermal](https://docs.kernel.org/driver-api/thermal/sysfs-api.html) and
[hwmon](https://docs.kernel.org/hwmon/sysfs-interface.html) interfaces.

After inspecting and choosing an existing full run:

```sh
python3 benchmarks/export_public.py \
  results/reference-machine.json data/reference/ryzen7-3750h.json
```

The separate exporter does **not** measure again, commit, upload or modify the
private bundle/raw directory. It preserves trial values, parameters, CPU/kernel,
compiler version/flags, hashes, timing boundaries, telemetry/warnings and optional
evidence availability. Local absolute paths in commands, notes, diagnostics,
metadata keys and embedded JSON become logical benchmark/result paths or opaque
`paths/local-N` aliases. Windows drive/UNC paths are covered too. Kernel sysfs,
proc, device and known D-Bus interface paths remain as scientifically useful
source labels. VM smaps
headers retain their mapping/address/page fields; only local filename text is
sanitized. `raw_sha256` still identifies the original private raw file bytes,
as the export's provenance explicitly states; it is not a hash of the sanitized
embedded metadata. No private alias table is exported.

The exporter works on older compatible bundles too, without inferring missing
telemetry. To retain independent new runs, choose distinct `--results` directories
and pass the chosen bundle to the exporter. Review free-form notes when curating:
filesystem-path sanitization does not remove unrelated personal prose. The named
Ryzen output rejects another CPU's identity. Public loading and browser-local
visitor import keep their existing validation/privacy behavior.

### Local lab and visitors

`--serve` builds the standalone page, starts a loopback-only read-only server,
prints/opens the lab URL and supplies the new bundle through a fixed GET endpoint.
Every relevant chapter loads it automatically. Ctrl+C stops the server. Use
`--port 0` to choose a free port or `--no-browser` on a headless machine. If port
8000 is busy, the default server chooses a free port. No upload or write endpoints
exist. `--results PATH` changes the output folder without requiring a public copy.

On GitHub Pages, a committed `data/reference/ryzen7-3750h.json` is read
automatically. Producing a bundle never copies or commits it to this public path;
curation is an intentional maintainer action on actual target-machine data.
**Results** accepts one visitor bundle for session-local comparison. Importing
uses `File.text()` locally, makes no network requests, does not persist the bundle
and cannot write to GitHub, replace the public reference or affect another visitor.
Every old per-suite file input and the two-memory-run comparison remain available.

### Optional evidence and conservative fallbacks

The workflow detects `perf`, its version and permission policy, and sysfs
`ibs_op` / `ibs_fetch` PMUs with exposed type/format/capability fields. When perf
works, it attempts separate bounded representative memory executions for the
documented generic `cycles:u`, `instructions:u` and software `task-clock` events.
It keeps exact commands, workload output, raw stderr, counter runtime and running
percentage. Events returning errors, unsupported/uncounted values, or output it
cannot parse are skipped with reasons. `--no-perf` explicitly disables collection.

These counts cover the native **process lifetime**, including pinning, allocation,
validation, warm-up and teardown, in separate executions. They are never divided
by a kernel-only elapsed time, never combined into cross-execution IPC/MPKI, and
never presented as cache-level, DRAM-traffic or queue evidence. Generic symbols
are not invented raw PMCs. Perf's scaling/multiplexing percentage is retained.

Automatic IBS sampling is deliberately skipped even when a PMU is detected:
permission/filtering and model/kernel-specific fields are not established by
sysfs presence. No generic `perf mem` latency is substituted for a verified Zen+
IBS measurement. Cache/ownership/controller PMCs, storage experiments, cache
dropping, disturbance and privileged configuration protocols remain explicit
manual investigations with their existing documentation. No policy is loosened
to make perf work. See the [upstream perf tutorial](https://perfwiki.github.io/main/tutorial/)
and the primary references below.

`--quick` runs small correctness trials, never hardware characterization. With
less than 512 MiB remaining host/cgroup memory the workflow records a quick-mode
fallback; with less than 128 MiB it skips native compilation/execution. Per-suite
timeouts terminate both the runner and its native process group, retain partial
evidence and continue. Extra BIOS/DIMM/load notes can be supplied using `--notes`.

## Individual memory runner (preserved)

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

Normally the aggregate loads automatically with `--serve`. As a fallback,
import `results.json` in the memory section. Inspect raw ns, operations, checksum, placement,
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

## Phase 6 extensions

For the runnable software-prefetch sweep and controlled instruction-side,
io_uring/NVMe, IOMMU, NUMA and reliability observation protocols, see
[advanced/README.md](advanced/README.md). Import verified software-hint results in
`#pref/resources`; the queue/controller simulations remain separately labeled
teaching models.
