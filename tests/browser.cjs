/* Render every chapter and exercise the original and Phase 1 state machines.
   npm run test:browser; optional BROWSER_BINARY for an installed Chromium. */
'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results');fs.mkdirSync(output,{recursive:true});
const errors=[], failures=[], checked=[];
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/plain');res.end(data);});
});
async function main(){
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const options={headless:true};if(process.env.BROWSER_BINARY){options.executablePath=process.env.BROWSER_BINARY;options.args=['--no-sandbox','--disable-dev-shm-usage'];}
 if(process.env.BROWSER_ARGS)options.args=JSON.parse(process.env.BROWSER_ARGS);
 const browser=await chromium.launch(options);
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  async function route(id){await page.goto(base+'/memory_end_to_end.html#'+id);await page.waitForFunction(id=>document.querySelector('.ch.show')?.id==='ch-'+id.split('/')[0],id);await page.mouse.move(1100,500);await page.waitForTimeout(450);}
  async function check(name,fn){try{await fn();checked.push(name);}catch(e){failures.push(name+': '+e.message);await page.screenshot({path:path.join(output,'failure-'+failures.length+'.png')});}}
  await route('start');const ids=await page.evaluate(()=>App.chapters.map(c=>c.id));assert.equal(ids.length,24);
  for(const id of ids)await check('desktop route '+id,async()=>{
    await route(id);assert.ok(await page.locator('.ch.show h1').textContent());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'unexpected document overflow');
    assert.equal(await page.locator('.ch.show').count(),1);
  });
  await check('original routes retain chapter numbers',async()=>{assert.deepEqual(await page.evaluate(()=>['start','map','core','l1d','e2e','perf'].map(id=>App.chNum(id))),['00','09','11','13','20','21']);});
  await check('redirect preserves section hash',async()=>{await page.goto(base+'/#perf/queues');await page.waitForURL('**/memory_end_to_end.html#perf/queues');await page.waitForTimeout(500);assert.equal(await page.locator('.ch.show').getAttribute('id'),'ch-perf');});
  await check('e2e modes, deep links, row timing and section menu',async()=>{
    await route('e2e/critical');assert.equal(await page.locator('#ch-e2e .learning-scene:visible').count(),1);
    assert.equal(await page.locator('#e2e--critical').isVisible(),true);
    await page.locator('#ch-e2e [data-field="Data source"]').selectOption('L1');
    await page.locator('#ch-e2e [data-field="Independent older work (cycles)"]').selectOption('512');
    assert.match(await page.locator('#ch-e2e .e2e-critical .perf-metrics').textContent(),/520 cycles/);
    await page.locator('[data-mode="steady"]').click();await page.waitForTimeout(500);assert.equal(await page.locator('#e2e--steady').isVisible(),true);assert.equal(await page.locator('#ch-e2e .learning-scene:visible').count(),1);
    await page.locator('[data-mode="single"]').click();await page.waitForTimeout(500);assert.equal(await page.locator('#ch-e2e .learning-scene:visible').count(),4);
    await page.locator('#ch-e2e .seg button').filter({hasText:'open (row hit)'}).click();
    const a=await page.locator('#e2e--scenario svg text').first().textContent();
    await page.locator('#ch-e2e .seg button').filter({hasText:'conflict'}).click();
    const b=await page.locator('#e2e--scenario svg text').first().textContent();assert.notEqual(a,b);
    await page.locator('#crumbSec').click();await page.locator('#secMenu button').filter({hasText:'Inspect the serialized steps'}).click();assert.match(page.url(),/#e2e\/steps$/);
  });
  await check('finite queues, sweep, trace and pressure presets',async()=>{
    await route('perf/queues');const lab=page.locator('#perf--queues');
    await lab.getByRole('button',{name:'One chain',exact:true}).click();
    const one=await lab.locator('.stream-lab').evaluate(el=>el._simulation.throughput);
    await lab.locator('[data-field="Independent chains"]').selectOption('8');
    assert.ok(await lab.locator('.stream-lab').evaluate((el,one)=>el._simulation.throughput>one*3,one));
    await lab.getByRole('button',{name:'Controller pressure',exact:true}).click();
    assert.ok(await lab.locator('.stream-lab').evaluate(el=>el._simulation.stalls.controller>0));
    await lab.getByRole('button',{name:'Return-link pressure',exact:true}).click();
    assert.ok(await lab.locator('.stream-lab').evaluate(el=>el._simulation.stalls.fill>0));
    await lab.getByRole('button',{name:/Sweep 1/}).click();assert.equal(await lab.locator('.perf-sweep tbody tr').count(),6);
    await lab.getByRole('button',{name:'Restart trace',exact:true}).click();assert.match(await lab.locator('.queue-state h3').textContent(),/Cycle 0 /);
    await lab.getByLabel('Trace cycle',{exact:true}).fill('25');assert.match(await lab.locator('.queue-state h3').textContent(),/Cycle 25 /);
    await lab.getByRole('button',{name:'Play trace',exact:true}).click();await page.waitForTimeout(250);await lab.getByRole('button',{name:'Pause trace',exact:true}).click();
    await page.screenshot({path:path.join(output,'queues-dark-desktop.png')});
  });
  await check('prediction and Little law calculator',async()=>{
    await route('perf/predict');const section=page.locator('#perf--predict');assert.match(await section.locator('.perf-metrics').textContent(),/25.0 lines/);
    await section.locator('[data-field="Target line bandwidth (GB/s)"]').selectOption('40');assert.match(await section.locator('.perf-metrics').textContent(),/50.0 lines/);
    await section.getByRole('button',{name:'No: independent loads can overlap',exact:true}).click();assert.match(await section.locator('[aria-live]').last().textContent(),/matches this model/);
  });
  await check('native JSON import and safe validation',async()=>{
    const fixture=path.join(output,'native-smoke.json');execFileSync('python3',['benchmarks/run.py','--quick','--output',fixture],{cwd:root,stdio:'pipe'});
    await route('perf/measure');const input=page.getByLabel('Benchmark result JSON',{exact:true});await input.setInputFiles(fixture);
    await page.waitForFunction(()=>document.querySelector('#perf--measure [role=status]').textContent.startsWith('Measured data'));
    assert.equal(await page.locator('.measurement-results tbody tr').count(),12);
    const adversarial=JSON.parse(fs.readFileSync(fixture));adversarial.context.cpu_model='<img src=x onerror="window.injected=true">';
    await input.setInputFiles({name:'untrusted.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(adversarial))});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.injected),undefined);
    await input.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schema":"memory-lab-v1","context":{},"samples":[{"mode":"chase","elapsed_ns":0}]}')});await page.waitForTimeout(100);assert.match(await page.locator('#perf--measure [role=status]').textContent(),/Could not import/);
  });
  await check('original L1 custom stores, reload and invalid inputs',async()=>{
    await route('l1d/lookup');const chapter=page.locator('#ch-l1d');
    await chapter.getByLabel('virtual address',{exact:true}).fill('0x7ffd4a3c5e59');await chapter.locator('.l1go').click();assert.ok(await chapter.locator('.l1err').isVisible());
    await chapter.getByLabel('virtual address',{exact:true}).fill('0x7ffd4a3c5e58');await chapter.getByLabel('access operation').selectOption('st');await chapter.getByLabel('store value',{exact:true}).fill('987');await chapter.locator('.l1go').click();
    assert.equal(await chapter.locator('.l1err').isVisible(),false);
    await chapter.getByLabel('access operation').selectOption('ld');await chapter.locator('.l1go').click();assert.match(await chapter.locator('.narr').textContent(),/987/);
    await chapter.locator('.l1clr').click();
    const next=chapter.locator('.stepper-bar button').filter({hasText:'next →'});
    let steps=0;while(!await next.isDisabled() && steps++<50)await next.click();
    assert.ok(steps>10 && steps<50);assert.match(await chapter.locator('.narr').textContent(),/43/);
  });
  for(const id of ['xlate','hier','dram','stores','coh','dev'])await check('original '+id+' scenarios and steppers',async()=>{
    await route(id);const chapter=page.locator('#ch-'+id);
    const choices=chapter.locator('.seg button');for(let i=0;i<await choices.count();i++){await choices.nth(i).click();const pills=chapter.locator('.pills .pill');if(await pills.count())await pills.last().click();assert.ok((await chapter.textContent()).length>100);}
    if(!await choices.count()){const pills=chapter.locator('.pills .pill');if(await pills.count())await pills.last().click();}
  });
  await check('original pipeline and prefetch controls',async()=>{
    await route('core');for(const b of await page.locator('#ch-core .seg button').all())await b.click();assert.match(await page.locator('#ch-core .core-events').textContent(),/groups\/cycle/);
    await route('pref');for(const b of await page.locator('#ch-pref .seg button').all())await b.click();
    const cb=page.locator('#ch-pref input[type=checkbox]');if(await cb.count())await cb.first().uncheck();
  });
  await check('glossary, popover, theme persistence, and configuration',async()=>{
    await route('time');const term=page.locator('#ch-time dfn[data-g]').first();await term.click();assert.equal(await page.locator('#pop').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#pop').isVisible(),false);
    await route('gloss');await page.getByLabel('Search the glossary').fill('Little');assert.match(await page.locator('.glist').textContent(),/Little/);
    await page.locator('#themeToggle').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await route('e2e/critical');await page.screenshot({path:path.join(output,'critical-light-desktop.png')});
    await page.locator('#sidebar').hover();await page.locator('[data-open-cfg]').first().click();await page.locator('#cfg input[data-k=l2]').fill('18.5');await page.locator('#cfg input[data-k=l2]').dispatchEvent('change');assert.equal(await page.evaluate(()=>App.CFG.l2),18.5);
    await page.locator('#cfg input[data-k=l2]').fill('-1');await page.locator('#cfg input[data-k=l2]').dispatchEvent('change');assert.equal(await page.evaluate(()=>App.CFG.l2),18.5);
    await page.locator('#cfgReset').click();await page.locator('#cfgClose').click();
    await page.evaluate(()=>localStorage.setItem('memE2E.cfg',JSON.stringify({l1:-1,l2:'Infinity',ghz:0,dramNs:1e100})));await page.reload();assert.deepEqual(await page.evaluate(()=>[App.CFG.l1,App.CFG.l2,App.CFG.ghz,App.CFG.dramNs]),[4,12,4,90]);
  });
  for(const width of [390,768]){
    await page.setViewportSize({width,height:844});
    for(const theme of ['light','dark']){
      if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#themeToggle').click();
      for(const id of ['start','core','xlate','l1d','hier','dram','stores','coh','pref','dev','e2e/critical','e2e/steady','perf/queues','gloss'])await check(width+'px '+theme+' '+id,async()=>{
        await route(id);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document overflows viewport');
        assert.equal(await page.locator('#themeToggle').isVisible(),true);
        if(id==='perf/queues')await page.screenshot({path:path.join(output,'queues-'+theme+'-'+width+'.png')});
      });
    }
  }
  await check('mobile chapter navigation and section menu',async()=>{await page.locator('#navToggle').click();await page.locator('#nav a[data-id=l1d]').click();await page.waitForFunction(()=>document.querySelector('.ch.show')?.id==='ch-l1d'&&!document.body.classList.contains('nav-open'));await page.locator('#crumbSec').click();assert.equal(await page.locator('#secMenu').isVisible(),true);await page.keyboard.press('Escape');});
  assert.deepEqual(errors,[],'uncaught browser errors');
  fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify({browser:browser.version(),checked,failures,errors},null,2));
  console.log(JSON.stringify({browser:browser.version(),passed:checked.length,failures,errors},null,2));
  assert.deepEqual(failures,[]);
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
