# Real chips and where the numbers come from

The lab runs every simulation on one small example machine: four cores, a 32 KiB
8-way L1d and a 512 KiB L2 per core, a 4 MiB L3 shared by all four, and two DDR4
channels. It is small so every structure fits on screen, and it copies no
particular chip. Real chips appear in two places:

- **Chapter 09, "Real chips"**: a comparison table and one package diagram each
  for AMD EPYC 9005 (Zen 5), Intel Xeon 6900P (P-cores) and Arm Neoverse V3 /
  CSS V3, plus published measurements and two older designs worth knowing.
- **Short notes in the chapters**: for example L1d, TLB and ROB sizes on Zen 5,
  Golden Cove and Neoverse V3, the DDR5 burst shape, and which coherence
  protocol each vendor uses.

Simulations never read these numbers. The latency settings (the ≋ button) are
round example values the reader can change.

## The seven labels

The Start page explains each label; the list lives in
`src/03_architecture_evidence.js` (`App.Evidence.labels`) and
`src/03_implementation_cases.js` (`categories`).

| Label | Means |
|---|---|
| Simulation | A small model with made-up sizes and timings, built to show one mechanism. |
| Vendor docs | Stated in AMD, Intel or Arm documentation for a named product. |
| Peer-reviewed | From a published paper, for the chips and conditions it tested. |
| Published measurement | Measured by an independent tester on named hardware. |
| Your machine | Measured by the lab's benchmarks on the reader's computer. |
| Inference | Reasoned from the facts above it, not measured or documented. |
| Not published | The vendor hasn't said; the lab says so instead of guessing. |

## Rules for adding a chip fact

1. Name the product and generation (for example "AMD EPYC 9005, Zen 5"), not
   just the vendor.
2. Link the source in the section's **Sources** line. Prefer vendor documents;
   use independent measurements (Chips and Cheese, uops.info, Jiajie Chen's
   notes) when vendors don't publish a number, and say it was measured.
3. If nobody publishes a value, write that, and leave it out of diagrams.
4. Don't copy vendor die shots or charts. The package diagrams are drawn from the
   text of the sources and are not to scale.
5. Never feed a published number into a simulation's defaults.

## Sources used for the comparison

Checked 7 October 2026.

| Chip | Main sources |
|---|---|
| AMD EPYC 9005, Zen 5 | [AMD EPYC 9005 white paper](https://docs.amd.com/v/u/en-US/5th-gen-amd-epyc-processor-architecture-white-paper), [AMD at Hot Chips 2024](https://www.hc2024.hotchips.org/assets/program/conference/day2/24_HC2024.AMD.Cohen.Subramony.final.pdf), [SUSE tuning guide](https://documentation.suse.com/sbp/tuning-performance/single-html/SBP-AMD-EPYC-5-SLES15SP6/) |
| Intel Xeon 6900P | [Intel tuning guide 858491](https://www.intel.com/content/www/us/en/content-details/858491/intel-xeon-6-with-p-cores-configuration-and-tuning-guide-for-hpc-applications.html), [The Next Platform](https://www.nextplatform.com/2024/09/24/intel-shoots-granite-rapids-xeon-6-into-the-datacenter/), [Chips and Cheese on Redwood Cove](https://chipsandcheese.com/p/intels-redwood-cove-baby-steps-are-still-steps) |
| Arm Neoverse V3 | [Neoverse V3 optimization guide](https://documentation-service.arm.com/static/6734eb2627eda361ad4da4f4), [CSS V3](https://arm.com/products/neoverse-compute-subsystems/css-v3), [Jiajie Chen's V3 notes](https://jia.je/hardware/2026/06/13/arm-neoverse-v3/index.md) |
| Coherence protocols | [AMD64 APM vol. 2 (MOESI)](https://web.archive.org/web/20170619232736/http://developer.amd.com/wordpress/media/2012/10/24593_APM_v21.pdf#page=217), [Goodman and Hum, MESIF](https://www.cs.auckland.ac.nz/~goodman/TechnicalReports/MESIF-2009.pdf), [gem5 CHI states](https://www.gem5.org/documentation/general_docs/ruby/CHI/) |

Published measurements in chapter 09 come from
[uops.info](https://uops.info/html-instr/MOV_R64_M64.html) (L1 load-to-use on
Zen 5 and Arrow Lake-P; the exact CPU model isn't given, so the lab says so) and
[Chips and Cheese on Lion Cove](https://chipsandcheese.com/p/analyzing-lion-coves-memory-subsystem)
(why AMD and Intel miss counts can't be divided into a ratio).

## Shipped results

Result bundles in `data/reference/` keep the CPU identity they were recorded
with; none is treated as the reference machine. See
[the bundle format](MEASUREMENT_BUNDLES.md) and
[dataset curation](../data/reference/README.md).
