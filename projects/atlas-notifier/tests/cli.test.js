'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const ledger = require('../../project-ledger/src');
const { tmpLedgerFile, assert, assertEqual } = require('./helpers');

const CLI = path.join(__dirname, '..', 'src', 'cli.js');

function run(args, env = {}) {
  return execFileSync('node', [CLI, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

const tests = [
  ['cli help prints usage', () => {
    const out = run(['help']);
    assert(out.includes('atlas-notifier'), 'shows tool name');
    assert(out.includes('scan'), 'mentions scan');
    assert(out.includes('dispatch'), 'mentions dispatch');
  }],
  ['cli scan emits empty array on empty ledger', () => {
    const file = tmpLedgerFile();
    const out = run(['scan', '--ledger', file]);
    const parsed = JSON.parse(out);
    assertEqual(parsed, [], 'empty array');
  }],
  ['cli scan picks up a stale followup', () => {
    const file = tmpLedgerFile();
    const p = ledger.createProject(file, { tenant: 'acme', name: 'P' });
    const f = ledger.openFollowup(file, { projectId: p.id, topic: 'q', owner: 'Blake' });
    const { withStore } = require('../../project-ledger/src/store');
    withStore(file, data => { data.followups.find(x => x.id === f.id).unblockBy = '2000-01-01'; });
    const out = run(['scan', '--ledger', file]);
    const parsed = JSON.parse(out);
    assertEqual(parsed.length, 1, 'one bucket');
    assertEqual(parsed[0].tenant, 'acme', 'tenant');
    assertEqual(parsed[0].owner, 'Blake', 'owner');
    assertEqual(parsed[0].followups.length, 1, 'one followup');
  }],
  ['cli status reports zero markers on a fresh ledger', () => {
    const file = tmpLedgerFile();
    const out = run(['status', '--ledger', file]);
    const parsed = JSON.parse(out);
    assertEqual(parsed.totalNotified, 0, 'zero markers');
  }],
];

module.exports = tests;
