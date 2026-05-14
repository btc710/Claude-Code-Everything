'use strict';

const wiring = require('../src/wiring');
const { runHubspotMeetEmailScenario } = require('../src/scenario');
const { tmpDataDir, assert, assertEqual } = require('./helpers');

// Build a synthetic wiring object that forces stubs for every sibling.
function stubOnlyWiring() {
  // Start from the real loaders (model-gateway + project-ledger are
  // always required), then overwrite the four optional siblings with
  // fresh stubs.
  return {
    modelGateway:  wiring.modelGateway,
    projectLedger: wiring.projectLedger,
    tenants:       fakeTenants(),
    integrations:  fakeIntegrations(),
    notifier:      fakeNotifier(),
    audit:         fakeAudit(),
  };
}
function fakeTenants() {
  const map = new Map();
  return {
    kind: 'stub',
    createTenant(_f, { name }) {
      const t = { id: 'ten_' + map.size.toString(16).padStart(4, '0'), name };
      map.set(t.id, t);
      return t;
    },
    getTenant(_f, id) { return map.get(id) || null; },
  };
}
function fakeIntegrations() {
  return { kind: 'stub', listAdapters: () => [], getAdapter: () => null, OPERATIONS: [] };
}
function fakeNotifier() {
  return {
    kind: 'stub',
    buildDigest: b => ({ subject: `stub ${b.tenant}`, body: '' }),
  };
}
function fakeAudit() {
  const byDir = new Map();
  return {
    kind: 'stub',
    record(dir, ev) {
      const list = byDir.get(dir) || [];
      list.push(Object.assign({ id: 'evt_' + list.length, ts: new Date().toISOString() }, ev));
      byDir.set(dir, list);
      return list[list.length - 1];
    },
    query(dir, filter) {
      const list = byDir.get(dir) || [];
      return list.filter(e => e.tenantId === filter.tenantId);
    },
  };
}

const tests = [
  ['loadAll returns objects with all six modules', () => {
    const w = wiring.loadAll();
    assert(w.modelGateway && w.modelGateway.backtest, 'modelGateway.backtest');
    assert(w.modelGateway && w.modelGateway.ledger,   'modelGateway.ledger');
    assert(w.projectLedger && w.projectLedger.createProject, 'projectLedger');
    assert(w.tenants && typeof w.tenants.createTenant === 'function', 'tenants');
    assert(w.integrations && typeof w.integrations.listAdapters === 'function', 'integrations');
    assert(w.notifier && typeof w.notifier.buildDigest === 'function', 'notifier');
    assert(w.audit && typeof w.audit.record === 'function', 'audit');
  }],

  ['each loaded sibling reports kind=real or kind=stub', () => {
    const w = wiring.loadAll();
    for (const k of ['tenants', 'integrations', 'notifier', 'audit']) {
      assert(w[k].kind === 'real' || w[k].kind === 'stub', `${k}.kind is real or stub`);
    }
  }],

  ['stub-only wiring runs the full scenario end-to-end', async () => {
    const { ledgerFile, tenantFile, auditDir } = tmpDataDir();
    const w = stubOnlyWiring();
    const r = await runHubspotMeetEmailScenario({ wiring: w, ledgerFile, tenantFile, auditDir });
    assertEqual(r.stubs.tenants,      true, 'tenants stubbed');
    assertEqual(r.stubs.integrations, true, 'integrations stubbed');
    assertEqual(r.stubs.notifier,     true, 'notifier stubbed');
    assertEqual(r.stubs.audit,        true, 'audit stubbed');
    assertEqual(r.followups.length, 3, 'three followups still recorded');
    assertEqual(r.reviews.length,   3, 'three reviews still recorded');
  }],

  ['notifier.buildDigest accepts the followups+reviews from the scenario', async () => {
    const { ledgerFile, tenantFile, auditDir } = tmpDataDir();
    const r = await runHubspotMeetEmailScenario({ ledgerFile, tenantFile, auditDir });
    const openFollowups = r.followups.filter(f => f.status === 'open');
    // The digest builder takes a `projects` Map keyed by projectId.
    const projects = new Map([[r.projectId, { tenant: r.tenant.id, name: 'HubSpot → Meet → Email' }]]);
    const digest = r.wiring.notifier.buildDigest({
      tenant: r.tenant.id,
      owner: 'Blake',
      followups: openFollowups,
      reviews: r.reviews,
      projects,
    });
    assert(digest.subject.includes(r.tenant.id), 'digest subject names the tenant');
    assert(typeof digest.body === 'string', 'digest body is a string');
  }],

  ['integrations registry exposes hubspot when present, []+null when stubbed', () => {
    const w = wiring.loadAll();
    const adapters = w.integrations.listAdapters();
    if (w.integrations.kind === 'real') {
      assert(adapters.some(a => a.id === 'hubspot'), 'real registry lists hubspot');
      assert(w.integrations.getAdapter('hubspot'), 'getAdapter("hubspot") resolves');
    } else {
      // Stub path: at minimum the call shape is correct.
      assert(Array.isArray(adapters), 'listAdapters returns array');
    }
  }],
];

module.exports = tests;
