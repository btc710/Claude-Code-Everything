'use strict';

const { withStore, load } = require('./store');
const { id, normalizeEmail } = require('./ids');
const { isRole, rankOf } = require('./permissions');
const { recordAudit } = require('./audit');

function findMembership(data, tenantId, userId) {
  return data.memberships.find(m => m.tenantId === tenantId && m.userId === userId) || null;
}

// Invite (or re-invite) a user to a tenant under a given role.
// If the user does not exist yet, create them first. Returns the membership.
function inviteUser(file, { tenantId, email, role = 'member', displayName = null, actor = null }) {
  if (!tenantId) throw new Error('tenantId required');
  if (!email) throw new Error('email required');
  if (!isRole(role)) throw new Error(`invalid role ${role}`);
  const e = normalizeEmail(email);
  return withStore(file, data => {
    const tenant = data.tenants.find(t => t.id === tenantId);
    if (!tenant) throw new Error(`tenant ${tenantId} not found`);

    let user = data.users.find(u => u.email === e);
    if (!user) {
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
    }

    let m = findMembership(data, tenantId, user.id);
    const now = new Date().toISOString();
    if (m) {
      const before = m.role;
      if (before !== role) {
        m.role = role;
        m.updatedAt = now;
        recordAudit(data, {
          actor,
          tenantId,
          action: 'member.update',
          target: { type: 'membership', id: m.id },
          meta: { before, after: role },
        });
      }
      return m;
    }
    m = {
      id: id('mem'),
      tenantId,
      userId: user.id,
      role,
      createdAt: now,
      updatedAt: now,
    };
    data.memberships.push(m);
    recordAudit(data, {
      actor,
      tenantId,
      action: 'member.invite',
      target: { type: 'membership', id: m.id },
      meta: { userId: user.id, email: e, role },
    });
    return m;
  });
}

function setRole(file, { tenantId, userId, role, actor = null }) {
  if (!isRole(role)) throw new Error(`invalid role ${role}`);
  return withStore(file, data => {
    const m = findMembership(data, tenantId, userId);
    if (!m) throw new Error(`membership not found`);
    if (m.role === 'owner' && role !== 'owner') {
      // Prevent leaving a tenant with zero owners.
      const owners = data.memberships.filter(x => x.tenantId === tenantId && x.role === 'owner');
      if (owners.length <= 1) throw new Error('cannot demote the last owner');
    }
    const before = m.role;
    m.role = role;
    m.updatedAt = new Date().toISOString();
    recordAudit(data, {
      actor,
      tenantId,
      action: 'member.update',
      target: { type: 'membership', id: m.id },
      meta: { before, after: role },
    });
    return m;
  });
}

function removeMember(file, { tenantId, userId, actor = null }) {
  return withStore(file, data => {
    const m = findMembership(data, tenantId, userId);
    if (!m) throw new Error(`membership not found`);
    if (m.role === 'owner') {
      const owners = data.memberships.filter(x => x.tenantId === tenantId && x.role === 'owner');
      if (owners.length <= 1) throw new Error('cannot remove the last owner');
    }
    const idx = data.memberships.indexOf(m);
    data.memberships.splice(idx, 1);
    recordAudit(data, {
      actor,
      tenantId,
      action: 'member.remove',
      target: { type: 'membership', id: m.id },
      meta: { userId, previousRole: m.role },
    });
    return m;
  });
}

function listMembers(file, tenantId) {
  const data = load(file);
  return data.memberships
    .filter(m => m.tenantId === tenantId)
    .map(m => {
      const user = data.users.find(u => u.id === m.userId) || null;
      return {
        membershipId: m.id,
        tenantId: m.tenantId,
        userId: m.userId,
        email: user ? user.email : null,
        displayName: user ? user.displayName : null,
        role: m.role,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      };
    })
    .sort((a, b) => rankOf(b.role) - rankOf(a.role) || a.createdAt.localeCompare(b.createdAt));
}

function getMembership(file, tenantId, userId) {
  return findMembership(load(file), tenantId, userId);
}

module.exports = { inviteUser, setRole, removeMember, listMembers, getMembership };
