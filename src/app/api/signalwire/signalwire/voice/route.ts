import { NextRequest } from 'next/server';
import { getFromNumber } from '@/lib/signalwire-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function inferBaseUrl(req: NextRequest) {
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : '';
}

/**
 * SignalWire LaML App webhook for browser (WebRTC) outbound calls.
 * The browser sends params like { To: "+1407..." } via device.connect({ params }).
 */
export async function POST(req: NextRequest) {
  const baseUrl = (process.env.PUBLIC_BASE_URL ?? '').trim() || inferBaseUrl(req);
  const statusUrl = `${baseUrl}/api/calls/status`;

  const contentType = req.headers.get('content-type') ?? '';
  let to = '';

  // SignalWire sends form-encoded most of the time
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    to = (params.get('To') ?? '').trim();
  } else {
    // fallback: JSON
    const body = await req.json().catch(() => ({} as any));
    to = (body?.To ?? body?.to ?? '').toString().trim();
  }

  if (!to) {
    return new Response('Missing To', { status: 400 });
  }

  const from = getFromNumber();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${from}" timeout="30" action="${statusUrl}" method="POST">
    <Number statusCallback="${statusUrl}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed">${to}</Number>
  </Dial>
</Response>`;

  return new Response(xml, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}
