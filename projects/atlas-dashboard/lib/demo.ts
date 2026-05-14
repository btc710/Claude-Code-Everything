/*
 * Demo data for the deployed Atlas dashboard.
 *
 * In a real deployment the API routes would `require('atlas-project-ledger')`
 * and read from the persistent store. For the static Vercel demo we expose
 * the same shape with hard-coded fixtures so the dashboard renders without
 * a database.
 */

export type NodeStatus = 'confirmed' | 'system' | 'open' | 'inferred';

export interface MindmapNode {
  id: string;
  title: string;
  meta: string;
  tag: string;
  status: NodeStatus;
  // % positions inside the stage container
  left: number;
  top: number;
}

export interface BacktestSlotResult {
  slot: string;
  total: number;
  dimensions: Record<string, number>;
}

export interface ReviewPoint {
  when: '30d' | '90d' | '180d';
  date: string;
  status: 'on-track' | 'pending' | 'not-yet';
  statusLabel: string;
  detail: string;
}

export interface OpenQuestion {
  n: string;
  text: string;
}

export interface DemoProject {
  id: string;
  name: string;
  intentsCaptured: number;
  intentsTotal: number;
  openQuestions: number;
  passingModels: number;
  totalModels: number;
  avgScore: number;
  floor: number;
  scopeFillPct: number; // 0..100 — how full the scope bar reads
  nodes: MindmapNode[];
  backtest: BacktestSlotResult[];
  reviews: ReviewPoint[];
  questions: OpenQuestion[];
  transcriptHint: string;
}

// Backtest scores match the mockup. Bar widths are score/10 (rounded) to
// match the visual percentages from the mockup.
const BACKTEST: BacktestSlotResult[] = [
  { slot: 'opus-4.7',     total: 912, dimensions: { reasoning: 92, scope: 90, safety: 91 } },
  { slot: 'sonnet-4.6',   total: 874, dimensions: { reasoning: 88, scope: 86, safety: 88 } },
  { slot: 'haiku-4.5',    total: 792, dimensions: { reasoning: 80, scope: 78, safety: 79 } },
  { slot: 'opus-4.6',     total: 881, dimensions: { reasoning: 89, scope: 88, safety: 87 } },
  { slot: 'gpt-5.0',      total: 853, dimensions: { reasoning: 86, scope: 85, safety: 85 } },
  { slot: 'gpt-5-mini',   total: 781, dimensions: { reasoning: 79, scope: 77, safety: 78 } },
  { slot: 'gemini-2.5',   total: 823, dimensions: { reasoning: 83, scope: 82, safety: 82 } },
  { slot: 'gemini-flash', total: 762, dimensions: { reasoning: 77, scope: 75, safety: 76 } },
  { slot: 'grok-4',       total: 804, dimensions: { reasoning: 81, scope: 80, safety: 80 } },
  { slot: 'llama-4-405',  total: 811, dimensions: { reasoning: 82, scope: 80, safety: 81 } },
  { slot: 'mistral-lg',   total: 771, dimensions: { reasoning: 78, scope: 76, safety: 77 } },
  { slot: 'deepseek-v3',  total: 788, dimensions: { reasoning: 79, scope: 78, safety: 79 } },
];

function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function fmt(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function buildDemoProject(now: Date = new Date()): DemoProject {
  const reviews: ReviewPoint[] = [
    {
      when: '30d',
      date: fmt(addDays(now, 30)),
      status: 'on-track',
      statusLabel: 'On track',
      detail: 'Delivery, adoption, drift signals',
    },
    {
      when: '90d',
      date: fmt(addDays(now, 90)),
      status: 'pending',
      statusLabel: 'Pending intake',
      detail: 'Failure modes, regressions, RCAs',
    },
    {
      when: '180d',
      date: fmt(addDays(now, 180)),
      status: 'not-yet',
      statusLabel: 'Not yet',
      detail: 'Scope-creep audit, full rebaseline',
    },
  ];

  return {
    id: 'proj_atlas_v0_3_hubspot_meet_email',
    name: 'HubSpot → Meet → Email',
    intentsCaptured: 14,
    intentsTotal: 14,
    openQuestions: 3,
    passingModels: 12,
    totalModels: 12,
    avgScore: 812,
    floor: 750,
    scopeFillPct: 86,
    nodes: [
      { id: 'n1', title: 'HubSpot CRM',        meta: 'contact lookup',                 tag: 'confirmed',     status: 'confirmed', left: 15, top: 22 },
      { id: 'n2', title: 'Scope intake',       meta: '14 intents captured',            tag: 'system',        status: 'system',    left: 16, top: 50 },
      { id: 'n3', title: 'Backtest gate',      meta: 'avg 812',                        tag: '12/12 ≥ 750', status: 'confirmed', left: 17, top: 78 },
      { id: 'n4', title: 'Google Calendar',    meta: 'Fri May 15, 11:00 AM ET',        tag: 'confirmed',     status: 'confirmed', left: 50, top: 11 },
      { id: 'n5', title: '30 / 90 / 180 review', meta: 'auto-scheduled post-mortems',  tag: 'system',        status: 'system',    left: 50, top: 89 },
      { id: 'n6', title: 'Generate Meet link', meta: 'hangoutsMeet conference',        tag: 'system',        status: 'system',    left: 84, top: 22 },
      { id: 'n7', title: 'CC team on invite',  meta: 'deal owners + fallback list?',   tag: 'open',          status: 'open',      left: 85, top: 50 },
      { id: 'n8', title: 'CRM note privacy',   meta: 'log Meet URL or hide?',          tag: 'open',          status: 'open',      left: 84, top: 78 },
    ],
    backtest: BACKTEST,
    reviews,
    questions: [
      { n: '01', text: 'Calendar CC: pull from HubSpot deal owners, or use a static team list when no deal exists?' },
      { n: '02', text: 'CRM note: include the raw Meet URL, or link to the Calendar event only? (security trade-off)' },
      { n: '03', text: 'Declined invitees: auto-reschedule the meeting, or leave the slot booked with the rest of the team?' },
    ],
    transcriptHint:
      '"...so when a deal moves to Closed Won, auto-schedule a follow-up two weeks out and run the same 12-model backtest before sending..."',
  };
}

export const DEMO_PROJECT: DemoProject = buildDemoProject();
