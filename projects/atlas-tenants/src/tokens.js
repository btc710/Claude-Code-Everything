'use strict';

const { withStore, load } = require('./store');
const { id, hashToken, newTokenPlaintext } = require('./ids');
const { recordAudit } = require('./audit');
const { tokenCovers } = require('./permissions');

const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// Issue a bearer token scoped to a (tenant, user) pair.
//
// We return the plaintext exactly once. The store keeps only the SHA-256 hash,
// so a stolen JSON file cannot be replayed at the gateway. The token row also
// carries the scope list and an expiresAt so authorize() can short-circuit.
function issueToken(file, { tenantId, userId, scopes = [], ttlMs = DEFAULT_TTL_MS, actor = null }) {
  if (!tenantId) throw new Error('tenantId required');
  if (!userId) throw new Error('userId required');
  return withStore(file, data => {
    const m = data.memberships.find(x => x.tenantId === tenantId && x.userId === userId);
    if (!m) throw new Error('membership required before issuing a token');
    const plaintext = newTokenPlaintext();
    const now = Date.now();
    const expiresAt = ttlMs > 0 ? new Date(now + ttlMs).toISOString() : null;
    const row = {
      id: id('tok'),
      hash: hashToken(plaintext),
      userId,
      tenantId,
      scopes: Array.isArray(scopes) ? scopes.slice() : [],
      createdAt: new Date(now).toISOString(),
      expiresAt,
      revokedAt: null,
    };
    data.tokens.push(row);
    recordAudit(data, {
      actor,
      tenantId,
      action: 'token.issue',
      target: { type: 'token', id: row.id },
      meta: { userId, scopes: row.scopes, expiresAt },
    });
    // Return both the row (sans hash leak to caller is fine — it IS the row)
    // and the plaintext. Plaintext is returned exactly once; we never persist it.
    return { token: plaintext, record: row };
  });
}

function revokeToken(file, tokenId, { actor = null } = {}) {
  return withStore(file, data => {
    const t = data.tokens.find(x => x.id === tokenId);
    if (!t) throw new Error(`token ${tokenId} not found`);
    if (t.revokedAt) return t;
    t.revokedAt = new Date().toISOString();
    recordAudit(data, {
      actor,
      tenantId: t.tenantId,
      action: 'token.revoke',
      target: { type: 'token', id: t.id },
      meta: { userId: t.userId },
    });
    return t;
  });
}

function revokeTokenByPlaintext(file, plaintext, opts = {}) {
  const hash = hashToken(plaintext);
  const data = load(file);
  const t = data.tokens.find(x => x.hash === hash);
  if (!t) throw new Error('token not found');
  return revokeToken(file, t.id, opts);
}

function listTokens(file, { tenantId = null, userId = null, includeRevoked = false } = {}) {
  return load(file).tokens
    .filter(t =>
      (!tenantId || t.tenantId === tenantId) &&
      (!userId || t.userId === userId) &&
      (includeRevoked || !t.revokedAt)
    )
    .map(t => {
      // Strip the hash before returning. Listers should never see it.
      const { hash, ...rest } = t;
      return rest;
    });
}

function tokenIsExpired(t, now = Date.now()) {
  if (!t.expiresAt) return false;
  return Date.parse(t.expiresAt) <= now;
}

// Resolve a plaintext token into { tenantId, userId, role, scopes, tokenId }.
//
// Required behaviour:
//  - unknown token        → throw 'invalid_token'
//  - revoked token        → throw 'token_revoked'
//  - expired token        → throw 'token_expired'
//  - membership gone      → throw 'membership_missing'
//  - scope shortage       → throw 'scope_denied'  (token didn't include scopes)
//  - role shortage        → throw 'role_denied'   (membership role can't do it)
function authorize(file, plaintext, requiredScopes = []) {
  if (!plaintext) throw new Error('invalid_token');
  const hash = hashToken(plaintext);
  const data = load(file);
  const t = data.tokens.find(x => x.hash === hash);
  if (!t) throw new Error('invalid_token');
  if (t.revokedAt) throw new Error('token_revoked');
  if (tokenIsExpired(t)) throw new Error('token_expired');
  const m = data.memberships.find(x => x.tenantId === t.tenantId && x.userId === t.userId);
  if (!m) throw new Error('membership_missing');

  const required = Array.isArray(requiredScopes) ? requiredScopes : (requiredScopes ? [requiredScopes] : []);
  if (!tokenCovers(t.scopes, required)) throw new Error('scope_denied');
  const { roleHasScopes } = require('./permissions');
  if (!roleHasScopes(m.role, required)) throw new Error('role_denied');

  return {
    tokenId: t.id,
    tenantId: t.tenantId,
    userId: t.userId,
    role: m.role,
    scopes: t.scopes.slice(),
  };
}

module.exports = {
  issueToken,
  revokeToken,
  revokeTokenByPlaintext,
  listTokens,
  authorize,
  tokenIsExpired,
  DEFAULT_TTL_MS,
};
