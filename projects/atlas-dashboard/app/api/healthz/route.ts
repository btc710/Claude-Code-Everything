import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, service: 'atlas-dashboard', ts: Date.now() });
}
