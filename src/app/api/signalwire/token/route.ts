export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

/**
 * POST /api/signalwire/token
 * Body: { agentId?: string }
 * Returns: { ok, project, token }
 *
 * NOTE: This uses project token directly for internal softphone testing.
 */
export async function POST(_req: Request) {
  try {
    const project = (process.env.SIGNALWIRE_PROJECT_ID ?? '').trim();
    const token = (
      process.env.SIGNALWIRE_API_TOKEN ??
      process.env.SIGNALWIRE_REST_API_TOKEN ??
      ''
    ).trim();

    if (!project || !token) {
      return NextResponse.json(
        { ok: false, error: 'Missing SIGNALWIRE_PROJECT_ID or SIGNALWIRE_API_TOKEN' },
        { status: 500 }
      );
    }

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
    { ok: true, message: 'Use POST to retrieve browser calling credentials.' },
    { status: 200 }
  );
}
