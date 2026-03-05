import { NextRequest, NextResponse } from 'next/server';
import { getPlaceDetails, getNearbyCompetitors } from '@/lib/google-places';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const placeId = searchParams.get('place_id');

  if (!placeId) {
    return NextResponse.json({ error: 'Missing place_id' }, { status: 400 });
  }

  try {
    const business = await getPlaceDetails(placeId);
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const { competitors, counts, stingCompetitor, stingMessage } = 
      await getNearbyCompetitors(business);

    return NextResponse.json({ business, competitors, counts, stingCompetitor, stingMessage });
  } catch (err: any) {
    console.error('[/api/competition]', err);
    return NextResponse.json({ error: err.message ?? 'Failed' }, { status: 500 });
  }
}
