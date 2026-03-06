import crypto from 'crypto';

export function validateSignalWireSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>
): boolean {
  if (!signature) return false;

  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = crypto
    .createHmac('sha1', process.env.SIGNALWIRE_AUTH_TOKEN || '')
    .update(payload)
    .digest('base64');

  return signature === expected;
}
