'use strict';

const { listSlots, getSlot } = require('../src/registry');
const { assert, assertEqual } = require('./helpers');

const tests = [
  ['registry has exactly 12 slots', () => {
    assertEqual(listSlots().length, 12, 'slot count');
  }],
  ['slot numbers 1..12 are all present', () => {
    const nums = listSlots().map(s => s.slot).sort((a, b) => a - b);
    assertEqual(nums, [1,2,3,4,5,6,7,8,9,10,11,12], 'slot numbers');
  }],
  ['every slot has provider, model, id, and prices', () => {
    for (const s of listSlots()) {
      assert(s.id && s.model && s.provider, `slot ${s.slot} missing fields`);
      assert(typeof s.priceIn === 'number' && typeof s.priceOut === 'number', `slot ${s.slot} missing prices`);
    }
  }],
  ['lookup by id and by slot number both work', () => {
    const byId = getSlot('opus-4.7');
    const byNum = getSlot(1);
    assertEqual(byId, byNum, 'lookup parity');
  }],
  ['vendor diversity: at least 5 distinct providers', () => {
    const providers = new Set(listSlots().map(s => s.provider));
    assert(providers.size >= 5, `only ${providers.size} providers`);
  }],
];

module.exports = tests;
