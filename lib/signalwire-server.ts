// ─── SignalWire Server-Side Library ──────────────────────────────────────────
// SignalWire is Twilio-API-compatible but uses its own SDK and credentials.
// Project ID + API Token replace Twilio's AccountSID + AuthToken.
// Space URL replaces api.twilio.com.

import { RestClient } from '@signalwire/node';

const spaceUrl   = process.env.SIGNALWIRE_SPACE_URL!;    // yourspace.signalwire.com
const projectId  = process.env.SIGNALWIRE_PROJECT_ID!;   // UUID
const apiToken   = process.env.SIGNALWIRE_REST_API_TOKEN!;
const fromNumber = process.env.SIGNALWIRE_PHONE_NUMBER!;

// SignalWire REST client — Twilio-compatible API surface
export const swClient = new RestClient(projectId, apiToken, {
  signalwireSpaceUrl: spaceUrl,
});

// ── Browser Voice Token ───────────────────────────────────────────────────────
/**
 * Generate a SignalWire Access Token for the browser Voice SDK.
 * Uses the same JWT pattern as Twilio — just different imports.
 */
export function generateAccessToken(agentId: string): string {
  const { AccessToken } = RestClient;
  const { VoiceGrant }  = AccessToken;

  const grant = new VoiceGrant({
    // SignalWire uses "pushCredentialSid" pattern similar to Twilio TwiML App SID
    // The resource ID here is your SignalWire LaML Application SID
    outgoingApplicationSid: process.env.SIGNALWIRE_APP_SID ?? '',
    incomingAllow: true,
  });

  const token = new AccessToken(
    projectId,
    process.env.SIGNALWIRE_API_KEY ?? projectId,
    process.env.SIGNALWIRE_API_SECRET ?? apiToken,
    { identity: agentId, ttl: 3600 },
  );

  token.addGrant(grant);
  return token.toJwt();
}

// ── TwiML / LaML ──────────────────────────────────────────────────────────────
/**
 * Build LaML (SignalWire's TwiML-compatible XML) for outbound calls.
 * Syntax is identical to Twilio TwiML.
 */
export function buildOutboundLaML(toNumber: string, statusCallbackUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${fromNumber}" timeout="30" action="${statusCallbackUrl}" method="POST">
    <Number statusCallback="${statusCallbackUrl}" statusCallbackMethod="POST"
      statusCallbackEvent="initiated ringing answered completed">
      ${toNumber}
    </Number>
  </Dial>
</Response>`;
}

// ── SMS ───────────────────────────────────────────────────────────────────────
/**
 * Send the Square payment link via SMS.
 */
export async function sendPaymentSms(
  toNumber:     string,
  paymentUrl:   string,
  businessName: string,
): Promise<void> {
  await swClient.messages.create({
    from: fromNumber,
    to:   toNumber,
    body: `Hi ${businessName}! Here is your secure payment link: ${paymentUrl} — Thank you for choosing AgenticLife!`,
  });
}

// ── Validate SignalWire webhook signature ─────────────────────────────────────
/**
 * SignalWire uses the same HMAC-SHA1 signature validation as Twilio.
 * We replicate it here without importing the full SDK on the edge.
 */
export function validateSignalWireSignature(
  token:     string,
  signature: string,
  url:       string,
  params:    Record<string, string>,
): boolean {
  if (process.env.NODE_ENV !== 'production') return true; // skip in dev

  const crypto = require('crypto');

  // Build the string to sign: URL + sorted params
  const sortedParams = Object.keys(params).sort().reduce((str, key) => str + key + params[key], '');
  const strToSign    = url + sortedParams;
  const hmac         = crypto.createHmac('sha1', token).update(Buffer.from(strToSign)).digest('base64');

  return hmac === signature;
}
