import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { adminDb } = await import("@/lib/firebase-admin");
  const { COLLECTIONS, DEFAULT_CAMPAIGNS } = await import("@/lib/collections");

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
