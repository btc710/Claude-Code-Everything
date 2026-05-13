import { NextResponse } from 'next/server';
import { buildDemoProject, type DemoProject } from '@/lib/demo';

// Node runtime — we may want to `require('atlas-project-ledger')` later,
// and edge runtime doesn't support CommonJS-native modules.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface InMemoryStore {
  projects: DemoProject[];
}

// Cheap module-scoped cache. Will reset on cold-start. For the demo this
// is acceptable; in real use the ledger module owns persistence.
const memory: InMemoryStore = { projects: [buildDemoProject()] };

export async function GET() {
  // Refresh the seed project's review dates each call so the dashboard
  // always shows reviews relative to "today".
  memory.projects[0] = { ...buildDemoProject(), ...memory.projects[0], reviews: buildDemoProject().reviews };
  return NextResponse.json({ projects: memory.projects });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<DemoProject>;
    if (!body?.name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 });
    }

    const seed = buildDemoProject();
    const next: DemoProject = {
      ...seed,
      ...body,
      id: body.id ?? `proj_${Date.now()}`,
      nodes: body.nodes ?? seed.nodes,
      backtest: body.backtest ?? seed.backtest,
      reviews: body.reviews ?? seed.reviews,
      questions: body.questions ?? seed.questions,
    };
    memory.projects.push(next);
    return NextResponse.json({ project: next }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
