# Ordering experiments

These are ordinary aligned coherent-memory assembly tests, not data-racing C
programs. Both shared locations start at zero. The `exists` clause selects one
interesting outcome; it does not assert that it is allowed.

Generate a test and run it with an installed [herdtools7](https://github.com/herd/herdtools7):

```sh
python3 benchmarks/litmus/generate.py --isa x86 --case SB > /tmp/SB.litmus
herd7 /tmp/SB.litmus
python3 benchmarks/litmus/generate.py --isa aarch64 --case MP > /tmp/MP.litmus
herd7 /tmp/MP.litmus
python3 benchmarks/litmus/generate.py --isa aarch64 --case MP --fenced > /tmp/MP-fenced.litmus
herd7 /tmp/MP-fenced.litmus
```

Use `--case LB` for Load Buffering. `--fenced` places MFENCE (x86) or DMB SY
(AArch64) between the two memory operations on **both** threads. The latter is
deliberately a full barrier; narrower barriers and acquire/release instructions
need their own tests. Record `herd7 -version`, the exact model/configuration and
source hash. The tool/model supplied by a particular installation determines
the formal result; retain it with the output. The browser does not invoke herd7.

| Test and selected outcome | x86 ordinary WB / TSO | AArch64 plain accesses | Both threads fully fenced |
| --- | --- | --- | --- |
| SB: both reads return 0 | Allowed | Allowed | Forbidden |
| MP: flag=1, data=0 | Forbidden | Allowed | Forbidden |
| LB: both reads return 1 (constant stores, no data dependency) | Forbidden | Allowed | Forbidden |

The browser enumerates SC and a small TSO store-buffer machine for these cases.
Its relaxed mode is an **illustrative witness generator**, not the Arm `.cat`
model, a full C11 model, or a cycle simulator. Its state counts are not outcome
probabilities. No dependencies, mixed-size accesses, device attributes, atomics,
translation faults or exceptions are included. Changing those assumptions
requires a suitable architecture model rather than extending the table by guess.

On supported native machines, use `litmus7` following its installed documentation
to compile/run the generated test; record compiler output, placement, iterations,
OS and CPU. Use enough independent trials and retain every outcome count. An
allowed outcome can be rare or absent in finite runs. Failure to see it does not
establish a stronger architectural guarantee. Emulation is not a characterization
of the target CPU's ordering or performance. No real x86 or Arm litmus results
are bundled, and herd7 was not installed in the development environment.

For C11 message passing, initialize objects before starting threads and use a
release store to an atomic flag plus an acquire load that **reads that store**.
In a one-publication protocol, this can safely publish a non-atomic payload.
Relaxed atomic data and flag accesses avoid data races but do not establish that
synchronization. Making a flag `volatile` does not make it atomic or synchronized.
Kernel memory-barrier APIs follow the Linux kernel model and cannot be substituted
word-for-word for C11/C++ language guarantees.

Primary references:

- [x86-TSO research model](https://www.cl.cam.ac.uk/~pes20/weakmemory/cacm.pdf)
- [Intel SDM Vol. 3A, memory ordering examples](https://cdrdv2-public.intel.com/812386/253668-sdm-vol-3a.pdf)
- [Arm message-passing tutorial](https://developer.arm.com/community/arm-community-blogs/b/architectures-and-processors-blog/posts/how-to-use-the-memory-model-tool)
- [Arm barriers and acquire/release](https://developer.arm.com/community/arm-community-blogs/b/architectures-and-processors-blog/posts/generate-litmus-tests-automatically-diy7-tool)
- [AArch64 research model and test catalogue](https://www.cl.cam.ac.uk/~sf502/AArch64/)
- [C11 N1570, 5.1.2.4 and 7.17](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)
