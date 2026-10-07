/* Measurement integration/privacy checks. Mock reference identity is TEST ONLY. */
'use strict';
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { referenceIdentity } = require('./bundle-fixture.cjs');
const root = path.resolve(__dirname, '..'),
  output = path.join(root, 'test-results'),
  results = path.join(output, 'browser-workflow');
const checked = [],
  failures = [],
  errors = [];
let child;
async function start() {
  child = spawn(
    'python3',
    [
      'benchmarks/run_all.py',
      '--quick',
      '--serve',
      '--no-browser',
      '--no-perf',
      '--port',
      '0',
      '--results',
      results
    ],
    { cwd: root }
  );
  return new Promise((resolve, reject) => {
    let log = '';
    const timeout = setTimeout(() => reject(new Error('Workflow startup timeout: ' + log)), 90000);
    function read(data) {
      log += data.toString();
      const match = log.match(/Local lab: (http:\/\/\S+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    }
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error('Workflow exited before server: ' + code + ' ' + log));
    });
  });
}
async function main() {
  const localURL = await start(),
    base = localURL.split('/memory_end_to_end.html')[0],
    bundle = JSON.parse(fs.readFileSync(path.join(results, 'reference-machine.json')));
  const options = { headless: true };
  if (process.env.BROWSER_BINARY) {
    options.executablePath = process.env.BROWSER_BINARY;
    options.args = ['--no-sandbox', '--disable-dev-shm-usage'];
  }
  if (process.env.BROWSER_ARGS) options.args = JSON.parse(process.env.BROWSER_ARGS);
  const browser = await chromium.launch(options);
  async function check(name, fn) {
    try {
      await fn();
      checked.push(name);
    } catch (e) {
      failures.push({ name, error: e.message });
    }
  }
  async function route(page, id) {
    await page.evaluate((id) => {
      location.hash = id;
    }, id);
    await page.waitForFunction(
      (id) => document.querySelector('.ch.show')?.id === 'ch-' + id.split('/')[0],
      id
    );
    await page.mouse.move(1100, 500);
    await page.waitForTimeout(450);
    const panel = page.locator('#' + id.replace('/', '--'));
    await panel.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
    return panel;
  }
  async function importBundle(page, data) {
    await page
      .getByLabel('Your benchmark bundle', { exact: true })
      .setInputFiles({
        name: 'visitor.json',
        mimeType: 'application/json',
        buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data))
      });
  }
  const panels = [
    ['perf/measure', '.measurement-results'],
    ['coh/transactions', '.sharing-results'],
    ['dram/controller', '.loaded-results'],
    ['xlate/os', '.vm-results'],
    ['pref/resources', '.prefetch-results']
  ];
  try {
    const localContext = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce'
      }),
      local = await localContext.newPage();
    local.on('pageerror', (e) => errors.push(e.message));
    await localContext.route('**/data/reference/index.json', (r) =>
      r.fulfill({ status: 404, body: '' })
    );
    await local.goto(localURL);
    await local.waitForFunction(() => App.Measurements.state.source === 'local');
    await local.waitForLoadState('networkidle');
    await check('run_all --serve automatically loads the newly generated aggregate', async () => {
      assert.equal(
        await local.evaluate(() => App.Measurements.state.yours.machine.cpu_model),
        bundle.machine.cpu_model
      );
      assert.match(
        await local.locator('.your-dataset-status').textContent(),
        /automatically.*Not uploaded/
      );
      assert.equal(await local.getByLabel('Your benchmark bundle').inputValue(), '');
      assert.equal(
        await local.locator('.reference-dataset-status').textContent(),
        'No optional measured datasets are shipped.'
      );
    });
    for (const [id, selector] of panels)
      await check('automatic local chapter loading: ' + id, async () => {
        const panel = await route(local, id);
        assert.ok((await panel.locator(selector + ' tbody tr').count()) > 0);
        assert.match(await panel.locator(selector).textContent(), /automatic local run/);
        assert.match(
          await panel.locator(selector).textContent(),
          new RegExp(bundle.machine.cpu_model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        );
      });
    await check('existing individual importer remains usable after automatic loading', async () => {
      const panel = await route(local, 'perf/measure');
      await panel
        .getByLabel('Benchmark result JSON', { exact: true })
        .setInputFiles({
          name: 'memory.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(bundle.suites.memory.runs[0].result))
        });
      await local.waitForFunction(() =>
        document.querySelector('.measurement-results').textContent.includes('Manual import')
      );
      assert.match(
        await panel.locator('.measurement-results').textContent(),
        /locally read, not uploaded/
      );
      assert.equal(
        await local.evaluate(() => App.Measurements.state.yours.schema),
        'memory-lab-bundle-v1'
      );
    });
    await check('legacy two-run fallback refuses mismatched timing boundaries', async () => {
      const panel = await route(local, 'perf/compare'),
        a = bundle.suites.memory.runs[0].result,
        b = structuredClone(a);
      b.context.timing_boundary = 'whole process (test mismatch)';
      for (const [letter, data] of [
        ['A', a],
        ['B', b]
      ])
        await panel
          .getByLabel('Architecture run ' + letter, { exact: true })
          .setInputFiles({
            name: letter + '.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(data))
          });
      await local.waitForFunction(() =>
        document.querySelector('.comparison-status').textContent.startsWith('Cannot compare')
      );
      assert.equal(await panel.locator('.architecture-comparison tbody tr').count(), 0);
    });
    await check(
      'delayed automatic loading preserves the opened dataset panel position',
      async () => {
        const ctx = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          reducedMotion: 'reduce'
        });
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        await ctx.route('**/data/reference/index.json', (r) =>
          r.fulfill({ status: 404, body: '' })
        );
        await ctx.route('**/__memory_lab__/bundle.json', async (r) => {
          await gate;
          await r.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(bundle)
          });
        });
        const p = await ctx.newPage();
        p.on('pageerror', (e) => errors.push(e.message));
        await p.goto(localURL, { waitUntil: 'domcontentloaded' });
        await p.waitForFunction(() => !!document.querySelector('#perf--datasets'));
        await p.waitForTimeout(650);
        const before = await p
          .locator('#perf--datasets')
          .evaluate((el) => el.getBoundingClientRect().top);
        release();
        await p.waitForFunction(() => App.Measurements.state.source === 'local');
        await p.waitForTimeout(100);
        const after = await p
          .locator('#perf--datasets')
          .evaluate((el) => el.getBoundingClientRect().top);
        assert.ok(
          Math.abs(after - before) <= 1,
          'asynchronous loading shifted the panel: ' + before + ' → ' + after
        );
        assert.ok(after >= 0 && after < 500, 'opened panel is outside the useful viewport');
        await ctx.close();
      }
    );

    // Exercise the actual exporter before the public reference loader. Identity
    // emulation remains a synthetic TEST fixture, never a curated dataset.
    const mockPrivate = path.join(results, 'mock-reference-private.json'),
      mockPublic = path.join(results, 'mock-reference-public.json');
    fs.writeFileSync(mockPrivate, JSON.stringify(referenceIdentity(bundle)));
    execFileSync('python3', ['benchmarks/export_public.py', mockPrivate, mockPublic], {
      cwd: root
    });
    const reference = JSON.parse(fs.readFileSync(mockPublic)),
      visitor = structuredClone(bundle);
    visitor.notes = 'Browser test visitor clone; not a curated dataset';
    for (const row of visitor.suites.memory.runs[0].result.samples) row.elapsed_ns *= 2;
    const genericPrivate = path.join(results, 'generic-private.json'),
      genericPublic = path.join(results, 'generic-public.json');
    fs.writeFileSync(genericPrivate, JSON.stringify(bundle));
    execFileSync('python3', ['benchmarks/export_public.py', genericPrivate, genericPublic], {
      cwd: root
    });
    const generic = JSON.parse(fs.readFileSync(genericPublic));
    function registryEntry(id, file, b) {
      return {
        id,
        label: 'TEST ONLY ' + id,
        file,
        identity: Object.fromEntries(
          ['cpu_model', 'architecture', 'cpu_details'].map((k) => [k, b.machine[k]])
        )
      };
    }
    const registry = {
      schema: 'memory-lab-measured-machines-v1',
      machines: [
        registryEntry('historical-fixture', 'optional-a.json', reference),
        registryEntry('generic-fixture', 'optional-b.json', generic),
        registryEntry('missing-fixture', 'missing.json', generic)
      ]
    };
    const publicContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce'
    });
    await publicContext.route('**/data/reference/index.json', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(registry) })
    );
    await publicContext.route('**/data/reference/optional-a.json', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reference) })
    );
    await publicContext.route('**/data/reference/optional-b.json', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(generic) })
    );
    await publicContext.route('**/data/reference/missing.json', (r) =>
      r.fulfill({ status: 404, body: '' })
    );
    const page = await publicContext.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    const requests = [];
    page.on('request', (r) =>
      requests.push({ url: r.url(), method: r.method(), body: r.postData() })
    );
    const sockets = [];
    page.on('websocket', (s) => sockets.push(s.url()));
    await page.goto(base + '/memory_end_to_end.html#perf/datasets');
    await page.waitForFunction(() => App.Measurements.state.reference !== null);
    await page.waitForLoadState('networkidle');
    await check('optional registered datasets load automatically on the public path', async () => {
      assert.match(await page.locator('.reference-machine').textContent(), /Ryzen 7 3750H/);
      assert.equal(
        await page.locator('.reference-dataset-status').textContent(),
        'Optional measured dataset shipped with the site.'
      );
      assert.equal(await page.evaluate(() => App.Measurements.state.yours), null);
      assert.equal(requests.filter((r) => r.url.includes('/__memory_lab__/')).length, 0);
    });
    await check(
      'sanitized public export passes the full browser reference provenance validators',
      async () => {
        assert.equal(
          await page.evaluate(() => App.Measurements.state.reference.public_export.schema),
          'memory-lab-public-export-v1'
        );
        assert.match(
          await page.locator('.reference-machine .environment-summary').textContent(),
          /Potential confounds; no causal diagnosis or discarded trials/
        );
        for (const name of Object.keys(bundle.suites)) {
          assert.equal(
            reference.suites[name].runs.reduce((n, r) => n + r.result.samples.length, 0),
            bundle.suites[name].runs.reduce((n, r) => n + r.result.samples.length, 0)
          );
          for (const [index, r] of reference.suites[name].runs.entries()) {
            assert.equal(
              r.result.context.source_sha256,
              bundle.suites[name].runs[index].result.context.source_sha256
            );
            assert.equal(r.raw_sha256, bundle.suites[name].runs[index].raw_sha256);
          }
        }
        assert.equal(JSON.stringify(reference).includes(root), false);
      }
    );
    await check(
      'multiple recorded machines are selectable without architecture calibration or another request',
      async () => {
        assert.equal(
          await page.getByLabel('Optional measured dataset').locator('option').count(),
          3
        );
        const count = requests.length,
          cfg = await page.evaluate(() => JSON.stringify(App.CFG));
        await page.getByLabel('Optional measured dataset').selectOption('generic-fixture');
        assert.equal(
          await page.evaluate(() => App.Measurements.state.reference.machine.cpu_model),
          generic.machine.cpu_model
        );
        assert.equal(await page.evaluate(() => JSON.stringify(App.CFG)), cfg);
        assert.equal(requests.length, count);
        await page.getByLabel('Optional measured dataset').selectOption('historical-fixture');
      }
    );
    await check(
      'an absent optional entry has a reason and cannot synthesize measurements',
      async () => {
        await page.getByLabel('Optional measured dataset').selectOption('missing-fixture');
        assert.equal(await page.evaluate(() => App.Measurements.state.reference), null);
        assert.match(await page.locator('.reference-dataset-status').textContent(), /absent/);
        assert.equal(await page.locator('.bundle-comparison tbody tr').count(), 0);
        await page.getByLabel('Optional measured dataset').selectOption('historical-fixture');
      }
    );
    const refBefore = await page.evaluate(() => JSON.stringify(App.Measurements.state.reference)),
      before = requests.length;
    await check('visitor import reads one bundle locally and compares matching work', async () => {
      await importBundle(page, visitor);
      await page.waitForFunction(
        () =>
          document.querySelector('.bundle-import-status').textContent ===
          'Imported locally. No upload.'
      );
      assert.equal(await page.evaluate(() => App.Measurements.state.source), 'visitor');
      assert.match(await page.locator('.your-machine').textContent(), /Not uploaded/);
      assert.ok((await page.locator('.bundle-comparison tbody tr').count()) > 0);
      assert.match(
        await page.locator('.bundle-comparison tbody tr').first().textContent(),
        /2\.000/
      );
    });
    await check(
      'visitor import performs no network request or upload and cannot replace reference',
      async () => {
        await page.waitForTimeout(250);
        assert.deepEqual(requests.slice(before), []);
        assert.deepEqual(sockets, []);
        assert.equal(
          await page.evaluate(() => JSON.stringify(App.Measurements.state.reference)),
          refBefore
        );
        assert.ok(requests.every((r) => r.method === 'GET' && r.body === null));
        assert.equal(
          await page.evaluate(() =>
            Object.values(localStorage)
              .concat(Object.values(sessionStorage))
              .some((v) => String(v).includes('memory-lab-bundle-v1'))
          ),
          false
        );
      }
    );
    for (const [id, selector] of panels)
      await check('reference and visitor measurements stay separate: ' + id, async () => {
        const panel = await route(page, id),
          content = await panel.locator(selector).textContent();
        assert.match(content, /Optional measured machine/);
        assert.match(content, /local visitor import/);
        assert.ok((await panel.locator(selector + ' .measurement-run-title').count()) >= 2);
      });
    await route(page, 'perf/datasets');
    await check(
      'wrong suite telemetry association is rejected without replacing visitor data or requesting the network',
      async () => {
        const bad = structuredClone(visitor);
        bad.suites.loaded.environment.before.suite = 'vm';
        const original = await page.evaluate(() => JSON.stringify(App.Measurements.state.yours)),
          count = requests.length;
        await importBundle(page, bad);
        await page.waitForFunction(() =>
          document
            .querySelector('.bundle-import-status')
            .textContent.startsWith('Could not import:')
        );
        assert.equal(
          await page.evaluate(() => JSON.stringify(App.Measurements.state.yours)),
          original
        );
        assert.equal(requests.length, count);
      }
    );
    await check(
      'malformed JSON and provenance mismatches preserve previous visitor data',
      async () => {
        for (const data of [
          '{',
          {},
          { ...visitor, machine: { ...visitor.machine, kernel: 'other kernel' } },
          { ...visitor, complete: false }
        ]) {
          await importBundle(page, data);
          await page.waitForFunction(() =>
            document
              .querySelector('.bundle-import-status')
              .textContent.startsWith('Could not import:')
          );
          assert.equal(
            await page.evaluate(() => App.Measurements.state.yours.machine.kernel),
            visitor.machine.kernel
          );
          assert.equal(
            await page.evaluate(() => JSON.stringify(App.Measurements.state.reference)),
            refBefore
          );
        }
      }
    );
    await check(
      'partial bundles retain available trials and expose skipped-suite reasons',
      async () => {
        const partial = structuredClone(visitor);
        partial.complete = false;
        partial.suites.vm = {
          status: 'skipped',
          reason: 'VM unavailable in browser test fixture',
          runs: [],
          summaries: []
        };
        await importBundle(page, partial);
        await page.waitForFunction(() =>
          document.querySelector('.bundle-import-status').textContent.startsWith('Imported locally')
        );
        assert.match(
          await page.locator('.your-machine').textContent(),
          /VM unavailable in browser test fixture/
        );
        await route(page, 'xlate/os');
        assert.equal(
          await page.locator('.vm-results .measurement-run-title').count(),
          reference.suites.vm.runs.length
        );
        await route(page, 'perf/datasets');
      }
    );
    await check('mismatched measurement boundaries produce no inferred comparison', async () => {
      const mismatch = structuredClone(visitor);
      mismatch.suites.memory.runs[0].result.context.timing_boundary =
        'whole process (test mismatch)';
      await importBundle(page, mismatch);
      await page.waitForFunction(() =>
        document.querySelector('.bundle-import-status').textContent.startsWith('Imported locally')
      );
      assert.equal(await page.locator('.bundle-comparison tbody tr').count(), 0);
      assert.match(
        await page.locator('.bundle-comparison-status').textContent(),
        /No matching cases/
      );
      await importBundle(page, visitor);
    });
    for (const width of [1440, 768, 390])
      for (const theme of ['light', 'dark'])
        await check('measurement workflow layout: ' + width + 'px ' + theme, async () => {
          await page.setViewportSize({ width, height: 1000 });
          if ((await page.locator('html').getAttribute('data-theme')) !== theme)
            await page.locator('#themeToggle').click();
          await route(page, 'perf/datasets');
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
          );
          assert.equal(await page.getByLabel('Your benchmark bundle').isVisible(), true);
          await page.screenshot({
            path: path.join(output, 'measurement-workflow-' + width + '-' + theme + '.png')
          });
        });
    await check(
      'clear is session-local and does not alter reference or other visitors',
      async () => {
        await page.getByRole('button', { name: 'Clear your data', exact: true }).click();
        assert.equal(await page.evaluate(() => App.Measurements.state.yours), null);
        assert.equal(
          await page.evaluate(() => JSON.stringify(App.Measurements.state.reference)),
          refBefore
        );
        const other = await publicContext.newPage();
        await other.goto(base + '/memory_end_to_end.html#perf/datasets');
        await other.waitForFunction(() => App.Measurements.state.reference !== null);
        assert.equal(await other.evaluate(() => App.Measurements.state.yours), null);
        await other.close();
      }
    );
    await check('visitor data does not persist across reload', async () => {
      await importBundle(page, visitor);
      await page.waitForFunction(() => App.Measurements.state.source === 'visitor');
      await page.reload();
      await page.waitForFunction(() => App.Measurements.state.reference !== null);
      assert.equal(await page.evaluate(() => App.Measurements.state.yours), null);
    });
    const wrongMachine = structuredClone(bundle);
    wrongMachine.machine.cpu_model = 'Different machine (test only)';
    wrongMachine.machine.is_ryzen_7_3750h = false;
    wrongMachine.machine.cpu_details = {};
    for (const s of Object.values(wrongMachine.suites))
      for (const r of s.runs) r.result.context.cpu_model = wrongMachine.machine.cpu_model;
    for (const [name, data] of [
      ['malformed public bundle', {}],
      ['registered path with another machine', wrongMachine]
    ])
      await check(name + ' is unavailable without fake replacement data', async () => {
        const ctx = await browser.newContext();
        await ctx.route('**/data/reference/index.json', (r) =>
          r.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ schema: registry.schema, machines: [registry.machines[0]] })
          })
        );
        await ctx.route('**/data/reference/optional-a.json', (r) =>
          r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
        );
        const p = await ctx.newPage();
        p.on('pageerror', (e) => errors.push(e.message));
        await p.goto(base + '/memory_end_to_end.html#perf/datasets');
        await p.waitForFunction(() =>
          document
            .querySelector('.reference-dataset-status')
            .textContent.startsWith('Optional datasets unavailable:')
        );
        assert.equal(await p.evaluate(() => App.Measurements.state.reference), null);
        assert.equal(await p.getByLabel('Your benchmark bundle').isVisible(), true);
        await ctx.close();
      });
    for (const [name, data] of [
      ['empty registry', { schema: registry.schema, machines: [] }],
      ['malformed registry', {}],
      [
        'registry traversal',
        {
          schema: registry.schema,
          machines: [{ ...registry.machines[0], file: '../private.json' }]
        }
      ]
    ])
      await check(
        name + ' leaves experiments usable and never requests an arbitrary dataset',
        async () => {
          const ctx = await browser.newContext();
          await ctx.route('**/data/reference/index.json', (r) =>
            r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
          );
          const p = await ctx.newPage(),
            seen = [];
          p.on('pageerror', (e) => errors.push(e.message));
          p.on('request', (r) => seen.push(r.url()));
          await p.goto(base + '/memory_end_to_end.html#perf/datasets');
          await p.waitForFunction(
            () =>
              !document
                .querySelector('.reference-dataset-status')
                .textContent.startsWith('Checking')
          );
          assert.equal(await p.evaluate(() => App.Measurements.state.reference), null);
          assert.ok(
            seen
              .filter((url) => url.includes('/data/reference/'))
              .every((url) => url.endsWith('/index.json'))
          );
          assert.equal(await p.getByLabel('Your benchmark bundle').isVisible(), true);
          await ctx.close();
        }
      );

    fs.writeFileSync(
      path.join(output, 'workflow-browser-report.json'),
      JSON.stringify({ browser: browser.version(), checked, failures, errors }, null, 2)
    );
    console.log(
      JSON.stringify(
        { browser: browser.version(), passed: checked.length, failures, errors },
        null,
        2
      )
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    if (child) child.kill('SIGINT');
  });
