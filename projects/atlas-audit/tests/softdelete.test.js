'use strict';

const lib = require('../src');
const { tmpDir, assert, assertEqual, assertThrows } = require('./helpers');

const tests = [
  ['archive() writes an archive event and isArchived flips to true', () => {
    const dir = tmpDir();
    lib.record(dir, {
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_1',
    });
    assertEqual(
      lib.isArchived(dir, 'acme', 'projects', 'p_1'),
      false,
      'not archived initially'
    );

    const ev = lib.archive(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'admin_1', reason: 'project shipped',
    });
    assertEqual(ev.action, 'archive', 'archive action');
    assert(ev.meta && ev.meta.kind === 'archive', 'meta.kind archive');
    assert(ev.after && ev.after.archived === true, 'after.archived true');

    assertEqual(
      lib.isArchived(dir, 'acme', 'projects', 'p_1'),
      true,
      'archived now'
    );
  }],

  ['unarchive flips isArchived back to false', () => {
    const dir = tmpDir();
    lib.archive(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'admin_1',
    });
    assertEqual(
      lib.isArchived(dir, 'acme', 'projects', 'p_1'),
      true,
      'archived'
    );
    lib.unarchive(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'admin_2', reason: 'reopened',
    });
    assertEqual(
      lib.isArchived(dir, 'acme', 'projects', 'p_1'),
      false,
      'unarchived'
    );
  }],

  ['latest archive/unarchive event wins regardless of order in log', () => {
    const dir = tmpDir();
    lib.archive(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'admin_1',
    });
    lib.unarchive(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'admin_2',
    });
    lib.archive(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'admin_3',
    });
    assertEqual(
      lib.isArchived(dir, 'acme', 'projects', 'p_1'),
      true,
      'latest archive wins'
    );
  }],

  ['archive is scoped per-tenant: another tenant cannot flip our flag', () => {
    const dir = tmpDir();
    lib.archive(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'admin_acme',
    });
    // Same resource path, different tenant — must not affect acme's state.
    lib.unarchive(dir, {
      tenantId: 'beta', resource: 'projects', resourceId: 'p_1',
      actorId: 'admin_beta',
    });
    assertEqual(
      lib.isArchived(dir, 'acme', 'projects', 'p_1'),
      true,
      'acme still archived'
    );
    assertEqual(
      lib.isArchived(dir, 'beta', 'projects', 'p_1'),
      false,
      'beta not archived'
    );
  }],

  ['isArchived survives redaction — operational state visible even when payload scrubbed', () => {
    const dir = tmpDir();
    lib.archive(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'admin_1',
    });
    lib.redactResource(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'dpo_1',
    });
    assertEqual(
      lib.isArchived(dir, 'acme', 'projects', 'p_1'),
      true,
      'still archived even after redaction'
    );
  }],

  ['archive requires the lookup triplet', () => {
    const dir = tmpDir();
    assertThrows(
      () => lib.archive(dir, { resource: 'projects', resourceId: 'p_1' }),
      /tenantId/,
      'tenantId required'
    );
    assertThrows(
      () => lib.archive(dir, { tenantId: 'acme', resourceId: 'p_1' }),
      /resource/,
      'resource required'
    );
  }],
];

module.exports = tests;
