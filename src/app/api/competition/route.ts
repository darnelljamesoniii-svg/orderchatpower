import { NextRequest, NextResponse } from 'next/server';
import { getPlaceDetails, getNearbyCompetitors, walkMinutesToMetres, milesToMetres } from '@/lib/google-places';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = process.env.GOOGLE_PLACES_API_KEY!;

async function resolveToPlaceId(kgmid: string): Promise<string> {
  // If it's already a ChIJ... place ID, return as-is
  if (kgmid.startsWith('ChIJ')) return kgmid;

  // Otherwise do a Find Place search using the kgmid as input
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(kgmid)}&inputtype=textquery&fields=place_id&key=${KEY}`;
  const res  = await fetch(url);
  const data = await res.json();

  if (data.candidates?.[0]?.place_id) return data.candidates[0].place_id;
  throw new Error(`Could not resolve place ID for: ${kgmid}`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawId = searchParams.get('place_id');

  if (!rawId) {
    return NextResponse.json({ error: 'Missing place_id' }, { status: 400 });
  }

  try {
    const placeId  = await resolveToPlaceId(rawId);
    const business = await getPlaceDetails(placeId);

    // Fetch competitors for all 3 tiers
    const [tier1, tier2, tier3] = await Promise.all([
      getNearbyCompetitors(business.location, walkMinutesToMetres(5),  business.category, placeId),
      getNearbyCompetitors(business.location, walkMinutesToMetres(10), business.category, placeId),
      getNearbyCompetitors(business.location, milesToMetres(3),        business.category, placeId),
    ]);

    const counts = { tier1: tier1.length, tier2: tier2.length, tier3: tier3.length };

    // Pick the closest competitor for the sting animation
    const stingCompetitor = tier1[0] ?? tier2[0] ?? null;
    const stingMessage = stingCompetitor
      ? `Right now, when someone nearby searches for a ${business.category}, ${stingCompetitor.name} is getting recommended instead of you.`
      : null;

    return NextResponse.json({
      business,
      competitors: { tier1, tier2, tier3 },
      counts,
      stingCompetitor,
      stingMessage,
    });
  } catch (err: any) {
    console.error('[/api/competition]', err);
    return NextResponse.json({ error: err.message ?? 'Failed' }, { status: 500 });
  }
}
