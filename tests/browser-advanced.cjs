/* Phase 6 interaction and layout checks. Existing full regression runs first. */
'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results');fs.mkdirSync(output,{recursive:true});
const errors=[],failures=[],checked=[];
const routes=['code/fetch','pref/resources','dev/iotlb','dev/queues','dev/uring','hier/multisocket','dram/ecc','dram/disturbance','dram/refresh-tails','map/chiplets'];
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/plain');res.end(data);});});
async function main(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const options={headless:true};if(process.env.BROWSER_BINARY){options.executablePath=process.env.BROWSER_BINARY;options.args=['--no-sandbox','--disable-dev-shm-usage'];}if(process.env.BROWSER_ARGS)options.args=JSON.parse(process.env.BROWSER_ARGS);
  const browser=await chromium.launch(options);
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    async function route(id){await page.goto(base+'/memory_end_to_end.html#'+id);await page.waitForFunction(id=>document.querySelector('.ch.show')?.id==='ch-'+id.split('/')[0],id);await page.mouse.move(1100,500);await page.waitForTimeout(350);return page.locator('#'+id.replace('/','--'));}
    async function field(lab,name,value){await lab.locator('[data-field="'+name+'"]').selectOption(String(value));}
    async function scrub(lab,name,value){await lab.getByLabel(name,{exact:true}).fill(String(value));}
    async function check(name,fn){try{await fn();checked.push(name);}catch(e){failures.push(name+': '+e.message);await page.screenshot({path:path.join(output,'advanced-failure-'+failures.length+'.png')});}}
    await check('instruction footprint, op-cache and fetch replay',async()=>{
      const lab=await route('code/fetch'),dense=await lab.evaluate(el=>el._fetchResult.cycles);await field(lab,'Code blocks',32);await field(lab,'Distance between branch targets (bytes)',4096);assert.ok(await lab.evaluate((el,x)=>el._fetchResult.cycles>x,dense));await field(lab,'Model decoded-block entries',64);assert.equal(await lab.evaluate(el=>el._fetchResult.stats.opHits),96);await scrub(lab,'Instruction fetch block',3);assert.match(await lab.locator('.cache-state h3').textContent(),/Block 3/);
    });
    await check('prefetch sweep reveals pollution and finite competition',async()=>{
      const lab=await route('pref/resources');await field(lab,'Resource access pattern','hot');await field(lab,'Shared model cache lines',4);await field(lab,'Shared model miss entries',2);await field(lab,'Line launch interval (clocks)',16);await field(lab,'Resource prefetch distance',32);assert.ok(await lab.evaluate(el=>el._prefetchComparison.experiment.cycles>el._prefetchComparison.baseline.cycles));assert.ok(await lab.evaluate(el=>el._prefetchComparison.added>0));await lab.getByRole('button',{name:'Sweep prefetch distance',exact:true}).click();assert.equal(await lab.locator('.prefetch-sweep tbody tr').count(),7);await field(lab,'Resource access pattern','chase');assert.equal(await lab.evaluate(el=>el._prefetchComparison.experiment.stats.pfIssued),0);await scrub(lab,'Prefetch resource clock',20);assert.match(await lab.locator('.cache-state h3').textContent(),/Clock 20/);
    });
    await check('software-prefetch import validates independent checksum and work',async()=>{
      const fixture=path.join(output,'prefetch-smoke.json');execFileSync('python3',['benchmarks/prefetch.py','--quick','--output',fixture],{cwd:root,stdio:'pipe'});await route('pref/resources');const input=page.getByLabel('Native prefetch result JSON',{exact:true});await input.setInputFiles(fixture);await page.waitForFunction(()=>document.querySelector('.prefetch-status').textContent.startsWith('Measured software'));assert.equal(await page.locator('.prefetch-results tbody tr').count(),8);const bad=JSON.parse(fs.readFileSync(fixture));bad.samples[0].checksum='123';bad.samples[0].expected_checksum='123';await input.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await page.waitForFunction(()=>document.querySelector('.prefetch-status').textContent.startsWith('Could not import'));assert.equal(await page.locator('.prefetch-results tbody tr').count(),0);
    });
    await check('DMA quiescence, stale IOTLB and safe remapping replay',async()=>{
      const lab=await route('dev/iotlb');await scrub(lab,'DMA mapping event',4);assert.match(await lab.locator('.cache-state').textContent(),/old IOTLB translation/);await scrub(lab,'DMA mapping event',7);assert.match(await lab.locator('.cache-state').textContent(),/frame 31/);
    });
    await check('I/O reuse, completion polling, remote DMA and CQ backpressure',async()=>{
      const lab=await route('dev/queues');await field(lab,'Reused buffer pages',4);assert.equal(await lab.evaluate(el=>el._ioResult.stats.iotlbMisses),4);await field(lab,'Buffer IOVA lifetime',0);assert.equal(await lab.evaluate(el=>el._ioResult.stats.iotlbMisses),48);await field(lab,'Completion delivery','poll');await field(lab,'Polling interval',1);assert.equal(await lab.evaluate(el=>el._ioResult.stats.interrupts),0);assert.ok(await lab.evaluate(el=>el._ioResult.stats.polls>0));await field(lab,'DMA memory placement',1);assert.equal(await lab.evaluate(el=>el._ioResult.stats.remoteBytes),48*4096);await field(lab,'Completion delivery','irq');await field(lab,'Completion queue entries',1);await field(lab,'Interrupt moderation delay',64);assert.ok(await lab.evaluate(el=>el._ioResult.stats.cqBlocked>0));await scrub(lab,'I/O queue clock',20);assert.match(await lab.locator('.cache-state h3').textContent(),/Clock 20/);
    });
    await check('io_uring page-cache, direct path and polling mechanisms stay distinct',async()=>{
      const lab=await route('dev/uring');await field(lab,'File read path','hit');assert.ok(await lab.evaluate(el=>el._uringPath.some(q=>q[0]==='Serve the page cache')));assert.equal(await lab.evaluate(el=>el._uringPath.some(q=>q[0]==='Controller DMA')),false);await field(lab,'Kernel completion mechanism',1);assert.match(await lab.locator('[role=status]').textContent(),/Unsupported configuration/);await field(lab,'File read path','direct');await field(lab,'Submission mechanism',1);assert.ok(await lab.evaluate(el=>el._uringPath.some(q=>q[0]==='Kernel submission polling')));assert.ok(await lab.evaluate(el=>el._uringPath.some(q=>q[0]==='Poll supported device completions')));await field(lab,'Kernel completion mechanism',0);await field(lab,'File read path','miss');assert.ok(await lab.evaluate(el=>el._uringPath.some(q=>q[0]==='Copy buffered data')));
    });
    await check('multisocket placement, migration and vendor contrast references',async()=>{
      const lab=await route('hier/multisocket');await field(lab,'Server page placement','parallel');assert.equal(await lab.evaluate(el=>el._multisocketResult.stats.remote),0);await field(lab,'Worker migration',1);assert.equal(await lab.evaluate(el=>el._multisocketResult.stats.local),0);assert.equal(await lab.evaluate(el=>el._multisocketResult.stats.linkBytes),128*64);const chiplets=await route('map/chiplets');assert.match(await chiplets.textContent(),/Grace CPU Superchip/);assert.match(await chiplets.textContent(),/Xeon 6 P-cores/);assert.match(await chiplets.textContent(),/Neoverse V3/);assert.equal(await chiplets.locator('a[target=_blank]').count(),5);
    });
    await check('ECC injection covers correction, detection and beyond-guarantee aliasing',async()=>{
      const lab=await route('dram/ecc');await lab.getByRole('button',{name:'One data-bit flip',exact:true}).click();assert.equal(await lab.evaluate(el=>el._eccResult.payloadMatches),true);await lab.getByRole('button',{name:'Two flips',exact:true}).click();assert.match(await lab.locator('.cache-state').textContent(),/Double-bit/);await lab.getByRole('button',{name:'Three-flip limitation',exact:true}).click();assert.equal(await lab.evaluate(el=>el._eccResult.guaranteed),false);await lab.getByLabel('Flip ECC bit 8',{exact:true}).check();assert.equal(await lab.evaluate(el=>el._eccResult.syndrome),0);assert.equal(await lab.evaluate(el=>el._eccResult.payloadMatches),false);
    });
    await check('disturbance command trace makes no predicted bit-flip claim',async()=>{
      const lab=await route('dram/disturbance');await field(lab,'Disturbance command pattern','reopen');assert.equal(await lab.evaluate(el=>el._disturbanceCommands.filter(x=>x==='ACT aggressor').length),4);await scrub(lab,'Disturbance command',3);assert.match(await lab.locator('.cache-state').textContent(),/activation count/);await field(lab,'Disturbance command pattern','target');assert.equal(await lab.evaluate(el=>el._disturbanceCommands.filter(x=>x==='conceptual neighbor restoration').length),4);
    });
    await check('refresh tails reuse identical offered controller requests',async()=>{
      const lab=await route('dram/refresh-tails');assert.ok(await lab.evaluate(el=>el._refreshComparison.experiment.latency.p99>el._refreshComparison.baseline.latency.p99));await field(lab,'Tail experiment refresh busy time',40);await field(lab,'Tail experiment refresh interval',64);assert.ok(await lab.evaluate(el=>el._refreshComparison.experiment.stats.refreshes>0));await lab.locator('.advanced-chart').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'advanced-refresh-desktop.png')});
    });
    for(const width of [1440,768,390]){
      await page.setViewportSize({width,height:900});
      for(const theme of ['light','dark'])for(const id of routes)await check(width+'px '+theme+' advanced '+id,async()=>{
        const lab=await route(id);if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('#themeToggle').click();assert.equal(await lab.isVisible(),true);for(const select of await lab.locator('select').all())assert.notEqual(await select.inputValue(),'','selector has a blank initial value');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'unexpected document overflow');
        for(const ctl of await lab.locator('select,input[type=checkbox],button').all()){assert.ok(await ctl.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;}),'control outside viewport');}
        const view=lab.locator('.cache-state,.advanced-chart').first();if(await view.count())await view.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'advanced-'+id.replace('/','-')+'-'+theme+'-'+width+'.png')});
      });
    }
    await check('new sections appear in navigation and native protocol links exist',async()=>{
      await page.setViewportSize({width:1440,height:1000});await route('dev/queues');await page.locator('#crumbSec').click();assert.match(await page.locator('#secMenu').textContent(),/A DMA mapping has a lifetime/);await page.keyboard.press('Escape');const lab=await route('dev/uring');const href=await lab.getByRole('link',{name:'Reproduce a controlled io_uring / I/O queue experiment'}).getAttribute('href');assert.ok(fs.existsSync(path.join(root,href)));
    });
    fs.writeFileSync(path.join(output,'advanced-browser-report.json'),JSON.stringify({browser:browser.version(),checked,failures,errors},null,2));console.log(JSON.stringify({browser:browser.version(),passed:checked.length,failures,errors},null,2));assert.deepEqual(errors,[],'uncaught browser errors');assert.deepEqual(failures,[]);
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
