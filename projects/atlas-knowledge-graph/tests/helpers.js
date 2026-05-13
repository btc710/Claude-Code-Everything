'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-graph-test-'));
}

function tmpGraphFile() {
  return path.join(tmpDir(), 'graph.json');
}

// Writes a JSON ledger to a temp file. Shape matches what
// atlas-project-ledger persists.
function writeLedger(data) {
  const file = path.join(tmpDir(), 'ledger.json');
  const payload = {
    version: 1,
    projects: [],
    backtests: [],
    followups: [],
    reviews: [],
    ...data,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function assert(cond, label) {
  if (!cond) throw new Error(`assertion failed: ${label}`);
}
function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

// Fixture builder for a complete project + backtest + closed-followup tree
// that exercises every predicate the ingest path can emit.
function fixtureLedger() {
  return {
    projects: [{
      id: 'proj_acme1',
      tenant: 'acme',
      name: 'HubSpot Meet Email automation',
      slug: 'hubspot-meet-email',
      status: 'gated',
      scope: 'Send the recap email after a Meet call completes. Use HubSpot deal owner as CC. Latency under 30 seconds.',
      estimate: null,
      createdAt: '2026-04-01T10:00:00.000Z',
      updatedAt: '2026-04-02T10:00:00.000Z',
    }],
    backtests: [{
      id: 'bt_acme1',
      projectId: 'proj_acme1',
      runAt: '2026-04-02T09:00:00.000Z',
      planHash: 'aaaabbbbccccdddd',
      pass: true,
      summary: {
        mean: 812, min: 762, max: 912,
        dimensions: { feasibility: 82, value: 78, risk: 75, fit: 81 },
        weakestDimension: { name: 'risk', avg: 75 },
      },
      results: [
        { model: 'm1', concerns: ['Deal owner CC may leak external email'] },
        { model: 'm2', openConcerns: ['SLA depends on Meet webhook reliability'] },
      ],
    }],
    followups: [
      {
        id: 'fu_owner',
        projectId: 'proj_acme1',
        topic: 'CC team or static list',
        owner: 'Blake',
        askedOn: '2026-04-01',
        unblockBy: '2026-04-04',
        status: 'closed',
        resolvedWith: 'Pulled from HubSpot deal owners with a static fallback',
      },
      {
        id: 'fu_open',
        projectId: 'proj_acme1',
        topic: 'Retention policy for recap emails',
        owner: null,
        askedOn: '2026-04-02',
        unblockBy: '2026-04-09',
        status: 'open',
        resolvedWith: null,
      },
    ],
  };
}

module.exports = { tmpDir, tmpGraphFile, writeLedger, assert, assertEqual, fixtureLedger };
