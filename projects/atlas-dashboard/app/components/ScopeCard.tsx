import type { DemoProject } from '@/lib/demo';

interface ScopeCardProps {
  project: DemoProject;
}

export default function ScopeCard({ project }: ScopeCardProps) {
  return (
    <div className="absolute right-[18px] top-[14px] w-[270px] rounded-[10px] border border-line bg-[rgba(14,24,48,0.78)] px-[14px] py-[10px] shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
      <div className="mb-[6px] text-[10px] uppercase tracking-[1.6px] text-ink-dim">
        Scope confidence
      </div>

      <div className="mb-1 flex items-center justify-between text-[11.5px]">
        <b className="font-semibold text-ink">Project</b>
        <span className="text-ink-dim">{project.name}</span>
      </div>
      <div className="mb-1 flex items-center justify-between text-[11.5px]">
        <b className="font-semibold text-ink">Intents captured</b>
        <span className="text-ink-dim">{project.intentsCaptured} / {project.intentsTotal}</span>
      </div>
      <div className="mb-1 flex items-center justify-between text-[11.5px]">
        <b className="font-semibold text-ink">Open questions</b>
        <span className="text-ink-dim">{project.openQuestions} unresolved</span>
      </div>
      <div className="mb-1 flex items-center justify-between text-[11.5px]">
        <b className="font-semibold text-ink">Backtest models</b>
        <span className="text-ink-dim">
          {project.passingModels} / {project.totalModels} passing
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[28px] font-bold leading-none tracking-[-0.5px] text-good">
          {project.avgScore}
        </span>
        <span className="text-[11px] text-ink-dim">avg backtest score</span>
      </div>

      <div className="floor-bar mt-1">
        <div className="fill" style={{ width: `${project.scopeFillPct}%` }} />
      </div>
      <div className="mt-[3px] flex justify-between text-[9.5px] text-ink-dim">
        <span>0</span>
        <span><b className="font-semibold text-accent-warm">floor {project.floor}</b></span>
        <span>1000</span>
      </div>
    </div>
  );
}
