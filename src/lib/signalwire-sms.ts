import 'server-only';
import { RestClient } from '@signalwire/compatibility-api';

function getClient() {
  return new RestClient(
    process.env.SIGNALWIRE_PROJECT_ID!,
    process.env.SIGNALWIRE_AUTH_TOKEN!,
    { signalwireSpaceUrl: process.env.SIGNALWIRE_SPACE_URL! }
  );
}

export async function sendPaymentSms(
  toNumber: string,
  paymentUrl: string,
  businessName: string
): Promise<void> {
  const client = getClient();

  await client.messages.create({
    from: process.env.SIGNALWIRE_FROM_NUMBER!,
    to: toNumber,
    body: `${businessName}: ${paymentUrl}`
  });
}
