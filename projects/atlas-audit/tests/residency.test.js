'use strict';

const lib = require('../src');
const { tmpDir, assert, assertEqual, assertThrows } = require('./helpers');

const tests = [
  ['tenant default region is applied to new events', () => {
    const dir = tmpDir();
    lib.setTenantRegion(dir, 'acme-eu', 'eu');
    const ev = lib.record(dir, {
      tenantId: 'acme-eu', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_1',
    });
    assertEqual(ev.residency, 'eu', 'default region honored');
  }],

  ['per-event override beats the tenant default', () => {
    const dir = tmpDir();
    lib.setTenantRegion(dir, 'acme-eu', 'eu');
    const ev = lib.record(dir, {
      tenantId: 'acme-eu', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_2', residency: 'us',
    });
    assertEqual(ev.residency, 'us', 'override applied');
  }],

  ['fallback region is us when no default and no override', () => {
    const dir = tmpDir();
    const ev = lib.record(dir, {
      tenantId: 'no-default', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_3',
    });
    assertEqual(ev.residency, 'us', 'fallback us');
  }],

  ['setTenantRegion rejects unknown regions', () => {
    const dir = tmpDir();
    assertThrows(
      () => lib.setTenantRegion(dir, 'acme', 'antarctica'),
      /invalid residency region/,
      'invalid region rejected'
    );
  }],

  ['record() rejects an invalid per-event region', () => {
    const dir = tmpDir();
    assertThrows(
      () => lib.record(dir, {
        tenantId: 'acme', actorId: 'u_1', action: 'create',
        resource: 'projects', resourceId: 'p_1', residency: 'mars',
      }),
      /invalid residency region/,
      'invalid override rejected'
    );
  }],

  ['query filters by region and excludes other regions', () => {
    const dir = tmpDir();
    lib.record(dir, {
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_us', residency: 'us',
    });
    lib.record(dir, {
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_eu', residency: 'eu',
    });
    lib.record(dir, {
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_apac', residency: 'apac',
    });

    const eu = lib.query(dir, { tenantId: 'acme', residency: 'eu' });
    assertEqual(eu.length, 1, 'eu count');
    assertEqual(eu[0].resourceId, 'p_eu', 'eu row');

    const us = lib.query(dir, { tenantId: 'acme', residency: 'us' });
    assertEqual(us.length, 1, 'us count');
    assertEqual(us[0].residency, 'us', 'us row');

    const apac = lib.query(dir, { tenantId: 'acme', residency: 'apac' });
    assertEqual(apac.length, 1, 'apac count');

    // Sanity: no region filter returns all three
    assertEqual(lib.query(dir, { tenantId: 'acme' }).length, 3, 'no filter returns all');
  }],

  ['getTenantRegion returns null for unknown tenant', () => {
    const dir = tmpDir();
    assert(lib.getTenantRegion(dir, 'unknown') === null, 'null for unknown');
    lib.setTenantRegion(dir, 'unknown', 'apac');
    assertEqual(lib.getTenantRegion(dir, 'unknown'), 'apac', 'now apac');
  }],
];

module.exports = tests;
