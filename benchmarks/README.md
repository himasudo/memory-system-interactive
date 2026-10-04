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
