'use strict';

const fs = require('fs');
const path = require('path');

// JSON-file backed triple store. Swap for Postgres/SQLite or a graph DB in
// production by re-implementing load() / save(). All higher-level helpers
// (triples.js, ingest.js, query.js) consume the in-memory shape returned
// by load().
//
// Schema:
//   {
//     version: 1,
//     triples: [
//       { id, subject, predicate, object,
//         tenantId, projectId, confidence, asOf, source }
//     ]
//   }
//
// Why a flat array? It mirrors the layout RDF stores expose: each row is
// independent so it can be filtered, indexed, or sharded by any field.
// Adjacency / inverse-index caches belong in query.js, not on disk.

const EMPTY = () => ({
  version: 1,
  triples: [],
});

function load(file) {
  if (!fs.existsSync(file)) return EMPTY();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object') return EMPTY();
    if (!Array.isArray(raw.triples)) raw.triples = [];
    if (!raw.version) raw.version = 1;
    return raw;
  } catch (e) {
    throw new Error(`graph load failed: ${e.message}`);
  }
}

function save(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function withStore(file, fn) {
  const data = load(file);
  const result = fn(data);
  save(file, data);
  return result;
}

module.exports = { load, save, withStore, EMPTY };
