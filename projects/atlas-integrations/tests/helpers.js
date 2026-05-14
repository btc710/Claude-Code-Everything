'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function suite(name) {
  const cases = [];
  function test(label, fn) {
    cases.push({ label, fn });
  }
  async function run() {
    let passed = 0;
    let failed = 0;
    console.log(`# ${name}`);
    for (const { label, fn } of cases) {
      try {
        await fn();
        passed++;
        console.log(`  ok  ${label}`);
      } catch (err) {
        failed++;
        console.log(`  FAIL ${label}`);
        console.log(`     ${err.stack || err.message || err}`);
      }
    }
    return { passed, failed };
  }
  return { test, run, assert };
}

// Build a fake fetch from a list of { match, respond } pairs. `match` is a
// predicate over (url, options); `respond` returns a Response-like object.
function fakeFetch(handlers) {
  return async function fetchImpl(url, options = {}) {
    const route = handlers.find((h) => h.match(url, options));
    if (!route) {
      throw new Error(
        `fakeFetch: no handler for ${options.method || 'GET'} ${url}`,
      );
    }
    return route.respond(url, options);
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return body == null ? '' : JSON.stringify(body);
    },
  };
}

function noContentResponse(status = 204) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return null;
    },
    async text() {
      return '';
    },
  };
}

// Allocate a throwaway temp file path. The caller is responsible for any
// cleanup — but since each test gets a unique path, leaving them is fine
// for a sketch (OS tmp cleanup will catch them).
function tempFile(prefix = 'atlas-integrations-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return path.join(dir, 'connections.json');
}

module.exports = {
  suite,
  assert,
  fakeFetch,
  jsonResponse,
  noContentResponse,
  tempFile,
};
