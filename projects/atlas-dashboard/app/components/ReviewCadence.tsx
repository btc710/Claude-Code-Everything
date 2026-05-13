import type { ReviewPoint } from '@/lib/demo';

const TONE: Record<ReviewPoint['status'], string> = {
  'on-track': 'text-good before:bg-good before:shadow-[0_0_6px_var(--good)]',
  'pending':  'text-accent-warm before:bg-accent-warm before:shadow-[0_0_6px_var(--accent-warm)]',
  'not-yet':  'text-ink-dim before:bg-ink-dim',
};

export default function ReviewCadence({ reviews }: { reviews: ReviewPoint[] }) {
  return (
    <section className="border-b border-[rgba(120,170,255,0.10)] px-[18px] py-3">
      <div className="mb-[9px] flex items-center gap-[7px] text-[10.5px] font-semibold uppercase tracking-[1.6px] text-ink-dim">
        Review cadence
        <span className="ml-auto rounded-full bg-[rgba(93,255,165,0.10)] px-[7px] py-[1px] text-[10px] tracking-[0.5px] text-good">
          auto-scheduled
        </span>
      </div>

      <div className="mt-1 flex gap-2">
        {reviews.map((rv) => (
          <div
            key={rv.when}
            className="flex-1 rounded-[8px] border border-[rgba(120,170,255,0.16)] bg-[rgba(20,36,70,0.55)] px-[10px] py-2"
          >
            <div className="text-[14px] font-bold leading-tight tracking-[-0.3px] text-ink">
              {rv.when}
            </div>
            <div className="text-[10px] uppercase tracking-[0.4px] text-ink-dim">{rv.date}</div>
            <div
              className={`mt-[6px] flex items-center gap-[6px] text-[11px] before:h-[6px] before:w-[6px] before:rounded-full before:content-[''] ${TONE[rv.status]}`}
            >
              {rv.statusLabel}
            </div>
            <div className="mt-1 text-[10.5px] text-ink-dim">{rv.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
