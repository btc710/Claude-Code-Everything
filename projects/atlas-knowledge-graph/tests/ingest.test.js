'use strict';

const lib = require('../src');
const { tmpGraphFile, writeLedger, assert, assertEqual, fixtureLedger } = require('./helpers');

const tests = [
  ['ingestProject emits confirmed-intent, decided, stakeholder, and assumption triples', () => {
    const ledger = writeLedger(fixtureLedger());
    const graph = tmpGraphFile();
    const added = lib.ingestProject(graph, ledger, 'proj_acme1');
    const preds = new Set(added.map(t => t.predicate));
    assert(preds.has('confirmed-intent'), 'has confirmed-intent');
    assert(preds.has('decided'), 'has decided (passing backtest or closed followup)');
    assert(preds.has('stakeholder'), 'has stakeholder');
    assert(preds.has('assumption'), 'has open-followup assumption');
    assert(preds.has('resolved-with'), 'has resolved-with for closed followup');
    assert(preds.has('success-criterion'), 'has success-criterion from scope');
    assert(preds.has('risk-mitigated'), 'has risk-mitigated from backtest weakest dim');
  }],
  ['ingestProject is idempotent — second run does not duplicate triples', () => {
    const ledger = writeLedger(fixtureLedger());
    const graph = tmpGraphFile();
    const first = lib.ingestProject(graph, ledger, 'proj_acme1').length;
    const before = lib.listTriples(graph).length;
    lib.ingestProject(graph, ledger, 'proj_acme1');
    const after = lib.listTriples(graph).length;
    assert(first > 0, 'first ingest produced triples');
    assertEqual(before, after, 'second ingest is a no-op for row count');
  }],
  ['ingestProject scopes every triple to the project tenant', () => {
    const ledger = writeLedger(fixtureLedger());
    const graph = tmpGraphFile();
    lib.ingestProject(graph, ledger, 'proj_acme1');
    const rows = lib.listTriples(graph);
    assert(rows.length > 0, 'rows exist');
    assert(rows.every(r => r.tenantId === 'acme'), 'all tenant=acme');
  }],
  ['ingestProject throws when project is missing from the ledger', () => {
    const ledger = writeLedger(fixtureLedger());
    const graph = tmpGraphFile();
    let threw = null;
    try { lib.ingestProject(graph, ledger, 'proj_missing'); } catch (e) { threw = e; }
    assert(threw && /not in ledger/.test(threw.message), 'rejected');
  }],
  ['ingestFollowup emits decided and resolved-with when closed', () => {
    const graph = tmpGraphFile();
    const out = lib.ingestFollowup(graph, {
      id: 'fu_x', projectId: 'p1', topic: 'Charge per-seat or per-call',
      status: 'closed', resolvedWith: 'Per-seat, 10 seats minimum',
      askedOn: '2026-04-01',
    }, { tenantId: 'acme', subject: 'pricing' });
    const preds = new Set(out.map(t => t.predicate));
    assert(preds.has('decided'), 'has decided');
    assert(preds.has('resolved-with'), 'has resolved-with');
  }],
  ['ingestFollowup emits assumption when still open', () => {
    const graph = tmpGraphFile();
    const out = lib.ingestFollowup(graph, {
      id: 'fu_x', projectId: 'p1', topic: 'Vendor lock-in risk',
      status: 'open',
    }, { tenantId: 'acme', subject: 'arch' });
    assertEqual(out.length, 1, 'one triple emitted');
    assertEqual(out[0].predicate, 'assumption', 'predicate=assumption');
  }],
  ['ingestBacktest pulls open concerns from results into constraint triples', () => {
    const graph = tmpGraphFile();
    const bt = fixtureLedger().backtests[0];
    const out = lib.ingestBacktest(graph, bt, { tenantId: 'acme', subject: 'hubspot-meet-email' });
    assert(out.length >= 2, 'extracted at least two concerns');
    assert(out.every(t => t.predicate === 'constraint'), 'all constraints');
    const objects = out.map(t => t.object);
    assert(objects.some(o => /deal owner cc/.test(o)), 'cc concern preserved');
    assert(objects.some(o => /webhook/.test(o)), 'webhook concern preserved');
  }],
];

module.exports = tests;
