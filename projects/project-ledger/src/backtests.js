'use strict';

const { withStore, load } = require('./store');
const { id, planHash } = require('./ids');

// Pass criteria (must match skills/atlas-protocol/rubric.md)
const FLOOR_TOTAL = 750;
const FLOOR_DIM_AVG = 70;

function validatePass(summary) {
  if (!summary) return false;
  if (typeof summary.min !== 'number' || summary.min < FLOOR_TOTAL) return false;
  if (typeof summary.mean !== 'number' || summary.mean < FLOOR_TOTAL) return false;
  if (summary.dimensions) {
    for (const v of Object.values(summary.dimensions)) {
      if (v < FLOOR_DIM_AVG) return false;
    }
  }
  return true;
}

function recordBacktest(file, { projectId, plan, summary, results = [] }) {
  if (!projectId) throw new Error('projectId required');
  return withStore(file, data => {
    const p = data.projects.find(p => p.id === projectId);
    if (!p) throw new Error(`project ${projectId} not found`);
    const pass = validatePass(summary);
    const run = {
      id: id('bt'),
      projectId,
      runAt: new Date().toISOString(),
      planHash: planHash(plan),
      pass,
      summary,
      results,
    };
    data.backtests.push(run);
    if (pass && p.status === 'draft') {
      p.status = 'gated';
      p.updatedAt = run.runAt;
    }
    return run;
  });
}

function listBacktests(file, projectId) {
  return load(file).backtests
    .filter(b => b.projectId === projectId)
    .sort((a, b) => a.runAt.localeCompare(b.runAt));
}

function latestBacktest(file, projectId) {
  const all = listBacktests(file, projectId);
  return all.length ? all[all.length - 1] : null;
}

module.exports = { recordBacktest, listBacktests, latestBacktest, validatePass, FLOOR_TOTAL, FLOOR_DIM_AVG };
