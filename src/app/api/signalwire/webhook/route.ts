import { NextRequest, NextResponse } from 'next/server';
import { buildOutboundLaML, getOptionalSignalWireAuthToken } from '@/lib/signalwire-server';
import { validateSignalWireSignature } from '@/lib/signalwire-signature';

export const dynamic = 'force-dynamic';

function inferBaseUrl(req: NextRequest) {
  const envBase = (process.env.PUBLIC_BASE_URL ?? '').trim();
  if (envBase) return envBase;

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : '';
}

/**
 * SignalWire POSTs here when the browser SDK initiates an outbound call.
 */
export async function POST(req: NextRequest) {
  try {
    const baseUrl = inferBaseUrl(req);
    const signature = req.headers.get('x-signalwire-signature') ?? req.headers.get('x-twilio-signature') ?? '';
    const url = `${baseUrl}/api/signalwire/webhook`;

    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((val, key) => {
      params[key] = val.toString();
    });

    const authToken = getOptionalSignalWireAuthToken();
    if (authToken) {
      const isValid = validateSignalWireSignature(signature, url, params, authToken);
      if (!isValid) {
        console.warn('[/api/signalwire/webhook] Invalid signature');
        return new NextResponse('Forbidden', { status: 403 });
      }
    } else {
      console.warn('[/api/signalwire/webhook] No auth token configured; skipping signature validation.');
    }

    const to = (params.To ?? '').trim();
    if (!to) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination provided.</Say></Response>`,
        { headers: { 'Content-Type': 'application/xml' } },
      );
    }

    const statusUrl = `${baseUrl}/api/signalwire/status`;
    const laml = buildOutboundLaML(to, statusUrl);

    return new NextResponse(laml, {
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (err: unknown) {
    console.error('[/api/signalwire/webhook]', err);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred.</Say></Response>`,
      { headers: { 'Content-Type': 'application/xml' } },
    );
  }
}

