'use strict';

// Core scheduler. Three jobs:
//   1. scanStaleFollowups(ledgerFile)        — wrap project-ledger.stalefollowups
//   2. scanDueReviews(ledgerFile, windowDays) — wrap project-ledger.dueReviews
//   3. dispatch(sink, batch, opts)           — format + send + idempotency + retry
//
// Both scan* functions return an array of batches grouped by (tenant, owner).
// dispatch() consumes one batch at a time and returns a structured result.

const reader = require('./ledger-reader');
const state = require('./state');
const { buildDigest } = require('./digest');
const { isoDay } = require('../../project-ledger/src/ids');

// Bucket items into { tenant, owner } batches. Items whose projectId no
// longer resolves to a project (deleted, wrong file, etc.) are dropped —
// they cannot be routed to a customer channel anyway.
function bucketize(items, projects, getOwner, field) {
  const buckets = new Map();
  for (const item of items) {
    const project = projects.get(item.projectId);
    if (!project) continue;
    const owner = getOwner(item) || null;
    const key = `${project.tenant}::${owner || ''}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        tenant: project.tenant,
        owner,
        followups: [],
        reviews: [],
        projects,
      });
    }
    buckets.get(key)[field].push(item);
  }
  return Array.from(buckets.values());
}

function scanStaleFollowups(ledgerFile, asOf = new Date()) {
  const projects = reader.projectIndex(ledgerFile);
  const stale = reader.stalefollowups(ledgerFile, asOf);
  return bucketize(stale, projects, f => f.owner, 'followups');
}

function scanDueReviews(ledgerFile, windowDays = 7, asOf = new Date()) {
  const projects = reader.projectIndex(ledgerFile);
  const due = reader.dueReviews(ledgerFile, asOf, windowDays);
  // Reviews have no owner; bucket by tenant only (owner = null).
  return bucketize(due, projects, () => null, 'reviews');
}

// Merge two arrays of batches (one from followups, one from reviews)
// into a single set keyed by tenant+owner so we don't send two messages
// to the same recipient on the same day.
function mergeBatches(followupBatches, reviewBatches) {
  const merged = new Map();
  function add(b) {
    const key = `${b.tenant}::${b.owner || ''}`;
    if (!merged.has(key)) {
      merged.set(key, {
        tenant: b.tenant,
        owner: b.owner,
        followups: [],
        reviews: [],
        projects: b.projects,
      });
    }
    const m = merged.get(key);
    for (const f of b.followups) m.followups.push(f);
    for (const r of b.reviews) m.reviews.push(r);
  }
  for (const b of followupBatches) add(b);
  for (const b of reviewBatches) add(b);
  return Array.from(merged.values());
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Retry with exponential backoff: 1s, 2s, 4s (configurable).
// Returns { ok, attempts, error }.
async function withRetry(fn, opts = {}) {
  const max = opts.maxAttempts || 3;
  const base = opts.baseDelayMs == null ? 1000 : opts.baseDelayMs;
  const onError = opts.onError || (() => {});
  let lastErr = null;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const r = await fn(attempt);
      return { ok: true, attempts: attempt, result: r };
    } catch (e) {
      lastErr = e;
      onError(e, attempt);
      if (attempt < max) {
        const delay = base * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }
  return { ok: false, attempts: max, error: lastErr };
}

// Dispatch a single batch via the supplied sink.
// - `sink` is an object with an async `send` method (slack/email/webhook).
// - `batch` is one of the entries returned by scanStaleFollowups /
//   scanDueReviews (or mergeBatches).
// - `opts.channel` is the channel/recipient/url to send to.
// - `opts.stateFile` (default: sidecar to the ledger file) is where the
//   idempotency markers go.
// - `opts.fetchImpl` is passed through to the sink for fake-fetch tests.
// - `opts.day` overrides the day key (testing).
async function dispatch(sink, batch, opts = {}) {
  if (!sink || typeof sink.send !== 'function') throw new Error('dispatch: sink.send required');
  if (!opts.channel) throw new Error('dispatch: opts.channel required');
  const stateFile = opts.stateFile;
  if (!stateFile) throw new Error('dispatch: opts.stateFile required');
  const day = opts.day || isoDay(new Date());
  const sinkName = opts.sinkName || 'unknown';
  const logger = opts.logger || console;

  // Filter out items already notified today.
  const st = state.load(stateFile);
  const fresh = {
    tenant: batch.tenant,
    owner: batch.owner,
    followups: batch.followups.filter(f => !state.wasNotified(st, day, f.id)),
    reviews: batch.reviews.filter(r => !state.wasNotified(st, day, r.id)),
    projects: batch.projects,
  };

  if (fresh.followups.length === 0 && fresh.reviews.length === 0) {
    return { ok: true, skipped: true, reason: 'all-items-already-notified' };
  }

  const { subject, body } = buildDigest(fresh);
  const meta = {
    tenant: fresh.tenant,
    owner: fresh.owner,
    followupIds: fresh.followups.map(f => f.id),
    reviewIds: fresh.reviews.map(r => r.id),
  };

  const result = await withRetry(
    () => sink.send({ channel: opts.channel, subject, body, meta }, opts),
    {
      maxAttempts: opts.maxAttempts || 3,
      baseDelayMs: opts.baseDelayMs,
      onError: (err, attempt) => {
        logger.error(`[atlas-notifier] sink=${sinkName} attempt=${attempt} error=${err.message}`);
      },
    },
  );

  if (!result.ok) {
    logger.error(`[atlas-notifier] sink=${sinkName} gave up after ${result.attempts} attempts: ${result.error && result.error.message}`);
    return {
      ok: false,
      skipped: false,
      attempts: result.attempts,
      error: result.error ? result.error.message : 'unknown',
    };
  }

  // Mark every item that just got notified.
  const after = state.load(stateFile);
  for (const f of fresh.followups) state.markNotified(after, day, f.id, sinkName);
  for (const r of fresh.reviews) state.markNotified(after, day, r.id, sinkName);
  state.save(stateFile, after);

  return {
    ok: true,
    skipped: false,
    attempts: result.attempts,
    notifiedFollowups: fresh.followups.length,
    notifiedReviews: fresh.reviews.length,
    subject,
    body,
  };
}

module.exports = {
  scanStaleFollowups,
  scanDueReviews,
  mergeBatches,
  dispatch,
  withRetry,
};
