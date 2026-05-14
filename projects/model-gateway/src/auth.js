'use strict';

const { loadTenantTokens } = require('./secrets');

// Resolves a tenantId from a Bearer token. Returns null when unauthenticated.
function authenticate(req, env = process.env) {
  const header = req.headers && req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  const tokens = loadTenantTokens(env);
  return tokens.get(token) || null;
}

module.exports = { authenticate };
