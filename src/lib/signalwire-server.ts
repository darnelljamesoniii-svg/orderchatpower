import { RestClient } from '@signalwire/compatibility-api';

let _client: RestClient | null = null;

function normalizeSpaceHost(raw: string): string {
  // Accepts:
  // - "https://orderchat.signalwire.com"
  // - "orderchat.signalwire.com"
  // and returns:
  // - "orderchat.signalwire.com"
  let s = (raw ?? '').trim();
  s = s.replace(/^https?:\/\//i, '');
  s = s.replace(/^\/+/, '');
  s = s.replace(/\/+$/, '');
  return s;
}

function requiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export function getSwClient(): RestClient {
  if (_client) return _client;

  const projectId = requiredEnv('SIGNALWIRE_PROJECT_ID');
  const token     = requiredEnv('SIGNALWIRE_API_TOKEN');

  // Your value can be "https://orderchat.signalwire.com" (you said it is)
  const spaceRaw  =
    process.env.SIGNALWIRE_SPACE_URL?.trim() ||
    process.env.SIGNALWIRE_SPACE?.trim() ||
    '';

  const signalwireSpaceUrl = normalizeSpaceHost(spaceRaw);
  if (!signalwireSpaceUrl) throw new Error('Missing SIGNALWIRE_SPACE_URL (e.g. https://orderchat.signalwire.com)');

  _client = new RestClient(projectId, token, { signalwireSpaceUrl });
  return _client;
}

export function getFromNumber(): string {
  // E.164 preferred: +1xxxxxxxxxx
  return requiredEnv('SIGNALWIRE_PHONE_NUMBER');
}

export function buildOutboundLaML(toNumber: string, statusCallbackUrl: string): string {
  const fromNumber = getFromNumber();

  // SignalWire "Compatibility API" accepts TwiML.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${fromNumber}" timeout="30" action="${statusCallbackUrl}" method="POST">
    <Number
      statusCallback="${statusCallbackUrl}"
      statusCallbackMethod="POST"
      statusCallbackEvent="initiated ringing answered completed"
    >${toNumber}</Number>
  </Dial>
</Response>`;
}
