'use strict';

const assert = require('assert');

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

function fakeFetch(handlers) {
  return async function fetchImpl(url, options = {}) {
    const route = handlers.find((h) => h.match(url, options));
    if (!route) {
      throw new Error(`fakeFetch: no handler for ${options.method || 'GET'} ${url}`);
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
      return JSON.stringify(body);
    },
  };
}

module.exports = { suite, assert, fakeFetch, jsonResponse };
