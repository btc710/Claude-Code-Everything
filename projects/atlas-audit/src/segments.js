'use strict';

const fs = require('fs');
const path = require('path');

const { segmentKey } = require('./ids');

// JSONL segment store. One file per UTC month: `audit-YYYY-MM.jsonl`.
// Each line is exactly one JSON event. Files are append-only — once a month
// rolls over, we never reopen its segment for writing. The id index below
// is what enforces immutability: a record() with an existing id throws.
//
// Swap for S3 with Object Lock / GCS with bucket lock in production. Call
// sites only need append() and readAll().

function segmentPath(dir, iso) {
  return path.join(dir, segmentKey(iso));
}

function listSegments(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^audit-\d{4}-\d{2}\.jsonl$/.test(f))
    .sort();
}

function readSegment(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  if (!text) return [];
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch (e) {
      // Corrupt line: surface with context. A real WORM store would prevent
      // partial writes; for the JSON sketch we fail loudly so it's noticed.
      throw new Error(`segment ${path.basename(file)} line ${i + 1} parse failed: ${e.message}`);
    }
  }
  return out;
}

// Read every event in chronological segment order across the directory.
function readAll(dir) {
  const out = [];
  for (const name of listSegments(dir)) {
    for (const ev of readSegment(path.join(dir, name))) out.push(ev);
  }
  return out;
}

// Build the id->true index across every segment so record() can refuse
// duplicates. O(N) and re-read each call — fine for a JSON sketch. A
// production store keeps this in a btree / unique-index on the DB side.
function buildIdIndex(dir) {
  const seen = new Set();
  for (const ev of readAll(dir)) seen.add(ev.id);
  return seen;
}

// Append one event. Throws if the id already exists anywhere in the log,
// guaranteeing the "events are immutable" contract.
function append(dir, ev) {
  if (!ev || typeof ev !== 'object') throw new Error('append: event must be an object');
  if (!ev.id) throw new Error('append: event.id required');
  if (!ev.ts) throw new Error('append: event.ts required');

  fs.mkdirSync(dir, { recursive: true });

  const idx = buildIdIndex(dir);
  if (idx.has(ev.id)) {
    throw new Error(`append: event id ${ev.id} already exists — audit log is append-only`);
  }

  const file = segmentPath(dir, ev.ts);
  fs.appendFileSync(file, JSON.stringify(ev) + '\n');
  return ev;
}

module.exports = {
  segmentPath,
  listSegments,
  readSegment,
  readAll,
  buildIdIndex,
  append,
};
