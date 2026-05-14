'use strict';

const { createApp } = require('../src/server');
const { Ledger } = require('../src/ledger');
const {
  assert, assertEqual, makeFakeFetch, cannedScore, anthropicShape, FAKE_ENV,
} = require('./helpers');

// Tiny fake req/res to drive createApp() without binding a port.
function mockReq({ method = 'GET', url = '/', body = null, headers = {} }) {
  const chunks = body ? [Buffer.from(JSON.stringify(body))] : [];
  return {
    method, url,
    headers,
    on(ev, cb) {
      if (ev === 'data') chunks.forEach(cb);
      if (ev === 'end')  setImmediate(cb);
      return this;
    },
  };
}
function mockRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: null,
    writeHead(code, h) { this.statusCode = code; Object.assign(this.headers, h); },
    end(b) { this.body = b; },
  };
  return res;
}

async function call(app, opts) {
  const req = mockReq(opts);
  const res = mockRes();
  await app(req, res);
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

const AUTH = { authorization: 'Bearer secret-acme' };

const tests = [
  ['rejects unauthenticated requests with 401', async () => {
    const app = createApp({ env: FAKE_ENV, fetchImpl: makeFakeFetch([]) });
    const r = await call(app, { method: 'GET', url: '/v1/slots' });
    assertEqual(r.status, 401, 'status');
  }],
  ['health check is unauthenticated and returns ok', async () => {
    const app = createApp({ env: FAKE_ENV, fetchImpl: makeFakeFetch([]) });
    const r = await call(app, { method: 'GET', url: '/healthz' });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.body.ok, true, 'ok');
  }],
  ['GET /v1/slots returns the registry to an authed tenant', async () => {
    const app = createApp({ env: FAKE_ENV, fetchImpl: makeFakeFetch([]) });
    const r = await call(app, { method: 'GET', url: '/v1/slots', headers: AUTH });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.body.slots.length, 12, 'slots');
  }],
  ['POST /v1/score returns a scored result and records ledger usage', async () => {
    const ledger = new Ledger();
    const app = createApp({
      ledger, env: FAKE_ENV,
      fetchImpl: makeFakeFetch([{
        match: u => u.includes('api.anthropic.com'),
        body: () => anthropicShape(cannedScore({ total: 880 })),
      }]),
    });
    const r = await call(app, {
      method: 'POST', url: '/v1/score', headers: AUTH,
      body: { slot: 'opus-4.7', plan: 'plan text' },
    });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.body.score.total, 880, 'score');
    assertEqual(ledger.usage({ tenant: 'acme' }).calls, 1, 'ledger logged');
  }],
  ['GET /v1/usage returns per-tenant aggregate', async () => {
    const ledger = new Ledger();
    ledger.record({ tenant: 'acme', slot: 'haiku-4.5', tokensIn: 1000, tokensOut: 500 });
    const app = createApp({ ledger, env: FAKE_ENV, fetchImpl: makeFakeFetch([]) });
    const r = await call(app, { method: 'GET', url: '/v1/usage', headers: AUTH });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.body.calls, 1, 'one call counted');
    assert(r.body.costUsd > 0, 'cost present');
  }],
];

module.exports = tests;
