import { NextRequest, NextResponse } from 'next/server';
import { generateAccessToken } from '@/lib/signalwire-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { agentId } = await req.json();
    if (!agentId) {
      return NextResponse.json({ error: 'agentId required' }, { status: 400 });
    }
    const token = generateAccessToken(agentId);
    return NextResponse.json({ token });
  } catch (err: unknown) {
    console.error('[/api/signalwire/token]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Token generation failed' },
      { status: 500 },
    );
  }
}
