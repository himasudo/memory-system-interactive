/* ======================= pipeline simulator ======================= */
var PipeSim = (function(){
var W = {fetch: 4, rename: 4, retire: 4, alu: 4, agu: 2};
var CAP = {rob: 24, uq: 8, alu: 16, agu: 12, lq: 10, sq: 8, prf: 48, mab: 4};
var REAL = {rob: '192 (96 per thread)', uq: '72 µops', alu: '4 × 14', agu: '2 × 14', lq: '44', sq: '44', prf: '168', mab: 'not published for L1; 50 L2→L3', fetch: '4 x86 instr/cycle', rename: '6 macro-ops/cycle', retire: '8/cycle'};

function simulate(P){
  var EX = P.ex, L = EX.loop, hx = function(v){ return '0x' + v.toString(16); };
  var level = P.level || 'L1', missLat = P.missLat || 0;
  /* ---------- static code ---------- */
  var ST = {
    A: {pc: L,        len: 3, asm: 'movzbl (%rdi),%eax',     uops: [{k: 'LD', d: 'rax', s: ['rdi'], sz: 1, tag: 'ld'}]},
    B: {pc: L + 3n,   len: 4, asm: 'addq $1,%rdi',           uops: [{k: 'ALU', d: 'rdi', s: ['rdi'], tag: 'add'}]},
    C: {pc: L + 7n,   len: 5, asm: 'addq $1,(%rdx,%rax,8)',  uops: [{k: 'LD', d: 't0', s: ['rdx', 'rax'], sz: 8, tag: 'ld'},
                                                                  {k: 'ALU', d: 't1', s: ['t0'], tag: 'add'},
                                                                  {k: 'STA', s: ['rdx', 'rax'], tag: 'sta'},
                                                                  {k: 'STD', s: ['t1'], tag: 'std'}]},
    J: {pc: L + 12n,  len: 5, asm: 'cmpq %rsi,%rdi ; jne .L3', uops: [{k: 'BR', d: 'flags', s: ['rdi', 'rsi'], tag: 'br'}]},
    R: {pc: EX.ret,   len: 1, asm: 'ret',                    uops: [{k: 'RET', s: ['rsp'], tag: 'ret'}]}
  };
  /* ---------- memory (committed values) ---------- */
  var MEM8 = {}, MEM1 = {};
  var bytes = EX.bytes.concat([9, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  bytes.forEach(function(b, i){ MEM1[(EX.data + BigInt(i)).toString()] = b; });
  for (var k in EX.histInit) MEM8[EX.histAddr(+k).toString()] = BigInt(EX.histInit[k]);
  MEM8[EX.rsp.toString()] = EX.retAddr;
  function rd(addr, sz){ return sz === 1 ? BigInt(MEM1[addr.toString()] || 0) : (MEM8[addr.toString()] || 0n); }
  var lineOf = function(a){ return a & ~63n; };
  var L1 = {}; /* present lines */
  function addLine(a){ L1[lineOf(a).toString()] = true; }
  [123, 7, 46, 200, 9, 0].forEach(function(k){ addLine(EX.histAddr(k)); });
  addLine(EX.rsp);
  if (level === 'L1') addLine(EX.data);

  /* ---------- state ---------- */
  var PRF = [];
  for (var p = 0; p < CAP.prf; p++) PRF.push({val: null, readyAt: Infinity, alloc: false});
  var init = {rax: 0n, rdx: EX.hist, rsi: EX.data + BigInt(EX.n), rdi: EX.data, rsp: EX.rsp, flags: 0n};
  var RAT = {}, CRAT = {}, pi = 1;
  ['rax', 'rdx', 'rsi', 'rdi', 'rsp', 'flags'].forEach(function(a){
    RAT[a] = CRAT[a] = pi; PRF[pi] = {val: init[a], readyAt: -1, alloc: true}; pi++;
  });
  var FREE = []; for (p = pi; p < CAP.prf; p++) FREE.push(p);
  var FREE0 = FREE.length;
  var ROB = [], ALUQ = [], AGUQ = [], LQ = [], SQ = [], MAB = [], UQ = [];
  var FE = {BP: null, IF: null, PD: null, DE: null};
  var nextPC = L, feResume = 0, iter = 0, seq = 0, useq = 0, robTail = 0;
  var insts = [], uops = [], snaps = [], violations = [];
  var mispredicts = 0, retiredN = 0;

  function G(u, c, code){ u.g[c] = code; }
  function GI(inst, c, code){ inst.uops.forEach(function(u){ u.g[c] = code; }); }
  function newInst(name){
    var s = ST[name], it;
    if (name === 'A') iter++;
    it = {seq: seq++, name: name, iter: name === 'R' ? 0 : iter, lbl: name === 'R' ? 'R' : name + iter, pc: s.pc, asm: s.asm,
          wrong: name !== 'R' && iter > EX.n, uops: [], maps: [], temps: [], squashedAt: null, rnAt: null, retAt: null};
    s.uops.forEach(function(d, i){
      var u = {id: useq++, inst: it, k: d.k, def: d, lbl: it.lbl + (s.uops.length > 1 ? '.' + d.tag : ''), g: {}, src: [], dst: null, dstArch: d.d || null,
               issueAt: null, readyAt: Infinity, doneAt: Infinity, port: null, addr: null, val: null, outcome: null, state: 'fe'};
      it.uops.push(u); uops.push(u);
    });
    insts.push(it);
    return it;
  }
  function doneOf(it){ return Math.max.apply(null, it.uops.map(function(u){ return u.doneAt; })); }

  function squashAfter(br, c){
    var n = 0;
    function kill(it){
      it.squashedAt = c; n++;
      it.maps.forEach(function(m){ FREE.push(m.newP); PRF[m.newP] = {val: null, readyAt: Infinity, alloc: false}; });
      it.temps.forEach(function(t){ FREE.push(t); PRF[t] = {val: null, readyAt: Infinity, alloc: false}; });
      it.uops.forEach(function(u){ u.g[c] = 'X'; u.state = 'squashed'; });
    }
    ROB = ROB.filter(function(it){ if (it.seq > br.seq){ kill(it); return false; } return true; });
    ['DE', 'PD', 'IF', 'BP'].forEach(function(st){ if (FE[st]){ FE[st].forEach(function(it){ it.squashedAt = c; n++; it.uops.forEach(function(u){ u.g[c] = 'X'; u.state = 'squashed'; }); }); FE[st] = null; } });
    UQ.forEach(function(it){ it.squashedAt = c; n++; it.uops.forEach(function(u){ u.g[c] = 'X'; u.state = 'squashed'; }); }); UQ = [];
    var alive = function(u){ return !u.inst.squashedAt; };
    ALUQ = ALUQ.filter(alive); AGUQ = AGUQ.filter(alive);
    LQ = LQ.filter(function(e){ return !e.u.inst.squashedAt; });
    SQ = SQ.filter(function(e){ return !e.inst.squashedAt; });
    MAB.forEach(function(m){ m.waiters = m.waiters.filter(alive); });
    RAT = JSON.parse(JSON.stringify(CRAT));
    ROB.forEach(function(it){ it.maps.forEach(function(m){ RAT[m.arch] = m.newP; }); });
    robTail = (br.slot + 1) % CAP.rob;
    FE = {BP: null, IF: null, PD: null, DE: null};
    return n;
  }

  function resolveLoad(u, c, ev){
    /* store queue search: youngest older store with a known, matching address */
    var match = null, unknown = [];
    for (var i = SQ.length - 1; i >= 0; i--){
      var e = SQ[i];
      if (e.inst.seq >= u.inst.seq) continue;
      if (e.addrAt > c){ unknown.push(e); continue; }
      if (u.def.sz === 8 && e.addr === u.addr){ match = e; break; }
    }
    if (match){
      if (match.dataAt <= c){
        u.waited = u.outcome === 'fwwait'; u.val = match.data; u.readyAt = c; u.outcome = 'fwd';
        ev.push('<b>' + u.lbl + '</b> address ' + hx(u.addr) + ' matches older store <b>' + match.inst.lbl + '</b> in the store queue; value ' + match.data + ' is forwarded from the SQ, not read from L1d');
        return true;
      }
      if (u.outcome !== 'fwwait') ev.push('<b>' + u.lbl + '</b> matches older store <b>' + match.inst.lbl + '</b> but its data is not in the SQ yet: the load waits');
      u.outcome = 'fwwait'; return false;
    }
    if (unknown.length) u.specPast = unknown.map(function(e){ return e.inst.seq; });
    var ln = lineOf(u.addr).toString();
    if (L1[ln]){
      u.val = rd(u.addr, u.def.sz); u.readyAt = c; u.outcome = u.outcome === 'miss' ? 'miss' : 'hit';
      if (u.outcome === 'hit') ev.push('<b>' + u.lbl + '</b> L1d hit: ' + hx(u.addr) + ' (set ' + Number((u.addr >> 6n) & 63n) + ') = ' + u.val);
      return true;
    }
    var m = MAB.filter(function(x){ return x.line === ln; })[0];
    if (!m){
      m = {line: ln, lineHex: hx(lineOf(u.addr)), fillAt: u.issueAt + missLat, waiters: [], lvl: level};
      MAB.push(m);
      ev.push('<b>' + u.lbl + '</b> misses L1d (line ' + m.lineHex + '): MAB entry allocated, request sent to ' + level + ', data expected in cycle ' + m.fillAt);
    } else if (m.waiters.indexOf(u) < 0){
      ev.push('<b>' + u.lbl + '</b> misses the same line: merges into the existing MAB entry, no second request');
    }
    if (m.waiters.indexOf(u) < 0) m.waiters.push(u);
    u.outcome = 'miss';
    return false;
  }

  var MAXC = 1200;
  for (var c = 0; c < MAXC; c++){
    var ev = [], stall = null, rnNow = [], issued = {};
    /* 1. retire */
    var rcount = 0;
    while (rcount < W.retire && ROB.length && doneOf(ROB[0]) < c){
      var it = ROB.shift(); it.retAt = c; rcount++; retiredN++;
      it.maps.forEach(function(m){ FREE.push(m.oldP); PRF[m.oldP] = {val: PRF[m.oldP].val, readyAt: Infinity, alloc: false}; CRAT[m.arch] = m.newP; });
      it.temps.forEach(function(t){ FREE.push(t); PRF[t] = {val: PRF[t].val, readyAt: Infinity, alloc: false}; });
      LQ = LQ.filter(function(e){ return e.u.inst !== it; });
      SQ.forEach(function(e){ if (e.inst === it) e.retiredAt = c; });
      GI(it, c, 'RT');
      ev.push('<b>' + it.lbl + '</b> retires' + (it.maps.length ? ': frees ' + it.maps.map(function(m){ return 'p' + m.oldP; }).join(', ') + (it.temps.length ? ' and temps ' + it.temps.map(function(t){ return 'p' + t; }).join(', ') : '') : it.temps.length ? ': frees temps ' + it.temps.map(function(t){ return 'p' + t; }).join(', ') : '') + (it.name === 'C' ? '; its store becomes a senior store' : ''));
    }
    /* 2. store commit (one per cycle, only retired stores) */
    SQ.forEach(function(e){ if (e.retiredAt !== null && e.retiredAt < c && !e.committedAt) e.inst.uops.forEach(function(u){ if (u.k === 'STA') u.g[c] = 'SB'; }); });
    if (SQ.length && SQ[0].retiredAt !== null && SQ[0].retiredAt < c){
      var e0 = SQ.shift();
      MEM8[e0.addr.toString()] = e0.data; e0.committedAt = c;
      e0.inst.uops.forEach(function(u){ if (u.k === 'STA') u.g[c] = 'CM'; });
      ev.push('<b>' + e0.inst.lbl + '</b> store commits to L1d: ' + hx(e0.addr) + ' \u2190 ' + e0.data + ' (line now dirty; other cores can see it from here on)');
    }
    /* 3. execution events scheduled for this cycle */
    MAB = MAB.filter(function(m){
      if (m.fillAt === c){ L1[m.line] = true; ev.push('Line ' + m.lineHex + ' arrives from ' + m.lvl + ' and is filled into L1d; MAB entry released'); return false; }
      return true;
    });
    uops.forEach(function(u){
      if (u.issueAt === null || u.inst.squashedAt !== null) return;
      var t = c - u.issueAt;
      if (u.k === 'BR' && t === 2){
        var taken = u.val !== 0n;
        u.inst.actualTaken = taken;
        if (!taken){
          mispredicts++;
          var n = squashAfter(u.inst, c);
          nextPC = EX.ret; feResume = c + 1;
          ev.push('<b>' + u.lbl + ' MISPREDICTED</b>: predicted taken, rdi == rsi so it falls through. ' + n + ' younger instructions squashed; RAT rebuilt from the committed RAT plus the older in-flight renames; fetch redirected to ret at ' + hx(EX.ret));
        } else ev.push('<b>' + u.lbl + '</b> resolves taken, matching the prediction');
      }
      if (u.k === 'LD' && u.readyAt === Infinity && t >= 4){
        if (resolveLoad(u, c, ev)){
          PRF[u.dst].val = u.val; PRF[u.dst].readyAt = c;
          u.doneAt = c + 1;
        }
      }
    });
    /* violation check: any STA whose address just became known vs younger loads that already resolved past it */
    SQ.forEach(function(e){
      if (e.addrAt === c) uops.forEach(function(u){
        if (u.k === 'LD' && u.specPast && u.specPast.indexOf(e.inst.seq) >= 0 && u.addr === e.addr && !u.inst.squashedAt) violations.push({c: c, ld: u.lbl, st: e.inst.lbl});
      });
    });
    /* 4. issue / select */
    function ready(u){ return u.eligAt <= c && u.src.every(function(p){ return PRF[p].readyAt <= c; }); }
    var ac = ALUQ.filter(ready).sort(function(a, b){ return a.id - b.id; }).slice(0, W.alu);
    var gc = [], sta = 0;
    AGUQ.filter(ready).sort(function(a, b){ return a.id - b.id; }).forEach(function(u){
      if (gc.length >= W.agu) return;
      if ((u.k === 'STA' || u.k === 'RET') && sta >= 1) return;
      if (u.k === 'STA' || u.k === 'RET') sta++;
      gc.push(u);
    });
    function srcv(u, i){ return PRF[u.src[i]].val; }
    ac.forEach(function(u, i){
      u.issueAt = c; u.port = 'ALU' + i; u.state = 'exec'; issued[u.port] = u.lbl;
      G(u, c, 'IS'); G(u, c + 1, 'RR');
      if (u.k === 'ALU'){ u.val = srcv(u, 0) + 1n; PRF[u.dst].val = u.val; PRF[u.dst].readyAt = c + 1; G(u, c + 2, 'EX'); G(u, c + 3, 'WB'); u.doneAt = c + 3; }
      if (u.k === 'BR'){ u.val = srcv(u, 0) - srcv(u, 1); PRF[u.dst].val = u.val; PRF[u.dst].readyAt = c + 1; G(u, c + 2, 'BR'); G(u, c + 3, 'WB'); u.doneAt = c + 3; }
      if (u.k === 'STD'){ u.val = srcv(u, 0); u.sqe.data = u.val; u.sqe.dataAt = c + 3; G(u, c + 2, 'SD'); u.doneAt = c + 3; }
    });
    ALUQ = ALUQ.filter(function(u){ return ac.indexOf(u) < 0; });
    gc.forEach(function(u, i){
      u.issueAt = c; u.port = 'AGU' + i; u.state = 'exec'; issued[u.port] = u.lbl;
      G(u, c, 'IS'); G(u, c + 1, 'RR'); G(u, c + 2, 'AG');
      if (u.k === 'LD'){ u.addr = u.def.sz === 1 ? srcv(u, 0) : srcv(u, 0) + srcv(u, 1) * 8n; G(u, c + 3, 'D1'); G(u, c + 4, 'D2'); }
      if (u.k === 'STA'){ u.addr = srcv(u, 0) + srcv(u, 1) * 8n; u.sqe.addr = u.addr; u.sqe.addrAt = c + 3; G(u, c + 3, 'D1'); u.doneAt = c + 3; }
      if (u.k === 'RET'){ u.addr = srcv(u, 0); u.val = rd(u.addr, 8); G(u, c + 3, 'D1'); G(u, c + 4, 'D2'); G(u, c + 5, 'WB'); u.doneAt = c + 5; }
    });
    AGUQ = AGUQ.filter(function(u){ return gc.indexOf(u) < 0; });
    ac.concat(gc).forEach(function(u){ ev.push('<b>' + u.lbl + '</b> issues on ' + u.port); });
    /* 5. rename + dispatch */
    var rn = 0;
    while (rn < W.rename && UQ.length){
      var it2 = UQ[0], su = it2.uops;
      var nd = su.filter(function(u){ return u.dstArch; }).length;
      var na = su.filter(function(u){ return u.k === 'ALU' || u.k === 'BR' || u.k === 'STD'; }).length;
      var ng = su.length - na, nl = su.filter(function(u){ return u.k === 'LD'; }).length, ns = it2.name === 'C' ? 1 : 0;
      if (ROB.length >= CAP.rob) stall = 'ROB full';
      else if (FREE.length < nd) stall = 'free list empty';
      else if (ALUQ.length + na > CAP.alu) stall = 'ALU scheduler full';
      else if (AGUQ.length + ng > CAP.agu) stall = 'AGU scheduler full';
      else if (LQ.length + nl > CAP.lq) stall = 'load queue full';
      else if (SQ.length + ns > CAP.sq) stall = 'store queue full';
      if (stall) break;
      UQ.shift(); rn++; rnNow.push(it2.lbl);
      var local = {}, sqe = null;
      if (ns){ sqe = {inst: it2, addr: null, addrAt: Infinity, data: null, dataAt: Infinity, retiredAt: null}; SQ.push(sqe); }
      su.forEach(function(u){
        u.src = u.def.s.map(function(a){ return a in local ? local[a] : RAT[a]; });
        if (u.dstArch){
          var np = FREE.shift();
          PRF[np] = {val: null, readyAt: Infinity, alloc: true};
          u.dst = np;
          if (u.dstArch.charAt(0) === 't'){ it2.temps.push(np); local[u.dstArch] = np; }
          else { it2.maps.push({arch: u.dstArch, newP: np, oldP: RAT[u.dstArch]}); RAT[u.dstArch] = np; }
        }
        u.eligAt = c + 2; u.state = 'sched'; u.sqe = sqe;
        G(u, c, 'RN'); G(u, c + 1, 'DS');
        if (u.k === 'LD'){ LQ.push({u: u}); AGUQ.push(u); }
        else if (u.k === 'STA' || u.k === 'RET') AGUQ.push(u);
        else ALUQ.push(u);
      });
      it2.rnAt = c; it2.slot = robTail; robTail = (robTail + 1) % CAP.rob; ROB.push(it2);
      ev.push('<b>' + it2.lbl + '</b> renamed' + (it2.maps.length ? ': ' + it2.maps.map(function(m){ return m.arch + ' \u2192 p' + m.newP + ' (was p' + m.oldP + ')'; }).join(', ') : '') + (it2.temps.length ? (it2.maps.length ? '; ' : ': ') + 'temps ' + it2.temps.map(function(t){ return 'p' + t; }).join(', ') : ''));
    }
    if (stall && UQ.length) ev.push('<b>Rename stalls: ' + stall + '</b>');
    UQ.forEach(function(it3){ GI(it3, c, 'UQ'); });
    /* 6. front end */
    if (c >= feResume){
      if (FE.DE && UQ.length + FE.DE.length <= CAP.uq){ FE.DE.forEach(function(x){ UQ.push(x); GI(x, c, 'UQ'); }); FE.DE = null; }
      if (!FE.DE && FE.PD){ FE.DE = FE.PD; FE.PD = null; }
      if (!FE.PD && FE.IF){ FE.PD = FE.IF; FE.IF = null; }
      if (!FE.IF && FE.BP){ FE.IF = FE.BP; FE.BP = null; }
      if (!FE.BP && nextPC !== null){
        var grp = [], pc = nextPC;
        while (grp.length < W.fetch){
          var nm = pc === L ? 'A' : pc === L + 3n ? 'B' : pc === L + 7n ? 'C' : pc === L + 12n ? 'J' : pc === EX.ret ? 'R' : null;
          if (!nm){ pc = null; break; }
          grp.push(newInst(nm));
          if (nm === 'J'){ pc = L; break; }
          if (nm === 'R'){ pc = null; break; }
          pc = pc + BigInt(ST[nm].len);
        }
        nextPC = pc; FE.BP = grp; FE.BP.pc = grp.length ? grp[0].pc : null;
      }
      ['BP', 'IF', 'PD', 'DE'].forEach(function(st){ if (FE[st]) FE[st].forEach(function(x){ GI(x, c, st); }); });
    }
    /* scheduler wait marks */
    ALUQ.concat(AGUQ).forEach(function(u){ if (u.eligAt <= c && !u.g[c]) u.g[c] = '\u00b7'; });
    uops.forEach(function(u){
      if (u.k === 'LD' && u.issueAt !== null && u.readyAt === Infinity && c > u.issueAt + 4 && !u.inst.squashedAt) u.g[c] = u.outcome === 'fwwait' ? 'fw' : 'ms';
      if (u.k === 'LD' && u.readyAt === c && c > u.issueAt + 4) u.g[c] = 'DA';
      if (u.k === 'LD' && u.readyAt !== Infinity && c === u.readyAt + 1) u.g[c] = 'WB';
    });
    /* 7. snapshot */
    snaps.push(snapshot(c, ev, stall, rnNow, issued));
    if (nextPC === null && !FE.BP && !FE.IF && !FE.PD && !FE.DE && !UQ.length && !ROB.length && !SQ.length){ break; }
  }

  function uState(u, c){
    if (u.inst.squashedAt !== null && u.inst.squashedAt <= c) return 'squashed';
    if (u.issueAt === null) return 'wait';
    if (u.doneAt < c) return 'done';
    return 'exec';
  }
  function snapshot(c, ev, stall, rnNow, issued){
    var fe = {}; ['BP', 'IF', 'PD', 'DE'].forEach(function(st){ fe[st] = FE[st] ? FE[st].map(function(x){ return x.lbl; }) : []; });
    var inStage = function(code){ return uops.filter(function(u){ return u.g[c] === code && !u.inst.squashedAt; }).map(function(u){ return u.lbl; }); };
    return {
      c: c, ev: ev, stall: stall, rn: rnNow, issued: issued,
      fe: fe, fetchPC: FE.BP && FE.BP.pc ? hx(FE.BP.pc) : null, nextPC: nextPC === null ? null : hx(nextPC),
      uq: UQ.map(function(x){ return x.lbl; }), robHead: ROB.length ? ROB[0].slot : robTail, robTail: robTail,
      rat: JSON.parse(JSON.stringify(RAT)), crat: JSON.parse(JSON.stringify(CRAT)),
      free: FREE.slice(),
      prf: PRF.map(function(r, i){ return {p: i, val: r.val === null ? null : r.val.toString(), ready: r.readyAt <= c, alloc: r.alloc}; }),
      rob: ROB.map(function(it){
        var d = doneOf(it) < c;
        return {lbl: it.lbl, asm: it.asm, slot: it.slot, done: d, wrong: it.wrong, st: d ? 'done' : it.uops.some(function(u){ return u.issueAt !== null; }) ? 'exec' : 'wait'};
      }),
      alu: ALUQ.map(function(u){ return {lbl: u.lbl, src: u.src.map(function(p){ return {p: p, r: PRF[p].readyAt <= c}; })}; }),
      agu: AGUQ.map(function(u){ return {lbl: u.lbl, src: u.src.map(function(p){ return {p: p, r: PRF[p].readyAt <= c}; })}; }),
      stages: {EX: inStage('EX').concat(inStage('BR')), AG: inStage('AG'), D1: inStage('D1'), D2: inStage('D2'), SD: inStage('SD'), WB: inStage('WB')},
      lq: LQ.map(function(e){ var u = e.u; return {lbl: u.lbl, addr: u.addr === null ? null : hx(u.addr), st: u.readyAt <= c ? (u.outcome === 'fwd' ? 'forwarded' : u.outcome === 'miss' ? 'filled' : 'hit') : u.outcome === 'miss' ? 'miss' : u.outcome === 'fwwait' ? 'wait data' : u.issueAt === null ? 'waiting' : 'in pipe', val: u.readyAt <= c && u.val !== null ? u.val.toString() : null}; }),
      sq: SQ.map(function(e){ return {lbl: e.inst.lbl, addr: e.addrAt <= c ? hx(e.addr) : null, data: e.dataAt <= c ? e.data.toString() : null, senior: e.retiredAt !== null && e.retiredAt <= c}; }),
      mab: MAB.map(function(m){ return {line: m.lineHex, fillAt: m.fillAt, lvl: m.lvl, n: m.waiters.length}; }),
      l1: {data: !!L1[lineOf(EX.data).toString()]},
      mem: {h123: MEM8[EX.histAddr(123).toString()].toString(), h7: MEM8[EX.histAddr(7).toString()].toString(), h46: MEM8[EX.histAddr(46).toString()].toString(), h200: MEM8[EX.histAddr(200).toString()].toString()},
      retired: retiredN, ustate: uops.map(function(u){ return uState(u, c); })
    };
  }

  return {
    snaps: snaps, uops: uops.map(function(u){ return {lbl: u.lbl, inst: u.inst.lbl, k: u.k, wrong: u.inst.wrong, squashedAt: u.inst.squashedAt, g: u.g, port: u.port, outcome: u.outcome, val: u.val === null ? null : u.val.toString(), addr: u.addr === null ? null : hx(u.addr), first: u.inst.uops[0] === u, asm: u.inst.asm}; }),
    cycles: snaps.length, violations: violations, mispredicts: mispredicts, retired: retiredN,
    freeStart: FREE0, freeEnd: FREE.length, mem: {h123: MEM8[EX.histAddr(123).toString()], h7: MEM8[EX.histAddr(7).toString()], h46: MEM8[EX.histAddr(46).toString()], h200: MEM8[EX.histAddr(200).toString()]},
    CAP: CAP, REAL: REAL, W: W
  };
}
return {simulate: simulate, CAP: CAP, REAL: REAL, W: W};
})();
if (typeof module !== 'undefined') module.exports = PipeSim;
