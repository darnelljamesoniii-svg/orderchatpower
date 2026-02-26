import { NextRequest, NextResponse } from 'next/server';
import { applyDisposition } from '@/lib/queue-engine';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import { createSquarePaymentLink } from '@/lib/square';
import { sendPaymentSms } from '@/lib/signalwire-server';
import { FieldValue } from 'firebase-admin/firestore';
import type { DispositionPayload } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const payload: DispositionPayload = await req.json();
    const { leadId, agentId, callLogId, action, dispositionLabel, recallAt, notes, squareAmount } = payload;

    if (!leadId || !agentId || !action) {
      return NextResponse.json({ error: 'leadId, agentId, action required' }, { status: 400 });
    }

    await applyDisposition(leadId, agentId, action, recallAt, notes);

    if (callLogId) {
      const logRef  = adminDb.collection(COLLECTIONS.CALL_LOGS).doc(callLogId);
      const logSnap = await logRef.get();
      if (logSnap.exists) {
        const startedAt       = logSnap.data()?.startedAt;
        const durationSeconds = startedAt
          ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
          : 0;
        await logRef.update({
          disposition:      action,
          dispositionLabel: dispositionLabel,
          endedAt:          new Date().toISOString(),
          durationSeconds,
          notes:            notes ?? '',
        });
      }
    }

    let squareUrl: string | undefined;

    if (action === 'SUCCESS') {
      const leadSnap = await adminDb.collection(COLLECTIONS.LEADS).doc(leadId).get();
      if (leadSnap.exists) {
        const lead = leadSnap.data()!;
        try {
          const paymentResult = await createSquarePaymentLink({
            amountCents: squareAmount ?? 19900,
            description: `AgenticLife SEO Package — ${lead.businessName}`,
            referenceId: leadId,
            buyerName:   lead.contactName,
          });
          squareUrl = paymentResult.url;
          await adminDb.collection(COLLECTIONS.LEADS).doc(leadId).update({ squarePaymentUrl: squareUrl });
          if (lead.phone) await sendPaymentSms(lead.phone, squareUrl, lead.businessName);
        } catch (err) {
          console.error('[Square/SMS error]', err);
        }
      }
    }

    await adminDb.collection(COLLECTIONS.AGENTS).doc(agentId).set(
      {
        status:        'AVAILABLE',
        currentLeadId: null,
        lastActiveAt:  new Date().toISOString(),
        callsToday:    FieldValue.increment(1),
        ...(action === 'SUCCESS' ? { revenueToday: FieldValue.increment(squareAmount ?? 19900) } : {}),
      },
      { merge: true },
    );

    return NextResponse.json({ success: true, squareUrl });
  } catch (err: unknown) {
    console.error('[/api/leads/dispose]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
