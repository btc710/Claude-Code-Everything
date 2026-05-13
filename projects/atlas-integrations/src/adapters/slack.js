'use strict';

// Slack adapter. Stub-level implementation against the Slack Web API.
// Surfaces chat.postMessage as the "post a note" primitive and DM via
// conversations.open + chat.postMessage.
//
// Auth: Slack OAuth bot token (xoxb-...) — Slack documents this as
// "OAuth2" though access tokens are long-lived bearer strings. The
// adapter advertises kind: 'oauth2' for consistency with the registry.
// ctx.connection carries: { token, teamId?, defaultChannel? }.

const { AdapterError } = require('../adapter');

const ID = 'slack';
const SLACK_API = 'https://slack.com/api';

const AUTH = {
  kind: 'oauth2',
  metadata: {
    authorizeUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: ['chat:write', 'im:write', 'users:read.email', 'channels:read'],
    botTokenPrefix: 'xoxb-',
  },
};

function ctxOrThrow(ctx, op) {
  if (!ctx || !ctx.connection || !ctx.connection.token) {
    throw new AdapterError('slack: missing connection token', {
      adapterId: ID,
      op,
    });
  }
  return ctx.connection;
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json',
  };
}

// Slack returns HTTP 200 even on logical errors and indicates failure via
// { ok: false, error: "..." }. Normalize both into AdapterError so callers
// can branch the same way they would for any other adapter.
async function slackJson(res, op) {
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
  }
  if (!res.ok) {
    throw new AdapterError(`slack ${op} http ${res.status}`, {
      adapterId: ID,
      op,
      status: res.status,
      body: data,
    });
  }
  if (data && data.ok === false) {
    throw new AdapterError(`slack ${op} error: ${data.error || 'unknown'}`, {
      adapterId: ID,
      op,
      status: 200,
      body: data,
    });
  }
  return data;
}

// Resolve a Slack user by email — used to DM "contacts" identified by
// their email address. Returns a userId or null.
async function lookupContact(ctx, { email } = {}) {
  if (!email) throw new Error('slack.lookupContact: email is required');
  const conn = ctxOrThrow(ctx, 'lookupContact');
  const fetchImpl = ctx.fetchImpl || globalThis.fetch;
  const url = `${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`;
  const res = await fetchImpl(url, { headers: authHeaders(conn.token) });
  const data = await slackJson(res, 'lookupContact').catch((err) => {
    // users_not_found is a "not present" signal, not a real failure.
    if (err && err.body && err.body.error === 'users_not_found') return null;
    throw err;
  });
  if (!data || !data.user) return null;
  return {
    id: data.user.id,
    email: (data.user.profile && data.user.profile.email) || email,
    displayName:
      (data.user.profile &&
        (data.user.profile.real_name || data.user.profile.display_name)) ||
      data.user.name ||
      null,
    raw: data.user,
  };
}

// "postNote" maps to chat.postMessage. `contactId` may be a channel id
// (C…), a user id (U…), or a Slack DM channel id (D…). If it looks like
// a user id, the adapter first opens a DM channel.
async function postNote(ctx, { contactId, body } = {}) {
  if (!contactId) throw new Error('slack.postNote: contactId is required');
  if (!body) throw new Error('slack.postNote: body is required');
  const conn = ctxOrThrow(ctx, 'postNote');
  const fetchImpl = ctx.fetchImpl || globalThis.fetch;

  let channel = contactId;
  if (/^U[A-Z0-9]+$/.test(contactId)) {
    const openRes = await fetchImpl(`${SLACK_API}/conversations.open`, {
      method: 'POST',
      headers: authHeaders(conn.token),
      body: JSON.stringify({ users: contactId }),
    });
    const openData = await slackJson(openRes, 'postNote');
    channel = openData && openData.channel && openData.channel.id;
    if (!channel) {
      throw new AdapterError('slack: conversations.open returned no channel', {
        adapterId: ID,
        op: 'postNote',
        body: openData,
      });
    }
  }

  const postRes = await fetchImpl(`${SLACK_API}/chat.postMessage`, {
    method: 'POST',
    headers: authHeaders(conn.token),
    body: JSON.stringify({ channel, text: body }),
  });
  const data = await slackJson(postRes, 'postNote');
  return { id: data && data.ts, channel, raw: data };
}

module.exports = {
  id: ID,
  auth: AUTH,
  lookupContact,
  postNote,
};
