'use strict';

const { load } = require('./store');
const { tenantConfig, unitPriceForSlot, round6 } = require('./pricing');
const { bySlot, byProject } = require('./rollup');

// Generate a structured invoice for a tenant for a single calendar month
// (UTC). One line item per slot used, expressed as units = (tokens / 1M).
// `period` is 'YYYY-MM'.

function monthBounds(period) {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`invoice: period must look like 'YYYY-MM' (got ${period})`);
  }
  const [y, m] = period.split('-').map(n => parseInt(n, 10));
  if (m < 1 || m > 12) throw new Error(`invoice: bad month in ${period}`);
  const from = Date.UTC(y, m - 1, 1, 0, 0, 0, 0);
  const to   = Date.UTC(y, m,     1, 0, 0, 0, 0) - 1;
  return { from, to, year: y, month: m };
}

function invoiceId(tenant, period) {
  return `INV-${tenant}-${period.replace('-', '')}`;
}

function fmtDate(ts) {
  // YYYY-MM-DD in UTC
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Generates an invoice: one line per slot. Each line breaks out tokensIn/Out
// at the tenant's unit prices, the resulting subtotal, and the underlying
// cogs so the margin per line is auditable.
function generate(billingFile, { tenant, period } = {}) {
  if (!tenant) throw new Error('invoice: tenant is required');
  if (!period) throw new Error('invoice: period is required (YYYY-MM)');
  const { from, to, year, month } = monthBounds(period);
  const data = load(billingFile);
  const cfg = tenantConfig(data, tenant);

  const slotRoll = bySlot(billingFile, { tenant, from, to });
  const projectRoll = byProject(billingFile, { tenant, from, to });

  const lineItems = slotRoll.slots.map(s => {
    const up = unitPriceForSlot(data, tenant, s.slot) || { priceIn: 0, priceOut: 0 };
    const unitsIn  = round6(s.tokensIn  / 1e6);
    const unitsOut = round6(s.tokensOut / 1e6);
    const amountIn  = round6(unitsIn  * up.priceIn);
    const amountOut = round6(unitsOut * up.priceOut);
    return {
      slot: s.slot,
      model: s.model,
      calls: s.calls,
      tokensIn: s.tokensIn,
      tokensOut: s.tokensOut,
      unitsIn,                   // millions of input tokens
      unitsOut,                  // millions of output tokens
      unitPriceIn:  up.priceIn,  // per 1M input tokens
      unitPriceOut: up.priceOut, // per 1M output tokens
      amountIn,
      amountOut,
      subtotal: round6(amountIn + amountOut),
      cogsUsd:  round6(s.costUsd),
      marginUsd: round6((amountIn + amountOut) - s.costUsd),
    };
  });

  const subtotal  = round6(lineItems.reduce((a, l) => a + l.subtotal, 0));
  const cogsTotal = round6(lineItems.reduce((a, l) => a + l.cogsUsd, 0));
  const marginTotal = round6(subtotal - cogsTotal);

  // Issue + due dates
  const issueTs = to + 1;  // first instant after the period ends
  const dueTs   = issueTs + cfg.net_terms_days * 24 * 60 * 60 * 1000;

  return {
    invoiceId: invoiceId(tenant, period),
    tenant,
    period,
    periodStart: fmtDate(from),
    periodEnd: fmtDate(to),
    issueDate: fmtDate(issueTs),
    dueDate: fmtDate(dueTs),
    currency: cfg.currency,
    netTermsDays: cfg.net_terms_days,
    lineItems,
    projects: projectRoll.projects,
    totals: {
      subtotal,
      tax: 0,
      total: subtotal,
      cogs: cogsTotal,
      margin: marginTotal,
      marginPct: subtotal > 0 ? round6(marginTotal / subtotal) : 0,
    },
    meta: {
      year,
      month,
      generatedAt: new Date().toISOString(),
    },
  };
}

module.exports = { generate, monthBounds, invoiceId };
