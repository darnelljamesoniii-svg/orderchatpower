import { NextRequest, NextResponse } from 'next/server';
import { generateAccessToken } from '@/lib/signalwire-server';
import { getNextCallerId } from '@/lib/caller-ids';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { agentId } = await req.json();
    if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 });

    const [token, callerId] = await Promise.all([
      generateAccessToken(agentId),
      getNextCallerId(),
    ]);

    return NextResponse.json({ token, callerId });
  } catch (err: unknown) {
    console.error('[/api/signalwire/token]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Token generation failed' },
      { status: 500 },
    );
  }
}

