'use strict';

const { suite, assert, fakeFetch, jsonResponse } = require('./helpers');
const hubspot = require('../src/adapters/hubspot');

const s = suite('hubspot-adapter');

function ctx(fetchImpl) {
  return {
    tenantId: 'tenant-a',
    connection: { token: 'hs-token' },
    fetchImpl,
  };
}

s.test('lookupContact returns normalized contact shape', async () => {
  const fetchImpl = fakeFetch([
    {
      match: (url, opts) =>
        url.endsWith('/crm/v3/objects/contacts/search') && opts.method === 'POST',
      respond: () =>
        jsonResponse(200, {
          results: [
            {
              id: 42,
              properties: {
                email: 'ada@example.com',
                firstname: 'Ada',
                lastname: 'Lovelace',
                company: 'Difference Engines Inc',
              },
            },
          ],
        }),
    },
  ]);
  const c = await hubspot.lookupContact(ctx(fetchImpl), { email: 'ada@example.com' });
  assert.strictEqual(c.id, '42');
  assert.strictEqual(c.email, 'ada@example.com');
  assert.strictEqual(c.displayName, 'Ada Lovelace');
  assert.strictEqual(c.properties.company, 'Difference Engines Inc');
  assert.ok(c.raw, 'raw payload should be passed through');
});

s.test('lookupContact returns null when no match', async () => {
  const fetchImpl = fakeFetch([
    {
      match: (url) => url.includes('/crm/v3/objects/contacts/search'),
      respond: () => jsonResponse(200, { results: [] }),
    },
  ]);
  const c = await hubspot.lookupContact(ctx(fetchImpl), { email: 'noone@example.com' });
  assert.strictEqual(c, null);
});

s.test('postNote routes through HubSpot notes + association', async () => {
  const calls = [];
  const fetchImpl = fakeFetch([
    {
      match: (url, opts) =>
        url.endsWith('/crm/v3/objects/notes') && opts.method === 'POST',
      respond: (_, opts) => {
        calls.push({ kind: 'create-note', body: JSON.parse(opts.body) });
        return jsonResponse(201, { id: 'note-1' });
      },
    },
    {
      match: (url, opts) =>
        url.includes('/crm/v4/objects/notes/note-1/associations/contacts/c1') &&
        opts.method === 'PUT',
      respond: () => {
        calls.push({ kind: 'associate' });
        return jsonResponse(200, {});
      },
    },
  ]);
  const note = await hubspot.postNote(ctx(fetchImpl), {
    contactId: 'c1',
    body: 'hello from atlas',
    timestamp: 1700000000000,
  });
  assert.strictEqual(note.id, 'note-1');
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].body.properties.hs_note_body, 'hello from atlas');
});

s.test('pushDealUpdate PATCHes the deal and returns id', async () => {
  let captured = null;
  const fetchImpl = fakeFetch([
    {
      match: (url, opts) =>
        url.endsWith('/crm/v3/objects/deals/d1') && opts.method === 'PATCH',
      respond: (url, opts) => {
        captured = { url, body: JSON.parse(opts.body) };
        return jsonResponse(200, { id: 'd1', properties: { amount: '5000' } });
      },
    },
  ]);
  const out = await hubspot.pushDealUpdate(ctx(fetchImpl), {
    dealId: 'd1',
    fields: { amount: '5000', stage: 'qualified' },
  });
  assert.strictEqual(out.id, 'd1');
  assert.ok(captured.url.includes('/crm/v3/objects/deals/d1'));
  assert.deepStrictEqual(captured.body.properties, { amount: '5000', stage: 'qualified' });
});

s.test('missing connection token raises AdapterError', async () => {
  await assert.rejects(
    hubspot.lookupContact({ tenantId: 't', connection: {} }, { email: 'a@b.c' }),
    /missing connection token/,
  );
});

module.exports = s;
