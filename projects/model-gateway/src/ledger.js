'use strict';

// In-memory usage ledger. Swap for a DB-backed implementation in prod.
// Each entry: { ts, tenant, slot, model, tokensIn, tokensOut, costUsd, project }

const { getSlot } = require('./registry');

class Ledger {
  constructor() {
    this.entries = [];
  }

  record({ tenant, slot, tokensIn, tokensOut, project = null }) {
    const def = getSlot(slot);
    if (!def) throw new Error(`unknown slot ${slot}`);
    const costUsd =
      (tokensIn  / 1e6) * def.priceIn +
      (tokensOut / 1e6) * def.priceOut;
    const entry = {
      ts: Date.now(),
      tenant,
      slot: def.id,
      model: def.model,
      tokensIn,
      tokensOut,
      costUsd: Math.round(costUsd * 1e6) / 1e6,
      project,
    };
    this.entries.push(entry);
    return entry;
  }

  usage({ tenant, since = 0, project = null } = {}) {
    const rows = this.entries.filter(e =>
      (!tenant || e.tenant === tenant) &&
      (!project || e.project === project) &&
      e.ts >= since
    );
    let tokensIn = 0, tokensOut = 0, costUsd = 0;
    const bySlot = {};
    for (const e of rows) {
      tokensIn  += e.tokensIn;
      tokensOut += e.tokensOut;
      costUsd   += e.costUsd;
      const k = e.slot;
      bySlot[k] = bySlot[k] || { calls: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 };
      bySlot[k].calls    += 1;
      bySlot[k].tokensIn  += e.tokensIn;
      bySlot[k].tokensOut += e.tokensOut;
      bySlot[k].costUsd   += e.costUsd;
    }
    return {
      calls: rows.length,
      tokensIn,
      tokensOut,
      costUsd: Math.round(costUsd * 1e6) / 1e6,
      bySlot,
    };
  }
}

module.exports = { Ledger };
