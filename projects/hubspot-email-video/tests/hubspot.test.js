'use strict';

const { suite, assert, fakeFetch, jsonResponse } = require('./helpers');
const { createClient, contactDisplayName } = require('../src/hubspot');

const s = suite('hubspot');

s.test('findContactByEmail returns first match', async () => {
  const client = createClient({
    token: 't',
    fetchImpl: fakeFetch([
      {
        match: (url, opts) =>
          url.endsWith('/crm/v3/objects/contacts/search') && opts.method === 'POST',
        respond: () =>
          jsonResponse(200, {
            results: [
              {
                id: '42',
                properties: { email: 'a@b.com', firstname: 'Ada', lastname: 'L' },
              },
            ],
          }),
      },
    ]),
  });
  const c = await client.findContactByEmail('a@b.com');
  assert.strictEqual(c.id, '42');
  assert.strictEqual(c.properties.firstname, 'Ada');
});

s.test('findContactByEmail returns null when none', async () => {
  const client = createClient({
    token: 't',
    fetchImpl: fakeFetch([
      {
        match: (url) => url.includes('/crm/v3/objects/contacts/search'),
        respond: () => jsonResponse(200, { results: [] }),
      },
    ]),
  });
  const c = await client.findContactByEmail('nobody@example.com');
  assert.strictEqual(c, null);
});

s.test('addNoteToContact creates note + association', async () => {
  const calls = [];
  const client = createClient({
    token: 't',
    fetchImpl: fakeFetch([
      {
        match: (url, opts) =>
          url.endsWith('/crm/v3/objects/notes') && opts.method === 'POST',
        respond: (_, opts) => {
          calls.push({ kind: 'create-note', body: JSON.parse(opts.body) });
          return jsonResponse(201, { id: '999' });
        },
      },
      {
        match: (url, opts) =>
          url.includes('/crm/v4/objects/notes/999/associations/contacts/55') &&
          opts.method === 'PUT',
        respond: () => {
          calls.push({ kind: 'associate' });
          return jsonResponse(200, {});
        },
      },
    ]),
  });
  const note = await client.addNoteToContact({
    contactId: '55',
    body: 'hello',
    timestamp: 1700000000000,
  });
  assert.strictEqual(note.id, '999');
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].body.properties.hs_note_body, 'hello');
  assert.strictEqual(calls[0].body.properties.hs_timestamp, '1700000000000');
});

s.test('contactDisplayName falls back to email', () => {
  assert.strictEqual(
    contactDisplayName({ properties: { email: 'x@y.com' } }),
    'x@y.com',
  );
  assert.strictEqual(
    contactDisplayName({ properties: { firstname: 'Ada', lastname: 'L' } }),
    'Ada L',
  );
  assert.strictEqual(contactDisplayName(null), null);
});

module.exports = s;
