'use strict';

const fs = require('fs');
const path = require('path');

const lib = require('../src');
const { tmpDir, assert, assertEqual, assertThrows } = require('./helpers');

const tests = [
  ['record() appends with defaults and returns the persisted event', () => {
    const dir = tmpDir();
    const ev = lib.record(dir, {
      tenantId: 'acme',
      actorId: 'u_1',
      action: 'create',
      resource: 'projects',
      resourceId: 'p_1',
      after: { name: 'Pipeline Refresh' },
    });
    assert(ev.id.startsWith('evt_'), 'auto-id assigned');
    assert(ev.ts, 'auto-ts assigned');
    assertEqual(ev.tenantId, 'acme', 'tenantId echoed');
    assertEqual(ev.action, 'create', 'action echoed');
    assertEqual(ev.before, null, 'before defaults to null');
    assert(ev.after && ev.after.name === 'Pipeline Refresh', 'after preserved');
    assertEqual(ev.residency, 'us', 'default region us when no tenant default set');
  }],

  ['record() rejects duplicate id — events are immutable', () => {
    const dir = tmpDir();
    const first = lib.record(dir, {
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_1',
    });
    assertThrows(
      () => lib.record(dir, {
        id: first.id,
        tenantId: 'acme', actorId: 'u_1', action: 'update',
        resource: 'projects', resourceId: 'p_1',
      }),
      /already exists|append-only/,
      'duplicate id throws'
    );
  }],

  ['record() requires the core fields', () => {
    const dir = tmpDir();
    assertThrows(
      () => lib.record(dir, { actorId: 'u', action: 'a', resource: 'r', resourceId: 'rid' }),
      /tenantId/,
      'tenantId required'
    );
    assertThrows(
      () => lib.record(dir, { tenantId: 't', action: 'a', resource: 'r', resourceId: 'rid' }),
      /actorId/,
      'actorId required'
    );
    assertThrows(
      () => lib.record(dir, { tenantId: 't', actorId: 'u', resource: 'r', resourceId: 'rid' }),
      /action/,
      'action required'
    );
  }],

  ['query() filters by actor, action, resource, time window', () => {
    const dir = tmpDir();
    lib.record(dir, {
      ts: '2026-03-01T10:00:00.000Z',
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_1',
    });
    lib.record(dir, {
      ts: '2026-03-15T10:00:00.000Z',
      tenantId: 'acme', actorId: 'u_2', action: 'update',
      resource: 'projects', resourceId: 'p_1',
    });
    lib.record(dir, {
      ts: '2026-04-01T10:00:00.000Z',
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'followups', resourceId: 'f_1',
    });

    assertEqual(lib.query(dir, { tenantId: 'acme' }).length, 3, 'all 3 events');
    assertEqual(lib.query(dir, { tenantId: 'acme', actorId: 'u_1' }).length, 2, 'by actor');
    assertEqual(lib.query(dir, { tenantId: 'acme', action: 'update' }).length, 1, 'by action');
    assertEqual(lib.query(dir, { tenantId: 'acme', resource: 'projects' }).length, 2, 'by resource');
    assertEqual(
      lib.query(dir, { tenantId: 'acme', since: '2026-03-15T00:00:00.000Z' }).length,
      2,
      'since filter'
    );
    assertEqual(
      lib.query(dir, { tenantId: 'acme', until: '2026-03-31T00:00:00.000Z' }).length,
      2,
      'until filter'
    );
  }],

  ['query() requires tenantId — tenant isolation enforced', () => {
    const dir = tmpDir();
    assertThrows(() => lib.query(dir, {}), /tenantId required/, 'tenantId required');
    assertThrows(() => lib.query(dir, { actorId: 'u' }), /tenantId/, 'no cross-tenant scan');
  }],

  ['tenant isolation: one tenant cannot read another tenant rows', () => {
    const dir = tmpDir();
    lib.record(dir, {
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_1',
    });
    lib.record(dir, {
      tenantId: 'beta', actorId: 'u_9', action: 'create',
      resource: 'projects', resourceId: 'p_99',
    });
    const acmeRows = lib.query(dir, { tenantId: 'acme' });
    assertEqual(acmeRows.length, 1, 'acme sees only its row');
    assertEqual(acmeRows[0].resourceId, 'p_1', 'acme sees correct row');

    const betaRows = lib.query(dir, { tenantId: 'beta' });
    assertEqual(betaRows.length, 1, 'beta sees only its row');
    assertEqual(betaRows[0].resourceId, 'p_99', 'beta sees correct row');
  }],

  ['record() writes monthly segments and never rewrites a finished month', () => {
    const dir = tmpDir();
    lib.record(dir, {
      ts: '2026-01-15T12:00:00.000Z',
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_jan',
    });
    lib.record(dir, {
      ts: '2026-02-15T12:00:00.000Z',
      tenantId: 'acme', actorId: 'u_1', action: 'create',
      resource: 'projects', resourceId: 'p_feb',
    });
    lib.record(dir, {
      ts: '2026-02-20T12:00:00.000Z',
      tenantId: 'acme', actorId: 'u_1', action: 'update',
      resource: 'projects', resourceId: 'p_feb',
    });

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort();
    assertEqual(files, ['audit-2026-01.jsonl', 'audit-2026-02.jsonl'], 'monthly segments');

    const jan = fs.readFileSync(path.join(dir, 'audit-2026-01.jsonl'), 'utf8');
    const feb = fs.readFileSync(path.join(dir, 'audit-2026-02.jsonl'), 'utf8');
    assertEqual(jan.trim().split('\n').length, 1, 'jan has 1 line');
    assertEqual(feb.trim().split('\n').length, 2, 'feb has 2 lines');

    // Backfill a january event — should append to existing jan file, not feb,
    // and not rewrite the feb file at all.
    const febStat = fs.statSync(path.join(dir, 'audit-2026-02.jsonl'));
    lib.record(dir, {
      ts: '2026-01-20T12:00:00.000Z',
      tenantId: 'acme', actorId: 'u_1', action: 'backfill',
      resource: 'projects', resourceId: 'p_jan',
    });
    const janAfter = fs.readFileSync(path.join(dir, 'audit-2026-01.jsonl'), 'utf8');
    assertEqual(janAfter.trim().split('\n').length, 2, 'jan now has 2 lines');
    const febStat2 = fs.statSync(path.join(dir, 'audit-2026-02.jsonl'));
    assertEqual(febStat.size, febStat2.size, 'feb file size unchanged after jan backfill');
  }],

  ['monthly segments are append-only on disk (line count strictly increases)', () => {
    const dir = tmpDir();
    const seg = path.join(dir, 'audit-2026-05.jsonl');
    for (let i = 0; i < 5; i++) {
      lib.record(dir, {
        ts: '2026-05-10T12:00:00.000Z',
        tenantId: 'acme', actorId: 'u_1', action: 'create',
        resource: 'projects', resourceId: 'p_' + i,
      });
    }
    const text = fs.readFileSync(seg, 'utf8').trim();
    assertEqual(text.split('\n').length, 5, '5 lines after 5 records');
  }],
];

module.exports = tests;
