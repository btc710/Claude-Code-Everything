'use strict';

const tenants = require('./tenants');
const users = require('./users');
const memberships = require('./memberships');
const tokens = require('./tokens');
const audit = require('./audit');
const permissions = require('./permissions');
const store = require('./store');
const ids = require('./ids');

module.exports = {
  ...tenants,
  ...users,
  ...memberships,
  ...tokens,
  // audit listAudit operates on raw store data; expose it through a file-friendly wrapper.
  listAudit: (file, opts) => audit.listAudit(store.load(file), opts),
  permissions,
  store,
  ids,
};
