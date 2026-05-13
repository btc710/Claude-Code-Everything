'use strict';

const lib = require('../src');
const { tmpStoreFile, assert, assertEqual } = require('./helpers');

const tests = [
  ['upsertUser is idempotent on email', () => {
    const file = tmpStoreFile();
    const a = lib.upsertUser(file, { email: 'one@acme.test' });
    const b = lib.upsertUser(file, { email: 'ONE@acme.test' });
    assertEqual(a.id, b.id, 'same user');
  }],

  ['upsertUser updates displayName on subsequent calls', () => {
    const file = tmpStoreFile();
    lib.upsertUser(file, { email: 'one@acme.test' });
    const u = lib.upsertUser(file, { email: 'one@acme.test', displayName: 'One Name' });
    assertEqual(u.displayName, 'One Name', 'name updated');
  }],

  ['getUser/getUserByEmail return null for unknowns', () => {
    const file = tmpStoreFile();
    assertEqual(lib.getUser(file, 'usr_nope'), null, 'getUser');
    assertEqual(lib.getUserByEmail(file, 'nope@nope.test'), null, 'getUserByEmail');
  }],

  ['user.create audit is written exactly once per unique email', () => {
    const file = tmpStoreFile();
    lib.upsertUser(file, { email: 'one@acme.test' });
    lib.upsertUser(file, { email: 'one@acme.test', displayName: 'Renamed' });
    const audit = lib.listAudit(file).filter(e => e.action === 'user.create');
    assertEqual(audit.length, 1, 'only one create row');
  }],
];

module.exports = tests;
