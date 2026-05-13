'use strict';

const { Ledger } = require('../src/ledger');
const { assert, assertEqual } = require('./helpers');

const tests = [
  ['records a call and computes cost from the registry prices', () => {
    const l = new Ledger();
    // opus-4.7: $15/1M in, $75/1M out  →  100k in + 50k out = 1.5 + 3.75 = 5.25
    const entry = l.record({ tenant: 'acme', slot: 'opus-4.7', tokensIn: 100000, tokensOut: 50000 });
    assertEqual(entry.tenant, 'acme', 'tenant');
    assert(Math.abs(entry.costUsd - 5.25) < 1e-6, `cost ${entry.costUsd}`);
  }],
  ['usage aggregates across calls and filters by tenant', () => {
    const l = new Ledger();
    l.record({ tenant: 'acme', slot: 'haiku-4.5', tokensIn: 1000, tokensOut: 500 });
    l.record({ tenant: 'acme', slot: 'haiku-4.5', tokensIn: 2000, tokensOut: 1000 });
    l.record({ tenant: 'beta', slot: 'haiku-4.5', tokensIn: 9000, tokensOut: 9000 });
    const u = l.usage({ tenant: 'acme' });
    assertEqual(u.calls, 2, 'acme calls');
    assertEqual(u.tokensIn, 3000, 'acme tokensIn');
    assertEqual(u.bySlot['haiku-4.5'].calls, 2, 'slot rollup');
  }],
  ['per-project usage filter works', () => {
    const l = new Ledger();
    l.record({ tenant: 'acme', slot: 'sonnet-4.6', tokensIn: 1000, tokensOut: 1000, project: 'P1' });
    l.record({ tenant: 'acme', slot: 'sonnet-4.6', tokensIn: 1000, tokensOut: 1000, project: 'P2' });
    assertEqual(l.usage({ tenant: 'acme', project: 'P1' }).calls, 1, 'project filter');
  }],
];

module.exports = tests;
