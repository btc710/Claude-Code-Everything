'use strict';

const events = require('./events');
const { resourceKey } = require('./ids');

// Redaction-by-tombstone is the SOC2-friendly way to honor a GDPR/CCPA
// "right to erasure" request without breaking the append-only invariant.
// We never edit a past row. Instead we write a `redact` event; queries
// learn to recognize it and scrub the payload of every prior row for
// the same (tenantId, resource, resourceId).
//
// The underlying log STILL contains the original before/after — compliance
// teams may need to prove an event happened — but no read API surfaces it.

function redactResource(dir, opts) {
  if (!opts || !opts.tenantId) throw new Error('redactResource: tenantId required');
  if (!opts.resource) throw new Error('redactResource: resource required');
  if (!opts.resourceId) throw new Error('redactResource: resourceId required');

  const ev = events.record(dir, {
    tenantId: opts.tenantId,
    actorId: opts.actorId || 'system',
    action: 'redact',
    resource: opts.resource,
    resourceId: opts.resourceId,
    before: null,
    after: null,
    residency: opts.residency,
    ip: opts.ip,
    meta: { kind: 'redact', reason: opts.reason || null },
  });
  return ev;
}

// Export the full history of a single resource — what a data-subject access
// request returns. If the resource has been redacted, the payload of prior
// rows is scrubbed; the envelope (id, ts, actor, action) is preserved so
// the report can show "this happened on Mar 14 but the data has been
// erased per a redaction request on Apr 2."
function exportResource(dir, opts) {
  if (!opts || !opts.tenantId) throw new Error('exportResource: tenantId required');
  if (!opts.resource) throw new Error('exportResource: resource required');
  if (!opts.resourceId) throw new Error('exportResource: resourceId required');

  // events.query() already respects tombstones for cross-resource reads. For
  // export we ALSO want the redact-event itself in the output so the
  // recipient can see the moment of erasure.
  const rows = events.query(dir, {
    tenantId: opts.tenantId,
    resource: opts.resource,
    resourceId: opts.resourceId,
  });

  // Determine if a tombstone exists; if so, surface the redaction metadata
  // on the envelope so a recipient knows why the payloads are scrubbed.
  const tombstones = events.buildTombstoneIndex(rows);
  const k = resourceKey(opts.tenantId, opts.resource, opts.resourceId);
  const redacted = tombstones.get(k) || null;

  return {
    tenantId: opts.tenantId,
    resource: opts.resource,
    resourceId: opts.resourceId,
    generatedAt: new Date().toISOString(),
    redacted: redacted ? {
      at: redacted.at,
      by: redacted.by,
      eventId: redacted.id,
    } : null,
    history: rows,
  };
}

module.exports = { redactResource, exportResource };
