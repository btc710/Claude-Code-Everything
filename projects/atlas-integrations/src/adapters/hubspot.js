'use strict';

// HubSpot adapter. Wraps the existing hubspot-email-video client so the
// underlying HTTP shapes stay in one place — this file only adapts them
// to the common interface defined in ../adapter.js.
//
// Auth: HubSpot private-app token (apiKey-style bearer) or OAuth2 access
// token. Either way ctx.connection.token is sent as a Bearer header.

const {
  createClient,
  contactDisplayName,
  HubspotError,
} = require('../../../hubspot-email-video/src/hubspot');
const { AdapterError } = require('../adapter');

const ID = 'hubspot';

const AUTH = {
  kind: 'oauth2',
  metadata: {
    authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
      'crm.schemas.contacts.read',
    ],
    // HubSpot private-app tokens may be used instead of OAuth — same
    // bearer-token wire format, just statically issued. The connection
    // store records which kind was supplied.
    supportsPrivateAppToken: true,
  },
};

function clientFor(ctx) {
  if (!ctx || !ctx.connection || !ctx.connection.token) {
    throw new AdapterError('hubspot: missing connection token', {
      adapterId: ID,
      op: 'auth',
    });
  }
  return createClient({
    token: ctx.connection.token,
    fetchImpl: ctx.fetchImpl || globalThis.fetch,
  });
}

function wrapError(err, op) {
  if (err instanceof HubspotError) {
    return new AdapterError(err.message, {
      adapterId: ID,
      op,
      status: err.status,
      body: err.body,
    });
  }
  return err;
}

async function lookupContact(ctx, { email } = {}) {
  if (!email) throw new Error('hubspot.lookupContact: email is required');
  const client = clientFor(ctx);
  try {
    const contact = await client.findContactByEmail(email);
    if (!contact) return null;
    return {
      id: String(contact.id),
      email: (contact.properties && contact.properties.email) || email,
      displayName: contactDisplayName(contact),
      properties: contact.properties || {},
      raw: contact,
    };
  } catch (err) {
    throw wrapError(err, 'lookupContact');
  }
}

async function postNote(ctx, { contactId, body, timestamp } = {}) {
  if (!contactId) throw new Error('hubspot.postNote: contactId is required');
  if (!body) throw new Error('hubspot.postNote: body is required');
  const client = clientFor(ctx);
  try {
    const note = await client.addNoteToContact({ contactId, body, timestamp });
    return { id: String(note.id), raw: note };
  } catch (err) {
    throw wrapError(err, 'postNote');
  }
}

async function pushDealUpdate(ctx, { dealId, fields } = {}) {
  if (!dealId) throw new Error('hubspot.pushDealUpdate: dealId is required');
  if (!fields || typeof fields !== 'object') {
    throw new Error('hubspot.pushDealUpdate: fields object is required');
  }
  // Use the underlying module's _request helper so auth + error handling
  // stay in one place. The base hubspot.js doesn't expose a deal-update
  // method, so we drive _request directly with the right path/body.
  const client = clientFor(ctx);
  const path = `/crm/v3/objects/deals/${encodeURIComponent(dealId)}`;
  try {
    const data = await client._request(path, {
      method: 'PATCH',
      body: { properties: fields },
    });
    return { id: String((data && data.id) || dealId), raw: data };
  } catch (err) {
    throw wrapError(err, 'pushDealUpdate');
  }
}

module.exports = {
  id: ID,
  auth: AUTH,
  lookupContact,
  postNote,
  pushDealUpdate,
};
