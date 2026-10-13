'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  M = require('../src/12_controller_model.js');
function validate(r) {
  const p = r.p,
    by = new Map(r.requests.map((x) => [x.id, x])),
    state = Array.from({ length: p.channels }, () => ({
      lastTime: -1,
      col: null,
      data: null,
      write: null,
      ranks: Array.from({ length: p.ranks }, () => ({
        acts: [],
        lastAct: null,
        until: 0,
        lastEnd: 0,
        banks: Array.from({ length: p.banks }, () => ({ row: null, next: 0, pre: 0, column: 0 }))
      }))
    }));
  const seen = new Set();
  for (const c of r.commands) {
    const ch = state[c.channel],
      rank = ch.ranks[c.rank];
    assert.ok(c.t > ch.lastTime, 'two commands in one channel-clock');
    ch.lastTime = c.t;
    assert.ok(c.t >= rank.until, 'rank used during refresh');
    if (c.name === 'REF') {
      assert.ok(rank.banks.every((b) => b.row === null && c.t >= b.next));
      assert.ok(c.t >= rank.lastEnd);
      rank.until = c.t + p.RFC;
      continue;
    }
    const b = rank.banks[c.bank],
      q = by.get(c.id),
      group = c.bank % p.groups;
    if (c.name === 'PRE') {
      assert.notEqual(b.row, null);
      assert.ok(c.t >= b.pre, 'early PRE');
      b.row = null;
      b.next = Math.max(b.next, c.t + p.RP);
    } else if (c.name === 'ACT') {
      assert.equal(b.row, null);
      assert.ok(c.t >= b.next);
      if (rank.lastAct)
        assert.ok(c.t - rank.lastAct.t >= (rank.lastAct.group === group ? p.RRDL : p.RRDS));
      if (rank.acts.length >= 4)
        assert.ok(c.t - rank.acts.at(-4) >= p.FAW, 'five ACTs inside tFAW');
      rank.acts.push(c.t);
      rank.lastAct = { t: c.t, group };
      b.row = q.row;
      b.next = c.t + p.RC;
      b.pre = c.t + p.RAS;
      b.column = c.t + p.RCD;
    } else {
      assert.equal(b.row, q.row);
      assert.ok(c.t >= b.column);
      assert.ok(!seen.has(q.id));
      seen.add(q.id);
      if (ch.col)
        assert.ok(
          c.t - ch.col.t >= (ch.col.rank === c.rank && ch.col.group === group ? p.CCDL : p.CCDS)
        );
      if (q.type === 'R' && ch.write && ch.write.rank === c.rank)
        assert.ok(c.t - ch.write.end >= (ch.write.group === group ? p.WTRL : p.WTRS));
      assert.equal(q.dataStart, c.t + (q.type === 'R' ? p.CL : p.CWL));
      assert.equal(q.done, q.dataStart + p.burst);
      if (ch.data) {
        let gap = ch.data.type === 'R' && q.type === 'W' ? p.RTW : 0;
        if (ch.data.rank !== c.rank) gap = Math.max(gap, p.RTRS);
        assert.ok(q.dataStart >= ch.data.end + gap, 'overlapping DQ or missing turnaround');
      }
      ch.col = { t: c.t, rank: c.rank, group };
      ch.data = { end: q.done, type: q.type, rank: c.rank, group };
      if (q.type === 'W') ch.write = ch.data;
      b.pre = Math.max(b.pre, q.type === 'R' ? c.t + p.RTP : q.done + p.WR);
      rank.lastEnd = Math.max(rank.lastEnd, q.done);
    }
  }
  assert.equal(seen.size, r.requests.length);
  assert.equal(r.bytes, r.stats.readBytes + r.stats.writeBytes);
  assert.equal(r.stats.rowHit + r.stats.rowClosed + r.stats.rowConflict, r.requests.length);
  assert.ok(r.busUtil <= 1);
  for (const q of r.requests) {
    assert.ok(
      q.arrival <= q.admit && q.admit <= q.first && q.first <= q.column && q.column < q.done
    );
    assert.equal(q.latency, q.admissionWait + q.queueWait + q.commandInterval);
  }
  for (const t of r.trace)
    for (const c of t.channels) {
      assert.ok(c.read.length <= p.readQ);
      assert.ok(c.write.length <= p.writeQ);
    }
  if (r.trace.length)
    for (const c of r.trace.at(-1).channels) assert.equal(c.read.length + c.write.length, 0);
}
for (const policy of ['fcfs', 'frfcfs'])
  for (const arbitration of ['arrival', 'drain'])
    for (const refresh of [false, true])
      test(`controller timing/conservation: ${policy}, ${arbitration}, refresh=${refresh}`, () => {
        const p = {
          policy,
          arbitration,
          channels: 2,
          ranks: 2,
          banks: 8,
          groups: 2,
          REFI: refresh ? 64 : 0,
          RFC: 24,
          FAW: 24,
          readQ: 4,
          writeQ: 8,
          high: 6,
          low: 2
        };
        validate(
          M.simulate(M.workload({ ...p, count: 96, spacing: 1, writes: 50, pattern: 'stream' }), p)
        );
      });
