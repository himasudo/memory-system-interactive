# Architecture dependency inventory

Baseline: PR #7 commit `c9dc763b6c7578624534ba5754fc27e954e1b4a2`. Inventory was collected before content edits. This is repositioning, not another audit.

Search covers all tracked repository files, including generated HTML, sources, glossary, Atlas, documentation, native runners and tests. Patterns: `Zen+`, `Zen`, `3750H`, `Family 17h`, `primary reference`, `reference machine`, `Neoverse`, `Skylake`, `Haswell`. Numeric dependencies were additionally inspected in the core/map/array/hierarchy/translation plates and pipeline metadata.

| Category | Meaning |
|---|---|
| 1 | Generic mechanism merely labelled Zen+ |
| 2 | Genuinely Zen+-specific fact |
| 3 | Historical architecture case study |
| 4 | Teaching-model assumption |
| 5 | Diagram dependency |
| 6 | Benchmark/reference-machine plumbing |
| 7 | Measurement from a particular machine |
| 8 | Wording/branding only |

## Decisions before editing

- Foundation: mechanisms; explicit x86-64 four-level translation and DDR4 examples remain implementation/standard lenses, not universal formats.
- Core: use the existing instruction model’s 24 ROB, 48 physical-register, 8 instruction-buffer, 16 ALU-scheduler, 12 AGU-scheduler, 10 load, 8 store and 4 miss entries. Redraw cells rather than relabel historical queues. Keep simulation rules unchanged.
- Map: four cores, optional two-way SMT, 32 KiB L1d / 512 KiB L2 / 4 MiB shared victim cache and two DDR4 channels become declared teaching geometry. Remove GPU product identity and undocumented walker/queue limits.
- Atlas: core and L1d plates become mechanism plates; translation retains an explicit x86-64 scope; DDR4 is a standard-specific mechanism; serialized end-to-end timing remains a teaching composition. Add original, cited implementation schematics separately.
- Modern cases selected for evidence and lesson: AMD EPYC 9005 Zen 5 chiplet/cache domains, Intel Xeon 6 P-core Granite Rapids compute/memory tiles, Arm Neoverse V3 private unified L2 and translation/PMU scope. No undocumented queues are imported.
- External evidence: separate vendor facts, academic methods, independent measurements, local bundles, inference, models and unknowns. Source/model/method/limits travel with each claim; numerical charts use one source/encoding/boundary.
- Measured data: preserve the aggregate format and compatibility identity fields; optional registry entries identify any measured CPU. Keep `results/reference-machine.json` as a legacy output filename only; no public Ryzen file is implicitly required.
- No particular-machine measurement is committed in this baseline. Imported identity/trials remain untouched; fixture data is explicitly synthetic.
- Audit and implementation logs are historical records. Their dated architecture wording is retained and identified here, not silently rewritten.

## Atlas plate review

| Plate | Classification | Action |
|---|---|---|
| Core | Needs replacement → mechanism | Existing model capacities; ready/dependency/retirement paths and miss backpressure |
| L1d arrays | Mechanism with historical dependency | Explicit 32 KiB/8-way teaching geometry; lookup strategies separated from researched way prediction |
| Page walk | Implementation-specific ISA example | Label x86-64, 48-bit VA, four levels, 4 KiB leaf; link Arm granule experiment |
| DDR4 chip | Standard-specific mechanism | Label DDR4 x8/BL8 and chosen mapping/timing; retain circuit detail |
| End-to-end | Mechanism / teaching model | Preserve serialized stages and dependency overlay; chosen timings are not measurements |
| New case schematics | Implementation-specific | Exact generation, sources, uncertainty boundary; no copied vendor/benchmark artwork |

## Every pre-edit match

Line numbers below refer to the baseline, not the edited files. Generated matches are grouped because each is a deterministic mirror of a source occurrence.

### AUDIT.md

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 25 | 3 | - Which behavior is universal versus specific to Zen+ or another implementation? | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 530 | 3 | Do not overspecify undocumented Zen+ internals; present generic mechanisms and label implementation-specific b | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 610 | 3 | ## 11. SMT on the Reference Machine | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 612 | 3 | The reference Ryzen 7 3750H is 4C/8T. | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 959 | 3 | Do not claim this is Zen+’s exact proprietary scheduler. | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 1204 | 3 | Keep the Zen+ machine’s real 4-level translation as the main reference. | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 1279 | 3 | Do not falsely imply the reference machine has a topology it does not have. | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 1433 | 3 | ## 45. Keep Zen+ as the Anchor | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 1435 | 3 | Do not remove Zen+ specificity. | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 1437 | 3 | Use Zen+ as: | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 1439 | 3 | - the concrete reference machine | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 1482 | 3 | Zen+ implementation | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 1498 | 3 | - **Zen+ implementation** | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 1828 | 3 | 1. formal Zen+ anchor | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 1858 | 3 | > a detailed Zen+ memory hierarchy tutorial | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 1866 | 3 | > **Use a real Zen+ machine as the primary experimental specimen to teach universal computer-architecture and  | Preserve the completed audit/implementation history; current positioning is documented separately. |

