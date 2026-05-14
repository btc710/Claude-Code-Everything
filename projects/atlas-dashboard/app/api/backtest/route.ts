import { NextResponse } from 'next/server';
import { DEMO_PROJECT } from '@/lib/demo';

// Node runtime — keeps the door open to `require('atlas-model-gateway')`
// once we wire to the real fan-out.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BacktestRequest {
  plan?: unknown;
  tenant?: string;
  project?: string | null;
}

const FLOOR = 750;
const DIM_FLOOR = 70;

export async function POST(req: Request) {
  let body: BacktestRequest = {};
  try {
    body = (await req.json()) as BacktestRequest;
  } catch {
    // tolerate missing/invalid body — the demo doesn't validate the plan shape
  }

  if (!body.plan) {
    return NextResponse.json({ error: 'plan required' }, { status: 400 });
  }

  // Canned 12-model report mirroring the mockup. In production this would
  // delegate to runBacktest() from atlas-model-gateway and return the live
  // fan-out result. The shape is intentionally identical to that module's
  // output so the swap is a one-liner.
  const results = DEMO_PROJECT.backtest.map((r) => ({
    slot: r.slot,
    ok: true,
    score: {
      total: r.total,
      dimensions: r.dimensions,
    },
    usage: { tokensIn: 1820, tokensOut: 640 },
  }));

  const totals = results.map((r) => r.score.total);
  const mean = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
  const min = Math.min(...totals);
  const max = Math.max(...totals);

  const dimAvg: Record<string, number> = {};
  const keys = Object.keys(results[0].score.dimensions);
  for (const k of keys) {
    const vals = results.map((p) => p.score.dimensions[k] ?? 0);
    dimAvg[k] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  const weakest = Object.entries(dimAvg).sort((a, b) => a[1] - b[1])[0];

  return NextResponse.json({
    pass: totals.every((t) => t >= FLOOR) && mean >= FLOOR && Object.values(dimAvg).every((v) => v >= DIM_FLOOR),
    floor: FLOOR,
    summary: {
      models: results.length,
      ok: results.length,
      failed: 0,
      mean,
      min,
      max,
      dimensions: dimAvg,
      weakestDimension: weakest ? { name: weakest[0], avg: weakest[1] } : null,
    },
    results,
    receivedTenant: body.tenant ?? null,
    receivedProject: body.project ?? null,
  });
}
