'use strict';

const { suite, assert } = require('./helpers');
const {
  invoke,
  supportedOperations,
  NotSupportedError,
  OPERATIONS,
} = require('../src/adapter');
const registry = require('../src/registry');

const s = suite('adapter-contract');

s.test('OPERATIONS list is the canonical 5-method surface', () => {
  assert.deepStrictEqual([...OPERATIONS].sort(), [
    'createCalendarEvent',
    'lookupContact',
    'postNote',
    'pushDealUpdate',
    'sendEmail',
  ]);
});

s.test('invoke() throws NotSupportedError when the adapter omits a method', async () => {
  // HubSpot deliberately does not implement createCalendarEvent.
  const hubspot = registry.getAdapter('hubspot');
  await assert.rejects(
    invoke(hubspot, 'createCalendarEvent', { tenantId: 't', connection: { token: 'x' } }, {}),
    (err) => {
      assert.ok(err instanceof NotSupportedError);
      assert.strictEqual(err.adapterId, 'hubspot');
      assert.strictEqual(err.op, 'createCalendarEvent');
      return true;
    },
  );
});

s.test('invoke() throws NotSupportedError for slack.sendEmail', async () => {
  const slack = registry.getAdapter('slack');
  await assert.rejects(
    invoke(slack, 'sendEmail', { tenantId: 't', connection: { token: 'x' } }, {}),
    (err) => err instanceof NotSupportedError && err.adapterId === 'slack',
  );
});

s.test('invoke() throws plain Error on truly unknown operations', async () => {
  const hubspot = registry.getAdapter('hubspot');
  await assert.rejects(
    invoke(hubspot, 'lolNo', {}, {}),
    /unknown operation/,
  );
});

s.test('supportedOperations matches what each adapter exports', () => {
  for (const a of registry.ADAPTERS) {
    const ops = supportedOperations(a);
    for (const op of ops) {
      assert.strictEqual(typeof a[op], 'function', `${a.id}.${op} should be a function`);
    }
    for (const op of OPERATIONS) {
      if (!ops.includes(op)) {
        assert.strictEqual(typeof a[op], 'undefined', `${a.id}.${op} should be undefined`);
      }
    }
  }
});

s.test('registry.invokeAdapter routes through invoke()', async () => {
  await assert.rejects(
    registry.invokeAdapter(
      'google',
      'lookupContact',
      { tenantId: 't', connection: { token: 'x' } },
      { email: 'a@b.c' },
    ),
    (err) => err instanceof NotSupportedError && err.adapterId === 'google',
  );
});

module.exports = s;
