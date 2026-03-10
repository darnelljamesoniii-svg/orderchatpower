function normalizeSquareBaseUrl(raw?: string): string {
  const fallback = 'https://connect.squareup.com';
  const base = (raw || fallback).trim().replace(/\/+$/, '');
  // Accept either base URL or /v2 URL from env.
  return base.endsWith('/v2') ? base.slice(0, -3) : base;
}

const SQUARE_BASE_URL = normalizeSquareBaseUrl(process.env.SQUARE_BASE_URL);
const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN!;
const SQUARE_LOCATION = process.env.SQUARE_LOCATION_ID!;
const SQUARE_VERSION = '2024-07-17';

export interface CreatePaymentLinkParams {
  amountCents: number;
  description: string;
  referenceId: string; // lead ID
  buyerName?: string;
  redirectUrl?: string;
}

export interface PaymentLinkResult {
  url: string;
  orderId: string;
}

interface SquareLocation {
  id: string;
  status?: string;
}

interface SquareErrorResponse {
  errors?: Array<{ code?: string; category?: string; detail?: string }>;
}

function parseSquareError(value: unknown): SquareErrorResponse {
  if (!value || typeof value !== 'object') return {};
  return value as SquareErrorResponse;
}

async function listSquareLocations(): Promise<SquareLocation[]> {
  const res = await fetch(`${SQUARE_BASE_URL}/v2/locations`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${SQUARE_TOKEN}`,
      'Square-Version': SQUARE_VERSION,
    },
  });

  if (!res.ok) return [];
  const data = await res.json();
  return (data.locations ?? []) as SquareLocation[];
}

function isNotFoundLocationError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('NOT_FOUND') && err.message.includes('INVALID_REQUEST_ERROR');
  }
  const parsed = parseSquareError(err);
  return (parsed.errors ?? []).some(
    (x) => x.code === 'NOT_FOUND' && x.category === 'INVALID_REQUEST_ERROR',
  );
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
          name: params.description,
          quantity: '1',
          base_price_money: {
            amount: params.amountCents,
            currency: 'USD',
          },
        },
      ],
    },
    checkout_options: {
      allow_tipping: false,
      redirect_url: redirectUrl,
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
      Authorization: `Bearer ${SQUARE_TOKEN}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_VERSION,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Square payment-link error (${res.status}): ${JSON.stringify(data?.errors ?? data)}`);
  }

  return {
    url: data.payment_link.url,
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
  } catch (err: unknown) {
    const errText = err instanceof Error ? err.message : JSON.stringify(err);

    if (!isNotFoundLocationError(err)) {
      throw new Error(`Square API error: ${errText}`);
    }

    const locations = await listSquareLocations();
    const active = locations.find((l) => (l.status ?? '').toUpperCase() === 'ACTIVE') ?? locations[0];

    if (!active?.id || active.id === preferredLocationId) {
      throw new Error(`Square location invalid (${preferredLocationId}). Unable to recover automatically. Error: ${errText}`);
    }

    try {
      return await createWithLocation(active.id, params);
    } catch (retryErr: unknown) {
      const retryText = retryErr instanceof Error ? retryErr.message : JSON.stringify(retryErr);
      throw new Error(`Square retry with fallback location (${active.id}) failed: ${retryText}`);
    }
  }
}
