import { NextRequest, NextResponse } from 'next/server';
import { generateAccessToken } from '@/lib/signalwire-server';
import { getNextCallerId } from '@/lib/caller-ids';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handle(agentId: string | null) {
  try {
    if (!agentId) {
      return NextResponse.json({ error: 'agentId required' }, { status: 400 });
    }

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

export async function POST(req: NextRequest) {
  const { agentId } = await req.json().catch(() => ({}));
  return handle(agentId ?? null);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return handle(searchParams.get('agentId'));
}
