import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { getAdminDb } from '@/lib/firebase-admin';
export const runtime = 'nodejs';
const adminDb = getAdminDb();
import { COLLECTIONS, DEFAULT_CAMPAIGNS } from '@/lib/collections';
export const runtime = 'nodejs';

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


