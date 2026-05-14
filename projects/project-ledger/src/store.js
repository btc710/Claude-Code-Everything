'use strict';

const fs = require('fs');
const path = require('path');

// JSON-file store. Swap for Postgres/SQLite in production by re-implementing
// load() and save() against the chosen DB. The rest of the package consumes
// the in-memory shape returned by load().

const EMPTY = () => ({
  version: 1,
  projects: [],   // [{ id, tenant, name, slug, status, scope, estimate, createdAt, updatedAt }]
  backtests: [],  // [{ id, projectId, pass, summary, results, runAt, planHash }]
  followups: [],  // [{ id, projectId, topic, owner, askedOn, unblockBy, status, resolvedWith }]
  reviews: [],    // [{ id, projectId, kind: '30d'|'90d'|'180d', dueAt, status, findings }]
});

function load(file) {
  if (!fs.existsSync(file)) return EMPTY();
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`store load failed: ${e.message}`);
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
