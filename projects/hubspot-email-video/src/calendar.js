'use strict';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

class CalendarError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'CalendarError';
    this.status = status;
    this.body = body;
  }
}

function createClient({
  clientId,
  clientSecret,
  refreshToken,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
} = {}) {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google client credentials are required');
  }

  let cachedToken = null;
  let cachedExpiresAt = 0;

  async function getAccessToken() {
    if (cachedToken && now() < cachedExpiresAt - 30_000) return cachedToken;
    const res = await fetchImpl(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new CalendarError('Failed to refresh Google access token', res.status, data);
    }
    cachedToken = data.access_token;
    cachedExpiresAt = now() + data.expires_in * 1000;
    return cachedToken;
  }

  async function createMeetingEvent({
    calendarId = 'primary',
    summary,
    description,
    startTime,
    endTime,
    timeZone,
    attendees = [],
  }) {
    if (!summary) throw new Error('summary is required');
    if (!startTime || !endTime) throw new Error('startTime and endTime are required');

    const token = await getAccessToken();
    const requestId = `hev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const url =
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events` +
      `?conferenceDataVersion=1&sendUpdates=all`;

    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: startTime, timeZone },
        end: { dateTime: endTime, timeZone },
        attendees: attendees.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new CalendarError(
        `Calendar event creation failed: ${res.status}`,
        res.status,
        data,
      );
    }

    return {
      eventId: data.id,
      htmlLink: data.htmlLink,
      meetUrl: extractMeetUrl(data),
      raw: data,
    };
  }

  return { createMeetingEvent, _getAccessToken: getAccessToken };
}

function extractMeetUrl(event) {
  if (!event || !event.conferenceData) return null;
  const entry = (event.conferenceData.entryPoints || []).find(
    (e) => e.entryPointType === 'video',
  );
  return entry ? entry.uri : event.hangoutLink || null;
}

function computeEndTime(startIso, durationMinutes) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    throw new Error(`Invalid startTime: ${startIso}`);
  }
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return end.toISOString();
}

module.exports = { createClient, extractMeetUrl, computeEndTime, CalendarError };
