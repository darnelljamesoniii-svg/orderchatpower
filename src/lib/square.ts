const SQUARE_BASE_URL  = process.env.SQUARE_BASE_URL  || 'https://connect.squareup.com';
const SQUARE_TOKEN     = process.env.SQUARE_ACCESS_TOKEN!;
const SQUARE_LOCATION  = process.env.SQUARE_LOCATION_ID!;

export interface CreatePaymentLinkParams {
  amountCents:  number;
  description:  string;
  referenceId:  string; // lead ID
  buyerName?:   string;
}

export interface PaymentLinkResult {
  url:     string;
  orderId: string;
}

/**
 * Create a Square checkout / payment link and return the URL.
 */
export async function createSquarePaymentLink(params: CreatePaymentLinkParams): Promise<PaymentLinkResult> {
  const body = {
    idempotency_key: `${params.referenceId}-${Date.now()}`,
    order: {
      location_id: SQUARE_LOCATION,
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
      redirect_url:      `${process.env.NEXT_PUBLIC_APP_URL}/sales/success`,
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
      'Square-Version': '2024-07-17',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Square API error: ${JSON.stringify(err.errors)}`);
  }

  const data = await res.json();
  return {
    url:     data.payment_link.url,
    orderId: data.payment_link.order_id,
  };
}
