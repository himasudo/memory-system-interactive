/* Small executable witnesses; not a full ISA, compiler or coherence model. */
var ArchitectureLab=(function(){
  'use strict';
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function programs(name,fenced){var W=function(a){return {kind:'W',addr:a,value:1};},R=function(a,r){return {kind:'R',addr:a,reg:r};},p;
    if(name==='SB')p=[[W('x'),R('y','r0')],[W('y'),R('x','r1')]];
    else if(name==='MP')p=[[W('x'),W('y')],[R('y','r0'),R('x','r1')]];
    else if(name==='LB')p=[[R('x','r0'),W('y')],[R('y','r1'),W('x')]];
    else throw new Error('Choose SB, MP or LB');
    if(fenced)p.forEach(function(t){t.splice(1,0,{kind:'F'});});return p;
  }
  function litmus(options){var p=Object.assign({name:'SB',model:'tso',fenced:false},options);if(['sc','tso','relaxed'].indexOf(p.model)<0)throw new Error('Invalid ordering model');var prog=programs(p.name,p.fenced),seen=new Set(),outcomes={};
    var initial={memory:{x:0,y:0},issued:prog.map(function(t){return t.map(function(){return false;});}),buffers:[[],[]],registers:{r0:null,r1:null}};
    function visit(state,path){var key=JSON.stringify(state);if(seen.has(key))return;seen.add(key);
      if(state.issued.every(function(t){return t.every(Boolean);})&&state.buffers.every(function(b){return !b.length;})){var outcome=state.registers.r0+','+state.registers.r1;if(!outcomes[outcome])outcomes[outcome]={values:[state.registers.r0,state.registers.r1],trace:path};return;}
      function next(q,label){visit(q,path.concat([{label:label,state:clone(q)}]));}
      for(var cpu=0;cpu<2;cpu++){
        if(state.buffers[cpu].length){var q=clone(state),w=q.buffers[cpu].shift();q.memory[w.addr]=w.value;next(q,'T'+cpu+' publishes '+w.addr+' = '+w.value+' from its oldest buffered store');}
        for(var i=0;i<prog[cpu].length;i++){if(state.issued[cpu][i])continue;var op=prog[cpu][i],blocked=false;
          for(var j=0;j<i;j++)if(!state.issued[cpu][j]&&(p.model!=='relaxed'||op.kind==='F'||prog[cpu][j].kind==='F'||prog[cpu][j].addr===op.addr))blocked=true;
          /* The relaxed illustration reorders only independent operations.
             It retains coherent shared memory and a FIFO publication buffer.
             It is intentionally narrower than a general AArch64 model. */
          if(blocked||op.kind==='F'&&state.buffers[cpu].length)continue;
          var q=clone(state);q.issued[cpu][i]=true;
          if(op.kind==='W'){if(p.model==='sc'){q.memory[op.addr]=op.value;next(q,'T'+cpu+' stores '+op.addr+' = 1 atomically in the SC order');}else{q.buffers[cpu].push({addr:op.addr,value:op.value});next(q,'T'+cpu+' buffers '+op.addr+' = 1 (not yet globally visible)');}}
          else if(op.kind==='R'){var own=q.buffers[cpu].slice().reverse().find(function(w){return w.addr===op.addr;}),v=own?own.value:q.memory[op.addr];q.registers[op.reg]=v;next(q,'T'+cpu+' reads '+op.addr+' → '+op.reg+' = '+v+(own?' from its own buffer':' from shared coherent memory'));}
          else next(q,'T'+cpu+' completes full ordering point after its prior stores publish');
        }
      }
    }
    visit(initial,[{label:'Initial x = y = 0; no buffered stores',state:clone(initial)}]);var target=p.name==='SB'?'0,0':p.name==='MP'?'1,0':'1,1';return {p:p,programs:prog,outcomes:outcomes,states:seen.size,target:target,targetAllowed:!!outcomes[target]};
  }
  function inclusion(accesses,options){var p=Object.assign({policy:'inclusive',privateLines:2,llcLines:4},options);if(['inclusive','exclusive','nine'].indexOf(p.policy)<0)throw new Error('Invalid inclusion policy');['privateLines','llcLines'].forEach(function(k){if(!Number.isInteger(p[k])||p[k]<1||p[k]>16)throw new Error('Invalid cache capacity');});if(!Array.isArray(accesses)||!accesses.length||accesses.length>256)throw new Error('Use 1–256 accesses');var upper=[[],[]],lower=[],trace=[],stats={privateHits:0,peerHits:0,llcHits:0,memoryReads:0,backInvalidations:0,llcEvictions:0};
    function promote(a,line){var i=a.indexOf(line);if(i>=0)a.splice(i,1);a.unshift(line);}
    function insertLower(line,events){promote(lower,line);if(lower.length>p.llcLines){var victim=lower.pop();stats.llcEvictions++;events.push('LLC evicts '+victim);if(p.policy==='inclusive')upper.forEach(function(a,cpu){var i=a.indexOf(victim);if(i>=0){a.splice(i,1);stats.backInvalidations++;events.push('Back-invalidate '+victim+' from T'+cpu+' private cache');}});}}
    accesses.forEach(function(a){if(!a||![0,1].includes(a.cpu)||!Number.isSafeInteger(a.line)||a.line<0||a.line>65535)throw new Error('Invalid core or line');var own=upper[a.cpu],other=upper[1-a.cpu],events=[],where;
      if(own.includes(a.line)){stats.privateHits++;where='private hit';promote(own,a.line);}
      else{
        if(other.includes(a.line)){where='peer hit';stats.peerHits++;}
        else if(lower.includes(a.line)){where='LLC hit';stats.llcHits++;}
        else{where='memory read';stats.memoryReads++;}events.push(where+' supplies line '+a.line);
        if(p.policy==='exclusive'){var at=lower.indexOf(a.line);if(at>=0){lower.splice(at,1);events.push('Move data out of LLC; no duplicate below private caches');}}
        else insertLower(a.line,events);
        promote(own,a.line);if(own.length>p.privateLines){var victim=own.pop();events.push('Private cache T'+a.cpu+' evicts '+victim);if(p.policy==='exclusive'&&!other.includes(victim))insertLower(victim,events);}
      }
      var all=upper[0].concat(upper[1],lower),unique=new Set(all).size;trace.push({cpu:a.cpu,line:a.line,where:where,events:events,upper:clone(upper),lower:lower.slice(),unique:unique,duplicates:all.length-unique,stats:clone(stats)});
    });return {p:p,trace:trace,stats:stats,bytes:stats.memoryReads*64};
  }
  function granule(options){var p=Object.assign({pageBytes:4096,regions:256,stride:4096,entries:64},options);if(![4096,16384,65536].includes(p.pageBytes)||![4096,65536].includes(p.stride)||!Number.isInteger(p.regions)||p.regions<1||p.regions>4096||!Number.isInteger(p.entries)||p.entries<1||p.entries>1024)throw new Error('Invalid translation experiment');var lru=[],hits=0,pages=new Set();for(var pass=0;pass<2;pass++)for(var i=0;i<p.regions;i++){var pg=Math.floor(i*p.stride/p.pageBytes),at=lru.indexOf(pg);pages.add(pg);if(at>=0){hits++;lru.splice(at,1);}else if(lru.length===p.entries)lru.pop();lru.unshift(pg);}return {p:p,hits:hits,misses:2*p.regions-hits,reach:p.entries*p.pageBytes,mappings:pages.size,mappedBytes:pages.size*p.pageBytes};}
  function compare(a,b){function grouped(d){var g={};d.samples.forEach(function(r){if(!Number.isSafeInteger(r.steps)||r.steps<=0||!Number.isSafeInteger(r.seed)||r.seed<=0||r.operations!==(r.mode==='chase'?r.steps*r.chains:r.steps*(r.bytes/8)))throw new Error('Comparison requires valid steps, seed and matching operation accounting.');var key=[r.mode,r.bytes,r.chains,r.steps,r.operations,r.seed].join('/');(g[key]||(g[key]=[])).push(r.elapsed_ns/r.operations);});return g;}function median(a){var b=a.slice().sort(function(x,y){return x-y;}),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2;}var x=grouped(a),y=grouped(b);return Object.keys(x).filter(function(k){return y[k];}).sort().map(function(k){var left=median(x[k]),right=median(y[k]);return {key:k,a:left,b:right,ratio:right/left,trialsA:x[k].length,trialsB:y[k].length};});}
  return {programs:programs,litmus:litmus,inclusion:inclusion,granule:granule,compare:compare};
})();
if(typeof module!=='undefined')module.exports=ArchitectureLab;
