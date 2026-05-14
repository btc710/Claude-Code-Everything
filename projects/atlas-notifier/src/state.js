'use strict';

// Sidecar state file. Tracks which (followup|review) ids were notified on
// which UTC day so the same item isn't paged twice in 24h, even if the
// scheduler runs every five minutes.
//
// Shape:
//   {
//     version: 1,
//     notified: {
//       "<day>:<id>": { sentAt: <iso>, sink: "slack" },
//       ...
//     }
//   }
//
// The compound key (`day:id`) means yesterday's notification doesn't
// suppress today's — important for stale followups that stay stale.

const fs = require('fs');
const path = require('path');

const EMPTY = () => ({ version: 1, notified: {} });

function defaultStateFile(ledgerFile) {
  const dir = path.dirname(ledgerFile);
  return path.join(dir, 'notifier-state.json');
}

function load(stateFile) {
  if (!fs.existsSync(stateFile)) return EMPTY();
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (e) {
    throw new Error(`notifier state load failed: ${e.message}`);
  }
}

function save(stateFile, data) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const tmp = stateFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, stateFile);
}

function markKey(day, id) {
  return `${day}:${id}`;
}

function wasNotified(state, day, id) {
  return Boolean(state.notified[markKey(day, id)]);
}

function markNotified(state, day, id, sink) {
  state.notified[markKey(day, id)] = {
    sentAt: new Date().toISOString(),
    sink,
  };
}

module.exports = {
  load, save, defaultStateFile, wasNotified, markNotified, markKey, EMPTY,
};
