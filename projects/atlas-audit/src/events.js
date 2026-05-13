'use strict';

const segments = require('./segments');
const residency = require('./residency');
const { id, nowIso, resourceKey } = require('./ids');

// Append-only audit events. Every domain mutation in the Atlas stack should
// land here as a record with both `before` and `after` snapshots.
//
// Shape:
//   {
//     id, ts, tenantId, actorId, action, resource, resourceId,
//     before, after, residency, ip?
//   }
//
// Tombstone events (action='redact'/'archive') share the same shape but have
// a meta.kind discriminator so queries can recognize them without parsing
// payloads.

const REDACTED_VALUE = '[REDACTED]';

function assertEvent(ev) {
  if (!ev || typeof ev !== 'object') throw new Error('event must be an object');
  for (const k of ['tenantId', 'actorId', 'action', 'resource', 'resourceId']) {
    if (!ev[k]) throw new Error(`event.${k} required`);
  }
}

// Append a new event. Throws if id collides with anything already in the log.
// Auto-fills id, ts, residency if the caller omitted them.
function record(dir, ev) {
  assertEvent(ev);
  const out = {
    id: ev.id || id('evt'),
    ts: ev.ts || nowIso(),
    tenantId: ev.tenantId,
    actorId: ev.actorId,
    action: ev.action,
    resource: ev.resource,
    resourceId: ev.resourceId,
    before: ev.before === undefined ? null : ev.before,
    after: ev.after === undefined ? null : ev.after,
    residency: residency.resolveRegion(dir, ev.tenantId, ev.residency),
    ip: ev.ip || null,
    meta: ev.meta || null,
  };
  segments.append(dir, out);
  return out;
}

// Build a map of resourceKey -> { redactedAt, redactedBy } for every
// redact-tombstone in the log. Queries consult this map to suppress the
// payload of prior events for the same resource.
function buildTombstoneIndex(all) {
  const map = new Map();
  for (const ev of all) {
    if (ev.action === 'redact' && ev.meta && ev.meta.kind === 'redact') {
      const k = resourceKey(ev.tenantId, ev.resource, ev.resourceId);
      // First tombstone wins as the canonical redaction moment.
      if (!map.has(k)) map.set(k, { at: ev.ts, by: ev.actorId, id: ev.id });
    }
  }
  return map;
}

// Apply a tombstone to a single event: scrub before/after, keep envelope.
function applyTombstone(ev) {
  return Object.assign({}, ev, {
    before: ev.before === null ? null : REDACTED_VALUE,
    after: ev.after === null ? null : REDACTED_VALUE,
    redacted: true,
  });
}

// Filtered read across all segments. Tenants never see each other's rows.
// Redacted events are returned with their payload scrubbed but with the
// envelope intact so auditors can still see WHEN and WHO without seeing
// the underlying data.
function query(dir, filter) {
  if (!filter || !filter.tenantId) {
    throw new Error('query: tenantId required (tenant isolation)');
  }
  const all = segments.readAll(dir);
  const tombstones = buildTombstoneIndex(all);
  const sinceTs = filter.since ? new Date(filter.since).toISOString() : null;
  const untilTs = filter.until ? new Date(filter.until).toISOString() : null;

  const out = [];
  for (const ev of all) {
    if (ev.tenantId !== filter.tenantId) continue;
    if (filter.actorId && ev.actorId !== filter.actorId) continue;
    if (filter.action && ev.action !== filter.action) continue;
    if (filter.resource && ev.resource !== filter.resource) continue;
    if (filter.resourceId && ev.resourceId !== filter.resourceId) continue;
    if (filter.residency && ev.residency !== filter.residency) continue;
    if (sinceTs && ev.ts < sinceTs) continue;
    if (untilTs && ev.ts > untilTs) continue;

    // If the resource for this event has a tombstone earlier or anywhere in
    // the log, scrub the payload. The redact event itself is left intact so
    // auditors see when redaction happened.
    const k = resourceKey(ev.tenantId, ev.resource, ev.resourceId);
    if (tombstones.has(k) && !(ev.action === 'redact' && ev.meta && ev.meta.kind === 'redact')) {
      out.push(applyTombstone(ev));
    } else {
      out.push(ev);
    }
  }
  return out;
}

// Raw read — bypasses tombstone scrubbing. Internal use only. Exposed for
// the export module and for tests that need to assert the underlying log
// is NOT mutated by a redact call. Do not expose to end users.
function rawAll(dir, filter) {
  const all = segments.readAll(dir);
  if (!filter) return all;
  return all.filter(ev => {
    if (filter.tenantId && ev.tenantId !== filter.tenantId) return false;
    if (filter.resource && ev.resource !== filter.resource) return false;
    if (filter.resourceId && ev.resourceId !== filter.resourceId) return false;
    return true;
  });
}

module.exports = {
  REDACTED_VALUE,
  record,
  query,
  rawAll,
  buildTombstoneIndex,
};
