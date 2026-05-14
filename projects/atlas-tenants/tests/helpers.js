'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpStoreFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-tenants-test-'));
  return path.join(dir, 'tenants.json');
}

function assert(cond, label) {
  if (!cond) throw new Error(`assertion failed: ${label}`);
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
}

function assertThrows(fn, pattern, label) {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  if (!threw) throw new Error(`${label}: expected throw, none happened`);
  if (pattern && !pattern.test(threw.message)) {
    throw new Error(`${label}: threw '${threw.message}', did not match ${pattern}`);
  }
  return threw;
}

// Build a tenant + 4 members with one role each. Returns the IDs so the test
// case can verify role-based behaviour without 30 lines of setup per case.
function seedTenantWithRoles(lib) {
  const file = tmpStoreFile();
  const tenant = lib.createTenant(file, { name: 'Acme Co' });
  const roles = ['owner', 'admin', 'member', 'viewer'];
  const userIds = {};
  for (const role of roles) {
    const m = lib.inviteUser(file, {
      tenantId: tenant.id,
      email: `${role}@acme.test`,
      role,
    });
    userIds[role] = m.userId;
  }
  return { file, tenant, userIds };
}

module.exports = { tmpStoreFile, assert, assertEqual, assertThrows, seedTenantWithRoles };
