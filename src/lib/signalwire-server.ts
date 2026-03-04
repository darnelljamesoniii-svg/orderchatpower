<<<<<<< HEAD
=======
// src/lib/signalwire-server.ts
>>>>>>> d030ea9 (Fix SignalWire token + LaML/SMS strings)
import { RestClient } from '@signalwire/compatibility-api';

function requireEnv(name: string) {
  const v = process.env[name]?.trim();
<<<<<<< HEAD
  if (!v) throw new Error(`Missing ${name}`);
=======
  if (!v) throw new Error(`Missing env var: ${name}`);
>>>>>>> d030ea9 (Fix SignalWire token + LaML/SMS strings)
  return v;
}

export function getFromNumber() {
  return requireEnv('SIGNALWIRE_PHONE_NUMBER');
}
<<<<<<< HEAD

export function getSwClient() {
  const spaceUrl  = requireEnv('SIGNALWIRE_SPACE_URL');
  const projectId = requireEnv('SIGNALWIRE_PROJECT_ID');
  const apiToken  = requireEnv('SIGNALWIRE_REST_API_TOKEN');

  return new RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl } as any);
}

export function generateAccessToken(agentId: string): string {
  const projectId = requireEnv('SIGNALWIRE_PROJECT_ID');
  const apiToken  = requireEnv('SIGNALWIRE_REST_API_TOKEN');

  const { jwt } = require('@signalwire/compatibility-api');
  const { AccessToken } = jwt;
  const { VoiceGrant } = AccessToken;

  const grant = new VoiceGrant({
    // Not required for your /calls.create(twiml: ...) flow, so keep it optional
    outgoingApplicationSid: process.env.SIGNALWIRE_APP_SID ?? '',
    incomingAllow: true,
  });

  const token = new AccessToken(
    projectId,
    process.env.SIGNALWIRE_API_KEY ?? projectId,
    process.env.SIGNALWIRE_API_SECRET ?? apiToken,
    { identity: agentId, ttl: 3600 }
  );
=======

export function getSwClient() {
  const spaceUrl = requireEnv('SIGNALWIRE_SPACE_URL').replace(/\/$/, '');
  const projectId = requireEnv('SIGNALWIRE_PROJECT_ID');
  const apiToken = requireEnv('SIGNALWIRE_REST_API_TOKEN');

  return new RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl } as any);
}

/**
 * Creates a Relay JWT for browser/WebRTC calling.
 * Uses Basic Auth: PROJECT_ID : PROJECT_TOKEN (your SIGNALWIRE_REST_API_TOKEN).
 */
export async function generateAccessToken(agentId: string): Promise<string> {
  const spaceUrl = requireEnv('SIGNALWIRE_SPACE_URL').replace(/\/$/, '');
  const projectId = requireEnv('SIGNALWIRE_PROJECT_ID');
  const projectToken = requireEnv('SIGNALWIRE_REST_API_TOKEN'); // Project Token

  const auth = Buffer.from(`${projectId}:${projectToken}`).toString('base64');

  const res = await fetch(`${spaceUrl}/api/relay/rest/jwt`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      resource: agentId,
      expires_in: 60, // minutes
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SignalWire JWT error ${res.status}: ${text}`);
  }
>>>>>>> d030ea9 (Fix SignalWire token + LaML/SMS strings)

  const data = (await res.json()) as { jwt_token?: string };
  if (!data.jwt_token) throw new Error('SignalWire JWT response missing jwt_token');

  return data.jwt_token;
}

export function buildOutboundLaML(toNumber: string, statusCallbackUrl: string): string {
  const fromNumber = getFromNumber();
<<<<<<< HEAD
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${fromNumber}" timeout="30" action="${statusCallbackUrl}" method="POST"><Number statusCallback="${statusCallbackUrl}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed">${toNumber}</Number></Dial></Response>`;
}

export async function sendPaymentSms(toNumber: string, paymentUrl: string, businessName: string): Promise<void> {
=======

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

export async function sendPaymentSms(
  toNumber: string,
  paymentUrl: string,
  businessName: string
): Promise<void> {
>>>>>>> d030ea9 (Fix SignalWire token + LaML/SMS strings)
  const swClient = getSwClient();
  const fromNumber = getFromNumber();

  await swClient.messages.create({
    from: fromNumber,
    to: toNumber,
    body: `Hi! Here is your secure payment link: ${paymentUrl} — Thank you for choosing ${businessName}!`,
  });
}

export function validateSignalWireSignature(
  token: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  if (process.env.NODE_ENV !== 'production') return true;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');

  const sortedParams = Object.keys(params)
    .sort()
    .reduce((str, key) => str + key + params[key], '');

  const hmac = crypto
    .createHmac('sha1', token)
    .update(Buffer.from(url + sortedParams))
    .digest('base64');

  return hmac === signature;
}