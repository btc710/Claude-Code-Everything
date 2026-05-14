'use strict';

const { suite, assert, tempFile } = require('./helpers');
const { run } = require('../src/cli');

const s = suite('cli');

function captureIO() {
  const stdout = [];
  const stderr = [];
  return {
    io: {
      log: (...a) => stdout.push(a.join(' ')),
      err: (...a) => stderr.push(a.join(' ')),
      readStdin: () => '',
    },
    stdout,
    stderr,
  };
}

s.test('list-adapters prints all 5 adapter ids', async () => {
  const { io, stdout } = captureIO();
  const code = await run(['list-adapters'], {}, io);
  assert.strictEqual(code, 0);
  const out = JSON.parse(stdout.join('\n'));
  const ids = out.map((a) => a.id).sort();
  assert.deepStrictEqual(ids, ['google', 'hubspot', 'microsoft365', 'salesforce', 'slack']);
});

s.test('connect stores a connection and redacts the token in output', async () => {
  const file = tempFile();
  const { io, stdout } = captureIO();
  const code = await run(
    [
      'connect',
      '--tenant', 'tenant-a',
      '--adapter', 'hubspot',
      '--token', 'hs-secret',
    ],
    { ATLAS_INTEGRATIONS_FILE: file },
    io,
  );
  assert.strictEqual(code, 0);
  const printed = JSON.parse(stdout.join('\n'));
  assert.strictEqual(printed.token, '***', 'token must be redacted in output');
  assert.strictEqual(printed.tenantId, 'tenant-a');

  // Round-trip: store actually persists the real token.
  const connections = require('../src/connections');
  const row = connections.get(file, 'tenant-a', 'hubspot');
  assert.strictEqual(row.token, 'hs-secret');
});

s.test('connect rejects unknown adapter id', async () => {
  const { io, stderr } = captureIO();
  const code = await run(
    ['connect', '--tenant', 't', '--adapter', 'nope', '--token', 'x'],
    {},
    io,
  );
  assert.strictEqual(code, 1);
  assert.ok(stderr.join('\n').includes('unknown adapter'));
});

s.test('disconnect removes the row', async () => {
  const file = tempFile();
  const { io } = captureIO();
  await run(
    ['connect', '--tenant', 'a', '--adapter', 'slack', '--token', 'x'],
    { ATLAS_INTEGRATIONS_FILE: file },
    io,
  );
  const code = await run(
    ['disconnect', '--tenant', 'a', '--adapter', 'slack'],
    { ATLAS_INTEGRATIONS_FILE: file },
    io,
  );
  assert.strictEqual(code, 0);
  const connections = require('../src/connections');
  assert.strictEqual(connections.get(file, 'a', 'slack'), null);
});

s.test('invoke fails with non-zero exit when no connection exists', async () => {
  const file = tempFile();
  const { io, stderr } = captureIO();
  const code = await run(
    [
      'invoke',
      '--tenant', 'tenant-x',
      '--adapter', 'hubspot',
      '--op', 'lookupContact',
      '--args', '{"email":"a@b.c"}',
    ],
    { ATLAS_INTEGRATIONS_FILE: file },
    io,
  );
  assert.strictEqual(code, 1);
  assert.ok(stderr.join('\n').includes('no connection'));
});

s.test('help prints usage', async () => {
  const { io, stdout } = captureIO();
  const code = await run(['help'], {}, io);
  assert.strictEqual(code, 0);
  assert.ok(stdout.join('\n').includes('atlas-integrations'));
});

module.exports = s;
