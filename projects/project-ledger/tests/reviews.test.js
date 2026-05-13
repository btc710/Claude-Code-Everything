'use strict';

const lib = require('../src');
const { tmpStoreFile, assert, assertEqual } = require('./helpers');

const tests = [
  ['scheduleReviews creates three reviews at 30/90/180 day offsets', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'P' });
    const r = lib.scheduleReviews(file, p.id, new Date('2026-01-01T00:00:00Z'));
    assertEqual(r.length, 3, 'three reviews');
    assertEqual(r[0].dueAt, '2026-01-31', '30d date');
    assertEqual(r[1].dueAt, '2026-04-01', '90d date');
    assertEqual(r[2].dueAt, '2026-06-30', '180d date');
    assert(r.every(x => x.status === 'pending'), 'all pending');
  }],
  ['scheduleReviews is idempotent — calling twice does not duplicate', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'P' });
    lib.scheduleReviews(file, p.id, new Date('2026-01-01'));
    lib.scheduleReviews(file, p.id, new Date('2026-01-01'));
    assertEqual(lib.listReviews(file, { projectId: p.id }).length, 3, 'still three');
  }],
  ['completeReview marks status=done and records findings', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'P' });
    const [r30] = lib.scheduleReviews(file, p.id);
    const done = lib.completeReview(file, r30.id, 'Adoption healthy; one drift signal');
    assertEqual(done.status, 'done', 'done');
    assertEqual(done.findings, 'Adoption healthy; one drift signal', 'findings');
  }],
  ['dueReviews returns pending reviews within the next N days', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'P' });
    // Use yesterday as accepted so the 30d review falls inside the window
    const accepted = new Date();
    accepted.setUTCDate(accepted.getUTCDate() - 5);
    lib.scheduleReviews(file, p.id, accepted);
    // 30d review now due in ~25 days; window=30 should include it; window=7 should not
    const wide = lib.dueReviews(file, new Date(), 30);
    const narrow = lib.dueReviews(file, new Date(), 7);
    assert(wide.find(r => r.kind === '30d'), '30d in wide window');
    assert(!narrow.find(r => r.kind === '30d'), '30d not in narrow window');
  }],
];

module.exports = tests;
