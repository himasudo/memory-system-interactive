'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../src/12_cache_lab_models.js');
const trace=(lines,op='read')=>lines.map(line=>({addr:line*64,size:8,op}));
test('3C uses first touch plus an equal-capacity fully-associative LRU shadow',()=>{
 const conflict=M.replay(trace([0,4,8,0,4,8]),{sets:4,ways:2});
 assert.deepEqual(conflict.events.map(e=>e.classification),['compulsory','compulsory','compulsory','conflict','conflict','conflict']);
 assert.equal(conflict.events[3].distance,2);
 const capacity=M.replay(trace([0,1,2,0,1,2]),{sets:1,ways:2});
 assert.deepEqual(capacity.events.map(e=>e.classification),['compulsory','compulsory','compulsory','capacity','capacity','capacity']);
 const hits=M.replay(trace([0,1,0,1]),{sets:1,ways:2});assert.equal(hits.counts.hits,2);
 for(const r of [conflict,capacity,hits])assert.equal(r.counts.lineAccesses,r.counts.hits+r.counts.compulsory+r.counts.capacity+r.counts.conflict);
});
test('dirty write allocation, eviction and explicit final drain conserve byte accounting',()=>{
 const a=M.replay(trace([0,0,1,2],'write'),{sets:1,ways:2}),b=M.replay(trace([0,0,1,2],'write'),{sets:1,ways:2,drain:true});
 assert.equal(a.counts.rfoBytes,192);assert.equal(a.counts.writebackBytes,64);assert.equal(a.dirtyResident,2);assert.equal(a.counts.usefulWriteBytes,32);
 assert.equal(b.counts.writebackBytes,192);assert.equal(b.counts.totalLineBytes,384);assert.equal(a.events[0].sets[0][0].line,0);
 const split=M.replay([{addr:60,size:8,op:'write'}]);assert.equal(split.counts.lineAccesses,2);assert.equal(split.counts.rfoBytes,128);assert.equal(split.counts.usefulWriteBytes,8);
});
test('byte coverage distinguishes alignment, line crossing and page crossing',()=>{
 assert.equal(M.split(56,8,64).lines,1);assert.equal(M.split(60,8,64).lines,2);assert.equal(M.split(60,8,64).pages,1);
 const p=M.split(4092,8,64);assert.equal(p.pages,2);assert.deepEqual(p.fragments.map(f=>[f.bytes,f.page]),[[4,0],[4,1]]);
 for(let addr=0;addr<4200;addr+=13)for(const size of [1,8,16,32,64,128])assert.equal(M.split(addr,size,64).fragments.reduce((n,x)=>n+x.bytes,0),size);
 assert.throws(()=>M.split(-1,8,64));
});
test('hit scheduler bounds issue ports/banks and preserves bytes including fill traffic',()=>{
 const spread=Array.from({length:16},(_,i)=>({addr:i*8,size:8,op:'load'}));
 const same=spread.map((x,i)=>({...x,addr:i*32}));const a=M.hitSchedule(spread),b=M.hitSchedule(same);
 assert.ok(a.cycles<b.cycles);assert.equal(a.bytes,128);
 const mixed=M.hitSchedule([{addr:0,size:64,op:'fill'},...spread],{ports:2,banks:4,width:8});assert.equal(mixed.bytes,192);
 const slots=new Map();for(const e of mixed.events){const slot=slots.get(e.issue)||[];slot.push(e.bank);slots.set(e.issue,slot);assert.equal(e.done-e.issue,4);}
 for(const banks of slots.values()){assert.ok(banks.length<=2);assert.equal(new Set(banks).size,banks.length);}
 assert.throws(()=>M.hitSchedule([]));
});
test('forwarding distinguishes coverage, unresolved address, unavailable data and false alias',()=>{
 assert.equal(M.forwarding().outcome,'forward candidate');
 assert.equal(M.forwarding({loadAddr:4100,loadSize:4}).contains,true);
 assert.equal(M.forwarding({loadAddr:4100,loadSize:8}).overlap,4);
 assert.match(M.forwarding({dataKnown:false}).outcome,/wait/);
 assert.match(M.forwarding({addressKnown:false,speculate:true}).outcome,/replay/);
 const falseAlias=M.forwarding({loadAddr:8192,addressKnown:false,speculate:true});assert.equal(falseAlias.lowMatch,true);assert.equal(falseAlias.overlap,0);assert.match(falseAlias.outcome,/succeeds/);
 assert.match(M.forwarding({storeAddr:4156,loadAddr:4156}).outcome,/implementation/);
});
test('same-line loads merge; distinct lines exhaust miss entries and drain in order',()=>{
 const unique=M.misses(Array.from({length:16},(_,i)=>i)),one=M.misses(Array(16).fill(0));
 assert.equal(unique.requests,16);assert.ok(unique.blocked>0);assert.equal(one.requests,1);assert.equal(one.merged,7);assert.equal(one.hits,8);assert.equal(one.blocked,0);
 for(const r of [unique,one]){assert.equal(r.retired,16);for(const t of r.trace){assert.ok(t.entries<=r.p.entries);assert.ok(t.rob<=r.p.rob);}for(const l of r.loads){assert.ok(l.retired>=l.done);if(l.id)assert.ok(l.retired>=r.loads[l.id-1].retired);}}
 assert.ok(one.cycles<unique.cycles);assert.throws(()=>M.misses([]));
});
test('shared load slots permit SMT interference; fixed quotas protect a dependent sibling',()=>{
 const solo=M.siblings({sibling:'off'}),shared=M.siblings(),partition=M.siblings({policy:'partitioned'}),compute=M.siblings({sibling:'compute'});
 assert.ok(shared.aCycles>solo.aCycles);assert.equal(partition.aCycles,solo.aCycles);assert.equal(compute.aCycles,solo.aCycles);
 for(const r of [solo,shared,partition,compute]){assert.equal(r.threads[0].done,64);assert.ok(r.trace.every(t=>t.a+t.b<=r.p.capacity));}
 assert.ok(shared.blocked[0]>0);assert.equal(partition.blocked[0],0);
});
test('dirty peer transfers preserve data while backing memory stays stale',()=>{
 const r=M.coherence([{core:0,word:0,kind:'store',value:7},{core:1,word:0,kind:'read'}]);
 assert.deepEqual(r.lines[0].states,['O','S']);assert.equal(r.results[1].old,7);assert.equal(r.lines[0].memory[0],0);assert.equal(r.stats.peerBytes,64);assert.equal(r.stats.homeBytes,64);
 assert.ok(r.events.some(e=>e.lines[0].states.includes('IS')));
 const flushed=M.coherence([{core:0,word:0,kind:'store',value:7},{core:1,word:0,kind:'read'}],{flush:true});
 assert.equal(flushed.lines[0].memory[0],7);assert.equal(flushed.stats.writebackBytes,64);assert.deepEqual(flushed.lines[0].states,['I','S']);
});
test('packed independent atomics transfer ownership; padding removes that transfer',()=>{
 function ops(padded){return Array.from({length:16},(_,i)=>({core:i%2,word:i%2*(padded?8:1),kind:'add'}));}
 const packed=M.coherence(ops(false)),padded=M.coherence(ops(true));assert.equal(packed.stats.ownershipMoves,15);assert.equal(padded.stats.ownershipMoves,0);assert.equal(packed.lines[0].values[0],8);assert.equal(packed.lines[0].values[1],8);assert.equal(padded.lines[1].values[0],8);
 assert.equal(packed.stats.acks,packed.stats.invalidations);assert.equal(packed.stats.peerBytes,15*64);
 for(const r of [packed,padded])for(const e of r.events)for(const l of Object.values(e.lines)){const owners=l.states.filter(s=>s==='M'||s==='E');assert.ok(owners.length<=1);if(owners.length)assert.ok(l.states.filter(s=>['S','O'].includes(s)).length===0);}
});
test('upgrade waits for acks; CAS failure preserves the value; later retry can succeed',()=>{
 const r=M.coherence([{core:0,word:0,kind:'read'},{core:1,word:0,kind:'read'},{core:0,word:0,kind:'cas',expected:7,value:8},{core:0,word:0,kind:'cas',expected:0,value:1}]);
 assert.equal(r.stats.upgrades,1);assert.equal(r.stats.failedCAS,1);assert.equal(r.results[2].value,0);assert.equal(r.results[3].value,1);
 const pending=r.events.find(e=>e.lines[0].states.includes('SM'));assert.deepEqual(pending.pending,[1]);
 const got=r.events.find(e=>e.label==='Exclusive writable ownership obtained');assert.ok(got.t>=pending.t+r.p.ack);
});
test('bounded dirty-victim queues hold fill entries and backpressure new stores',()=>{
 const slow=M.writePressure(),fast=M.writePressure({drain:2});assert.equal(slow.installed,32);assert.equal(slow.writebacks,28);assert.equal(slow.dirtyResident,4);assert.equal(slow.rfoBytes,2048);assert.equal(slow.writebackBytes,1792);
 assert.ok(slow.fillBlocked>0&&slow.frontBlocked>0);assert.ok(fast.cycles<slow.cycles);
 for(const r of [slow,fast])for(const t of r.trace){assert.ok(t.fill<=r.p.fill);assert.ok(t.wb<=r.p.writeback);assert.ok(t.resident.length<=r.p.cache);}
 assert.equal(slow.trace.at(-1).wb,0);assert.equal(slow.trace.at(-1).fill,0);
});
