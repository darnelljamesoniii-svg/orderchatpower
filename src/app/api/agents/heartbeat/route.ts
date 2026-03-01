import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';

export const dynamic = 'force-dynamic';

/**
 * Called every 30 seconds by the Battle Station to keep the agent alive.
 * If an agent stops sending heartbeats, a cron/unlock job can mark them OFFLINE.
 */
export async function POST(req: NextRequest) {
  try {
    const { agentId, status } = await req.json();
    if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 });

    await adminDb.collection(COLLECTIONS.AGENTS).doc(agentId).update({
      lastActiveAt: new Date().toISOString(),
      ...(status ? { status } : {}),
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[/api/agents/heartbeat]', err);
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 });
  }
}

/**
 * GET: Mark agent offline (called on page unload via navigator.sendBeacon)
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId');
    if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 });

    await adminDb.collection(COLLECTIONS.AGENTS).doc(agentId).update({
      status:        'OFFLINE',
      currentLeadId: null,
      lastActiveAt:  new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[/api/agents/heartbeat DELETE]', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
