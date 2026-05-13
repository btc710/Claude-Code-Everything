'use strict';

const { withStore, load } = require('./store');
const { id, isoDay, addDays } = require('./ids');

const KINDS = [
  { kind: '30d',  offsetDays: 30  },
  { kind: '90d',  offsetDays: 90  },
  { kind: '180d', offsetDays: 180 },
];

const STATUSES = ['pending', 'in_progress', 'done', 'skipped'];

// Schedules all three reviews at once. Idempotent per project.
function scheduleReviews(file, projectId, acceptedAt = new Date()) {
  return withStore(file, data => {
    const p = data.projects.find(p => p.id === projectId);
    if (!p) throw new Error(`project ${projectId} not found`);
    const out = [];
    for (const k of KINDS) {
      const exists = data.reviews.find(r => r.projectId === projectId && r.kind === k.kind);
      if (exists) { out.push(exists); continue; }
      const review = {
        id: id('rv'),
        projectId,
        kind: k.kind,
        dueAt: isoDay(addDays(acceptedAt, k.offsetDays)),
        status: 'pending',
        findings: null,
      };
      data.reviews.push(review);
      out.push(review);
    }
    return out;
  });
}

function completeReview(file, reviewId, findings) {
  return withStore(file, data => {
    const r = data.reviews.find(r => r.id === reviewId);
    if (!r) throw new Error(`review ${reviewId} not found`);
    r.status = 'done';
    r.findings = findings || null;
    r.completedAt = new Date().toISOString();
    return r;
  });
}

function listReviews(file, { projectId = null, status = null } = {}) {
  return load(file).reviews.filter(r =>
    (!projectId || r.projectId === projectId) &&
    (!status || r.status === status)
  );
}

function dueReviews(file, asOf = new Date(), windowDays = 7) {
  const today = isoDay(asOf);
  const horizon = isoDay(addDays(asOf, windowDays));
  return load(file).reviews.filter(r =>
    r.status === 'pending' && r.dueAt >= today && r.dueAt <= horizon
  );
}

module.exports = { scheduleReviews, completeReview, listReviews, dueReviews, KINDS, STATUSES };
