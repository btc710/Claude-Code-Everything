'use strict';

const lib = require('../src');
const { tmpStoreFile, assert, assertEqual } = require('./helpers');

const tests = [
  ['openFollowup attaches to a project and sets askedOn/unblockBy', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'P' });
    const f = lib.openFollowup(file, { projectId: p.id, topic: 'Need owner list', owner: 'Blake', unblockInDays: 5 });
    assertEqual(f.status, 'open', 'status');
    assert(/\d{4}-\d{2}-\d{2}/.test(f.askedOn), 'askedOn ISO day');
    assert(f.unblockBy > f.askedOn, 'unblockBy after askedOn');
  }],
  ['resolveFollowup closes and records resolvedWith', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'P' });
    const f = lib.openFollowup(file, { projectId: p.id, topic: 'X' });
    const r = lib.resolveFollowup(file, f.id, 'Blake confirmed list');
    assertEqual(r.status, 'closed', 'closed');
    assertEqual(r.resolvedWith, 'Blake confirmed list', 'reason');
  }],
  ['stalefollowups returns only open items past their unblockBy date', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'P' });
    const f = lib.openFollowup(file, { projectId: p.id, topic: 'Old', unblockInDays: 1 });
    // Force the unblockBy into the past
    const { withStore } = require('../src/store');
    withStore(file, data => {
      data.followups.find(x => x.id === f.id).unblockBy = '2000-01-01';
    });
    const stale = lib.stalefollowups(file);
    assertEqual(stale.length, 1, 'one stale');
    assertEqual(stale[0].id, f.id, 'right one');
  }],
];

module.exports = tests;
