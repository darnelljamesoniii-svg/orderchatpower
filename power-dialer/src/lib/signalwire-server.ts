// src/lib/signalwire-server.ts
// SignalWire (Twilio-compatible) server helpers WITHOUT the @signalwire/node SDK.
// Uses REST endpoints directly to avoid npm/ETARGET issues.

import 'server-only';

const SPACE_URL   = process.env.SIGNALWIRE_SPACE_URL || process.env.SIGNALWIRE_SPACE; // e.g. "yourspace.signalwire.com"
const PROJECT_ID  = process.env.SIGNALWIRE_PROJECT_ID || process.env.SIGNALWIRE_PROJECT;
const API_TOKEN   = process.env.SIGNALWIRE_REST_API_TOKEN || process.env.SIGNALWIRE_TOKEN;
const FROM_NUMBER = process.env.SIGNALWIRE_PHONE_NUMBER || process.env.SIGNALWIRE_FROM;

// For client (browser) access tokens (separate from REST token):
const API_KEY     = process.env.SIGNALWIRE_API_KEY;     // optional if using token generation
const API_SECRET  = process.env.SIGNALWIRE_API_SECRET;  // optional if using token generation
const APP_SID     = process.env.SIGNALWIRE_APP_SID;     // LaML App SID for VoiceGrant

function assertEnv(keys: string[]) {
  const missing = keys.filter((k) => !process.env[k] && !altProvided(k));
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(', ')}`);
}

function altProvided(key: string) {
  // Allow flexible naming so you don't have to rename everything today.
  if (key === 'SIGNALWIRE_SPACE_URL') return !!SPACE_URL;
  if (key === 'SIGNALWIRE_PROJECT_ID') return !!PROJECT_ID;
  if (key === 'SIGNALWIRE_REST_API_TOKEN') return !!API_TOKEN;
  if (key === 'SIGNALWIRE_PHONE_NUMBER') return !!FROM_NUMBER;
  return false;
}

function basicAuthHeader() {
  // SignalWire LaML REST uses ProjectID as username, API Token as password
  const raw = `${PROJECT_ID}:${API_TOKEN}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

function normalizeSpace(space: string) {
  // Accept "https://x.signalwire.com" or "x.signalwire.com"
  return space.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

// ── Browser Voice Token (JWT) ────────────────────────────────────────────────
// This endpoint is Twilio-compatible: /AccessTokens.json
export async function generateAccessToken(agentId: string): Promise<string> {
  // Requires API_KEY + API_SECRET + APP_SID in addition to PROJECT_ID
  if (!API_KEY || !API_SECRET || !APP_SID) {
    throw new Error('Missing env vars for access token: SIGNALWIRE_API_KEY, SIGNALWIRE_API_SECRET, SIGNALWIRE_APP_SID');
  }
  if (!SPACE_URL || !PROJECT_ID) {
    throw new Error('Missing env vars: SIGNALWIRE_SPACE_URL (or SIGNALWIRE_SPACE), SIGNALWIRE_PROJECT_ID (or SIGNALWIRE_PROJECT)');
  }

  const space = normalizeSpace(SPACE_URL);
  const endpoint = `https://${space}/api/laml/2010-04-01/Accounts/${PROJECT_ID}/AccessTokens.json`;

  const form = new URLSearchParams();
  form.set('Identity', agentId);

  // Twilio-compatible VoiceGrant fields:
  form.set('VoiceGrant.outgoing.application_sid', APP_SID);
  form.set('VoiceGrant.incoming_allow', 'true');

  // The AccessTokens endpoint uses API Key/Secret basic auth (not Project+Token)
  const auth = `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`SignalWire AccessToken failed (${res.status}): ${txt}`);
  }

  const json = await res.json();
  // Twilio response typically returns { token: "..." }
  const token = json?.token;
  if (!token) throw new Error('SignalWire AccessToken response missing token');
  return token as string;
}

// ── LaML (SignalWire TwiML-compatible XML) ───────────────────────────────────
export function buildOutboundLaML(toNumber: string, statusCallbackUrl: string): string {
  if (!FROM_NUMBER) throw new Error('Missing env var: SIGNALWIRE_PHONE_NUMBER (or SIGNALWIRE_FROM)');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${FROM_NUMBER}" timeout="30" action="${statusCallbackUrl}" method="POST">
    <Number statusCallback="${statusCallbackUrl}" statusCallbackMethod="POST"
      statusCallbackEvent="initiated ringing answered completed">
      ${toNumber}
    </Number>
  </Dial>
</Response>`;
}

// ── SMS ─────────────────────────────────────────────────────────────────────
export async function sendPaymentSms(toNumber: string, paymentUrl: string, businessName: string): Promise<void> {
  assertEnv(['SIGNALWIRE_SPACE_URL', 'SIGNALWIRE_PROJECT_ID', 'SIGNALWIRE_REST_API_TOKEN', 'SIGNALWIRE_PHONE_NUMBER']);

  const space = normalizeSpace(SPACE_URL!);
  const endpoint = `https://${space}/api/laml/2010-04-01/Accounts/${PROJECT_ID}/Messages.json`;

  const form = new URLSearchParams();
  form.set('From', FROM_NUMBER!);
  form.set('To', toNumber);
  form.set(
    'Body',
    `Hi ${businessName}! Here is your secure payment link: ${paymentUrl} — Thank you for choosing AgenticLife!`,
  );

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`SignalWire SMS failed (${res.status}): ${txt}`);
  }
}

// ── Validate SignalWire webhook signature ────────────────────────────────────
export function validateSignalWireSignature(
  token: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  if (process.env.NODE_ENV !== 'production') return true;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');

  const sortedParams = Object.keys(params)
    .sort()
    .reduce((str, key) => str + key + params[key], '');

  const strToSign = url + sortedParams;
  const hmac = crypto.createHmac('sha1', token).update(Buffer.from(strToSign)).digest('base64');
  return hmac === signature;
}
