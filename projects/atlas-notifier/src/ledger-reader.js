'use strict';

// Thin wrapper over the atlas-project-ledger package. Re-exports the two
// query functions the notifier cares about, and adds a small helper that
// joins a followup/review back to its project so we can read .tenant /
// .owner without making the caller walk the store themselves.

const ledger = require('../../project-ledger/src');

function loadProjects(file) {
  return ledger.store.load(file).projects;
}

function stalefollowups(file, asOf = new Date()) {
  return ledger.stalefollowups(file, asOf);
}

function dueReviews(file, asOf = new Date(), windowDays = 7) {
  return ledger.dueReviews(file, asOf, windowDays);
}

// Build a { projectId -> project } map once per scan so we don't scan
// the projects collection for every followup.
function projectIndex(file) {
  const out = new Map();
  for (const p of loadProjects(file)) out.set(p.id, p);
  return out;
}

module.exports = { loadProjects, stalefollowups, dueReviews, projectIndex };
