import { NextRequest, NextResponse } from 'next/server';
import { getPlaceDetails, getNearbyCompetitors, walkMinutesToMetres, milesToMetres } from '@/lib/google-places';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = process.env.GOOGLE_PLACES_API_KEY!;

async function resolveToPlaceId(kgmid: string, businessName?: string, address?: string): Promise<string> {
  if (kgmid.startsWith('ChIJ')) return kgmid;

  // Use whatever we have — name+address, just name, or just the kgmid itself
  const query = [businessName, address].filter(Boolean).join(' ') || kgmid;

  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${KEY}`;
  const res  = await fetch(url);
  const data = await res.json();

  if (data.candidates?.[0]?.place_id) return data.candidates[0].place_id;
  throw new Error(`Could not resolve place ID for: ${query}`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawId        = searchParams.get('place_id');
  const businessName = searchParams.get('name')    ?? undefined;
  const address      = searchParams.get('address') ?? undefined;

  if (!rawId) {
    return NextResponse.json({ error: 'Missing place_id' }, { status: 400 });
  }

  try {
    const placeId  = await resolveToPlaceId(rawId, businessName, address);
    const business = await getPlaceDetails(placeId);

    const [tier1, tier2, tier3] = await Promise.all([
      getNearbyCompetitors(business.location, walkMinutesToMetres(5),  business.category, placeId),
      getNearbyCompetitors(business.location, walkMinutesToMetres(10), business.category, placeId),
      getNearbyCompetitors(business.location, milesToMetres(3),        business.category, placeId),
    ]);

    const counts = { tier1: tier1.length, tier2: tier2.length, tier3: tier3.length };

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
