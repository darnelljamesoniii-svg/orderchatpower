import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, DEFAULT_DISPOSITIONS, DEFAULT_CAMPAIGNS } from '@/lib/collections';

export const dynamic = 'force-dynamic';

/**
 * Idempotent seed — safe to call multiple times.
 * Seeds dispositions and campaign waves only if they don't already exist.
 * Called automatically by the supervisor page on every load.
 */
export async function POST() {
  try {
    const batch = adminDb.batch();
    let seeded  = 0;

    // Seed dispositions
    for (const disp of DEFAULT_DISPOSITIONS) {
      const ref  = adminDb.collection(COLLECTIONS.DISPOSITIONS).doc(disp.id);
      const snap = await ref.get();
      if (!snap.exists) {
        const { id: _id, ...data } = disp;
        batch.set(ref, data);
        seeded++;
      }
    }

    // Seed campaign waves
    for (const wave of DEFAULT_CAMPAIGNS) {
      const ref  = adminDb.collection(COLLECTIONS.CAMPAIGNS).doc(wave.id);
      const snap = await ref.get();
      if (!snap.exists) {
        const { id: _id, ...data } = wave;
        batch.set(ref, data);
        seeded++;
      }
    }

    if (seeded > 0) await batch.commit();

    return NextResponse.json({
      success: true,
      seeded,
      message: seeded > 0
        ? `Seeded ${seeded} default records`
        : 'Firestore ready',
    });
  } catch (err: unknown) {
    console.error('[/api/supervisor/seed]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Seed failed' },
      { status: 500 },
    );
  }
}
