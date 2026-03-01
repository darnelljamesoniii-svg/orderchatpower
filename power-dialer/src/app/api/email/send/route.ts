import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/resend';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import { FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, placeId, sessionId, agentId, leadId, callLogId } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'to, subject, body required' }, { status: 400 });
    }

    // Send via Resend
    const result = await sendEmail({ to, subject, body, placeId, sessionId });

    // Log to call_logs if we have a callLogId
    if (callLogId) {
      await adminDb.collection(COLLECTIONS.CALL_LOGS).doc(callLogId).update({
        emailSentAt: new Date().toISOString(),
        emailTo:     to,
      });
    }

    // Log to lead doc
    if (leadId) {
      await adminDb.collection(COLLECTIONS.LEADS).doc(leadId).update({
        lastEmailSentAt: new Date().toISOString(),
        updatedAt:       new Date().toISOString(),
      });
    }

    // Log email event to a separate collection for audit trail
    await adminDb.collection('email_logs').add({
      resendId:  result.id,
      to,
      subject,
      placeId:   placeId ?? null,
      sessionId: sessionId ?? null,
      agentId:   agentId ?? null,
      leadId:    leadId ?? null,
      sentAt:    new Date().toISOString(),
    });

    return NextResponse.json({ success: true, messageId: result.id });
  } catch (err: unknown) {
    console.error('[/api/email/send]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Email send failed' },
      { status: 500 },
    );
  }
}
