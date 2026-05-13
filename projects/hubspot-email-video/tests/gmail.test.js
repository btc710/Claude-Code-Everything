'use strict';

const { suite, assert, fakeFetch, jsonResponse } = require('./helpers');
const { createClient, buildMime, base64UrlEncode, stripHtml } = require('../src/gmail');

const s = suite('gmail');

s.test('stripHtml renders text-only fallback', () => {
  const txt = stripHtml('<p>Hi <b>Blake</b></p><p>Join: <a href="x">here</a></p>');
  assert.match(txt, /Hi Blake/);
  assert.match(txt, /Join: here/);
});

s.test('buildMime produces decodable base64url with subject + body', () => {
  const raw = buildMime({
    from: 'me@example.com',
    to: 'you@example.com',
    subject: 'Hello',
    htmlBody: '<p>Hi</p>',
    textBody: 'Hi',
  });
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const decoded = Buffer.from(
    raw.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  ).toString('utf8');
  assert.match(decoded, /Subject: Hello/);
  assert.match(decoded, /To: you@example.com/);
  assert.match(decoded, /multipart\/alternative/);
});

s.test('base64UrlEncode strips padding', () => {
  assert.strictEqual(base64UrlEncode('any').endsWith('='), false);
});

s.test('send posts MIME to Gmail with bearer token', async () => {
  const captured = {};
  const client = createClient({
    clientId: 'c',
    clientSecret: 's',
    refreshToken: 'r',
    fetchImpl: fakeFetch([
      {
        match: (url) => url === 'https://oauth2.googleapis.com/token',
        respond: () => jsonResponse(200, { access_token: 'AT', expires_in: 3600 }),
      },
      {
        match: (url, opts) =>
          url === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' &&
          opts.method === 'POST',
        respond: (url, opts) => {
          captured.auth = opts.headers.Authorization;
          captured.body = JSON.parse(opts.body);
          return jsonResponse(200, { id: 'mid-1' });
        },
      },
    ]),
    now: () => 0,
  });

  const out = await client.send({
    from: 'me@example.com',
    to: 'blake@example.com',
    subject: 'Meet',
    htmlBody: '<p>Hi</p>',
    textBody: 'Hi',
  });
  assert.strictEqual(out.id, 'mid-1');
  assert.strictEqual(captured.auth, 'Bearer AT');
  assert.ok(captured.body.raw && captured.body.raw.length > 10);
});

module.exports = s;
