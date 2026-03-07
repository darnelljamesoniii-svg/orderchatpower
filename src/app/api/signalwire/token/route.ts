export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

function normalizeSpaceUrl(raw: string): string {
  const value = (raw ?? '').trim();
  if (!value) return '';

  // Accept either host or full URL and normalize to https://<host>
  const noProto = value.replace(/^https?:\/\//i, '');
  const host = noProto.replace(/\/+$/, '');
  return `https://${host}`;
}

function unixIn(secondsFromNow: number): number {
  return Math.floor(Date.now() / 1000) + secondsFromNow;
}

/**
 * POST /api/signalwire/token
 * Returns a short-lived SAT for browser softphone.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const rawAgentId = (body?.agentId ?? '').toString().trim();
    const agentId = rawAgentId || 'agent';

    const project = (process.env.SIGNALWIRE_PROJECT_ID ?? '').trim();
    const apiToken = (
      process.env.SIGNALWIRE_API_TOKEN ??
      process.env.SIGNALWIRE_REST_API_TOKEN ??
      ''
    ).trim();
    const spaceBase = normalizeSpaceUrl(process.env.SIGNALWIRE_SPACE_URL ?? '');

    if (!project || !apiToken || !spaceBase) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Missing SIGNALWIRE_PROJECT_ID, SIGNALWIRE_API_TOKEN, or SIGNALWIRE_SPACE_URL',
        },
        { status: 500 }
      );
    }

    const basic = Buffer.from(`${project}:${apiToken}`).toString('base64');

    const satRes = await fetch(`${spaceBase}/api/fabric/subscribers/tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference: `agent:${agentId}`,
        expire_at: unixIn(60 * 60),
      }),
      cache: 'no-store',
    });

    const satBody: any = await satRes.json().catch(() => ({}));

    if (!satRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: satBody?.message || satBody?.error || 'Failed to create subscriber token',
          details: satBody,
        },
        { status: 500 }
      );
    }

    const token =
      satBody?.token ??
      satBody?.subscriber_token ??
      satBody?.access_token ??
      satBody?.data?.token ??
      '';

      if (!token || typeof token !== 'string') {
      return NextResponse.json(
        {
          ok: false,
          error: 'SignalWire did not return a usable SAT token',
          details: satBody,
        },
        { status: 500 }
      );
    }

    if (!token.includes('.')) {
  return NextResponse.json(
    {
      ok: false,
      error: 'Non-JWT token returned (expected SAT)',
      details: satBody,
      returnedTokenPrefix: token.slice(0, 6),
    },
    { status: 500 }
  );
}
// For SAT/JWT, project is optional client-side but safe to include.
    return NextResponse.json({ ok: true, project, token }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Token generation failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: true, message: 'Use POST with { agentId } to retrieve browser calling token.' },
    { status: 200 }
  );
}
