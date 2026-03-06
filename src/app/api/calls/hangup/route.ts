import { NextResponse } from 'next/server';
import { getSwClient } from '@/lib/signalwire-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const callSid = (body?.callSid ?? '').toString().trim();

    if (!callSid) {
      return NextResponse.json({ ok: false, error: 'callSid is required' }, { status: 400 });
    }

    await getSwClient().calls(callSid).update({ status: 'completed' } as any);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/calls/hangup]', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'Failed to hang up call' }, { status: 500 });
  }
}
