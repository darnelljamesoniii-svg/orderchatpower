import crypto from 'crypto';

export function validateSignalWireSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
  authToken?: string,
): boolean {
  if (!signature) return false;

  const token = (authToken ?? process.env.SIGNALWIRE_AUTH_TOKEN ?? '').trim();
  if (!token) return false;

  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = crypto
    .createHmac('sha1', token)
    .update(payload)
    .digest('base64');

  return signature === expected;
}
