'use strict';

const fs = require('fs');
const path = require('path');

const segments = require('../src/segments');
const { segmentKey } = require('../src/ids');
const { tmpDir, assert, assertEqual, assertThrows } = require('./helpers');

const tests = [
  ['segmentKey returns audit-YYYY-MM.jsonl for a given iso', () => {
    assertEqual(segmentKey('2026-01-15T10:00:00.000Z'), 'audit-2026-01.jsonl', 'jan');
    assertEqual(segmentKey('2026-12-31T23:59:59.000Z'), 'audit-2026-12.jsonl', 'dec');
    assertEqual(segmentKey('2027-02-01T00:00:00.000Z'), 'audit-2027-02.jsonl', 'feb');
  }],

  ['segmentKey throws on an invalid iso', () => {
    assertThrows(() => segmentKey('not-a-date'), /invalid ts/, 'invalid iso');
  }],

  ['append() refuses duplicate ids across segments', () => {
    const dir = tmpDir();
    segments.append(dir, {
      id: 'evt_dup', ts: '2026-01-15T10:00:00.000Z',
      tenantId: 'acme', actorId: 'u', action: 'a', resource: 'r', resourceId: 'rid',
    });
    // Same id, different month — still must throw.
    assertThrows(
      () => segments.append(dir, {
        id: 'evt_dup', ts: '2026-03-15T10:00:00.000Z',
        tenantId: 'acme', actorId: 'u', action: 'a', resource: 'r', resourceId: 'rid',
      }),
      /already exists|append-only/,
      'duplicate id across segments rejected'
    );
  }],

  ['readAll returns events from all segments in chronological filename order', () => {
    const dir = tmpDir();
    segments.append(dir, {
      id: 'evt_b', ts: '2026-03-01T10:00:00.000Z',
      tenantId: 'acme', actorId: 'u', action: 'a', resource: 'r', resourceId: 'rid',
    });
    segments.append(dir, {
      id: 'evt_a', ts: '2026-01-01T10:00:00.000Z',
      tenantId: 'acme', actorId: 'u', action: 'a', resource: 'r', resourceId: 'rid',
    });
    segments.append(dir, {
      id: 'evt_c', ts: '2026-02-01T10:00:00.000Z',
      tenantId: 'acme', actorId: 'u', action: 'a', resource: 'r', resourceId: 'rid',
    });

    const all = segments.readAll(dir);
    assertEqual(all.map(e => e.id), ['evt_a', 'evt_c', 'evt_b'], 'segment-name order');
  }],

  ['readAll on an empty/missing dir is []', () => {
    const dir = tmpDir();
    // remove the dir we just created — readAll must tolerate missing
    fs.rmdirSync(dir);
    assertEqual(segments.readAll(dir), [], 'missing dir returns []');
  }],

  ['append throws on missing id or ts', () => {
    const dir = tmpDir();
    assertThrows(
      () => segments.append(dir, { ts: '2026-01-01T00:00:00.000Z' }),
      /id required/,
      'id required'
    );
    assertThrows(
      () => segments.append(dir, { id: 'evt_1' }),
      /ts required/,
      'ts required'
    );
  }],

  ['append creates the directory if it does not exist', () => {
    const dir = tmpDir();
    fs.rmdirSync(dir);
    segments.append(dir, {
      id: 'evt_1', ts: '2026-01-01T00:00:00.000Z',
      tenantId: 'acme', actorId: 'u', action: 'a', resource: 'r', resourceId: 'rid',
    });
    assert(fs.existsSync(path.join(dir, 'audit-2026-01.jsonl')), 'segment file created');
  }],
];

module.exports = tests;
