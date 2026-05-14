'use strict';

const { load } = require('./store');
const { revenueFor, round6, tenantConfig } = require('./pricing');

// Aggregations over the billing store. All rollups respect tenant isolation:
// the caller MUST pass a `tenant` and only entries belonging to that tenant
// are included in totals.

function parseBound(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error(`rollup: cannot parse date: ${v}`);
  return t;
}

function filterEntries(data, { tenant, from, to, project }) {
  if (!tenant) throw new Error('rollup: tenant is required');
  const lo = parseBound(from, -Infinity);
  const hi = parseBound(to, Infinity);
  return data.entries.filter(e =>
    e.tenant === tenant &&
    e.ts >= lo &&
    e.ts <= hi &&
    (!project || e.project === project)
  );
}

function bucketKey(ts, granularity) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  if (granularity === 'month') return `${y}-${m}`;
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyBucket() {
  return {
    calls: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    revenueUsd: 0,
    marginUsd: 0,
  };
}

function finalizeBucket(b) {
  b.costUsd     = round6(b.costUsd);
  b.revenueUsd  = round6(b.revenueUsd);
  b.marginUsd   = round6(b.revenueUsd - b.costUsd);
  b.marginPct   = b.revenueUsd > 0 ? round6(b.marginUsd / b.revenueUsd) : 0;
  return b;
}

// byPeriod — buckets entries by day or month and emits usage/cost/revenue/margin.
function byPeriod(billingFile, { tenant, from, to, granularity = 'day' } = {}) {
  if (granularity !== 'day' && granularity !== 'month') {
    throw new Error(`rollup.byPeriod: granularity must be 'day' or 'month'`);
  }
  const data = load(billingFile);
  const rows = filterEntries(data, { tenant, from, to });
  const cfg = tenantConfig(data, tenant);
  const buckets = new Map();
  for (const e of rows) {
    const key = bucketKey(e.ts, granularity);
    if (!buckets.has(key)) buckets.set(key, emptyBucket());
    const b = buckets.get(key);
    const rev = revenueFor(data, tenant, e);
    b.calls      += 1;
    b.tokensIn   += e.tokensIn;
    b.tokensOut  += e.tokensOut;
    b.costUsd    += e.costUsd;
    b.revenueUsd += rev;
  }
  const out = [];
  for (const [period, b] of [...buckets.entries()].sort()) {
    out.push({ period, ...finalizeBucket(b) });
  }
  // Top-line totals over the requested window.
  const totals = emptyBucket();
  for (const b of out) {
    totals.calls      += b.calls;
    totals.tokensIn   += b.tokensIn;
    totals.tokensOut  += b.tokensOut;
    totals.costUsd    += b.costUsd;
    totals.revenueUsd += b.revenueUsd;
  }
  return {
    tenant,
    granularity,
    from: from || null,
    to: to || null,
    currency: cfg.currency,
    buckets: out,
    totals: finalizeBucket(totals),
  };
}

// bySlot — model attribution: which slots drove the spend?
function bySlot(billingFile, { tenant, from, to } = {}) {
  const data = load(billingFile);
  const rows = filterEntries(data, { tenant, from, to });
  const cfg = tenantConfig(data, tenant);
  const slots = new Map();
  for (const e of rows) {
    if (!slots.has(e.slot)) {
      slots.set(e.slot, {
        slot: e.slot,
        model: e.model || null,
        calls: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        revenueUsd: 0,
      });
    }
    const s = slots.get(e.slot);
    s.calls      += 1;
    s.tokensIn   += e.tokensIn;
    s.tokensOut  += e.tokensOut;
    s.costUsd    += e.costUsd;
    s.revenueUsd += revenueFor(data, tenant, e);
  }
  const out = [...slots.values()]
    .map(s => {
      s.costUsd    = round6(s.costUsd);
      s.revenueUsd = round6(s.revenueUsd);
      s.marginUsd  = round6(s.revenueUsd - s.costUsd);
      s.marginPct  = s.revenueUsd > 0 ? round6(s.marginUsd / s.revenueUsd) : 0;
      return s;
    })
    .sort((a, b) => b.revenueUsd - a.revenueUsd);
  return { tenant, currency: cfg.currency, slots: out };
}

// byProject — per-project cost rollup, filterable to a single project.
function byProject(billingFile, { tenant, from, to, project = null } = {}) {
  const data = load(billingFile);
  const rows = filterEntries(data, { tenant, from, to, project });
  const cfg = tenantConfig(data, tenant);
  const projects = new Map();
  for (const e of rows) {
    const key = e.project == null ? '__unassigned__' : e.project;
    if (!projects.has(key)) {
      projects.set(key, {
        project: e.project == null ? null : e.project,
        calls: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        revenueUsd: 0,
      });
    }
    const p = projects.get(key);
    p.calls      += 1;
    p.tokensIn   += e.tokensIn;
    p.tokensOut  += e.tokensOut;
    p.costUsd    += e.costUsd;
    p.revenueUsd += revenueFor(data, tenant, e);
  }
  const out = [...projects.values()]
    .map(p => {
      p.costUsd    = round6(p.costUsd);
      p.revenueUsd = round6(p.revenueUsd);
      p.marginUsd  = round6(p.revenueUsd - p.costUsd);
      p.marginPct  = p.revenueUsd > 0 ? round6(p.marginUsd / p.revenueUsd) : 0;
      return p;
    })
    .sort((a, b) => b.revenueUsd - a.revenueUsd);
  return { tenant, currency: cfg.currency, projects: out };
}

module.exports = { byPeriod, bySlot, byProject, filterEntries, bucketKey };
