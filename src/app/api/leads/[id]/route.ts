import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';
// PATCH /api/leads/[id]
// Accepts: { email?, phone2?, notes? }
// Used by inline edit in BattleStation lead card
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    if (!id) return NextResponse.json({ error: 'Lead ID required' }, { status: 400 });

    const body = await req.json();

    // Whitelist updatable fields — never allow status changes from this route
    const allowed = ['email', 'phone2', 'phone', 'contactName', 'businessName', 'address', 'notes'];
    const updates: Record<string, string> = { updatedAt: new Date().toISOString() };

    for (const key of allowed) {
      if (key in body && typeof body[key] === 'string') {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    await adminDb.collection(COLLECTIONS.LEADS).doc(id).update(updates);
    return NextResponse.json({ success: true, updated: updates });
  } catch (err: unknown) {
    console.error('[/api/leads/[id] PATCH]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
