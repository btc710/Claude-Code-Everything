'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-notifier-test-'));
}

function tmpLedgerFile() {
  return path.join(tmpDir(), 'ledger.json');
}

function assert(cond, label) {
  if (!cond) throw new Error(`assertion failed: ${label}`);
}
function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

// Fake fetch that records every call and returns canned responses.
// `plan` is either a single { ok, status, body } or an array of those (one per call).
function makeFakeFetch(plan) {
  const responses = Array.isArray(plan) ? plan.slice() : [plan];
  const calls = [];
  async function fakeFetch(url, opts) {
    calls.push({ url, opts });
    const r = responses.length > 1 ? responses.shift() : responses[0];
    const body = r.body == null ? {} : r.body;
    if (r.throw) throw new Error(r.throw);
    return {
      ok: r.ok !== false,
      status: r.status || 200,
      async json() { return body; },
      async text() { return JSON.stringify(body); },
    };
  }
  fakeFetch.calls = calls;
  return fakeFetch;
}

module.exports = { tmpDir, tmpLedgerFile, assert, assertEqual, makeFakeFetch };
