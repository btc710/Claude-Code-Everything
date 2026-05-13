'use strict';

const ingest = require('./ingest');
const pricing = require('./pricing');
const rollup = require('./rollup');
const invoice = require('./invoice');
const store = require('./store');
const registry = require('./registry');

module.exports = {
  ...ingest,
  pricing,
  rollup,
  invoice,
  store,
  registry,
  // re-export the most-used pricing/rollup/invoice entry points at top level
  byPeriod: rollup.byPeriod,
  bySlot: rollup.bySlot,
  byProject: rollup.byProject,
  generateInvoice: invoice.generate,
  unitPriceForSlot: pricing.unitPriceForSlot,
  setTenantPricing: pricing.setTenantPricing,
  setTenantSlotPrice: pricing.setTenantSlotPrice,
  setDefaults: pricing.setDefaults,
};
