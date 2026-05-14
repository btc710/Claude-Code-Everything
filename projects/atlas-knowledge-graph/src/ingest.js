'use strict';

const fs = require('fs');
const { addTriple } = require('./triples');

// Read a ledger file produced by atlas-project-ledger. We don't depend on
// that package — we just consume its JSON shape so the two stay decoupled.
function loadLedger(ledgerFile) {
  if (!fs.existsSync(ledgerFile)) throw new Error(`ledger ${ledgerFile} not found`);
  const raw = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  raw.projects = raw.projects || [];
  raw.backtests = raw.backtests || [];
  raw.followups = raw.followups || [];
  raw.reviews = raw.reviews || [];
  return raw;
}

// Pull triples out of a single project, its backtests, and its followups.
// Returns the list of triples that were added or refreshed.
function ingestProject(graphFile, ledgerFile, projectId) {
  const ledger = loadLedger(ledgerFile);
  const project = ledger.projects.find(p => p.id === projectId);
  if (!project) throw new Error(`project ${projectId} not in ledger`);
  if (!project.tenant) throw new Error(`project ${projectId} has no tenant`);

  const tenantId = project.tenant;
  const subject = project.slug || project.id;
  const out = [];

  const base = {
    tenantId,
    projectId,
    asOf: project.updatedAt || project.createdAt,
    source: `ledger:${project.id}`,
  };

  // Project name and scope are the headline "what we agreed to build".
  // Status `gated` / `in_flight` / `shipped` all signal a confirmed intent —
  // we only skip `draft` because nothing has been verified yet.
  if (project.status && project.status !== 'draft') {
    out.push(addTriple(graphFile, {
      ...base,
      subject,
      predicate: 'confirmed-intent',
      object: project.name,
      confidence: project.status === 'shipped' ? 1 : 0.8,
    }));
  }

  // Scope text often carries success criteria and constraints. Splitting on
  // sentence boundaries keeps the recall tokens meaningful.
  if (project.scope) {
    for (const sentence of splitSentences(project.scope)) {
      out.push(addTriple(graphFile, {
        ...base,
        subject,
        predicate: 'success-criterion',
        object: sentence,
        confidence: 0.7,
      }));
    }
  }

  // A passing backtest is the strongest evidence the plan was actually
  // accepted, so we promote it to a `decided` triple. The plan hash is the
  // object so we can later show "this exact plan got a 762/812".
  for (const bt of ledger.backtests.filter(b => b.projectId === projectId)) {
    if (!bt.pass) continue;
    out.push(addTriple(graphFile, {
      ...base,
      asOf: bt.runAt,
      subject,
      predicate: 'decided',
      object: `plan:${bt.planHash}`,
      confidence: 1,
      source: `backtest:${bt.id}`,
    }));
    if (bt.summary && bt.summary.weakestDimension) {
      out.push(addTriple(graphFile, {
        ...base,
        asOf: bt.runAt,
        subject,
        predicate: 'risk-mitigated',
        object: `weakest dimension: ${bt.summary.weakestDimension.name}`,
        confidence: 0.6,
        source: `backtest:${bt.id}`,
      }));
    }
  }

  // Followups carry the most useful institutional memory: a closed one
  // says "we asked X, answered Y." Owners become stakeholders. Open ones
  // get logged as assumptions so they can be reconciled later.
  for (const fu of ledger.followups.filter(f => f.projectId === projectId)) {
    if (fu.owner) {
      out.push(addTriple(graphFile, {
        ...base,
        asOf: fu.askedOn,
        subject,
        predicate: 'stakeholder',
        object: fu.owner,
        confidence: 0.9,
        source: `followup:${fu.id}`,
      }));
    }
    out.push(...emitFromFollowup(graphFile, base, subject, fu));
  }

  return out;
}

// Single-followup ingest path — used directly when a followup is resolved
// outside of a full project re-ingest cycle.
function ingestFollowup(graphFile, followup, ctx = {}) {
  if (!followup || !followup.topic) throw new Error('followup with topic required');
  const tenantId = ctx.tenantId || followup.tenantId;
  if (!tenantId) throw new Error('tenantId required (pass via ctx)');
  const subject = ctx.subject || followup.projectId || 'unknown-project';
  const base = {
    tenantId,
    projectId: followup.projectId || null,
    asOf: followup.askedOn || followup.resolvedAt,
    source: `followup:${followup.id || ''}`,
  };
  return emitFromFollowup(graphFile, base, subject, followup);
}

function emitFromFollowup(graphFile, base, subject, fu) {
  const out = [];
  if (fu.status === 'closed' && fu.resolvedWith) {
    // The closed answer is both a `decided` (this is what we picked) and
    // a `resolved-with` (with the question as subject) so recall can hit
    // it from either angle.
    out.push(addTriple(graphFile, {
      ...base,
      subject,
      predicate: 'decided',
      object: `${fu.topic} — ${fu.resolvedWith}`,
      confidence: 0.9,
    }));
    out.push(addTriple(graphFile, {
      ...base,
      subject: fu.topic,
      predicate: 'resolved-with',
      object: fu.resolvedWith,
      confidence: 0.9,
    }));
  } else if (fu.status === 'open' || fu.status === 'blocked') {
    out.push(addTriple(graphFile, {
      ...base,
      subject,
      predicate: 'assumption',
      object: fu.topic,
      confidence: 0.4,
    }));
  }
  return out;
}

// Backtests can carry an array of `results`. Each model run that surfaces
// an "open concern" string is worth promoting to a constraint triple so the
// next project picks it up via recall.
function ingestBacktest(graphFile, backtest, ctx = {}) {
  if (!backtest) throw new Error('backtest required');
  const tenantId = ctx.tenantId || backtest.tenantId;
  if (!tenantId) throw new Error('tenantId required (pass via ctx)');
  const subject = ctx.subject || backtest.projectId || 'unknown-project';
  const base = {
    tenantId,
    projectId: backtest.projectId || null,
    asOf: backtest.runAt,
    source: `backtest:${backtest.id || ''}`,
  };
  const out = [];
  for (const r of backtest.results || []) {
    const concerns = extractConcerns(r);
    for (const c of concerns) {
      out.push(addTriple(graphFile, {
        ...base,
        subject,
        predicate: 'constraint',
        object: c,
        confidence: 0.5,
      }));
    }
  }
  return out;
}

// Look for the most common open-concern field names. We don't want to be
// clever here — anything ambiguous gets skipped rather than guessed at.
function extractConcerns(result) {
  const out = [];
  const push = v => {
    if (!v) return;
    if (Array.isArray(v)) v.forEach(push);
    else if (typeof v === 'string' && v.trim()) out.push(v.trim());
  };
  push(result.concerns);
  push(result.openConcerns);
  push(result.risks);
  push(result.warnings);
  return out;
}

function splitSentences(text) {
  return String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 400);
}

module.exports = {
  ingestProject,
  ingestFollowup,
  ingestBacktest,
  loadLedger,
  splitSentences,
  extractConcerns,
};
