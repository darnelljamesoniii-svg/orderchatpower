import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { targetUid, supervisorUid, active } = await req.json();

    if (!targetUid || !supervisorUid || active === undefined) {
      return NextResponse.json(
        { error: 'targetUid, supervisorUid, active required' },
        { status: 400 },
      );
    }

    // Verify supervisor
    const supervisorSnap = await adminDb
      .collection(COLLECTIONS.USERS)
      .doc(supervisorUid)
      .get();

    if (!supervisorSnap.exists || supervisorSnap.data()?.role !== 'supervisor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Disable/enable in Firebase Auth
    await adminAuth.updateUser(targetUid, { disabled: !active });

    // Update Firestore
    await adminDb.collection(COLLECTIONS.USERS).doc(targetUid).update({
      active,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, active });
  } catch (err: unknown) {
    console.error('[/api/auth/deactivate-user]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}
