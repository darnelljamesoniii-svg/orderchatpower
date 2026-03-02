import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { sendEmail } = await import("@/lib/resend");
  const { adminDb } = await import("@/lib/firebase-admin");
  const { COLLECTIONS } = await import("@/lib/collections");
  const { FieldValue } = await import("firebase-admin/firestore");

  try {
    const { to, subject, body, callLogId, leadId } = await request.json();

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: "to, subject, body required" },
        { status: 400 }
      );
    }

    const result = await sendEmail({ to, subject, body });

    if (callLogId) {
      await adminDb.collection(COLLECTIONS.CALL_LOGS).doc(callLogId).update({
        emailSent: true,
        resendId: result?.id ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (leadId) {
      await adminDb.collection(COLLECTIONS.LEADS).doc(leadId).update({
        lastContactedAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ ok: true, resendId: result?.id ?? null });
  } catch (err) {
    console.error("[/api/email/send]", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
