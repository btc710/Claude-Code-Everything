'use strict';

const { suite, assert } = require('./helpers');
const {
  listAdapters,
  getAdapter,
  getAdapterOrThrow,
  operationMatrix,
  OPERATIONS,
} = require('../src/registry');

const s = suite('registry');

s.test('registry lists all 5 adapters', () => {
  const ids = listAdapters().map((a) => a.id).sort();
  assert.deepStrictEqual(ids, [
    'google',
    'hubspot',
    'microsoft365',
    'salesforce',
    'slack',
  ]);
});

s.test('every adapter has authKind and scopes', () => {
  for (const a of listAdapters()) {
    assert.ok(
      ['oauth2', 'apiKey', 'serviceAccount'].includes(a.authKind),
      `bad authKind for ${a.id}: ${a.authKind}`,
    );
    assert.ok(Array.isArray(a.scopes), `${a.id} scopes must be an array`);
  }
});

s.test('getAdapter returns the adapter object, unknown returns null', () => {
  const a = getAdapter('hubspot');
  assert.strictEqual(a.id, 'hubspot');
  assert.strictEqual(getAdapter('does-not-exist'), null);
});

s.test('getAdapterOrThrow throws on unknown id', () => {
  assert.throws(() => getAdapterOrThrow('nope'), /unknown adapter/);
});

s.test('operationMatrix covers every adapter x every op', () => {
  const m = operationMatrix();
  const adapterIds = Object.keys(m).sort();
  assert.deepStrictEqual(adapterIds, [
    'google',
    'hubspot',
    'microsoft365',
    'salesforce',
    'slack',
  ]);
  for (const id of adapterIds) {
    const ops = Object.keys(m[id]).sort();
    assert.deepStrictEqual(ops, [...OPERATIONS].sort());
  }
});

s.test('expected operation support per adapter', () => {
  const m = operationMatrix();
  // HubSpot: CRM only.
  assert.strictEqual(m.hubspot.lookupContact, true);
  assert.strictEqual(m.hubspot.postNote, true);
  assert.strictEqual(m.hubspot.pushDealUpdate, true);
  assert.strictEqual(m.hubspot.createCalendarEvent, false);
  assert.strictEqual(m.hubspot.sendEmail, false);
  // Google: calendar + mail only.
  assert.strictEqual(m.google.createCalendarEvent, true);
  assert.strictEqual(m.google.sendEmail, true);
  assert.strictEqual(m.google.lookupContact, false);
  // Salesforce: CRM-only stub.
  assert.strictEqual(m.salesforce.lookupContact, true);
  assert.strictEqual(m.salesforce.postNote, true);
  assert.strictEqual(m.salesforce.pushDealUpdate, true);
  assert.strictEqual(m.salesforce.createCalendarEvent, false);
  // M365: calendar + mail only.
  assert.strictEqual(m.microsoft365.createCalendarEvent, true);
  assert.strictEqual(m.microsoft365.sendEmail, true);
  assert.strictEqual(m.microsoft365.lookupContact, false);
  // Slack: lookup + DM/post only.
  assert.strictEqual(m.slack.lookupContact, true);
  assert.strictEqual(m.slack.postNote, true);
  assert.strictEqual(m.slack.sendEmail, false);
});

module.exports = s;
