'use strict';

const lib = require('../src');
const { hashToken } = require('../src/ids');
const { load } = require('../src/store');
const {
  tmpStoreFile, assert, assertEqual, assertThrows, seedTenantWithRoles,
} = require('./helpers');

const tests = [
  ['issueToken returns plaintext exactly once and stores only the hash', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    const { token, record } = lib.issueToken(file, { tenantId: tenant.id, userId: userIds.admin });
    assert(token.startsWith('atk_'), 'plaintext is prefixed');
    assert(record.id.startsWith('tok_'), 'token id prefix');
    const stored = load(file).tokens.find(t => t.id === record.id);
    assertEqual(stored.hash, hashToken(token), 'hash matches plaintext');
    assert(!('plaintext' in stored), 'no plaintext field');
    assert(!Object.values(stored).includes(token), 'plaintext does not leak into the store');
  }],

  ['issueToken refuses if there is no membership for (tenant, user)', () => {
    const file = tmpStoreFile();
    const t = lib.createTenant(file, { name: 'Acme' });
    const u = lib.upsertUser(file, { email: 'stray@acme.test' });
    assertThrows(
      () => lib.issueToken(file, { tenantId: t.id, userId: u.id }),
      /membership required/,
      'no membership',
    );
  }],

  ['authorize resolves a token into { tenantId, userId, role, scopes }', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    const { token } = lib.issueToken(file, { tenantId: tenant.id, userId: userIds.admin });
    const principal = lib.authorize(file, token, ['member.read']);
    assertEqual(principal.tenantId, tenant.id, 'tenant');
    assertEqual(principal.userId, userIds.admin, 'user');
    assertEqual(principal.role, 'admin', 'role');
  }],

  ['authorize denies viewers attempting an admin scope (role_denied)', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    const { token } = lib.issueToken(file, { tenantId: tenant.id, userId: userIds.viewer });
    assertThrows(
      () => lib.authorize(file, token, ['member.invite']),
      /role_denied/,
      'viewer cannot admin',
    );
  }],

  ['authorize denies when role permits but token scopes do not (scope_denied)', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    // Admin role can member.invite, but this token only allows project.read.
    const { token } = lib.issueToken(file, {
      tenantId: tenant.id,
      userId: userIds.admin,
      scopes: ['project.read'],
    });
    assertThrows(
      () => lib.authorize(file, token, ['member.invite']),
      /scope_denied/,
      'token restricts further than role',
    );
  }],

  ['authorize rejects an unknown token (invalid_token)', () => {
    const file = tmpStoreFile();
    assertThrows(
      () => lib.authorize(file, 'atk_garbage', []),
      /invalid_token/,
      'unknown',
    );
  }],

  ['authorize rejects an expired token (token_expired)', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    // ttlMs=1 with a backdated expiresAt to deterministically force expiry.
    const { token, record } = lib.issueToken(file, {
      tenantId: tenant.id, userId: userIds.member, ttlMs: 1,
    });
    // Force expiry by editing the persisted expiresAt to the past.
    const { withStore } = require('../src/store');
    withStore(file, data => {
      const t = data.tokens.find(x => x.id === record.id);
      t.expiresAt = '2000-01-01T00:00:00.000Z';
    });
    assertThrows(
      () => lib.authorize(file, token, []),
      /token_expired/,
      'expired',
    );
  }],

  ['authorize rejects a revoked token (token_revoked)', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    const { token, record } = lib.issueToken(file, { tenantId: tenant.id, userId: userIds.member });
    lib.revokeToken(file, record.id);
    assertThrows(
      () => lib.authorize(file, token, []),
      /token_revoked/,
      'revoked',
    );
    const audit = lib.listAudit(file, { tenantId: tenant.id, action: 'token.revoke' });
    assertEqual(audit.length, 1, 'revoke audited');
  }],

  ['revokeTokenByPlaintext finds and revokes the matching row', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    const { token } = lib.issueToken(file, { tenantId: tenant.id, userId: userIds.admin });
    const t = lib.revokeTokenByPlaintext(file, token);
    assert(t.revokedAt, 'revokedAt set');
    assertThrows(() => lib.authorize(file, token, []), /token_revoked/, 'denies after revoke');
  }],

  ['authorize denies when the membership has been removed (membership_missing)', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    const { token } = lib.issueToken(file, { tenantId: tenant.id, userId: userIds.member });
    lib.removeMember(file, { tenantId: tenant.id, userId: userIds.member });
    assertThrows(
      () => lib.authorize(file, token, []),
      /membership_missing/,
      'no membership',
    );
  }],

  ['listTokens hides revoked by default and never returns the hash', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    const a = lib.issueToken(file, { tenantId: tenant.id, userId: userIds.admin });
    const b = lib.issueToken(file, { tenantId: tenant.id, userId: userIds.member });
    lib.revokeToken(file, b.record.id);
    const active = lib.listTokens(file, { tenantId: tenant.id });
    assertEqual(active.length, 1, 'only active');
    assertEqual(active[0].id, a.record.id, 'right one');
    assert(!('hash' in active[0]), 'no hash leaked');
    const all = lib.listTokens(file, { tenantId: tenant.id, includeRevoked: true });
    assertEqual(all.length, 2, 'with revoked');
  }],

  ['token.issue is audited with userId, scopes, and expiresAt', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    lib.issueToken(file, { tenantId: tenant.id, userId: userIds.admin, scopes: ['project.read'] });
    const audit = lib.listAudit(file, { tenantId: tenant.id, action: 'token.issue' });
    assertEqual(audit.length, 1, 'one issue audit');
    assertEqual(audit[0].meta.scopes, ['project.read'], 'scopes captured');
    assert(audit[0].meta.expiresAt, 'expiresAt captured');
  }],

  ['scope wildcard "*" on token grants the full role set at authorize time', () => {
    const { file, tenant, userIds } = seedTenantWithRoles(lib);
    const { token } = lib.issueToken(file, {
      tenantId: tenant.id, userId: userIds.admin, scopes: ['*'],
    });
    // No scope requested → should still resolve.
    const p = lib.authorize(file, token, []);
    assertEqual(p.role, 'admin', 'role');
    // Admin-level scope requested → should pass because token covers everything.
    const p2 = lib.authorize(file, token, ['member.invite']);
    assertEqual(p2.tenantId, tenant.id, 'admin scope passes');
  }],
];

module.exports = tests;
