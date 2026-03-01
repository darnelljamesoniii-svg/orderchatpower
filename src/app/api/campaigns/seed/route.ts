import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, DEFAULT_CAMPAIGNS } from '@/lib/collections';

export const dynamic = 'force-dynamic';

export async function POST() {
  const batch = adminDb.batch();
  const now = new Date().toISOString();

  for (const c of DEFAULT_CAMPAIGNS) {
    const ref = adminDb.collection(COLLECTIONS.CAMPAIGNS).doc(c.id);
    batch.set(
      ref,
      {
        id: c.id,
        name: c.name,
        isActive: c.isActive,
        startHourLocal: c.startHourLocal,
        endHourLocal: c.endHourLocal,
        timezone: c.timezone,
        description: c.description,
        updatedAt: now,
      },
      { merge: true },
    );
  }

  await batch.commit();
  return NextResponse.json({ ok: true, seeded: DEFAULT_CAMPAIGNS.map(c => c.id) });
}
