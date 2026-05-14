'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { tmpStoreFile, tmpJsonFile, entry, assert, assertEqual } = require('./helpers');

const CLI = path.resolve(__dirname, '..', 'src', 'cli.js');

function run(args, env = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

const tests = [
  ['ingest CLI loads a gateway export and reports counts', () => {
    const file = tmpStoreFile();
    const src = tmpJsonFile([
      entry({ when: '2026-05-01T00:00:00Z', tenant: 'acme', slot: 'opus-4.7', tokensIn: 100, tokensOut: 50, costUsd: 0.005 }),
      entry({ when: '2026-05-01T00:00:01Z', tenant: 'acme', slot: 'opus-4.7', tokensIn: 200, tokensOut: 75, costUsd: 0.009 }),
    ]);
    const out = run(['ingest', '--from', src, '--file', file]);
    const res = JSON.parse(out);
    assertEqual(res.inserted, 2, 'inserted');
    assertEqual(res.skipped, 0, 'skipped');
  }],

  ['rollup --by slot CLI returns slot attribution', () => {
    const file = tmpStoreFile();
    const src = tmpJsonFile([
      entry({ when: '2026-05-01T00:00:00Z', tenant: 'acme', slot: 'opus-4.7',  tokensIn: 100, tokensOut: 50, costUsd: 0.005 }),
      entry({ when: '2026-05-02T00:00:00Z', tenant: 'acme', slot: 'haiku-4.5', tokensIn: 100, tokensOut: 50, costUsd: 0.0001 }),
    ]);
    run(['ingest', '--from', src, '--file', file]);
    const out = run(['rollup', '--tenant', 'acme', '--month', '2026-05', '--by', 'slot', '--file', file]);
    const res = JSON.parse(out);
    assertEqual(res.tenant, 'acme', 'tenant');
    const slots = res.slots.map(s => s.slot).sort();
    assertEqual(slots, ['haiku-4.5', 'opus-4.7'], 'both slots present');
  }],

  ['invoice CLI returns a parsable JSON document with the right invoice id', () => {
    const file = tmpStoreFile();
    const src = tmpJsonFile([
      entry({ when: '2026-05-10T10:00:00Z', tenant: 'acme', slot: 'opus-4.7', tokensIn: 1_000_000, tokensOut: 500_000, costUsd: 52.5 }),
    ]);
    run(['ingest', '--from', src, '--file', file]);
    const out = run(['invoice', '--tenant', 'acme', '--month', '2026-05', '--file', file]);
    const inv = JSON.parse(out);
    assertEqual(inv.invoiceId, 'INV-acme-202605', 'invoice id');
    assert(inv.lineItems.length >= 1, 'at least one line item');
  }],
];

module.exports = tests;
