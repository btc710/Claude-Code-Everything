'use strict';

const fs = require('fs');
const path = require('path');
const { withStore, load } = require('./store');

// Accept an array of gateway-shaped ledger entries (or a path to a JSON file
// containing same) and append them into the billing store. Idempotent on the
// (tenant, ts, slot, tokensIn, tokensOut) tuple so re-running ingest against
// the same gateway export is safe.

function keyOf(e) {
  return [e.tenant, e.ts, e.slot, e.tokensIn, e.tokensOut].join('|');
}

function validateEntry(e) {
  const required = ['ts', 'tenant', 'slot', 'tokensIn', 'tokensOut', 'costUsd'];
  for (const k of required) {
    if (e[k] === undefined || e[k] === null) {
      throw new Error(`ingest: entry missing required field '${k}'`);
    }
  }
  if (typeof e.ts !== 'number') throw new Error('ingest: ts must be a number (ms epoch)');
  if (typeof e.tenant !== 'string' || !e.tenant) throw new Error('ingest: tenant must be a non-empty string');
  if (typeof e.slot !== 'string' || !e.slot) throw new Error('ingest: slot must be a non-empty string');
  if (typeof e.tokensIn !== 'number' || e.tokensIn < 0) throw new Error('ingest: tokensIn must be a non-negative number');
  if (typeof e.tokensOut !== 'number' || e.tokensOut < 0) throw new Error('ingest: tokensOut must be a non-negative number');
  if (typeof e.costUsd !== 'number' || e.costUsd < 0) throw new Error('ingest: costUsd must be a non-negative number');
}

function normalize(e) {
  return {
    ts: e.ts,
    tenant: e.tenant,
    slot: e.slot,
    model: e.model || null,
    tokensIn: e.tokensIn,
    tokensOut: e.tokensOut,
    costUsd: e.costUsd,
    project: e.project == null ? null : e.project,
  };
}

function ingest(billingFile, entries) {
  if (!Array.isArray(entries)) {
    throw new Error('ingest: entries must be an array');
  }
  let inserted = 0, skipped = 0;
  withStore(billingFile, (data) => {
    const seen = new Set(data.entries.map(keyOf));
    for (const raw of entries) {
      validateEntry(raw);
      const e = normalize(raw);
      const k = keyOf(e);
      if (seen.has(k)) { skipped++; continue; }
      seen.add(k);
      data.entries.push(e);
      inserted++;
    }
  });
  return { inserted, skipped, total: load(billingFile).entries.length };
}

function ingestFromFile(billingFile, sourcePath) {
  const abs = path.resolve(sourcePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`ingest: source file not found: ${abs}`);
  }
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  // Accept either a bare array or { entries: [...] } from a /v1/usage dump.
  const entries = Array.isArray(raw) ? raw : Array.isArray(raw.entries) ? raw.entries : null;
  if (!entries) {
    throw new Error('ingest: source must be a JSON array or an object with an "entries" array');
  }
  return ingest(billingFile, entries);
}

module.exports = { ingest, ingestFromFile, keyOf };
