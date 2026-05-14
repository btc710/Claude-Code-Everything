'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpStoreFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-billing-test-'));
  return path.join(dir, 'billing.json');
}

function tmpJsonFile(data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-billing-fixture-'));
  const f = path.join(dir, 'gateway-export.json');
  fs.writeFileSync(f, JSON.stringify(data));
  return f;
}

function assert(cond, label) {
  if (!cond) throw new Error(`assertion failed: ${label}`);
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

function assertClose(actual, expected, label, eps = 1e-6) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

// Convenience for building gateway-shaped entries.
// `when` is 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ssZ'; project defaults to null.
function entry({ when, tenant, slot, model = null, tokensIn, tokensOut, costUsd, project = null }) {
  const ts = Date.parse(when);
  if (Number.isNaN(ts)) throw new Error(`bad when: ${when}`);
  return { ts, tenant, slot, model, tokensIn, tokensOut, costUsd, project };
}

module.exports = { tmpStoreFile, tmpJsonFile, assert, assertEqual, assertClose, entry };
