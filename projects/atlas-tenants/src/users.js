'use strict';

const { withStore, load } = require('./store');
const { id, normalizeEmail } = require('./ids');
const { recordAudit } = require('./audit');

// Users are global, not tenant-scoped. Membership is what binds a user to a tenant.
function upsertUser(file, { email, displayName = null, actor = null }) {
  if (!email) throw new Error('email required');
  const e = normalizeEmail(email);
  return withStore(file, data => {
    let user = data.users.find(u => u.email === e);
    if (user) {
      if (displayName && user.displayName !== displayName) {
        user.displayName = displayName;
      }
      return user;
    }
    user = {
      id: id('usr'),
      email: e,
      displayName: displayName || null,
      createdAt: new Date().toISOString(),
    };
    data.users.push(user);
    recordAudit(data, {
      actor,
      tenantId: null,
      action: 'user.create',
      target: { type: 'user', id: user.id },
      meta: { email: e },
    });
    return user;
  });
}

function getUser(file, userId) {
  return load(file).users.find(u => u.id === userId) || null;
}

function getUserByEmail(file, email) {
  const e = normalizeEmail(email);
  return load(file).users.find(u => u.email === e) || null;
}

module.exports = { upsertUser, getUser, getUserByEmail };
