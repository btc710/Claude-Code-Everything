'use strict';

const fs = require('fs');
const path = require('path');

// JSON-file store for the billing service. Swap for Postgres in production
// by re-implementing load() and save(); the rest of the package only consumes
// the in-memory shape returned by load().
//
// Shape:
//   {
//     version: 1,
//     entries: [
//       // gateway-shaped ledger entries — see model-gateway/src/ledger.js
//       { ts, tenant, slot, model, tokensIn, tokensOut, costUsd, project }
//     ],
//     pricing: {
//       defaults: { margin_multiplier: 2.5, currency: 'USD', net_terms_days: 30 },
//       tenants: {
//         // per-tenant overrides; all optional
//         '<tenantId>': {
//           margin_multiplier: <number>?,
//           currency: <string>?,
//           net_terms_days: <number>?,
//           slot_unit_prices: { '<slotId>': { priceIn: <number>, priceOut: <number> } }
//         }
//       }
//     }
//   }

const EMPTY = () => ({
  version: 1,
  entries: [],
  pricing: { defaults: {}, tenants: {} },
});

function load(file) {
  if (!fs.existsSync(file)) return EMPTY();
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    // gentle migration: ensure required keys exist on older files
    if (!data.entries) data.entries = [];
    if (!data.pricing) data.pricing = { defaults: {}, tenants: {} };
    if (!data.pricing.tenants) data.pricing.tenants = {};
    if (!data.pricing.defaults) data.pricing.defaults = {};
    return data;
  } catch (e) {
    throw new Error(`store load failed: ${e.message}`);
  }
}

function save(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function withStore(file, fn) {
  const data = load(file);
  const result = fn(data);
  save(file, data);
  return result;
}

module.exports = { load, save, withStore, EMPTY };
