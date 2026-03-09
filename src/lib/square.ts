const SQUARE_BASE_URL  = process.env.SQUARE_BASE_URL  || 'https://connect.squareup.com';
const SQUARE_TOKEN     = process.env.SQUARE_ACCESS_TOKEN!;
const SQUARE_LOCATION  = process.env.SQUARE_LOCATION_ID!;
const SQUARE_VERSION   = '2024-07-17';

export interface CreatePaymentLinkParams {
  amountCents:  number;
  description:  string;
  referenceId:  string; // lead ID
  buyerName?:   string;
  redirectUrl?: string;
}

export interface PaymentLinkResult {
  url:     string;
  orderId: string;
}

interface SquareLocation {
  id: string;
  status?: string;
}

async function listSquareLocations(): Promise<SquareLocation[]> {
  const res = await fetch(`${SQUARE_BASE_URL}/v2/locations`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${SQUARE_TOKEN}`,
      'Square-Version': SQUARE_VERSION,
    },
  });

  if (!res.ok) return [];
  const data = await res.json();
  return (data.locations ?? []) as SquareLocation[];
}

function isNotFoundLocationError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { errors?: Array<{ code?: string; category?: string }> };
  return (e.errors ?? []).some((x) => x.code === 'NOT_FOUND' && x.category === 'INVALID_REQUEST_ERROR');
}

async function createWithLocation(locationId: string, params: CreatePaymentLinkParams): Promise<PaymentLinkResult> {
  const redirectUrl = params.redirectUrl || `${process.env.NEXT_PUBLIC_APP_URL}/sales/success`;

  const body = {
    idempotency_key: `${params.referenceId}-${Date.now()}`,
    order: {
      location_id: locationId,
      reference_id: params.referenceId,
      line_items: [
        {
          name:     params.description,
          quantity: '1',
          base_price_money: {
            amount:   params.amountCents,
            currency: 'USD',
          },
        },
      ],
    },
    checkout_options: {
      allow_tipping:     false,
      redirect_url:      redirectUrl,
      merchant_support_email: 'support@agenticlife.com',
      accepted_payment_methods: {
        card: true,
        apple_pay: true,
        google_pay: true,
        cash_app_pay: true,
        afterpay_clearpay: true,
      },
    },
  };

  const res = await fetch(`${SQUARE_BASE_URL}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SQUARE_TOKEN}`,
      'Content-Type':  'application/json',
      'Square-Version': SQUARE_VERSION,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw data;
  }

  return {
    url:     data.payment_link.url,
    orderId: data.payment_link.order_id,
  };
}

/**
 * Create a Square checkout / payment link and return the URL.
 */
export async function createSquarePaymentLink(params: CreatePaymentLinkParams): Promise<PaymentLinkResult> {
  const preferredLocationId = SQUARE_LOCATION;

  try {
    return await createWithLocation(preferredLocationId, params);
  } catch (err) {
    if (!isNotFoundLocationError(err)) {
      throw new Error(`Square API error: ${JSON.stringify((err as { errors?: unknown }).errors ?? err)}`);
    }

    const locations = await listSquareLocations();
    const active = locations.find((l) => (l.status ?? '').toUpperCase() === 'ACTIVE') ?? locations[0];

    if (!active?.id || active.id === preferredLocationId) {
      throw new Error(
        `Square location invalid (${preferredLocationId}). Unable to recover automatically. Error: ${JSON.stringify((err as { errors?: unknown }).errors ?? err)}`,
      );
    }

    return await createWithLocation(active.id, params);
  }
}
