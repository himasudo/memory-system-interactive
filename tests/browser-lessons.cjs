/* Course lessons: every lesson renders without errors or overflow at 1440 px (dark) and 390 px
   (light), its margin notes do not overlap, its lesson links resolve, a quiz answer gives
   feedback, and "Mark as done" persists.
   npm run test:browser; optional BROWSER_BINARY for an installed Chromium. */
'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  output = path.join(root, 'test-results');
fs.mkdirSync(output, { recursive: true });
const errors = [],
  failures = [],
  checked = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost'),
    file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (e, data) => {
    if (e) {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain');
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
      await page.waitForTimeout(300);
    }
    async function check(name, fn) {
      try {
        await fn();
        checked.push(name);
      } catch (e) {
        failures.push(name + ': ' + e.message);
        await page.screenshot({ path: path.join(output, 'lesson-failure-' + failures.length + '.png') });
      }
    }
    await route('start');
    const lessons = await page.evaluate(() => App.chapters.map((c) => c.id).filter((id) => App.Course.lessons[id]));
    assert.ok(lessons.length >= 35, 'expected the Part III and Part VI lessons, got ' + lessons.length);

    for (const [width, theme] of [[1440, 'dark'], [390, 'light']]) {
      await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
      if ((await page.locator('html').getAttribute('data-theme')) !== theme) await page.locator('#themeToggle').click();
      for (const id of lessons)
        await check(width + 'px ' + theme + ' ' + id, async () => {
          await route(id);
          assert.ok(await page.locator('.ch.show h1').textContent());
          assert.ok(await page.locator('.ch.show .lx-sec').count() >= 4, 'fewer than 4 sections');
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            'document overflows the viewport'
          );
          const text = await page.locator('.ch.show').textContent();
          assert.ok(!/\[\[ch:|Chapter \?\?/.test(text), 'unresolved lesson link');
          if (width === 1440) {
            const overlaps = await page.evaluate(() => {
              const notes = [...document.querySelectorAll('.ch.show .lx-side')]
                .map((el) => el.getBoundingClientRect())
                .filter((r) => r.height > 0)
                .sort((a, b) => a.top - b.top);
              const bad = [];
              for (let i = 1; i < notes.length; i++) if (notes[i].top < notes[i - 1].bottom - 1) bad.push(i);
              return bad;
            });
            assert.deepEqual(overlaps, [], 'margin notes overlap');
          }
        });
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await check('a quiz answer shows feedback', async () => {
      await route('vm-walk');
      const q = page.locator('.ch.show .lx-check .lx-q').first();
      await q.locator('.lx-q-opt').first().click();
      assert.match(await q.locator('.lx-q-fb').textContent(), /^(Right\.|Not quite\.)/);
    });
    await check('Mark as done persists and shows in the navigation', async () => {
      await page.evaluate(() => localStorage.removeItem('memLab.done'));
      await route('io-paths');
      const toggle = page.locator('.ch.show .done-toggle').first();
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
      await page.reload();
      await route('io-paths');
      assert.equal(await page.locator('.ch.show .done-toggle').first().getAttribute('aria-pressed'), 'true');
      assert.ok(await page.locator('#nav a[data-id="io-paths"].done').count() >= 1, 'not marked in the navigation');
      await page.evaluate(() => localStorage.removeItem('memLab.done'));
    });

    assert.deepEqual(errors, [], 'uncaught browser errors');
    fs.writeFileSync(
      path.join(output, 'lessons-browser-report.json'),
      JSON.stringify({ browser: browser.version(), checked, failures, errors }, null, 2)
    );
    console.log(JSON.stringify({ browser: browser.version(), passed: checked.length, failures, errors }, null, 2));
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
