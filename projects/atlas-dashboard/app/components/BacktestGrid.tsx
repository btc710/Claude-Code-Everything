import type { BacktestSlotResult } from '@/lib/demo';

interface BacktestGridProps {
  rows: BacktestSlotResult[];
  floor: number;
}

export default function BacktestGrid({ rows, floor }: BacktestGridProps) {
  const totals = rows.map((r) => r.total);
  const mean = Math.round(totals.reduce((a, b) => a + b, 0) / Math.max(totals.length, 1));
  const min = Math.min(...totals);
  const passing = rows.filter((r) => r.total >= floor).length;

  return (
    <section className="border-b border-[rgba(120,170,255,0.10)] px-[18px] py-3">
      <div className="mb-[9px] flex items-center gap-[7px] text-[10.5px] font-semibold uppercase tracking-[1.6px] text-ink-dim">
        Backtest
        <span className="ml-auto rounded-full bg-[rgba(93,255,165,0.10)] px-[7px] py-[1px] text-[10px] tracking-[0.5px] text-good">
          {passing}/{rows.length} ≥ {floor}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-[10px] gap-y-[6px]">
        {rows.map((row) => {
          const pct = Math.round((row.total / 1000) * 100);
          const fail = row.total < floor;
          return (
            <div key={row.slot} className="flex items-center gap-[7px] text-[11px]">
              <span className="w-[78px] text-ink">{row.slot}</span>
              <span className={`bt-bar flex-1 ${fail ? 'fail' : ''}`}>
                <span className="v" style={{ width: `${pct}%` }} />
              </span>
              <span
                className={`w-[32px] text-right text-[11px] font-semibold tabular-nums ${
                  fail ? 'text-accent-warm' : 'text-ink'
                }`}
              >
                {row.total}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-[9px] flex justify-between text-[11px] text-ink-dim">
        <span>
          Mean <b className="font-semibold text-good">{mean}</b> · Min{' '}
          <b className="font-semibold text-good">{min}</b> · Floor {floor}
        </span>
        <span>Re-run on every scope change</span>
      </div>
    </section>
  );
}
