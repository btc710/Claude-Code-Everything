'use strict';

const lib = require('../src');
const { tmpGraphFile, assert, assertEqual } = require('./helpers');

const tests = [
  ['addTriple stores a normalized row with id and timestamp', () => {
    const file = tmpGraphFile();
    const t = lib.addTriple(file, {
      subject: 'Recap Email',
      predicate: 'decided',
      object: 'Send within 30s of call end',
      tenantId: 'acme',
      projectId: 'proj_1',
    });
    assert(t.id && t.id.length === 16, 'deterministic id assigned');
    assertEqual(t.subject, 'recap email', 'subject normalized');
    assertEqual(t.subjectRaw, 'Recap Email', 'raw subject preserved');
    assert(t.asOf, 'asOf set');
    assertEqual(t.confidence, 1, 'default confidence');
  }],
  ['addTriple is idempotent on identical (s,p,o,tenant,project)', () => {
    const file = tmpGraphFile();
    const a = lib.addTriple(file, {
      subject: 'X', predicate: 'decided', object: 'Y',
      tenantId: 'acme', projectId: 'p1', confidence: 0.7,
    });
    const b = lib.addTriple(file, {
      subject: 'X', predicate: 'decided', object: 'Y',
      tenantId: 'acme', projectId: 'p1', confidence: 0.9,
    });
    assertEqual(a.id, b.id, 'same id');
    assertEqual(lib.listTriples(file).length, 1, 'still one row');
    assertEqual(lib.listTriples(file)[0].confidence, 0.9, 'confidence refreshed');
  }],
  ['addTriple rejects unknown predicate', () => {
    const file = tmpGraphFile();
    let threw = null;
    try {
      lib.addTriple(file, { subject: 's', predicate: 'huh', object: 'o', tenantId: 't' });
    } catch (e) { threw = e; }
    assert(threw && /unknown predicate/.test(threw.message), 'rejected');
  }],
  ['listTriples filters by tenant and predicate', () => {
    const file = tmpGraphFile();
    lib.addTriple(file, { subject: 'a', predicate: 'decided', object: '1', tenantId: 'acme' });
    lib.addTriple(file, { subject: 'a', predicate: 'stakeholder', object: 'Blake', tenantId: 'acme' });
    lib.addTriple(file, { subject: 'a', predicate: 'decided', object: '1', tenantId: 'beta' });
    assertEqual(lib.listTriples(file, { tenantId: 'acme' }).length, 2, 'acme rows');
    assertEqual(lib.listTriples(file, { tenantId: 'acme', predicate: 'decided' }).length, 1, 'acme decided');
  }],
];

module.exports = tests;