### README.md

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 3 | 8 | > An interactive architecture atlas, finite-resource simulator and native performance lab, anchored on a real  | Replace primary identity with Memory Systems Lab and mechanism/evidence/experiment entry points. |
| 49 | 8 |  /  ref  /  **Atlas**  /  Every full-width plate on one page: DRAM chip, L1d arrays, page walk, Zen+ core, end | Replace primary identity with Memory Systems Lab and mechanism/evidence/experiment entry points. |
| 122 | 8 | --notes "Ryzen 7 3750H reference run; Ubuntu 24.04; normal idle system" | Replace primary identity with Memory Systems Lab and mechanism/evidence/experiment entry points. |
| 129 | 8 | results/reference-machine.json data/reference/ryzen7-3750h.json | Replace primary identity with Memory Systems Lab and mechanism/evidence/experiment entry points. |
| 141 | 8 | The site automatically reads 'data/reference/ryzen7-3750h.json' if a curated | Replace primary identity with Memory Systems Lab and mechanism/evidence/experiment entry points. |
| 142 | 8 | bundle is committed there. Only an identified Ryzen 7 3750H bundle is accepted as | Replace primary identity with Memory Systems Lab and mechanism/evidence/experiment entry points. |
| 306 | 8 | fault/mapping observations. Phase 5 adds an evidence-scoped Zen+ profile, | Replace primary identity with Memory Systems Lab and mechanism/evidence/experiment entry points. |
| 325 | 8 | Zen+ on the Ryzen 7 3750H remains the concrete reference. Addresses are synthetic; | Replace primary identity with Memory Systems Lab and mechanism/evidence/experiment entry points. |
| 329 | 8 | hardware do not validate any 3750H latency or undocumented microarchitecture. | Replace primary identity with Memory Systems Lab and mechanism/evidence/experiment entry points. |

### benchmarks/README.md

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 58 | 6 | model/vendor/family/model provenance, and never calls a generic host 3750H data. | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 70 | 6 | --notes "Ryzen 7 3750H reference run; Ubuntu 24.04; normal idle system" | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 112 | 6 | results/reference-machine.json data/reference/ryzen7-3750h.json | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 144 | 6 | On GitHub Pages, a committed 'data/reference/ryzen7-3750h.json' is read | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 170 | 6 | sysfs presence. No generic 'perf mem' latency is substituted for a verified Zen+ | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 175 | 6 | and the primary references below. | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 186 | 6 | are native C workloads, not browser timing benchmarks and not a calibrated Zen+ | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 187 | 6 | simulator. Record the actual CPU; results from another machine are not 3750H data. | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 265 | 6 | hardware and kernels; not every newer IBS field or filter exists on Zen+. 'perf | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 275 | 6 | Primary references: | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 279 | 6 | - [AMD Family 17h optimization guide 55723](https://docs.amd.com/v/u/en-US/55723_3.01) — verify model applicab | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 297 | 6 | includes one-thread baselines. A 3750H has four physical cores, so eight logical | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 363 | 6 | 3750H's logical CPU enumeration. The first CPU runs a randomized dependent ring; | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 478 | 6 | For Zen+/Intel/Arm comparisons, compile for each actual target with recorded | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |

### benchmarks/advanced/README.md

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 5 | 6 | contains no new measurements of the Ryzen 7 3750H and no cross-vendor leaderboard. | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |

### benchmarks/export_public.py

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 267 | 6 | if args.output.name == "ryzen7-3750h.json" and not target_machine(bundle.get("machine", {})): | Retain explicit legacy identity validation and named-file protection for compatible bundles; do not require this CPU for general datasets. |
| 268 | 6 | raise ValueError("The named Ryzen reference requires recorded Ryzen 7 3750H identity.") | Retain explicit legacy identity validation and named-file protection for compatible bundles; do not require this CPU for general datasets. |

### benchmarks/litmus/README.md

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 43 | 6 | of the target CPU's ordering or performance. No real 3750H or Arm litmus results | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |
| 54 | 6 | Primary references: | Preserve native/evidence infrastructure; make curation generic and keep hardware-specific IBS guidance scoped. |

