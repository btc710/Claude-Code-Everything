'use strict';

const fs = require('fs');
const path = require('path');

const lib = require('../src');
const { tmpDir, assert, assertEqual, assertThrows } = require('./helpers');

const tests = [
  ['redactResource() writes a tombstone event and does NOT delete prior events', () => {
    const dir = tmpDir();
    lib.record(dir, {
      ts: '2026-03-01T10:00:00.000Z',
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_1',
      after: { name: 'PII Subject Project', owner: 'Jane Doe' },
    });
    lib.record(dir, {
      ts: '2026-03-15T10:00:00.000Z',
      tenantId: 'acme', actorId: 'u_2', action: 'update',
      resource: 'projects', resourceId: 'p_1',
      before: { name: 'PII Subject Project' },
      after: { name: 'PII Subject Project v2' },
    });

    const tomb = lib.redactResource(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'dpo_1', reason: 'GDPR Article 17 request',
    });
    assertEqual(tomb.action, 'redact', 'redact action');
    assert(tomb.meta && tomb.meta.kind === 'redact', 'meta.kind redact');

    // The underlying segment must STILL contain the original payload, even
    // though queries will not return it. SOC2 compliance requires the
    // append-only invariant be preserved on disk.
    const seg = path.join(dir, 'audit-2026-03.jsonl');
    const text = fs.readFileSync(seg, 'utf8');
    assert(text.includes('Jane Doe'), 'underlying log still contains original payload');
    assert(text.includes('PII Subject Project v2'), 'underlying log still contains updates');
  }],

  ['query() scrubs payload of redacted resource but leaves envelope', () => {
    const dir = tmpDir();
    lib.record(dir, {
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_1',
      after: { name: 'PII Subject', email: '[email protected]' },
    });
    lib.redactResource(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'dpo_1',
    });

    const rows = lib.query(dir, { tenantId: 'acme', resource: 'projects' });
    // 2 rows: the original create (now scrubbed) + the redact tombstone
    assertEqual(rows.length, 2, '2 rows after redact');

    const created = rows.find(r => r.action === 'create');
    assert(created, 'create row present');
    assert(created.redacted === true, 'create row marked redacted');
    assertEqual(created.after, lib.REDACTED_VALUE, 'after scrubbed');
    assert(created.actorId === 'u_1', 'envelope actorId preserved');
    assert(created.ts, 'envelope ts preserved');

    const redact = rows.find(r => r.action === 'redact');
    assert(redact, 'redact row present');
    // The redact event itself is not scrubbed — auditors need to see who/when.
    assert(!redact.redacted, 'redact event itself not marked redacted');
  }],

  ['redaction only affects the specific (resource, resourceId) — siblings untouched', () => {
    const dir = tmpDir();
    lib.record(dir, {
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_1',
      after: { name: 'Alice' },
    });
    lib.record(dir, {
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_2',
      after: { name: 'Bob' },
    });
    lib.redactResource(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'dpo_1',
    });

    const rows = lib.query(dir, { tenantId: 'acme', resource: 'projects' });
    const p1 = rows.find(r => r.resourceId === 'p_1' && r.action === 'create');
    const p2 = rows.find(r => r.resourceId === 'p_2' && r.action === 'create');
    assert(p1.redacted === true, 'p_1 scrubbed');
    assert(!p2.redacted, 'p_2 not scrubbed');
    assertEqual(p2.after, { name: 'Bob' }, 'p_2 payload intact');
  }],

  ['exportResource() returns full history for a single resource', () => {
    const dir = tmpDir();
    lib.record(dir, {
      ts: '2026-03-01T10:00:00.000Z',
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_1',
      after: { name: 'Project Alpha' },
    });
    lib.record(dir, {
      ts: '2026-03-10T10:00:00.000Z',
      tenantId: 'acme', actorId: 'u_2', action: 'update',
      resource: 'projects', resourceId: 'p_1',
      after: { name: 'Project Beta' },
    });
    // Unrelated row in another resource that should not appear.
    lib.record(dir, {
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'followups', resourceId: 'f_1',
    });

    const out = lib.exportResource(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
    });
    assertEqual(out.tenantId, 'acme', 'tenant echoed');
    assertEqual(out.resource, 'projects', 'resource echoed');
    assertEqual(out.resourceId, 'p_1', 'resourceId echoed');
    assertEqual(out.redacted, null, 'not redacted');
    assertEqual(out.history.length, 2, '2 events in history');
    assertEqual(out.history[0].action, 'create', 'first is create');
    assertEqual(out.history[1].action, 'update', 'second is update');
  }],

  ['exportResource() after redaction returns redaction-aware history minus the payload', () => {
    const dir = tmpDir();
    lib.record(dir, {
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_1',
      after: { name: 'PII Subject' },
    });
    const tomb = lib.redactResource(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
      actorId: 'dpo_1', reason: 'GDPR Article 17',
    });
    const out = lib.exportResource(dir, {
      tenantId: 'acme', resource: 'projects', resourceId: 'p_1',
    });
    assert(out.redacted, 'redacted summary populated');
    assertEqual(out.redacted.by, 'dpo_1', 'redacted by DPO');
    assertEqual(out.redacted.eventId, tomb.id, 'redacted eventId matches');

    const created = out.history.find(r => r.action === 'create');
    assert(created.redacted === true, 'create row marked redacted in export');
    assertEqual(created.after, lib.REDACTED_VALUE, 'after scrubbed in export');
    // Envelope preserved
    assertEqual(created.actorId, 'u_1', 'actorId preserved');
  }],

  ['redactResource requires the lookup triplet', () => {
    const dir = tmpDir();
    assertThrows(
      () => lib.redactResource(dir, { resource: 'projects', resourceId: 'p_1' }),
      /tenantId/,
      'tenantId required'
    );
    assertThrows(
      () => lib.redactResource(dir, { tenantId: 'acme', resourceId: 'p_1' }),
      /resource/,
      'resource required'
    );
    assertThrows(
      () => lib.redactResource(dir, { tenantId: 'acme', resource: 'projects' }),
      /resourceId/,
      'resourceId required'
    );
  }],
];

module.exports = tests;
