'use strict';

const lib = require('../src');
const { tmpStoreFile, assert, assertEqual } = require('./helpers');

function passingSummary() {
  return {
    models: 12, ok: 12, failed: 0,
    mean: 812, min: 762, max: 912,
    dimensions: { a: 82, b: 78, c: 75, d: 81 },
    weakestDimension: { name: 'c', avg: 75 },
  };
}
function failingSummary() {
  return {
    models: 12, ok: 12, failed: 0,
    mean: 740, min: 720, max: 820,
    dimensions: { a: 76, b: 75, c: 70, d: 78 },
    weakestDimension: { name: 'c', avg: 70 },
  };
}

const tests = [
  ['recordBacktest stores a run and flips project status to gated on pass', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'Pipeline' });
    const r = lib.recordBacktest(file, { projectId: p.id, plan: 'plan v1', summary: passingSummary() });
    assertEqual(r.pass, true, 'pass');
    assert(r.planHash && r.planHash.length === 16, 'plan hash');
    const after = lib.getProject(file, p.id);
    assertEqual(after.status, 'gated', 'status flipped');
  }],
  ['failing summary leaves project in draft', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'Pipeline' });
    const r = lib.recordBacktest(file, { projectId: p.id, plan: 'plan v1', summary: failingSummary() });
    assertEqual(r.pass, false, 'fail');
    assertEqual(lib.getProject(file, p.id).status, 'draft', 'still draft');
  }],
  ['latestBacktest returns the most recent run', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'Pipeline' });
    lib.recordBacktest(file, { projectId: p.id, plan: 'v1', summary: failingSummary() });
    lib.recordBacktest(file, { projectId: p.id, plan: 'v2', summary: passingSummary() });
    const latest = lib.latestBacktest(file, p.id);
    assertEqual(latest.pass, true, 'latest is passing v2');
  }],
  ['validatePass rejects when any dimension averages below 700', () => {
    const s = passingSummary();
    s.dimensions.c = 65;
    assertEqual(lib.validatePass(s), false, 'low dim fails');
  }],
];

module.exports = tests;
