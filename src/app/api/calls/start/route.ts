import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import { getSwClient, buildOutboundLaML } from '@/lib/signalwire-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function inferBaseUrl(req: Request) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : '';
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { leadId, agentId } = body as { leadId?: string; agentId?: string };

    if (!leadId || !agentId) {
      return NextResponse.json({ ok: false, error: 'Missing leadId/agentId' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { ok: false, error: 'Firebase Admin not initialized (check env vars)' },
        { status: 500 }
      );
    }

    const leadSnap = await adminDb.collection(COLLECTIONS.LEADS).doc(leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });
    }

    const lead = leadSnap.data() as any;
    const toNumber = (lead?.phone ?? '').toString().trim();
    if (!toNumber) {
      return NextResponse.json({ ok: false, error: 'Lead missing phone' }, { status: 400 });
    }

    const baseUrlEnv = process.env.PUBLIC_BASE_URL?.trim();
    const baseUrl = baseUrlEnv || inferBaseUrl(req);
    if (!baseUrl) {
      return NextResponse.json({ ok: false, error: 'Unable to determine base URL' }, { status: 500 });
    }

    const fromNumber = process.env.SIGNALWIRE_PHONE_NUMBER?.trim();
    if (!fromNumber) {
      return NextResponse.json({ ok: false, error: 'Missing SIGNALWIRE_PHONE_NUMBER' }, { status: 500 });
    }

    const statusUrl = `${baseUrl}/api/calls/status`;

    // IMPORTANT: buildOutboundLaML should return a valid XML string.
    // If it already includes <Number> etc, don't pass "toNumber" unless it needs it.
    const twiml = buildOutboundLaML(toNumber, statusUrl);

    const sw = getSwClient();

    const call = await sw.calls.create({
      to: toNumber,
      from: fromNumber,
      twiml,
      statusCallback: statusUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    } as any);

    return NextResponse.json({ ok: true, callSid: (call as any)?.sid ?? null });
  } catch (err: any) {
    console.error('[/api/calls/start] Call create failed:', {
      message: err?.message,
      code: err?.code,
      status: err?.status,
      more: err,
    });
    return NextResponse.json({ ok: false, error: err?.message ?? 'Call create failed' }, { status: 500 });
  }
}
