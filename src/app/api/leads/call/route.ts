import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import { swClient, buildOutboundLaML } from '@/lib/signalwire-server';

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
    const toNumber = (lead?.phone ?? '').toString().trim();
    if (!toNumber) return NextResponse.json({ ok: false, error: 'Lead missing phone' }, { status: 400 });

    const baseUrl = process.env.PUBLIC_BASE_URL?.trim();
    if (!baseUrl) return NextResponse.json({ ok: false, error: 'Missing PUBLIC_BASE_URL' }, { status: 500 });

    const fromNumber = process.env.SIGNALWIRE_PHONE_NUMBER?.trim();
    if (!fromNumber) return NextResponse.json({ ok: false, error: 'Missing SIGNALWIRE_PHONE_NUMBER' }, { status: 500 });

    const statusUrl = `${baseUrl}/api/calls/status`;

    const call = await swClient.calls.create({
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