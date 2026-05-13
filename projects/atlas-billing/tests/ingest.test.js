'use strict';

const fs = require('fs');
const lib = require('../src');
const { tmpStoreFile, tmpJsonFile, entry, assert, assertEqual } = require('./helpers');

const tests = [
  ['ingest writes gateway-shaped entries into the store', () => {
    const file = tmpStoreFile();
    const e1 = entry({ when: '2026-05-01T00:00:00Z', tenant: 'acme', slot: 'opus-4.7',  tokensIn: 100000, tokensOut: 50000, costUsd: 5.25 });
    const e2 = entry({ when: '2026-05-02T00:00:00Z', tenant: 'acme', slot: 'haiku-4.5', tokensIn:   1000, tokensOut:   500, costUsd: 0.0028 });
    const res = lib.ingest(file, [e1, e2]);
    assertEqual(res.inserted, 2, 'inserted');
    assertEqual(res.skipped, 0, 'skipped');
    const data = lib.store.load(file);
    assertEqual(data.entries.length, 2, 'persisted count');
    assertEqual(data.entries[0].tenant, 'acme', 'tenant survived round-trip');
  }],

  ['ingest is idempotent on (tenant, ts, slot, tokensIn, tokensOut) across re-runs', () => {
    const file = tmpStoreFile();
    const e = entry({ when: '2026-05-01T00:00:00Z', tenant: 'acme', slot: 'opus-4.7', tokensIn: 100000, tokensOut: 50000, costUsd: 5.25 });
    const first  = lib.ingest(file, [e]);
    const second = lib.ingest(file, [e, e]);   // same entry, twice in the same call
    const third  = lib.ingest(file, [e]);
    assertEqual(first.inserted, 1, 'first run inserts');
    assertEqual(second.inserted, 0, 'second run inserts nothing');
    assertEqual(second.skipped, 2, 'second run skips both');
    assertEqual(third.inserted, 0, 'third run inserts nothing');
    assertEqual(lib.store.load(file).entries.length, 1, 'only one entry persisted');
  }],

  ['ingest treats different tenants / ts / slot / token counts as distinct', () => {
    const file = tmpStoreFile();
    const base = { when: '2026-05-01T00:00:00Z', tenant: 'acme', slot: 'opus-4.7', tokensIn: 100, tokensOut: 50, costUsd: 0.01 };
    const a = entry(base);
    const b = entry({ ...base, tenant: 'beta' });        // different tenant
    const c = entry({ ...base, when: '2026-05-01T00:00:01Z' }); // different ts
    const d = entry({ ...base, slot: 'haiku-4.5' });     // different slot
    const e = entry({ ...base, tokensIn: 101 });         // different tokensIn
    const f = entry({ ...base, tokensOut: 51 });         // different tokensOut
    const res = lib.ingest(file, [a, b, c, d, e, f]);
    assertEqual(res.inserted, 6, 'all six distinct');
    // re-ingesting all six is still a no-op
    const again = lib.ingest(file, [a, b, c, d, e, f]);
    assertEqual(again.inserted, 0, 're-run inserts nothing');
    assertEqual(again.skipped, 6, 're-run skips all');
  }],

  ['ingestFromFile loads a bare-array JSON dump', () => {
    const file = tmpStoreFile();
    const entries = [
      entry({ when: '2026-05-01T00:00:00Z', tenant: 'acme', slot: 'opus-4.7',  tokensIn: 1000, tokensOut: 500, costUsd: 0.0525 }),
      entry({ when: '2026-05-01T00:00:01Z', tenant: 'acme', slot: 'haiku-4.5', tokensIn: 1000, tokensOut: 500, costUsd: 0.0028 }),
    ];
    const src = tmpJsonFile(entries);
    const res = lib.ingestFromFile(file, src);
    assertEqual(res.inserted, 2, 'inserted both');
  }],

  ['ingestFromFile accepts an { entries: [...] } envelope (e.g. /v1/usage dump)', () => {
    const file = tmpStoreFile();
    const entries = [
      entry({ when: '2026-05-01T00:00:00Z', tenant: 'acme', slot: 'opus-4.7', tokensIn: 1000, tokensOut: 500, costUsd: 0.0525 }),
    ];
    const src = tmpJsonFile({ entries });
    const res = lib.ingestFromFile(file, src);
    assertEqual(res.inserted, 1, 'inserted from envelope');
  }],

  ['ingest validates required fields and rejects malformed entries', () => {
    const file = tmpStoreFile();
    let threw = false;
    try { lib.ingest(file, [{ ts: 1, tenant: 'acme', slot: 'opus-4.7', tokensIn: 1, tokensOut: 1 }]); } catch (e) { threw = true; }
    assert(threw, 'missing costUsd rejected');
    let threw2 = false;
    try { lib.ingest(file, [{ ts: 'bad', tenant: 'acme', slot: 's', tokensIn: 1, tokensOut: 1, costUsd: 0 }]); } catch (e) { threw2 = true; }
    assert(threw2, 'non-numeric ts rejected');
    let threw3 = false;
    try { lib.ingest(file, [{ ts: 1, tenant: 'acme', slot: 's', tokensIn: -1, tokensOut: 1, costUsd: 0 }]); } catch (e) { threw3 = true; }
    assert(threw3, 'negative tokensIn rejected');
  }],
];

module.exports = tests;
