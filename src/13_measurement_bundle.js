/* The result bundle written by benchmarks/run_all.py. Pure functions; no network or storage. */
var MeasurementBundle = (function () {
  'use strict';
  var schemas = {
    memory: 'memory-lab-v1',
    sharing: 'memory-lab-sharing-v1',
    loaded: 'memory-lab-loaded-v1',
    vm: 'memory-lab-vm-v1',
    prefetch: 'memory-lab-prefetch-v1'
  };
  function object(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }
  function require(ok, message) {
    if (!ok) throw new Error(message);
  }
  function integer(n) {
    return Number.isSafeInteger(n) && n >= 0;
  }
  function hash(v) {
    return typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  }
  // Legacy identity guard for compatible bundles and the optional named Ryzen export.
  // Public selection uses MeasuredRegistry identities, never this particular CPU.
  function target(m) {
    var d = m.cpu_details || {};
    return (
      /\bAMD Ryzen 7 3750H(?:\s|$)/i.test(m.cpu_model) &&
      d.vendor_id === 'AuthenticAMD' &&
      String(d['cpu family']) === '23' &&
      String(d.model) === '24'
    );
  }
  function core(r) {
    return r.package_id === null || r.core_id === null
      ? null
      : JSON.stringify([r.package_id, r.die_id, r.core_id]);
  }
  function validateEnvironment(bundle) {
    var e = bundle.environment;
    if (e === undefined) {
      require(Object.values(bundle.suites).every(function (s) {
        return s.environment === undefined;
      }), 'Suite telemetry is missing aggregate environment provenance.');
      return;
    }
    require(object(e) &&
      e.schema === 'memory-lab-environment-v1', 'Unsupported environment telemetry schema.');
    function time(v) {
      return typeof v === 'string' && !isNaN(Date.parse(v)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(v);
    }
    function availability(v) {
      if (Array.isArray(v)) {
        v.forEach(availability);
        return;
      }
      if (!object(v)) return;
      if (v.status !== undefined) {
        require(['available', 'unavailable'].includes(v.status) &&
          typeof v.reason === 'string', 'Telemetry availability requires status and reason.');
        if (v.status === 'unavailable' && v.value !== undefined)
          require(v.value === null, 'Unavailable telemetry cannot contain an invented value.');
      }
      Object.values(v).forEach(availability);
    }
    function snap(s, position, suite) {
      require(object(s) &&
        s.position === position &&
        s.suite === suite, 'Environment snapshot association disagrees with its suite/position.');
      require(time(s.captured_utc) &&
        time(s.finished_utc) &&
        integer(s.capture_elapsed_ns), 'Invalid environment snapshot timestamp / duration.');
      require(['power', 'platform_profile', 'boost', 'cpus', 'thermal_zones', 'hwmon'].every(
        function (k) {
          return object(s[k]);
        }
      ), 'Missing explicit telemetry groups.');
      require([
        s.cpus,
        s.thermal_zones,
        s.hwmon,
        s.power.supplies,
        s.power.batteries,
        s.platform_profile.profiles
      ].every(function (g) {
        return (
          object(g) && Array.isArray(g.entries) && ['available', 'unavailable'].includes(g.status)
        );
      }), 'Telemetry collections require explicit entries and availability.');
      function fields(r, names) {
        require(object(r) &&
          names.every(function (k) {
            return (
              object(r[k]) &&
              Object.prototype.hasOwnProperty.call(r[k], 'value') &&
              ['available', 'unavailable'].includes(r[k].status)
            );
          }), 'Missing explicit telemetry field or availability.');
      }
      fields(s.power, ['source', 'ac_online']);
      fields(s.platform_profile, ['acpi_profile', 'service_profile']);
      fields(s.boost, ['cpufreq_boost', 'intel_no_turbo']);
      require(s.cpus.entries.every(function (r) {
        return object(r) && integer(r.cpu);
      }) &&
        JSON.stringify(
          s.cpus.entries
            .map(function (r) {
              return r.cpu;
            })
            .sort(function (a, b) {
              return a - b;
            })
        ) ===
          JSON.stringify(
            bundle.machine.topology.online_cpus.slice().sort(function (a, b) {
              return a - b;
            })
          ), 'Telemetry logical CPUs disagree with recorded online topology.');
      s.cpus.entries.forEach(function (r) {
        fields(r, [
          'governor',
          'driver',
          'related_cpus',
          'scaling_cur_freq',
          'scaling_min_freq',
          'scaling_max_freq',
          'cpuinfo_cur_freq',
          'cpuinfo_min_freq',
          'cpuinfo_max_freq'
        ]);
      });
      availability(s);
    }
    function timing(v) {
      require(time(v.started_utc) &&
        time(v.finished_utc) &&
        integer(v.elapsed_ns), 'Missing monotonic environment interval / UTC timestamps.');
    }
    function warnings(v, suite) {
      require(Array.isArray(v.warnings) &&
        v.warnings.every(function (w) {
          return (
            object(w) &&
            w.suite === suite &&
            w.scope === (suite ? 'suite' : 'run') &&
            typeof w.message === 'string' &&
            Array.isArray(w.observations) &&
            typeof w.interpretation === 'string'
          );
        }), 'Environment warnings must retain their scope and observations.');
    }
    snap(e.before_run, 'before_run', null);
    if (e.after_run !== null && e.after_run !== undefined) {
      snap(e.after_run, 'after_run', null);
      timing(e);
    } else
      require(!bundle.complete, 'Complete workflow requires an after-run environment snapshot.');
    warnings(e, null);
    Object.keys(schemas).forEach(function (name) {
      var s = bundle.suites[name],
        v = s.environment;
      if (v === undefined) {
        require(s.status !== 'measured', 'Measured suite is missing its environment interval.');
        return;
      }
      require(object(v) && v.suite === name, 'Environment interval belongs to another suite.');
      snap(v.before, 'before_suite', name);
      snap(v.after, 'after_suite', name);
      timing(v);
      warnings(v, name);
    });
  }
  function validate(bundle, validators) {
    require(object(bundle) &&
      bundle.schema === 'memory-lab-bundle-v1' &&
      typeof bundle.complete ===
        'boolean', 'Expected memory-lab-bundle-v1 with explicit completion.');
    var m = bundle.machine;
    require(object(m) &&
      ['cpu_model', 'kernel', 'architecture'].every(function (k) {
        return typeof m[k] === 'string' && m[k].length > 0 && m[k].length < 2000;
      }), 'Missing CPU / kernel / architecture provenance.');
    require(typeof bundle.created_utc === 'string' &&
      !isNaN(Date.parse(bundle.created_utc)) &&
      object(bundle.provenance), 'Missing bundle time or provenance.');
    require(m.is_ryzen_7_3750h ===
      target(m), 'Target-machine claim disagrees with CPU identification.');
    var t = m.topology;
    require(object(t) &&
      Array.isArray(t.cpus) &&
      t.cpus.length <= 65536 &&
      Array.isArray(t.allowed_cpus) &&
      Array.isArray(t.online_cpus), 'Missing Linux topology and affinity.');
    var by = {},
      allowed = new Set(t.allowed_cpus);
    require(allowed.size === t.allowed_cpus.length &&
      t.allowed_cpus.every(integer), 'Invalid allowed CPU list.');
    t.cpus.forEach(function (r) {
      require(object(r) &&
        integer(r.cpu) &&
        !Object.prototype.hasOwnProperty.call(by, r.cpu) &&
        Array.isArray(r.thread_siblings) &&
        r.thread_siblings.every(integer) &&
        ['core_id', 'package_id', 'die_id', 'numa_node'].every(function (k) {
          return r[k] === null || integer(r[k]);
        }) &&
        typeof r.online === 'boolean' &&
        typeof r.allowed === 'boolean', 'Invalid topology row.');
      by[r.cpu] = r;
    });
    require(t.allowed_cpus.every(function (c) {
      return by[c] && by[c].allowed;
    }) &&
      t.cpus.every(function (r) {
        return r.allowed === allowed.has(r.cpu);
      }) &&
      t.online_cpus.every(function (c) {
        return integer(c) && by[c] && by[c].online;
      }), 'Topology disagrees with affinity / online CPUs.');
    require(object(bundle.capabilities) &&
      Object.values(bundle.capabilities).every(function (c) {
        return object(c) && typeof c.status === 'string' && typeof c.reason === 'string';
      }), 'Capabilities must record availability and reasons.');
    require(object(bundle.suites) &&
      Object.keys(bundle.suites).length === 5 &&
      Object.keys(schemas).every(function (k) {
        return object(bundle.suites[k]);
      }), 'All five suite slots must exist, including explicit skips.');
    Object.keys(schemas).forEach(function (name) {
      var suite = bundle.suites[name];
      require(['measured', 'partial', 'failed', 'skipped'].includes(suite.status) &&
        Array.isArray(suite.runs) &&
        suite.runs.length <= 16 &&
        Array.isArray(suite.summaries), 'Invalid suite status / runs / summaries.');
      require(suite.status === 'measured'
        ? suite.runs.length > 0
        : typeof suite.reason === 'string' &&
            suite.reason.length > 0, 'Missing measurement or skip/partial reason.');
      var ids = new Set();
      require(['measured', 'partial'].includes(suite.status)
        ? suite.runs.length > 0
        : suite.runs.length === 0, 'Suite status disagrees with available runs.');
      suite.runs.forEach(function (run) {
        require(object(run) &&
          typeof run.id === 'string' &&
          !ids.has(run.id), 'Invalid or duplicate run identity.');
        ids.add(run.id);
        var r = run.result,
          c = r && r.context,
          p = run.placement;
        require(object(r) &&
          r.schema === schemas[name] &&
          object(c) &&
          Array.isArray(r.samples) &&
          r.samples.length > 0 &&
          r.samples.length <= 5000 &&
          typeof r.complete ===
            'boolean', 'Wrong native suite, empty samples or missing completion.');
        require(['cpu_model', 'kernel', 'architecture'].every(function (k) {
          return c[k] === m[k];
        }), 'Run provenance differs from aggregate machine.');
        require(hash(c.source_sha256) &&
          hash(c.binary_sha256) &&
          hash(run.raw_sha256) &&
          object(c.compiler) &&
          Array.isArray(c.compile_command) &&
          c.compile_command.every(function (v) {
            return typeof v === 'string';
          }) &&
          c.compile_command.length > 3 &&
          typeof c.clock === 'string' &&
          typeof c.quick ===
            'boolean', 'Missing compiler, source/binary/raw hashes, timer or quick/full provenance.');
        require(object(p) &&
          ['single', 'physical_cores', 'smt_siblings'].includes(p.kind) &&
          Array.isArray(p.cpus) &&
          p.cpus.length > 0 &&
          p.cpus.length <= 8 &&
          new Set(p.cpus).size === p.cpus.length &&
          p.cpus.every(function (cpu) {
            return integer(cpu) && cpu < 1024 && allowed.has(cpu) && by[cpu].online;
          }), 'Invalid placement / allowed CPU.');
        var rows = p.cpus.map(function (cpu) {
          return by[cpu];
        });
        if (p.kind === 'single') require(rows.length === 1, 'Single placement requires one CPU.');
        if (p.kind === 'physical_cores')
          require(rows.length >= 2 &&
            rows.every(function (a, i) {
              return (
                core(a) !== null &&
                rows.every(function (b, j) {
                  return (
                    i === j ||
                    (core(a) !== core(b) &&
                      !a.thread_siblings.includes(b.cpu) &&
                      !b.thread_siblings.includes(a.cpu))
                  );
                })
              );
            }), 'Physical-core placement is not supported by topology.');
        if (p.kind === 'smt_siblings')
          require(rows.length === 2 &&
            core(rows[0]) !== null &&
            core(rows[0]) === core(rows[1]) &&
            rows[0].thread_siblings.includes(rows[1].cpu) &&
            rows[1].thread_siblings.includes(
              rows[0].cpu
            ), 'SMT placement is not supported by reciprocal sibling topology.');
        require(JSON.stringify(c.cpus || [c.cpu]) ===
          JSON.stringify(p.cpus), 'Native affinity disagrees with placement.');
        require(['sharing', 'loaded'].includes(name) ||
          p.kind === 'single', 'This native suite requires a single-CPU placement.');
        if (object(c.cpu_details))
          ['vendor_id', 'cpu family', 'model', 'model name'].forEach(function (k) {
            if (c.cpu_details[k] !== undefined && m.cpu_details && m.cpu_details[k] !== undefined)
              require(String(c.cpu_details[k]) ===
                String(m.cpu_details[k]), 'CPU identity fields disagree with machine provenance.');
          });
        require(object(run.invocation) &&
          Array.isArray(run.invocation.command) &&
          typeof run.raw_file === 'string', 'Missing runner invocation / raw file provenance.');
        require(suite.status !== 'measured' || r.complete, 'Partial native run labeled measured.');
        var boundaries = boundary(c);
        require(Object.keys(boundaries).length > 1, 'Missing native timing boundary.');
        r.samples.forEach(function (s) {
          require(object(s), 'Invalid trial.');
          var cpus;
          if (name !== 'vm')
            require(Number.isSafeInteger(s.elapsed_ns) &&
              s.elapsed_ns > 0, 'Invalid trial duration.');
          if (name === 'memory') {
            require(s.cpu === c.cpu &&
              s.cpu_before === c.cpu &&
              s.cpu_after === c.cpu, 'Memory trial affinity mismatch.');
            require(Number.isSafeInteger(s.steps) &&
              s.steps > 0 &&
              Number.isSafeInteger(s.seed) &&
              s.seed > 0 &&
              s.operations ===
                (s.mode === 'chase'
                  ? s.steps * s.chains
                  : s.steps * (s.bytes / 8)), 'Invalid memory work/seed accounting.');
            cpus = [s.cpu];
          }
          if (name === 'sharing') cpus = s.observed_cpus;
          if (name === 'loaded')
            cpus = [s.chase_cpu].concat(
              (s.generators || []).map(function (g) {
                return g.cpu;
              })
            );
          if (name === 'vm') cpus = [s.cpu];
          if (name === 'prefetch') cpus = [s.cpu_before];
          require(Array.isArray(cpus) &&
            cpus.length > 0 &&
            JSON.stringify(cpus) ===
              JSON.stringify(p.cpus.slice(0, cpus.length)), 'Trial placement mismatch.');
        });
        if (validators && validators[name]) validators[name](r);
        summarize(name, run); // also verifies required work counts and finite observations
      });
    });
    require(bundle.complete ===
      Object.values(bundle.suites).every(function (s) {
        return s.status === 'measured';
      }), 'Aggregate completion disagrees with suite states.');
    validateEnvironment(bundle);
    if (bundle.public_export !== undefined) {
      var p = bundle.public_export;
      require(object(p) &&
        p.schema === 'memory-lab-public-export-v1' &&
        hash(p.input_bundle_sha256) &&
        hash(p.exporter_sha256) &&
        typeof p.raw_hash_scope === 'string' &&
        typeof p.trial_equivalence === 'string', 'Invalid public-export provenance.');
    }
    return bundle;
  }
  function median(a) {
    var n = a.length;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  function stats(values) {
    var a = values.slice().sort(function (x, y) {
        return x - y;
      }),
      mean =
        a.reduce(function (n, v) {
          return n + v;
        }, 0) / a.length,
      m = median(a);
    return {
      n: a.length,
      mean: mean,
      median: m,
      sd: Math.sqrt(
        a.reduce(function (n, v) {
          return n + (v - mean) * (v - mean);
        }, 0) / a.length
      ),
      mad: median(
        a
          .map(function (v) {
            return Math.abs(v - m);
          })
          .sort(function (x, y) {
            return x - y;
          })
      ),
      min: a[0],
      max: a[a.length - 1],
      p95: a[Math.ceil(0.95 * a.length) - 1],
      population: 'whole-trial averages; not individual-access tails'
    };
  }
  function boundary(c) {
    var b = {};
    [
      'clock',
      'timing_boundary',
      'chase_boundary',
      'background_boundary',
      'stage_boundary',
      'fault_boundary',
      'useful_byte_boundary'
    ].forEach(function (k) {
      if (typeof c[k] === 'string') b[k] = c[k];
    });
    return b;
  }
  function flags(c) {
    return c.compile_command.slice(1).filter(function (v, i, a) {
      return v !== '-o' && a[i - 1] !== '-o' && !/\.c$/.test(v);
    });
  }
  function parameters(name, row) {
    var keys = {
        memory: ['mode', 'bytes', 'chains', 'steps', 'operations', 'seed'],
        sharing: [
          'mode',
          'op',
          'threads',
          'iterations',
          'operations',
          'stride_bytes',
          'line_bytes_assumed'
        ],
        loaded: ['mode', 'bytes_per_worker', 'background_threads', 'steps', 'chunk_bytes', 'seed'],
        prefetch: ['bytes', 'stride_lines', 'distance', 'loads', 'passes'],
        vm: ['kind', 'advice', 'bytes', 'page_bytes']
      }[name],
      p = {};
    keys.forEach(function (k) {
      require(row[k] !== undefined, 'Missing trial parameter ' + k);
      p[k] = row[k];
    });
    return p;
  }
  function summarize(name, run) {
    var groups = new Map();
    run.result.samples.forEach(function (row, index) {
      var p = parameters(name, row),
        metric =
          name === 'sharing'
            ? 'ns/update'
            : name === 'memory'
              ? 'ns/op'
              : name === 'vm'
                ? 'ns/stage'
                : 'ns/load',
        divisor =
          name === 'memory' || name === 'sharing'
            ? row.operations
            : name === 'loaded'
              ? row.steps
              : row.loads;
      var observations =
        name === 'vm'
          ? row.stages.map(function (s) {
              return { p: Object.assign({}, p, { stage: s.name }), value: s.elapsed_ns };
            })
          : [{ p: p, value: row.elapsed_ns / divisor }];
      observations.forEach(function (o) {
        require(Number.isFinite(o.value) &&
          o.value > 0, 'Invalid timed observation or work count.');
        var key = JSON.stringify(o.p),
          g = groups.get(key);
        if (!g) {
          g = {
            run_id: run.id,
            placement: run.placement.kind,
            parameters: o.p,
            metric: metric,
            trial_indices: [],
            values: []
          };
          groups.set(key, g);
        }
        g.trial_indices.push(index);
        g.values.push(o.value);
      });
    });
    return Array.from(groups.values()).map(function (g) {
      g.statistics = stats(g.values);
      delete g.values;
      return g;
    });
  }
  function placementSignature(bundle, run) {
    var by = new Map(
        bundle.machine.topology.cpus.map(function (r) {
          return [r.cpu, r];
        })
      ),
      rows = run.placement.cpus.map(function (c) {
        return by.get(c);
      });
    return [
      run.placement.kind,
      rows.length,
      new Set(
        rows.map(function (r) {
          return r.package_id;
        })
      ).size,
      rows.some(function (r) {
        return r.numa_node === null;
      })
        ? 'unknown NUMA'
        : new Set(
            rows.map(function (r) {
              return r.numa_node;
            })
          ).size
    ];
  }
  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (object(v))
      return (
        '{' +
        Object.keys(v)
          .sort()
          .map(function (k) {
            return JSON.stringify(k) + ':' + canonical(v[k]);
          })
          .join(',') +
        '}'
      );
    return JSON.stringify(v);
  }
  function mapping(row) {
    if (!object(row.smaps) || !Object.keys(row.smaps).length || !integer(row.advice_errno))
      return null;
    var out = { advice_errno: row.advice_errno },
      valid = true;
    Object.keys(row.smaps)
      .sort()
      .forEach(function (k) {
        var text = String(row.smaps[k]);
        if (!/^KernelPageSize:/m.test(text) || !/^MMUPageSize:/m.test(text)) valid = false;
        out[k] = text
          .split('\n')
          .filter(function (line) {
            return /^(KernelPageSize|MMUPageSize|AnonHugePages|FilePmdMapped|ShmemPmdMapped):/.test(
              line
            );
          })
          .join('\n');
      });
    return valid ? out : null;
  }
  function comparisons(a, b, name) {
    var left = new Map(),
      right = new Map();
    function index(bundle, dest) {
      var suite = bundle.suites[name];
      suite.runs.forEach(function (run) {
        var c = run.result.context;
        summarize(name, run).forEach(function (g) {
          var pageEvidence = name === 'vm' ? mapping(run.result.samples[g.trial_indices[0]]) : null;
          if (
            name === 'vm' &&
            (pageEvidence === null ||
              !g.trial_indices.every(function (i) {
                return canonical(mapping(run.result.samples[i])) === canonical(pageEvidence);
              }))
          )
            return;
          var key = canonical([
              name,
              g.parameters,
              g.metric,
              boundary(c),
              c.source_sha256,
              flags(c),
              !!c.quick,
              placementSignature(bundle, run),
              pageEvidence
            ]),
            old = dest.get(key);
          if (old) return;
          dest.set(key, { group: g, run: run });
        });
      });
    }
    index(a, left);
    index(b, right);
    var rows = [];
    left.forEach(function (x, k) {
      if (!right.has(k)) return;
      var y = right.get(k);
      rows.push({
        parameters: x.group.parameters,
        metric: x.group.metric,
        placement: x.group.placement,
        a: x.group.statistics,
        b: y.group.statistics,
        ratio: y.group.statistics.median / x.group.statistics.median,
        compilerDiff:
          canonical(x.run.result.context.compiler) !== canonical(y.run.result.context.compiler),
        partial: a.suites[name].status !== 'measured' || b.suites[name].status !== 'measured'
      });
    });
    return rows;
  }
  return {
    schemas: schemas,
    validate: validate,
    validateEnvironment: validateEnvironment,
    target: target,
    stats: stats,
    summarize: summarize,
    boundary: boundary,
    flags: flags,
    comparisons: comparisons
  };
})();
if (typeof module !== 'undefined') module.exports = MeasurementBundle;
