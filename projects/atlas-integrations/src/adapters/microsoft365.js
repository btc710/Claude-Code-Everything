'use strict';

// Microsoft 365 adapter. Stub-level implementation against Microsoft Graph.
// Covers Outlook calendar + mail. URL shapes are real (Graph v1.0) so a
// real implementation can fill in error normalization, retries, and Teams
// online-meeting wiring without changing call sites.
//
// Auth: OAuth2 (Azure AD). ctx.connection carries:
//   { token (access_token), tenantId, refreshToken, clientId, clientSecret }
// `tenantId` here is the AAD tenant (the Atlas tenantId is separate and
// lives on ctx.tenantId).

const { AdapterError } = require('../adapter');

const ID = 'microsoft365';
const GRAPH = 'https://graph.microsoft.com/v1.0';

const AUTH = {
  kind: 'oauth2',
  metadata: {
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: [
      'offline_access',
      'Calendars.ReadWrite',
      'Mail.Send',
      'User.Read',
    ],
  },
};

function ctxOrThrow(ctx, op) {
  if (!ctx || !ctx.connection || !ctx.connection.token) {
    throw new AdapterError('microsoft365: missing connection token', {
      adapterId: ID,
      op,
    });
  }
  return ctx.connection;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function jsonOrThrow(res, op) {
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
  }
  if (!res.ok) {
    throw new AdapterError(`microsoft365 ${op} failed: ${res.status}`, {
      adapterId: ID,
      op,
      status: res.status,
      body: data,
    });
  }
  return data;
}

async function createCalendarEvent(ctx, args = {}) {
  const { start, end, attendees = [], title, body, timeZone } = args;
  if (!start || !end) throw new Error('microsoft365.createCalendarEvent: start and end are required');
  if (!title) throw new Error('microsoft365.createCalendarEvent: title is required');
  const conn = ctxOrThrow(ctx, 'createCalendarEvent');
  const fetchImpl = ctx.fetchImpl || globalThis.fetch;

  // /me/events creates on the authenticated user's calendar.
  const url = `${GRAPH}/me/events`;
  const payload = {
    subject: title,
    body: { contentType: 'HTML', content: body || '' },
    start: { dateTime: start, timeZone: timeZone || 'UTC' },
    end: { dateTime: end, timeZone: timeZone || 'UTC' },
    attendees: attendees.map((email) => ({
      emailAddress: { address: email },
      type: 'required',
    })),
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
  };
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: authHeaders(conn.token),
    body: JSON.stringify(payload),
  });
  const data = await jsonOrThrow(res, 'createCalendarEvent');
  const joinUrl =
    (data && data.onlineMeeting && data.onlineMeeting.joinUrl) ||
    (data && data.onlineMeetingUrl) ||
    null;
  return {
    eventId: data && data.id,
    htmlLink: data && data.webLink,
    meetUrl: joinUrl,
    raw: data,
  };
}

async function sendEmail(ctx, args = {}) {
  const { to, subject, body, htmlBody } = args;
  if (!to) throw new Error('microsoft365.sendEmail: to is required');
  if (!subject) throw new Error('microsoft365.sendEmail: subject is required');
  const conn = ctxOrThrow(ctx, 'sendEmail');
  const fetchImpl = ctx.fetchImpl || globalThis.fetch;

  const recipients = (Array.isArray(to) ? to : [to]).map((address) => ({
    emailAddress: { address },
  }));

  const content = htmlBody || body || '';
  const contentType = htmlBody || /<[a-z]/i.test(content) ? 'HTML' : 'Text';

  const url = `${GRAPH}/me/sendMail`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: authHeaders(conn.token),
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType, content },
        toRecipients: recipients,
      },
      saveToSentItems: true,
    }),
  });
  // Graph sendMail returns 202 Accepted with no body on success.
  if (res.status === 202) return { id: null, raw: null, accepted: true };
  const data = await jsonOrThrow(res, 'sendEmail');
  return { id: data && data.id, raw: data };
}

module.exports = {
  id: ID,
  auth: AUTH,
  createCalendarEvent,
  sendEmail,
};
