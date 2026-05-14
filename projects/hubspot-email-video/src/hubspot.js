'use strict';

const HUBSPOT_API = 'https://api.hubapi.com';

class HubspotError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'HubspotError';
    this.status = status;
    this.body = body;
  }
}

function createClient({ token, fetchImpl = globalThis.fetch }) {
  if (!token) throw new Error('HubSpot token is required');
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available; supply fetchImpl or use Node >=18');
  }

  async function request(path, { method = 'GET', body } = {}) {
    const res = await fetchImpl(`${HUBSPOT_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) {
      throw new HubspotError(
        `HubSpot ${method} ${path} failed: ${res.status}`,
        res.status,
        data,
      );
    }
    return data;
  }

  async function findContactByEmail(email) {
    const data = await request('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: {
        filterGroups: [
          {
            filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
          },
        ],
        properties: ['email', 'firstname', 'lastname', 'company', 'phone', 'lifecyclestage'],
        limit: 1,
      },
    });
    return data && data.results && data.results[0] ? data.results[0] : null;
  }

  async function addNoteToContact({ contactId, body, timestamp = Date.now() }) {
    const note = await request('/crm/v3/objects/notes', {
      method: 'POST',
      body: {
        properties: { hs_note_body: body, hs_timestamp: String(timestamp) },
      },
    });

    await request(
      `/crm/v4/objects/notes/${note.id}/associations/contacts/${contactId}`,
      {
        method: 'PUT',
        body: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 202,
          },
        ],
      },
    );

    return note;
  }

  return { findContactByEmail, addNoteToContact, _request: request };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return { raw: text };
  }
}

function contactDisplayName(contact) {
  if (!contact || !contact.properties) return null;
  const { firstname, lastname, email } = contact.properties;
  const name = [firstname, lastname].filter(Boolean).join(' ').trim();
  return name || email || null;
}

module.exports = { createClient, contactDisplayName, HubspotError };
