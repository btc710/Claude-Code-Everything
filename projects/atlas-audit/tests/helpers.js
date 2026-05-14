'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-audit-test-'));
}

function assert(cond, label) {
  if (!cond) throw new Error(`assertion failed: ${label}`);
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

function assertThrows(fn, regex, label) {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  if (!threw) throw new Error(`${label}: expected throw but did not`);
  if (regex && !regex.test(threw.message)) {
    throw new Error(`${label}: threw "${threw.message}" but expected match ${regex}`);
  }
  return threw;
}

module.exports = { tmpDir, assert, assertEqual, assertThrows };