test('FCFS and ready-row-hit scheduling preserve arrivals but change order, throughput and fairness', () => {
  const input = M.workload({ writes: 25 }),
    a = M.simulate(input, { policy: 'fcfs', arbitration: 'arrival' }),
    b = M.simulate(input, { policy: 'frfcfs', arbitration: 'arrival' });
  assert.ok(b.cycles < a.cycles);
  assert.deepEqual(
    a.requests.map((r) => r.arrival),
    b.requests.map((r) => r.arrival)
  );
  assert.ok(b.requests.some((r) => r.bypassed > 0));
  validate(a);
  validate(b);
});
test('write draining reduces direction changes; load saturation grows waits behind finite admission', () => {
  const input = M.workload({ writes: 50 }),
    mixed = M.simulate(input, { arbitration: 'arrival', policy: 'fcfs' }),
    drain = M.simulate(input, { arbitration: 'drain', policy: 'fcfs' });
  assert.ok(drain.stats.turnarounds < mixed.stats.turnarounds);
  const idle = M.simulate(M.workload({ spacing: 32, writes: 0 })),
    loaded = M.simulate(M.workload({ spacing: 0, writes: 0 }));
  assert.ok(loaded.latency.mean > idle.latency.mean);
  assert.ok(loaded.requests.some((r) => r.admissionWait > 0));
  assert.ok(loaded.bandwidth > idle.bandwidth);
});
test('channels can overlap bursts while ranks share a channel bus', () => {
  const input = [
    { id: 'A', arrival: 0, channel: 0, rank: 0, bank: 0, row: 0, type: 'R' },
    { id: 'B', arrival: 0, channel: 1, rank: 0, bank: 0, row: 0, type: 'R' }
  ];
  const independent = M.simulate(input, { channels: 2 });
  assert.equal(independent.requests[0].dataStart, independent.requests[1].dataStart);
  const shared = M.simulate(
    input.map((q, i) => ({ ...q, channel: 0, rank: i })),
    { ranks: 2 }
  );
  assert.ok(shared.bursts[1].start >= shared.bursts[0].end + shared.p.RTRS);
  validate(shared);
});
test('refresh creates rank busy intervals and longer latency tails in the controlled trace', () => {
  const input = M.workload({ count: 96, spacing: 3, writes: 0 }),
    a = M.simulate(input),
    b = M.simulate(input, { REFI: 64, RFC: 24 });
  assert.ok(b.stats.refreshes > 0);
  assert.ok(b.latency.p95 > a.latency.p95);
  validate(b);
});
test('age override can serve a ready older conflict before a continuing hot-row stream', () => {
  const input = [
    { id: 'open', arrival: 0, channel: 0, rank: 0, bank: 0, row: 0, type: 'R' },
    { id: 'old', arrival: 2, channel: 0, rank: 0, bank: 0, row: 1, type: 'R' },
    ...Array.from({ length: 30 }, (_, i) => ({
      id: 'hot' + i,
      arrival: i + 3,
      channel: 0,
      rank: 0,
      bank: 0,
      row: 0,
      type: 'R'
    }))
  ];
  const p = { RTP: 4, readQ: 64, arbitration: 'arrival' },
    a = M.simulate(input, { ...p, age: 0 }),
    b = M.simulate(input, { ...p, age: 12 });
  assert.ok(
    b.requests.find((r) => r.id === 'old').done < a.requests.find((r) => r.id === 'old').done
  );
  validate(a);
  validate(b);
});
test('invalid coordinates, traces and inconsistent timing fail explicitly', () => {
  assert.throws(() => M.simulate([]));
  assert.throws(() => M.simulate(M.workload(), { low: 8, high: 6 }));
  assert.throws(() => M.simulate(M.workload(), { RC: 2 }));
  assert.throws(() => M.simulate(M.workload(), { REFI: 12 }));
  assert.throws(() =>
    M.simulate([{ id: 'bad', arrival: 0, channel: 2, rank: 0, bank: 0, row: 0, type: 'R' }])
  );
});
