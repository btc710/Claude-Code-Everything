'use strict';

// Adapter registry. Single place that knows which adapters ship with
// atlas-integrations. The CLI and the rest of the Atlas stack go through
// this module — nothing else should require adapters directly.

const {
  OPERATIONS,
  NotSupportedError,
  AdapterError,
  invoke,
  supportedOperations,
  assertValidAdapter,
} = require('./adapter');

const hubspot = require('./adapters/hubspot');
const google = require('./adapters/google');
const salesforce = require('./adapters/salesforce');
const microsoft365 = require('./adapters/microsoft365');
const slack = require('./adapters/slack');

const ADAPTERS = [hubspot, google, salesforce, microsoft365, slack];

// Validate at load time so the registry can't silently start serving a
// broken adapter.
for (const a of ADAPTERS) assertValidAdapter(a);

const BY_ID = new Map(ADAPTERS.map((a) => [a.id, a]));

function listAdapters() {
  return ADAPTERS.map(describe);
}

function describe(adapter) {
  return {
    id: adapter.id,
    authKind: adapter.auth.kind,
    scopes: (adapter.auth.metadata && adapter.auth.metadata.scopes) || [],
    operations: supportedOperations(adapter),
  };
}

function getAdapter(id) {
  return BY_ID.get(id) || null;
}

function getAdapterOrThrow(id) {
  const a = BY_ID.get(id);
  if (!a) throw new Error(`unknown adapter: ${id}`);
  return a;
}

// Convenience: full operation matrix as { [adapterId]: { [op]: bool } }.
function operationMatrix() {
  const matrix = {};
  for (const a of ADAPTERS) {
    matrix[a.id] = {};
    for (const op of OPERATIONS) matrix[a.id][op] = typeof a[op] === 'function';
  }
  return matrix;
}

async function invokeAdapter(id, op, ctx, args) {
  const adapter = getAdapterOrThrow(id);
  return invoke(adapter, op, ctx, args);
}

module.exports = {
  ADAPTERS,
  OPERATIONS,
  listAdapters,
  getAdapter,
  getAdapterOrThrow,
  describe,
  operationMatrix,
  invokeAdapter,
  NotSupportedError,
  AdapterError,
};
