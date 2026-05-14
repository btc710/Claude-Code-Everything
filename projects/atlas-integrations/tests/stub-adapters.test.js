'use strict';

const { suite, assert, fakeFetch, jsonResponse, noContentResponse } = require('./helpers');
const salesforce = require('../src/adapters/salesforce');
const microsoft365 = require('../src/adapters/microsoft365');
const slack = require('../src/adapters/slack');
const { AdapterError } = require('../src/adapter');

const s = suite('stub-adapters');

// --- Salesforce ---

function sfCtx(fetchImpl, overrides = {}) {
  return {
    tenantId: 'tenant-a',
    connection: Object.assign(
      {
        token: 'sf-access-token',
        instanceUrl: 'https://acme.my.salesforce.com',
      },
      overrides,
    ),
    fetchImpl,
  };
}

s.test('salesforce.lookupContact hits the SOQL query endpoint on instance URL', async () => {
  let captured = null;
  const fetchImpl = fakeFetch([
    {
      match: (url) =>
        url.startsWith('https://acme.my.salesforce.com/services/data/v60.0/query?'),
      respond: (url, opts) => {
        captured = { url, headers: opts.headers };
        return jsonResponse(200, {
          records: [
            {
              Id: '0031x000ABCD',
              Email: 'ada@example.com',
              Name: 'Ada Lovelace',
              AccountId: '0011x000XYZ',
            },
          ],
        });
      },
    },
  ]);
  const c = await salesforce.lookupContact(sfCtx(fetchImpl), { email: 'ada@example.com' });
  assert.strictEqual(c.id, '0031x000ABCD');
  assert.strictEqual(c.displayName, 'Ada Lovelace');
  assert.strictEqual(c.accountId, '0011x000XYZ');
  assert.ok(captured.url.includes('q='), 'must pass the q= SOQL parameter');
  assert.ok(decodeURIComponent(captured.url).includes("Email = 'ada@example.com'"));
  assert.strictEqual(captured.headers.Authorization, 'Bearer sf-access-token');
});

s.test('salesforce.pushDealUpdate PATCHes /sobjects/Opportunity/<id>', async () => {
  let captured = null;
  const fetchImpl = fakeFetch([
    {
      match: (url, opts) =>
        url ===
          'https://acme.my.salesforce.com/services/data/v60.0/sobjects/Opportunity/006xx0000DEAL' &&
        opts.method === 'PATCH',
      respond: (_, opts) => {
        captured = JSON.parse(opts.body);
        return noContentResponse(204);
      },
    },
  ]);
  const out = await salesforce.pushDealUpdate(sfCtx(fetchImpl), {
    dealId: '006xx0000DEAL',
    fields: { Amount: 12345, StageName: 'Proposal' },
  });
  assert.strictEqual(out.id, '006xx0000DEAL');
  assert.deepStrictEqual(captured, { Amount: 12345, StageName: 'Proposal' });
});

s.test('salesforce returns shaped AdapterError on API failure', async () => {
  const fetchImpl = fakeFetch([
    {
      match: (url) => url.includes('/services/data/v60.0/query'),
      respond: () =>
        jsonResponse(401, [{ errorCode: 'INVALID_SESSION_ID', message: 'expired' }]),
    },
  ]);
  await assert.rejects(
    salesforce.lookupContact(sfCtx(fetchImpl), { email: 'a@b.c' }),
    (err) => {
      assert.ok(err instanceof AdapterError, 'expected AdapterError');
      assert.strictEqual(err.adapterId, 'salesforce');
      assert.strictEqual(err.op, 'lookupContact');
      assert.strictEqual(err.status, 401);
      return true;
    },
  );
});

s.test('salesforce raises when instanceUrl is missing', async () => {
  await assert.rejects(
    salesforce.lookupContact(
      { tenantId: 't', connection: { token: 'x' }, fetchImpl: () => {} },
      { email: 'a@b.c' },
    ),
    /instanceUrl required/,
  );
});

// --- Microsoft 365 ---

function m365Ctx(fetchImpl) {
  return {
    tenantId: 'tenant-a',
    connection: { token: 'graph-access-token' },
    fetchImpl,
  };
}

s.test('microsoft365.createCalendarEvent POSTs to Graph /me/events with Teams meeting', async () => {
  let captured = null;
  const fetchImpl = fakeFetch([
    {
      match: (url, opts) =>
        url === 'https://graph.microsoft.com/v1.0/me/events' && opts.method === 'POST',
      respond: (_, opts) => {
        captured = JSON.parse(opts.body);
        return jsonResponse(201, {
          id: 'evt-graph-1',
          webLink: 'https://outlook.office.com/calendar/evt-graph-1',
          onlineMeeting: {
            joinUrl: 'https://teams.microsoft.com/l/meetup-join/xyz',
          },
        });
      },
    },
  ]);
  const ev = await microsoft365.createCalendarEvent(m365Ctx(fetchImpl), {
    start: '2026-06-01T15:00:00',
    end: '2026-06-01T15:30:00',
    attendees: ['guest@example.com'],
    title: 'Intro call',
    body: '<p>Scope discussion</p>',
    timeZone: 'UTC',
  });
  assert.strictEqual(ev.eventId, 'evt-graph-1');
  assert.strictEqual(ev.meetUrl, 'https://teams.microsoft.com/l/meetup-join/xyz');
  assert.strictEqual(captured.isOnlineMeeting, true);
  assert.strictEqual(captured.onlineMeetingProvider, 'teamsForBusiness');
  assert.deepStrictEqual(captured.attendees[0], {
    emailAddress: { address: 'guest@example.com' },
    type: 'required',
  });
});

