'use strict';

const lib = require('../src');
const { tmpStoreFile, assert, assertEqual, assertThrows, seedTenantWithRoles } = require('./helpers');

const tests = [
  ['inviteUser creates user + membership for a new email', () => {
    const file = tmpStoreFile();
    const t = lib.createTenant(file, { name: 'Acme' });
    const m = lib.inviteUser(file, {
      tenantId: t.id,
      email: 'New@Acme.test',
      role: 'member',
      displayName: 'New Hire',
    });
    assertEqual(m.role, 'member', 'role');
    const user = lib.getUserByEmail(file, 'new@acme.test');
    assert(user, 'user created');
    assertEqual(user.displayName, 'New Hire', 'display name set');
  }],

  ['inviteUser is idempotent for the same email + role', () => {
    const file = tmpStoreFile();
    const t = lib.createTenant(file, { name: 'Acme' });
    lib.inviteUser(file, { tenantId: t.id, email: 'x@acme.test', role: 'member' });
    lib.inviteUser(file, { tenantId: t.id, email: 'x@acme.test', role: 'member' });
    assertEqual(lib.listMembers(file, t.id).length, 1, 'no duplicate');
  }],

  ['inviting an existing member with a new role updates the role and audits the diff', () => {
    const file = tmpStoreFile();
    const t = lib.createTenant(file, { name: 'Acme' });
    lib.inviteUser(file, { tenantId: t.id, email: 'x@acme.test', role: 'viewer' });
    lib.inviteUser(file, { tenantId: t.id, email: 'x@acme.test', role: 'admin' });
    const members = lib.listMembers(file, t.id);
    assertEqual(members.length, 1, 'still one');
    assertEqual(members[0].role, 'admin', 'role upgraded');
    const audit = lib.listAudit(file, { tenantId: t.id, action: 'member.update' });
    assertEqual(audit.length, 1, 'one update audit');
    assertEqual(audit[0].meta, { before: 'viewer', after: 'admin' }, 'audit meta');
  }],

  ['inviteUser rejects an unknown role', () => {
    const file = tmpStoreFile();
    const t = lib.createTenant(file, { name: 'Acme' });
    assertThrows(
      () => lib.inviteUser(file, { tenantId: t.id, email: 'x@acme.test', role: 'god' }),
      /invalid role/,
      'rejects',
    );
  }],

  ['setRole moves a member up and down, audits the diff', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    lib.setRole(file, { tenantId: tenant.id, userId: userIds.member, role: 'admin' });
    const m = lib.getMembership(file, tenant.id, userIds.member);
    assertEqual(m.role, 'admin', 'promoted');
    const audit = lib.listAudit(file, { tenantId: tenant.id, action: 'member.update' });
    assert(audit.find(e => e.meta.before === 'member' && e.meta.after === 'admin'), 'audit present');
  }],

  ['setRole refuses to demote the last owner', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    assertThrows(
      () => lib.setRole(file, { tenantId: tenant.id, userId: userIds.owner, role: 'admin' }),
      /last owner/,
      'protects last owner',
    );
  }],

  ['setRole allows demoting one owner when another exists', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    lib.setRole(file, { tenantId: tenant.id, userId: userIds.admin, role: 'owner' });
    const before = lib.getMembership(file, tenant.id, userIds.owner);
    assertEqual(before.role, 'owner', 'pre-demote check');
    lib.setRole(file, { tenantId: tenant.id, userId: userIds.owner, role: 'admin' });
    const after = lib.getMembership(file, tenant.id, userIds.owner);
    assertEqual(after.role, 'admin', 'demoted with backup owner');
  }],

  ['removeMember deletes the membership and audits it', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    lib.removeMember(file, { tenantId: tenant.id, userId: userIds.viewer });
    const m = lib.getMembership(file, tenant.id, userIds.viewer);
    assertEqual(m, null, 'gone');
    const audit = lib.listAudit(file, { tenantId: tenant.id, action: 'member.remove' });
    assertEqual(audit.length, 1, 'one remove audit');
  }],

  ['removeMember refuses to remove the last owner', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    assertThrows(
      () => lib.removeMember(file, { tenantId: tenant.id, userId: userIds.owner }),
      /last owner/,
      'protects',
    );
  }],

  ['listMembers ranks by role (owner first) then createdAt', () => {
    const { file, tenant } = seedTenantWithRoles(lib);
    const members = lib.listMembers(file, tenant.id);
    assertEqual(members.map(m => m.role), ['owner', 'admin', 'member', 'viewer'], 'order');
  }],

  ['emails are normalized to lowercase', () => {
    const file = tmpStoreFile();
    const t = lib.createTenant(file, { name: 'Acme' });
    lib.inviteUser(file, { tenantId: t.id, email: 'Mixed.Case@ACME.test' });
    const found = lib.getUserByEmail(file, 'mixed.case@acme.test');
    assert(found, 'lookup by lowercase works');
  }],
];

module.exports = tests;
