'use strict';

const events = require('./events');

// Archive don't delete. A SOC2 control objective: no actor in the system
// should be able to permanently remove a row, only flag it as archived.
// We implement that flag as an audit event so the archive itself leaves
// a trail (who did it, when, why).
//
// isArchived() walks the log for the latest archive/unarchive event for
// the resource; the chronologically latest one wins.

function archive(dir, opts) {
  if (!opts || !opts.tenantId) throw new Error('archive: tenantId required');
  if (!opts.resource) throw new Error('archive: resource required');
  if (!opts.resourceId) throw new Error('archive: resourceId required');

  return events.record(dir, {
    tenantId: opts.tenantId,
    actorId: opts.actorId || 'system',
    action: 'archive',
    resource: opts.resource,
    resourceId: opts.resourceId,
    before: { archived: false },
    after: { archived: true, archivedAt: new Date().toISOString() },
    residency: opts.residency,
    ip: opts.ip,
    meta: { kind: 'archive', reason: opts.reason || null },
  });
}

function unarchive(dir, opts) {
  if (!opts || !opts.tenantId) throw new Error('unarchive: tenantId required');
  if (!opts.resource) throw new Error('unarchive: resource required');
  if (!opts.resourceId) throw new Error('unarchive: resourceId required');

  return events.record(dir, {
    tenantId: opts.tenantId,
    actorId: opts.actorId || 'system',
    action: 'unarchive',
    resource: opts.resource,
    resourceId: opts.resourceId,
    before: { archived: true },
    after: { archived: false },
    residency: opts.residency,
    ip: opts.ip,
    meta: { kind: 'unarchive', reason: opts.reason || null },
  });
}

// Return true if the most recent archive/unarchive event for the resource
// is an archive. Uses the raw log so a redaction tombstone doesn't hide
// the archive state — operationally we still need to know what's archived
// even if its payload has been scrubbed.
function isArchived(dir, tenantId, resource, resourceId) {
  const rows = events.rawAll(dir, { tenantId, resource, resourceId });
  let archived = false;
  for (const ev of rows) {
    if (ev.action === 'archive') archived = true;
    else if (ev.action === 'unarchive') archived = false;
  }
  return archived;
}

module.exports = { archive, unarchive, isArchived };