### benchmarks/workflow.py

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 158 | 6 | return bool(re.search(r"\bAMD Ryzen 7 3750H(?:\s / $)", machine.get("cpu_model", ""), re.I) | Retain explicit legacy identity validation and named-file protection for compatible bundles; do not require this CPU for general datasets. |
| 182 | 6 | machine["is_ryzen_7_3750h"] = target_machine(machine) | Retain explicit legacy identity validation and named-file protection for compatible bundles; do not require this CPU for general datasets. |
| 334 | 6 | if machine.get("is_ryzen_7_3750h") != target_machine(machine): | Retain explicit legacy identity validation and named-file protection for compatible bundles; do not require this CPU for general datasets. |

### data/reference/README.md

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 3 | 6 | The site reads 'data/reference/ryzen7-3750h.json' automatically when present. | Use an optional measured-machine registry with exact recorded identities; no architecture is required. |
| 8 | 6 | On the actual Ryzen 7 3750H Linux machine: | Use an optional measured-machine registry with exact recorded identities; no architecture is required. |
| 12 | 6 | --notes "Ryzen 7 3750H reference run; Ubuntu 24.04; normal idle system" | Use an optional measured-machine registry with exact recorded identities; no architecture is required. |
| 17 | 6 | be intact, and CPU identification should be AMD Ryzen 7 3750H, AuthenticAMD, | Use an optional measured-machine registry with exact recorded identities; no architecture is required. |
| 33 | 6 | results/reference-machine.json data/reference/ryzen7-3750h.json | Use an optional measured-machine registry with exact recorded identities; no architecture is required. |

### docs/IMPLEMENTATION.md

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 38 | 3 |  /  4: mmap, demand-zero, COW, page cache, huge pages (28–31, 33–34)  /  '04_found_b' VM, '13_ch03_translate'  | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 40 | 3 |  /  5: Zen+ anchor, selective Intel/ARM lenses, fidelity (45–47)  /  sources, map, config; relevant chapter ca | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 50 | 3 | a Zen+ memory-controller scheduler. Actual DDR command scheduling belongs to | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 51 | 3 | Phase 3. Model capacities must never be presented as measured Zen+ capacities. | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 64 | 3 | a harness smoke check, never a Ryzen 7 3750H calibration. | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 102 | 3 | Hardware validation on the reference Ryzen 7 3750H remains a separate gate. | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 125 | 3 |  /  Splits / SIMD width  /  Exact byte coverage for 1–64-byte accesses across 64-byte lines and 4 KiB pages; p | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 143 | 3 | Remaining hardware gate: run representative trials on the actual Ryzen 7 3750H, | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 145 | 3 | claimed as Zen+ evidence. Cache inclusion/vendor topology comparisons belong to | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 155 | 3 | channel coordinates, and no claimed Zen+ address mapping or scheduler. | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 171 | 3 | retains raw trials. No hardware output is bundled or labeled as a 3750H result. | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 210 | 3 | NUMA clocks, topology and bandwidth are chosen. No new proprietary Zen+ walker | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 226 | 3 | measurement on the actual 3750H remains an external gate; development smoke | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 238 | 3 |  /  Formal Zen+ anchor  /  '#map/reference': exact-product facts, externally reported family observations, inf | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 240 | 3 |  /  Intel / Arm contrasts  /  Ordinary x86 WB ordering versus selected AArch64 cases; E5 v4 inclusive versus S | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 255 | 3 | 44-entry load-queue reference conflicts with the external Zen notes' 72; it is | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 256 | 3 | now unresolved for the 3750H rather than silently treated as a product fact. | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 291 | 3 |  /  Modern CPU/chiplet contrasts  /  '#map/chiplets': AMD EPYC CCD/IOD/cache-versus-NUMA domains, Intel mesh/C | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 297 | 3 | chosen equal-delta rules, not an adaptive Zen+ policy. Shared-request accounting | Preserve the completed audit/implementation history; current positioning is documented separately. |
| 380 | 3 | 3750H dataset is invented; curation is documented in 'data/reference/README.md'. | Preserve the completed audit/implementation history; current positioning is documented separately. |

### docs/MEASUREMENT_BUNDLES.md

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 11 | 6 |  /  'machine.is_ryzen_7_3750h'  /  Derived from AMD model name, vendor, family 23 and model 24; rechecked by t | Use an optional measured-machine registry with exact recorded identities; no architecture is required. |
| 48 | 6 | 'data/reference/ryzen7-3750h.json'; they also require the derived target identity. | Use an optional measured-machine registry with exact recorded identities; no architecture is required. |

### memory_end_to_end.html

131 generated matching lines; category 5. Rebuild from canonical sources.

### shell.html

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 159 | 8 | <span><strong>Memory systems lab</strong><small>interactive hardware atlas · Zen+</small></span> | Replace primary identity with Memory Systems Lab and mechanism/evidence/experiment entry points. |
| 165 | 8 | <div class="machine-meta">Ryzen 7 3750H · 4C / 8T<br>interactive model + measured inputs</div> | Replace primary identity with Memory Systems Lab and mechanism/evidence/experiment entry points. |

### src/00_core.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 40 | 8 | /* ---------- representative unloaded inputs, not a measured 3750H calibration ---------- */ | Reposition navigation/start/settings; distinguish teaching parameters from any measured inputs. |
| 445 | 5 | var intro=sec.querySelector('.core-intro'); makeDisclosure(intro,'How the model works','What the model assumes | Reposition navigation/start/settings; distinguish teaching parameters from any measured inputs. |
| 687 | 5 | {id:'real',title:'The real core, at real sizes',copy:'Every Zen+ queue at its published size, with one loop it | Reposition navigation/start/settings; distinguish teaching parameters from any measured inputs. |
| 703 | 5 | {id:'arrays',title:'The arrays, to scale',copy:'Tag and data SRAM drawn to one bit scale, with the Zen+ way pr | Reposition navigation/start/settings; distinguish teaching parameters from any measured inputs. |
| 735 | 8 | {id:'known',title:'What is known',copy:'What this model assumes, and what AMD publishes about Zen+ prefetchers | Reposition navigation/start/settings; distinguish teaching parameters from any measured inputs. |
| 855 | 8 | ['ghz', 'Core clock (GHz)', '3750H max boost is 4.0; base 2.3'], | Reposition navigation/start/settings; distinguish teaching parameters from any measured inputs. |
| 862 | 8 | var html = '<h2>Latency model</h2><p class="note">Representative unloaded inputs, informed by <a href="https:/ | Reposition navigation/start/settings; distinguish teaching parameters from any measured inputs. |

### src/01_glossary.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 7 | 2 | d('mop','macro-op','AMD\'s tracking unit between x86 instructions and µops. On Zen a macro-op can carry a load | Define the mechanism generically; retain explicit historical examples only when useful. |
| 12 | 2 | d('l1i','L1i','Level-1 instruction cache. 64 KB, 4-way on Zen+. Fetch reads 32 bytes per cycle from it.'); | Define the mechanism generically; retain explicit historical examples only when useful. |
| 14 | 2 | d('fetchwin','fetch window','The aligned block of bytes fetch reads in one cycle (32 bytes on Zen+). Instructi | Define the mechanism generically; retain explicit historical examples only when useful. |
| 16 | 2 | d('decode','decode','Translates x86 instructions into macro-ops / µops. Zen+ decodes up to 4 x86 instructions  | Define the mechanism generically; retain explicit historical examples only when useful. |
| 17 | 2 | d('opcache','op cache','A cache of already-decoded µops, keyed by instruction address. A hit skips predecode a | Define the mechanism generically; retain explicit historical examples only when useful. |
| 19 | 2 | d('fusion','macro-fusion','Merging a compare/test with the following conditional jump into one operation. On Z | Define the mechanism generically; retain explicit historical examples only when useful. |
| 27 | 2 | d('prf','PRF','Physical register file: the actual storage for register values. Zen+ has 168 integer entries; e | Define the mechanism generically; retain explicit historical examples only when useful. |
| 30 | 2 | d('rob','ROB / retire queue','Reorder buffer: an in-order circular buffer of every in-flight instruction. Inst | Define the mechanism generically; retain explicit historical examples only when useful. |
| 31 | 2 | d('sched','scheduler','A queue of waiting µops that watches for their source operands to become ready and pick | Define the mechanism generically; retain explicit historical examples only when useful. |
| 34 | 2 | d('port','execution port','An entry point into a functional unit. Zen+ integer side: 4 ALU ports and 2 AGU por | Define the mechanism generically; retain explicit historical examples only when useful. |
| 39 | 2 | d('lq','load queue','Holds every in-flight load in program order until it retires. 44 entries on Zen+.'); | Define the mechanism generically; retain explicit historical examples only when useful. |
| 40 | 2 | d('sq','store queue / store buffer','Holds every in-flight store (address + data) in program order. Before ret | Define the mechanism generically; retain explicit historical examples only when useful. |
| 51 | 2 | d('smt','SMT','Simultaneous multithreading: two hardware threads share one core\'s pipeline and caches. Your 3 | Define the mechanism generically; retain explicit historical examples only when useful. |
| 71 | 2 | d('waypred','way predictor (\u00b5tag)','AMD\u2019s L1d guesses which way holds a line from a \u00b5tag, a sma | Define the mechanism generically; retain explicit historical examples only when useful. |
| 73 | 2 | d('incl','inclusive cache','A cache that holds a copy of every line held by the smaller caches above it. Zen+\ | Define the mechanism generically; retain explicit historical examples only when useful. |
| 74 | 2 | d('victimc','victim cache','A cache filled only with lines evicted from the level above. Zen+\'s L3 is filled  | Define the mechanism generically; retain explicit historical examples only when useful. |
| 77 | 2 | d('ccx','CCX','Core complex: a group of up to four Zen cores sharing one L3. Your 3750H has one CCX with 4 MB  | Define the mechanism generically; retain explicit historical examples only when useful. |
| 78 | 2 | d('mlp','memory-level parallelism','Having several cache misses outstanding at once so their latencies overlap | Define the mechanism generically; retain explicit historical examples only when useful. |
| 93 | 2 | d('dtlb','DTLB','Data TLB. Zen+: 64-entry fully associative L1 DTLB (all page sizes) backed by a 1536-entry L2 | Define the mechanism generically; retain explicit historical examples only when useful. |
| 98 | 2 | d('pwc','page-walk cache','Caches upper-level page-table entries so a walk can skip levels. Published measurem | Define the mechanism generically; retain explicit historical examples only when useful. |
| 107 | 2 | d('channel','memory channel','An independent 64-bit data bus plus command/address bus to a set of DIMMs. The R | Define the mechanism generically; retain explicit historical examples only when useful. |

### src/02_sources.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 6 | 3 | zen: ['AMD Family 17h optimization guide (scope is not every Zen+ model)', 'https://docs.amd.com/v/u/en-US/557 | Retain historical source links for scoped cases; redirect generic terms to ISA/modern primary documentation. |
| 7 | 3 | zen7: ['AMD Zen: cache and TLB measurements', 'https://www.7-cpu.com/cpu/Zen.html', '7-cpu'], | Retain historical source links for scoped cases; redirect generic terms to ISA/modern primary documentation. |
| 27 | 3 | isa: [W('Instruction_set_architecture'), S.sdm], uop: [W('Micro-operation'), S.agner], mop: [S.zen, S.agner],  | Retain historical source links for scoped cases; redirect generic terms to ISA/modern primary documentation. |
| 29 | 3 | l1i: [W('CPU_cache'), S.zen], itlb: [W('Translation_lookaside_buffer'), S.zen], fetchwin: [S.agner, S.zen, S.z | Retain historical source links for scoped cases; redirect generic terms to ISA/modern primary documentation. |
| 30 | 3 | decode: [W('Instruction_pipelining'), S.agner], opcache: [S.agner, S.zen], uq: [S.agner, S.zen], fusion: [S.ag | Retain historical source links for scoped cases; redirect generic terms to ISA/modern primary documentation. |
| 33 | 3 | dispatch: [W('Out-of-order_execution'), S.zen], rob: [W('Re-order_buffer'), S.zen], sched: [W('Reservation_sta | Retain historical source links for scoped cases; redirect generic terms to ISA/modern primary documentation. |
| 36 | 3 | lsu: [W('Load%E2%80%93store_unit', 'Load\u2013store unit'), S.boom], lq: [W('Memory_disambiguation'), S.zen, S | Retain historical source links for scoped cases; redirect generic terms to ISA/modern primary documentation. |
| 45 | 3 | incl: [W('Cache_inclusion_policy')], victimc: [W('Victim_cache'), S.zen], shadow: [S.zen], pfilter: [W('Cache_ | Retain historical source links for scoped cases; redirect generic terms to ISA/modern primary documentation. |
| 49 | 3 | mmu: [W('Memory_management_unit')], tlb: [W('Translation_lookaside_buffer')], dtlb: [W('Translation_lookaside_ | Retain historical source links for scoped cases; redirect generic terms to ISA/modern primary documentation. |
| 53 | 3 | fabric: [S.fabric, S.zen], umc: [W('Memory_controller')], channel: [W('Multi-channel_memory_architecture'), W( | Retain historical source links for scoped cases; redirect generic terms to ISA/modern primary documentation. |

### src/03_architecture_evidence.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 3 | 2 | product:['AMD Ryzen 7 3750H specifications','https://www.amd.com/en/support/downloads/drivers.html/processors/ | Move verified product/history facts out of the foundational contract; add sourced modern cases. |
| 4 | 2 | family:['AMD Family 17h optimization guide 55723, revision 3.01','https://docs.amd.com/v/u/en-US/55723_3.01'], | Move verified product/history facts out of the foundational contract; add sourced modern cases. |
| 5 | 2 | measurements:['7-cpu Zen observations and reference notes','https://www.7-cpu.com/cpu/Zen.html'], | Move verified product/history facts out of the foundational contract; add sourced modern cases. |
| 15 | 2 | {kind:'Documented fact',claim:'Ryzen 7 3750H / Picasso: four cores, eight threads; 384 KB aggregate L1, 2 MB a | Move verified product/history facts out of the foundational contract; add sourced modern cases. |
| 17 | 2 | {kind:'Measured / reverse-engineered',claim:'External Zen-family notes report simple L1 loads around 4 cycles, | Move verified product/history facts out of the foundational contract; add sourced modern cases. |
| 19 | 4 | {kind:'Teaching approximation',claim:'Small queues, LRU policies, serial stages, synthetic addresses and the n | Separate selected model values and undocumented limits; no inferred hardware capacities. |
| 20 | 4 | {kind:'Unknown / implementation-dependent',claim:'The legacy core reference displayed a 44-entry load queue; 7 | Separate selected model values and undocumented limits; no inferred hardware capacities. |
| 21 | 2 | {kind:'Unknown / implementation-dependent',claim:'Legacy 50 L2→L3 / 96 L3→memory limits, exact walker count, S | Move verified product/history facts out of the foundational contract; add sourced modern cases. |
| 22 | 4 | {kind:'Unknown / implementation-dependent',claim:'The old 20.8-TSC-tick branch-misprediction figure has no sup | Separate selected model values and undocumented limits; no inferred hardware capacities. |

### src/04_found_a.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 92 | 8 | 'The reference machine is an AMD Ryzen 7 3750H: four Zen+ cores with two threads each, a 32 KB L1 data cache a | Reposition navigation/start/settings; distinguish teaching parameters from any measured inputs. |
| 94 | 8 | ], {h: 120, cap: 'Capacity per level on the Ryzen 7 3750H. Each level is larger and slower than the one before | Reposition navigation/start/settings; distinguish teaching parameters from any measured inputs. |

### src/04_found_b.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 20 | 4 | 'An integer multiply on Zen+ has a latency of 3 cycles, yet once the pipeline is full, one multiply finishes e | Keep illustrative arithmetic and four-core geometry as explicit model choices, without vendor identity. |
| 118 | 4 | 'Each Zen+ core has a 32 KB L1 data cache and a 512 KB L2. The four cores share a 4 MB L3. A load checks the L | Keep illustrative arithmetic and four-core geometry as explicit model choices, without vendor identity. |
| 209 | 4 | 'The Ryzen 7 3750H has four cores. Each runs its own instruction stream and has its own L1 and L2 caches, yet  | Keep illustrative arithmetic and four-core geometry as explicit model choices, without vendor identity. |

### src/04_shared_plates.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 206 | 5 | R(sv, 20, 136, 230, 124, 'box on', 8); T(sv, 30, 156, 'Way predictor (Zen+)', {size: 11, weight: 650, fill: 'v | Rebuild generic core/map capacities and policies as teaching parameters; scope x86 page tables and DDR4 explicitly. |
| 227 | 5 | R(sv, 760, yb + 30, 10, 8, 'box on', 1); T(sv, 774, yb + 38, 'Zen+: the predicted way only (1 tag + 64 B)', {s | Rebuild generic core/map capacities and policies as teaching parameters; scope x86 page tables and DDR4 explicitly. |
| 336 | 5 | /* ---------- plate 5: the Zen+ core at real sizes ---------- */ | Rebuild generic core/map capacities and policies as teaching parameters; scope x86 page tables and DDR4 explicitly. |
| 339 | 5 | caption: 'Every queue drawn with its published Zen+ size, one cell per entry. The amber cells are one iteratio | Rebuild generic core/map capacities and policies as teaching parameters; scope x86 page tables and DDR4 explicitly. |
| 348 | 5 | head(sv, 20, 26, 'Zen+ core, one cell per entry'); | Rebuild generic core/map capacities and policies as teaching parameters; scope x86 page tables and DDR4 explicitly. |

### src/05_ch00_map.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 4 | 5 | points: ['Click a block to see its role and the scope of its reference values.', 'Each block links to the chap | Rebuild generic core/map capacities and policies as teaching parameters; scope x86 page tables and DDR4 explicitly. |
| 13 | 5 | core0: ['Core 0 (and cores 1\u20133)', 'An out-of-order Zen+ core with 2 SMT threads. Front end: branch predic | Rebuild generic core/map capacities and policies as teaching parameters; scope x86 page tables and DDR4 explicitly. |
| 16 | 5 | lsu: ['Load/store unit + L1d', 'Load-queue capacity unresolved (legacy 44; Zen reference notes report 72), rep | Rebuild generic core/map capacities and policies as teaching parameters; scope x86 page tables and DDR4 explicitly. |
| 19 | 5 | l3: ['L3 cache (shared by the CCX)', '4 MB, 16-way on the Ryzen 7 3750H. A victim cache: filled with lines evi | Rebuild generic core/map capacities and policies as teaching parameters; scope x86 page tables and DDR4 explicitly. |
| 40 | 5 | lbl(24, 32, 'Ryzen 7 3750H package \u2014 "Picasso" APU, one die', 'h'); | Rebuild generic core/map capacities and policies as teaching parameters; scope x86 page tables and DDR4 explicitly. |

### src/06_ch01_code.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 24 | 4 | what: 'Flags from rdi \u2212 rsi: has the data pointer reached the end pointer?', uops: [['ALU', 'ALU', 'rdi,  | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 69 | 4 | lay.innerHTML = '<h3>The same bytes in memory</h3><p>The whole function fits in one 64-byte ' + g('line', 'cac | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/09_performance_model.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 1 | 4 | /* Pure Phase 1 models. Capacities/policies are teaching assumptions, not Zen+ internals. */ | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 65 | 4 | ROB control counts bodies, not physical Zen ROB entries or fused µops. */ | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/11_pipeline.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 19 | 4 | sizes.innerHTML = '<h3>Model sizes and reported Zen-family references</h3><p>Structures are scaled down so eve | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/12_cache_lab_models.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 1 | 4 | /* Phase 2: independent, deterministic teaching models. No proprietary Zen policies. */ | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 66 | 4 | if(!p.addressKnown){mechanism=lowMatch?'Lower 12 address bits match; full-address comparison is pending.':'Old | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 70 | 4 | else{mechanism=contains?'Byte coverage crosses a cache-line boundary.':'Partial overlap: a single store does n | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/12_controller_model.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 2 | 4 | there is no physical-address decoder or proprietary Zen+ scheduler here. */ | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/13_ch03_translate.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 288 | 4 | reach.innerHTML = '<h3>' + g('reach', 'TLB reach') + ' · reported Zen-family reference</h3><table class="mt">< | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/13_measurement_bundle.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 9 | 6 | function target(m){var d=m.cpu_details /  / {};return /\bAMD Ryzen 7 3750H(?:\s / $)/i.test(m.cpu_model)&&d.ve | Retain explicit legacy identity validation and named-file protection for compatible bundles; do not require this CPU for general datasets. |
| 27 | 6 | require(m.is_ryzen_7_3750h===target(m),'Target-machine claim disagrees with CPU identification.'); | Retain explicit legacy identity validation and named-file protection for compatible bundles; do not require this CPU for general datasets. |

### src/14_ch04_l1d.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 128 | 3 | /* Zen+ way predictor (\u00b5tag): lights during steps 2-3 */ | Make parallel lookup the generic walkthrough; retain the researched Zen/Zen+ way predictor as a historical academic case. |
| 217 | 3 | if (ph === 'read'){ f.t = 'Step 2: read the set (textbook) or one way (Zen+)'; f.d = 'The decoder raises wordl | Make parallel lookup the generic walkthrough; retain the researched Zen/Zen+ way predictor as a historical academic case. |
| 218 | 3 | if (ph === 'compare'){ f.t = 'Step 3: eight tag compares in parallel'; f.d = 'Eight comparators check PA tag 0 | Make parallel lookup the generic walkthrough; retain the researched Zen/Zen+ way predictor as a historical academic case. |
| 263 | 3 | E.wpT2.textContent = wpOn ? (r.hit ? 'Zen+: 1 of 8 ways read' : 'handled as a miss') : 'Zen+ only (step 2)'; | Make parallel lookup the generic walkthrough; retain the researched Zen/Zen+ way predictor as a historical academic case. |

### src/15_ch05_hier.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 85 | 4 | F('L2 miss', 'L2 lookup: miss', 'Set ' + l2set + ', 8 tags, no match. The L2 has its own miss tracking. The le | Make inclusion/victim admission, set geometry and link widths chosen policies; remove unverified 50/96 limits. |
| 88 | 4 | F('move up', 'The line moves up, a victim moves down', 'The line goes to core 0\u2019s L2 and L1d. Because the | Make inclusion/victim admission, set geometry and link widths chosen policies; remove unverified 50/96 limits. |
| 94 | 4 | F('fabric', 'Fabric to the memory controller', 'The fabric routes by physical address to the memory controller | Make inclusion/victim admission, set geometry and link widths chosen policies; remove unverified 50/96 limits. |
| 129 | 4 | cap.innerHTML = 'Representative unloaded inputs from the latency settings, informed by external measurements a | Make inclusion/victim admission, set geometry and link widths chosen policies; remove unverified 50/96 limits. |
| 148 | 4 | mcap.innerHTML = '<p>Independent addresses are all known up front, so the core issues the four loads within a  | Make inclusion/victim admission, set geometry and link widths chosen policies; remove unverified 50/96 limits. |

### src/19_ch09_prefetch.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 10 | 4 | h('div', {'class': 'card'}, intro, '<h3>What is not published</h3><p>Zen+ has hardware prefetchers at the L1d  | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/21_ch11a_performance.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 8 | 4 | amd:['AMD Family 17h optimization guide, 55723','https://docs.amd.com/v/u/en-US/55723_3.01'], | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 37 | 4 | var e=h('div',{'class':'evidence-contract'},parent);badge(e,'Zen+ reference · evidence contract'); | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 38 | 4 | text('p',e,'The reference machine remains the Ryzen 7 3750H. Addresses and page mappings are synthetic example | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 40 | 4 | ['Documented fact','An architectural or vendor statement, with scope and a source. The Family 17h guide is not | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 41 | 4 | ['Measured / reverse-engineered','A result tied to a CPU, code, method and conditions. The existing 7-cpu late | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 72 | 4 | text('p',root,'Each loop body has one 8-byte load to a distinct 64-byte line plus three abstract non-memory in | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 162 | 4 | text('p',detail,'Cache latencies are the configured representative unloaded load-to-use inputs, not per-hop de | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/21_ch11b_atlas.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 8 | 5 | ['l1d', 'The L1d arrays, to scale', 'Tag and data SRAM at one bit scale, with the Zen+ way predictor.'], | Rebuild generic core/map capacities and policies as teaching parameters; scope x86 page tables and DDR4 explicitly. |
| 10 | 5 | ['core', 'The Zen+ core at real sizes', 'Every queue at its published size, with one loop iteration marked.'], | Rebuild generic core/map capacities and policies as teaching parameters; scope x86 page tables and DDR4 explicitly. |

### src/24_cache_lab.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 11 | 4 | function teaching(root,copy){U.badge(root,'Teaching model · not a Zen+ timing or policy claim');U.text('p',roo | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 21 | 4 | teaching(sec,'This experiment uses true LRU in a small set-associative cache and a same-capacity fully associa | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 26 | 4 | U.select(ctl,'Model line bytes (Zen+ uses 64)',[16,32,64,128],64,function(v){o.line=+v;draw();}); | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 54 | 4 | teaching(sec,'The byte boundaries are exact for 64-byte lines and 4 KiB pages. The bank function, port width/c | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 80 | 4 | teaching(sec,'Coverage is a necessary data dependency condition, not a complete forwarding specification. Exac | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 102 | 4 | teaching(sec,'The Ryzen 7 3750H has two logical threads per core. Architectural register state is distinct; su | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/25_coherence_lab.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 27 | 4 | teaching(sec,'A generic MOESI teaching protocol with explicit GetS, GetM, data and acknowledgement events exte | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 57 | 4 | U.text('h3',sec,'Observe the mechanism on the reference machine'); | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 58 | 4 | U.text('p',sec,'HITM describes evidence associated with a modified peer copy in some tools; event names and da | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/26_controller_lab.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 6 | 4 | App.CacheUI.teaching(sec,'This controller enforces a stated subset of DRAM-style timing constraints. All numer | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 56 | 4 | U.text('h3',sec,'Measure loaded latency on Zen+'); | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/27_vm_lab.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 51 | 4 | App.CacheUI.teaching(sec,'The LRU TLB below has the same selected entry count for both page sizes to isolate r | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 68 | 4 | App.CacheUI.teaching(sec,'Eight translations have serial dependent page-table reads, followed by final data re | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 71 | 4 | [['walkers','Concurrent model walkers',[1,2,4,8]],['levels','Hardware walk levels',[[3,'3: 2 MiB leaf in the e | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 83 | 4 | App.CacheUI.teaching(sec,'This scenario sends IPIs to the selected CPUs that may hold translations, includes l | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 97 | 4 | App.CacheUI.teaching(sec,'The Ryzen 7 3750H remains the primary machine; this is an explicit two-node NUMA ext | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 110 | 4 | function render(data,label){validate(data);if(label)U.text('h3',out,label,{'class':'measurement-run-title'});s | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/28_architecture_lab.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 7 | 1 | function reference(root){var sec=section(root,'reference','Zen+ as an experimental specimen','Keep product fac | Lead with implementation differences and evidence; keep historical inclusion comparisons and ISA ordering/granule experiments. |
| 8 | 1 | U.badge(sec,'Primary reference · Ryzen 7 3750H');U.text('p',sec,'This is the concrete four-core Zen+ laptop-cl | Lead with implementation differences and evidence; keep historical inclusion comparisons and ISA ordering/granule experiments. |
| 11 | 1 | U.text('h3',sec,'Choose comparisons by their consequence');U.table(sec,['Mechanism','Zen+ reference','Specific | Lead with implementation differences and evidence; keep historical inclusion comparisons and ISA ordering/granule experiments. |
| 22 | 1 | U.select(ctl,'Ordering rules',[['tso','x86-TSO illustration (Zen+ / Intel WB)'],['relaxed','Relaxed illustrati | Lead with implementation differences and evidence; keep historical inclusion comparisons and ISA ordering/granule experiments. |
| 29 | 1 | summary.textContent=o.fenced?'A full point on both threads removes the highlighted weak outcome in these tests | Lead with implementation differences and evidence; keep historical inclusion comparisons and ISA ordering/granule experiments. |
| 45 | 1 | U.table(sec,['Concrete scope','Evidence and consequence'],[['Zen+ anchor','The original path uses the reported | Lead with implementation differences and evidence; keep historical inclusion comparisons and ISA ordering/granule experiments. |
| 47 | 1 | function granules(root){var sec=section(root,'granules','An Arm lens on translation granules','Page geometry c | Lead with implementation differences and evidence; keep historical inclusion comparisons and ISA ordering/granule experiments. |
| 50 | 1 | U.text('p',sec,'The TLB model deliberately keeps entries and LRU replacement equal to isolate page geometry. T | Lead with implementation differences and evidence; keep historical inclusion comparisons and ISA ordering/granule experiments. |
| 62 | 1 | ['map','code','core','xlate','l1d','hier','dram','stores','coh','pref','dev','e2e'].forEach(function(id){App.e | Lead with implementation differences and evidence; keep historical inclusion comparisons and ISA ordering/granule experiments. |

### src/29_advanced_lab.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 34 | 4 | U.text('p',sec,'Observe: inspect compiler output and code size, use perf list to find instruction-cache, iTLB  | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 37 | 4 | model(sec,'Each stream has one outstanding demand and a chosen think interval. A two-equal-delta detector pred | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 44 | 4 | U.text('p',sec,'Coverage joins demand IDs against a separately run prefetch-off baseline. Inter-stream complet | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 60 | 4 | function multisocket(root){var sec=section(root,'multisocket','Two sockets add shared remote links','First tou | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 61 | 4 | function reliability(root){var sec=section(root,'ecc','ECC detects and sometimes corrects','Parity detects an  | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |
| 65 | 4 | function chiplets(root){var sec=section(root,'chiplets','Modern comparisons change the experiment','Cache doma | Keep mechanism/model behavior, removing target calibration implications and scoping historical source references. |

### src/30_measurement_workflow.js

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 16 | 6 | function label(which,bundle){return (which==='reference'?'Reference machine':state.source==='local'?'Your mach | Use an optional measured-machine registry with exact recorded identities; no architecture is required. |
| 23 | 6 | var reference=async function(){try{var bundle=await readBundle(new URL('data/reference/ryzen7-3750h.json',loca | Use an optional measured-machine registry with exact recorded identities; no architecture is required. |
| 33 | 6 | U.text('h3',reference,'Reference machine');var refModel=U.text('p',reference,'Ryzen 7 3750H · Zen+'),refStatus | Use an optional measured-machine registry with exact recorded identities; no architecture is required. |
| 55 | 6 | onChange(function(){refStatus.textContent=state.referenceStatus;yourStatus.textContent=state.yourStatus;refMod | Use an optional measured-machine registry with exact recorded identities; no architecture is required. |

### tests/browser-workflow.cjs

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 22 | 6 | const localContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),local= | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |
| 28 | 6 | await check('delayed automatic loading keeps the opened dataset panel in view',async()=>{const ctx=await brows | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |
| 36 | 6 | await publicContext.route('**/data/reference/ryzen7-3750h.json',route=>route.fulfill({status:200,contentType:' | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |
| 39 | 6 | await check('committed reference endpoint loads automatically on the public path',async()=>{assert.match(await | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |
| 44 | 6 | for(const [id,selector] of panels)await check('reference and visitor measurements stay separate: '+id,async()= | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |
| 53 | 6 | const wrongMachine=structuredClone(bundle);wrongMachine.machine.cpu_model='Different machine (test only)';wron | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |
| 54 | 6 | for(const [name,data] of [['malformed public bundle',{}],['reference path with another machine',wrongMachine]] | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |

### tests/bundle-fixture.cjs

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 11 | 6 | return {schema:'memory-lab-bundle-v1',created_utc:'2026-01-01T00:00:00Z',complete:false,notes:context.notes,pr | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |
| 16 | 6 | b.machine.cpu_model='AMD Ryzen 7 3750H with Radeon Vega Mobile Gfx';b.machine.cpu_details={vendor_id:'Authenti | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |

### tests/bundle.test.cjs

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 5 | 6 | test('malformed aggregate provenance is rejected before replacement',()=>{for(const mutate of [b=>b.suites.vm= | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |

### tests/public_export_test.py

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 41 | 6 | "cpu_details": {}, "is_ryzen_7_3750h": False, "topology": {"allowed_cpus": [0], "online_cpus": [0], | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |
| 199 | 6 | private, public = Path(folder) / "private.json", Path(folder) / "ryzen7-3750h.json" | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |

### tests/workflow_test.py

| Baseline line | Category | Excerpt | Decision |
|---|---|---|---|
| 193 | 6 | lambda b: b["machine"].update(is_ryzen_7_3750h=not b["machine"]["is_ryzen_7_3750h"]), | Keep legacy provenance/fixture checks; adapt public loading assertions and add neutral-positioning regressions. |

## Final disposition

A final tracked/new-source search for `Zen+`, `Ryzen 7 3750H`, `reference machine`,
`Family 17h` and `primary reference` found no occurrences in the shell, redirect,
Start Here, mechanism map, Atlas identity or automatic dataset loader. Every
remaining occurrence belongs to one of these retained scopes:

| Location | Intentional scope |
|---|---|
| `AUDIT.md`, `docs/IMPLEMENTATION.md` | Unchanged historical roadmap/phase ledger; their original anchor is superseded by the current evidence contract. |
| This inventory | Explicit baseline excerpts and classification, collected before editing. |
| README phase-history paragraph | Historical account of Phase 5, followed by the new architecture-neutral contract. |
| Glossary, source registries, architecture/history cases and generated mirrors | Historical Family 17h / Zen+ way-prediction or inclusion context, never a generic queue/latency calibration. |
| `benchmarks/README.md` | Historical IBS/model applicability and a labeled historical SMT topology example. “Primary references” refers to source documents, not a reference CPU. |
| `benchmarks/litmus/README.md` | “Primary reference” refers to formal-method sources, not a CPU. No hardware results are invented. |
| `workflow.py`, `13_measurement_bundle.js`, `export_public.py` | Compatible bundle identity classification and the optional old named-export guard. The generic public selector uses registry identities. |
| `data/reference/README.md` | The old laptop may be one optional recorded dataset; its filename is no longer implicitly loaded. |
| Bundle/export/browser tests | Explicit synthetic compatibility fixtures or assertions that old primary-architecture wording is absent. |

The generated HTML is rebuilt from these canonical modules and retains the same
historical/compatibility scopes. Native source kernels, suite algorithms, topology,
environment collection, perf/IBS semantics, private visitor state and manual import
paths remain intact. Numerical model outputs retain their existing algorithms;
the core plate now derives its entry counts from the model rather than legacy
hardware-reference metadata.
