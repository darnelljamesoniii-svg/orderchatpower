import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import type { CallLog } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { leadId, agentId, callSid } = await req.json();
    if (!leadId || !agentId) {
      return NextResponse.json({ error: 'leadId and agentId required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const ref = adminDb.collection(COLLECTIONS.CALL_LOGS).doc();

    const log: Omit<CallLog, 'id'> = {
      leadId,
      agentId,
      callSid:         callSid ?? null,
      startedAt:       now,
      endedAt:         undefined,
      durationSeconds: undefined,
      disposition:     undefined,
      notes:           '',
      transcript:      [],
    };

    await ref.set(log);

    await adminDb.collection(COLLECTIONS.AGENTS).doc(agentId).update({
      status:        'ON_CALL',
      currentLeadId: leadId,
      lastActiveAt:  now,
    });

    return NextResponse.json({ callLogId: ref.id });
  } catch (err: unknown) {
    console.error('[/api/leads/calllog POST]', err);
    return NextResponse.json({ error: 'Failed to create call log' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { callLogId, speaker, text } = await req.json();
    if (!callLogId || !speaker || !text) {
      return NextResponse.json({ error: 'callLogId, speaker, text required' }, { status: 400 });
    }
    const { FieldValue } = await import('firebase-admin/firestore');
    const entry = { speaker, text, timestamp: new Date().toISOString() };
    await adminDb.collection(COLLECTIONS.CALL_LOGS).doc(callLogId).update({
      transcript: FieldValue.arrayUnion(entry),
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[/api/leads/calllog PATCH]', err);
    return NextResponse.json({ error: 'Failed to append transcript' }, { status: 500 });
  }
}
