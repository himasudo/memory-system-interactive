/* OS/translation teaching state, separate from the existing x86 walk plate. */
var VMLab=(function(){
  'use strict';
  function copy(x){return JSON.parse(JSON.stringify(x));}
  function integer(n,lo,hi,label){if(!Number.isSafeInteger(n)||n<lo||n>hi)throw new Error('Invalid '+label);}
  function create(options){var p=Object.assign({kind:'anon',pages:4,warm:false,swap:true},options);integer(p.pages,1,16,'pages');if(['anon','file-private','file-shared'].indexOf(p.kind)<0)throw new Error('Invalid mapping kind');
    var s={p:p,processes:{parent:{vmas:{},ptes:{},tlb:{},runnable:true}},frames:{0:{kind:'zero',value:0,dirty:false}},pageCache:{},file:[],swap:{},nextFrame:1,nextSwap:1,last:null,stats:{minor:0,major:0,protectionFaults:0,allocations:0,zeroBytes:0,copyBytes:0,writebackBytes:0,swapOutBytes:0,swapInBytes:0,walks:0,tlbHits:0,invalidations:0}};
    for(var page=0;page<p.pages;page++){s.file.push((page+1)*10);if(p.warm&&p.kind!=='anon'){var id=s.nextFrame++;s.frames[id]={kind:'file',page:page,value:s.file[page],dirty:false};s.pageCache[page]=id;}}
    return s;
  }
  function references(s,frame){var refs=[];Object.keys(s.processes).forEach(function(pid){var proc=s.processes[pid];Object.keys(proc.ptes).forEach(function(page){var p=proc.ptes[page];if(p.frame===+frame||p.swap!==undefined&&s.swap[p.swap]&&s.swap[p.swap].frame===+frame)refs.push({pid:pid,page:+page});});});return refs;}
  function act(before,op){var s=copy(before),events=[],pid=op.pid||'parent',proc=s.processes[pid],page=op.page===undefined?0:op.page;
    if(!proc)throw new Error('That process does not exist; fork first.');integer(page,0,s.p.pages-1,'virtual page');
    function event(label){events.push({label:label,state:copy(s)});}
    function invalidate(who,pg){var pr=s.processes[who];if(pr.tlb[pg]){delete pr.tlb[pg];s.stats.invalidations++;}event('Invalidate '+who+' page '+pg+' translation; completion is assumed here');}
    function frame(kind,value,pg){var id=s.nextFrame++;s.frames[id]={kind:kind,value:value,dirty:false};if(pg!==undefined)s.frames[id].page=pg;s.stats.allocations++;return id;}
    function install(pte){proc.ptes[page]=pte;event('Install '+pid+' PTE for page '+page);invalidate(pid,page);}
    function fault(kind,label){s.stats[kind]++;event((kind==='major'?'Storage-backed fault in this scenario: ':'Minor fault: ')+label);}
    function collect(){Object.keys(s.swap).forEach(function(id){if(!Object.keys(s.processes).some(function(pid){return Object.keys(s.processes[pid].ptes).some(function(pg){return s.processes[pid].ptes[pg].swap===+id;});}))delete s.swap[id];});Object.keys(s.frames).forEach(function(id){if(s.frames[id].kind==='anon'&&!references(s,id).length)delete s.frames[id];});}
    s.last=null;
    if(op.kind==='map'){
      if(Object.keys(proc.vmas).length)throw new Error('This process already has a mapping. Reset to choose another mapping type.');
      for(var i=0;i<s.p.pages;i++)proc.vmas[i]={kind:s.p.kind,prot:'rw'};
      event('mmap creates virtual mapping policy; no leaf PTEs are populated');
    }else if(op.kind==='fork'){
      if(pid!=='parent'||s.processes.child)throw new Error('This experiment supports one parent and one child.');
      var child={vmas:copy(proc.vmas),ptes:copy(proc.ptes),tlb:{},runnable:false};s.processes.child=child;
      event('fork prepares child mappings/PTEs; the child is not runnable yet');
      Object.keys(proc.ptes).forEach(function(pg){if(proc.vmas[pg].kind!=='file-shared'){proc.ptes[pg].writable=false;proc.ptes[pg].cow=true;child.ptes[pg].writable=false;child.ptes[pg].cow=true;proc.ptes[pg].wasWritable=false;child.ptes[pg].wasWritable=false;invalidate(pid,+pg);}});
      child.runnable=true;event('Private writable mappings are protected for copy-on-write; child can run with an empty modeled TLB');
    }else if(op.kind==='read'||op.kind==='write'){
      var write=op.kind==='write',vma=proc.vmas[page];if(write)integer(op.value,0,1000000,'stored value');
      if(!vma||write&&vma.prot!=='rw'){s.stats.protectionFaults++;s.last={pid:pid,page:page,error:'SIGSEGV'};event(!vma?'Access is outside a VMA: invalid mapping':'VMA forbids this write: protection fault, not COW');return {state:s,events:events};}
      var pte=proc.ptes[page],tlb=proc.tlb[page];
      if(tlb&&(!write||tlb.writable)){s.stats.tlbHits++;event('TLB hit supplies frame and permissions');}
      else{s.stats.walks++;event('TLB cannot satisfy the access; inspect the page-table mapping');}
      if(!pte||pte.swap!==undefined){
        if(pte&&pte.swap!==undefined){var slot=s.swap[pte.swap],id=slot.frame;
          if(id!==null&&s.frames[id])fault('minor','resident swap-cache page can satisfy the fault');
          else{fault('major','retrieve anonymous contents from modeled swap storage');id=frame('anon',slot.value);slot.frame=id;s.stats.swapInBytes+=4096;event('Swap contents are resident again');}
          install({frame:id,writable:!!pte.wasWritable&&vma.prot==='rw',cow:!!pte.cow});
        }else if(vma.kind==='anon'){
          fault('minor',write?'first write needs private zeroed memory':'read can use the shared read-only zero page');
          if(write){var id=frame('anon',0);s.stats.zeroBytes+=4096;event('Allocate and zero a private 4 KiB frame');install({frame:id,writable:true,cow:false});}
          else install({frame:0,writable:false,cow:true});
        }else{
          var id=s.pageCache[page];if(id!==undefined)fault('minor','file page is already in the page cache');
          else{fault('major','this file page is absent from the modeled page cache');id=frame('file',s.file[page],page);s.pageCache[page]=id;event('Storage read populates the page-cache frame');}
          install({frame:id,writable:vma.kind==='file-shared'&&vma.prot==='rw',cow:vma.kind==='file-private'});
        }
        pte=proc.ptes[page];
      }
      if(write&&!pte.writable){
        if(!pte.cow){s.stats.protectionFaults++;s.last={pid:pid,page:page,error:'SIGSEGV'};event('No writable PTE and no copy-on-write permission');return {state:s,events:events};}
        /* A file-private write fault can populate and copy in one kernel entry.
           Do not count a second fault when this access just faulted it in. */
        if(before.processes[pid].ptes[page]&&before.processes[pid].ptes[page].swap===undefined)fault('minor','write to a COW-protected PTE');
        var old=s.frames[pte.frame],id=pte.frame;
        if(old.kind==='anon'&&references(s,id).length===1)event('Only this private mapping remains: reuse its anonymous frame (chosen optimization)');
        else{id=frame('anon',old.value);if(old.kind==='zero'){s.stats.zeroBytes+=4096;event('Allocate and zero a private frame instead of copying the global zero page');}else{s.stats.copyBytes+=4096;event('Allocate a new 4 KiB frame and copy the protected data');}}
        install({frame:id,writable:true,cow:false});pte=proc.ptes[page];
      }
      proc.tlb[page]={frame:pte.frame,writable:pte.writable};
      if(write){s.frames[pte.frame].value=op.value;s.frames[pte.frame].dirty=true;}
      s.last={pid:pid,page:page,value:s.frames[pte.frame].value,kind:op.kind};event((write?'Store':'Load')+' completes with value '+s.last.value+' in frame '+pte.frame);
    }else if(op.kind==='protect'){
      if(!proc.vmas[page])throw new Error('No mapping to protect.');if(['r','rw'].indexOf(op.prot)<0)throw new Error('Use read-only or read/write protection.');
      proc.vmas[page].prot=op.prot;var p=proc.ptes[page];if(p&&p.frame!==undefined)p.writable=op.prot==='rw'&&!p.cow;if(p&&p.swap!==undefined)p.wasWritable=op.prot==='rw'&&!p.cow;
      event('mprotect changes mapping permissions and any present leaf permission');invalidate(pid,page);
    }else if(op.kind==='unmap'){
      if(!proc.vmas[page])throw new Error('That page is already unmapped.');delete proc.vmas[page];delete proc.ptes[page];event('munmap removes this virtual page and its PTE');invalidate(pid,page);collect();event('Unreferenced anonymous frames can be released; file cache may remain');
    }else if(op.kind==='reclaim'){
      var p=proc.ptes[page];if(!p||p.frame===undefined)throw new Error('Choose a resident mapped page.');var id=p.frame,f=s.frames[id],refs=references(s,id);
      if(f.kind==='zero'){delete proc.ptes[page];invalidate(pid,page);event('Drop this zero-page PTE; the shared zero frame stays available');}
      else if(f.kind==='file'){
        if(f.dirty){s.file[f.page]=f.value;f.dirty=false;s.stats.writebackBytes+=4096;event('Dirty file page is written to backing storage before eviction');}
        refs.forEach(function(ref){delete s.processes[ref.pid].ptes[ref.page];invalidate(ref.pid,ref.page);});delete s.pageCache[f.page];delete s.frames[id];event('Clean file page is evicted; VMAs remain and later access can fault it back in');
      }else if(!s.p.swap)event('Swap is disabled in this scenario; do not discard private anonymous contents');
      else{
        var slot=s.nextSwap++;s.swap[slot]={value:f.value,frame:null};s.stats.swapOutBytes+=4096;event('Preserve anonymous contents in a modeled swap slot');
        refs.forEach(function(ref){var pr=s.processes[ref.pid],old=pr.ptes[ref.page];pr.ptes[ref.page]={swap:slot,cow:!!old.cow,wasWritable:!!old.writable};invalidate(ref.pid,ref.page);});delete s.frames[id];event('Physical frame can be reused after all affected translations are invalidated');
      }
    }else throw new Error('Unknown VM action');
    collect();if(events.length)events[events.length-1].state=copy(s);return {state:s,events:events};
  }
  function tlb(options){var p=Object.assign({pages:256,passes:2,entries:64,pageBytes:4096,pattern:'dense'},options);integer(p.pages,1,2048,'4 KiB regions');integer(p.passes,1,8,'passes');integer(p.entries,1,1024,'TLB entries');if([4096,2097152].indexOf(p.pageBytes)<0)throw new Error('Unsupported page size');if(['dense','sparse'].indexOf(p.pattern)<0)throw new Error('Invalid page access pattern');var lru=[],trace=[],hits=0;
    for(var pass=0;pass<p.passes;pass++)for(var i=0;i<p.pages;i++){var addr=i*(p.pattern==='sparse'?2097152:4096),vpn=Math.floor(addr/p.pageBytes),at=lru.indexOf(vpn),hit=at>=0;if(hit){hits++;lru.splice(at,1);}else if(lru.length===p.entries)lru.pop();lru.unshift(vpn);trace.push({addr:addr,vpn:vpn,hit:hit});}
    return {p:p,trace:trace,hits:hits,misses:trace.length-hits,reach:p.entries*p.pageBytes,uniqueMappings:new Set(trace.map(function(x){return x.vpn;})).size,mappedBytes:new Set(trace.map(function(x){return x.vpn;})).size*p.pageBytes};
  }
  function walks(options){var p=Object.assign({walks:8,walkers:2,levels:4,cached:2,slots:4,latency:20,demand:16},options);['walks','walkers','slots'].forEach(function(k){integer(p[k],1,32,k);});integer(p.levels,3,5,'levels');integer(p.cached,0,p.levels-1,'cached upper levels');integer(p.latency,1,200,'memory request latency');integer(p.demand,0,128,'background requests');
    var tasks=Array.from({length:p.walks},function(_,i){return {id:i,level:p.cached,start:null,done:null,waiting:false,translated:null};}),active=[],waiting=[],requests=[],trace=[],started=0,finished=0,backgroundIssued=0,backgroundDone=0,t=0,walkTurn=true,blocked=0;
    while((finished<p.walks||backgroundDone<p.demand)&&t<100000){
      active=active.filter(function(r){if(r.done>t)return true;if(r.kind==='background')backgroundDone++;else{var w=tasks[r.walk];w.waiting=false;if(r.kind==='data'){w.done=t;finished++;waiting.splice(waiting.indexOf(w),1);}else{w.level++;if(w.level===p.levels)w.translated=t;}}return false;});
      /* A hardware walk slot is released at translation, before demand data.
         Translation-complete tasks still queue their final data request. */
      var walking=waiting.filter(function(w){return w.translated===null;}).length;
      while(started<p.walks&&walking<p.walkers){var w=tasks[started++];w.start=t;waiting.push(w);walking++;}
      var ready=waiting.filter(function(w){return !w.waiting;}),candidate=null;
      if(ready.length&&backgroundIssued<p.demand){candidate=walkTurn?'walk':'background';}else if(ready.length)candidate='walk';else if(backgroundIssued<p.demand)candidate='background';
      if(candidate&&active.length===p.slots)blocked++;
      if(candidate&&active.length<p.slots){if(ready.length&&backgroundIssued<p.demand)walkTurn=!walkTurn;var r={issue:t,done:t+p.latency};if(candidate==='background'){r.kind='background';backgroundIssued++;}else{var w=ready[0];r.walk=w.id;r.level=w.level;r.kind=w.translated===null?'pte':'data';w.waiting=true;}
        active.push(r);requests.push(r);}
      trace.push({t:t,slots:active.length,walkers:walking,translated:tasks.filter(function(w){return w.translated!==null;}).length,finished:finished,background:backgroundDone,requests:active.map(function(r){return Object.assign({},r);})});t++;
    }
    if(finished!==p.walks||backgroundDone!==p.demand)throw new Error('Walk model did not drain');
    return {p:p,tasks:tasks,requests:requests,trace:trace,cycles:t,blocked:blocked,pteReads:requests.filter(function(r){return r.kind==='pte';}).length,lineBytes:requests.length*64};
  }
  function shootdown(options){var p=Object.assign({cpus:8,touchers:8,pages:16,batch:true,fanout:4,late:0,fullCost:20},options);integer(p.cpus,1,128,'CPU count');integer(p.touchers,1,p.cpus,'CPUs with this address space');integer(p.pages,1,256,'changed pages');integer(p.fanout,1,16,'IPI send width');integer(p.late,0,1000,'delayed handler');integer(p.fullCost,1,200,'context flush cost');
    var rounds=p.batch?1:p.pages,events=[],time=0,totalWork=0,ipis=0,per=p.batch?p.pages:1,cost=Math.min(per*2,p.fullCost),full=per*2>=p.fullCost;
    for(var round=0;round<rounds;round++){var start=time,done=start+2+cost;events.push({kind:'PTE update',cpu:0,start:start,end:start+2,round:round});events.push({kind:'local invalidate',cpu:0,start:start+2,end:done,round:round});totalWork+=cost;
      for(var cpu=1;cpu<p.touchers;cpu++){var send=start+2+Math.floor((cpu-1)/p.fanout)*2,enter=send+6+(cpu%3)*2+(cpu===p.touchers-1?p.late:0),end=enter+cost,ack=end+4;events.push({kind:'IPI delivery / handler delay',cpu:cpu,start:send,end:enter,round:round},{kind:'remote invalidate',cpu:cpu,start:enter,end:end,round:round},{kind:'acknowledgement',cpu:cpu,start:end,end:ack,round:round});done=Math.max(done,ack);totalWork+=cost;ipis++;}
      time=done;events.push({kind:'origin may continue',cpu:0,start:time,end:time,round:round});}
    return {p:p,events:events,cycles:time,ipis:ipis,totalWork:totalWork,full:full,rounds:rounds};
  }
  function numa(options){var p=Object.assign({cpuNode:0,placement:'node0',pages:64,passes:2,spacing:2,slots:8,memoryLatency:40,memoryBurst:2,linkBytes:8,outbound:10,returnLatency:20},options);integer(p.cpuNode,0,1,'executing node');if(['node0','node1','interleave'].indexOf(p.placement)<0)throw new Error('Invalid placement');integer(p.pages,1,256,'pages');integer(p.passes,1,4,'passes');integer(p.spacing,0,64,'request spacing');integer(p.slots,1,32,'memory slots');integer(p.memoryLatency,1,200,'memory latency');integer(p.memoryBurst,1,32,'memory burst');integer(p.linkBytes,1,64,'link bytes per clock');integer(p.outbound,0,100,'outbound latency');integer(p.returnLatency,0,100,'return latency');
    var nodes=[{free:Array(p.slots).fill(0),nextBurst:0},{free:Array(p.slots).fill(0),nextBurst:0}],requests=[];
    for(var i=0;i<p.pages*p.passes;i++){var page=i%p.pages,node=p.placement==='interleave'?page%2:p.placement==='node0'?0:1,remote=node!==p.cpuNode;requests.push({id:i,page:page,node:node,remote:remote,arrival:i*p.spacing,toNode:i*p.spacing+(remote?p.outbound:0)});}
    requests.slice().sort(function(a,b){return a.toNode-b.toNode||a.id-b.id;}).forEach(function(q){var n=nodes[q.node],slot=n.free.indexOf(Math.min.apply(null,n.free));q.admit=Math.max(q.toNode,n.free[slot]);q.burstStart=Math.max(q.admit+p.memoryLatency,n.nextBurst);q.memoryDone=q.burstStart+p.memoryBurst;n.nextBurst=q.memoryDone;n.free[slot]=q.memoryDone;q.queueWait=q.admit-q.toNode;});
    var link=0,remoteCount=0;requests.slice().sort(function(a,b){return a.memoryDone-b.memoryDone||a.id-b.id;}).forEach(function(q){if(q.remote){remoteCount++;q.linkStart=Math.max(q.memoryDone,link);link=q.linkStart+Math.ceil(64/p.linkBytes);q.linkEnd=link;q.done=link+p.returnLatency;}else q.done=q.memoryDone+2;q.latency=q.done-q.arrival;});
    return {p:p,requests:requests,local:requests.length-remoteCount,remote:remoteCount,lineBytes:requests.length*64,linkBytes:remoteCount*64,cycles:Math.max.apply(null,requests.map(function(q){return q.done;})),mean:requests.reduce(function(n,q){return n+q.latency;},0)/requests.length};
  }
  return {create:create,act:act,references:references,tlb:tlb,walks:walks,shootdown:shootdown,numa:numa};
})();
if(typeof module!=='undefined')module.exports=VMLab;
