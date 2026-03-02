import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
const adminDb = getAdminDb();
import { COLLECTIONS } from '@/lib/collections';
import { validateSignalWireSignature } from '@/lib/signalwire-server';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const apiToken  = process.env.SIGNALWIRE_REST_API_TOKEN!;
    const signature = req.headers.get('x-signalwire-signature') ?? '';
    const url       = `${process.env.NEXT_PUBLIC_APP_URL}/api/signalwire/status`;

    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((val, key) => { params[key] = val.toString(); });

    const isValid = validateSignalWireSignature(apiToken, signature, url, params);
    if (!isValid) {
      console.warn('[/api/signalwire/status] Invalid signature');
      return new NextResponse('OK', { status: 200 });
    }

    const callSid      = params.CallSid;
    const callStatus   = params.CallStatus;
    const callDuration = parseInt(params.CallDuration ?? '0', 10);

    if (!callSid) return new NextResponse('OK', { status: 200 });

    // Find call log
    const logsSnap = await adminDb
      .collection(COLLECTIONS.CALL_LOGS)
      .where('callSid', '==', callSid)
      .limit(1)
      .get();

    if (!logsSnap.empty) {
      const logRef    = logsSnap.docs[0].ref;
      const logData   = logsSnap.docs[0].data();
      const callLogId = logsSnap.docs[0].id;

      await logRef.update({
        endedAt:         new Date().toISOString(),
        durationSeconds: callDuration,
        callStatus,
      });

      // Update agent talk time
      if (logData.agentId && callDuration > 0) {
        const { FieldValue } = await import('firebase-admin/firestore');
        await adminDb.collection(COLLECTIONS.AGENTS).doc(logData.agentId).update({
          talkTimeSeconds: FieldValue.increment(callDuration),
          status:          'AVAILABLE',
          currentLeadId:   null,
          lastActiveAt:    new Date().toISOString(),
        });
      }

      // Fire async coaching for calls >= 2 minutes â€” never blocks this response
      if (callDuration >= 120 && callStatus === 'completed') {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        fetch(`${appUrl}/api/gemini/call-summary`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ callLogId }),
        }).catch(err => console.error('[coaching fire-and-forget]', err));
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err: unknown) {
    console.error('[/api/signalwire/status]', err);
    return new NextResponse('OK', { status: 200 });
  }
}




