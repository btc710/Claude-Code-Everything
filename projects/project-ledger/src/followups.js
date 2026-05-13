'use strict';

const { withStore, load } = require('./store');
const { id, isoDay, addDays } = require('./ids');

const STATUSES = ['open', 'blocked', 'answered', 'closed'];

function openFollowup(file, { projectId, topic, owner = null, unblockInDays = 3 }) {
  if (!projectId) throw new Error('projectId required');
  if (!topic) throw new Error('topic required');
  return withStore(file, data => {
    const p = data.projects.find(p => p.id === projectId);
    if (!p) throw new Error(`project ${projectId} not found`);
    const today = new Date();
    const f = {
      id: id('fu'),
      projectId,
      topic,
      owner,
      askedOn: isoDay(today),
      unblockBy: isoDay(addDays(today, unblockInDays)),
      status: 'open',
      resolvedWith: null,
    };
    data.followups.push(f);
    return f;
  });
}

function resolveFollowup(file, followupId, resolvedWith) {
  return withStore(file, data => {
    const f = data.followups.find(f => f.id === followupId);
    if (!f) throw new Error(`followup ${followupId} not found`);
    f.status = 'closed';
    f.resolvedWith = resolvedWith || null;
    return f;
  });
}

function listFollowups(file, { projectId = null, status = null } = {}) {
  return load(file).followups.filter(f =>
    (!projectId || f.projectId === projectId) &&
    (!status || f.status === status)
  );
}

function stalefollowups(file, asOf = new Date()) {
  const today = isoDay(asOf);
  return load(file).followups.filter(f =>
    f.status === 'open' && f.unblockBy && f.unblockBy < today
  );
}

module.exports = { openFollowup, resolveFollowup, listFollowups, stalefollowups, STATUSES };
