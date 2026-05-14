'use strict';

const events = require('./events');
const residency = require('./residency');
const redact = require('./redact');
const softdelete = require('./softdelete');
const segments = require('./segments');
const ids = require('./ids');

module.exports = {
  // Core event API
  record: events.record,
  query: events.query,
  REDACTED_VALUE: events.REDACTED_VALUE,

  // Residency
  setTenantRegion: residency.setTenantRegion,
  getTenantRegion: residency.getTenantRegion,
  REGIONS: residency.REGIONS,

  // Redaction / export
  redactResource: redact.redactResource,
  exportResource: redact.exportResource,

  // Soft delete
  archive: softdelete.archive,
  unarchive: softdelete.unarchive,
  isArchived: softdelete.isArchived,

  // Sub-modules for advanced use
  events,
  residency,
  redact,
  softdelete,
  segments,
  ids,
};
