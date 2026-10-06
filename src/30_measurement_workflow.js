/* Optional measured machines and browser-local visitor import. GETs only. */
(function(){
  'use strict';
  var U=App.LabUI,h=App.h,M=MeasurementBundle,listeners=[],state={reference:null,datasets:[],selected:null,yours:null,source:null,referenceStatus:'Checking for optional measured machines…',yourStatus:'No local result bundle loaded.'};
  var validators={memory:App.Performance.validateMeasurement,sharing:App.SharingLab.validate,loaded:App.ControllerUI.validate,vm:App.VMUI.validate,prefetch:App.AdvancedUI.validatePrefetch};
  function emit(){
    // Populating an earlier measurement section must not move the reader away.
    var scenes=Array.from(document.querySelectorAll('.ch.show .learning-scene')).filter(function(el){return !el.hidden;}),anchor=scenes[0];
    scenes.forEach(function(el){if(el.getBoundingClientRect().top<=100)anchor=el;});
    var before=anchor&&anchor.getBoundingClientRect().top;
    listeners.forEach(function(fn){fn();});
    if(anchor)window.scrollBy(0,anchor.getBoundingClientRect().top-before);
  }
  function onChange(fn){listeners.push(fn);fn();}
  function quick(bundle){return Object.values(bundle.suites).some(function(s){return s.runs.some(function(r){return r.result.context.quick;});});}
  function label(which,bundle){return (which==='reference'?'Optional measured machine':state.source==='local'?'Your machine · automatic local run':'Your machine · local visitor import')+' · '+bundle.machine.cpu_model+(quick(bundle)?' · QUICK CHECKS':'')+(bundle.complete?'':' · PARTIAL BUNDLE');}
  function entries(name){var out=[];['reference','yours'].forEach(function(which){var bundle=state[which];if(!bundle)return;bundle.suites[name].runs.forEach(function(run){out.push({result:run.result,label:label(which,bundle)+' · '+run.placement.kind+' · CPUs '+run.placement.cpus.join(', '),placement:run.placement,environment:bundle.suites[name].environment});});});return out;}
  function bind(name,status,out,render){var empty=status.textContent;onChange(function(){var rows=entries(name);out.replaceChildren();status.textContent=empty;rows.forEach(function(row){render(row.result,row.label);if(row.environment)U.text('p',out,'Suite elapsed '+(row.environment.elapsed_ns/1e9).toFixed(3)+' s (runner/compilation/collection, separate from kernel timing). '+row.environment.warnings.length+' observed environment changes · potential confounds only. Inspect Results for the readings.',{'class':'measurement-environment-note'});});if(rows.length)status.textContent='Measured data · '+rows.map(function(r){return r.label;}).join(' | ');});}
  function accept(which,bundle,source,entry){M.validate(bundle,validators);if(which==='reference'&&(!entry||!MeasuredRegistry.matches(entry,bundle.machine)))throw new Error('Dataset disagrees with its registry CPU identity.');state[which]=bundle;if(which==='yours')state.source=source;emit();}
  async function importFile(file){if(!file)return;if(file.size>32*1024*1024)throw new Error('Maximum bundle size is 32 MiB.');var bundle=JSON.parse(await file.text());accept('yours',bundle,'visitor');state.yourStatus='Locally imported result bundle · Not uploaded · kept in this page session only.';emit();}
  async function readBundle(url,limit){var response=await fetch(url,{method:'GET',credentials:'omit',cache:'no-store',mode:'same-origin'});if(response.status===404)return null;if(!response.ok)throw new Error('Read failed (HTTP '+response.status+').');var text=await response.text();if(text.length>(limit||32*1024*1024))throw new Error('Dataset exceeds its size limit.');return JSON.parse(text);}
  async function automatic(){if(location.protocol==='file:'){state.referenceStatus='Open through a local server to load measured datasets automatically.';emit();return;}
    var reference=async function(){try{
      var registry=await readBundle(new URL('data/reference/index.json',location.href),32768);
      if(!registry){state.referenceStatus='No optional measured datasets are shipped.';emit();return;}
      MeasuredRegistry.validate(registry);
      state.datasets=await Promise.all(registry.machines.map(async function(entry){try{
        var bundle=await readBundle(new URL('data/reference/'+entry.file,location.href));
        if(!bundle)throw new Error('Dataset file is absent.');
        M.validate(bundle,validators);if(!MeasuredRegistry.matches(entry,bundle.machine))throw new Error('Dataset disagrees with its registry CPU identity.');
        return {entry:entry,bundle:bundle,status:'available',reason:''};
      }catch(e){return {entry:entry,bundle:null,status:'unavailable',reason:e.message};}}));
      var available=state.datasets.find(function(d){return d.bundle;});
      if(available)selectDataset(available.entry.id);
      else state.referenceStatus=state.datasets.length?'Optional datasets unavailable: '+state.datasets.map(function(d){return d.entry.label+': '+d.reason;}).join(' | '):'No optional measured datasets are shipped.';
    }catch(e){state.referenceStatus='Measured-machine registry unavailable: '+e.message;}emit();};

    var local=async function(){if(new URLSearchParams(location.search).get('local')!=='1'||!['localhost','127.0.0.1','[::1]'].includes(location.hostname))return;try{var bundle=await readBundle(new URL('/__memory_lab__/bundle.json',location.origin));if(bundle){if(state.source!=='visitor'){accept('yours',bundle,'local');state.yourStatus='New native run loaded automatically · Not uploaded.';}}else state.yourStatus='Local bundle endpoint is unavailable; visitor and per-suite imports remain available.';}catch(e){state.yourStatus='Local bundle unavailable: '+e.message;}emit();};
    await Promise.all([reference(),local()]);
  }
  function selectDataset(id){var dataset=state.datasets.find(function(d){return d.entry.id===id;});state.selected=dataset?dataset.entry.id:null;state.reference=dataset&&dataset.bundle||null;state.referenceStatus=dataset?(dataset.bundle?'Optional measured dataset shipped with the site.':'Selected dataset unavailable: '+dataset.reason):'No optional measured dataset selected.';emit();}
  App.Measurements={bind:bind,entries:entries,onChange:onChange,importFile:importFile,state:state,selectDataset:selectDataset};
  function build(root){var sec=App.labSection(root,'datasets','Measure your machine','Reproduce selected experiments on Linux; compare compatible optional measured datasets privately.');
    U.badge(sec,'Measured data · separate from simulations and documented architecture facts');
    U.code(sec,'python3 benchmarks/run_all.py\n# Run and open the lab with all results loaded:\npython3 benchmarks/run_all.py --serve');
    U.text('p',sec,'One command selects permitted physical cores and SMT siblings, runs the safe native suites and retains raw JSON plus one aggregate bundle (the compatibility filename is results/reference-machine.json). Optional evidence keeps its exact scope. Quick runs check the harness; they do not characterize the machine.');
    var cards=h('div',{'class':'dataset-cards'},sec),reference=h('article',{'class':'dataset-card reference-machine'},cards),yours=h('article',{'class':'dataset-card your-machine'},cards);
    U.text('h3',reference,'Optional measured machine');U.text('p',reference,'A recorded hardware experiment shipped with the site; not a universal architecture reference.');var datasetControl=h('div',{'class':'perf-controls'},reference),datasetSelect=U.select(datasetControl,'Optional measured dataset',[],'',selectDataset);var refModel=U.text('p',reference,'No dataset selected'),refStatus=U.text('p',reference,'',{role:'status','class':'reference-dataset-status'}),refDetail=h('div',null,reference);
    U.text('h3',yours,'Your machine');var yourModel=U.text('p',yours,'Locally imported result bundle'),yourStatus=U.text('p',yours,'',{role:'status','class':'your-dataset-status'}),yourDetail=h('div',null,yours);
    U.text('p',yours,'Not uploaded. Files are read in your browser and kept in this page session. Importing does not change shipped datasets, the repository, deployed site or anyone else’s view.',{'class':'dataset-privacy'});
    var inputLabel=h('label',{'class':'perf-field'},yours);U.text('span',inputLabel,'Import your benchmark bundle');var input=h('input',{type:'file',accept:'.json,application/json','aria-label':'Your benchmark bundle'},inputLabel),remove=U.text('button',yours,'Clear your data',{type:'button'}),importStatus=U.text('p',yours,'',{role:'status','class':'bundle-import-status'});
    input.onchange=async function(){try{await importFile(input.files[0]);importStatus.textContent='Imported locally. No upload.';}catch(e){importStatus.textContent='Could not import: '+e.message;}};
    remove.onclick=function(){state.yours=null;state.source=null;state.yourStatus='No local result bundle loaded.';input.value='';importStatus.textContent='Your data cleared from this page.';emit();};
    yours.appendChild(yourDetail);
    U.text('h3',sec,'Compare matching experiments');U.text('p',sec,'Only cases with matching source, flags, work, seed, timing boundaries, quick/full mode and placement relationships are paired. CPU numbers may differ between machines. Ratios describe these trials; clocks, compiler versions, page policy and background activity can still differ. PMU counts from a different interval are never divided by kernel time.');
    var controls=h('div',{'class':'perf-controls'},sec),name='memory';U.select(controls,'Measured suite',[['memory','Memory / MLP'],['sharing','Atomic sharing'],['loaded','Loaded latency'],['vm','VM observations'],['prefetch','Software prefetch']],'memory',function(v){name=v;drawComparison();});
    var comparisonStatus=U.text('p',sec,'',{role:'status','class':'bundle-comparison-status'}),comparison=h('div',{'class':'bundle-comparison'},sec);
    U.text('p',sec,'Every chapter’s existing per-suite file input remains available as a local fallback. Aggregate datasets populate the native measurement sections automatically; teaching models keep their configured inputs.');
    var links=h('div',{'class':'dataset-links'},sec);[['Memory / MLP','#perf/measure'],['Atomic sharing','#coh/transactions'],['Loaded latency','#dram/controller'],['VM observations','#xlate/os'],['Software prefetch','#pref/resources']].forEach(function(link){U.text('a',links,link[0],{href:link[1]});});
    function detail(box,bundle){
      box.replaceChildren();if(!bundle)return;
      var rows=Object.keys(M.schemas).map(function(k){var s=bundle.suites[k];return [k,s.status,s.runs.reduce(function(n,r){return n+r.result.samples.length;},0),s.reason||'Recorded raw trials'];});
      U.text('p',box,(bundle.complete?'Selected suites complete':'Partial bundle; inspect availability')+(quick(bundle)?' · Quick checks only; not characterization.':''));
      var e=bundle.environment;
      U.text('p',box,e?'Environment telemetry · '+e.warnings.length+' observed changes. Potential confounds; no causal diagnosis or discarded trials.':'Environment telemetry was not recorded by this bundle version.',{'class':'environment-summary'});
      if(e){var env=h('details',{'class':'environment-details'},box);U.text('summary',env,'Environment changes, snapshots and suite durations');U.text('p',env,'Reported frequency snapshots can differ from actual running frequency and are not averages during the timed work. Named temperatures do not establish thermal throttling. Missing readings do not establish stable conditions.');if(e.warnings.length)U.table(env,['Scope / observed field','Observed change'],e.warnings.map(function(w){return [w.scope+' · '+w.field,w.message];}));U.table(env,['Suite','Start (UTC)','Finish (UTC)','Elapsed seconds'],Object.keys(M.schemas).filter(function(k){return bundle.suites[k].environment;}).map(function(k){var v=bundle.suites[k].environment;return [k,v.started_utc,v.finished_utc,(v.elapsed_ns/1e9).toFixed(3)];}));U.text('p',env,'Suite duration includes runner compilation/setup/collection and excludes environment snapshots. Raw trial timers retain their own boundaries. Run duration also includes telemetry and optional perf.');U.code(env,JSON.stringify({environment:e,suites:Object.fromEntries(Object.keys(M.schemas).map(function(k){return [k,bundle.suites[k].environment||null];}))},null,2));}
      var raw=h('details',null,box);U.text('summary',raw,'Suite availability, machine and optional evidence');U.table(raw,['Suite','Status','Trials','Availability'],rows);U.code(raw,JSON.stringify({machine:bundle.machine,selection:bundle.selection,provenance:bundle.provenance,capabilities:bundle.capabilities,public_export:bundle.public_export||null},null,2));
    }
    function drawComparison(){comparison.replaceChildren();if(!state.reference||!state.yours){comparisonStatus.textContent='Select an optional measured machine and load your result bundle to compare. Unavailable measurements are not filled in.';return;}var rows=M.comparisons(state.reference,state.yours,name);comparisonStatus.textContent=rows.length?rows.length+' matched cases · whole-trial statistics · Your / selected above 1 means more ns for the same work.':'No matching cases for this suite. Check source, flags, work, timing and placement; no ratio is inferred.';if(rows.length)U.table(comparison,['Placement / case','Unit','Selected median (n / MAD)','Your median (n / MAD)','Your / selected','Context'],rows.map(function(r){return [r.placement+' · '+Object.entries(r.parameters).map(function(kv){return kv[0]+'='+kv[1];}).join(', '),r.metric,r.a.median.toFixed(3)+' ('+r.a.n+' / '+r.a.mad.toFixed(3)+')',r.b.median.toFixed(3)+' ('+r.b.n+' / '+r.b.mad.toFixed(3)+')',r.ratio.toFixed(3),(r.partial?'Partial trials; ':'')+(r.compilerDiff?'Compiler metadata differs; inspect retained version':'Inspect retained context')];}));}
    onChange(function(){
      datasetSelect.replaceChildren();state.datasets.forEach(function(d){U.text('option',datasetSelect,d.entry.label+(d.bundle?'':' · unavailable'),{value:d.entry.id});});datasetSelect.value=state.selected||'';datasetSelect.disabled=!state.datasets.length;
      refStatus.textContent=state.referenceStatus;yourStatus.textContent=state.yourStatus;refModel.textContent=state.reference?state.reference.machine.cpu_model+' · '+state.reference.machine.architecture:'No measured dataset selected';yourModel.textContent=state.yours?state.yours.machine.cpu_model+' · '+state.yours.machine.architecture:'Locally imported result bundle';
      detail(refDetail,state.reference);if(state.datasets.some(function(d){return !d.bundle;})){var reasons=h('details',null,refDetail);U.text('summary',reasons,'Unavailable optional datasets');state.datasets.filter(function(d){return !d.bundle;}).forEach(function(d){U.text('p',reasons,d.entry.label+': '+d.reason);});}
      detail(yourDetail,state.yours);remove.disabled=!state.yours;drawComparison();
    });

  }
  App.extendChapter('perf',build);
  automatic();
})();
