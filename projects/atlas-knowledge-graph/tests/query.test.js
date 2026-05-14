'use strict';

const lib = require('../src');
const { tmpGraphFile, writeLedger, assert, assertEqual, fixtureLedger } = require('./helpers');

function seedAcme(graph) {
  const ledger = writeLedger(fixtureLedger());
  lib.ingestProject(graph, ledger, 'proj_acme1');
  return graph;
}

const tests = [
  ['recall returns relevant past decisions for a similar new project', () => {
    const graph = tmpGraphFile();
    seedAcme(graph);
    const hits = lib.recall(graph, 'acme', 'New recap email automation after Meet call ends');
    assert(hits.length > 0, 'recall produced hits');
    // The closed followup about CC list and the confirmed-intent project name
    // should both surface.
    const objects = hits.map(h => h.objectRaw || h.object).join(' | ');
    assert(/hubspot meet email/i.test(objects) || /recap/i.test(objects), 'project intent surfaced');
    // Decisions weighted higher should appear ahead of assumptions when both match.
    const firstDecidedIdx = hits.findIndex(h => h.predicate === 'decided');
    const firstAssumptionIdx = hits.findIndex(h => h.predicate === 'assumption');
    if (firstDecidedIdx >= 0 && firstAssumptionIdx >= 0) {
      assert(firstDecidedIdx <= firstAssumptionIdx, 'decided ranked at or above assumption');
    }
  }],
  ['recall returns empty when no token overlaps', () => {
    const graph = tmpGraphFile();
    seedAcme(graph);
    const hits = lib.recall(graph, 'acme', 'xyzzy quokka nonsense');
    assertEqual(hits.length, 0, 'no hits');
  }],
  ['findRelated walks the graph from a subject within a depth bound', () => {
    const graph = tmpGraphFile();
    seedAcme(graph);
    // Followups about CC list become triples with subject="cc team or static list"
    // and link back to the project via the resolved-with chain.
    const rel1 = lib.findRelated(graph, 'acme', 'hubspot-meet-email', 1);
    const rel2 = lib.findRelated(graph, 'acme', 'hubspot-meet-email', 2);
    assert(rel1.length > 0, 'depth-1 produces hits');
    assert(rel2.length >= rel1.length, 'depth-2 contains depth-1');
    assert(rel1.every(t => t.hop <= 1), 'depth-1 hop bound');
    assert(rel2.every(t => t.hop <= 2), 'depth-2 hop bound');
  }],
  ['summarize aggregates triple, project, and predicate counts', () => {
    const graph = tmpGraphFile();
    seedAcme(graph);
    const s = lib.summarize(graph, 'acme');
    assertEqual(s.tenantId, 'acme', 'tenantId');
    assert(s.triples > 0, 'triple count > 0');
    assertEqual(s.projects, 1, 'one project ingested');
    assert(s.predicates['decided'] >= 1, 'has decided count');
    assert(Array.isArray(s.topDecisions), 'topDecisions list');
    assert(s.topDecisions.length > 0, 'at least one top decision');
  }],
  ['tenant isolation: a query as tenant A never sees tenant B triples', () => {
    const graph = tmpGraphFile();
    // Seed acme via the ledger fixture.
    seedAcme(graph);
    // Add a beta tenant triple directly so the rows are clearly distinct.
    lib.addTriple(graph, {
      subject: 'beta-secret-project',
      predicate: 'decided',
      object: 'Use webhook polling with exponential backoff',
      tenantId: 'beta',
      projectId: 'proj_beta1',
    });
    // Recall as acme with a query that strongly matches beta's row.
    const acmeHits = lib.recall(graph, 'acme', 'beta secret webhook polling exponential backoff');
    assert(acmeHits.every(h => h.tenantId === 'acme'), 'acme recall returns only acme rows');
    // Related walk as acme starting at beta's subject — must return nothing.
    const acmeRelated = lib.findRelated(graph, 'acme', 'beta-secret-project', 3);
    assertEqual(acmeRelated.length, 0, 'cross-tenant walk returns nothing');
    // And summarize as acme excludes beta entirely.
    const summary = lib.summarize(graph, 'acme');
    assert(!Object.values(summary.topDecisions).some(d => /beta/.test(JSON.stringify(d))),
      'acme summary does not leak beta');
    // Sanity: beta can see its own row.
    const betaHits = lib.recall(graph, 'beta', 'webhook polling backoff');
    assertEqual(betaHits.length, 1, 'beta sees its own row');
  }],
];

module.exports = tests;
