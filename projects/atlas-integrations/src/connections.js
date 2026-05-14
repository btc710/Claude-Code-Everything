'use strict';

// Per-tenant connection store. One record per (tenantId, adapterId). Holds
// the OAuth bearer or API token, refresh token (when present), scopes,
// timestamps, and any adapter-specific metadata (e.g. Salesforce
// instanceUrl, Google clientId/clientSecret).
//
// JSON-file backed sketch. Production swaps load/save for Postgres or a
// KMS-encrypted secrets store without changing call sites.
//
// On-disk shape:
//   {
//     version: 1,
//     connections: [
//       {
//         tenantId, adapterId,
//         token, refreshToken,
//         scopes: [...],
//         metadata: {...},
//         createdAt, updatedAt, lastUsedAt
//       }
//     ]
//   }

const fs = require('fs');
const path = require('path');

const EMPTY = () => ({ version: 1, connections: [] });

function load(file) {
  if (!fs.existsSync(file)) return EMPTY();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object') return EMPTY();
    if (!Array.isArray(raw.connections)) raw.connections = [];
    if (!raw.version) raw.version = 1;
    return raw;
  } catch (e) {
    throw new Error(`connections load failed: ${e.message}`);
  }
}

function save(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function key(tenantId, adapterId) {
  if (!tenantId) throw new Error('tenantId is required');
  if (!adapterId) throw new Error('adapterId is required');
  return `${tenantId}::${adapterId}`;
}

// Put (insert or replace) a connection. Returns the stored row.
function put(file, { tenantId, adapterId, token, refreshToken, scopes, metadata }) {
  if (!token) throw new Error('token is required');
  const k = key(tenantId, adapterId);
  const data = load(file);
  const now = new Date().toISOString();
  const existing = data.connections.find(
    (c) => key(c.tenantId, c.adapterId) === k,
  );
  const row = existing || { tenantId, adapterId, createdAt: now };
  row.token = token;
  row.refreshToken = refreshToken || row.refreshToken || null;
  row.scopes = Array.isArray(scopes) ? scopes : row.scopes || [];
  row.metadata = Object.assign({}, row.metadata || {}, metadata || {});
  row.updatedAt = now;
  if (!existing) data.connections.push(row);
  save(file, data);
  return row;
}

// Fetch a connection scoped strictly to (tenantId, adapterId). A caller
// holding tenantId "A" can never read tenant "B"'s row — the key is part
// of the lookup, not a filter applied after the fact.
function get(file, tenantId, adapterId) {
  if (!tenantId) throw new Error('tenantId is required');
  if (!adapterId) throw new Error('adapterId is required');
  const data = load(file);
  const k = key(tenantId, adapterId);
  return data.connections.find((c) => key(c.tenantId, c.adapterId) === k) || null;
}

function remove(file, tenantId, adapterId) {
  const data = load(file);
  const k = key(tenantId, adapterId);
  const before = data.connections.length;
  data.connections = data.connections.filter(
    (c) => key(c.tenantId, c.adapterId) !== k,
  );
  if (data.connections.length === before) return false;
  save(file, data);
  return true;
}

// List connections for a tenant. Other tenants' rows are never returned
// even if they share an adapterId.
function listForTenant(file, tenantId) {
  if (!tenantId) throw new Error('tenantId is required');
  const data = load(file);
  return data.connections.filter((c) => c.tenantId === tenantId);
}

function markUsed(file, tenantId, adapterId) {
  const data = load(file);
  const row = data.connections.find(
    (c) => c.tenantId === tenantId && c.adapterId === adapterId,
  );
  if (!row) return null;
  row.lastUsedAt = new Date().toISOString();
  save(file, data);
  return row;
}

// Build the `ctx.connection` object passed to an adapter. Strips storage
// bookkeeping (createdAt/updatedAt) and flattens metadata onto the root
// so adapters can read `connection.instanceUrl` rather than digging into
// `.metadata`. Keeps `metadata` available too for round-tripping.
function toAdapterConnection(row) {
  if (!row) return null;
  const meta = row.metadata || {};
  return Object.assign({}, meta, {
    token: row.token,
    refreshToken: row.refreshToken || null,
    scopes: row.scopes || [],
    metadata: meta,
  });
}

module.exports = {
  load,
  save,
  put,
  get,
  remove,
  listForTenant,
  markUsed,
  toAdapterConnection,
  EMPTY,
};
