'use strict';

const { getSlot } = require('./registry');
const { withStore, load } = require('./store');

// Per-tenant pricing model.
//
// - cogs: the vendor cost, taken from the local registry (must match the
//   gateway's published prices). Per-1M-tokens.
// - unit_price: what the tenant is charged. Defaults to cogs * margin_multiplier
//   (default 2.5x). Per-tenant overrides supported, either as a uniform
//   margin_multiplier override or as explicit per-slot unit prices.

const DEFAULT_MARGIN_MULTIPLIER = 2.5;
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_NET_TERMS_DAYS = 30;

function defaults(data) {
  const d = (data && data.pricing && data.pricing.defaults) || {};
  return {
    margin_multiplier: d.margin_multiplier != null ? d.margin_multiplier : DEFAULT_MARGIN_MULTIPLIER,
    currency: d.currency || DEFAULT_CURRENCY,
    net_terms_days: d.net_terms_days != null ? d.net_terms_days : DEFAULT_NET_TERMS_DAYS,
  };
}

function tenantConfig(data, tenant) {
  const t = (data && data.pricing && data.pricing.tenants && data.pricing.tenants[tenant]) || {};
  const d = defaults(data);
  return {
    margin_multiplier: t.margin_multiplier != null ? t.margin_multiplier : d.margin_multiplier,
    currency: t.currency || d.currency,
    net_terms_days: t.net_terms_days != null ? t.net_terms_days : d.net_terms_days,
    slot_unit_prices: t.slot_unit_prices || {},
  };
}

function cogsForSlot(slotId) {
  const def = getSlot(slotId);
  if (!def) return null;
  return { priceIn: def.priceIn, priceOut: def.priceOut };
}

// Resolve the unit prices a given tenant pays for a given slot.
// Returns { priceIn, priceOut } per 1M tokens.
function unitPriceForSlot(data, tenant, slotId) {
  const cfg = tenantConfig(data, tenant);
  if (cfg.slot_unit_prices && cfg.slot_unit_prices[slotId]) {
    const override = cfg.slot_unit_prices[slotId];
    return { priceIn: override.priceIn, priceOut: override.priceOut };
  }
  const cogs = cogsForSlot(slotId);
  if (!cogs) return null;
  return {
    priceIn: round6(cogs.priceIn * cfg.margin_multiplier),
    priceOut: round6(cogs.priceOut * cfg.margin_multiplier),
  };
}

// Revenue for a single ledger entry, in USD-equivalent (currency conversion
// happens at the invoice layer if/when it's wired up; we keep numbers raw here).
function revenueFor(data, tenant, entry) {
  const up = unitPriceForSlot(data, tenant, entry.slot);
  if (!up) return 0;
  const r = (entry.tokensIn / 1e6) * up.priceIn + (entry.tokensOut / 1e6) * up.priceOut;
  return round6(r);
}

function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}

// Mutating helpers — write through the JSON store.

function setDefaults(billingFile, patch) {
  withStore(billingFile, (data) => {
    data.pricing.defaults = { ...defaults(data), ...patch };
  });
  return defaults(load(billingFile));
}

function setTenantPricing(billingFile, tenant, patch) {
  withStore(billingFile, (data) => {
    const cur = data.pricing.tenants[tenant] || {};
    data.pricing.tenants[tenant] = { ...cur, ...patch };
  });
  return tenantConfig(load(billingFile), tenant);
}

function setTenantSlotPrice(billingFile, tenant, slotId, { priceIn, priceOut }) {
  withStore(billingFile, (data) => {
    const cur = data.pricing.tenants[tenant] || {};
    const slots = { ...(cur.slot_unit_prices || {}) };
    slots[slotId] = { priceIn, priceOut };
    data.pricing.tenants[tenant] = { ...cur, slot_unit_prices: slots };
  });
  return tenantConfig(load(billingFile), tenant);
}

module.exports = {
  DEFAULT_MARGIN_MULTIPLIER,
  DEFAULT_CURRENCY,
  DEFAULT_NET_TERMS_DAYS,
  defaults,
  tenantConfig,
  cogsForSlot,
  unitPriceForSlot,
  revenueFor,
  setDefaults,
  setTenantPricing,
  setTenantSlotPrice,
  round6,
};
