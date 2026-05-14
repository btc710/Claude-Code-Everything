'use strict';

const { suite, assert } = require('./helpers');
const {
  scheduleProjectDiscussion,
  buildInviteHtml,
  buildInviteText,
  formatWhen,
} = require('../src/orchestrator');

const s = suite('orchestrator');

const config = {
  hubspot: { token: 'h' },
  google: { clientId: 'c', clientSecret: 's', refreshToken: 'r' },
  sender: { email: 'me@example.com', name: 'Me' },
  calendar: { calendarId: 'primary', defaultMinutes: 30, timeZone: 'UTC' },
};

function stubDeps({ contact, meetUrl = 'https://meet.google.com/aaa-bbb-ccc' } = {}) {
  const calls = { hubspot: [], calendar: [], gmail: [] };
  return {
    deps: {
      hubspot: {
        findContactByEmail: async (email) => {
          calls.hubspot.push({ kind: 'find', email });
          return contact;
        },
        addNoteToContact: async (args) => {
          calls.hubspot.push({ kind: 'note', args });
          return { id: 'note-1' };
        },
      },
      calendar: {
        createMeetingEvent: async (args) => {
          calls.calendar.push(args);
          return {
            eventId: 'evt-1',
            htmlLink: 'https://calendar.google.com/event?eid=evt-1',
            meetUrl,
            raw: {},
          };
        },
      },
      gmail: {
        send: async (args) => {
          calls.gmail.push(args);
          return { id: 'msg-1' };
        },
      },
    },
    calls,
  };
}

s.test('schedules + emails + adds note when contact exists', async () => {
  const { deps, calls } = stubDeps({
    contact: {
      id: '777',
      properties: { firstname: 'Blake', lastname: 'Crawford' },
    },
  });
  const result = await scheduleProjectDiscussion({
    config,
    contactEmail: 'blake@example.com',
    startTime: '2026-05-20T15:00:00Z',
    notes: 'Walk through scope',
    deps,
  });
  assert.strictEqual(result.event.meetUrl, 'https://meet.google.com/aaa-bbb-ccc');
  assert.strictEqual(result.note.id, 'note-1');
  assert.strictEqual(calls.gmail.length, 1);
  assert.strictEqual(calls.gmail[0].to, 'blake@example.com');
  assert.match(calls.gmail[0].htmlBody, /meet\.google\.com\/aaa-bbb-ccc/);
  assert.match(calls.gmail[0].textBody, /Walk through scope/);
  assert.strictEqual(calls.hubspot[1].kind, 'note');
  assert.match(calls.hubspot[1].args.body, /Scheduled project discussion call/);
});

s.test('skips note when contact missing but still schedules + emails', async () => {
  const { deps, calls } = stubDeps({ contact: null });
  const result = await scheduleProjectDiscussion({
    config,
    contactEmail: 'unknown@example.com',
    startTime: '2026-05-20T15:00:00Z',
    deps,
  });
  assert.strictEqual(result.contact, null);
  assert.strictEqual(result.note, null);
  assert.strictEqual(calls.gmail.length, 1);
  assert.strictEqual(calls.hubspot.length, 1);
});

s.test('throws if calendar returns no meet url', async () => {
  const { deps } = stubDeps({ contact: null, meetUrl: null });
  let threw = null;
  try {
    await scheduleProjectDiscussion({
      config,
      contactEmail: 'a@b.com',
      startTime: '2026-05-20T15:00:00Z',
      deps,
    });
  } catch (err) {
    threw = err;
  }
  assert.ok(threw, 'expected error');
  assert.match(threw.message, /no Google Meet URL/);
});

s.test('invite templates contain meet link and event link', () => {
  const html = buildInviteHtml({
    recipientName: 'Blake',
    senderName: 'Me',
    meetUrl: 'https://meet.google.com/x',
    startIso: '2026-05-20T15:00:00Z',
    timeZone: 'UTC',
    eventLink: 'https://calendar.google.com/e',
    notes: 'Plan v1',
  });
  assert.match(html, /Hi Blake/);
  assert.match(html, /meet\.google\.com\/x/);
  assert.match(html, /calendar\.google\.com\/e/);
  assert.match(html, /Plan v1/);

  const text = buildInviteText({
    recipientName: null,
    senderName: 'Me',
    meetUrl: 'https://meet.google.com/x',
    startIso: '2026-05-20T15:00:00Z',
    timeZone: 'UTC',
    eventLink: 'https://calendar.google.com/e',
  });
  assert.match(text, /Hi,/);
  assert.match(text, /meet\.google\.com\/x/);
});

s.test('formatWhen renders human-readable date', () => {
  const out = formatWhen('2026-05-20T15:00:00Z', 'UTC');
  assert.match(out, /May/);
  assert.match(out, /20/);
});

module.exports = s;