s.test('microsoft365.sendEmail POSTs to Graph /me/sendMail and accepts 202', async () => {
  let captured = null;
  const fetchImpl = fakeFetch([
    {
      match: (url, opts) =>
        url === 'https://graph.microsoft.com/v1.0/me/sendMail' && opts.method === 'POST',
      respond: (_, opts) => {
        captured = JSON.parse(opts.body);
        return noContentResponse(202);
      },
    },
  ]);
  const res = await microsoft365.sendEmail(m365Ctx(fetchImpl), {
    to: ['guest@example.com'],
    subject: 'Hello',
    body: 'plain text',
  });
  assert.strictEqual(res.accepted, true);
  assert.strictEqual(captured.message.subject, 'Hello');
  assert.strictEqual(captured.message.body.contentType, 'Text');
  assert.deepStrictEqual(captured.message.toRecipients[0], {
    emailAddress: { address: 'guest@example.com' },
  });
});

s.test('microsoft365 raises AdapterError on Graph error', async () => {
  const fetchImpl = fakeFetch([
    {
      match: (url) => url === 'https://graph.microsoft.com/v1.0/me/events',
      respond: () =>
        jsonResponse(403, { error: { code: 'Forbidden', message: 'no perms' } }),
    },
  ]);
  await assert.rejects(
    microsoft365.createCalendarEvent(m365Ctx(fetchImpl), {
      start: '2026-06-01T15:00:00',
      end: '2026-06-01T15:30:00',
      title: 'x',
    }),
    (err) => {
      assert.ok(err instanceof AdapterError);
      assert.strictEqual(err.adapterId, 'microsoft365');
      assert.strictEqual(err.status, 403);
      return true;
    },
  );
});

// --- Slack ---

function slackCtx(fetchImpl) {
  return {
    tenantId: 'tenant-a',
    connection: { token: 'xoxb-slack-token' },
    fetchImpl,
  };
}

s.test('slack.lookupContact hits users.lookupByEmail', async () => {
  let captured = null;
  const fetchImpl = fakeFetch([
    {
      match: (url) =>
        url.startsWith('https://slack.com/api/users.lookupByEmail?email='),
      respond: (url, opts) => {
        captured = { url, headers: opts.headers };
        return jsonResponse(200, {
          ok: true,
          user: {
            id: 'U123',
            name: 'ada',
            profile: { email: 'ada@example.com', real_name: 'Ada Lovelace' },
          },
        });
      },
    },
  ]);
  const c = await slack.lookupContact(slackCtx(fetchImpl), { email: 'ada@example.com' });
  assert.strictEqual(c.id, 'U123');
  assert.strictEqual(c.displayName, 'Ada Lovelace');
  assert.strictEqual(captured.headers.Authorization, 'Bearer xoxb-slack-token');
});

s.test('slack.lookupContact returns null on users_not_found', async () => {
  const fetchImpl = fakeFetch([
    {
      match: (url) => url.includes('users.lookupByEmail'),
      respond: () => jsonResponse(200, { ok: false, error: 'users_not_found' }),
    },
  ]);
  const c = await slack.lookupContact(slackCtx(fetchImpl), { email: 'no@one.com' });
  assert.strictEqual(c, null);
});

s.test('slack.postNote opens a DM for U-prefixed ids then posts a message', async () => {
  const calls = [];
  const fetchImpl = fakeFetch([
    {
      match: (url, opts) =>
        url === 'https://slack.com/api/conversations.open' && opts.method === 'POST',
      respond: (_, opts) => {
        calls.push({ kind: 'open', body: JSON.parse(opts.body) });
        return jsonResponse(200, { ok: true, channel: { id: 'D456' } });
      },
    },
    {
      match: (url, opts) =>
        url === 'https://slack.com/api/chat.postMessage' && opts.method === 'POST',
      respond: (_, opts) => {
        calls.push({ kind: 'post', body: JSON.parse(opts.body) });
        return jsonResponse(200, { ok: true, ts: '1700000000.001' });
      },
    },
  ]);
  const out = await slack.postNote(slackCtx(fetchImpl), {
    contactId: 'U123',
    body: 'hello from atlas',
  });
  assert.strictEqual(out.id, '1700000000.001');
  assert.strictEqual(out.channel, 'D456');
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].body.users, 'U123');
  assert.strictEqual(calls[1].body.channel, 'D456');
  assert.strictEqual(calls[1].body.text, 'hello from atlas');
});

s.test('slack.postNote skips DM open when given a channel id', async () => {
  let calls = 0;
  const fetchImpl = fakeFetch([
    {
      match: (url, opts) =>
        url === 'https://slack.com/api/chat.postMessage' && opts.method === 'POST',
      respond: () => {
        calls++;
        return jsonResponse(200, { ok: true, ts: '1700000000.002' });
      },
    },
  ]);
  const out = await slack.postNote(slackCtx(fetchImpl), {
    contactId: 'C9999',
    body: 'broadcast',
  });
  assert.strictEqual(out.id, '1700000000.002');
  assert.strictEqual(out.channel, 'C9999');
  assert.strictEqual(calls, 1);
});

s.test('slack maps ok:false into AdapterError with the slack error code', async () => {
  const fetchImpl = fakeFetch([
    {
      match: (url) => url === 'https://slack.com/api/chat.postMessage',
      respond: () => jsonResponse(200, { ok: false, error: 'channel_not_found' }),
    },
  ]);
  await assert.rejects(
    slack.postNote(slackCtx(fetchImpl), { contactId: 'C404', body: 'x' }),
    (err) => {
      assert.ok(err instanceof AdapterError);
      assert.strictEqual(err.adapterId, 'slack');
      assert.ok(err.message.includes('channel_not_found'));
      return true;
    },
  );
});

module.exports = s;
