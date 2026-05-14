'use strict';

const { withStore } = require('./store');
const { id, slugify } = require('./ids');

const STATUSES = ['draft', 'gated', 'in_flight', 'shipped', 'archived'];

function createProject(file, { tenant, name, scope = null, estimate = null }) {
  if (!tenant) throw new Error('tenant required');
  if (!name) throw new Error('name required');
  return withStore(file, data => {
    const slug = slugify(name);
    const now = new Date().toISOString();
    const project = {
      id: id('proj'),
      tenant, name, slug,
      status: 'draft',
      scope,
      estimate,
      createdAt: now,
      updatedAt: now,
    };
    data.projects.push(project);
    return project;
  });
}

function updateProject(file, projectId, patch) {
  return withStore(file, data => {
    const p = data.projects.find(p => p.id === projectId);
    if (!p) throw new Error(`project ${projectId} not found`);
    if (patch.status && !STATUSES.includes(patch.status)) {
      throw new Error(`invalid status ${patch.status}`);
    }
    Object.assign(p, patch);
    p.updatedAt = new Date().toISOString();
    return p;
  });
}

function getProject(file, projectId) {
  const { load } = require('./store');
  return load(file).projects.find(p => p.id === projectId) || null;
}

function listProjects(file, { tenant = null, status = null } = {}) {
  const { load } = require('./store');
  return load(file).projects.filter(p =>
    (!tenant || p.tenant === tenant) &&
    (!status || p.status === status)
  );
}

module.exports = { createProject, updateProject, getProject, listProjects, STATUSES };
