'use strict';

// Salesforce adapter. Stub-level implementation: the URL shapes are
// real (instance-scoped REST and the Composite API) but only the minimum
// payload paths are wired. Tests fake the fetch layer.
//
// Auth: OAuth2 Web Server flow. ctx.connection carries:
//   { token (access_token), instanceUrl, refreshToken, clientId, clientSecret }
// `instanceUrl` is mandatory — Salesforce tenants are subdomain-scoped
// (e.g. https://acme.my.salesforce.com).

const { AdapterError } = require('../adapter');

const ID = 'salesforce';
const API_VERSION = 'v60.0';

const AUTH = {
  kind: 'oauth2',
  metadata: {
    authorizeUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    scopes: ['api', 'refresh_token', 'offline_access'],
    requiresInstanceUrl: true,
  },
};

function ctxOrThrow(ctx, op) {
  if (!ctx || !ctx.connection) {
    throw new AdapterError('salesforce: missing connection', {
      adapterId: ID,
      op,
    });
  }
  const c = ctx.connection;
  if (!c.token) {
    throw new AdapterError('salesforce: connection.token (access_token) required', {
      adapterId: ID,
      op,
    });
  }
  if (!c.instanceUrl) {
    throw new AdapterError('salesforce: connection.instanceUrl required', {
      adapterId: ID,
      op,
    });
  }
  return c;
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
    throw new AdapterError(`salesforce ${op} failed: ${res.status}`, {
      adapterId: ID,
      op,
      status: res.status,
      body: data,
    });
  }
  return data;
}

async function lookupContact(ctx, { email } = {}) {
  if (!email) throw new Error('salesforce.lookupContact: email is required');
  const conn = ctxOrThrow(ctx, 'lookupContact');
  const fetchImpl = ctx.fetchImpl || globalThis.fetch;
  // Use SOQL search. Escape single quotes per SF SOQL rules.
  const soql = `SELECT Id, Email, Name, AccountId FROM Contact WHERE Email = '${String(email).replace(/'/g, "\\'")}' LIMIT 1`;
  const url = `${conn.instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  const res = await fetchImpl(url, { headers: authHeaders(conn.token) });
  const data = await jsonOrThrow(res, 'lookupContact');
  const rec = data && data.records && data.records[0];
  if (!rec) return null;
  return {
    id: rec.Id,
    email: rec.Email || email,
    displayName: rec.Name || null,
    accountId: rec.AccountId || null,
    raw: rec,
  };
}

async function postNote(ctx, { contactId, body } = {}) {
  if (!contactId) throw new Error('salesforce.postNote: contactId is required');
  if (!body) throw new Error('salesforce.postNote: body is required');
  const conn = ctxOrThrow(ctx, 'postNote');
  const fetchImpl = ctx.fetchImpl || globalThis.fetch;
  // FeedItem is the modern Chatter way to attach a note to a Contact.
  const url = `${conn.instanceUrl}/services/data/${API_VERSION}/sobjects/FeedItem`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: authHeaders(conn.token),
    body: JSON.stringify({ ParentId: contactId, Body: body, Type: 'TextPost' }),
  });
  const data = await jsonOrThrow(res, 'postNote');
  return { id: data && data.id, raw: data };
}

async function pushDealUpdate(ctx, { dealId, fields } = {}) {
  if (!dealId) throw new Error('salesforce.pushDealUpdate: dealId is required');
  if (!fields || typeof fields !== 'object') {
    throw new Error('salesforce.pushDealUpdate: fields object is required');
  }
  const conn = ctxOrThrow(ctx, 'pushDealUpdate');
  const fetchImpl = ctx.fetchImpl || globalThis.fetch;
  // Opportunity is Salesforce's "deal" object. PATCH is the standard
  // partial-update verb on Opportunity sObjects.
  const url = `${conn.instanceUrl}/services/data/${API_VERSION}/sobjects/Opportunity/${encodeURIComponent(dealId)}`;
  const res = await fetchImpl(url, {
    method: 'PATCH',
    headers: authHeaders(conn.token),
    body: JSON.stringify(fields),
  });
  // SF returns 204 No Content on success; map to a stable shape.
  if (res.status === 204) return { id: dealId, raw: null };
  const data = await jsonOrThrow(res, 'pushDealUpdate');
  return { id: dealId, raw: data };
}

module.exports = {
  id: ID,
  auth: AUTH,
  lookupContact,
  postNote,
  pushDealUpdate,
};
