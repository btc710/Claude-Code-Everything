'use strict';

const lib = require('../src');
const { tmpStoreFile, assert, assertEqual, assertThrows } = require('./helpers');

const tests = [
  ['createTenant assigns id, slug, timestamps and writes an audit row', () => {
    const file = tmpStoreFile();
    const t = lib.createTenant(file, { name: 'Acme & Co!' });
    assert(t.id.startsWith('ten_'), 'tenant id prefix');
    assertEqual(t.slug, 'acme-co', 'slug');
    assert(t.createdAt && t.updatedAt, 'timestamps set');
    const audit = lib.listAudit(file, { tenantId: t.id });
    assertEqual(audit.length, 1, 'one audit row');
    assertEqual(audit[0].action, 'tenant.create', 'audit action');
  }],

  ['createTenant with ownerUserId bootstraps an owner membership', () => {
    const file = tmpStoreFile();
    const user = lib.upsertUser(file, { email: 'founder@acme.test', displayName: 'Founder' });
    const t = lib.createTenant(file, { name: 'Acme', ownerUserId: user.id });
    const members = lib.listMembers(file, t.id);
    assertEqual(members.length, 1, 'one member');
    assertEqual(members[0].role, 'owner', 'is owner');
    assertEqual(members[0].userId, user.id, 'correct user');
  }],

  ['listTenants returns all created tenants', () => {
    const file = tmpStoreFile();
    lib.createTenant(file, { name: 'A' });
    lib.createTenant(file, { name: 'B' });
    lib.createTenant(file, { name: 'C' });
    assertEqual(lib.listTenants(file).length, 3, 'three tenants');
  }],

  ['updateTenant renames and re-slugs, audits the diff', () => {
    const file = tmpStoreFile();
    const t = lib.createTenant(file, { name: 'Old Name' });
    const u = lib.updateTenant(file, t.id, { name: 'New Name!' });
    assertEqual(u.name, 'New Name!', 'name');
    assertEqual(u.slug, 'new-name', 'slug regenerated');
    const audit = lib.listAudit(file, { tenantId: t.id, action: 'tenant.update' });
    assertEqual(audit.length, 1, 'one update audit');
    assertEqual(audit[0].meta.before.name, 'Old Name', 'before captured');
  }],

  ['createTenant rejects missing name', () => {
    assertThrows(() => lib.createTenant(tmpStoreFile(), {}), /name required/, 'rejects');
  }],

  ['getTenant returns null for unknown id', () => {
    assertEqual(lib.getTenant(tmpStoreFile(), 'ten_nope'), null, 'null');
  }],
];

module.exports = tests;
