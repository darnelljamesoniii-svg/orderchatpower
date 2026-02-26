import { NextRequest, NextResponse } from 'next/server';
import { getNextLead } from '@/lib/queue-engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body     = await req.json();
    const agentId: string = body.agentId;

    if (!agentId) {
      return NextResponse.json({ error: 'agentId is required' }, { status: 400 });
    }

    const result = await getNextLead(agentId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[/api/leads/next]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
