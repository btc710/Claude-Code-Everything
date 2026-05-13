'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpStoreFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-ledger-test-'));
  return path.join(dir, 'ledger.json');
}

function assert(cond, label) {
  if (!cond) throw new Error(`assertion failed: ${label}`);
}
function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

module.exports = { tmpStoreFile, assert, assertEqual };
