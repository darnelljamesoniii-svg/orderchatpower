import { NextRequest, NextResponse } from 'next/server';
import { calcTierPricing } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pricing
 * Body: { competitorCounts: { tier1, tier2, tier3 }, avgTicket }
 */
export async function POST(req: NextRequest) {
  try {
    const { competitorCounts, avgTicket } = await req.json();

    if (!competitorCounts || !avgTicket) {
      return NextResponse.json({ error: 'competitorCounts and avgTicket required' }, { status: 400 });
    }

    const pricings = calcTierPricing(competitorCounts, avgTicket);
    return NextResponse.json({ pricings });
  } catch (err: unknown) {
    console.error('[/api/pricing]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
