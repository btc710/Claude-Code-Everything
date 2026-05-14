'use strict';

const path = require('path');
const state = require('../src/state');
const { tmpDir, assert, assertEqual } = require('./helpers');

const tests = [
  ['load returns EMPTY when file missing', () => {
    const f = path.join(tmpDir(), 'no-such.json');
    const s = state.load(f);
    assertEqual(s.version, 1, 'version 1');
    assertEqual(Object.keys(s.notified).length, 0, 'empty notified');
  }],
  ['save then load roundtrips', () => {
    const f = path.join(tmpDir(), 'state.json');
    const s = state.EMPTY();
    state.markNotified(s, '2026-05-13', 'fu_1', 'slack');
    state.save(f, s);
    const got = state.load(f);
    assert(state.wasNotified(got, '2026-05-13', 'fu_1'), 'marker present');
    assert(!state.wasNotified(got, '2026-05-14', 'fu_1'), 'different day not marked');
  }],
  ['defaultStateFile sits next to ledger', () => {
    const out = state.defaultStateFile('/tmp/x/.atlas/ledger.json');
    assertEqual(out, '/tmp/x/.atlas/notifier-state.json', 'sidecar path');
  }],
  ['markKey is (day, id) compound', () => {
    assertEqual(state.markKey('2026-05-13', 'fu_1'), '2026-05-13:fu_1', 'compound key');
  }],
];

module.exports = tests;
