'use strict';

const crypto = require('crypto');

function id(prefix = 't') {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

// Deterministic id for a triple so re-ingesting the same source object is
// idempotent. Two triples with identical (subject, predicate, object,
// tenantId, projectId) collapse to one row regardless of ingest order.
function tripleKey({ subject, predicate, object, tenantId, projectId }) {
  const parts = [subject, predicate, object, tenantId || '', projectId || ''];
  return crypto.createHash('sha1').update(parts.join('')).digest('hex').slice(0, 16);
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = { id, tripleKey, nowIso };
