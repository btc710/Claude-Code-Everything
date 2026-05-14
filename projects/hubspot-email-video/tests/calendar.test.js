'use strict';

const { suite, assert, fakeFetch, jsonResponse } = require('./helpers');
const { createClient, extractMeetUrl, computeEndTime } = require('../src/calendar');

const s = suite('calendar');

s.test('computeEndTime adds minutes', () => {
  const end = computeEndTime('2026-05-20T15:00:00Z', 45);
  assert.strictEqual(end, new Date('2026-05-20T15:45:00Z').toISOString());
});

s.test('extractMeetUrl pulls video entryPoint', () => {
  const url = extractMeetUrl({
    conferenceData: {
      entryPoints: [
        { entryPointType: 'more', uri: 'http://other' },
        { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
      ],
    },
  });
  assert.strictEqual(url, 'https://meet.google.com/abc-defg-hij');
});

s.test('createMeetingEvent posts with Meet conference data', async () => {
  const captured = {};
  const client = createClient({
    clientId: 'cid',
    clientSecret: 'sec',
    refreshToken: 'rt',
    fetchImpl: fakeFetch([
      {
        match: (url) => url === 'https://oauth2.googleapis.com/token',
        respond: () => jsonResponse(200, { access_token: 'AT', expires_in: 3600 }),
      },
      {
        match: (url, opts) => url.includes('/calendar/v3/calendars/') && opts.method === 'POST',
        respond: (url, opts) => {
          captured.url = url;
          captured.body = JSON.parse(opts.body);
          return jsonResponse(200, {
            id: 'evt1',
            htmlLink: 'https://calendar.google.com/event?eid=evt1',
            conferenceData: {
              entryPoints: [
                { entryPointType: 'video', uri: 'https://meet.google.com/xyz-pqrs-uvw' },
              ],
            },
          });
        },
      },
    ]),
    now: () => 0,
  });

  const ev = await client.createMeetingEvent({
    calendarId: 'primary',
    summary: 'Test',
    description: 'desc',
    startTime: '2026-05-20T15:00:00Z',
    endTime: '2026-05-20T15:30:00Z',
    timeZone: 'UTC',
    attendees: ['guest@example.com'],
  });

  assert.strictEqual(ev.eventId, 'evt1');
  assert.strictEqual(ev.meetUrl, 'https://meet.google.com/xyz-pqrs-uvw');
  assert.ok(captured.url.includes('conferenceDataVersion=1'));
  assert.deepStrictEqual(captured.body.attendees, [{ email: 'guest@example.com' }]);
  assert.strictEqual(
    captured.body.conferenceData.createRequest.conferenceSolutionKey.type,
    'hangoutsMeet',
  );
});

module.exports = s;
