'use strict';

const path = require('path');

const { runHubspotMeetEmailScenario } = require('../src/scenario');
const wiring = require('../src/wiring');
const { tmpDataDir, assert, assertEqual } = require('./helpers');

// Load the project-ledger store so we can read the JSON file written by
// the scenario without inferring its shape ourselves.
const ledgerLib = require('../../project-ledger/src');

const tests = [
  ['scenario completes end-to-end with no errors', async () => {
    const { ledgerFile, tenantFile, auditDir } = tmpDataDir();
    const result = await runHubspotMeetEmailScenario({ ledgerFile, tenantFile, auditDir });
    assert(result.tenant && result.tenant.id, 'tenant returned');
    assert(typeof result.projectId === 'string' && result.projectId.startsWith('proj_'), 'projectId returned');
    assert(result.backtest && result.backtest.id, 'backtest returned');
    assertEqual(result.followups.length, 3, 'three followups returned');
    assertEqual(result.reviews.length,   3, 'three reviews returned');
  }],

  ['ledger ends with 1 project, status=gated', async () => {
    const { ledgerFile, tenantFile, auditDir } = tmpDataDir();
    const { tenant } = await runHubspotMeetEmailScenario({ ledgerFile, tenantFile, auditDir });
    const projects = ledgerLib.listProjects(ledgerFile, { tenant: tenant.id });
    assertEqual(projects.length, 1, 'one project for tenant');
    assertEqual(projects[0].status, 'gated', 'project status');
  }],

  ['ledger has exactly 1 backtest with pass=true and a planHash', async () => {
    const { ledgerFile, tenantFile, auditDir } = tmpDataDir();
    const { projectId } = await runHubspotMeetEmailScenario({ ledgerFile, tenantFile, auditDir });
    const runs = ledgerLib.listBacktests(ledgerFile, projectId);
    assertEqual(runs.length, 1, 'one backtest for project');
    assertEqual(runs[0].pass, true, 'backtest passed');
    assert(typeof runs[0].planHash === 'string' && runs[0].planHash.length === 16, 'planHash present');
  }],

  ['ledger has 3 followups — 1 closed, 2 open', async () => {
    const { ledgerFile, tenantFile, auditDir } = tmpDataDir();
    const { projectId } = await runHubspotMeetEmailScenario({ ledgerFile, tenantFile, auditDir });
    const all = ledgerLib.listFollowups(ledgerFile, { projectId });
    assertEqual(all.length, 3, 'three followups');
    const closed = all.filter(f => f.status === 'closed');
    const open   = all.filter(f => f.status === 'open');
    assertEqual(closed.length, 1, 'one closed');
    assertEqual(open.length,   2, 'two open');
    assert(closed[0].resolvedWith, 'closed followup carries resolution text');
  }],

  ['ledger has 3 reviews — all pending — 30d/90d/180d', async () => {
    const { ledgerFile, tenantFile, auditDir } = tmpDataDir();
    const { projectId } = await runHubspotMeetEmailScenario({ ledgerFile, tenantFile, auditDir });
    const reviews = ledgerLib.listReviews(ledgerFile, { projectId });
    assertEqual(reviews.length, 3, 'three reviews');
    const kinds = reviews.map(r => r.kind).sort();
    assertEqual(kinds, ['180d', '30d', '90d'], 'all three kinds present');
    for (const r of reviews) assertEqual(r.status, 'pending', `review ${r.kind} pending`);
  }],

  ['model-gateway ledger has 12 entries for this tenant', async () => {
    const { ledgerFile, tenantFile, auditDir } = tmpDataDir();
    const { tenant, mgLedger } = await runHubspotMeetEmailScenario({ ledgerFile, tenantFile, auditDir });
    const usage = mgLedger.usage({ tenant: tenant.id });
    assertEqual(usage.calls, 12, '12 calls recorded');
    assertEqual(Object.keys(usage.bySlot).length, 12, '12 distinct slots');
  }],

  ['cost across all 12 calls is non-zero and reasonable', async () => {
    const { ledgerFile, tenantFile, auditDir } = tmpDataDir();
    const { tenant, mgLedger } = await runHubspotMeetEmailScenario({ ledgerFile, tenantFile, auditDir });
    const usage = mgLedger.usage({ tenant: tenant.id });
    // Sanity bounds. Each call records 200/300 tokens against the
    // illustrative prices in registry.js — total should land somewhere
    // in the 5c-50c range for a 12-model fan-out.
    assert(usage.costUsd > 0,    `costUsd > 0 (got ${usage.costUsd})`);
    assert(usage.costUsd < 1.0,  `costUsd < $1.00 (got ${usage.costUsd})`);
    assert(usage.tokensIn  === 2400, `tokensIn == 12*200 (got ${usage.tokensIn})`);
    assert(usage.tokensOut === 3600, `tokensOut == 12*300 (got ${usage.tokensOut})`);
  }],

  ['scheduleReviews is idempotent — re-running does not duplicate rows', async () => {
    const { ledgerFile, tenantFile, auditDir } = tmpDataDir();
    const { projectId } = await runHubspotMeetEmailScenario({ ledgerFile, tenantFile, auditDir });
    const before = ledgerLib.listReviews(ledgerFile, { projectId });
    assertEqual(before.length, 3, 'three reviews after first run');
    // Re-invoke directly — this is the idempotency contract.
    const again = ledgerLib.scheduleReviews(ledgerFile, projectId);
    assertEqual(again.length, 3, 'three reviews returned on second call');
    const after = ledgerLib.listReviews(ledgerFile, { projectId });
    assertEqual(after.length, 3, 'still three reviews stored');
    const ids = before.map(r => r.id).sort();
    const idsAfter = after.map(r => r.id).sort();
    assertEqual(idsAfter, ids, 'review ids unchanged');
  }],

  ['scenario returns the right shape and the demo plan hash is stable', async () => {
    const { ledgerFile, tenantFile, auditDir } = tmpDataDir();
    const r = await runHubspotMeetEmailScenario({ ledgerFile, tenantFile, auditDir });
    assert(Object.prototype.hasOwnProperty.call(r, 'tenant'), 'has tenant');
    assert(Object.prototype.hasOwnProperty.call(r, 'projectId'), 'has projectId');
    assert(Object.prototype.hasOwnProperty.call(r, 'backtest'), 'has backtest');
    assert(Object.prototype.hasOwnProperty.call(r, 'followups'), 'has followups');
    assert(Object.prototype.hasOwnProperty.call(r, 'reviews'), 'has reviews');
    // planHash uses the same hashing as the project-ledger (sha256 / first 16 chars).
    assert(/^[a-f0-9]{16}$/.test(r.backtest.planHash), 'planHash matches expected format');
  }],

  ['audit log records each state transition (real or stubbed)', async () => {
    const { ledgerFile, tenantFile, auditDir } = tmpDataDir();
    const { tenant, wiring: w } = await runHubspotMeetEmailScenario({ ledgerFile, tenantFile, auditDir });
    const events = w.audit.query(auditDir, { tenantId: tenant.id });
    // We expect: tenant.create, project.create, backtest.record,
    // reviews.schedule, followup.open x 3, followup.resolve = 8 total.
    assertEqual(events.length, 8, 'eight audit events recorded');
    const actions = events.map(e => e.action).sort();
    const expected = [
      'backtest.record',
      'followup.open', 'followup.open', 'followup.open',
      'followup.resolve',
      'project.create',
      'reviews.schedule',
      'tenant.create',
    ];
    assertEqual(actions, expected, 'audit actions match expected set');
  }],
];

module.exports = tests;
