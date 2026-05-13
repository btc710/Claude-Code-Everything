'use strict';

const crypto = require('crypto');

// Audit-event id. Random enough to be globally unique inside a tenant; the
// segment writer also enforces uniqueness at append time.
function id(prefix = 'evt') {
  return prefix + '_' + crypto.randomBytes(8).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

// Segment key for an ISO timestamp: 'audit-YYYY-MM.jsonl'.
// We compute it from the event's ts, not wall-clock, so a backfilled event
// lands in the correct historical segment.
function segmentKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid ts: ${iso}`);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `audit-${y}-${m}.jsonl`;
}

// Stable hash for an export/redact key so two writers redacting the same
// resource produce comparable tombstones.
function resourceKey(tenantId, resource, resourceId) {
  return crypto.createHash('sha1')
    .update([tenantId, resource, resourceId].join('|'))
    .digest('hex')
    .slice(0, 16);
}

module.exports = { id, nowIso, segmentKey, resourceKey };
