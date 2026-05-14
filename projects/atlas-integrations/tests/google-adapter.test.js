'use strict';

const { suite, assert, fakeFetch, jsonResponse } = require('./helpers');
const google = require('../src/adapters/google');

const s = suite('google-adapter');

function ctx(fetchImpl) {
  return {
    tenantId: 'tenant-a',
    connection: {
      token: 'refresh-token-value',
      clientId: 'cid',
      clientSecret: 'csec',
      senderEmail: 'sender@example.com',
      timeZone: 'UTC',
    },
    fetchImpl,
    now: () => 0,
  };
}

s.test('createCalendarEvent returns a Google Meet URL', async () => {
  let captured = null;
  const fetchImpl = fakeFetch([
    {
      match: (url) => url === 'https://oauth2.googleapis.com/token',
      respond: () => jsonResponse(200, { access_token: 'AT', expires_in: 3600 }),
    },
    {
      match: (url, opts) =>
        url.includes('/calendar/v3/calendars/') && opts.method === 'POST',
      respond: (url, opts) => {
        captured = { url, body: JSON.parse(opts.body) };
        return jsonResponse(200, {
          id: 'evt-1',
          htmlLink: 'https://calendar.google.com/event?eid=evt-1',
          conferenceData: {
            entryPoints: [
              {
                entryPointType: 'video',
                uri: 'https://meet.google.com/abc-defg-hij',
              },
            ],
          },
        });
      },
    },
  ]);
  const ev = await google.createCalendarEvent(ctx(fetchImpl), {
    start: '2026-06-01T15:00:00Z',
    end: '2026-06-01T15:30:00Z',
    attendees: ['guest@example.com'],
    title: 'Intro call',
    body: 'Discuss scope',
  });
  assert.strictEqual(ev.eventId, 'evt-1');
  assert.strictEqual(ev.meetUrl, 'https://meet.google.com/abc-defg-hij');
  assert.ok(ev.htmlLink.includes('calendar.google.com'));
  // Ensure attendees and conferenceData were wired through the underlying client.
  assert.deepStrictEqual(captured.body.attendees, [{ email: 'guest@example.com' }]);
  assert.ok(captured.url.includes('conferenceDataVersion=1'));
});

s.test('sendEmail uses Gmail send endpoint with bearer access token', async () => {
  let sent = null;
  const fetchImpl = fakeFetch([
    {
      match: (url) => url === 'https://oauth2.googleapis.com/token',
      respond: () => jsonResponse(200, { access_token: 'AT', expires_in: 3600 }),
    },
    {
      match: (url, opts) =>
        url === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' &&
        opts.method === 'POST',
      respond: (_, opts) => {
        sent = JSON.parse(opts.body);
        return jsonResponse(200, { id: 'm-1', threadId: 't-1' });
      },
    },
  ]);
  const res = await google.sendEmail(ctx(fetchImpl), {
    to: 'guest@example.com',
    subject: 'Hello',
    body: 'Plain text body',
  });
  assert.strictEqual(res.id, 'm-1');
  assert.strictEqual(res.threadId, 't-1');
  assert.ok(typeof sent.raw === 'string' && sent.raw.length > 0, 'base64 raw should be present');
});

s.test('createCalendarEvent rejects without google credentials', async () => {
  await assert.rejects(
    google.createCalendarEvent(
      { tenantId: 't', connection: { token: 'r' } },
      {
        start: '2026-06-01T15:00:00Z',
        end: '2026-06-01T15:30:00Z',
        title: 'X',
      },
    ),
    /clientId, clientSecret, refreshToken/,
  );
});

module.exports = s;
