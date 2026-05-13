'use strict';

const { listSlots } = require('./registry');
const { scoreWithSlot } = require('./score');

const FLOOR = 750;
const DIM_FLOOR = 70;

async function runBacktest({ plan, tenant, project = null, env = process.env, ledger, fetchImpl = fetch, slots = null }) {
  const targets = slots ? slots.map(s => (typeof s === 'string' ? s : s.id)) : listSlots().map(s => s.id);

  const settled = await Promise.allSettled(
    targets.map(id => scoreWithSlot({ slotIdOrNumber: id, plan, env, fetchImpl }))
  );

  const results = [];
  for (let i = 0; i < settled.length; i++) {
    const target = targets[i];
    const r = settled[i];
    if (r.status === 'fulfilled') {
      results.push({ slot: target, ok: true, ...r.value });
      if (ledger) {
        ledger.record({
          tenant,
          slot: target,
          tokensIn:  r.value.usage.tokensIn,
          tokensOut: r.value.usage.tokensOut,
          project,
        });
      }
    } else {
      results.push({ slot: target, ok: false, error: String(r.reason && r.reason.message || r.reason) });
    }
  }

  const passed = results.filter(r => r.ok);
  const totals = passed.map(r => r.score.total);
  const mean = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
  const min  = totals.length ? Math.min(...totals) : 0;
  const max  = totals.length ? Math.max(...totals) : 0;

  // Average per dimension across all successful models.
  const dimAvg = {};
  if (passed.length) {
    const keys = Object.keys(passed[0].score.dimensions || {});
    for (const k of keys) {
      const vals = passed.map(p => (p.score.dimensions[k] || 0));
      dimAvg[k] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }

  const weakestDim = Object.keys(dimAvg).length
    ? Object.entries(dimAvg).sort((a, b) => a[1] - b[1])[0]
    : null;

  const allAboveFloor = passed.length === results.length && passed.every(r => r.score.total >= FLOOR);
  const meanAboveFloor = mean >= FLOOR;
  const noDimBelow = Object.values(dimAvg).every(v => v >= DIM_FLOOR);

  return {
    pass: allAboveFloor && meanAboveFloor && noDimBelow,
    floor: FLOOR,
    summary: {
      models: results.length,
      ok: passed.length,
      failed: results.length - passed.length,
      mean,
      min,
      max,
      dimensions: dimAvg,
      weakestDimension: weakestDim ? { name: weakestDim[0], avg: weakestDim[1] } : null,
    },
    results,
  };
}

module.exports = { runBacktest, FLOOR, DIM_FLOOR };
