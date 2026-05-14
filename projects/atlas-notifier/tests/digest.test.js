'use strict';

const { buildDigest } = require('../src/digest');
const { assert, assertEqual } = require('./helpers');

const tests = [
  ['buildDigest renders both sections, falls back to projectId when project missing', () => {
    const projects = new Map([
      ['proj_1', { id: 'proj_1', tenant: 'acme', name: 'HubSpot rollout' }],
    ]);
    const out = buildDigest({
      tenant: 'acme',
      owner: 'Blake',
      followups: [
        { id: 'fu_1', projectId: 'proj_1', topic: 'Need owner list', askedOn: '2026-05-10', unblockBy: '2026-05-13' },
        { id: 'fu_2', projectId: 'proj_404', topic: 'Orphan', askedOn: '2026-05-10', unblockBy: '2026-05-13' },
      ],
      reviews: [
        { id: 'rv_1', projectId: 'proj_1', kind: '30d', dueAt: '2026-06-10' },
      ],
      projects,
    });
    assert(out.subject.includes('acme'), 'tenant in subject');
    assert(out.subject.includes('Blake'), 'owner in subject');
    assert(out.subject.includes('2 stale'), 'two stale in subject');
    assert(out.body.includes('HubSpot rollout'), 'project name rendered');
    assert(out.body.includes('proj_404'), 'orphan falls back to projectId');
  }],

  ['buildDigest subject lists correct counts and body tags items', () => {
    const projects = new Map([['p', { id: 'p', tenant: 'acme', name: 'P' }]]);
    const out = buildDigest({
      tenant: 'acme', owner: 'Blake',
      followups: [
        { id: 'a', projectId: 'p', topic: 'a', askedOn: '2026-05-10', unblockBy: '2026-05-13' },
        { id: 'b', projectId: 'p', topic: 'b', askedOn: '2026-05-10', unblockBy: '2026-05-13' },
      ],
      reviews: [{ id: 'r', projectId: 'p', kind: '30d', dueAt: '2026-06-10' }],
      projects,
    });
    assert(/2 stale/.test(out.subject), 'two stale in subject');
    assert(/1 reviews/.test(out.subject), 'one review in subject');
    assert(out.body.includes('[followup]'), 'followup tag in body');
    assert(out.body.includes('[review/30d]'), 'review tag in body');
  }],

  ['buildDigest omits owner suffix when null', () => {
    const out = buildDigest({
      tenant: 'beta', owner: null,
      followups: [], reviews: [], projects: new Map(),
    });
    assert(!/for null/.test(out.subject), 'no "for null"');
    assert(!/for $/.test(out.subject), 'no trailing for');
  }],
];

module.exports = tests;
