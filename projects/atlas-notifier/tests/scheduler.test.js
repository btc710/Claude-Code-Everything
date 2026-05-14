'use strict';

const path = require('path');
const fs = require('fs');

const ledger = require('../../project-ledger/src');
const notifier = require('../src');
const stateMod = require('../src/state');
const { tmpLedgerFile, assert, assertEqual, makeFakeFetch } = require('./helpers');

// Build a fake sink whose `send` is controllable per call. `plan` is an
// array of either 'ok' or an Error (or { throw }) — one per attempt.
function makeFakeSink(plan) {
  const calls = [];
  const remaining = plan.slice();
  return {
    calls,
    async send(payload) {
      calls.push(payload);
      const next = remaining.length > 1 ? remaining.shift() : remaining[0];
      if (next === 'ok') return { ok: true };
      if (next && next.throw) throw new Error(next.throw);
      if (next instanceof Error) throw next;
      return { ok: true };
    },
  };
}

// Forces a followup to be stale (sets its unblockBy to a far past date).
function makeStale(file, followupId) {
  const { withStore } = require('../../project-ledger/src/store');
  withStore(file, data => {
    const f = data.followups.find(x => x.id === followupId);
    f.unblockBy = '2000-01-01';
  });
}

const tests = [
  ['scanStaleFollowups groups stale followups by tenant+owner, drops fresh ones', () => {
    const file = tmpLedgerFile();
    const pA1 = ledger.createProject(file, { tenant: 'acme', name: 'A1' });
    const pA2 = ledger.createProject(file, { tenant: 'acme', name: 'A2' });
    const pB = ledger.createProject(file, { tenant: 'beta', name: 'B' });
    const f1 = ledger.openFollowup(file, { projectId: pA1.id, topic: 'q1', owner: 'Blake' });
    const f2 = ledger.openFollowup(file, { projectId: pA2.id, topic: 'q2', owner: 'Blake' });
    const f3 = ledger.openFollowup(file, { projectId: pB.id, topic: 'q3', owner: 'Casey' });
    const fresh = ledger.openFollowup(file, { projectId: pA1.id, topic: 'fresh', owner: 'Blake', unblockInDays: 30 });
    makeStale(file, f1.id);
    makeStale(file, f2.id);
    makeStale(file, f3.id);
    // `fresh` stays fresh — should not appear.

    const batches = notifier.scanStaleFollowups(file);
    // Two buckets expected: acme/Blake and beta/Casey.
    assertEqual(batches.length, 2, 'two buckets');
    const acme = batches.find(b => b.tenant === 'acme');
    const beta = batches.find(b => b.tenant === 'beta');
    assertEqual(acme.owner, 'Blake', 'acme owner');
    assertEqual(acme.followups.length, 2, 'acme has both');
    assertEqual(beta.owner, 'Casey', 'beta owner');
    assertEqual(beta.followups.length, 1, 'beta has one');
    // Crucial cross-tenant check.
    assert(!acme.followups.find(f => f.id === f3.id), 'beta item not in acme bucket');
    assert(!beta.followups.find(f => f.id === f1.id || f.id === f2.id), 'acme items not in beta bucket');
    assert(!acme.followups.find(f => f.id === fresh.id), 'fresh excluded');
  }],

  ['scanDueReviews respects the window argument', () => {
    const file = tmpLedgerFile();
    const p = ledger.createProject(file, { tenant: 'acme', name: 'P' });
    // accepted 5 days ago → 30d review is ~25 days from now.
    const accepted = new Date();
    accepted.setUTCDate(accepted.getUTCDate() - 5);
    ledger.scheduleReviews(file, p.id, accepted);

    const narrow = notifier.scanDueReviews(file, 7);
    const wide = notifier.scanDueReviews(file, 30);

    // Narrow window: nothing due yet.
    const narrowReviews = narrow.flatMap(b => b.reviews);
    const wideReviews = wide.flatMap(b => b.reviews);
    assertEqual(narrowReviews.length, 0, 'no review in 7-day window');
    assert(wideReviews.find(r => r.kind === '30d'), '30d in 30-day window');
  }],

  ['dispatch: stale followup is queued and sink receives a digest', async () => {
    const file = tmpLedgerFile();
    const p = ledger.createProject(file, { tenant: 'acme', name: 'HubSpot rollout' });
    const f = ledger.openFollowup(file, { projectId: p.id, topic: 'Need owner list', owner: 'Blake' });
    makeStale(file, f.id);

    const sink = makeFakeSink(['ok']);
    const stateFile = path.join(path.dirname(file), 'notifier-state.json');
    const batches = notifier.scanStaleFollowups(file);
    assertEqual(batches.length, 1, 'one batch');
    const r = await notifier.dispatch(sink, batches[0], {
      channel: '#atlas',
      stateFile,
      sinkName: 'slack',
    });
    assertEqual(r.ok, true, 'ok');
    assertEqual(r.notifiedFollowups, 1, 'one followup notified');
    assertEqual(sink.calls.length, 1, 'sink called once');
    assert(sink.calls[0].body.includes('Need owner list'), 'body has topic');
    assert(sink.calls[0].body.includes('HubSpot rollout'), 'body has project name');
    assert(sink.calls[0].subject.includes('acme'), 'subject has tenant');
    // State file should have a marker.
    const st = stateMod.load(stateFile);
    const keys = Object.keys(st.notified);
    assertEqual(keys.length, 1, 'one marker stored');
  }],

  ['dispatch: two consecutive scans on the same day only notify once (idempotency)', async () => {
    const file = tmpLedgerFile();
    const p = ledger.createProject(file, { tenant: 'acme', name: 'P' });
    const f = ledger.openFollowup(file, { projectId: p.id, topic: 't', owner: 'Blake' });
    makeStale(file, f.id);

    const sink = makeFakeSink(['ok', 'ok']);
    const stateFile = path.join(path.dirname(file), 'notifier-state.json');

    // First run
    const batchesA = notifier.scanStaleFollowups(file);
    const r1 = await notifier.dispatch(sink, batchesA[0], {
      channel: '#atlas', stateFile, sinkName: 'slack',
    });
    assertEqual(r1.ok, true, 'first ok');
    assertEqual(r1.notifiedFollowups, 1, 'first sent one');

    // Second run, same day — followup is still stale.
    const batchesB = notifier.scanStaleFollowups(file);
    const r2 = await notifier.dispatch(sink, batchesB[0], {
      channel: '#atlas', stateFile, sinkName: 'slack',
    });
    assertEqual(r2.ok, true, 'second ok');
    assertEqual(r2.skipped, true, 'second skipped');
    assertEqual(sink.calls.length, 1, 'sink called only once total');
  }],

  ['dispatch: same followup on a different day fires again', async () => {
    const file = tmpLedgerFile();
    const p = ledger.createProject(file, { tenant: 'acme', name: 'P' });
    const f = ledger.openFollowup(file, { projectId: p.id, topic: 't', owner: 'Blake' });
    makeStale(file, f.id);

    const sink = makeFakeSink(['ok', 'ok']);
    const stateFile = path.join(path.dirname(file), 'notifier-state.json');
    const batches = notifier.scanStaleFollowups(file);
    const r1 = await notifier.dispatch(sink, batches[0], {
      channel: '#atlas', stateFile, sinkName: 'slack', day: '2026-05-13',
    });
    const r2 = await notifier.dispatch(sink, batches[0], {
      channel: '#atlas', stateFile, sinkName: 'slack', day: '2026-05-14',
    });
    assertEqual(r1.notifiedFollowups, 1, 'day1 sent');
    assertEqual(r2.notifiedFollowups, 1, 'day2 sent again');
    assertEqual(sink.calls.length, 2, 'sink called twice across days');
  }],

  ['dispatch: sink failure retries 3 times then logs and returns ok=false', async () => {
    const file = tmpLedgerFile();
    const p = ledger.createProject(file, { tenant: 'acme', name: 'P' });
    const f = ledger.openFollowup(file, { projectId: p.id, topic: 't', owner: 'Blake' });
    makeStale(file, f.id);

    const sink = makeFakeSink([
      { throw: 'boom-1' },
      { throw: 'boom-2' },
      { throw: 'boom-3' },
    ]);
    const stateFile = path.join(path.dirname(file), 'notifier-state.json');
    const logs = [];
    const logger = { error: m => logs.push(m), warn: () => {}, log: () => {} };
    const batches = notifier.scanStaleFollowups(file);
    const r = await notifier.dispatch(sink, batches[0], {
      channel: '#atlas', stateFile, sinkName: 'slack',
      logger, baseDelayMs: 0,           // skip real backoff for speed
    });
    assertEqual(r.ok, false, 'final result not ok');
    assertEqual(r.attempts, 3, 'three attempts');
    assertEqual(sink.calls.length, 3, 'sink called three times');
    assert(logs.some(m => /attempt=1/.test(m)), 'logged attempt 1');
    assert(logs.some(m => /attempt=3/.test(m)), 'logged attempt 3');
    assert(logs.some(m => /gave up/.test(m)), 'logged final give-up');
    // No idempotency marker should be written if every attempt failed.
    const st = stateMod.load(stateFile);
    assertEqual(Object.keys(st.notified).length, 0, 'no markers on total failure');
  }],

  ['dispatch: backoff delays are 1s/2s/4s when configured at base=10ms', async () => {
    const file = tmpLedgerFile();
    const p = ledger.createProject(file, { tenant: 'acme', name: 'P' });
    const f = ledger.openFollowup(file, { projectId: p.id, topic: 't', owner: 'Blake' });
    makeStale(file, f.id);

    const sink = makeFakeSink([{ throw: 'x' }, { throw: 'x' }, 'ok']);
    const stateFile = path.join(path.dirname(file), 'notifier-state.json');
    const batches = notifier.scanStaleFollowups(file);
    const t0 = Date.now();
    const r = await notifier.dispatch(sink, batches[0], {
      channel: '#a', stateFile, sinkName: 'slack',
      logger: { error: () => {}, warn: () => {}, log: () => {} },
      baseDelayMs: 10,
    });
    const elapsed = Date.now() - t0;
    assertEqual(r.ok, true, 'eventually ok');
    assertEqual(r.attempts, 3, 'took three');
    // base=10ms → delays 10ms + 20ms = 30ms; allow generous upper bound.
    assert(elapsed >= 25, `elapsed >= 25ms (was ${elapsed})`);
  }],

  ['mergeBatches combines followups + reviews per tenant+owner', () => {
    const file = tmpLedgerFile();
    const pA = ledger.createProject(file, { tenant: 'acme', name: 'A' });
    const pB = ledger.createProject(file, { tenant: 'beta', name: 'B' });
    const fA = ledger.openFollowup(file, { projectId: pA.id, topic: 'q', owner: 'Blake' });
    makeStale(file, fA.id);
    const accepted = new Date();
    accepted.setUTCDate(accepted.getUTCDate() - 25);
    ledger.scheduleReviews(file, pA.id, accepted);
    ledger.scheduleReviews(file, pB.id, accepted);
    const followups = notifier.scanStaleFollowups(file);
    const reviews = notifier.scanDueReviews(file, 14);
    const merged = notifier.mergeBatches(followups, reviews);

    const acme = merged.find(b => b.tenant === 'acme');
    const beta = merged.find(b => b.tenant === 'beta');
    assert(acme, 'acme batch present');
    assert(beta, 'beta batch present');
    // Reviews bucket has owner=null; followups bucket has owner='Blake'.
    // Therefore acme should appear as two batches: one with the followup,
    // one with the review.
    const acmeBatches = merged.filter(b => b.tenant === 'acme');
    assertEqual(acmeBatches.length, 2, 'acme split by owner');
    const withFollowup = acmeBatches.find(b => b.followups.length);
    const withReview = acmeBatches.find(b => b.reviews.length);
    assertEqual(withFollowup.owner, 'Blake', 'followup owner');
    assertEqual(withReview.owner, null, 'review has no owner');
    // Beta has only the review.
    assertEqual(beta.reviews.length > 0, true, 'beta has reviews');
    assertEqual(beta.followups.length, 0, 'beta has no followups');
  }],

  ['dispatch: per-tenant grouping — tenant A items never reach tenant B', async () => {
    const file = tmpLedgerFile();
    const pA = ledger.createProject(file, { tenant: 'acme', name: 'Acme Project' });
    const pB = ledger.createProject(file, { tenant: 'beta', name: 'Beta Project' });
    const fA = ledger.openFollowup(file, { projectId: pA.id, topic: 'acme-q', owner: 'Blake' });
    const fB = ledger.openFollowup(file, { projectId: pB.id, topic: 'beta-q', owner: 'Casey' });
    makeStale(file, fA.id);
    makeStale(file, fB.id);

    const sinkA = makeFakeSink(['ok']);
    const sinkB = makeFakeSink(['ok']);
    const stateFile = path.join(path.dirname(file), 'notifier-state.json');
    const batches = notifier.scanStaleFollowups(file);
    const acme = batches.find(b => b.tenant === 'acme');
    const beta = batches.find(b => b.tenant === 'beta');
    await notifier.dispatch(sinkA, acme, { channel: '#acme', stateFile, sinkName: 'slack' });
    await notifier.dispatch(sinkB, beta, { channel: '#beta', stateFile, sinkName: 'slack' });

    assert(sinkA.calls[0].body.includes('acme-q'), 'acme sink got acme topic');
    assert(!sinkA.calls[0].body.includes('beta-q'), 'acme sink did NOT get beta topic');
    assert(sinkB.calls[0].body.includes('beta-q'), 'beta sink got beta topic');
    assert(!sinkB.calls[0].body.includes('acme-q'), 'beta sink did NOT get acme topic');
  }],

  ['dispatch: missing required opts throws', async () => {
    let threw = null;
    try {
      await notifier.dispatch({ send: async () => ({}) }, { tenant: 't', followups: [], reviews: [], projects: new Map() }, {});
    } catch (e) { threw = e; }
    assert(threw && /channel/.test(threw.message), 'rejects missing channel');
  }],

  ['scanStaleFollowups drops items whose project was deleted', () => {
    const file = tmpLedgerFile();
    const p = ledger.createProject(file, { tenant: 'acme', name: 'P' });
    const f = ledger.openFollowup(file, { projectId: p.id, topic: 't' });
    makeStale(file, f.id);
    // Surgically remove the project but leave the followup behind.
    const { withStore } = require('../../project-ledger/src/store');
    withStore(file, data => { data.projects = []; });
    const batches = notifier.scanStaleFollowups(file);
    assertEqual(batches.length, 0, 'orphaned followup dropped');
  }],

  ['dispatch returns idempotent skip when re-dispatching with no new items', async () => {
    const file = tmpLedgerFile();
    const p = ledger.createProject(file, { tenant: 'acme', name: 'P' });
    const f = ledger.openFollowup(file, { projectId: p.id, topic: 't' });
    makeStale(file, f.id);
    const sink = makeFakeSink(['ok']);
    const stateFile = path.join(path.dirname(file), 'notifier-state.json');
    const batches = notifier.scanStaleFollowups(file);
    await notifier.dispatch(sink, batches[0], { channel: '#a', stateFile, sinkName: 'slack' });
    const r = await notifier.dispatch(sink, batches[0], { channel: '#a', stateFile, sinkName: 'slack' });
    assertEqual(r.ok, true, 'still ok');
    assertEqual(r.skipped, true, 'skipped');
    assertEqual(r.reason, 'all-items-already-notified', 'reason set');
  }],
];

module.exports = tests;
