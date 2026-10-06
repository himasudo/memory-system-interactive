# Mechanisms, implementation choices and evidence

Memory Systems Lab has an architecture-neutral foundation. A case study earns a
place when it changes a prediction, placement decision, allowed outcome or the
interpretation of a measurement. No implementation supplies a universal set of
queue sizes or simulator defaults. This is a positioning change atop PR #7;
the six completed phase models and native kernels retain their behavior.

The pre-edit dependency inventory and every Atlas disposition are in
[ARCHITECTURE_INVENTORY.md](ARCHITECTURE_INVENTORY.md). `AUDIT.md` and the phase
implementation ledger remain historical records of the completed work.

## Evidence contract

| Category | Requirement |
|---|---|
| Vendor documented | Name the document revision, implementation/ISA/standard and scope. A core manual does not establish a complete server SoC. |
| Academic / peer-reviewed | Name the publication and its formal model or tested processors. Distinguish the full research method from a browser illustration. |
| Reputable independent measurement | Retain source, reported CPU/microarchitecture, instruction/workload, units, dependency/counter boundary and limitations. |
| Locally measured | Show only supplied native observations with recorded machine, code, raw trials, topology and environment. |
| Inference | State the premises and a testable prediction separately from directly reported observations. |
| Teaching model | Identify chosen capacities, timing, replacement, scheduling and synthetic addresses. |
| Unknown / undocumented | Leave the value absent and state what evidence is missing. A plateau is not proof of a proprietary buffer count. |

The registry is `src/03_implementation_cases.js`; the Architecture contract is
`src/03_architecture_evidence.js`. Badges retain category text and distinct border
styles. Existing lab labels explicitly name chosen models; they are not converted
into documented or measured evidence by a vendor logo.

## Selected current/recent cases

Sources were checked on 6 October 2026. These choices favor public documentation
and a useful experiment over the newest product name.

| Implementation | Primary evidence | Why it changes the lesson / limit |
|---|---|---|
| AMD EPYC 9005, Zen 5 CCD variant | [AMD architecture white paper 70353, rev. B, pp. 5–8](https://docs.amd.com/v/u/en-US/5th-gen-amd-epyc-processor-architecture-white-paper) | Cache-sharing and memory-controller attachment have different boundaries. The diagram uses two illustrative CCDs, separates Zen 5c, and asserts no proprietary queue or inclusion policy. |
| Intel Xeon 6 P-cores, Granite Rapids | [Intel HPC tuning guide 858491, v1.3](https://cdrdv2-public.intel.com/858491/858491-Xeon6_HPC_Tuning_Guide_v1.3.pdf) | Memory controllers reside in compute dies. The two-die schematic is scoped to the 6700-series arrangement, not every Xeon 6 SKU or a router-level mesh. |
| Arm Neoverse V3 | [Optimization guide 110079, issue 3.0](https://documentation-service.arm.com/static/6734eb2627eda361ad4da4f4), [telemetry specification 107905, issue 01](https://documentation-service.arm.com/static/66f71ac61669c0388dca6d9b) | Distinguish documented core caches and unified L2 metric semantics from the external licensed SoC. The external LLC/fabric/memory block is dashed and explicitly outside the core guide. |

The Phase 6 [Grace NUMA](https://docs.nvidia.com/dccpu/grace-perf-tuning-guide/index.html)
and [Sapphire Rapids / Emerald Rapids DDIO](https://www.intel.com/content/www/us/en/developer/articles/technical/ddio-analysis-performance-monitoring.html)
contrasts remain additional scoped server-integration examples. Their local/remote
and I/O-placement lessons are preserved without turning peak rates into model inputs.

Original project schematics use the cited textual descriptions. They do not copy
vendor die images, benchmark charts or artwork. Cache locality is not silently
identified with an OS NUMA node; firmware and recorded topology still matter.

## Published measurements

[uops.info](https://uops.info/html-instr/MOV_R64_M64.html) reports MOV R64,M64
address-base-to-destination latency for Zen 5 and Arrow Lake-P. The original lab
plot uses those reported values with the operand/core-cycle boundary attached.
The linked summaries omit exact CPU SKU/platform attribution; that field stays
null with a reason. This is not a DRAM sweep, universal cache-latency default or
whole-system ranking. The [method](https://uops.info/background.html) and both
[Zen 5](https://uops.info/html-lat/ZEN5/MOV_R64_M64-Measurements.html) and
[Arrow Lake-P](https://uops.info/html-lat/ARL-P/MOV_R64_M64-Measurements.html)
raw experiments are linked. No value is synthesized for Arm or another missing
implementation. A memory-operand lower-bound result is not shown as zero DRAM
latency.

[Chester Lam’s Lion Cove analysis](https://chipsandcheese.com/p/analyzing-lion-coves-memory-subsystem)
records Core Ultra 9 285K and Ryzen 9 9900X with different DIMMs and PMU
populations. The lab draws an original qualitative population schematic, not a
copied chart or cross-platform latency ratio. The author’s interpretation remains
separate from reported observations. Native whole-trial nanoseconds, instruction
chain core cycles and process-wide counters never share an implied denominator.

Hierarchy, L1 lookup and performance chapters link mechanism → published boundary
→ native experiment. The existing memory/MLP, sharing, loaded-latency, VM and
prefetch kernels remain the way to reproduce observations on the actual host.

## Detailed models and historical content

The core plate reads `PipeSim.CAP` and draws one cell per selected model entry;
its instruction-group and µop accounting match the engine. The package map is a
chosen four-core/two-channel topology. The L1 plate uses chosen 32 KiB / eight-way
geometry and parallel tag lookup. None claims undocumented hardware dimensions.

The page-table example identifies x86-64, 48-bit VA, four levels and 4 KiB pages.
The DRAM plate identifies DDR4 x8/BL8 plus chosen timing, subarray and address-map
parameters. ISA/standard formats are scoped facts; synthetic addresses and timing
are teaching inputs. Other lab models retain their explicit finite-resource,
replacement, ownership, controller, VM, I/O, NUMA and reliability boundaries.

Historical Zen/Zen+ way prediction remains an [academic case](https://misc0110.net/files/takeaway.pdf)
from the paper’s tested 2011–2019 AMD implementations. The generic cache plate does
not implement or extrapolate that predictor. Intel E5 v4 / Skylake-SP inclusion
is a historical vendor-documented contrast; it does not establish Granite Rapids
replacement, admission or inclusion.

Optional contributed bundles have recorded identities; no shipped machine is
architectural truth. The compatibility output filename and legacy Ryzen identity
flag remain deliberate provenance/compatibility mechanisms. See
[the aggregate contract](MEASUREMENT_BUNDLES.md) and
[optional curation](../data/reference/README.md).
