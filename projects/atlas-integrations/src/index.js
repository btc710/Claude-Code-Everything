'use strict';

// Public entry-point. Re-exports the registry, the connection store, and
// the adapter contract so callers only need one require.

const adapter = require('./adapter');
const registry = require('./registry');
const connections = require('./connections');

module.exports = {
  // Adapter contract
  OPERATIONS: adapter.OPERATIONS,
  NotSupportedError: adapter.NotSupportedError,
  AdapterError: adapter.AdapterError,
  invoke: adapter.invoke,
  supportedOperations: adapter.supportedOperations,

  // Registry
  ADAPTERS: registry.ADAPTERS,
  listAdapters: registry.listAdapters,
  getAdapter: registry.getAdapter,
  getAdapterOrThrow: registry.getAdapterOrThrow,
  describeAdapter: registry.describe,
  operationMatrix: registry.operationMatrix,
  invokeAdapter: registry.invokeAdapter,

  // Connection store
  connections,
};
