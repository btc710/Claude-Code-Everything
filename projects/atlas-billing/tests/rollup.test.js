'use strict';

const lib = require('../src');
const { tmpStoreFile, assert, assertEqual, assertClose, entry } = require('./helpers');

// Helper to build a varied month of usage for one tenant + a noisy other tenant.
function seedFile() {
  const file = tmpStoreFile();
  const entries = [
    // acme — May 2026, mixed slots, two projects
    entry({ when: '2026-05-01T10:00:00Z', tenant: 'acme', slot: 'opus-4.7',  model: 'claude-opus-4-7',  tokensIn: 100_000, tokensOut:  50_000, costUsd: 5.25,   project: 'alpha' }),
    entry({ when: '2026-05-01T12:00:00Z', tenant: 'acme', slot: 'haiku-4.5', model: 'claude-haiku-4-5', tokensIn:  10_000, tokensOut:   5_000, costUsd: 0.028,  project: 'alpha' }),
    entry({ when: '2026-05-02T09:00:00Z', tenant: 'acme', slot: 'opus-4.7',  model: 'claude-opus-4-7',  tokensIn: 200_000, tokensOut: 100_000, costUsd: 10.50,  project: 'beta'  }),
    entry({ when: '2026-05-15T09:00:00Z', tenant: 'acme', slot: 'sonnet-4.6',model: 'claude-sonnet-4-6',tokensIn:  50_000, tokensOut:  25_000, costUsd: 0.525,  project: 'beta'  }),
    // beta — different tenant, must be excluded from acme rollups
    entry({ when: '2026-05-01T10:00:00Z', tenant: 'beta', slot: 'opus-4.7',  tokensIn:   9_999_999, tokensOut: 9_999_999, costUsd: 900,    project: 'beta-x' }),
    // acme — entry in April (out of May window)
    entry({ when: '2026-04-30T23:59:59Z', tenant: 'acme', slot: 'opus-4.7',  tokensIn:  9_999_999, tokensOut: 9_999_999, costUsd: 900,    project: 'alpha' }),
  ];
  lib.ingest(file, entries);
  return file;
}

const MAY_FROM = '2026-05-01T00:00:00Z';
const MAY_TO   = '2026-05-31T23:59:59Z';

