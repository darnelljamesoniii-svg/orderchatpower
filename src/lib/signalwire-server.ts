import 'server-only';
import { RestClient } from '@signalwire/compatibility-api';

function must(name: string, val?: string) {
  const v = (val ?? '').trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function normalizeE164(raw: string): string {
  let s = (raw ?? '').trim();
  s = s.replace(/[^\d+]+/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;

  if (!s.startsWith('+')) {
    const digits = s.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (digits.length >= 11) return `+${digits}`;
    return s;
  }

  const digits = s.slice(1).replace(/\D/g, '');
  return `+${digits}`;
}

export function getSwClient() {
  const project = must('SIGNALWIRE_PROJECT_ID', process.env.SIGNALWIRE_PROJECT_ID);
  const token = must(
    'SIGNALWIRE_API_TOKEN|SIGNALWIRE_REST_API_TOKEN',
    process.env.SIGNALWIRE_API_TOKEN ?? process.env.SIGNALWIRE_REST_API_TOKEN,
  );
  const spaceUrl = must('SIGNALWIRE_SPACE_URL', process.env.SIGNALWIRE_SPACE_URL)
    .replace(/^https:\/\/https\/\//, 'https://')
    .replace(/^https:\/\/https:\/\//, 'https://');

  return new RestClient(project, token, { signalwireSpaceUrl: spaceUrl });
}

export function getSignalWireAuthToken(): string {
  return must(
    'SIGNALWIRE_AUTH_TOKEN|SIGNALWIRE_API_TOKEN|SIGNALWIRE_REST_API_TOKEN',
    process.env.SIGNALWIRE_AUTH_TOKEN ??
      process.env.SIGNALWIRE_API_TOKEN ??
      process.env.SIGNALWIRE_REST_API_TOKEN,
  );
}

export function getOptionalSignalWireAuthToken(): string {
  return (
    process.env.SIGNALWIRE_AUTH_TOKEN ??
    process.env.SIGNALWIRE_API_TOKEN ??
    process.env.SIGNALWIRE_REST_API_TOKEN ??
    ''
  ).trim();
}

export function getFromNumber(): string {
  const raw = must('SIGNALWIRE_PHONE_NUMBER', process.env.SIGNALWIRE_PHONE_NUMBER);
  const from = normalizeE164(raw);
  if (!from.startsWith('+')) {
    throw new Error('SIGNALWIRE_PHONE_NUMBER must be E.164 like +19125567581');
  }
  return from;
}

export function getPublicBaseUrlOrThrow(explicitBaseUrl?: string): string {
  const raw = (explicitBaseUrl ?? process.env.PUBLIC_BASE_URL ?? '').trim();
  if (!raw) {
    throw new Error('Missing env: PUBLIC_BASE_URL');
  }
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

export function buildOutboundLaML(toNumber: string, statusCallbackUrl: string): string {
  const to = normalizeE164((toNumber ?? '').toString().trim());
  const status = (statusCallbackUrl ?? '').toString().trim();

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${getFromNumber()}" timeout="30" action="${status}" method="POST">
    <Number statusCallback="${status}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed">${to}</Number>
  </Dial>
</Response>`;
}

export async function generateAccessToken(_agentId: string): Promise<string> {
  throw new Error('SignalWire browser SDK token generation is disabled until softphone integration is re-enabled.');
}
