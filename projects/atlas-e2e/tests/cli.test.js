'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const cli = require('../src/cli');
const { assert, assertEqual } = require('./helpers');

function makeIsolatedDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-e2e-cli-'));
}

const tests = [
  ['runCmd writes a ledger.json and prints a summary', async () => {
    const dir = makeIsolatedDir();
    const prevEnv = process.env.ATLAS_E2E_DATA_DIR;
    process.env.ATLAS_E2E_DATA_DIR = dir;

    // Capture stdout so the harness output doesn't leak into test output.
    const origLog = console.log;
    const captured = [];
    console.log = (...a) => captured.push(a.map(String).join(' '));

    let summary;
    try {
      summary = await cli.runCmd();
    } finally {
      console.log = origLog;
      if (prevEnv) process.env.ATLAS_E2E_DATA_DIR = prevEnv;
      else delete process.env.ATLAS_E2E_DATA_DIR;
    }

    const ledgerFile = path.join(dir, 'ledger.json');
    assert(fs.existsSync(ledgerFile), 'ledger.json written by CLI');
    const data = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    assertEqual(data.projects.length, 1, 'one project on disk');
    assertEqual(data.backtests.length, 1, 'one backtest on disk');
    assertEqual(data.followups.length, 3, 'three followups on disk');
    assertEqual(data.reviews.length, 3, 'three reviews on disk');
    assert(summary && summary.cost && summary.cost.costUsd > 0, 'summary carries a positive cost');
  }],

  ['pathsFor maps a base dir to ledger/tenant/audit', () => {
    const p = cli.pathsFor('/tmp/x');
    assertEqual(p.ledgerFile, '/tmp/x/ledger.json', 'ledger path');
    assertEqual(p.tenantFile, '/tmp/x/tenants.json', 'tenant path');
    assertEqual(p.auditDir,   '/tmp/x/audit', 'audit path');
  }],
];

module.exports = tests;
