'use strict';

const lib = require('../src');
const { pricing } = lib;
const { tmpStoreFile, assert, assertEqual, assertClose, entry } = require('./helpers');

const tests = [
  ['margin defaults to 2.5x when no tenant override exists', () => {
    const file = tmpStoreFile();
    lib.ingest(file, [entry({ when: '2026-05-01T00:00:00Z', tenant: 'acme', slot: 'opus-4.7', tokensIn: 0, tokensOut: 0, costUsd: 0 })]);
    const cfg = pricing.tenantConfig(lib.store.load(file), 'acme');
    assertClose(cfg.margin_multiplier, 2.5, 'default multiplier');
  }],

  ['unit price = cogs * 2.5 by default (opus-4.7: 15 -> 37.5 in, 75 -> 187.5 out)', () => {
    const file = tmpStoreFile();
    const data = lib.store.load(file);
    const up = pricing.unitPriceForSlot(data, 'acme', 'opus-4.7');
    assertClose(up.priceIn,  37.5, 'priceIn');
    assertClose(up.priceOut, 187.5, 'priceOut');
  }],

  ['per-tenant margin override applies', () => {
    const file = tmpStoreFile();
    lib.setTenantPricing(file, 'acme', { margin_multiplier: 3 });
    const data = lib.store.load(file);
    const cfg = pricing.tenantConfig(data, 'acme');
    assertClose(cfg.margin_multiplier, 3, 'override multiplier');
    const up = pricing.unitPriceForSlot(data, 'acme', 'opus-4.7');
    assertClose(up.priceIn,  45, 'priceIn at 3x');
    assertClose(up.priceOut, 225, 'priceOut at 3x');
  }],

  ['per-tenant slot override beats the margin multiplier', () => {
    const file = tmpStoreFile();
    lib.setTenantPricing(file, 'acme', { margin_multiplier: 5 });
    lib.setTenantSlotPrice(file, 'acme', 'opus-4.7', { priceIn: 20, priceOut: 100 });
    const data = lib.store.load(file);
    const up = pricing.unitPriceForSlot(data, 'acme', 'opus-4.7');
    assertEqual(up, { priceIn: 20, priceOut: 100 }, 'slot override');
    // Other slots still use the 5x multiplier.
    const up2 = pricing.unitPriceForSlot(data, 'acme', 'haiku-4.5');
    assertClose(up2.priceIn, 4, 'haiku priceIn at 5x');
    assertClose(up2.priceOut, 20, 'haiku priceOut at 5x');
  }],

  ['changing global defaults affects tenants without overrides', () => {
    const file = tmpStoreFile();
    lib.setDefaults(file, { margin_multiplier: 4, currency: 'EUR', net_terms_days: 14 });
    const data = lib.store.load(file);
    const cfg = pricing.tenantConfig(data, 'no-override-tenant');
    assertClose(cfg.margin_multiplier, 4, 'defaults applied');
    assertEqual(cfg.currency, 'EUR', 'currency default');
    assertEqual(cfg.net_terms_days, 14, 'net terms default');
  }],

  ['revenueFor uses the resolved unit prices', () => {
    const file = tmpStoreFile();
    const data = lib.store.load(file);
    // opus-4.7 at 2.5x: 1M in -> $37.5, 1M out -> $187.5
    const e = entry({ when: '2026-05-01T00:00:00Z', tenant: 'acme', slot: 'opus-4.7', tokensIn: 1_000_000, tokensOut: 1_000_000, costUsd: 90 });
    const rev = pricing.revenueFor(data, 'acme', e);
    assertClose(rev, 225, 'revenue at 2.5x');
  }],

  ['unknown slot returns null unit price (and zero revenue)', () => {
    const file = tmpStoreFile();
    const data = lib.store.load(file);
    assertEqual(pricing.unitPriceForSlot(data, 'acme', 'no-such-slot'), null, 'null for unknown slot');
  }],
];

module.exports = tests;
