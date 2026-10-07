/* Render every chapter and exercise the original and Phase 1 state machines.
   npm run test:browser; optional BROWSER_BINARY for an installed Chromium. */
'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  output = path.join(root, 'test-results');
fs.mkdirSync(output, { recursive: true });
const errors = [],
  failures = [],
  checked = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost'),
    file = path.resolve(
      root,
      '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (e, data) => {
    if (e) {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader(
      'Content-Type',
      file.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : file.endsWith('.js')
          ? 'text/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : 'text/plain'
    );
    res.end(data);
  });
});
async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const options = { headless: true };
  if (process.env.BROWSER_BINARY) {
    options.executablePath = process.env.BROWSER_BINARY;
    options.args = ['--no-sandbox', '--disable-dev-shm-usage'];
  }
  if (process.env.BROWSER_ARGS) options.args = JSON.parse(process.env.BROWSER_ARGS);
  const browser = await chromium.launch(options);
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    async function route(id) {
      await page.goto(base + '/memory_end_to_end.html#' + id);
      await page.waitForFunction(
        (id) => document.querySelector('.ch.show')?.id === 'ch-' + id.split('/')[0],
        id
      );
      await page.mouse.move(1100, 500);
      await page.waitForTimeout(450);
    }
    async function check(name, fn) {
      try {
        await fn();
        checked.push(name);
      } catch (e) {
        failures.push(name + ': ' + e.message);
        await page.screenshot({ path: path.join(output, 'failure-' + failures.length + '.png') });
      }
    }
    await route('start');
    const ids = await page.evaluate(() => App.chapters.map((c) => c.id));
    assert.equal(ids.length, 24);
    for (const id of ids)
      await check('desktop route ' + id, async () => {
        await route(id);
        assert.ok(await page.locator('.ch.show h1').textContent());
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          'unexpected document overflow'
        );
        assert.equal(await page.locator('.ch.show').count(), 1);
      });
    await check('original routes retain chapter numbers', async () => {
      assert.deepEqual(
        await page.evaluate(() =>
          ['start', 'map', 'core', 'l1d', 'e2e', 'perf'].map((id) => App.chNum(id))
        ),
        ['00', '09', '11', '13', '20', '21']
      );
    });
    await check('redirect preserves section hash', async () => {
      await page.goto(base + '/#perf/queues');
      await page.waitForURL('**/memory_end_to_end.html#perf/queues');
      await page.waitForTimeout(500);
      assert.equal(await page.locator('.ch.show').getAttribute('id'), 'ch-perf');
    });
    await check('e2e modes, deep links, row timing and section menu', async () => {
      await route('e2e/critical');
      assert.equal(await page.locator('#ch-e2e .learning-scene:visible').count(), 1);
      assert.equal(await page.locator('#e2e--critical').isVisible(), true);
      await page.locator('#ch-e2e [data-field="Data source"]').selectOption('L1');
      await page
        .locator('#ch-e2e [data-field="Independent older work (cycles)"]')
        .selectOption('512');
      assert.match(
        await page.locator('#ch-e2e .e2e-critical .perf-metrics').textContent(),
        /520 cycles/
      );
      await page.locator('[data-mode="steady"]').click();
      await page.waitForTimeout(500);
      assert.equal(await page.locator('#e2e--steady').isVisible(), true);
      assert.equal(await page.locator('#ch-e2e .learning-scene:visible').count(), 1);
      await page.locator('[data-mode="single"]').click();
      await page.waitForTimeout(500);
      assert.equal(await page.locator('#ch-e2e .learning-scene:visible').count(), 4);
      await page.locator('#ch-e2e .seg button').filter({ hasText: 'open (row hit)' }).click();
      const a = await page.locator('#e2e--scenario svg text').first().textContent();
      await page.locator('#ch-e2e .seg button').filter({ hasText: 'conflict' }).click();
      const b = await page.locator('#e2e--scenario svg text').first().textContent();
      assert.notEqual(a, b);
      await page.locator('#crumbSec').click();
      await page
        .locator('#secMenu button')
        .filter({ hasText: 'Inspect the serialized steps' })
        .click();
      assert.match(page.url(), /#e2e\/steps$/);
    });
    await check('finite queues, sweep, trace and pressure presets', async () => {
      await route('perf/queues');
      const lab = page.locator('#perf--queues');
      await lab.getByRole('button', { name: 'One chain', exact: true }).click();
      const one = await lab.locator('.stream-lab').evaluate((el) => el._simulation.throughput);
      await lab.locator('[data-field="Independent chains"]').selectOption('8');
      assert.ok(
        await lab
          .locator('.stream-lab')
          .evaluate((el, one) => el._simulation.throughput > one * 3, one)
      );
      await lab.getByRole('button', { name: 'Controller pressure', exact: true }).click();
      assert.ok(
        await lab.locator('.stream-lab').evaluate((el) => el._simulation.stalls.controller > 0)
      );
      await lab.getByRole('button', { name: 'Return-link pressure', exact: true }).click();
      assert.ok(await lab.locator('.stream-lab').evaluate((el) => el._simulation.stalls.fill > 0));
      await lab.getByRole('button', { name: /Sweep 1/ }).click();
      assert.equal(await lab.locator('.perf-sweep tbody tr').count(), 6);
      await lab.getByRole('button', { name: 'Restart trace', exact: true }).click();
      assert.match(await lab.locator('.queue-state h3').textContent(), /Cycle 0 /);
      await lab.getByLabel('Trace cycle', { exact: true }).fill('25');
      assert.match(await lab.locator('.queue-state h3').textContent(), /Cycle 25 /);
      await lab.getByRole('button', { name: 'Play trace', exact: true }).click();
      await page.waitForTimeout(250);
      await lab.getByRole('button', { name: 'Pause trace', exact: true }).click();
      await page.screenshot({ path: path.join(output, 'queues-dark-desktop.png') });
    });
    await check('prediction and Little law calculator', async () => {
      await route('perf/predict');
      const section = page.locator('#perf--predict');
      assert.match(await section.locator('.perf-metrics').textContent(), /25.0 lines/);
      await section.locator('[data-field="Target line bandwidth (GB/s)"]').selectOption('40');
      assert.match(await section.locator('.perf-metrics').textContent(), /50.0 lines/);
      await section
        .getByRole('button', { name: 'No: independent loads can overlap', exact: true })
        .click();
      assert.match(await section.locator('[aria-live]').last().textContent(), /matches this model/);
    });
    await check('native JSON import and safe validation', async () => {
      const fixture = path.join(output, 'native-smoke.json');
      execFileSync('python3', ['benchmarks/run.py', '--quick', '--output', fixture], {
        cwd: root,
        stdio: 'pipe'
      });
      await route('perf/measure');
      const input = page.getByLabel('Benchmark result JSON', { exact: true });
      await input.setInputFiles(fixture);
      await page.waitForFunction(() =>
        document
          .querySelector('#perf--measure [role=status]')
          .textContent.startsWith('Measured data')
      );
      assert.equal(await page.locator('.measurement-results tbody tr').count(), 12);
      const adversarial = JSON.parse(fs.readFileSync(fixture));
      adversarial.context.cpu_model = '<img src=x onerror="window.injected=true">';
      await input.setInputFiles({
        name: 'untrusted.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(adversarial))
      });
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => window.injected), undefined);
      await input.setInputFiles({
        name: 'bad.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
          '{"schema":"memory-lab-v1","context":{},"samples":[{"mode":"chase","elapsed_ns":0}]}'
        )
      });
      await page.waitForTimeout(100);
      assert.match(
        await page.locator('#perf--measure [role=status]').textContent(),
        /Could not import/
      );
    });
    await check('3C trace, reuse distance, RFO bytes and safe trace input', async () => {
      await route('l1d/taxonomy');
      const lab = page.locator('#l1d--taxonomy');
      await lab.getByRole('button', { name: 'Same-set conflicts', exact: true }).click();
      assert.ok(await lab.evaluate((el) => el._cacheResult.counts.conflict > 0));
      await lab.locator('[data-field="Trace operation"]').selectOption('write');
      assert.ok(await lab.evaluate((el) => el._cacheResult.counts.rfoBytes > 0));
      await lab.locator('[data-field="Dirty lines at end"]').selectOption('1');
      assert.ok(await lab.evaluate((el) => el._cacheResult.drainedLines > 0));
      await lab.getByRole('button', { name: 'Capacity cycle', exact: true }).click();
      assert.ok(await lab.evaluate((el) => el._cacheResult.counts.capacity > 0));
      await lab.getByLabel('Cache trace fragment', { exact: true }).fill('5');
      assert.match(await lab.locator('.cache-state h3').textContent(), /Fragment 6/);
      await lab.getByLabel('Cache access trace', { exact: true }).fill('<img src=x>');
      await lab.getByRole('button', { name: 'Apply trace', exact: true }).click();
      assert.match(await lab.locator('[role=status]').textContent(), /Use A/);
      await page.screenshot({ path: path.join(output, 'cache-dark-desktop.png') });
    });
    await check('split page coverage and shared port traffic', async () => {
      await route('l1d/split');
      const lab = page.locator('#l1d--split');
      await lab.locator('[data-field="Starting byte offset"]').selectOption('4092');
      assert.match(await lab.textContent(), /crosses a page boundary/);
      await lab.locator('[data-field="Independent hit pattern"]').selectOption('mixed');
      assert.ok(await lab.evaluate((el) => el._hitResult.events.some((e) => e.kind === 'fill')));
      assert.equal(await lab.evaluate((el) => el._hitResult.bytes), 4 * 64 + 12 * 8);
    });
    await check('forwarding false alias, unavailable data and speculation', async () => {
      await route('stores/forwarding');
      const lab = page.locator('#stores--forwarding');
      await lab.locator('[data-field="Store data ready"]').selectOption('0');
      assert.match(await lab.locator('.perf-explanation h3').textContent(), /wait/);
      await lab.locator('[data-field="Load address"]').selectOption('8192');
      assert.equal(await lab.evaluate((el) => el._forwardResult.lowMatch), true);
      await lab.locator('[data-field="Store address known"]').selectOption('0');
      await lab.locator('[data-field="Unresolved-store policy (model)"]').selectOption('1');
      assert.match(await lab.locator('.perf-explanation h3').textContent(), /succeeds/);
    });
    await check('mergeable misses and SMT allocation controls', async () => {
      await route('core/miss-entries');
      const miss = page.locator('#core--miss-entries');
      assert.ok(await miss.evaluate((el) => el._missResult.blocked > 0));
      await miss.locator('[data-field="Miss pattern"]').selectOption('one');
      assert.equal(await miss.evaluate((el) => el._missResult.requests), 1);
      await route('core/smt');
      const smt = page.locator('#core--smt');
      const shared = await smt.evaluate((el) => el._smtResult.aCycles);
      await smt.locator('[data-field="Load-slot allocation (model)"]').selectOption('partitioned');
      assert.ok(await smt.evaluate((el, n) => el._smtResult.aCycles < n, shared));
    });
    await check('fill pressure and useful-versus-line store bytes', async () => {
      await route('hier/write-pressure');
      const lab = page.locator('#hier--write-pressure');
      const before = await lab.evaluate((el) => el._pressureResult.cycles);
      await lab.locator('[data-field="Cycles per 64-byte writeback"]').selectOption('2');
      assert.ok(await lab.evaluate((el, n) => el._pressureResult.cycles < n, before));
      await route('stores/write-traffic');
      const traffic = page.locator('#stores--write-traffic');
      await traffic.locator('[data-field="Working-set lines"]').selectOption('4');
      const a = await traffic.evaluate((el) => el._trafficResult.counts.totalLineBytes);
      await traffic.locator('[data-field="Full passes"]').selectOption('8');
      assert.equal(await traffic.evaluate((el) => el._trafficResult.counts.totalLineBytes), a);
      await traffic.locator('[data-field="Useful store bytes per line"]').selectOption('8');
      assert.match(await traffic.textContent(), /no numerical claim/);
    });
    await check('ownership, false sharing, dirty peers and lock waiting policy', async () => {
      await route('coh/transactions');
      const lab = page.locator('#coh--transactions');
      assert.ok(await lab.evaluate((el) => el._coherenceResult.stats.ownershipMoves > 0));
      await lab.locator('[data-field="Counter layout"]').selectOption('padded');
      assert.equal(await lab.evaluate((el) => el._coherenceResult.stats.ownershipMoves), 0);
      await lab.locator('[data-field="Thread placement"]').selectOption('smt');
      assert.equal(await lab.evaluate((el) => el._coherenceResult.p.cores), 1);
      await lab.locator('[data-field="Thread placement"]').selectOption('four');
      await lab.locator('[data-field="Operation sequence"]').selectOption('peer');
      assert.ok(await lab.evaluate((el) => el._coherenceResult.stats.peerBytes > 0));
      await lab.getByLabel('Coherence event', { exact: true }).fill('2');
      assert.match(await lab.locator('.coherence-state h3').textContent(), /Event 3/);
      await page.screenshot({ path: path.join(output, 'coherence-dark-desktop.png') });
      await route('stores/locks');
      const lock = page.locator('#stores--locks');
      const moves = await lock.evaluate((el) => el._lockResult.stats.ownershipMoves);
      await lock.locator('[data-field="Waiting policy"]').selectOption('read');
      assert.ok(await lock.evaluate((el, n) => el._lockResult.stats.ownershipMoves < n, moves));
    });
    await check(
      'atomic native result import retains context and rejects invalid counts',
      async () => {
        const fixture = path.join(output, 'sharing-smoke.json');
        execFileSync('python3', ['benchmarks/sharing.py', '--quick', '--output', fixture], {
          cwd: root,
          stdio: 'pipe'
        });
        await route('coh/transactions');
        const input = page.getByLabel('Atomic counter result JSON', { exact: true });
        await input.setInputFiles(fixture);
        await page.waitForFunction(() =>
          document
            .querySelector('#coh--transactions [role=status]')
            .textContent.startsWith('Measured data')
        );
        assert.ok((await page.locator('.sharing-results tbody tr').count()) >= 6);
        const bad = JSON.parse(fs.readFileSync(fixture));
        bad.samples[0].checksum = 0;
        await input.setInputFiles({
          name: 'bad.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(bad))
        });
        await page.waitForFunction(() =>
          document
            .querySelector('#coh--transactions [role=status]')
            .textContent.startsWith('Could not import')
        );
      }
    );
    await check('extension section navigation preserves lazy chapter state', async () => {
      await route('l1d/taxonomy');
      await page.locator('#crumbSec').click();
      await page
        .locator('#secMenu button')
        .filter({ hasText: 'Split accesses and finite hit throughput' })
        .click();
      await page.waitForURL('**#l1d/split');
      await page.evaluate(() => App.go('core'));
      await page.waitForFunction(() => document.querySelector('.ch.show').id === 'ch-core');
      await page.evaluate(() => App.go('l1d'));
      await page.waitForFunction(() => document.querySelector('.ch.show').id === 'ch-l1d');
      assert.equal(await page.locator('#l1d--taxonomy').count(), 1);
    });
    await check('controller scheduling, write draining, refresh and input validation', async () => {
      await route('dram/controller');
      const lab = page.locator('#dram--controller');
      assert.equal(await lab.evaluate((el) => el._controllerResult.requests.length), 48);
      await lab
        .getByRole('button', { name: 'Compare both schedulers on this trace', exact: true })
        .click();
      assert.equal(await lab.locator('.controller-comparison tbody tr').count(), 2);
      await lab.getByRole('button', { name: 'Sweep offered load', exact: true }).click();
      assert.equal(await lab.locator('.controller-comparison tbody tr').count(), 7);
      await lab.locator('[data-field="Refresh interval (0 = off)"]').selectOption('64');
      assert.ok(await lab.evaluate((el) => el._controllerResult.stats.refreshes > 0));
      await lab.locator('[data-field="Independent channels"]').selectOption('2');
      assert.equal(await lab.evaluate((el) => el._controllerResult.p.channels), 2);
      await lab.getByLabel('Controller clock', { exact: true }).fill('40');
      assert.match(await lab.locator('.queue-state h3').textContent(), /Clock 40/);
      await page.screenshot({ path: path.join(output, 'controller-dark-desktop.png') });
      await lab.getByText('Edit exact request arrivals and coordinates', { exact: true }).click();
      await lab.getByRole('button', { name: 'Five-request audit example', exact: true }).click();
      assert.equal(await lab.evaluate((el) => el._controllerResult.requests.length), 5);
      const event = page.waitForEvent('download');
      await lab.getByRole('button', { name: 'Export model result JSON', exact: true }).click();
      const file = await event;
      await file.saveAs(path.join(output, 'controller-model.json'));
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(output, 'controller-model.json'))).schema,
        'memory-lab-controller-model-v1'
      );
      await lab.getByLabel('Controller request table', { exact: true }).fill('A 0 9 0 0 1 R');
      await lab.getByRole('button', { name: 'Apply edited requests', exact: true }).click();
      assert.match(await lab.locator('[role=status]').first().textContent(), /Could not run/);
      assert.equal(
        await lab
          .getByRole('button', { name: 'Export model result JSON', exact: true })
          .isDisabled(),
        true
      );
    });
    await check('loaded-latency native import and accounting rejection', async () => {
      const fixture = path.join(output, 'loaded-smoke.json');
      execFileSync('python3', ['benchmarks/loaded.py', '--quick', '--output', fixture], {
        cwd: root,
        stdio: 'pipe'
      });
      await route('dram/controller');
      const input = page.getByLabel('Loaded latency result JSON', { exact: true });
      await input.setInputFiles(fixture);
      await page.waitForFunction(() =>
        document.querySelector('.loaded-status').textContent.startsWith('Measured data')
      );
      assert.ok((await page.locator('.loaded-results tbody tr').count()) >= 1);
      const bad = JSON.parse(fs.readFileSync(fixture));
      bad.samples[0].elapsed_ns = -1;
      await input.setInputFiles({
        name: 'bad.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(bad))
      });
      await page.waitForFunction(() =>
        document.querySelector('.loaded-status').textContent.startsWith('Could not import')
      );
    });
    await check(
      'VM lifecycle preserves COW values and history cannot mutate the present',
      async () => {
        await route('xlate/os');
        const lab = page.locator('#xlate--os');
        await lab.getByRole('button', { name: 'COW story', exact: true }).click();
        assert.deepEqual(
          await lab.evaluate((el) => {
            const s = el._vmResult;
            return [
              s.frames[s.processes.parent.ptes[0].frame].value,
              s.frames[s.processes.child.ptes[0].frame].value,
              s.stats.copyBytes
            ];
          }),
          [7, 42, 4096]
        );
        await lab.getByLabel('VM event', { exact: true }).fill('0');
        assert.equal(
          await lab.getByRole('button', { name: 'Write word', exact: true }).isDisabled(),
          true
        );
        const range = lab.getByLabel('VM event', { exact: true });
        await range.fill(await range.getAttribute('max'));
        assert.equal(
          await lab.getByRole('button', { name: 'Write word', exact: true }).isDisabled(),
          false
        );
        await lab.locator('[data-field="Acting process"]').selectOption('child');
        await lab.getByRole('button', { name: 'Protect read-only', exact: true }).click();
        await lab.getByRole('button', { name: 'Write word', exact: true }).click();
        assert.equal(await lab.evaluate((el) => el._vmResult.last.error), 'SIGSEGV');
        await lab.getByRole('button', { name: 'Shared file story', exact: true }).click();
        assert.equal(await lab.evaluate((el) => el._vmResult.file[0]), 42);
        assert.equal(await lab.evaluate((el) => el._vmResult.stats.writebackBytes), 4096);
        await lab.getByRole('button', { name: 'COW story', exact: true }).click();
        await lab.locator('.cache-state').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'vm-cow-dark-desktop.png') });
      }
    );
    await check('page-size outcomes and competing page-walk traffic', async () => {
      await route('xlate/pages');
      const pages = page.locator('#xlate--pages');
      assert.equal(await pages.evaluate((el) => el._pageResult.selected.misses), 1);
      await pages.locator('[data-field="Page access pattern"]').selectOption('sparse');
      assert.equal(await pages.evaluate((el) => el._pageResult.selected.misses), 512);
      await pages.locator('[data-field="Huge mapping outcome"]').selectOption('fallback');
      assert.equal(await pages.evaluate((el) => el._pageResult.selected.p.pageBytes), 4096);
      await pages.locator('[data-field="Huge mapping outcome"]').selectOption('unavailable');
      assert.equal(await pages.evaluate((el) => el._pageResult.selected), null);
      await route('xlate/walk-contention');
      const walks = page.locator('#xlate--walk-contention');
      await walks.locator('[data-field="Background data requests"]').selectOption('0');
      const idle = await walks.evaluate((el) => el._walkResult.tasks.at(-1).translated);
      await walks.locator('[data-field="Background data requests"]').selectOption('64');
      assert.ok(await walks.evaluate((el, t) => el._walkResult.tasks.at(-1).translated > t, idle));
      await walks.getByLabel('Walk model clock', { exact: true }).fill('20');
      assert.match(await walks.locator('.cache-state p').textContent(), /Clock 20/);
    });
    await check('shootdown masks, delayed acknowledgements and NUMA migration', async () => {
      await route('xlate/shootdown');
      const lab = page.locator('#xlate--shootdown');
      const base = await lab.evaluate((el) => el._shootdownResult.cycles);
      await lab.locator('[data-field="Last remote handler delay"]').selectOption('64');
      assert.ok(await lab.evaluate((el, t) => el._shootdownResult.cycles > t, base));
      await lab.locator('[data-field="Address-space CPU mask"]').selectOption('one');
      assert.equal(await lab.evaluate((el) => el._shootdownResult.ipis), 0);
      await route('hier/numa');
      const numa = page.locator('#hier--numa');
      assert.equal(await numa.evaluate((el) => el._numaResult.remote), 0);
      await numa.locator('[data-field="Executing CPU node"]').selectOption('1');
      assert.equal(await numa.evaluate((el) => el._numaResult.remote), 128);
      await numa.locator('[data-field="Page placement"]').selectOption('interleave');
      assert.equal(await numa.evaluate((el) => el._numaResult.remote), 64);
    });
    await check('native VM observations import with content and counter validation', async () => {
      const fixture = path.join(output, 'vm-smoke.json');
      execFileSync('python3', ['benchmarks/vm.py', '--quick', '--output', fixture], {
        cwd: root,
        stdio: 'pipe'
      });
      await route('xlate/os');
      const input = page.getByLabel('VM observation JSON', { exact: true });
      await input.setInputFiles(fixture);
      await page.waitForFunction(() =>
        document.querySelector('.vm-measurement-status').textContent.startsWith('Measured data')
      );
      assert.equal(await page.locator('.vm-results tbody tr').count(), 60);
      const bad = JSON.parse(fs.readFileSync(fixture));
      bad.samples[0].stages[0].checksum++;
      await input.setInputFiles({
        name: 'bad.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(bad))
      });
      await page.waitForFunction(() =>
        document.querySelector('.vm-measurement-status').textContent.startsWith('Could not import')
      );
    });
    await check('reference evidence filters retain product scope and unknowns', async () => {
      await route('map/reference');
      const lab = page.locator('#map--reference');
      assert.ok((await lab.locator('.evidence-claims .evidence-contract').count()) >= 8);
      await lab.locator('[data-field="Evidence category"]').selectOption('Unknown / undocumented');
      assert.equal(await lab.locator('.evidence-claims .evidence-contract').count(), 3);
      assert.match(await lab.locator('.evidence-claims').textContent(), /queue partitioning/);
    });
    await check('ordering witnesses change under TSO, relaxed rules and full fences', async () => {
      await route('stores/litmus');
      const lab = page.locator('#stores--litmus');
      assert.equal(await lab.evaluate((el) => el._orderingResult.targetAllowed), true);
      await lab.locator('[data-field="Full ordering points"]').selectOption('1');
      assert.equal(await lab.evaluate((el) => el._orderingResult.targetAllowed), false);
      await lab.locator('[data-field="Full ordering points"]').selectOption('0');
      await lab.locator('[data-field="Litmus case"]').selectOption('MP');
      assert.equal(await lab.evaluate((el) => el._orderingResult.targetAllowed), false);
      await lab.locator('[data-field="Ordering rules"]').selectOption('relaxed');
      assert.equal(await lab.evaluate((el) => el._orderingResult.targetAllowed), true);
      await lab.getByLabel('Ordering event', { exact: true }).fill('3');
      assert.match(await lab.locator('.ordering-state h3').textContent(), /Event 3/);
      await lab.locator('.ordering-program').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, 'ordering-dark-desktop.png') });
      await route('stores/language');
      const language = page.locator('#stores--language');
      await language.locator('[data-field="Publication in C11"]').selectOption('plain');
      assert.match(await language.locator('[role=status]').textContent(), /undefined behavior/);
      await language.locator('[data-field="Publication in C11"]').selectOption('release');
      await language.locator('[data-field="Value read from flag"]').selectOption('0');
      assert.match(
        await language.locator('[role=status]').textContent(),
        /does not read the payload/
      );
    });
    await check('cache inclusion and granule lenses expose different constraints', async () => {
      await route('hier/inclusion');
      const lab = page.locator('#hier--inclusion');
      assert.ok(await lab.evaluate((el) => el._inclusionResult.stats.backInvalidations > 0));
      await lab.locator('[data-field="LLC inclusion policy"]').selectOption('nine');
      assert.equal(await lab.evaluate((el) => el._inclusionResult.stats.backInvalidations), 0);
      await lab.getByLabel('Inclusion reference', { exact: true }).fill('5');
      assert.match(await lab.locator('.cache-state h3').textContent(), /private hit/);
      await lab.getByLabel('Inclusion read trace', { exact: true }).fill('9:A');
      await lab.getByRole('button', { name: 'Apply inclusion trace', exact: true }).click();
      assert.match(await lab.locator('[role=status]').textContent(), /thread 0 or 1/);
      await route('xlate/granules');
      const granule = page.locator('#xlate--granules');
      await granule
        .locator('[data-field="Hypothetical VIPT data-cache bytes"]')
        .selectOption('131072');
      await granule.locator('[data-field="Hypothetical VIPT ways"]').selectOption('4');
      assert.match(await granule.locator('tbody').textContent(), /Needs alias/);
    });
    await check(
      'two-run comparison matches work, retains context and rejects invalid accounting',
      async () => {
        const fixture = path.join(output, 'comparison-smoke.json');
        execFileSync('python3', ['benchmarks/run.py', '--quick', '--output', fixture], {
          cwd: root,
          stdio: 'pipe'
        });
        await route('perf/compare');
        await page.getByLabel('Architecture run A', { exact: true }).setInputFiles(fixture);
        await page.getByLabel('Architecture run B', { exact: true }).setInputFiles(fixture);
        await page.waitForFunction(() =>
          document.querySelector('.comparison-status').textContent.startsWith('Measured comparison')
        );
        assert.ok(
          await page
            .locator('#perf--compare')
            .evaluate(
              (el) =>
                el._comparisonRows.length > 0 && el._comparisonRows.every((q) => q.ratio === 1)
            )
        );
        const bad = JSON.parse(fs.readFileSync(fixture));
        bad.samples[0].steps++;
        await page
          .getByLabel('Architecture run B', { exact: true })
          .setInputFiles({
            name: 'bad.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(bad))
          });
        await page.waitForFunction(() =>
          document.querySelector('.comparison-status').textContent.startsWith('Could not compare')
        );
      }
    );
    await check('original L1 custom stores, reload and invalid inputs', async () => {
      await route('l1d/lookup');
      const chapter = page.locator('#ch-l1d');
      await chapter.getByLabel('virtual address', { exact: true }).fill('0x7ffd4a3c5e59');
      await chapter.locator('.l1go').click();
      assert.ok(await chapter.locator('.l1err').isVisible());
      await chapter.getByLabel('virtual address', { exact: true }).fill('0x7ffd4a3c5e58');
      await chapter.getByLabel('access operation').selectOption('st');
      await chapter.getByLabel('store value', { exact: true }).fill('987');
      await chapter.locator('.l1go').click();
      assert.equal(await chapter.locator('.l1err').isVisible(), false);
      await chapter.getByLabel('access operation').selectOption('ld');
      await chapter.locator('.l1go').click();
      assert.match(await chapter.locator('.narr').textContent(), /987/);
      await chapter.locator('.l1clr').click();
      const next = chapter.locator('.stepper-bar button').filter({ hasText: 'next →' });
      let steps = 0;
      while (!(await next.isDisabled()) && steps++ < 50) await next.click();
      assert.ok(steps > 10 && steps < 50);
      assert.match(await chapter.locator('.narr').textContent(), /43/);
    });
    for (const id of ['xlate', 'hier', 'dram', 'stores', 'coh', 'dev'])
      await check('original ' + id + ' scenarios and steppers', async () => {
        await route(id);
        const chapter = page.locator('#ch-' + id);
        const choices = chapter.locator('.seg button');
        for (let i = 0; i < (await choices.count()); i++) {
          await choices.nth(i).click();
          const pills = chapter.locator('.pills .pill');
          if (await pills.count()) await pills.last().click();
          assert.ok((await chapter.textContent()).length > 100);
        }
        if (!(await choices.count())) {
          const pills = chapter.locator('.pills .pill');
          if (await pills.count()) await pills.last().click();
        }
      });
    await check('original pipeline and prefetch controls', async () => {
      await route('core');
      for (const b of await page.locator('#ch-core .seg button').all()) await b.click();
      assert.match(await page.locator('#ch-core .core-events').textContent(), /groups\/cycle/);
      await route('pref');
      for (const b of await page.locator('#ch-pref .seg button').all()) await b.click();
      const cb = page.locator('#ch-pref input[type=checkbox]');
      if (await cb.count()) await cb.first().uncheck();
    });
    await check('glossary, popover, theme persistence, and configuration', async () => {
      await route('time');
      const term = page.locator('#ch-time dfn[data-g]').first();
      await term.click();
      assert.equal(await page.locator('#pop').isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#pop').isVisible(), false);
      await route('gloss');
      await page.getByLabel('Search the glossary').fill('Little');
      assert.match(await page.locator('.glist').textContent(), /Little/);
      await page.locator('#themeToggle').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      await page.reload();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      await route('e2e/critical');
      await page.screenshot({ path: path.join(output, 'critical-light-desktop.png') });
      await page.locator('#sidebar').hover();
      await page.locator('[data-open-cfg]').first().click();
      await page.locator('#cfg input[data-k=l2]').fill('18.5');
      await page.locator('#cfg input[data-k=l2]').dispatchEvent('change');
      assert.equal(await page.evaluate(() => App.CFG.l2), 18.5);
      await page.locator('#cfg input[data-k=l2]').fill('-1');
      await page.locator('#cfg input[data-k=l2]').dispatchEvent('change');
      assert.equal(await page.evaluate(() => App.CFG.l2), 18.5);
      await page.locator('#cfgReset').click();
      await page.locator('#cfgClose').click();
      await page.evaluate(() =>
        localStorage.setItem(
          'memE2E.cfg',
          JSON.stringify({ l1: -1, l2: 'Infinity', ghz: 0, dramNs: 1e100 })
        )
      );
      await page.reload();
      assert.deepEqual(
        await page.evaluate(() => [App.CFG.l1, App.CFG.l2, App.CFG.ghz, App.CFG.dramNs]),
        [4, 12, 4, 90]
      );
    });
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const theme of ['light', 'dark']) {
        if ((await page.locator('html').getAttribute('data-theme')) !== theme)
          await page.locator('#themeToggle').click();
        for (const id of [
          'start',
          'core',
          'xlate',
          'l1d',
          'hier',
          'dram',
          'stores',
          'coh',
          'pref',
          'dev',
          'e2e/critical',
          'e2e/steady',
          'perf/queues',
          'l1d/taxonomy',
          'l1d/split',
          'core/smt',
          'stores/forwarding',
          'coh/transactions',
          'dram/controller',
          'xlate/os',
          'xlate/pages',
          'xlate/walk-contention',
          'xlate/shootdown',
          'hier/numa',
          'map/reference',
          'stores/litmus',
          'stores/language',
          'hier/inclusion',
          'xlate/granules',
          'perf/compare',
          'gloss'
        ])
          await check(width + 'px ' + theme + ' ' + id, async () => {
            await route(id);
            assert.ok(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
              'document overflows viewport'
            );
            assert.equal(await page.locator('#themeToggle').isVisible(), true);
            if (id === 'dram/controller') {
              await page.locator('#dram--controller .queue-state').scrollIntoViewIfNeeded();
              await page.screenshot({
                path: path.join(output, 'controller-' + theme + '-' + width + '.png')
              });
            }
            if (id === 'coh/transactions')
              await page.screenshot({
                path: path.join(output, 'coherence-' + theme + '-' + width + '.png')
              });
            if (id === 'xlate/os') {
              await page
                .locator('#xlate--os')
                .getByRole('button', { name: 'COW story', exact: true })
                .click();
              await page.locator('#xlate--os .cache-state').scrollIntoViewIfNeeded();
              await page.screenshot({
                path: path.join(output, 'vm-' + theme + '-' + width + '.png')
              });
            }
            if (id === 'stores/litmus') {
              await page.locator('#stores--litmus .ordering-program').scrollIntoViewIfNeeded();
              await page.screenshot({
                path: path.join(output, 'ordering-' + theme + '-' + width + '.png')
              });
            }
            if (id === 'perf/queues')
              await page.screenshot({
                path: path.join(output, 'queues-' + theme + '-' + width + '.png')
              });
          });
      }
    }
    await check('mobile chapter navigation and section menu', async () => {
      await page.locator('#navToggle').click();
      await page.locator('#nav a[data-id=l1d]').click();
      await page.waitForFunction(
        () =>
          document.querySelector('.ch.show')?.id === 'ch-l1d' &&
          !document.body.classList.contains('nav-open')
      );
      await page.locator('#crumbSec').click();
      assert.equal(await page.locator('#secMenu').isVisible(), true);
      await page.keyboard.press('Escape');
    });
    assert.deepEqual(errors, [], 'uncaught browser errors');
    fs.writeFileSync(
      path.join(output, 'browser-report.json'),
      JSON.stringify({ browser: browser.version(), checked, failures, errors }, null, 2)
    );
    console.log(
      JSON.stringify(
        { browser: browser.version(), passed: checked.length, failures, errors },
        null,
        2
      )
    );
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
  .finally(() => server.close());
