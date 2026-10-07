/* Measure your machine: shipped results, your own run, and files loaded in the browser. GETs only. */
(function () {
  'use strict';
  var U = App.LabUI,
    h = App.h,
    M = MeasurementBundle,
    listeners = [],
    state = {
      reference: null,
      datasets: [],
      selected: null,
      yours: null,
      source: null,
      referenceStatus: 'Checking for shipped results…',
      yourStatus: 'No results loaded.'
    };
  var validators = {
    memory: App.Performance.validateMeasurement,
    sharing: App.SharingLab.validate,
    loaded: App.ControllerUI.validate,
    vm: App.VMUI.validate,
    prefetch: App.AdvancedUI.validatePrefetch
  };
  function emit() {
    // Populating an earlier measurement section must not move the reader away.
    var scenes = Array.from(document.querySelectorAll('.ch.show .learning-scene')).filter(
        function (el) {
          return !el.hidden;
        }
      ),
      anchor = scenes[0];
    scenes.forEach(function (el) {
      if (el.getBoundingClientRect().top <= 100) anchor = el;
    });
    var before = anchor && anchor.getBoundingClientRect().top;
    listeners.forEach(function (fn) {
      fn();
    });
    if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - before);
  }
  function onChange(fn) {
    listeners.push(fn);
    fn();
  }
  function quick(bundle) {
    return Object.values(bundle.suites).some(function (s) {
      return s.runs.some(function (r) {
        return r.result.context.quick;
      });
    });
  }
  function label(which, bundle) {
    return (
      (which === 'reference'
        ? 'Shipped machine'
        : state.source === 'local'
          ? 'Your machine · automatic local run'
          : 'Your machine · loaded from a file') +
      ' · ' +
      bundle.machine.cpu_model +
      (quick(bundle) ? ' · quick check only' : '') +
      (bundle.complete ? '' : ' · partial')
    );
  }
  function entries(name) {
    var out = [];
    ['reference', 'yours'].forEach(function (which) {
      var bundle = state[which];
      if (!bundle) return;
      bundle.suites[name].runs.forEach(function (run) {
        out.push({
          result: run.result,
          label:
            label(which, bundle) +
            ' · ' +
            run.placement.kind +
            ' · CPUs ' +
            run.placement.cpus.join(', '),
          placement: run.placement,
          environment: bundle.suites[name].environment
        });
      });
    });
    return out;
  }
  function bind(name, status, out, render) {
    var empty = status.textContent;
    onChange(function () {
      var rows = entries(name);
      out.replaceChildren();
      status.textContent = empty;
      rows.forEach(function (row) {
        render(row.result, row.label);
        if (row.environment)
          U.text(
            'p',
            out,
            'This suite took ' +
              (row.environment.elapsed_ns / 1e9).toFixed(1) +
              ' s including setup. ' +
              row.environment.warnings.length +
              ' environment changes during the run; see Measure your machine for the readings.',
            { class: 'measurement-environment-note' }
          );
      });
      if (rows.length)
        status.textContent =
          'Measured · ' +
          rows
            .map(function (r) {
              return r.label;
            })
            .join(' | ');
    });
  }
  function accept(which, bundle, source, entry) {
    M.validate(bundle, validators);
    if (which === 'reference' && (!entry || !MeasuredRegistry.matches(entry, bundle.machine)))
      throw new Error('Dataset disagrees with its registry CPU identity.');
    state[which] = bundle;
    if (which === 'yours') state.source = source;
    emit();
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) throw new Error('Maximum bundle size is 32 MiB.');
    var bundle = JSON.parse(await file.text());
    accept('yours', bundle, 'visitor');
    state.yourStatus = 'Loaded from a file · Not uploaded · gone when you reload.';
    emit();
  }
  async function readBundle(url, limit) {
    var response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      mode: 'same-origin'
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Read failed (HTTP ' + response.status + ').');
    var text = await response.text();
    if (text.length > (limit || 32 * 1024 * 1024))
      throw new Error('Dataset exceeds its size limit.');
    return JSON.parse(text);
  }
  async function automatic() {
    if (location.protocol === 'file:') {
      state.referenceStatus = 'Open the lab through a local web server to load shipped results.';
      emit();
      return;
    }
    var reference = async function () {
      try {
        var registry = await readBundle(new URL('data/reference/index.json', location.href), 32768);
        if (!registry) {
          state.referenceStatus = 'No shipped results.';
          emit();
          return;
        }
        MeasuredRegistry.validate(registry);
        state.datasets = await Promise.all(
          registry.machines.map(async function (entry) {
            try {
              var bundle = await readBundle(new URL('data/reference/' + entry.file, location.href));
              if (!bundle) throw new Error('Dataset file is absent.');
              M.validate(bundle, validators);
              if (!MeasuredRegistry.matches(entry, bundle.machine))
                throw new Error('Dataset disagrees with its registry CPU identity.');
              return { entry: entry, bundle: bundle, status: 'available', reason: '' };
            } catch (e) {
              return { entry: entry, bundle: null, status: 'unavailable', reason: e.message };
            }
          })
        );
        var available = state.datasets.find(function (d) {
          return d.bundle;
        });
        if (available) selectDataset(available.entry.id);
        else
          state.referenceStatus = state.datasets.length
            ? 'Shipped results unavailable: ' +
              state.datasets
                .map(function (d) {
                  return d.entry.label + ': ' + d.reason;
                })
                .join(' | ')
            : 'No shipped results.';
      } catch (e) {
        state.referenceStatus = 'Could not read the list of shipped results: ' + e.message;
      }
      emit();
    };

    var local = async function () {
      if (
        new URLSearchParams(location.search).get('local') !== '1' ||
        !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
      )
        return;
      try {
        var bundle = await readBundle(new URL('/__memory_lab__/bundle.json', location.origin));
        if (bundle) {
          if (state.source !== 'visitor') {
            accept('yours', bundle, 'local');
            state.yourStatus = 'Your latest run, loaded automatically · Not uploaded.';
          }
        } else
          state.yourStatus = 'No automatic results found. You can still load a file.';
      } catch (e) {
        state.yourStatus = 'Could not load your latest run: ' + e.message;
      }
      emit();
    };
    await Promise.all([reference(), local()]);
  }
  function selectDataset(id) {
    var dataset = state.datasets.find(function (d) {
      return d.entry.id === id;
    });
    state.selected = dataset ? dataset.entry.id : null;
    state.reference = (dataset && dataset.bundle) || null;
    state.referenceStatus = dataset
      ? dataset.bundle
        ? 'Shipped with the site.'
        : 'Unavailable: ' + dataset.reason
      : 'Nothing selected.';
    emit();
  }
  App.Measurements = {
    bind: bind,
    entries: entries,
    onChange: onChange,
    importFile: importFile,
    state: state,
    selectDataset: selectDataset
  };
  function build(root) {
    var sec = App.labSection(
      root,
      'datasets',
      'Measure your machine',
      'One command runs the lab’s benchmarks on any Linux machine, x86-64 or Arm, and loads the results into every chapter.'
    );
    U.badge(sec, 'Your machine');
    U.code(
      sec,
      '# Run the benchmarks, then open the lab with your results loaded:\npython3 benchmarks/run_all.py --serve\n\n# Or only run them and save the results:\npython3 benchmarks/run_all.py'
    );
    U.text(
      'p',
      sec,
      'It picks which CPUs to use (SMT siblings too, where allowed), runs five benchmark suites, and saves every raw result plus one combined bundle in results/reference-machine.json. Add --quick to check that everything works; quick runs are too short to measure anything. Nothing leaves your computer.'
    );
    var cards = h('div', { class: 'dataset-cards' }, sec),
      reference = h('article', { class: 'dataset-card reference-machine' }, cards),
      yours = h('article', { class: 'dataset-card your-machine' }, cards);
    U.text('h3', reference, 'Shipped machine');
    U.text(
      'p',
      reference,
      'Results from one specific computer, if the site ships any, for comparison with yours.'
    );
    var datasetControl = h('div', { class: 'perf-controls' }, reference),
      datasetSelect = U.select(datasetControl, 'Shipped machine', [], '', selectDataset);
    var refModel = U.text('p', reference, 'Nothing selected'),
      refStatus = U.text('p', reference, '', { role: 'status', class: 'reference-dataset-status' }),
      refDetail = h('div', null, reference);
    U.text('h3', yours, 'Your machine');
    var yourModel = U.text('p', yours, 'No results loaded'),
      yourStatus = U.text('p', yours, '', { role: 'status', class: 'your-dataset-status' }),
      yourDetail = h('div', null, yours);
    U.text(
      'p',
      yours,
      'Not uploaded. Your file is read in this browser tab only and is gone when you reload.',
      { class: 'dataset-privacy' }
    );
    var inputLabel = h('label', { class: 'perf-field' }, yours);
    U.text('span', inputLabel, 'Import your benchmark bundle');
    var input = h(
        'input',
        { type: 'file', accept: '.json,application/json', 'aria-label': 'Your benchmark bundle' },
        inputLabel
      ),
      remove = U.text('button', yours, 'Clear your data', { type: 'button' }),
      importStatus = U.text('p', yours, '', { role: 'status', class: 'bundle-import-status' });
    input.onchange = async function () {
      try {
        await importFile(input.files[0]);
        importStatus.textContent = 'Loaded. Nothing was uploaded.';
      } catch (e) {
        importStatus.textContent = 'Could not import: ' + e.message;
      }
    };
    remove.onclick = function () {
      state.yours = null;
      state.source = null;
      state.yourStatus = 'No results loaded.';
      input.value = '';
      importStatus.textContent = 'Your results were cleared from this page.';
      emit();
    };
    yours.appendChild(yourDetail);
    U.text('h3', sec, 'Compare with the shipped machine');
    U.text(
      'p',
      sec,
      'Only cases that ran the same code with the same settings are paired; the CPU numbers can differ. A ratio above 1 means your machine took longer. Clock speed, compiler and background load can still differ between the two runs.'
    );
    var controls = h('div', { class: 'perf-controls' }, sec),
      name = 'memory';
    U.select(
      controls,
      'Measured suite',
      [
        ['memory', 'Memory / MLP'],
        ['sharing', 'Atomic sharing'],
        ['loaded', 'Loaded latency'],
        ['vm', 'VM observations'],
        ['prefetch', 'Software prefetch']
      ],
      'memory',
      function (v) {
        name = v;
        drawComparison();
      }
    );
    var comparisonStatus = U.text('p', sec, '', {
        role: 'status',
        class: 'bundle-comparison-status'
      }),
      comparison = h('div', { class: 'bundle-comparison' }, sec);
    U.text(
      'p',
      sec,
      'Each chapter also shows its own results next to its simulation:'
    );
    var links = h('div', { class: 'dataset-links' }, sec);
    [
      ['Memory / MLP', '#perf/measure'],
      ['Atomic sharing', '#coh/transactions'],
      ['Loaded latency', '#dram/controller'],
      ['VM observations', '#xlate/os'],
      ['Software prefetch', '#pref/resources']
    ].forEach(function (link) {
      U.text('a', links, link[0], { href: link[1] });
    });
    function detail(box, bundle) {
      box.replaceChildren();
      if (!bundle) return;
      var rows = Object.keys(M.schemas).map(function (k) {
        var s = bundle.suites[k];
        return [
          k,
          s.status,
          s.runs.reduce(function (n, r) {
            return n + r.result.samples.length;
          }, 0),
          s.reason || 'Recorded raw trials'
        ];
      });
      U.text(
        'p',
        box,
        (bundle.complete ? 'All suites complete' : 'Some suites are missing (see below)') +
          (quick(bundle) ? ' · Quick check only, too short to measure.' : '')
      );
      var e = bundle.environment;
      U.text(
        'p',
        box,
        e
          ? 'Environment: ' +
              e.warnings.length +
              ' changes seen during the run (clock speed, temperature, power). They may explain odd results; nothing was discarded.'
          : 'This bundle has no environment readings.',
        { class: 'environment-summary' }
      );
      if (e) {
        var env = h('details', { class: 'environment-details' }, box);
        U.text('summary', env, 'Show environment readings and suite times');
        U.text(
          'p',
          env,
          'Clock-speed readings are snapshots, not averages over the run, and a temperature reading alone doesn’t prove throttling.'
        );
        if (e.warnings.length)
          U.table(
            env,
            ['Where / reading', 'Change seen'],
            e.warnings.map(function (w) {
              return [w.scope + ' · ' + w.field, w.message];
            })
          );
        U.table(
          env,
          ['Suite', 'Start (UTC)', 'Finish (UTC)', 'Elapsed seconds'],
          Object.keys(M.schemas)
            .filter(function (k) {
              return bundle.suites[k].environment;
            })
            .map(function (k) {
              var v = bundle.suites[k].environment;
              return [k, v.started_utc, v.finished_utc, (v.elapsed_ns / 1e9).toFixed(3)];
            })
        );
        U.text(
          'p',
          env,
          'Suite time includes compiling and setup, so it is longer than the benchmark timers.'
        );
        U.code(
          env,
          JSON.stringify(
            {
              environment: e,
              suites: Object.fromEntries(
                Object.keys(M.schemas).map(function (k) {
                  return [k, bundle.suites[k].environment || null];
                })
              )
            },
            null,
            2
          )
        );
      }
      var raw = h('details', null, box);
      U.text('summary', raw, 'Show suites, machine details and perf availability');
      U.table(raw, ['Suite', 'Status', 'Trials', 'Availability'], rows);
      U.code(
        raw,
        JSON.stringify(
          {
            machine: bundle.machine,
            selection: bundle.selection,
            provenance: bundle.provenance,
            capabilities: bundle.capabilities,
            public_export: bundle.public_export || null
          },
          null,
          2
        )
      );
    }
    function drawComparison() {
      comparison.replaceChildren();
      if (!state.reference || !state.yours) {
        comparisonStatus.textContent =
          'Pick a shipped machine and load your bundle to compare.';
        return;
      }
      var rows = M.comparisons(state.reference, state.yours, name);
      comparisonStatus.textContent = rows.length
        ? rows.length + ' matching cases. Your / shipped above 1 means your machine took longer.'
        : 'No matching cases for this suite.';
      if (rows.length)
        U.table(
          comparison,
          [
            'Placement / case',
            'Unit',
            'Shipped median (n / MAD)',
            'Your median (n / MAD)',
            'Your / shipped',
            'Note'
          ],
          rows.map(function (r) {
            return [
              r.placement +
                ' · ' +
                Object.entries(r.parameters)
                  .map(function (kv) {
                    return kv[0] + '=' + kv[1];
                  })
                  .join(', '),
              r.metric,
              r.a.median.toFixed(3) + ' (' + r.a.n + ' / ' + r.a.mad.toFixed(3) + ')',
              r.b.median.toFixed(3) + ' (' + r.b.n + ' / ' + r.b.mad.toFixed(3) + ')',
              r.ratio.toFixed(3),
              (r.partial ? 'Partial; ' : '') + (r.compilerDiff ? 'different compiler' : '—')
            ];
          })
        );
    }
    onChange(function () {
      datasetSelect.replaceChildren();
      state.datasets.forEach(function (d) {
        U.text('option', datasetSelect, d.entry.label + (d.bundle ? '' : ' · unavailable'), {
          value: d.entry.id
        });
      });
      datasetSelect.value = state.selected || '';
      datasetSelect.disabled = !state.datasets.length;
      refStatus.textContent = state.referenceStatus;
      yourStatus.textContent = state.yourStatus;
      refModel.textContent = state.reference
        ? state.reference.machine.cpu_model + ' · ' + state.reference.machine.architecture
        : 'Nothing selected';
      yourModel.textContent = state.yours
        ? state.yours.machine.cpu_model + ' · ' + state.yours.machine.architecture
        : 'No results loaded';
      detail(refDetail, state.reference);
      if (
        state.datasets.some(function (d) {
          return !d.bundle;
        })
      ) {
        var reasons = h('details', null, refDetail);
        U.text('summary', reasons, 'Show unavailable shipped results');
        state.datasets
          .filter(function (d) {
            return !d.bundle;
          })
          .forEach(function (d) {
            U.text('p', reasons, d.entry.label + ': ' + d.reason);
          });
      }
      detail(yourDetail, state.yours);
      remove.disabled = !state.yours;
      drawComparison();
    });
  }
  App.extendChapter('perf', build);
  automatic();
})();
