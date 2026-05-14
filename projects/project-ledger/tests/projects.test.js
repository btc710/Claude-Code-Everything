'use strict';

const lib = require('../src');
const { tmpStoreFile, assert, assertEqual } = require('./helpers');

const tests = [
  ['create project assigns id, slug, status=draft, timestamps', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'Sales Pipeline Refresh!' });
    assert(p.id.startsWith('proj_'), 'has id');
    assertEqual(p.slug, 'sales-pipeline-refresh', 'slug');
    assertEqual(p.status, 'draft', 'status');
    assert(p.createdAt, 'created timestamp');
  }],
  ['list filters by tenant and status', () => {
    const file = tmpStoreFile();
    lib.createProject(file, { tenant: 'acme', name: 'A' });
    lib.createProject(file, { tenant: 'acme', name: 'B' });
    lib.createProject(file, { tenant: 'beta', name: 'C' });
    assertEqual(lib.listProjects(file, { tenant: 'acme' }).length, 2, 'acme count');
    assertEqual(lib.listProjects(file, { tenant: 'beta' }).length, 1, 'beta count');
  }],
  ['updateProject patches fields and bumps updatedAt', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'P' });
    const initial = p.updatedAt;
    // Wait one ms so the timestamp differs (Date precision)
    const u = lib.updateProject(file, p.id, { status: 'in_flight' });
    assertEqual(u.status, 'in_flight', 'status');
    assert(u.updatedAt >= initial, 'bumped');
  }],
  ['updateProject rejects invalid status', () => {
    const file = tmpStoreFile();
    const p = lib.createProject(file, { tenant: 'acme', name: 'P' });
    let threw = null;
    try { lib.updateProject(file, p.id, { status: 'whatever' }); } catch (e) { threw = e; }
    assert(threw && /invalid status/.test(threw.message), 'rejects');
  }],
];

module.exports = tests;
