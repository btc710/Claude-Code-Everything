'use strict';

const lib = require('../src');
const { tmpStoreFile, assert, assertEqual, assertClose, entry } = require('./helpers');

function seedMonth() {
  const file = tmpStoreFile();
  lib.ingest(file, [
    entry({ when: '2026-05-01T10:00:00Z', tenant: 'acme', slot: 'opus-4.7',   model: 'claude-opus-4-7',   tokensIn: 1_000_000, tokensOut:   500_000, costUsd: 52.5,    project: 'alpha' }),
    entry({ when: '2026-05-15T10:00:00Z', tenant: 'acme', slot: 'haiku-4.5',  model: 'claude-haiku-4-5',  tokensIn:   500_000, tokensOut: 1_000_000, costUsd:  4.4,    project: 'alpha' }),
    entry({ when: '2026-05-20T10:00:00Z', tenant: 'acme', slot: 'sonnet-4.6', model: 'claude-sonnet-4-6', tokensIn:   100_000, tokensOut:    50_000, costUsd:  1.05,   project: 'beta'  }),
    // outside May — must be excluded
    entry({ when: '2026-06-01T00:00:00Z', tenant: 'acme', slot: 'opus-4.7',  tokensIn: 9_999_999, tokensOut: 9_999_999, costUsd: 900, project: 'alpha' }),
    // another tenant — must be excluded
    entry({ when: '2026-05-10T10:00:00Z', tenant: 'beta', slot: 'opus-4.7',  tokensIn: 9_999_999, tokensOut: 9_999_999, costUsd: 900, project: 'beta-x' }),
  ]);
  return file;
}

const tests = [
  ['generate returns a structured invoice with period bounds and a due date', () => {
    const file = seedMonth();
    const inv = lib.generateInvoice(file, { tenant: 'acme', period: '2026-05' });
    assertEqual(inv.tenant, 'acme', 'tenant');
    assertEqual(inv.period, '2026-05', 'period');
    assertEqual(inv.periodStart, '2026-05-01', 'periodStart');
    assertEqual(inv.periodEnd,   '2026-05-31', 'periodEnd');
    assertEqual(inv.currency, 'USD', 'currency default');
    assertEqual(inv.netTermsDays, 30, 'net terms default');
    assertEqual(inv.invoiceId, 'INV-acme-202605', 'invoice id');
    // issue date is first of the next month; due is +30 days
    assertEqual(inv.issueDate, '2026-06-01', 'issue date');
    assertEqual(inv.dueDate,   '2026-07-01', 'due date');
  }],

  ['line items match the bySlot rollup for the same window', () => {
    const file = seedMonth();
    const inv = lib.generateInvoice(file, { tenant: 'acme', period: '2026-05' });
    const slotRoll = lib.bySlot(file, { tenant: 'acme', from: Date.UTC(2026, 4, 1), to: Date.UTC(2026, 5, 1) - 1 });
    assertEqual(inv.lineItems.length, slotRoll.slots.length, 'one line per slot');
    for (const li of inv.lineItems) {
      const s = slotRoll.slots.find(x => x.slot === li.slot);
      assert(s, `slot ${li.slot} in rollup`);
      assertEqual(li.calls,     s.calls,     `${li.slot} calls`);
      assertEqual(li.tokensIn,  s.tokensIn,  `${li.slot} tokensIn`);
      assertEqual(li.tokensOut, s.tokensOut, `${li.slot} tokensOut`);
      assertClose(li.subtotal, s.revenueUsd, `${li.slot} subtotal matches rollup revenue`);
      assertClose(li.cogsUsd,  s.costUsd,    `${li.slot} cogs matches rollup cost`);
    }
  }],

  ['totals = sum of line items and totals.margin = subtotal - cogs', () => {
    const file = seedMonth();
    const inv = lib.generateInvoice(file, { tenant: 'acme', period: '2026-05' });
    const sub = inv.lineItems.reduce((a, l) => a + l.subtotal, 0);
    const cogs = inv.lineItems.reduce((a, l) => a + l.cogsUsd, 0);
    assertClose(inv.totals.subtotal, sub, 'subtotal sum');
    assertClose(inv.totals.cogs, cogs, 'cogs sum');
    assertClose(inv.totals.margin, sub - cogs, 'margin = sub - cogs');
    assertClose(inv.totals.total, sub, 'total = subtotal (no tax)');
  }],

  ['default margin multiplier (2.5x) is reflected in unit prices', () => {
    const file = seedMonth();
    const inv = lib.generateInvoice(file, { tenant: 'acme', period: '2026-05' });
    const opus = inv.lineItems.find(l => l.slot === 'opus-4.7');
    assertClose(opus.unitPriceIn,  37.5,  'opus priceIn at 2.5x');
    assertClose(opus.unitPriceOut, 187.5, 'opus priceOut at 2.5x');
  }],

  ['per-tenant pricing override flows through to the invoice', () => {
    const file = seedMonth();
    lib.setTenantPricing(file, 'acme', { margin_multiplier: 3, currency: 'EUR', net_terms_days: 45 });
    const inv = lib.generateInvoice(file, { tenant: 'acme', period: '2026-05' });
    assertEqual(inv.currency, 'EUR', 'currency override');
    assertEqual(inv.netTermsDays, 45, 'net terms override');
    const opus = inv.lineItems.find(l => l.slot === 'opus-4.7');
    assertClose(opus.unitPriceIn, 45, 'priceIn at 3x');
    assertClose(opus.unitPriceOut, 225, 'priceOut at 3x');
  }],

  ['invoice excludes other tenants strictly (tenant isolation)', () => {
    const file = seedMonth();
    const inv = lib.generateInvoice(file, { tenant: 'acme', period: '2026-05' });
    // The other-tenant entry adds 900 USD to cogs; the acme cogs is < 100.
    assert(inv.totals.cogs < 100, `acme cogs in May small, got ${inv.totals.cogs}`);
    // beta's project ('beta-x') must never appear in acme's project list
    assert(!inv.projects.some(p => p.project === 'beta-x'), 'no cross-tenant project leakage');
  }],

  ['invoice rejects malformed period strings', () => {
    const file = seedMonth();
    let threw = false;
    try { lib.generateInvoice(file, { tenant: 'acme', period: '2026/05' }); } catch (e) { threw = true; }
    assert(threw, 'bad format rejected');
    let threw2 = false;
    try { lib.generateInvoice(file, { tenant: 'acme', period: '2026-13' }); } catch (e) { threw2 = true; }
    assert(threw2, 'bad month rejected');
  }],

  ['projects on the invoice reflect the same period rollup', () => {
    const file = seedMonth();
    const inv = lib.generateInvoice(file, { tenant: 'acme', period: '2026-05' });
    const projects = inv.projects.map(p => p.project).sort();
    assertEqual(projects, ['alpha', 'beta'], 'two acme projects in May');
  }],
];

module.exports = tests;
