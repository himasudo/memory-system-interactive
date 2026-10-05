/* Timing-constrained teaching controller. Coordinates/timings are explicit;
   there is no physical-address decoder or proprietary Zen+ scheduler here. */
var ControllerLab=(function(){
  'use strict';
  var DEFAULTS={channels:1,ranks:1,banks:4,groups:2,readQ:8,writeQ:8,high:6,low:2,policy:'frfcfs',arbitration:'drain',age:80,
    RCD:4,RP:4,RAS:10,RC:14,CL:6,CWL:4,burst:4,RRDS:2,RRDL:4,FAW:12,CCDS:2,CCDL:4,RTP:3,WR:6,WTRS:3,WTRL:5,RTW:3,RTRS:2,REFI:0,RFC:24};
  function integer(v,min,max,name){if(!Number.isSafeInteger(v)||v<min||v>max)throw new Error('Invalid '+name);}
  function params(options){var p=Object.assign({},DEFAULTS,options);['channels','ranks'].forEach(function(k){integer(p[k],1,2,k);});integer(p.banks,1,8,'banks');integer(p.groups,1,p.banks,'groups');if(p.banks%p.groups)throw new Error('Banks must divide evenly into groups');
    ['readQ','writeQ'].forEach(function(k){integer(p[k],1,64,k);});integer(p.high,1,p.writeQ,'write high watermark');integer(p.low,0,p.high-1,'write low watermark');integer(p.age,0,10000,'age threshold');
    ['RCD','RP','RAS','RC','CL','CWL','burst','RRDS','RRDL','FAW','CCDS','CCDL','RTP','WR','WTRS','WTRL','RTW','RTRS','RFC'].forEach(function(k){integer(p[k],1,500,k);});integer(p.REFI,0,10000,'refresh interval');
    if(p.RC<p.RAS+p.RP||p.RRDL<p.RRDS||p.CCDL<p.CCDS||p.WTRL<p.WTRS)throw new Error('Inconsistent timing constraints');if(p.REFI&&p.REFI<=p.RFC+p.RAS+p.RP)throw new Error('Refresh interval is too short for this model');
    if(['fcfs','frfcfs'].indexOf(p.policy)<0||['arrival','drain'].indexOf(p.arbitration)<0)throw new Error('Invalid scheduler');return p;}
  function simulate(input,options){
    var p=params(options);if(!Array.isArray(input)||!input.length||input.length>256)throw new Error('Use 1–256 requests');
    var ids=new Set(),requests=input.map(function(x,i){var r=Object.assign({},x);r.id=String(x.id===undefined?'R'+i:x.id);if(!/^[A-Za-z0-9_-]{1,16}$/.test(r.id)||ids.has(r.id))throw new Error('Use unique short request IDs');ids.add(r.id);
      integer(r.arrival,0,10000,'arrival');integer(r.channel,0,p.channels-1,'channel');integer(r.rank,0,p.ranks-1,'rank');integer(r.bank,0,p.banks-1,'bank');integer(r.row,0,65535,'row');if(['R','W'].indexOf(r.type)<0)throw new Error('Request type must be R or W');
      r.order=i;r.group=r.bank%p.groups;r.bypassed=0;r.admit=null;r.first=null;r.column=null;r.done=null;r.rowClass=null;return r;});
    requests.sort(function(a,b){return a.arrival-b.arrival||a.order-b.order;});
    function bank(){return {row:null,act:-Infinity,nextAct:0,pre:0,column:0,reserved:null};}
    var channels=Array.from({length:p.channels},function(){return {r:[],w:[],mode:'R',lastColumn:null,lastData:null,lastWrite:null,ranks:Array.from({length:p.ranks},function(_,rank){return {banks:Array.from({length:p.banks},bank),acts:[],lastAct:null,lastTransferEnd:0,refreshUntil:0,pending:false,nextRefresh:p.REFI? p.REFI+Math.floor(rank*p.REFI/p.ranks):Infinity};})};});
    var commands=[],bursts=[],trace=[],completed=0,t=0,stats={readBytes:0,writeBytes:0,rowHit:0,rowClosed:0,rowConflict:0,refreshes:0,turnarounds:0,rankSwitches:0,readQueueFull:0,writeQueueFull:0,modeSwitches:0,refreshDrainCycles:0};
    function log(name,c,r,b,req){commands.push({t:t,name:name,channel:c,rank:r,bank:b,row:req?req.row:null,id:req?req.id:null});}
    function commandFor(req,c){var rank=c.ranks[req.rank],b=rank.banks[req.bank];if(rank.refreshUntil>t||rank.pending&&req.first===null)return null;if(b.reserved!==null&&b.reserved!==req.id)return null;
      if(b.row===null){var last=rank.lastAct,min=last?last.t+(last.group===req.group?p.RRDL:p.RRDS):0;
        if(t<b.nextAct||t<min||rank.acts.length>=4&&t-rank.acts[rank.acts.length-4]<p.FAW)return null;return 'ACT';}
      if(b.row!==req.row)return t>=b.pre?'PRE':null;
      if(t<b.column)return null;
      var col=c.lastColumn;if(col&&t<col.t+(col.rank===req.rank&&col.group===req.group?p.CCDL:p.CCDS))return null;
      var wr=c.lastWrite;if(req.type==='R'&&wr&&wr.rank===req.rank&&t<wr.end+(wr.group===req.group?p.WTRL:p.WTRS))return null;
      var start=t+(req.type==='R'?p.CL:p.CWL),data=c.lastData,gap=0;
      if(data){if(data.type==='R'&&req.type==='W')gap=Math.max(gap,p.RTW);if(data.rank!==req.rank)gap=Math.max(gap,p.RTRS);if(start<data.end+gap)return null;}
      return req.type==='R'?'RD':'WR';
    }
    while(completed<requests.length&&t<200000){
      requests.forEach(function(r){if(r.done!==null&&r.done===t)completed++;});
      channels.forEach(function(c,ci){
        requests.forEach(function(r){if(r.channel!==ci||r.arrival>t||r.admit!==null)return;var q=r.type==='R'?c.r:c.w,cap=r.type==='R'?p.readQ:p.writeQ;if(q.length<cap){r.admit=t;q.push(r);}});
        if(c.r.length===p.readQ)stats.readQueueFull++;if(c.w.length===p.writeQ)stats.writeQueueFull++;
        if(completed===requests.length)return;
        /* Stop new work on a due rank, finish prepared requests, precharge,
           then refresh. Other ranks/channels can still make progress. */
        var issued=false;
        c.ranks.forEach(function(rank,ri){
          if(t>=rank.nextRefresh)rank.pending=true;if(!rank.pending||rank.refreshUntil>t)return;stats.refreshDrainCycles++;
          if(issued||rank.banks.some(function(b){return b.reserved!==null;}))return;
          var open=rank.banks.findIndex(function(b){return b.row!==null&&t>=b.pre;});
          if(open>=0){var b=rank.banks[open];log('PRE',ci,ri,open,null);b.row=null;b.nextAct=Math.max(b.nextAct,t+p.RP);issued=true;return;}
          var ready=t>=rank.lastTransferEnd&&rank.banks.every(function(b){return b.row===null&&t>=b.nextAct;});
          if(ready){log('REF',ci,ri,null,null);rank.refreshUntil=t+p.RFC;rank.pending=false;rank.nextRefresh=t+p.REFI;rank.banks.forEach(function(b){b.nextAct=Math.max(b.nextAct,rank.refreshUntil);});stats.refreshes++;issued=true;}
        });
        if(issued)return;
        if(p.arbitration==='drain'){
          var desired=c.mode,started=c.r.concat(c.w).some(function(r){return r.first!==null;});
          if(!started){if(c.mode==='R'&&(c.w.length>=p.high||!c.r.length&&c.w.length))desired='W';
            if(c.mode==='W'&&(!c.w.length||c.w.length<=p.low&&c.r.length))desired='R';
            if(c.r.length&&p.age&&t-c.r[0].admit>=p.age)desired='R';}
          if(desired!==c.mode){c.mode=desired;stats.modeSwitches++;}
        }
        var pool=p.arbitration==='arrival'?c.r.concat(c.w):(c.mode==='R'?c.r:c.w);
        pool=pool.slice().sort(function(a,b){return a.arrival-b.arrival||a.order-b.order;});
        var chosen=null,cmd=null;
        if(p.policy==='fcfs'){if(pool.length){cmd=commandFor(pool[0],c);if(cmd)chosen=pool[0];}}
        else{
          var ready=pool.map(function(r){return {r:r,cmd:commandFor(r,c)};}).filter(function(x){return x.cmd;});
          var aged=p.age?ready.filter(function(x){return t-x.r.admit>=p.age;}):[];
          if(aged.length){chosen=aged[0].r;cmd=aged[0].cmd;}
          else if(ready.length){var hits=ready.filter(function(x){return x.cmd==='RD'||x.cmd==='WR';}),pick=hits.length?hits[0]:ready[0];chosen=pick.r;cmd=pick.cmd;}
        }
        if(!chosen)return;
        var r=chosen,rank=c.ranks[r.rank],b=rank.banks[r.bank];
        if(r.first===null){r.first=t;r.rowClass=b.row===r.row?'hit':b.row===null?'closed':'conflict';}
        log(cmd,ci,r.rank,r.bank,r);
        if(cmd==='PRE'){b.reserved=r.id;b.row=null;b.nextAct=Math.max(b.nextAct,t+p.RP);}
        else if(cmd==='ACT'){b.reserved=r.id;b.row=r.row;b.act=t;b.pre=t+p.RAS;b.nextAct=t+p.RC;b.column=t+p.RCD;rank.acts.push(t);rank.lastAct={t:t,group:r.group};}
        else{
          r.column=t;r.dataStart=t+(r.type==='R'?p.CL:p.CWL);r.done=r.dataStart+p.burst;b.reserved=null;
          rank.lastTransferEnd=Math.max(rank.lastTransferEnd,r.done);
          b.pre=Math.max(b.pre,r.type==='R'?t+p.RTP:r.done+p.WR);
          c.lastColumn={t:t,group:r.group,rank:r.rank};
          if(c.lastData){if(c.lastData.type!==r.type)stats.turnarounds++;if(c.lastData.rank!==r.rank)stats.rankSwitches++;}
          c.lastData={start:r.dataStart,end:r.done,type:r.type,rank:r.rank,group:r.group};if(r.type==='W')c.lastWrite=c.lastData;
          bursts.push({id:r.id,start:r.dataStart,end:r.done,type:r.type,channel:ci,rank:r.rank,bank:r.bank});
          stats[r.type==='R'?'readBytes':'writeBytes']+=64;stats[r.rowClass==='hit'?'rowHit':r.rowClass==='closed'?'rowClosed':'rowConflict']++;
          c.r.concat(c.w).forEach(function(x){if(x.id!==r.id&&(x.arrival<r.arrival||x.arrival===r.arrival&&x.order<r.order))x.bypassed++;});
          var q=r.type==='R'?c.r:c.w;q.splice(q.indexOf(r),1);
        }
      });
      if(p.trace!==false)trace.push({t:t,completed:completed,channels:channels.map(function(c){return {read:c.r.map(function(r){return r.id;}),write:c.w.map(function(r){return r.id;}),mode:c.mode,ranks:c.ranks.map(function(rank){return {refreshUntil:rank.refreshUntil,pending:rank.pending,banks:rank.banks.map(function(b){return {row:b.row,reserved:b.reserved};})};})};})});t++;
    }
    if(completed!==requests.length)throw new Error('Controller did not drain; inspect scheduling constraints');
    function quantile(a,q){if(!a.length)return null;var b=a.slice().sort(function(a,b){return a-b;});return b[Math.max(0,Math.ceil(q*b.length)-1)];}
    var latency=requests.map(function(r){r.latency=r.done-r.arrival;r.admissionWait=r.admit-r.arrival;r.queueWait=r.first-r.admit;r.commandInterval=r.done-r.first;return r.latency;}),reads=requests.filter(function(r){return r.type==='R';}).map(function(r){return r.latency;});
    var end=Math.max.apply(null,requests.map(function(r){return r.done;})),start=Math.min.apply(null,requests.map(function(r){return r.arrival;})),cycles=end-start;
    return {p:p,requests:requests,commands:commands,bursts:bursts,trace:trace,stats:stats,cycles:cycles,end:end,start:start,bytes:requests.length*64,throughput:requests.length/cycles,bandwidth:requests.length*64/cycles,busUtil:requests.length*p.burst/(cycles*p.channels),latency:{mean:latency.reduce(function(a,b){return a+b;},0)/latency.length,p50:quantile(latency,.5),p95:quantile(latency,.95),p99:quantile(latency,.99),max:Math.max.apply(null,latency)},readP95:quantile(reads,.95)};
  }
  function workload(options){var o=Object.assign({count:48,spacing:2,channels:1,ranks:1,banks:4,pattern:'locality',writes:25},options);integer(o.count,1,256,'request count');integer(o.spacing,0,100,'arrival spacing');integer(o.writes,0,100,'write percentage');return Array.from({length:o.count},function(_,i){var target=o.pattern==='conflict'?0:i%(o.channels*o.ranks*o.banks),channel=target%o.channels,rank=Math.floor(target/o.channels)%o.ranks,bank=Math.floor(target/(o.channels*o.ranks))%o.banks;return {id:'R'+i,arrival:i*o.spacing,channel:channel,rank:rank,bank:bank,row:o.pattern==='conflict'?i%2:o.pattern==='stream'?Math.floor(i/(o.channels*o.ranks*o.banks)):Math.floor(i/(o.channels*o.ranks*o.banks*4)),type:(i*37%100)<o.writes?'W':'R'};});}
  return {defaults:DEFAULTS,params:params,simulate:simulate,workload:workload};
})();
if(typeof module!=='undefined')module.exports=ControllerLab;
