'use strict';

const fs = require('fs');
const path = require('path');

// JSON-file store. Swap for Postgres/SQLite in production by re-implementing
// load() and save() against the chosen DB. The rest of the package consumes
// the in-memory shape returned by load().

const EMPTY = () => ({
  version: 1,
  tenants: [],     // [{ id, name, slug, createdAt, updatedAt }]
  users: [],       // [{ id, email, displayName, createdAt }]
  memberships: [], // [{ id, tenantId, userId, role, createdAt, updatedAt }]
  tokens: [],      // [{ id, hash, userId, tenantId, scopes, createdAt, expiresAt, revokedAt }]
  audit: [],       // [{ id, at, actor: { userId?, tokenId? }, tenantId, action, target, meta }]
});

function load(file) {
  if (!fs.existsSync(file)) return EMPTY();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`store load failed: ${e.message}`);
  }
}

function save(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function withStore(file, fn) {
  const data = load(file);
  const result = fn(data);
  save(file, data);
  return result;
}

module.exports = { load, save, withStore, EMPTY };
