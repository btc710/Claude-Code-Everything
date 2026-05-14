'use strict';

const lib = require('../src');
const { tmpStoreFile, assert, assertEqual, seedTenantWithRoles } = require('./helpers');

const tests = [
  ['every mutation appends an audit row, none of the read paths do', () => {
    const file = tmpStoreFile();
    const t = lib.createTenant(file, { name: 'Acme' });
    lib.inviteUser(file, { tenantId: t.id, email: 'a@acme.test', role: 'admin' });
    const { record } = lib.issueToken(file, {
      tenantId: t.id,
      userId: lib.getUserByEmail(file, 'a@acme.test').id,
    });
    lib.revokeToken(file, record.id);
    // Reads should NOT add audit rows.
    lib.listMembers(file, t.id);
    lib.listTenants(file);
    lib.listAudit(file, { tenantId: t.id });

    const audit = lib.listAudit(file, { tenantId: t.id });
    const actions = audit.map(e => e.action).sort();
    assertEqual(
      actions,
      ['member.invite', 'tenant.create', 'token.issue', 'token.revoke'],
      'one row per mutation, no extras from reads',
    );
  }],

  ['audit rows are ordered by `at` ascending', () => {
    const { file, tenant } = seedTenantWithRoles(lib);
    const audit = lib.listAudit(file, { tenantId: tenant.id });
    for (let i = 1; i < audit.length; i++) {
      assert(audit[i - 1].at <= audit[i].at, `out of order at index ${i}`);
    }
  }],

  ['listAudit filter by action narrows the result', () => {
    const { file, tenant } = seedTenantWithRoles(lib);
    const invites = lib.listAudit(file, { tenantId: tenant.id, action: 'member.invite' });
    assert(invites.length >= 4, 'four invites at least');
    assert(invites.every(e => e.action === 'member.invite'), 'all invites');
  }],

  ['listAudit limit returns only the newest N rows', () => {
    const { file, tenant } = seedTenantWithRoles(lib);
    const all = lib.listAudit(file, { tenantId: tenant.id });
    const tail = lib.listAudit(file, { tenantId: tenant.id, limit: 2 });
    assertEqual(tail.length, 2, 'two rows');
    assertEqual(tail[tail.length - 1].id, all[all.length - 1].id, 'last row matches');
  }],

  ['audit captures the actor for actions performed on behalf of someone', () => {
    const file = tmpStoreFile();
    const t = lib.createTenant(file, { name: 'Acme' }, );
    // Simulate an admin acting on behalf.
    const actor = { userId: 'usr_admin_actor' };
    lib.inviteUser(file, { tenantId: t.id, email: 'b@acme.test', role: 'viewer', actor });
    const audit = lib.listAudit(file, { tenantId: t.id, action: 'member.invite' });
    assertEqual(audit[0].actor, actor, 'actor recorded');
  }],
];

module.exports = tests;
