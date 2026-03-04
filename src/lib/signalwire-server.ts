import { RestClient } from '@signalwire/compatibility-api';

function requireEnv(name: string) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export function getFromNumber() {
  return requireEnv('SIGNALWIRE_PHONE_NUMBER');
}

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

  token.addGrant(grant);
  return token.toJwt();
}

export function buildOutboundLaML(toNumber: string, statusCallbackUrl: string): string {
  const fromNumber = getFromNumber();
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${fromNumber}" timeout="30" action="${statusCallbackUrl}" method="POST"><Number statusCallback="${statusCallbackUrl}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed">${toNumber}</Number></Dial></Response>`;
}

export async function sendPaymentSms(toNumber: string, paymentUrl: string, businessName: string): Promise<void> {
  const swClient = getSwClient();
  const fromNumber = getFromNumber();

  await swClient.messages.create({
    from: fromNumber,
    to:   toNumber,
    body: `Hi ${businessName}! Here is your secure payment link: ${paymentUrl} — Thank you for choosing AgenticLife!`,
  });
}

export function validateSignalWireSignature(token: string, signature: string, url: string, params: Record<string, string>): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const crypto = require('crypto');
  const sortedParams = Object.keys(params).sort().reduce((str, key) => str + key + params[key], '');
  const hmac = crypto.createHmac('sha1', token).update(Buffer.from(url + sortedParams)).digest('base64');
  return hmac === signature;
}
