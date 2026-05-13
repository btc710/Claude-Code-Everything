'use strict';

// runHubspotMeetEmailScenario — the canonical Atlas demo flow.
//
// 1. Create a tenant (or use 'demo').
// 2. Create a project in the ledger.
// 3. Run a 12-model backtest via the model-gateway against fake fetch.
// 4. Store the backtest in the ledger; project flips draft -> gated.
// 5. Schedule the 30/90/180 reviews.
// 6. Open 3 followups.
// 7. Resolve one, leave two open.
// 8. Return { tenant, projectId, backtest, followups, reviews } for
//    assertion.

const path = require('path');
const wiring = require('./wiring');
const fakeFetch = require('./fake-fetch');

const DEMO_PLAN = [
  '# HubSpot → Google Meet → Gmail',
  '',
  'Schedule a project discussion: look up the HubSpot contact, create a',
  'Google Meet via Calendar, send an HTML+text email, and log a note on',
  'the contact. Covers happy path + auth refresh + retryable transient',
  'failures with explicit observability and rollback.',
].join('\n');

const DEFAULT_FOLLOWUPS = [
  { topic: 'CC team or static list?',           owner: 'Blake', unblockInDays: 3 },
  { topic: 'Time zone for off-hours bookings?', owner: 'Sam',   unblockInDays: 5 },
  { topic: 'Which calendar ID is canonical?',   owner: 'Blake', unblockInDays: 2 },
];

async function runHubspotMeetEmailScenario(ctx = {}) {
  const w = ctx.wiring || wiring.loadAll();
  const fetchImpl = ctx.fetchImpl || fakeFetch.makeAllPassFetch();
  const env = ctx.env || fakeFetch.FAKE_ENV;
  const tenantFile  = ctx.tenantFile  || null; // some stubs ignore this
  const ledgerFile  = ctx.ledgerFile;
  const auditDir    = ctx.auditDir    || null;
  const projectName = ctx.projectName || 'HubSpot → Meet → Email';
  const followupsToOpen = ctx.followups || DEFAULT_FOLLOWUPS;
  const plan        = ctx.plan        || DEMO_PLAN;

  if (!ledgerFile) throw new Error('runHubspotMeetEmailScenario: ledgerFile required');

  // --- step 1: tenant ----------------------------------------------------
  let tenant;
  if (ctx.tenantId) {
    tenant = w.tenants.getTenant(tenantFile, ctx.tenantId)
      || { id: ctx.tenantId, name: ctx.tenantId };
  } else {
    tenant = w.tenants.createTenant(tenantFile, { name: ctx.tenantName || 'demo' });
  }
  if (auditDir) {
    w.audit.record(auditDir, {
      tenantId: tenant.id, actorId: 'system', action: 'tenant.create',
      resource: 'tenant', resourceId: tenant.id,
      before: null, after: { name: tenant.name },
    });
  }

  // --- step 2: project ---------------------------------------------------
  const project = w.projectLedger.createProject(ledgerFile, {
    tenant: tenant.id,
    name: projectName,
    scope: { description: 'HubSpot → Google Meet → Gmail orchestration', surfaces: ['hubspot', 'google'] },
    estimate: { lowerHours: 6, upperHours: 14 },
  });
  if (auditDir) {
    w.audit.record(auditDir, {
      tenantId: tenant.id, actorId: 'system', action: 'project.create',
      resource: 'project', resourceId: project.id,
      before: null, after: { name: project.name, status: project.status },
    });
  }

  // --- step 3: 12-model backtest ----------------------------------------
  const mgLedger = new w.modelGateway.ledger.Ledger();
  const gatewayResult = await w.modelGateway.backtest.runBacktest({
    plan,
    tenant: tenant.id,
    project: project.id,
    env,
    ledger: mgLedger,
    fetchImpl,
  });

  // --- step 4: record backtest -> project flips to gated ----------------
  const backtest = w.projectLedger.recordBacktest(ledgerFile, {
    projectId: project.id,
    plan,
    summary: gatewayResult.summary,
    results: gatewayResult.results,
  });
  if (auditDir) {
    w.audit.record(auditDir, {
      tenantId: tenant.id, actorId: 'system', action: 'backtest.record',
      resource: 'backtest', resourceId: backtest.id,
      before: { projectStatus: 'draft' },
      after:  { projectStatus: 'gated', pass: backtest.pass, mean: backtest.summary && backtest.summary.mean },
    });
  }

  // --- step 5: schedule 30/90/180 reviews -------------------------------
  const reviews = w.projectLedger.scheduleReviews(ledgerFile, project.id);
  if (auditDir) {
    w.audit.record(auditDir, {
      tenantId: tenant.id, actorId: 'system', action: 'reviews.schedule',
      resource: 'project', resourceId: project.id,
      before: null, after: { reviewCount: reviews.length, kinds: reviews.map(r => r.kind) },
    });
  }

  // --- step 6: open 3 followups -----------------------------------------
  const followups = [];
  for (const f of followupsToOpen) {
    const opened = w.projectLedger.openFollowup(ledgerFile, {
      projectId: project.id,
      topic: f.topic,
      owner: f.owner || null,
      unblockInDays: f.unblockInDays == null ? 3 : f.unblockInDays,
    });
    followups.push(opened);
    if (auditDir) {
      w.audit.record(auditDir, {
        tenantId: tenant.id, actorId: 'system', action: 'followup.open',
        resource: 'followup', resourceId: opened.id,
        before: null, after: { topic: opened.topic, owner: opened.owner, status: opened.status },
      });
    }
  }

  // --- step 7: resolve first followup, leave the other two open ---------
  const resolved = w.projectLedger.resolveFollowup(
    ledgerFile,
    followups[0].id,
    'Closed — pulled from deal owners; static fallback for unowned deals.',
  );
  followups[0] = resolved; // keep the returned array up to date
  if (auditDir) {
    w.audit.record(auditDir, {
      tenantId: tenant.id, actorId: 'system', action: 'followup.resolve',
      resource: 'followup', resourceId: resolved.id,
      before: { status: 'open' }, after: { status: resolved.status, resolvedWith: resolved.resolvedWith },
    });
  }

  return {
    tenant,
    projectId: project.id,
    backtest,
    followups,
    reviews,
    // Auxiliary state callers may want to inspect.
    mgLedger,
    gatewayResult,
    wiring: w,
    stubs: {
      tenants:      w.tenants.kind === 'stub',
      integrations: w.integrations.kind === 'stub',
      notifier:     w.notifier.kind === 'stub',
      audit:        w.audit.kind === 'stub',
    },
  };
}

module.exports = {
  runHubspotMeetEmailScenario,
  DEMO_PLAN,
  DEFAULT_FOLLOWUPS,
};
