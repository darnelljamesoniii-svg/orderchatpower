import { NextRequest, NextResponse } from 'next/server';
import { buildOutboundLaML, validateSignalWireSignature } from '@/lib/signalwire-server';

export const dynamic = 'force-dynamic';

const appUrl     = process.env.NEXT_PUBLIC_APP_URL!;
const apiToken   = process.env.SIGNALWIRE_REST_API_TOKEN!;

/**
 * SignalWire POSTs here when the browser SDK initiates an outbound call.
 * We return LaML (identical syntax to TwiML) instructing SignalWire how
 * to connect the call.
 *
 * Set this URL in SignalWire Console → Voice API → LaML Webhook:
 *   https://your-domain.com/api/signalwire/webhook
 */
export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('x-signalwire-signature') ?? '';
    const url       = `${appUrl}/api/signalwire/webhook`;
    const formData  = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((val, key) => { params[key] = val.toString(); });

    // Validate the request is genuinely from SignalWire
    const isValid = validateSignalWireSignature(apiToken, signature, url, params);
    if (!isValid) {
      console.warn('[/api/signalwire/webhook] Invalid signature');
      return new NextResponse('Forbidden', { status: 403 });
    }

    const to = params.To;
    if (!to) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination provided.</Say></Response>`,
        { headers: { 'Content-Type': 'application/xml' } },
      );
    }

    const statusUrl = `${appUrl}/api/signalwire/status`;
    const laml      = buildOutboundLaML(to, statusUrl);

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
