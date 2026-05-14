'use strict';

// Common interface every integration adapter must conform to. An adapter
// represents a single external SaaS (HubSpot, Google, Salesforce, M365, Slack).
//
// Shape:
//   module.exports = {
//     id: 'hubspot',                  // stable string key, matches connection store
//     auth: {
//       kind: 'oauth2'|'apiKey'|'serviceAccount',
//       metadata: { ... }             // authorize url, scopes, token url, etc.
//     },
//     supports: ['lookupContact', 'postNote', 'pushDealUpdate'],
//
//     async lookupContact(ctx, { email }),
//     async createCalendarEvent(ctx, { start, end, attendees, title, body }),
//     async sendEmail(ctx, { to, subject, body }),
//     async postNote(ctx, { contactId, body }),
//     async pushDealUpdate(ctx, { dealId, fields }),
//   };
//
// `ctx` is whatever the registry hands the adapter at invocation time and
// must contain at least:
//   { tenantId, connection: { token, refreshToken, scopes, ... }, fetchImpl }
//
// Methods an adapter does not implement should throw NotSupportedError so
// callers can branch generically. Adapters do this implicitly by not
// defining the method — `invoke()` below catches that.

const OPERATIONS = [
  'lookupContact',
  'createCalendarEvent',
  'sendEmail',
  'postNote',
  'pushDealUpdate',
];

class NotSupportedError extends Error {
  constructor(adapterId, op) {
    super(`adapter "${adapterId}" does not support operation "${op}"`);
    this.name = 'NotSupportedError';
    this.adapterId = adapterId;
    this.op = op;
  }
}

class AdapterError extends Error {
  constructor(message, { adapterId, op, status, body } = {}) {
    super(message);
    this.name = 'AdapterError';
    this.adapterId = adapterId;
    this.op = op;
    this.status = status;
    this.body = body;
  }
}

// Invoke an operation on an adapter, raising NotSupportedError consistently.
async function invoke(adapter, op, ctx, args) {
  if (!OPERATIONS.includes(op)) {
    throw new Error(`unknown operation: ${op}`);
  }
  if (typeof adapter[op] !== 'function') {
    throw new NotSupportedError(adapter.id, op);
  }
  return adapter[op](ctx, args || {});
}

// Compute the list of operations an adapter actually implements.
function supportedOperations(adapter) {
  return OPERATIONS.filter((op) => typeof adapter[op] === 'function');
}

// Validate basic shape at registration time. Cheap defensive check so a
// malformed adapter doesn't surface deep inside the CLI.
function assertValidAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error('adapter must be an object');
  }
  if (!adapter.id || typeof adapter.id !== 'string') {
    throw new Error('adapter.id is required');
  }
  if (!adapter.auth || typeof adapter.auth !== 'object') {
    throw new Error(`adapter ${adapter.id}: auth descriptor is required`);
  }
  const allowedKinds = ['oauth2', 'apiKey', 'serviceAccount'];
  if (!allowedKinds.includes(adapter.auth.kind)) {
    throw new Error(
      `adapter ${adapter.id}: auth.kind must be one of ${allowedKinds.join(', ')}`,
    );
  }
  // At least one operation must be implemented or the adapter is useless.
  if (supportedOperations(adapter).length === 0) {
    throw new Error(`adapter ${adapter.id}: must implement at least one operation`);
  }
}

module.exports = {
  OPERATIONS,
  NotSupportedError,
  AdapterError,
  invoke,
  supportedOperations,
  assertValidAdapter,
};
