import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import { swClient, buildOutboundLaML } from '@/lib/signalwire-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { leadId, agentId } = await req.json();

  if (!leadId || !agentId) {
    return NextResponse.json({ ok: false, error: 'Missing leadId/agentId' }, { status: 400 });
  }

  const leadSnap = await adminDb.collection(COLLECTIONS.LEADS).doc(leadId).get();
  if (!leadSnap.exists) return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });

  const lead = leadSnap.data() as any;
  const toNumber = lead.phone;

  const baseUrl = process.env.PUBLIC_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json({ ok: false, error: 'Missing PUBLIC_BASE_URL env var' }, { status: 500 });
  }

  const statusUrl = `${baseUrl}/api/calls/status`;

  const call = await swClient.calls.create({
    to: toNumber,
    from: process.env.SIGNALWIRE_PHONE_NUMBER!,
    twiml: buildOutboundLaML(toNumber, statusUrl),
    statusCallback: statusUrl,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
  } as any);

  return NextResponse.json({ ok: true, callSid: (call as any)?.sid ?? null });
}
