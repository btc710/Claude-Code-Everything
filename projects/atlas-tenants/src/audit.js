'use strict';

const { id } = require('./ids');

// Append-only audit record. Mutators call recordAudit(data, ...) inside their
// withStore callback so the row is persisted in the same atomic write as the
// mutation itself.
function recordAudit(data, { actor = null, tenantId = null, action, target = null, meta = null }) {
  if (!action) throw new Error('audit action required');
  const event = {
    id: id('aud'),
    at: new Date().toISOString(),
    actor: actor || null,        // { userId?, tokenId? } | null for system actions
    tenantId,
    action,                       // dotted verb, e.g. 'tenant.create', 'token.revoke'
    target: target || null,       // optional { type, id }
    meta: meta || null,           // arbitrary JSON, e.g. previous role on update
  };
  data.audit.push(event);
  return event;
}

function listAudit(data, { tenantId = null, action = null, limit = null } = {}) {
  const filtered = data.audit.filter(e =>
    (!tenantId || e.tenantId === tenantId) &&
    (!action || e.action === action)
  );
  const sorted = filtered.slice().sort((a, b) => a.at.localeCompare(b.at));
  return limit ? sorted.slice(-limit) : sorted;
}

module.exports = { recordAudit, listAudit };
