'use strict';

// Google adapter. Wraps the existing hubspot-email-video calendar.js and
// gmail.js so all Google API shapes (OAuth refresh, Calendar v3, Gmail v1)
// stay in one place. This file only adapts them to the common interface.
//
// Auth: OAuth2 with offline refresh. ctx.connection must carry:
//   { token (the refresh_token), clientId, clientSecret, scopes }
// The underlying client exchanges the refresh token for a short-lived
// access token on every call; the adapter caches inside that client.

const calendarMod = require('../../../hubspot-email-video/src/calendar');
const gmailMod = require('../../../hubspot-email-video/src/gmail');
const { AdapterError } = require('../adapter');

const ID = 'google';

const AUTH = {
  kind: 'oauth2',
  metadata: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    requiresClientCredentials: true,
  },
};

function googleCreds(ctx) {
  if (!ctx || !ctx.connection) {
    throw new AdapterError('google: missing connection', {
      adapterId: ID,
      op: 'auth',
    });
  }
  const conn = ctx.connection;
  // The connection stores the refresh token in the canonical `token` slot.
  // `refreshToken` is accepted too for clarity at call sites.
  const refreshToken = conn.refreshToken || conn.token;
  if (!refreshToken || !conn.clientId || !conn.clientSecret) {
    throw new AdapterError(
      'google: connection needs clientId, clientSecret, refreshToken',
      { adapterId: ID, op: 'auth' },
    );
  }
  return {
    clientId: conn.clientId,
    clientSecret: conn.clientSecret,
    refreshToken,
    fetchImpl: ctx.fetchImpl || globalThis.fetch,
    now: ctx.now,
  };
}

function wrapError(err, op) {
  if (err && (err.name === 'CalendarError' || err.name === 'GmailError')) {
    return new AdapterError(err.message, {
      adapterId: ID,
      op,
      status: err.status,
      body: err.body,
    });
  }
  return err;
}

async function createCalendarEvent(ctx, args = {}) {
  const { start, end, attendees = [], title, body, calendarId, timeZone } = args;
  if (!start || !end) throw new Error('google.createCalendarEvent: start and end are required');
  if (!title) throw new Error('google.createCalendarEvent: title is required');

  const client = calendarMod.createClient(googleCreds(ctx));
  try {
    const event = await client.createMeetingEvent({
      calendarId: calendarId || (ctx.connection.calendarId || 'primary'),
      summary: title,
      description: body,
      startTime: start,
      endTime: end,
      timeZone: timeZone || ctx.connection.timeZone || 'UTC',
      attendees,
    });
    return {
      eventId: event.eventId,
      htmlLink: event.htmlLink,
      meetUrl: event.meetUrl,
      raw: event.raw,
    };
  } catch (err) {
    throw wrapError(err, 'createCalendarEvent');
  }
}

async function sendEmail(ctx, args = {}) {
  const { to, subject, body, from, htmlBody } = args;
  if (!to) throw new Error('google.sendEmail: to is required');
  if (!subject) throw new Error('google.sendEmail: subject is required');

  const sender = from || ctx.connection.senderEmail || ctx.connection.email;
  if (!sender) {
    throw new Error(
      'google.sendEmail: from is required (connection.senderEmail or args.from)',
    );
  }

  const client = gmailMod.createClient(googleCreds(ctx));
  try {
    const result = await client.send({
      from: sender,
      to,
      subject,
      htmlBody: htmlBody || (body && /<[a-z]/i.test(body) ? body : undefined),
      textBody: htmlBody ? undefined : body,
    });
    return { id: result.id, threadId: result.threadId, raw: result };
  } catch (err) {
    throw wrapError(err, 'sendEmail');
  }
}

module.exports = {
  id: ID,
  auth: AUTH,
  createCalendarEvent,
  sendEmail,
};
