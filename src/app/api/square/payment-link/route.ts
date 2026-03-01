import { NextRequest, NextResponse } from 'next/server';
import { createSquarePaymentLink } from '@/lib/square';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amountCents, description, referenceId, buyerName } = body;

    if (!amountCents || !description || !referenceId) {
      return NextResponse.json({ error: 'amountCents, description, referenceId required' }, { status: 400 });
    }

    const result = await createSquarePaymentLink({ amountCents, description, referenceId, buyerName });
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[/api/square/payment-link]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Square error' }, { status: 500 });
  }
}
