import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';

export const dynamic = 'force-dynamic';

/**
 * Scans for IN_PROGRESS leads where lockedUntil < NOW and resets them
 * back to their previous recall status or NEW.
 *
 * Call this endpoint from:
 *  - A Vercel Cron Job (vercel.json)  every 2 minutes
 *  - OR a simple setInterval on the supervisor page
 *
 * Vercel cron config (add to vercel.json):
 * {
 *   "crons": [{ "path": "/api/leads/unlock", "schedule": "* /2 * * * *" }]
 * }
 * (Note: remove the space in * /2 above — it's there to avoid comment issues)
 */
export async function GET(req: NextRequest) {
  // Optional: protect with a secret header when called from cron
  const secret = req.headers.get('x-cron-secret');
  if (process.env.NODE_ENV === 'production' && secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now    = new Date().toISOString();
    const leadsRef = adminDb.collection(COLLECTIONS.LEADS);

    const staleSnap = await leadsRef
      .where('status', '==', 'IN_PROGRESS')
      .where('lockedUntil', '<', now)
      .limit(50)
      .get();

    if (staleSnap.empty) {
      return NextResponse.json({ released: 0 });
    }

    const batch = adminDb.batch();
    let count   = 0;

    staleSnap.docs.forEach(doc => {
      const data = doc.data();
      // Put it back in the appropriate recall queue
      const restoreStatus = data.retryCount > 0 ? 'CALLBACK_AUTO' : 'NEW';
      batch.update(doc.ref, {
        status:          restoreStatus,
        assignedAgentId: null,
        lockedUntil:     null,
        updatedAt:       now,
        // If it was mid-call, count as a no-answer
        nextAvailableAt: restoreStatus === 'CALLBACK_AUTO'
          ? new Date(Date.now() + 5 * 60 * 1000).toISOString() // +5 min
          : null,
      });
      count++;
    });

    await batch.commit();
    console.log(`[/api/leads/unlock] Released ${count} stale leads`);

    return NextResponse.json({ released: count });
  } catch (err: unknown) {
    console.error('[/api/leads/unlock]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
