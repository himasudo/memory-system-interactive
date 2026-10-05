# Advanced mechanisms: reproduce and interpret

These protocols connect Phase 6's teaching models to observations. Browser
clocks never measure the host CPU, NVMe controller, IOMMU or DRAM. The repository
contains no new measurements of the Ryzen 7 3750H and no cross-vendor leaderboard.

## Software prefetch distance

```sh
python3 benchmarks/prefetch.py --cpu CPU --output prefetch-results.json
objdump -d benchmarks/prefetch
```

Replace `CPU` with a permitted CPU after inspecting `lscpu -e`. The runner
compiles with warnings as errors, pins before allocation/first touch, keeps
working set and useful loads fixed across distances, warms without software
hints, shuffles case order, and retains raw trials/compiler/kernel/topology,
source and binary hashes. Import the result in `#pref/resources`.

Each case reads one 8-byte word from every 64-byte line of a power-of-two ring.
Odd strides 1 and 3 traverse the whole ring. The prefetch address is known early;
distance is future **accesses**, not contiguous bytes. Hints wrap within the
allocated object. A separate no-hint function avoids a per-load distance-zero
branch. Closed-form sums verify every full pass independently of the kernel.

Inspect emitted instructions: a builtin is a hint, and a compiler/architecture
may emit different code or no prefetch instruction. Address arithmetic, loop
control and summation are timed. Hardware prefetchers remain enabled. Warm-up
does not promise cache residency beyond cache capacity. Compare distributions
of repeated trial averages at matched sizes/strides/loads; they are not p99 of
individual loads. No hint count or elapsed-time improvement establishes
prefetch accuracy, DRAM bytes, MSHR size or an undocumented detector policy.

## Instruction-side pressure

Use equivalent compiled work with dense versus scattered hot basic blocks.
Retain generated assembly, text size and executed path. Change inlining or
unrolling only with those changes recorded; branch prediction and instruction
working set are separate confounds. Pin the process and check `perf list` for
CPU-specific iTLB/L1I/front-end events, validating their definitions in vendor
documentation. Generic `cache-misses` cannot identify instruction fetch.
Decoded-block caches, branch predictors and speculative fetching are outside
the serial browser model. `#code/fetch` models resident executable pages;
instruction page faults are not simulated.

## io_uring / NVMe queues

The runnable software-prefetch harness needs only C/Python. This I/O protocol
requires an existing io_uring-capable workload (for example fio with its
`io_uring` engine), a filesystem and a disposable test file you create. The
protocol intentionally reads a regular file; do not substitute a raw device.
Example after preparing a known test file that is larger than the chosen cache
regime:

```sh
fio --name=read-qd --filename=/absolute/path/to/disposable-test-file \
    --readonly --allow_file_create=0 --rw=randread --bs=4k --direct=1 \
    --ioengine=io_uring --iodepth=8 --numjobs=1 --runtime=20 --time_based=1 \
    --output-format=json --output=io-qd8.json
```

Run matched queue depths 1/2/4/8/16/32 with the same existing file, seed,
runtime, CPU affinity and data-cache regime. Set and retain an explicit fio
random seed and random-repeat policy for controlled comparisons. Retain fio,
kernel, filesystem and storage versions; storage geometry/firmware, direct-I/O
alignment/support, active scheduler, IRQ affinity, device NUMA node, CPU/worker
placement, thermal state, CPU cost and completion percentiles. Precondition and
warm consistently. Direct I/O support and cache effects must be verified;
buffered page-cache hits do not test the NVMe DMA path.

Inspect fio's installed `io_uring` options before varying fixed buffers,
submission polling or completion polling. SQPOLL consumes submissions in a
kernel thread; IOPOLL requires supported direct-I/O/device paths; application CQ
polling is a third mechanism. io_uring SQ/CQ entries, block-layer tags and NVMe
hardware SQ/CQ entries are different queues. Registered buffers retain pinned
application pages; they do not guarantee zero-copy buffered reads or eliminate
the driver's DMA mappings. A filesystem can split/merge work, and async
operations can require workers. The browser's fixed 4 KiB queue model abstracts
these choices rather than impersonating them.

This environment has not supplied an NVMe/fio dataset. There is no fabricated
I/O result import or automatic hardware attribution.

## IOMMU and multisocket placement

Inspect device attachment, active translation/bypass configuration and supported
IOMMU tracepoints. Mapping lifetime, retained translations, device/driver policy
and DMA ownership are distinct. An IOTLB miss is not a CPU TLB miss. Quiesce DMA
before unmapping and maintain safe frame/IOVA reuse until the required
invalidation is complete. The lab's walkthrough chooses synchronous invalidation;
Linux also has deferred policies with their own lifetime/isolation tradeoffs.

```sh
lscpu -e=CPU,CORE,SOCKET,NODE
numactl --hardware
numactl --physcpubind=CPU --membind=NODE python3 benchmarks/run.py --cpu CPU --output local.json
```

Use actual permitted CPUs and nodes. Repeat with a remote node; inspect
`/proc/PID/numa_maps` and `numastat -p PID` while it runs. The runner records
inherited policy rather than verifying every page home. Control cpusets and
automatic balancing/migration. `#hier/multisocket` adds fixed node service and
finite remote return links; it does not claim the reference laptop has two
sockets or a server memory topology.

## Reliability and latency tails

`#dram/ecc` implements exact extended Hamming(8,4) arithmetic. All single-bit
errors correct; every double-bit error is detected; larger errors can alias or
miscorrect. That does not specify a DIMM's ECC word/interleaving. System ECC,
on-die ECC, stronger chip-failure codes and platform reporting are different
protection boundaries. Inspect supported EDAC/RAS reporting without injecting
hardware errors. Missing counters do not prove error-free hardware.

`#dram/refresh-tails` compares the same controller requests with refresh off/on
using Phase 3's timing engine. Request quantiles are simulated individual
requests. Native loaded-latency trial averages cannot establish single-load p99
or identify refresh causally. Hardware tail studies need appropriate samples,
documented events and alternate explanations such as contention/page faults.

`#dram/disturbance` describes repeated ACT/PRE and electrical disturbance at an
architectural level. It supplies no activation threshold, address-map discovery,
bit-flip prediction or hardware hammering code. Row-buffer hits are a different
command sequence. Refresh/restoration, activation management and stronger ECC
have implementation-specific costs/coverage, without a universal safety claim.

Primary sources are linked in the corresponding lab sections: Linux DMA/EDAC,
upstream liburing, AMD EPYC architecture, Intel's DDIO/mesh description,
NVIDIA Grace tuning and Kim et al.'s ISCA 2014 disturbance research.
