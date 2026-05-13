'use strict';

const http = require('http');
const { authenticate } = require('./auth');
const { scoreWithSlot } = require('./score');
const { runBacktest } = require('./backtest');
const { Ledger } = require('./ledger');
const { listSlots } = require('./registry');

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', c => {
      total += c.length;
      if (total > limit) return reject(new Error('payload too large'));
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function createApp({ ledger = new Ledger(), env = process.env, fetchImpl = fetch } = {}) {
  return async function handle(req, res) {
    const tenant = authenticate(req, env);
    if (!tenant && req.url !== '/healthz') {
      return send(res, 401, { error: 'unauthorized' });
    }

    if (req.method === 'GET' && req.url === '/healthz') {
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && req.url === '/v1/slots') {
      return send(res, 200, { slots: listSlots() });
    }

    if (req.method === 'POST' && req.url === '/v1/score') {
      try {
        const body = await readBody(req);
        const result = await scoreWithSlot({
          slotIdOrNumber: body.slot,
          plan: body.plan,
          env, fetchImpl,
        });
        ledger.record({
          tenant,
          slot: result.slot,
          tokensIn:  result.usage.tokensIn,
          tokensOut: result.usage.tokensOut,
          project: body.project || null,
        });
        return send(res, 200, { tenant, ...result });
      } catch (e) {
        return send(res, 400, { error: String(e.message || e) });
      }
    }

    if (req.method === 'POST' && req.url === '/v1/backtest') {
      try {
        const body = await readBody(req);
        const result = await runBacktest({
          plan: body.plan,
          tenant,
          project: body.project || null,
          env,
          ledger,
          fetchImpl,
          slots: body.slots || null,
        });
        return send(res, 200, { tenant, ...result });
      } catch (e) {
        return send(res, 400, { error: String(e.message || e) });
      }
    }

    if (req.method === 'GET' && req.url.startsWith('/v1/usage')) {
      const u = new URL(req.url, 'http://x');
      const usage = ledger.usage({
        tenant,
        project: u.searchParams.get('project') || null,
        since: parseInt(u.searchParams.get('since') || '0', 10),
      });
      return send(res, 200, { tenant, ...usage });
    }

    return send(res, 404, { error: 'not found' });
  };
}

function start({ port = parseInt(process.env.PORT || '8787', 10), ledger = new Ledger() } = {}) {
  const app = createApp({ ledger });
  const server = http.createServer((req, res) => {
    app(req, res).catch(e => send(res, 500, { error: String(e.message || e) }));
  });
  server.listen(port, () => {
    console.log(`[atlas-gateway] listening on :${port}`);
  });
  return server;
}

if (require.main === module) start();

module.exports = { createApp, start };
