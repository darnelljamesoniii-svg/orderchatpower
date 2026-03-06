import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import { validateSignalWireSignature } from '@/lib/signalwire-signature';
import { getOptionalSignalWireAuthToken } from '@/lib/signalwire-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const adminDb = getAdminDb();

function inferBaseUrl(req: NextRequest) {
  const envBase = (process.env.PUBLIC_BASE_URL ?? '').trim();
  if (envBase) return envBase;

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : '';
}

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('x-signalwire-signature') ?? req.headers.get('x-twilio-signature') ?? '';
    const url = `${inferBaseUrl(req)}/api/signalwire/status`;

    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((val, key) => {
      params[key] = val.toString();
    });

    const authToken = getOptionalSignalWireAuthToken();
    if (authToken) {
      const isValid = validateSignalWireSignature(signature, url, params, authToken);
      if (!isValid) {
        console.warn('[/api/signalwire/status] Invalid signature');
        return new NextResponse('OK', { status: 200 });
      }
    } else {
      console.warn('[/api/signalwire/status] No auth token configured; accepting callback without signature validation.');
    }

    const callSid = params.CallSid;
    const callStatus = params.CallStatus;
    const callDuration = parseInt(params.CallDuration ?? '0', 10);

    if (!callSid) return new NextResponse('OK', { status: 200 });

    const logsSnap = await adminDb
      .collection(COLLECTIONS.CALL_LOGS)
      .where('callSid', '==', callSid)
      .limit(1)
      .get();

    if (!logsSnap.empty) {
      const logRef = logsSnap.docs[0].ref;
      const logData = logsSnap.docs[0].data();
      const callLogId = logsSnap.docs[0].id;

      await logRef.update({
        endedAt: new Date().toISOString(),
        durationSeconds: callDuration,
        callStatus,
      });

      if (logData.agentId && callDuration > 0) {
        const { FieldValue } = await import('firebase-admin/firestore');
        await adminDb.collection(COLLECTIONS.AGENTS).doc(logData.agentId).update({
          talkTimeSeconds: FieldValue.increment(callDuration),
          status: 'AVAILABLE',
          currentLeadId: null,
          lastActiveAt: new Date().toISOString(),
        });
      }

      if (callDuration >= 120 && callStatus === 'completed') {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        if (appUrl) {
          fetch(`${appUrl}/api/gemini/call-summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callLogId }),
          }).catch((err) => console.error('[coaching fire-and-forget]', err));
        }
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err: unknown) {
    console.error('[/api/signalwire/status]', err);
    return new NextResponse('OK', { status: 200 });
  }
}

