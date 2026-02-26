import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';

export const dynamic = 'force-dynamic';

/**
 * Called when an agent opens the Battle Station.
 * Creates the agent document if it doesn't exist, or reactivates it.
 */
export async function POST(req: NextRequest) {
  try {
    const { agentId, agentName } = await req.json();
    if (!agentId || !agentName) {
      return NextResponse.json({ error: 'agentId and agentName required' }, { status: 400 });
    }

    const ref  = adminDb.collection(COLLECTIONS.AGENTS).doc(agentId);
    const snap = await ref.get();
    const now  = new Date().toISOString();

    if (!snap.exists) {
      // First login — create fresh doc
      await ref.set({
        id:               agentId,
        name:             agentName,
        status:           'AVAILABLE',
        currentLeadId:    null,
        callsToday:       0,
        revenueToday:     0,
        talkTimeSeconds:  0,
        lastActiveAt:     now,
        createdAt:        now,
      });
    } else {
      // Re-login — reset to available, keep historical counters
      await ref.update({
        name:          agentName,
        status:        'AVAILABLE',
        currentLeadId: null,
        lastActiveAt:  now,
      });
    }

    return NextResponse.json({ success: true, agentId });
  } catch (err: unknown) {
    console.error('[/api/agents/register]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
