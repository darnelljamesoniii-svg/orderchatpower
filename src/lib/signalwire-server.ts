import 'server-only';
import { RestClient } from '@signalwire/compatibility-api';
import 'server-only';

function must(name: string, val?: string) {
  const v = (val ?? '').trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function normalizeE164(raw: string): string {
  let s = (raw ?? '').trim();
  // remove spaces/parens/dashes
  s = s.replace(/[^\d+]/g, '');
  // if it somehow came without +, assume US number (you can adjust)
  if (!s.startsWith('+') && /^\d{10,15}$/.test(s)) s = `+${s}`;
  return s;
}

export function getSwClient() {
  const project = must('SIGNALWIRE_PROJECT_ID', process.env.SIGNALWIRE_PROJECT_ID);
  const token   = must('SIGNALWIRE_API_TOKEN', process.env.SIGNALWIRE_API_TOKEN);

  // IMPORTANT: must be like: https://orderchat.signalwire.com
  const spaceUrl = must('SIGNALWIRE_SPACE_URL', process.env.SIGNALWIRE_SPACE_URL);

  // Guard against the exact bug you hit: "https://https//..."
  const fixedSpaceUrl = spaceUrl
    .replace(/^https:\/\/https\/\//, 'https://')
    .replace(/^https:\/\/https:\/\//, 'https://');

  return new RestClient(project, token, { signalwireSpaceUrl: fixedSpaceUrl });
}

export function getFromNumber(): string {
  const raw = must('SIGNALWIRE_PHONE_NUMBER', process.env.SIGNALWIRE_PHONE_NUMBER);
  const from = normalizeE164(raw);
  if (!from.startsWith('+')) throw new Error('SIGNALWIRE_PHONE_NUMBER must be E.164 like +19125567581');
  return from;
}

export function buildOutboundLaML(toNumber: string, statusCallbackUrl: string): string {
  // Keep it dead simple: Dial the number, send status events back
  const to = (toNumber ?? '').toString().trim();
  const status = (statusCallbackUrl ?? '').toString().trim();

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${getFromNumber()}" timeout="30" action="${status}" method="POST">
    <Number statusCallback="${status}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed">${to}</Number>
  </Dial>
</Response>`;
}
