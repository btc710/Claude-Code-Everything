'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-e2e-test-'));
  fs.mkdirSync(path.join(dir, 'audit'), { recursive: true });
  return {
    dir,
    ledgerFile: path.join(dir, 'ledger.json'),
    tenantFile: path.join(dir, 'tenants.json'),
    auditDir:   path.join(dir, 'audit'),
  };
}

function assert(cond, label) {
  if (!cond) throw new Error(`assertion failed: ${label}`);
}
function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

module.exports = { tmpDataDir, assert, assertEqual };
