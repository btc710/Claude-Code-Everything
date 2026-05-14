'use strict';

// Sibling project wiring. Each Atlas module may or may not exist at the
// time this harness runs (siblings can land in parallel). We probe for
// each one and fall back to a minimal stub that exposes only the
// interfaces this harness actually exercises.
//
// When a real sibling exists we always prefer it. When a stub is used
// the returned `kind` field is 'stub' so the caller (and tests) can
// assert which path was taken.

const path = require('path');

// Required siblings — these have to be present or the scenario cannot run.
const modelGateway = {
  backtest: require('../../model-gateway/src/backtest'),
  ledger:   require('../../model-gateway/src/ledger'),
  registry: require('../../model-gateway/src/registry'),
};
const projectLedger = require('../../project-ledger/src');

function tryRequire(relPath) {
  try {
    const full = path.resolve(__dirname, relPath);
    return { kind: 'real', mod: require(full) };
  } catch (e) {
    return null;
  }
}

// ---- atlas-tenants ----------------------------------------------------
//
// We use only createTenant + getTenant. If the sibling is missing the
// stub keeps an in-memory map and writes a sidecar JSON file alongside
// the ledger so the scenario behaves the same way.
function loadTenants() {
  // STUB: replace with require('../../atlas-tenants') when available
  const real = tryRequire('../../atlas-tenants/src/index');
  if (real) {
    return {
      kind: 'real',
      createTenant: (file, opts) => real.mod.createTenant(file, opts),
      getTenant:    (file, id)   => real.mod.getTenant(file, id),
    };
  }
  const tenants = new Map();
  return {
    kind: 'stub',
    createTenant(_file, { name }) {
      const id = 'ten_' + Buffer.from(String(name)).toString('hex').slice(0, 12);
      const tenant = { id, name, slug: String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-'), createdAt: new Date().toISOString() };
      tenants.set(id, tenant);
      return tenant;
    },
    getTenant(_file, id) { return tenants.get(id) || null; },
  };
}

// ---- atlas-integrations ----------------------------------------------
//
// We exercise the registry shape (listAdapters, getAdapter, OPERATIONS).
// The scenario doesn't actually call out to real HubSpot — we just want
// to demonstrate that the adapter contract is reachable from the e2e
// harness.
function loadIntegrations() {
  // STUB: replace with require('../../atlas-integrations') when available
  const real = tryRequire('../../atlas-integrations/src/registry');
  if (real) {
    return {
      kind: 'real',
      listAdapters: real.mod.listAdapters,
      getAdapter:   real.mod.getAdapter,
      OPERATIONS:   real.mod.OPERATIONS,
    };
  }
  const fakeAdapter = { id: 'hubspot', authKind: 'oauth2', operations: ['lookupContact', 'postNote'] };
  return {
    kind: 'stub',
    listAdapters: () => [fakeAdapter],
    getAdapter:   id => (id === 'hubspot' ? fakeAdapter : null),
    OPERATIONS:   ['lookupContact', 'createCalendarEvent', 'sendEmail', 'postNote', 'pushDealUpdate'],
  };
}

// ---- atlas-notifier --------------------------------------------------
//
// We exercise `buildDigest` for the followups+reviews returned by the
// scenario. The real implementation lives in scheduler.js but accepts
// the same shape.
function loadNotifier() {
  // STUB: replace with require('../../atlas-notifier') when available
  const real = tryRequire('../../atlas-notifier/src/digest');
  if (real) {
    return {
      kind: 'real',
      buildDigest: real.mod.buildDigest,
    };
  }
  return {
    kind: 'stub',
    buildDigest(batch) {
      const { tenant, owner, followups = [], reviews = [] } = batch;
      const subject = `Atlas digest — ${tenant}${owner ? ' for ' + owner : ''} — ${followups.length} stale, ${reviews.length} reviews`;
      const body = [
        ...followups.map(f => `- [followup] "${f.topic}" — unblockBy ${f.unblockBy}`),
        ...reviews.map(r => `- [review/${r.kind}] due ${r.dueAt}`),
      ].join('\n');
      return { subject, body };
    },
  };
}

// ---- atlas-audit -----------------------------------------------------
//
// We exercise `record` + `query`. Audit events live in their own
// directory and the scenario writes one event per state transition so
// the e2e test can assert the journal exists at the end.
function loadAudit() {
  // STUB: replace with require('../../atlas-audit') when available
  const real = tryRequire('../../atlas-audit/src/index');
  if (real) {
    return {
      kind: 'real',
      record: real.mod.record,
      query:  real.mod.query,
    };
  }
  // In-memory stub: stores events in a Map keyed by directory.
  const byDir = new Map();
  return {
    kind: 'stub',
    record(dir, ev) {
      const list = byDir.get(dir) || [];
      const out = Object.assign({
        id: 'evt_' + (list.length + 1).toString(16).padStart(8, '0'),
        ts: new Date().toISOString(),
        residency: ev.residency || 'us',
      }, ev);
      list.push(out);
      byDir.set(dir, list);
      return out;
    },
    query(dir, filter) {
      if (!filter || !filter.tenantId) throw new Error('query: tenantId required');
      const list = byDir.get(dir) || [];
      return list.filter(ev => ev.tenantId === filter.tenantId);
    },
  };
}

function loadAll() {
  return {
    modelGateway,
    projectLedger,
    tenants:      loadTenants(),
    integrations: loadIntegrations(),
    notifier:     loadNotifier(),
    audit:        loadAudit(),
  };
}

module.exports = {
  loadAll,
  loadTenants,
  loadIntegrations,
  loadNotifier,
  loadAudit,
  modelGateway,
  projectLedger,
};
