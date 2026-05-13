#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const { runHubspotMeetEmailScenario } = require('./scenario');
const wiring = require('./wiring');

const DATA_DIR    = path.resolve(process.cwd(), 'e2e-data');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.json');
const TENANT_FILE = path.join(DATA_DIR, 'tenants.json');
const AUDIT_DIR   = path.join(DATA_DIR, 'audit');

function usage() {
  console.log(`atlas-e2e — end-to-end Atlas integration harness

  atlas-e2e run         Run the canonical HubSpot/Meet/Email scenario against ./e2e-data/
  atlas-e2e clean       Remove ./e2e-data/
  atlas-e2e help        Show this message

Env:
  ATLAS_E2E_DATA_DIR    Override the data directory (default: ./e2e-data)`);
}

function dataDir() {
  return process.env.ATLAS_E2E_DATA_DIR || DATA_DIR;
}

function pathsFor(dir) {
  return {
    ledgerFile: path.join(dir, 'ledger.json'),
    tenantFile: path.join(dir, 'tenants.json'),
    auditDir:   path.join(dir, 'audit'),
  };
}

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  if (fs.rmSync) { fs.rmSync(p, { recursive: true, force: true }); return; }
  // Fallback for very old Node (we require >=18 so this never fires).
  for (const f of fs.readdirSync(p)) {
    const full = path.join(p, f);
    if (fs.statSync(full).isDirectory()) rmrf(full);
    else fs.unlinkSync(full);
  }
  fs.rmdirSync(p);
}

async function runCmd() {
  const dir = dataDir();
  const { ledgerFile, tenantFile, auditDir } = pathsFor(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(auditDir, { recursive: true });

  const w = wiring.loadAll();
  const stubLabels = Object.entries({
    'atlas-tenants':      w.tenants.kind,
    'atlas-integrations': w.integrations.kind,
    'atlas-notifier':     w.notifier.kind,
    'atlas-audit':        w.audit.kind,
  }).map(([k, v]) => `${k}=${v}`).join(' ');

  console.log(`[atlas-e2e] data dir: ${dir}`);
  console.log(`[atlas-e2e] wiring : ${stubLabels}`);

  const result = await runHubspotMeetEmailScenario({
    wiring: w,
    ledgerFile,
    tenantFile,
    auditDir,
  });

  // Cost rollup across the 12-model backtest.
  const usage = result.mgLedger.usage({ tenant: result.tenant.id });

  const summary = {
    tenant: result.tenant.id,
    projectId: result.projectId,
    projectStatus: 'gated',
    backtest: {
      id: result.backtest.id,
      pass: result.backtest.pass,
      planHash: result.backtest.planHash,
      mean: result.backtest.summary && result.backtest.summary.mean,
    },
    followups: result.followups.map(f => ({ id: f.id, topic: f.topic, status: f.status })),
    reviews: result.reviews.map(r => ({ id: r.id, kind: r.kind, dueAt: r.dueAt, status: r.status })),
    cost: {
      calls: usage.calls,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costUsd: usage.costUsd,
    },
    stubs: result.stubs,
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

async function main() {
  const cmd = process.argv[2] || 'help';
  try {
    switch (cmd) {
      case 'run':
        await runCmd();
        break;
      case 'clean':
        rmrf(dataDir());
        console.log(`[atlas-e2e] removed ${dataDir()}`);
        break;
      case 'help':
      case '-h':
      case '--help':
        usage();
        break;
      default:
        usage();
        process.exitCode = 1;
    }
  } catch (e) {
    console.error(`error: ${e.message}`);
    if (process.env.ATLAS_E2E_DEBUG) console.error(e.stack);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { main, runCmd, pathsFor };
