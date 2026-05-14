'use strict';

const { suite, assert, tempFile } = require('./helpers');
const connections = require('../src/connections');

const s = suite('connections');

s.test('put + get round-trips a connection row', () => {
  const file = tempFile();
  const row = connections.put(file, {
    tenantId: 'tenant-a',
    adapterId: 'hubspot',
    token: 'hs-token',
    scopes: ['crm.objects.contacts.read'],
    metadata: { portalId: '12345' },
  });
  assert.strictEqual(row.tenantId, 'tenant-a');
  assert.strictEqual(row.token, 'hs-token');
  assert.deepStrictEqual(row.scopes, ['crm.objects.contacts.read']);

  const fetched = connections.get(file, 'tenant-a', 'hubspot');
  assert.strictEqual(fetched.token, 'hs-token');
  assert.strictEqual(fetched.metadata.portalId, '12345');
});

s.test('connection store isolates tenants: A cannot see B', () => {
  const file = tempFile();
  connections.put(file, {
    tenantId: 'tenant-a',
    adapterId: 'hubspot',
    token: 'A-secret',
  });
  connections.put(file, {
    tenantId: 'tenant-b',
    adapterId: 'hubspot',
    token: 'B-secret',
  });

  const a = connections.get(file, 'tenant-a', 'hubspot');
  const b = connections.get(file, 'tenant-b', 'hubspot');
  assert.strictEqual(a.token, 'A-secret');
  assert.strictEqual(b.token, 'B-secret');

  // Cross-tenant lookup of an adapter only present for one tenant returns null.
  connections.put(file, {
    tenantId: 'tenant-a',
    adapterId: 'slack',
    token: 'A-slack',
  });
  assert.strictEqual(connections.get(file, 'tenant-b', 'slack'), null);

  // listForTenant must not leak the other tenant's rows.
  const aRows = connections.listForTenant(file, 'tenant-a');
  const aAdapters = aRows.map((r) => r.adapterId).sort();
  assert.deepStrictEqual(aAdapters, ['hubspot', 'slack']);
  for (const r of aRows) {
    assert.strictEqual(r.tenantId, 'tenant-a');
    assert.notStrictEqual(r.token, 'B-secret');
  }
});

s.test('put on an existing (tenantId, adapterId) updates token in place', () => {
  const file = tempFile();
  connections.put(file, { tenantId: 't', adapterId: 'slack', token: 't1' });
  connections.put(file, {
    tenantId: 't',
    adapterId: 'slack',
    token: 't2',
    metadata: { teamId: 'T1' },
  });
  const row = connections.get(file, 't', 'slack');
  assert.strictEqual(row.token, 't2');
  assert.strictEqual(row.metadata.teamId, 'T1');
  // Still only one row, not two.
  assert.strictEqual(connections.listForTenant(file, 't').length, 1);
});

s.test('remove deletes a single tenant/adapter pair', () => {
  const file = tempFile();
  connections.put(file, { tenantId: 'a', adapterId: 'hubspot', token: 'x' });
  connections.put(file, { tenantId: 'a', adapterId: 'google', token: 'y' });
  assert.strictEqual(connections.remove(file, 'a', 'hubspot'), true);
  assert.strictEqual(connections.get(file, 'a', 'hubspot'), null);
  assert.ok(connections.get(file, 'a', 'google'), 'google connection survives');
  // Removing a non-existent pair returns false (no error).
  assert.strictEqual(connections.remove(file, 'a', 'hubspot'), false);
});

s.test('markUsed updates lastUsedAt', async () => {
  const file = tempFile();
  connections.put(file, { tenantId: 't', adapterId: 'hubspot', token: 'x' });
  const before = connections.get(file, 't', 'hubspot');
  assert.ok(!before.lastUsedAt);
  // Wait a tick so the ISO timestamp differs from createdAt deterministically.
  await new Promise((r) => setTimeout(r, 5));
  connections.markUsed(file, 't', 'hubspot');
  const after = connections.get(file, 't', 'hubspot');
  assert.ok(after.lastUsedAt, 'lastUsedAt must be set');
});

s.test('toAdapterConnection strips storage bookkeeping and flattens metadata', () => {
  const row = {
    tenantId: 't',
    adapterId: 'salesforce',
    token: 'access',
    refreshToken: 'refresh',
    scopes: ['api'],
    metadata: { instanceUrl: 'https://x.my.salesforce.com' },
    createdAt: '2026-05-13T00:00:00Z',
    updatedAt: '2026-05-13T00:00:00Z',
  };
  const conn = connections.toAdapterConnection(row);
  assert.strictEqual(conn.token, 'access');
  assert.strictEqual(conn.refreshToken, 'refresh');
  assert.strictEqual(conn.instanceUrl, 'https://x.my.salesforce.com');
  assert.deepStrictEqual(conn.scopes, ['api']);
  // bookkeeping fields should not be present on the adapter view.
  assert.strictEqual(conn.createdAt, undefined);
  assert.strictEqual(conn.updatedAt, undefined);
  assert.strictEqual(conn.tenantId, undefined);
});

s.test('get requires both tenantId and adapterId', () => {
  const file = tempFile();
  assert.throws(() => connections.get(file, '', 'hubspot'), /tenantId is required/);
  assert.throws(() => connections.get(file, 'a', ''), /adapterId is required/);
});

module.exports = s;