const tests = [
  ['byPeriod (day) sums per day within the window and enforces tenant isolation', () => {
    const file = seedFile();
    const res = lib.byPeriod(file, { tenant: 'acme', from: MAY_FROM, to: MAY_TO, granularity: 'day' });
    // expect three days: 2026-05-01, 2026-05-02, 2026-05-15
    assertEqual(res.buckets.map(b => b.period), ['2026-05-01', '2026-05-02', '2026-05-15'], 'day buckets');
    // tokens on 2026-05-01 = 100k+10k in, 50k+5k out
    const may1 = res.buckets.find(b => b.period === '2026-05-01');
    assertEqual(may1.calls, 2, 'may1 calls');
    assertEqual(may1.tokensIn,  110_000, 'may1 tokensIn');
    assertEqual(may1.tokensOut, 55_000,  'may1 tokensOut');
    assertClose(may1.costUsd, 5.25 + 0.028, 'may1 cost');
    // beta tenant must be absent
    assert(!res.buckets.some(b => b.tokensIn > 1_000_000), 'no beta-tenant noise');
  }],

  ['byPeriod (month) collapses to a single bucket and totals match the sum of days', () => {
    const file = seedFile();
    const monthly = lib.byPeriod(file, { tenant: 'acme', from: MAY_FROM, to: MAY_TO, granularity: 'month' });
    const daily   = lib.byPeriod(file, { tenant: 'acme', from: MAY_FROM, to: MAY_TO, granularity: 'day' });
    assertEqual(monthly.buckets.length, 1, 'one month bucket');
    const m = monthly.buckets[0];
    assertEqual(m.period, '2026-05', 'month label');
    assertEqual(m.calls,     daily.totals.calls,     'calls sum');
    assertEqual(m.tokensIn,  daily.totals.tokensIn,  'tokensIn sum');
    assertEqual(m.tokensOut, daily.totals.tokensOut, 'tokensOut sum');
    assertClose(m.costUsd,    daily.totals.costUsd,    'cost sum');
    assertClose(m.revenueUsd, daily.totals.revenueUsd, 'revenue sum');
    assertClose(m.marginUsd,  daily.totals.marginUsd,  'margin sum');
  }],

  ['byPeriod requires a tenant', () => {
    const file = seedFile();
    let threw = false;
    try { lib.byPeriod(file, { from: MAY_FROM, to: MAY_TO }); } catch (e) { threw = true; }
    assert(threw, 'missing tenant rejected');
  }],

  ['byPeriod rejects an invalid granularity', () => {
    const file = seedFile();
    let threw = false;
    try { lib.byPeriod(file, { tenant: 'acme', granularity: 'hour' }); } catch (e) { threw = true; }
    assert(threw, 'bad granularity rejected');
  }],

  ['margin per bucket = revenue - cogs and matches 2.5x default', () => {
    const file = seedFile();
    const res = lib.byPeriod(file, { tenant: 'acme', from: MAY_FROM, to: MAY_TO, granularity: 'month' });
    const m = res.buckets[0];
    // With the default 2.5x margin multiplier, revenue should be 2.5x cogs.
    assertClose(m.revenueUsd, m.costUsd * 2.5, 'revenue = 2.5x cogs');
    assertClose(m.marginUsd,  m.costUsd * 1.5, 'margin  = 1.5x cogs');
    assertClose(m.marginPct,  0.6, 'margin pct = 60%');
  }],

  ['bySlot attributes spend per model and orders by revenue', () => {
    const file = seedFile();
    const res = lib.bySlot(file, { tenant: 'acme', from: MAY_FROM, to: MAY_TO });
    const slots = res.slots.map(s => s.slot);
    assert(slots.includes('opus-4.7'),  'opus present');
    assert(slots.includes('haiku-4.5'), 'haiku present');
    assert(slots.includes('sonnet-4.6'),'sonnet present');
    // opus drove the biggest spend so should sort first
    assertEqual(res.slots[0].slot, 'opus-4.7', 'opus is biggest revenue');
    // each entry has model attached
    assertEqual(res.slots[0].model, 'claude-opus-4-7', 'model copied through');
  }],

  ['byProject filter excludes other projects within the same tenant', () => {
    const file = seedFile();
    const justAlpha = lib.byProject(file, { tenant: 'acme', from: MAY_FROM, to: MAY_TO, project: 'alpha' });
    assertEqual(justAlpha.projects.length, 1, 'only one project bucket');
    assertEqual(justAlpha.projects[0].project, 'alpha', 'alpha selected');
    assertEqual(justAlpha.projects[0].calls, 2, 'alpha has 2 calls');
    // Without filter, both alpha and beta show up.
    const all = lib.byProject(file, { tenant: 'acme', from: MAY_FROM, to: MAY_TO });
    const names = all.projects.map(p => p.project);
    assert(names.includes('alpha'), 'alpha in unfiltered');
    assert(names.includes('beta'),  'beta in unfiltered');
  }],

  ['byProject enforces tenant isolation', () => {
    const file = seedFile();
    const acme = lib.byProject(file, { tenant: 'acme', from: MAY_FROM, to: MAY_TO });
    // Sum of acme project costs must not include beta's $900 entry.
    const totalCost = acme.projects.reduce((a, p) => a + p.costUsd, 0);
    assert(totalCost < 100, `acme month cost is small, got ${totalCost}`);
    const beta = lib.byProject(file, { tenant: 'beta', from: MAY_FROM, to: MAY_TO });
    assertEqual(beta.projects[0].project, 'beta-x', 'beta sees only its own project');
  }],

  ['from/to window excludes out-of-range entries (the April pre-window entry)', () => {
    const file = seedFile();
    const may = lib.byPeriod(file, { tenant: 'acme', from: MAY_FROM, to: MAY_TO, granularity: 'month' });
    // The April noise entry would have added 9.999M+ tokens; confirm it's excluded.
    assert(may.buckets[0].tokensIn < 1_000_000, `tokensIn in May is bounded, got ${may.buckets[0].tokensIn}`);
  }],
];

module.exports = tests;
