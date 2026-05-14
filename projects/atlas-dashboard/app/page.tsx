import { headers } from 'next/headers';
import Orb from './components/Orb';
import Mindmap from './components/Mindmap';
import ScopeCard from './components/ScopeCard';
import BacktestGrid from './components/BacktestGrid';
import ReviewCadence from './components/ReviewCadence';
import OpenQuestions from './components/OpenQuestions';
import TranscriptBar from './components/TranscriptBar';
import { DEMO_PROJECT, type DemoProject } from '@/lib/demo';

// Render at request time so the review dates are computed against "today"
// every load. (Static export would freeze them at build time.)
export const dynamic = 'force-dynamic';

async function loadProject(): Promise<DemoProject> {
  // Build an absolute URL so server-side fetch works on Vercel.
  const h = headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  try {
    const res = await fetch(`${proto}://${host}/api/projects`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { projects: DemoProject[] };
    return data.projects[0] ?? DEMO_PROJECT;
  } catch {
    // Fall back to the bundled fixture if the API isn't reachable
    // (e.g. during local first-render before any deploy).
    return DEMO_PROJECT;
  }
}

export default async function Page() {
  const project = await loadProject();

  return (
    <main>
      {/* Top bar */}
      <header className="fixed left-0 right-0 top-0 z-[5] flex h-14 items-center gap-[14px] bg-[linear-gradient(180deg,rgba(8,14,30,0.85),rgba(8,14,30,0))] px-[22px] backdrop-blur-md">
        <div className="flex items-center gap-[10px] font-semibold tracking-[0.4px]">
          <span className="h-[10px] w-[10px] rounded-full bg-[radial-gradient(circle,var(--orb),var(--orb-deep))] shadow-[0_0_12px_2px_rgba(78,197,255,0.6)]" />
          ATLAS
        </div>
        <div className="text-[12.5px] text-ink-dim">
          Workspace · <b className="font-semibold text-ink">Blake Crawford</b> · Project Discussion ·{' '}
          <b className="font-semibold text-ink">Atlas v0.3</b>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-full border border-line bg-[rgba(20,36,70,0.6)] px-3 py-[6px] text-[12px] text-ink-dim">
          <span className="h-[7px] w-[7px] animate-pulse-orb rounded-full bg-good shadow-[0_0_8px_var(--good)]" />
          <span>
            Session live · <b className="font-semibold text-ink">11:00 AM ET</b> · Google Meet
          </span>
        </div>
      </header>

      {/* Stage: mindmap + orb + scope card */}
      <section className="fixed bottom-[100px] left-0 right-[420px] top-14">
        <div className="absolute left-[18px] top-[14px] flex max-w-[420px] flex-wrap gap-2">
          <Chip color="#6ee7ff">System node</Chip>
          <Chip color="#ffb86b">Open question</Chip>
          <Chip color="#5dffa5">Confirmed</Chip>
          <Chip color="#9aa8c5">Inferred</Chip>
        </div>

        <ScopeCard project={project} />
        <Mindmap nodes={project.nodes} />
        <Orb />
      </section>

      {/* Right panel */}
      <aside className="fixed bottom-0 right-0 top-14 flex w-[420px] flex-col overflow-hidden border-l border-[rgba(120,170,255,0.12)] bg-panel backdrop-blur-md">
        <div className="border-b border-[rgba(120,170,255,0.10)] px-[18px] pb-[10px] pt-[14px]">
          <div className="text-[13.5px] font-semibold tracking-[0.3px]">
            Workflow consultation · Atlas v0.3
          </div>
          <div className="mt-[3px] text-[11.5px] text-ink-dim">
            Full-scope prompt engineer · backtests every plan against 12 models before execute ·
            books 30/90/180 reviews
          </div>
        </div>

        <BacktestGrid rows={project.backtest} floor={project.floor} />
        <ReviewCadence reviews={project.reviews} />
        <OpenQuestions questions={project.questions} />
      </aside>

      <TranscriptBar text={project.transcriptHint} openQuestions={project.openQuestions} />
    </main>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[6px] rounded-full border border-line bg-[rgba(14,24,48,0.65)] px-[9px] py-1 text-[10.5px] tracking-[0.3px] text-ink-dim">
      <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
      {children}
    </span>
  );
}
