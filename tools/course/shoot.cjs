/* usage: node tools/course/shoot.cjs <file.html> <out-prefix> <width> <theme> <full|view> hash1 [hash2 ...]
   Captures one PNG per hash. Prints page errors and horizontal overflow. */
'use strict';
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', 'node_modules', 'playwright'));
(async () => {
  const [file, prefix, width, theme, mode, ...hashes] = process.argv.slice(2);
  const fs = require('fs');
  const exe = process.env.BROWSER_BINARY || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, exe ? { executablePath: exe } : {}));
  const ctx = await browser.newContext({ viewport: { width: +width, height: +width < 500 ? 844 : 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await ctx.addInitScript((t) => { try { localStorage.setItem('memE2E.theme', t); } catch (e) {} }, theme);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  for (const hsh of hashes) {
    await page.goto('file://' + path.resolve(file) + '#' + hsh);
    await page.waitForTimeout(700);
    const ov = await page.evaluate(() => {
      const W = document.documentElement.clientWidth, bad = [];
      document.querySelectorAll('.ch.show *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > W + 1 && !el.closest('.scroller,.viz-frame,pre,.lx-scroll,table,.table-wrap')) bad.push(el.tagName + '.' + (el.className && el.className.baseVal === undefined ? el.className : '') + ' ' + Math.round(r.right));
      });
      return { doc: document.documentElement.scrollWidth, W, bad: bad.slice(0, 8) };
    });
    const out = prefix + '-' + hsh.replace(/[^a-z0-9]+/gi, '_') + '.png';
    await page.screenshot({ path: out, fullPage: mode === 'full' });
    console.log(out, 'docW=' + ov.doc, 'W=' + ov.W, ov.bad.length ? 'OVERFLOW ' + ov.bad.join(' | ') : '');
  }
  if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
  await browser.close();
})();
