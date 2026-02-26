import { NextRequest, NextResponse } from 'next/server';
import {
  getPlaceDetails, getNearbyCompetitors,
  walkMinutesToMetres, milesToMetres,
} from '@/lib/google-places';
import { generateStingMessage } from '@/lib/gemini-concierge';
import { TIERS } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

/**
 * GET /api/competition?place_id=ChIJ_abc
 *
 * Returns:
 *  - The business's own details
 *  - Competitors bucketed by tier (tier1 only, tier2 ring, tier3 ring)
 *  - Sting message
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const placeId = searchParams.get('place_id');

    if (!placeId) {
      return NextResponse.json({ error: 'place_id required' }, { status: 400 });
    }

    // Get the business's own details
    const business = await getPlaceDetails(placeId);
    const { location, category } = business;

    // Fetch competitors for all 3 tiers in parallel (walk radii)
    const [t1walk, t2walk, t3walk] = await Promise.all([
      getNearbyCompetitors(location, walkMinutesToMetres(5),  category, placeId),
      getNearbyCompetitors(location, walkMinutesToMetres(10), category, placeId),
      getNearbyCompetitors(location, walkMinutesToMetres(20), category, placeId),
    ]);

    // Deduplicate — each tier ring only contains NEW competitors vs previous tier
    const t1Ids = new Set(t1walk.map(p => p.placeId));
    const t2Ids = new Set(t2walk.map(p => p.placeId));

    const tier1  = t1walk;
    const tier2  = t2walk.filter(p => !t1Ids.has(p.placeId));
    const tier3  = t3walk.filter(p => !t2Ids.has(p.placeId));

    // Pick "sting" competitor — closest open highest-rated in tier1
    const stingCandidate = [...tier1]
      .filter(p => p.openNow !== false)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0]
      ?? tier1[0]
      ?? tier2[0];

    const stingMessage = stingCandidate
      ? await generateStingMessage(business.name, stingCandidate.name, tier1.length)
      : '';

    return NextResponse.json({
      business,
      stingCompetitor: stingCandidate ?? null,
      stingMessage,
      competitors: { tier1, tier2, tier3 },
      counts: {
        tier1: tier1.length,
        tier2: tier1.length + tier2.length,
        tier3: tier1.length + tier2.length + tier3.length,
      },
    });
  } catch (err: unknown) {
    console.error('[/api/competition]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
