'use strict';

// Format one batch (= one tenant + owner pair, possibly with mixed
// followup/review items) into a single digest message.

function formatFollowupLine(f, project) {
  const name = project ? project.name : f.projectId;
  return `- [followup] "${f.topic}" — project "${name}" — unblockBy ${f.unblockBy} (asked ${f.askedOn})`;
}

function formatReviewLine(r, project) {
  const name = project ? project.name : r.projectId;
  return `- [review/${r.kind}] project "${name}" — due ${r.dueAt}`;
}

function buildDigest(batch) {
  const { tenant, owner, followups = [], reviews = [], projects } = batch;
  const lines = [];
  if (followups.length) {
    lines.push(`Stale follow-ups (${followups.length}):`);
    for (const f of followups) lines.push(formatFollowupLine(f, projects.get(f.projectId)));
  }
  if (reviews.length) {
    if (lines.length) lines.push('');
    lines.push(`Due reviews (${reviews.length}):`);
    for (const r of reviews) lines.push(formatReviewLine(r, projects.get(r.projectId)));
  }
  const ownerLabel = owner ? ` for ${owner}` : '';
  const subject = `Atlas digest — ${tenant}${ownerLabel} — ${followups.length} stale, ${reviews.length} reviews`;
  return { subject, body: lines.join('\n') };
}

module.exports = { buildDigest, formatFollowupLine, formatReviewLine };
