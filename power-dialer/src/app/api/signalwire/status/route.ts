import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import { validateSignalWireSignature } from '@/lib/signalwire-server';

export const dynamic = 'force-dynamic';

/**
 * SignalWire POSTs here when a call ends.
 *
 * Set this URL in SignalWire Console → Voice API → Status Callback:
 *   https://your-domain.com/api/signalwire/status
 *
 * Posts: CallSid, CallStatus, CallDuration, To, From, etc.
 * (Identical field names to Twilio status callbacks.)
 */
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
      console.warn('[/api/signalwire/status] Invalid signature — rejected');
      return new NextResponse('OK', { status: 200 }); // always 200 to avoid retries
    }

    const callSid      = params.CallSid;
    const callStatus   = params.CallStatus;
    const callDuration = parseInt(params.CallDuration ?? '0', 10);

    console.log(`[SignalWire Status] ${callSid} → ${callStatus} (${callDuration}s)`);

    if (!callSid) return new NextResponse('OK', { status: 200 });

    // Find the call log with this CallSid
    const logsSnap = await adminDb
      .collection(COLLECTIONS.CALL_LOGS)
      .where('callSid', '==', callSid)
      .limit(1)
      .get();

    if (!logsSnap.empty) {
      const logRef  = logsSnap.docs[0].ref;
      const logData = logsSnap.docs[0].data();

      await logRef.update({
        endedAt:         new Date().toISOString(),
        durationSeconds: callDuration,
        callStatus,
      });

      // Accumulate agent talk time
      if (logData.agentId && callDuration > 0) {
        const { FieldValue } = await import('firebase-admin/firestore');
        await adminDb.collection(COLLECTIONS.AGENTS).doc(logData.agentId).update({
          talkTimeSeconds: FieldValue.increment(callDuration),
          status:          'AVAILABLE',
          currentLeadId:   null,
          lastActiveAt:    new Date().toISOString(),
        });
      }
    }

    // Always 200 — SignalWire will retry on non-200
    return new NextResponse('OK', { status: 200 });
  } catch (err: unknown) {
    console.error('[/api/signalwire/status]', err);
    return new NextResponse('OK', { status: 200 });
  }
}
