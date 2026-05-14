'use strict';

const { suite, assert } = require('./helpers');
const { load } = require('../src/config');

const s = suite('config.load');

s.test('throws when required vars missing', () => {
  let threw = null;
  try {
    load({});
  } catch (err) {
    threw = err;
  }
  assert.ok(threw, 'expected error');
  assert.match(threw.message, /Missing required environment variables/);
});

s.test('returns nested config when all vars present', () => {
  const cfg = load({
    HUBSPOT_TOKEN: 'h',
    GOOGLE_CLIENT_ID: 'cid',
    GOOGLE_CLIENT_SECRET: 'sec',
    GOOGLE_REFRESH_TOKEN: 'rt',
    SENDER_EMAIL: 'me@example.com',
    DEFAULT_MEETING_MINUTES: '45',
    DEFAULT_TIMEZONE: 'America/Chicago',
  });
  assert.strictEqual(cfg.hubspot.token, 'h');
  assert.strictEqual(cfg.google.refreshToken, 'rt');
  assert.strictEqual(cfg.sender.email, 'me@example.com');
  assert.strictEqual(cfg.sender.name, 'me@example.com');
  assert.strictEqual(cfg.calendar.calendarId, 'primary');
  assert.strictEqual(cfg.calendar.defaultMinutes, 45);
  assert.strictEqual(cfg.calendar.timeZone, 'America/Chicago');
});

module.exports = s;
