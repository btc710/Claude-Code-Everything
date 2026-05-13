'use strict';

const { withStore, load } = require('./store');
const { id, slugify } = require('./ids');
const { recordAudit } = require('./audit');

function createTenant(file, { name, ownerUserId = null, actor = null }) {
  if (!name) throw new Error('name required');
  return withStore(file, data => {
    const now = new Date().toISOString();
    const tenant = {
      id: id('ten'),
      name,
      slug: slugify(name),
      createdAt: now,
      updatedAt: now,
    };
    data.tenants.push(tenant);
    recordAudit(data, {
      actor,
      tenantId: tenant.id,
      action: 'tenant.create',
      target: { type: 'tenant', id: tenant.id },
      meta: { name, slug: tenant.slug },
    });

    // Optional bootstrap: create an owner membership for the founding user.
    if (ownerUserId) {
      const user = data.users.find(u => u.id === ownerUserId);
      if (!user) throw new Error(`user ${ownerUserId} not found`);
      const m = {
        id: id('mem'),
        tenantId: tenant.id,
        userId: ownerUserId,
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      };
      data.memberships.push(m);
      recordAudit(data, {
        actor,
        tenantId: tenant.id,
        action: 'member.invite',
        target: { type: 'membership', id: m.id },
        meta: { userId: ownerUserId, role: 'owner', bootstrap: true },
      });
    }
    return tenant;
  });
}

function getTenant(file, tenantId) {
  return load(file).tenants.find(t => t.id === tenantId) || null;
}

function listTenants(file) {
  return load(file).tenants.slice();
}

function updateTenant(file, tenantId, patch, { actor = null } = {}) {
  return withStore(file, data => {
    const t = data.tenants.find(t => t.id === tenantId);
    if (!t) throw new Error(`tenant ${tenantId} not found`);
    const before = { name: t.name, slug: t.slug };
    if (patch.name) {
      t.name = patch.name;
      t.slug = slugify(patch.name);
    }
    t.updatedAt = new Date().toISOString();
    recordAudit(data, {
      actor,
      tenantId,
      action: 'tenant.update',
      target: { type: 'tenant', id: tenantId },
      meta: { before, after: { name: t.name, slug: t.slug } },
    });
    return t;
  });
}

module.exports = { createTenant, getTenant, listTenants, updateTenant };
