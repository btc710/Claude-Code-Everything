'use strict';

const slack = require('../src/sinks/slack');
const email = require('../src/sinks/email');
const webhook = require('../src/sinks/webhook');
const { assert, assertEqual, makeFakeFetch } = require('./helpers');

const tests = [
  ['slack: POSTs to chat.postMessage with bearer auth and channel + text', async () => {
    const fetchImpl = makeFakeFetch({ body: { ok: true, ts: '1700000000.0001' } });
    const r = await slack.send(
      { channel: '#atlas', subject: 'Digest', body: 'two items', meta: { tenant: 'acme' } },
      { fetchImpl, token: 'xoxb-fake' },
    );
    assertEqual(r.ok, true, 'ok');
    assertEqual(fetchImpl.calls.length, 1, 'one call');
    const call = fetchImpl.calls[0];
    assert(call.url.includes('chat.postMessage'), 'endpoint');
    assertEqual(call.opts.method, 'POST', 'method');
    assertEqual(call.opts.headers.authorization, 'Bearer xoxb-fake', 'auth header');
    const payload = JSON.parse(call.opts.body);
    assertEqual(payload.channel, '#atlas', 'channel');
    assert(payload.text.includes('Digest'), 'subject in text');
    assert(payload.text.includes('two items'), 'body in text');
    assertEqual(payload.metadata.tenant, 'acme', 'meta passed');
  }],
  ['slack: ok=false in body throws', async () => {
    const fetchImpl = makeFakeFetch({ body: { ok: false, error: 'channel_not_found' } });
    let threw = null;
    try {
      await slack.send({ channel: '#nope', body: 'x' }, { fetchImpl, token: 't' });
    } catch (e) { threw = e; }
    assert(threw && /channel_not_found/.test(threw.message), 'surfaced slack error');
  }],
  ['slack: missing channel throws', async () => {
    let threw = null;
    try { await slack.send({ body: 'x' }, { fetchImpl: makeFakeFetch({ body: {} }) }); } catch (e) { threw = e; }
    assert(threw && /channel required/.test(threw.message), 'rejected');
  }],
  ['email: POSTs to resend with from/to/subject/text', async () => {
    const fetchImpl = makeFakeFetch({ body: { id: 'em_1' } });
    const r = await email.send(
      { channel: 'blake@acme.test', subject: 'Atlas digest', body: 'hi', meta: { tenant: 'acme' } },
      { fetchImpl, apiKey: 're_x', from: 'atlas@example.com' },
    );
    assertEqual(r.ok, true, 'ok');
    const call = fetchImpl.calls[0];
    assert(call.url.includes('resend.com/emails'), 'endpoint');
    assertEqual(call.opts.headers.authorization, 'Bearer re_x', 'auth');
    const payload = JSON.parse(call.opts.body);
    assertEqual(payload.from, 'atlas@example.com', 'from');
    assertEqual(payload.to[0], 'blake@acme.test', 'to');
    assertEqual(payload.subject, 'Atlas digest', 'subject');
    assertEqual(payload.text, 'hi', 'text');
  }],
  ['webhook: rejects non-http URLs', async () => {
    let threw = null;
    try {
      await webhook.send({ channel: 'ftp://nope', body: 'x' }, { fetchImpl: makeFakeFetch({ body: {} }) });
    } catch (e) { threw = e; }
    assert(threw && /invalid url/.test(threw.message), 'rejected non-http');
  }],
  ['webhook: POSTs JSON body to the configured url and adds signature header', async () => {
    const fetchImpl = makeFakeFetch({ body: { received: true } });
    const r = await webhook.send(
      { channel: 'https://example.test/hook', subject: 'S', body: 'B', meta: { x: 1 } },
      { fetchImpl, secret: 'sig-abc' },
    );
    assertEqual(r.ok, true, 'ok');
    const call = fetchImpl.calls[0];
    assertEqual(call.url, 'https://example.test/hook', 'url');
    assertEqual(call.opts.headers['x-atlas-signature'], 'sig-abc', 'sig header');
    const payload = JSON.parse(call.opts.body);
    assertEqual(payload.subject, 'S', 'subject');
    assertEqual(payload.body, 'B', 'body');
    assertEqual(payload.meta.x, 1, 'meta');
  }],
  ['webhook: non-2xx surfaces error', async () => {
    const fetchImpl = makeFakeFetch({ ok: false, status: 500, body: { error: 'boom' } });
    let threw = null;
    try {
      await webhook.send({ channel: 'https://x.test/h', body: 'b' }, { fetchImpl });
    } catch (e) { threw = e; }
    assert(threw && /webhook 500/.test(threw.message), 'surfaced 500');
  }],
];

module.exports = tests;
