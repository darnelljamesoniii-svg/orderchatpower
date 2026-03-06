import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import {
  getSwClient,
  buildOutboundLaML,
  getFromNumber,
  normalizeE164,
  getPublicBaseUrlOrThrow,
  getSignalWireAuthToken,
} from '@/lib/signalwire-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { leadId, agentId } = body as { leadId?: string; agentId?: string };

    if (!leadId || !agentId) {
      return NextResponse.json({ ok: false, error: 'Missing leadId/agentId' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const leadSnap = await adminDb.collection(COLLECTIONS.LEADS).doc(leadId).get();
    if (!leadSnap.exists) return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });

    const lead = leadSnap.data() as any;
    const toNumber = normalizeE164((lead?.phone ?? '').toString().trim());
    if (!toNumber || !toNumber.startsWith('+')) {
      return NextResponse.json({ ok: false, error: 'Lead missing/invalid phone' }, { status: 400 });
    }

    const baseUrl = getPublicBaseUrlOrThrow();
    getSignalWireAuthToken();
    const fromNumber = getFromNumber();
    const statusUrl = `${baseUrl}/api/signalwire/status`;

    const call = await getSwClient().calls.create({
      to: toNumber,
      from: fromNumber,
      twiml: buildOutboundLaML(toNumber, statusUrl),
      statusCallback: statusUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    } as any);

    return NextResponse.json({ ok: true, callSid: (call as any)?.sid ?? null });
  } catch (err: any) {
    console.error('[/api/leads/call]', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'Call create failed' }, { status: 500 });
  }
}
